<?php

namespace App\Services;

use App\DataTransferObjects\DrawOutcome;
use App\Enums\DrawResult;
use App\Enums\ParticipantStatus;
use App\Enums\RaffleStatus;
use App\Exceptions\DrawException;
use App\Models\DrawEvent;
use App\Models\Participant;
use App\Models\Raffle;
use App\Models\RafflePrize;
use App\Models\ReservedPick;
use App\Models\User;
use App\Models\Winner;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Owns the winner-selection business logic.
 *
 * The winning ticket is chosen here, on the server, using a cryptographically
 * secure random source. Nothing supplied by the client can influence the result.
 */
class RaffleDrawService
{
    /**
     * Perform a single draw for the raffle and persist the winner plus an audit event.
     *
     * The whole operation runs in a transaction with a row-level lock on the raffle,
     * so two simultaneous draw requests are serialised rather than racing.
     */
    public function draw(Raffle $raffle, ?User $user = null, ?string $requestId = null, ?string $ipAddress = null): DrawOutcome
    {
        try {
            return DB::transaction(function () use ($raffle, $user, $requestId, $ipAddress) {
                /** @var Raffle $locked */
                $locked = Raffle::query()
                    ->whereKey($raffle->getKey())
                    ->lockForUpdate()
                    ->firstOrFail();

                $this->assertDrawable($locked);

                $alreadyDrawn = Winner::query()->where('raffle_id', $locked->id)->count();

                if ($alreadyDrawn >= $locked->winners_count) {
                    throw DrawException::allWinnersDrawn();
                }

                // Winners chosen before the event are revealed in their order.
                if ($locked->hasStagedWinners()) {
                    return $this->revealStaged($locked, $alreadyDrawn + 1, $user, $requestId, $ipAddress);
                }

                // The reserved pick, armed for this raffle: the draw for
                // their slot lands on them, and the pick disarms itself.
                $reserved = ReservedPick::current();

                if ($reserved->isArmedFor($locked) && $reserved->takesPosition($alreadyDrawn + 1)) {
                    return $this->revealReserved($locked, $reserved, $alreadyDrawn + 1, $user, $requestId, $ipAddress);
                }

                // With prize tiers, the winner is drawn for the first tier
                // with a place left, under that tier's own rules.
                $hasTiers = $locked->prizes()->exists();
                $prize = $hasTiers ? $locked->nextPrize() : null;

                if ($hasTiers && $prize === null) {
                    throw DrawException::allWinnersDrawn();
                }

                // A replacement after a winner was taken off: this one draw
                // picks from the developer the operator chose, then the pool is cleared.
                $override = Raffle::normalisePool($locked->next_draw_pool);
                $poolLabel = $override ? Raffle::poolLabel($override) : ($prize?->drawPoolLabel() ?? $locked->drawPoolLabel());
                $eligible = $this->eligibleEntriesQuery($locked, true, $prize, $override);
                $eligibleCount = (clone $eligible)->count();

                if ($eligibleCount === 0 && $override !== null) {
                    throw DrawException::noEligibleParticipants(
                        'No eligible tickets remain in '.$poolLabel.'.',
                        'Nobody from '.$poolLabel.' can still win here. Choose another developer for the next draw in the Control Center.',
                    );
                }

                if ($eligibleCount === 0) {
                    throw ($prize?->drawPool() ?? $locked->drawPool()) === null
                        ? DrawException::noEligibleParticipants('No eligible tickets remain.')
                        : DrawException::noEligibleParticipants(
                            'No eligible tickets remain in '.$poolLabel.'.',
                            'No eligible tickets are left in '.$poolLabel.'. '.($prize
                                ? 'Change who can win "'.$prize->prize_name.'" in the prize list.'
                                : 'Choose another group in "Who can win".'),
                        );
                }

                // Cryptographically secure pick over the eligible set.
                $offset = random_int(0, $eligibleCount - 1);

                /** @var object{id:int, ticket_number:string} $selected */
                $selected = (clone $eligible)
                    ->orderBy('participants.id')
                    ->offset($offset)
                    ->limit(1)
                    ->first(['participants.id', 'participants.ticket_number']);

                if ($selected === null) {
                    throw DrawException::noEligibleParticipants('Eligible pool changed during the draw.');
                }

                $position = $alreadyDrawn + 1;

                $drawEvent = DrawEvent::create([
                    'event_uuid' => (string) Str::uuid(),
                    'raffle_id' => $locked->id,
                    'user_id' => $user?->id,
                    'sequence' => $position,
                    'ticket_number' => $selected->ticket_number,
                    'result' => DrawResult::Success,
                    'message' => Str::limit($prize
                        ? sprintf('Winner #%d drawn for %s from %s.', $position, $prize->prize_name, $poolLabel)
                        : sprintf('Winner #%d drawn from %s.', $position, $poolLabel), 250),
                    'eligible_count' => $eligibleCount,
                    'request_id' => $requestId,
                    'ip_address' => $ipAddress,
                    'context' => [
                        'allow_repeat_winners' => $locked->allow_repeat_winners,
                        'winners_count' => $locked->winners_count,
                        'selection_offset' => $offset,
                        'draw_pool' => $prize?->drawPool() ?? $locked->drawPool(),
                        'raffle_prize_id' => $prize?->id,
                        'include_previous_winners' => $prize?->include_previous_winners,
                    ],
                ]);

                $winner = Winner::create([
                    'raffle_id' => $locked->id,
                    'raffle_prize_id' => $prize?->id,
                    'participant_id' => $selected->id,
                    'draw_event_id' => $drawEvent->id,
                    'ticket_number' => $selected->ticket_number,
                    'position' => $position,
                    'drawn_at' => Carbon::now(),
                    'drawn_by' => $user?->id,
                ]);
                $winner->setRelation('prize', $prize);

                // A winner here, and shown as one in the file's other lists:
                // everyone in a raffle file wins once.
                if ($override !== null) {
                    $locked->forceFill(['next_draw_pool' => null])->save();
                }
                $locked->markTicketsWon([$selected->ticket_number]);

                $remaining = $locked->winners_count - $position;
                $completed = $remaining <= 0;

                $locked->forceFill([
                    'status' => $completed ? RaffleStatus::Completed : RaffleStatus::Live,
                    'completed_at' => $completed ? Carbon::now() : null,
                ])->save();

                return new DrawOutcome(
                    winner: $winner,
                    drawEvent: $drawEvent,
                    raffle: $locked->refresh(),
                    eligibleCountBeforeDraw: $eligibleCount,
                    remainingSlots: max(0, $remaining),
                    raffleCompleted: $completed,
                );
            }, 3);
        } catch (DrawException $e) {
            // Written after the rollback, so a rejected draw still leaves an audit trail.
            $this->recordFailure($raffle, $user, $e->result, $e->auditMessage(), $requestId, $ipAddress);

            throw $e;
        } catch (Throwable $e) {
            report($e);

            $this->recordFailure($raffle, $user, DrawResult::Failed, 'Unexpected error: '.$e->getMessage(), $requestId, $ipAddress);

            throw new DrawException(DrawResult::Failed, 'The draw could not be completed. Please try again.', 500);
        }
    }

    /**
     * The reserved pick, armed for this raffle, recorded like any draw. The
     * audit log keeps a flag that it was the operator's pick, not a random one.
     */
    protected function revealReserved(Raffle $raffle, ReservedPick $reserved, int $position, ?User $user, ?string $requestId, ?string $ipAddress): DrawOutcome
    {
        $hasTiers = $raffle->prizes()->exists();
        $prize = $hasTiers ? $raffle->nextPrize() : null;

        if ($hasTiers && $prize === null) {
            throw DrawException::allWinnersDrawn();
        }

        /** @var Participant|null $participant */
        $participant = Participant::query()
            ->where('participants.raffle_id', $raffle->id)
            ->whereNotIn('participants.status', ParticipantStatus::ineligible())
            ->tap(fn (Builder $q) => $reserved->matchParticipants($q))
            ->whereNotExists(function ($sub) use ($raffle) {
                $sub->selectRaw('1')
                    ->from('winners')
                    ->whereColumn('winners.ticket_number', 'participants.ticket_number')
                    ->where('winners.raffle_id', $raffle->id);
            })
            ->orderBy('participants.id')
            ->first();

        if ($participant === null) {
            throw DrawException::noEligibleParticipants(
                'The reserved pick is not on this raffle\'s list, or already won here.',
                'The reserved pick is not on this raffle\'s participant list (or already won here). Turn it off and draw again.',
            );
        }

        $poolLabel = $prize?->drawPoolLabel() ?? $raffle->drawPoolLabel();
        $eligibleCount = (clone $this->eligibleEntriesQuery($raffle, true, $prize))->count() + 1;

        $drawEvent = DrawEvent::create([
            'event_uuid' => (string) Str::uuid(),
            'raffle_id' => $raffle->id,
            'user_id' => $user?->id,
            'sequence' => $position,
            'ticket_number' => $participant->ticket_number,
            'result' => DrawResult::Success,
            'message' => Str::limit($prize
                ? sprintf('Winner #%d drawn for %s from %s.', $position, $prize->prize_name, $poolLabel)
                : sprintf('Winner #%d drawn from %s.', $position, $poolLabel), 250),
            'eligible_count' => $eligibleCount,
            'request_id' => $requestId,
            'ip_address' => $ipAddress,
            'context' => [
                'reserved_pick' => true,
                'allow_repeat_winners' => $raffle->allow_repeat_winners,
                'winners_count' => $raffle->winners_count,
                'draw_pool' => $prize?->drawPool() ?? $raffle->drawPool(),
                'raffle_prize_id' => $prize?->id,
            ],
        ]);

        $winner = Winner::create([
            'raffle_id' => $raffle->id,
            'raffle_prize_id' => $prize?->id,
            'participant_id' => $participant->id,
            'draw_event_id' => $drawEvent->id,
            'ticket_number' => $participant->ticket_number,
            'position' => $position,
            'drawn_at' => Carbon::now(),
            'drawn_by' => $user?->id,
        ]);
        $winner->setRelation('prize', $prize);
        $winner->setRelation('participant', $participant);

        $raffle->markTicketsWon([$participant->ticket_number]);

        $remaining = $raffle->winners_count - $position;
        $completed = $remaining <= 0;

        $raffle->forceFill([
            'status' => $completed ? RaffleStatus::Completed : RaffleStatus::Live,
            'completed_at' => $completed ? Carbon::now() : null,
        ])->save();

        // One draw only: back to random from here.
        $reserved->disarm();

        return new DrawOutcome(
            winner: $winner,
            drawEvent: $drawEvent,
            raffle: $raffle->refresh(),
            eligibleCountBeforeDraw: $eligibleCount,
            remainingSlots: max(0, $remaining),
            raffleCompleted: $completed,
        );
    }

    /**
     * Swap two winners between raffles (or two places of one raffle): each
     * takes the other's place and the prize that goes with it. Both tickets
     * stay winners, so the participant lists keep their marks. Recorded in
     * both raffles' draw logs.
     *
     * @return array{a: array{raffle_id:int, position:int, ticket_number:string, name:?string}, b: array{raffle_id:int, position:int, ticket_number:string, name:?string}}
     */
    public function swapWinners(Raffle $a, int $positionA, Raffle $b, int $positionB, ?User $user, ?string $ipAddress = null): array
    {
        if ($a->id === $b->id && $positionA === $positionB) {
            throw new DrawException(DrawResult::InvalidStatus, 'Pick two different winners to swap.', 422);
        }

        return DB::transaction(function () use ($a, $positionA, $b, $positionB, $user, $ipAddress) {
            // Locked in id order, so two swaps at once cannot deadlock.
            $ids = array_unique([$a->id, $b->id]);
            sort($ids);
            $locked = Raffle::query()->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            /** @var Raffle $ra */
            $ra = $locked[$a->id];
            /** @var Raffle $rb */
            $rb = $locked[$b->id];

            foreach ([$ra, $rb] as $raffle) {
                if ($raffle->isArchived()) {
                    throw DrawException::invalidStatus(sprintf('"%s" has been archived, so its winners cannot be changed.', $raffle->name), 'Raffle is archived.');
                }
            }

            $wa = Winner::query()->where('raffle_id', $ra->id)->where('position', $positionA)->first();
            $wb = Winner::query()->where('raffle_id', $rb->id)->where('position', $positionB)->first();

            if ($wa === null || $wb === null) {
                throw new DrawException(DrawResult::InvalidStatus, 'One of those winners is no longer there. Reload and try again.', 404);
            }

            // Each person needs a ticket in the other raffle's participant list.
            $pbInA = $ra->id === $rb->id ? $wb->participant : Participant::query()->where('raffle_id', $ra->id)->where('ticket_number', $wb->ticket_number)->first();
            $paInB = $ra->id === $rb->id ? $wa->participant : Participant::query()->where('raffle_id', $rb->id)->where('ticket_number', $wa->ticket_number)->first();

            if ($pbInA === null) {
                throw new DrawException(DrawResult::InvalidStatus, sprintf('Ticket %s is not in the participant list of "%s", so they cannot win there.', $wb->ticket_number, $ra->name), 422);
            }

            if ($paInB === null) {
                throw new DrawException(DrawResult::InvalidStatus, sprintf('Ticket %s is not in the participant list of "%s", so they cannot win there.', $wa->ticket_number, $rb->name), 422);
            }

            // Nobody wins the same raffle twice.
            if ($ra->id !== $rb->id) {
                if (Winner::query()->where('raffle_id', $ra->id)->where('ticket_number', $wb->ticket_number)->exists()) {
                    throw new DrawException(DrawResult::InvalidStatus, sprintf('Ticket %s already won in "%s".', $wb->ticket_number, $ra->name), 422);
                }

                if (Winner::query()->where('raffle_id', $rb->id)->where('ticket_number', $wa->ticket_number)->exists()) {
                    throw new DrawException(DrawResult::InvalidStatus, sprintf('Ticket %s already won in "%s".', $wa->ticket_number, $rb->name), 422);
                }
            }

            $ticketA = $wa->ticket_number;
            $ticketB = $wb->ticket_number;
            $nameA = $wa->participant?->name;
            $nameB = $wb->participant?->name;

            $wasA = (int) $wa->participant_id;
            $wasB = (int) $wb->participant_id;

            // The places keep their prizes; the people change.
            $wa->forceFill(['participant_id' => $pbInA->id, 'ticket_number' => $ticketB])->save();
            $wb->forceFill(['participant_id' => $paInB->id, 'ticket_number' => $ticketA])->save();

            // A pre-selected list names the people too: it follows the swap.
            $this->swapStagedEntry($ra, $wasA, $pbInA->id);
            $this->swapStagedEntry($ra->id === $rb->id ? $ra->refresh() : $rb, $wasB, $paInB->id);

            // Winner marks: each ticket is still a winner, now of the other
            // raffle. Released first, then marked, so the marks follow the
            // raffle files the two belong to.
            $ra->releaseTickets([$ticketA]);
            $rb->releaseTickets([$ticketB]);
            $ra->markTicketsWon([$ticketB]);
            $rb->markTicketsWon([$ticketA]);

            foreach ([[$ra, $wa, $ticketA, $nameA, $ticketB, $nameB, $rb, $positionB], [$rb, $wb, $ticketB, $nameB, $ticketA, $nameA, $ra, $positionA]] as [$raffle, $winner, $out, $outName, $in, $inName, $other, $otherPosition]) {
                DrawEvent::create([
                    'event_uuid' => (string) Str::uuid(),
                    'raffle_id' => $raffle->id,
                    'user_id' => $user?->id,
                    'sequence' => $winner->position,
                    'ticket_number' => $in,
                    'result' => DrawResult::Redraw,
                    'message' => Str::limit(sprintf(
                        'Winner #%d swapped: ticket %s%s out, ticket %s%s in, from winner #%d of "%s".',
                        $winner->position, $out, $outName ? " ($outName)" : '', $in, $inName ? " ($inName)" : '', $otherPosition, $other->name,
                    ), 250),
                    'eligible_count' => 1,
                    'request_id' => null,
                    'ip_address' => $ipAddress,
                    'context' => [
                        'swap' => true,
                        'position' => (int) $winner->position,
                        'ticket_out' => $out,
                        'ticket_in' => $in,
                        'other_raffle_id' => $other->id,
                        'other_position' => $otherPosition,
                    ],
                ]);
            }

            return [
                'a' => ['raffle_id' => $ra->id, 'position' => $positionA, 'ticket_number' => $ticketB, 'name' => $nameB],
                'b' => ['raffle_id' => $rb->id, 'position' => $positionB, 'ticket_number' => $ticketA, 'name' => $nameA],
            ];
        }, 3);
    }

    /** On a pre-selected list, one participant takes another's entry (same prize, same place). */
    protected function swapStagedEntry(Raffle $raffle, int $fromParticipantId, int $toParticipantId): void
    {
        if (! $raffle->hasStagedWinners()) {
            return;
        }

        $list = $raffle->stagedWinners();

        foreach ($list as $index => $entry) {
            if ((int) $entry['participant_id'] === $fromParticipantId) {
                $list[$index]['participant_id'] = $toParticipantId;
            }
        }

        $raffle->forceFill(['staged_winners' => $list])->save();
    }

    /**
     * The next pre-selected winner, recorded like any draw. The audit log
     * says plainly that it came from the pre-selected list, not a random pick.
     */
    protected function revealStaged(Raffle $raffle, int $position, ?User $user, ?string $requestId, ?string $ipAddress): DrawOutcome
    {
        $entry = $raffle->stagedWinners()[$position - 1] ?? null;

        if ($entry === null) {
            throw DrawException::allWinnersDrawn();
        }

        /** @var Participant|null $participant */
        $participant = Participant::query()
            ->where('raffle_id', $raffle->id)
            ->whereKey($entry['participant_id'])
            ->first();

        if ($participant === null) {
            throw DrawException::noEligibleParticipants(
                'A pre-selected winner is no longer in the participant list.',
                sprintf('Pre-selected winner #%d is no longer in the participant list. Pick them again under Prizes.', $position),
            );
        }

        $drawEvent = DrawEvent::create([
            'event_uuid' => (string) Str::uuid(),
            'raffle_id' => $raffle->id,
            'user_id' => $user?->id,
            'sequence' => $position,
            'ticket_number' => $participant->ticket_number,
            'result' => DrawResult::Success,
            'message' => Str::limit(sprintf('Winner #%d revealed from the pre-selected winners (%s).', $position, $entry['prize_name']), 250),
            'eligible_count' => 1,
            'request_id' => $requestId,
            'ip_address' => $ipAddress,
            'context' => [
                'staged' => true,
                'winners_count' => $raffle->winners_count,
                'prize_name' => $entry['prize_name'],
            ],
        ]);

        $winner = Winner::create([
            'raffle_id' => $raffle->id,
            'prize_name' => $entry['prize_name'],
            'participant_id' => $participant->id,
            'draw_event_id' => $drawEvent->id,
            'ticket_number' => $participant->ticket_number,
            'position' => $position,
            'drawn_at' => Carbon::now(),
            'drawn_by' => $user?->id,
        ]);
        $winner->setRelation('participant', $participant);

        // A pre-selected winner has won for good: they show as a winner in
        // every participant list they are in — the main raffle's and the
        // other pre-draws' in the same raffle file — not only this one.
        $raffle->markTicketsWon([$participant->ticket_number]);

        $remaining = $raffle->winners_count - $position;
        $completed = $remaining <= 0;

        $raffle->forceFill([
            'status' => $completed ? RaffleStatus::Completed : RaffleStatus::Live,
            'completed_at' => $completed ? Carbon::now() : null,
        ])->save();

        return new DrawOutcome(
            winner: $winner,
            drawEvent: $drawEvent,
            raffle: $raffle->refresh(),
            eligibleCountBeforeDraw: 1,
            remainingSlots: max(0, $remaining),
            raffleCompleted: $completed,
        );
    }

    /**
     * Draw every remaining winner slot in sequence.
     *
     * @return array<int, DrawOutcome>
     */
    public function drawAll(Raffle $raffle, ?User $user = null, ?string $requestId = null, ?string $ipAddress = null): array
    {
        $outcomes = [];

        // With pre-selected winners, "all at once" means the rest of the run
        // listed with the current prize; the next prize gets its own drumroll.
        $staged = $raffle->stagedWinners();

        if ($staged !== []) {
            $prizeAt = fn () => $staged[Winner::query()->where('raffle_id', $raffle->id)->count()]['prize_name'] ?? null;
            $prize = $prizeAt();

            while ($prize !== null && $raffle->fresh()->remainingWinnerSlots() > 0 && $prizeAt() === $prize) {
                $outcomes[] = $this->draw($raffle, $user, $requestId, $ipAddress);
            }

            return $outcomes;
        }

        // With prize tiers, "all at once" means every remaining winner of the
        // current prize; the next prize gets its own drumroll.
        $tier = $raffle->nextPrize()?->id;

        while ($raffle->fresh()->remainingWinnerSlots() > 0 && $raffle->nextPrize()?->id === $tier) {
            $outcomes[] = $this->draw($raffle, $user, $requestId, $ipAddress);
        }

        return $outcomes;
    }

    /**
     * A sample of the names still in play, used purely to feed the name roller
     * on the screens. Names only — never email, phone or participant id.
     *
     * @return array<int, string>
     */
    public function sampleNames(Raffle $raffle, int $limit = 120): array
    {
        return $this->eligibleEntriesQuery($raffle)
            ->whereNotNull('participants.name')
            ->where('participants.name', '!=', '')
            ->inRandomOrder()
            ->limit($limit)
            ->pluck('participants.name')
            ->all();
    }

    /** Tickets still in play for this raffle. */
    public function eligibleTicketCount(Raffle $raffle): int
    {
        return $this->eligibleEntriesQuery($raffle)->count();
    }

    /**
     * Fills an open place at random, right now, with no draw on the wall —
     * after a winner was taken off a finished raffle (absent, say). The pick
     * comes from one developer's people, or the raffle's own pool, under the
     * ordinary draw's rules (nobody who won that day, the day's order,
     * big-prize winners out), never the person just taken off. The new
     * winner takes the open place; on a pre-draw they go on the list too.
     *
     * @return array{participant_id: int, name: ?string, ticket_number: string, position: int, winners_count: int, status: string}
     */
    public function replaceWinner(Raffle $raffle, ?string $developer, ?string $prizeName, ?User $user, ?string $ipAddress = null, ?string $excludeTicket = null): array
    {
        return DB::transaction(function () use ($raffle, $developer, $prizeName, $user, $ipAddress, $excludeTicket) {
            /** @var Raffle $locked */
            $locked = Raffle::query()->whereKey($raffle->getKey())->lockForUpdate()->firstOrFail();

            if ($locked->isArchived()) {
                throw DrawException::invalidStatus('This raffle has been archived, so its winners cannot be changed.', 'Raffle is archived.');
            }
            if ($locked->isLocked()) {
                throw new DrawException(DrawResult::InvalidStatus, 'This raffle is locked. Unlock it with the owner PIN first.', 423);
            }

            $staged = $locked->hasStagedWinners() || ($locked->is_predraw && $locked->winners()->doesntExist());
            $alreadyDrawn = Winner::query()->where('raffle_id', $locked->id)->count();

            if (! $staged && $alreadyDrawn >= $locked->winners_count) {
                throw new DrawException(DrawResult::InvalidStatus, 'Every place is taken. Take a winner off first, then pick their replacement.', 422);
            }

            // With prize tiers, the open place belongs to the first tier short of a winner.
            $prize = (! $staged && $locked->prizes()->exists()) ? $locked->nextPrize() : null;
            $pool = $developer !== null ? ['type' => 'developer', 'values' => [$developer]] : null;
            $poolLabel = $pool ? Raffle::poolLabel($pool) : ($prize?->drawPoolLabel() ?? $locked->drawPoolLabel());

            $eligible = $this->eligibleEntriesQuery($locked, true, $prize, $pool)
                ->whereNotIn('participants.ticket_number', array_merge($locked->stagedTicketNumbers(), $excludeTicket !== null ? [$excludeTicket] : []));
            $count = (clone $eligible)->count();

            if ($count === 0) {
                throw DrawException::noEligibleParticipants(
                    'No eligible tickets remain in '.$poolLabel.'.',
                    'Nobody from '.$poolLabel.' can still win here. Choose another developer.',
                );
            }

            /** @var Participant $picked */
            $picked = (clone $eligible)
                ->orderBy('participants.id')
                ->offset(random_int(0, $count - 1))
                ->limit(1)
                ->first(['participants.id', 'participants.name', 'participants.ticket_number']);

            $position = $alreadyDrawn + 1;
            $prizeText = $staged ? ($prizeName ?: ($locked->prize_name ?? 'Prize')) : null;

            $drawEvent = DrawEvent::create([
                'event_uuid' => (string) Str::uuid(),
                'raffle_id' => $locked->id,
                'user_id' => $user?->id,
                'sequence' => $position,
                'ticket_number' => $picked->ticket_number,
                'result' => DrawResult::Success,
                'message' => Str::limit(sprintf('Winner #%d picked at random from %s as a replacement%s.', $position, $poolLabel, $excludeTicket ? ' for '.$excludeTicket : ''), 250),
                'eligible_count' => $count,
                'request_id' => null,
                'ip_address' => $ipAddress,
                'context' => [
                    'replacement' => true,
                    'developer' => $developer,
                    'replaced_ticket' => $excludeTicket,
                    'winners_count' => $locked->winners_count,
                    'draw_pool' => $pool ?? ($prize?->drawPool() ?? $locked->drawPool()),
                    'raffle_prize_id' => $prize?->id,
                    'prize_name' => $prizeText,
                ],
            ]);

            Winner::create([
                'raffle_id' => $locked->id,
                'raffle_prize_id' => $prize?->id,
                'prize_name' => $prizeText,
                'participant_id' => $picked->id,
                'draw_event_id' => $drawEvent->id,
                'ticket_number' => $picked->ticket_number,
                'position' => $position,
                'drawn_at' => Carbon::now(),
                'drawn_by' => $user?->id,
            ]);

            $attributes = [];
            if ($staged) {
                // On the list as well, so playing the pre-draw again reveals them too.
                $list = [...$locked->stagedWinners(), ['participant_id' => (int) $picked->id, 'prize_name' => $prizeText]];
                $attributes = ['staged_winners' => $list, 'winners_count' => count($list)];
            }
            $total = $attributes['winners_count'] ?? (int) $locked->winners_count;
            $completed = $position >= $total;
            $locked->forceFill($attributes + [
                'status' => $completed ? RaffleStatus::Completed : RaffleStatus::Live,
                'completed_at' => $completed ? ($locked->completed_at ?? Carbon::now()) : null,
            ])->save();
            $locked->markTicketsWon([$picked->ticket_number]);

            return [
                'participant_id' => (int) $picked->id,
                'name' => $picked->name,
                'ticket_number' => $picked->ticket_number,
                'position' => $position,
                'winners_count' => $total,
                'status' => $locked->status->value,
            ];
        }, 3);
    }

    /**
     * Fills an open place on a pre-selected list at random — after a listed
     * winner was taken off (absent, say) — from one developer's people, or
     * from the raffle's own pool when no developer is given. The pick follows
     * the ordinary draw's rules (nobody who won that day, the day's order,
     * big-prize winners out) and leaves out everyone already on the list.
     * The new name goes on the end of the list, so the next DRAW on the wall
     * reveals them like any winner.
     *
     * @return array{participant_id: int, name: ?string, ticket_number: string, position: int, winners_count: int, status: string}
     */
    public function fillStagedPlace(Raffle $raffle, ?string $developer, string $prizeName, ?User $user, ?string $ipAddress = null, ?string $excludeTicket = null): array
    {
        return DB::transaction(function () use ($raffle, $developer, $prizeName, $user, $ipAddress, $excludeTicket) {
            /** @var Raffle $locked */
            $locked = Raffle::query()->whereKey($raffle->getKey())->lockForUpdate()->firstOrFail();

            if ($locked->isLocked()) {
                throw new DrawException(DrawResult::InvalidStatus, 'This raffle is locked. Unlock it with the owner PIN first.', 423);
            }
            // A pre-selected list, or one just emptied (its only winner taken
            // off). A random raffle with winners up keeps drawing at random.
            if (! $locked->hasStagedWinners() && ! $locked->is_predraw && $locked->winners()->exists()) {
                throw new DrawException(DrawResult::InvalidStatus, 'Only a pre-draw can have a place filled this way. Press NEXT WINNER to draw a replacement.', 422);
            }

            $pool = $developer !== null ? ['type' => 'developer', 'values' => [$developer]] : null;
            // Not anyone already on the list — nor the person just taken off
            // (absent, say), who is back in play but not for this place.
            $eligible = $this->eligibleEntriesQuery($locked, true, null, $pool)
                ->whereNotIn('participants.ticket_number', array_merge($locked->stagedTicketNumbers(), $excludeTicket !== null ? [$excludeTicket] : []));
            $count = (clone $eligible)->count();

            if ($count === 0) {
                throw DrawException::noEligibleParticipants(
                    'No eligible tickets remain in '.($pool ? Raffle::poolLabel($pool) : $locked->drawPoolLabel()).'.',
                    'Nobody from '.($developer ?? $locked->drawPoolLabel()).' can still win here. Choose another developer.',
                );
            }

            /** @var Participant $picked */
            $picked = (clone $eligible)
                ->orderBy('participants.id')
                ->offset(random_int(0, $count - 1))
                ->limit(1)
                ->first(['participants.id', 'participants.name', 'participants.ticket_number']);

            $staged = [...$locked->stagedWinners(), ['participant_id' => (int) $picked->id, 'prize_name' => $prizeName]];
            $total = count($staged);
            $revealed = Winner::query()->where('raffle_id', $locked->id)->count();
            $status = match (true) {
                $revealed >= $total => RaffleStatus::Completed,
                $revealed > 0 => RaffleStatus::Live,
                default => RaffleStatus::Ready,
            };

            $locked->forceFill([
                'staged_winners' => $staged,
                'winners_count' => $total,
                'status' => $status,
                'completed_at' => $status === RaffleStatus::Completed ? ($locked->completed_at ?? Carbon::now()) : null,
            ])->save();
            $locked->markTicketsWon([$picked->ticket_number]);

            DrawEvent::create([
                'event_uuid' => (string) Str::uuid(),
                'raffle_id' => $locked->id,
                'user_id' => $user?->id,
                'sequence' => null,
                'ticket_number' => $picked->ticket_number,
                'result' => DrawResult::Success,
                'message' => Str::limit(sprintf('Replacement picked at random from %s: %s goes on the pre-selected list as winner #%d (%s).', $pool ? Raffle::poolLabel($pool) : $locked->drawPoolLabel(), $picked->ticket_number, $total, $prizeName), 250),
                'eligible_count' => $count,
                'request_id' => null,
                'ip_address' => $ipAddress,
                'context' => ['replacement' => true, 'developer' => $developer, 'prize_name' => $prizeName, 'position' => $total],
            ]);

            return [
                'participant_id' => (int) $picked->id,
                'name' => $picked->name,
                'ticket_number' => $picked->ticket_number,
                'position' => $total,
                'winners_count' => $total,
                'status' => $status->value,
            ];
        }, 3);
    }

    /**
     * Every tag, developer and location in the raffle, each with how many
     * of its tickets exist and how many are still in play (ignoring the pool
     * the raffle is currently drawn from), for choosing who can win.
     *
     * @return array{tags: array<int, array{value: string, total: int, eligible: int}>, developers: array<int, array{value: string, total: int, eligible: int}>, locations: array<int, array{value: string, total: int, eligible: int}>}
     */
    public function poolOptions(Raffle $raffle): array
    {
        $eligibleIds = array_flip($this->eligibleEntriesQuery($raffle, false)->pluck('participants.id')->all());
        $tags = [];
        $developers = [];
        $locations = [];

        $count = function (array &$groups, string $value, bool $eligible) {
            $groups[$value] ??= ['value' => $value, 'total' => 0, 'eligible' => 0];
            $groups[$value]['total']++;
            $groups[$value]['eligible'] += $eligible ? 1 : 0;
        };

        $raffle->participants()
            ->select(['id', 'category', 'developers', 'location'])
            ->chunkById(2000, function ($chunk) use (&$tags, &$developers, &$locations, $eligibleIds, $count) {
                foreach ($chunk as $participant) {
                    $eligible = isset($eligibleIds[$participant->id]);

                    if (filled($participant->category)) {
                        $count($tags, $participant->category, $eligible);
                    }

                    foreach ((array) $participant->developers as $developer) {
                        $count($developers, $developer, $eligible);
                    }

                    if (filled($participant->location)) {
                        $count($locations, $participant->location, $eligible);
                    }
                }
            });

        // Biggest groups first, so the usual picks are at the top.
        $sorted = fn (array $groups) => collect($groups)->sortBy([['total', 'desc'], ['value', 'asc']])->values()->all();

        return ['tags' => $sorted($tags), 'developers' => $sorted($developers), 'locations' => $sorted($locations)];
    }

    /**
     * A sample of eligible ticket numbers, used purely to feed the roller animation.
     * Contains ticket numbers only — never participant identity.
     *
     * @return array<int, string>
     */
    public function sampleTicketNumbers(Raffle $raffle, int $limit = 200): array
    {
        return $this->eligibleEntriesQuery($raffle)
            ->inRandomOrder()
            ->limit($limit)
            ->pluck('participants.ticket_number')
            ->all();
    }

    /**
     * Clear a raffle's winners so it can be drawn again from the start.
     *
     * The cleared winners either rejoin the pool ($includePreviousWinners) or
     * are marked EXCLUDED so no redraw can pick them. Rejoining also returns
     * tickets excluded by an earlier redraw. The redraw itself is written to
     * the audit log with the tickets it cleared; the original draw events
     * stay where they are. $winnersCount, when given, sets how many winners
     * the new draw has — fewer or more than before.
     *
     * @return array{cleared: array<int, string>, eligible_count: int, winners_count: int}
     */
    public function redraw(Raffle $raffle, ?User $user, bool $includePreviousWinners, ?string $ipAddress = null, ?int $winnersCount = null): array
    {
        return DB::transaction(function () use ($raffle, $user, $includePreviousWinners, $ipAddress, $winnersCount) {
            /** @var Raffle $locked */
            $locked = Raffle::query()->whereKey($raffle->getKey())->lockForUpdate()->firstOrFail();

            if ($locked->isArchived()) {
                throw DrawException::invalidStatus('This raffle has been archived and cannot be redrawn.', 'Raffle is archived.');
            }

            if ($locked->status === RaffleStatus::Cancelled) {
                throw DrawException::invalidStatus('This raffle has been cancelled. Reopen it before redrawing.', 'Raffle is cancelled.');
            }

            if ($winnersCount !== null && $winnersCount !== (int) $locked->winners_count && $locked->hasStagedWinners()) {
                throw new DrawException(DrawResult::InvalidStatus, 'This raffle has pre-selected winners, so its number of winners comes from that list. Change it under Prizes instead.', 422);
            }

            if ($winnersCount !== null && $winnersCount !== (int) $locked->winners_count && $locked->prizes()->exists()) {
                throw new DrawException(DrawResult::InvalidStatus, 'This raffle has a prize list, so its number of winners comes from the prizes. Change them in the prize list instead.', 422);
            }

            $previous = Winner::query()->where('raffle_id', $locked->id)->orderBy('position')->get();

            if ($previous->isEmpty()) {
                throw new DrawException(DrawResult::InvalidStatus, 'No winners have been drawn yet, so there is nothing to redraw.', 409);
            }

            // With a pre-selected list the winners are already decided: a
            // redraw only starts the reveal over, with the same winners.
            if ($locked->hasStagedWinners()) {
                return $this->resetStagedWinners($locked, $user, $ipAddress);
            }

            $tickets = $previous->pluck('ticket_number')->all();
            $participantIds = $previous->pluck('participant_id')->filter()->all();

            Winner::query()->where('raffle_id', $locked->id)->delete();

            if ($includePreviousWinners) {
                Participant::query()
                    ->where('raffle_id', $locked->id)
                    ->whereIn('status', [ParticipantStatus::Winner->value, ParticipantStatus::Excluded->value])
                    ->update(['status' => ParticipantStatus::Active->value]);
            } else {
                Participant::query()
                    ->whereIn('id', $participantIds)
                    ->where('status', ParticipantStatus::Winner->value)
                    ->update(['status' => ParticipantStatus::Excluded->value]);
            }

            // Anyone on a pre-selected list stays shown as a winner.
            $locked->markTicketsWon($locked->stagedTicketsAround());

            // The cleared winners won nothing here after all: back in play in
            // the file's other lists, unless they won there too.
            $locked->releaseTickets($tickets);

            $previousCount = (int) $locked->winners_count;

            $locked->forceFill([
                'status' => RaffleStatus::Ready,
                'completed_at' => null,
            ] + ($winnersCount !== null ? ['winners_count' => $winnersCount] : []))->save();

            $eligible = $this->eligibleEntriesQuery($locked)->count();

            DrawEvent::create([
                'event_uuid' => (string) Str::uuid(),
                'raffle_id' => $locked->id,
                'user_id' => $user?->id,
                'sequence' => null,
                'ticket_number' => null,
                'result' => DrawResult::Redraw,
                'message' => Str::limit(sprintf(
                    'Raffle redrawn: %d winner%s cleared (%s); previous winners %s%s.',
                    count($tickets),
                    count($tickets) === 1 ? '' : 's',
                    implode(', ', $tickets),
                    $includePreviousWinners ? 'can win again' : 'left out',
                    $locked->winners_count !== $previousCount ? sprintf('; winners %d → %d', $previousCount, $locked->winners_count) : '',
                ), 250),
                'eligible_count' => $eligible,
                'request_id' => null,
                'ip_address' => $ipAddress,
                'context' => [
                    'cleared_tickets' => $tickets,
                    'include_previous_winners' => $includePreviousWinners,
                    'winners_count_before' => $previousCount,
                    'winners_count_after' => (int) $locked->winners_count,
                ],
            ]);

            return ['cleared' => $tickets, 'eligible_count' => $eligible, 'winners_count' => (int) $locked->winners_count];
        }, 3);
    }

    /**
     * Play a raffle with pre-selected winners again: its revealed winners are
     * cleared so the screens can run the draw once more, and the draw lands
     * on the same winners, in the same order, because the list stays as it
     * is. Nobody is excluded or released; the original reveals stay in the
     * audit log. For the event: a draw already made is replayed on stage.
     *
     * @return array{cleared: array<int, string>, eligible_count: int, winners_count: int}
     */
    public function replay(Raffle $raffle, ?User $user, ?string $ipAddress = null): array
    {
        return DB::transaction(function () use ($raffle, $user, $ipAddress) {
            /** @var Raffle $locked */
            $locked = Raffle::query()->whereKey($raffle->getKey())->lockForUpdate()->firstOrFail();

            if ($locked->isArchived()) {
                throw DrawException::invalidStatus('This raffle has been archived and cannot be played again.', 'Raffle is archived.');
            }

            // A raffle drawn at random is kept first: its winners become its
            // list, so the draw plays again and lands on the same people.
            if (! $locked->hasStagedWinners()) {
                if ($locked->winners()->doesntExist()) {
                    throw new DrawException(DrawResult::InvalidStatus, 'This raffle has no winners to play again. Use Redraw to draw it at random.', 422);
                }

                if (! $locked->keepWinnersAsList()) {
                    throw new DrawException(DrawResult::InvalidStatus, 'One of the winners is no longer in the participant list, so this raffle cannot be played again.', 422);
                }
            }

            return $this->resetStagedWinners($locked, $user, $ipAddress);
        }, 3);
    }

    /**
     * Clears the revealed winners of a raffle with a pre-selected list and
     * sets it READY, keeping the list — and everyone on it a winner — so the
     * next draws reveal the same people again.
     *
     * @return array{cleared: array<int, string>, eligible_count: int, winners_count: int}
     */
    protected function resetStagedWinners(Raffle $locked, ?User $user, ?string $ipAddress): array
    {
        $tickets = Winner::query()->where('raffle_id', $locked->id)->orderBy('position')->pluck('ticket_number')->all();

        Winner::query()->where('raffle_id', $locked->id)->delete();

        // Still winners, here and in the file's other lists: the list decides.
        $locked->markTicketsWon($locked->stagedTicketNumbers());

        $locked->forceFill([
            'status' => RaffleStatus::Ready,
            'completed_at' => null,
            'winners_count' => max(1, count($locked->stagedWinners())),
        ])->save();

        DrawEvent::create([
            'event_uuid' => (string) Str::uuid(),
            'raffle_id' => $locked->id,
            'user_id' => $user?->id,
            'sequence' => null,
            'ticket_number' => null,
            'result' => DrawResult::Redraw,
            'message' => Str::limit(sprintf(
                'Played again: %d revealed winner%s cleared (%s); the pre-selected list is unchanged, so the same winners come out again.',
                count($tickets),
                count($tickets) === 1 ? '' : 's',
                implode(', ', $tickets),
            ), 250),
            'eligible_count' => count($locked->stagedWinners()),
            'request_id' => null,
            'ip_address' => $ipAddress,
            'context' => [
                'replay' => true,
                'cleared_tickets' => $tickets,
                'winners_count' => (int) $locked->winners_count,
            ],
        ]);

        return ['cleared' => $tickets, 'eligible_count' => count($locked->stagedWinners()), 'winners_count' => (int) $locked->winners_count];
    }

    /**
     * Takes one winner off a raffle without starting the whole draw over.
     *
     * On a raffle with pre-selected winners — one person was listed by
     * mistake — they come off the list and out of the winners, the winners
     * after them move up a place, and the number of winners follows the list.
     *
     * On an ordinary draw — a winner turned out to be invalid — they come
     * out of the winners and are left out of this raffle, the winners after
     * them move up a place, and the raffle has one place open again: the next
     * draw on the screens fills it with a replacement, so ten winners stay ten.
     *
     * Either way they are back in play wherever they were shown as a winner
     * only because of this raffle.
     *
     * @return array{removed: string, winners_count: int, status: string}
     */
    public function removeWinner(Raffle $raffle, Winner $winner, ?User $user, ?string $ipAddress = null): array
    {
        return DB::transaction(function () use ($raffle, $winner, $user, $ipAddress) {
            /** @var Raffle $locked */
            $locked = Raffle::query()->whereKey($raffle->getKey())->lockForUpdate()->firstOrFail();

            if ($winner->raffle_id !== $locked->id) {
                throw new DrawException(DrawResult::InvalidStatus, 'That winner is not in this raffle.', 404);
            }

            if ($locked->isArchived()) {
                throw DrawException::invalidStatus('This raffle has been archived, so its winners cannot be changed.', 'Raffle is archived.');
            }

            if ($locked->isLocked()) {
                throw new DrawException(DrawResult::InvalidStatus, 'This raffle is locked, so no winner can be taken off it. Unlock it with the owner PIN first.', 423);
            }

            $preselected = $locked->hasStagedWinners();
            $staged = $preselected ? array_values(array_filter(
                $locked->stagedWinners(),
                fn (array $entry) => (int) $entry['participant_id'] !== (int) $winner->participant_id,
            )) : [];

            if ($preselected && count($staged) === count($locked->stagedWinners())) {
                throw new DrawException(DrawResult::InvalidStatus, 'That winner is not on the pre-selected list.', 422);
            }

            $position = (int) $winner->position;
            $ticket = $winner->ticket_number;
            $participantId = $winner->participant_id;
            $winner->delete();

            // Everyone after them moves up one place.
            Winner::query()
                ->where('raffle_id', $locked->id)
                ->where('position', '>', $position)
                ->orderBy('position')
                ->get()
                ->each(fn (Winner $later) => $later->update(['position' => $later->position - 1]));

            $revealed = Winner::query()->where('raffle_id', $locked->id)->count();
            // A pre-selected list sets the number of winners; an ordinary
            // draw keeps its number, so a place is open for a replacement.
            $total = $preselected ? count($staged) : (int) $locked->winners_count;

            $status = match (true) {
                $total === 0 => RaffleStatus::Ready,
                $revealed >= $total => RaffleStatus::Completed,
                $revealed > 0 => RaffleStatus::Live,
                default => RaffleStatus::Ready,
            };

            $locked->forceFill([
                'status' => $status,
                'completed_at' => $status === RaffleStatus::Completed ? ($locked->completed_at ?? Carbon::now()) : null,
            ] + ($preselected ? [
                'staged_winners' => $staged === [] ? null : $staged,
                'winners_count' => max($total, 1),
            ] : []))->save();

            if (! $preselected && $participantId !== null) {
                // Out of this raffle: the replacement is drawn from everyone else.
                Participant::query()
                    ->whereKey($participantId)
                    ->where('status', ParticipantStatus::Winner->value)
                    ->update(['status' => ParticipantStatus::Excluded->value]);
            }

            // Back in play, here (a pre-selected list) and in the file's other
            // lists — unless they won somewhere else too.
            $locked->releaseTickets([$ticket]);

            DrawEvent::create([
                'event_uuid' => (string) Str::uuid(),
                'raffle_id' => $locked->id,
                'user_id' => $user?->id,
                'sequence' => null,
                'ticket_number' => $ticket,
                'result' => DrawResult::Redraw,
                'message' => Str::limit($preselected
                    ? sprintf('Winner #%d (%s) taken off the pre-selected list; %d winner%s left.', $position, $ticket, $total, $total === 1 ? '' : 's')
                    : sprintf('Winner #%d (%s) removed and left out; %d of %d winners stand, a replacement can be drawn.', $position, $ticket, $revealed, $total), 250),
                'eligible_count' => 0,
                'request_id' => null,
                'ip_address' => $ipAddress,
                'context' => [
                    'removed_ticket' => $ticket,
                    'removed_position' => $position,
                    'winners_count_after' => (int) $locked->winners_count,
                ],
            ]);

            return ['removed' => $ticket, 'winners_count' => (int) $locked->winners_count, 'status' => $locked->status->value];
        }, 3);
    }

    /**
     * The redraw that can still be undone: the raffle's latest clearing of
     * its winners (not a single winner taken off), as long as it has not
     * been undone already. Null when there is none.
     */
    public function undoableRedraw(Raffle $raffle): ?DrawEvent
    {
        $event = DrawEvent::query()
            ->where('raffle_id', $raffle->id)
            ->where('result', DrawResult::Redraw->value)
            ->whereNotNull('context->cleared_tickets')
            ->whereNull('context->undo')
            ->orderByDesc('id')
            ->first();

        return $event && empty($event->context['undone_at']) ? $event : null;
    }

    /**
     * Undoes the raffle's latest redraw: the winners it cleared are put back,
     * exactly as drawn — the same people, places and times, from the draw
     * log — and anyone drawn since is cleared. A winner taken off one at a
     * time before the redraw stays off, so their place is open again for a
     * replacement. Only the owner can do this (the PIN is checked by the
     * caller); it is for a redraw pressed by mistake.
     *
     * @return array{restored: int, cleared: int, winners_count: int, status: string}
     */
    public function undoRedraw(Raffle $raffle, ?User $user, ?string $ipAddress = null): array
    {
        return DB::transaction(function () use ($raffle, $user, $ipAddress) {
            /** @var Raffle $locked */
            $locked = Raffle::query()->whereKey($raffle->getKey())->lockForUpdate()->firstOrFail();

            if ($locked->isArchived()) {
                throw DrawException::invalidStatus('This raffle has been archived, so its winners cannot be changed.', 'Raffle is archived.');
            }

            if ($locked->hasStagedWinners()) {
                throw new DrawException(DrawResult::InvalidStatus, 'A pre-draw keeps its winners on its pre-selected list: play it again instead.', 422);
            }

            $redraw = $this->undoableRedraw($locked);

            if ($redraw === null) {
                throw new DrawException(DrawResult::InvalidStatus, 'There is no redraw to undo for this raffle.', 409);
            }

            $tickets = array_values($redraw->context['cleared_tickets'] ?? []);

            // Each cleared winner's own draw: the last time that ticket was
            // drawn here before the redraw.
            $draws = [];
            foreach ($tickets as $ticket) {
                $draws[$ticket] = DrawEvent::query()
                    ->where('raffle_id', $locked->id)
                    ->where('result', DrawResult::Success->value)
                    ->where('ticket_number', $ticket)
                    ->where('id', '<', $redraw->id)
                    ->orderByDesc('id')
                    ->first();
            }

            $missing = array_keys(array_filter($draws, fn ($draw) => $draw === null));
            if ($missing !== []) {
                throw new DrawException(DrawResult::InvalidStatus, sprintf('The draw log has no draw for %s, so the redraw cannot be undone.', implode(', ', $missing)), 409);
            }

            // Whoever was drawn since the redraw is cleared: they never won here.
            $since = Winner::query()->where('raffle_id', $locked->id)->orderBy('position')->get();
            $sinceTickets = $since->pluck('ticket_number')->all();
            Winner::query()->where('raffle_id', $locked->id)->delete();
            Participant::query()
                ->whereIn('id', $since->pluck('participant_id')->filter()->all())
                ->where('status', ParticipantStatus::Winner->value)
                ->update(['status' => ParticipantStatus::Active->value]);
            $locked->releaseTickets($sinceTickets);

            // The cleared winners come back in their places. The redraw had
            // marked them excluded or active; they are winners again.
            $position = 0;
            $lastDrawnAt = null;
            foreach ($tickets as $ticket) {
                $draw = $draws[$ticket];
                $participant = Participant::query()->where('raffle_id', $locked->id)->where('ticket_number', $ticket)->first();
                $prizeId = $draw->context['raffle_prize_id'] ?? null;

                Winner::create([
                    'raffle_id' => $locked->id,
                    'raffle_prize_id' => $prizeId && RafflePrize::query()->whereKey($prizeId)->where('raffle_id', $locked->id)->exists() ? $prizeId : null,
                    'prize_name' => $prizeId ? null : ($draw->context['prize_name'] ?? null),
                    'participant_id' => $participant?->id,
                    'draw_event_id' => $draw->id,
                    'ticket_number' => $ticket,
                    'position' => ++$position,
                    'drawn_at' => $draw->created_at,
                    'drawn_by' => $draw->user_id,
                ]);
                $lastDrawnAt = $draw->created_at;

                $participant?->update(['status' => ParticipantStatus::Winner->value]);
            }
            $locked->markTicketsWon($tickets);

            $total = (int) $locked->winners_count;
            $status = $position >= $total ? RaffleStatus::Completed : ($position > 0 ? RaffleStatus::Live : RaffleStatus::Ready);
            $locked->forceFill([
                'status' => $status,
                'completed_at' => $status === RaffleStatus::Completed ? $lastDrawnAt : null,
            ])->save();

            $redraw->forceFill(['context' => $redraw->context + ['undone_at' => Carbon::now()->toIso8601String()]])->save();

            DrawEvent::create([
                'event_uuid' => (string) Str::uuid(),
                'raffle_id' => $locked->id,
                'user_id' => $user?->id,
                'sequence' => null,
                'ticket_number' => null,
                'result' => DrawResult::Redraw,
                'message' => Str::limit(sprintf(
                    'Redraw undone by the owner: %d winner%s restored (%s)%s; %d of %d winners stand.',
                    count($tickets),
                    count($tickets) === 1 ? '' : 's',
                    implode(', ', $tickets),
                    $sinceTickets === [] ? '' : sprintf(', %d drawn since cleared (%s)', count($sinceTickets), implode(', ', $sinceTickets)),
                    $position,
                    $total,
                ), 250),
                'eligible_count' => $this->eligibleEntriesQuery($locked)->count(),
                'request_id' => null,
                'ip_address' => $ipAddress,
                'context' => [
                    'undo_of' => $redraw->id,
                    'restored_tickets' => $tickets,
                    'cleared_tickets' => $sinceTickets,
                    'undo' => true,
                ],
            ]);

            return ['restored' => count($tickets), 'cleared' => count($sinceTickets), 'winners_count' => $total, 'status' => $status->value];
        }, 3);
    }

    /**
     * Eligible entries: imported into this raffle, inside the pool the raffle
     * is drawn from (its chosen tags, developers or locations, if any), not disqualified
     * or excluded, and — unless repeat winners are explicitly allowed — not
     * already a winner here.
     */
    protected function eligibleEntriesQuery(Raffle $raffle, bool $withinPool = true, ?RafflePrize $prize = null, ?array $poolOverride = null): Builder
    {
        $query = Participant::query()
            ->where('participants.raffle_id', $raffle->id)
            ->whereNotIn('participants.status', ParticipantStatus::ineligible());

        // The reserved pick never comes up at random.
        ReservedPick::current()->excludeFrom($query);

        // A raffle with prize tiers draws under the next tier's rules — or,
        // given a pool outright (a replacement picked from one developer), that.
        $prize ??= $raffle->nextPrize();
        $pool = $poolOverride ?? ($withinPool ? ($prize ? $prize->drawPool() : $raffle->drawPool()) : null);

        Raffle::applyPool($query, $pool);

        // Winners of the file's big-prize raffles — the ones whose winners sit
        // out the whole event — are out, whatever the day.
        $keptOut = $raffle->ticketsKeptOut();

        if ($keptOut !== []) {
            $query->whereNotIn('participants.ticket_number', $keptOut);
        }

        // Never the same prize twice. Earlier winners of other prizes are
        // left out too, unless this prize includes them.
        if ($prize !== null) {
            $query->whereNotExists(function ($sub) use ($raffle, $prize) {
                $sub->selectRaw('1')
                    ->from('winners')
                    ->whereColumn('winners.ticket_number', 'participants.ticket_number')
                    ->where('winners.raffle_id', $raffle->id)
                    ->when($prize->include_previous_winners, fn ($q) => $q->where('winners.raffle_prize_id', $prize->id));
            });
        } elseif (! $raffle->allow_repeat_winners) {
            $query->whereNotExists(function ($sub) use ($raffle) {
                $sub->selectRaw('1')
                    ->from('winners')
                    ->whereColumn('winners.ticket_number', 'participants.ticket_number')
                    ->where('winners.raffle_id', $raffle->id);
            });
        }

        // Who comes first, in order:
        //   1. anyone still to win anything — not drawn and not on a list on
        //      this day or any earlier day (a later day's lists count for nothing here);
        //   2. then anyone who has not won on this day — an earlier day's
        //      winners come back before the day's own winners;
        //   3. then everyone, so the day's draws never run dry.
        // Unless the day's rule puts its winners back in play (see
        // RaffleFile::dayRule), in which case only the big-prize winners stay out.
        if (! $raffle->dayWinnersBackIn()) {
            $wonSoFar = array_values(array_unique(array_merge($raffle->stagedTicketsToday(), $raffle->ticketsWonToday())));
            $wonOnDay = array_values(array_unique(array_merge($raffle->stagedTicketsToday(true), $raffle->ticketsWonToday(true))));

            foreach ([$wonSoFar, $wonOnDay] as $out) {
                if ($out === []) {
                    continue;
                }
                $tier = (clone $query)->whereNotIn('participants.ticket_number', $out);

                if ((clone $tier)->exists()) {
                    return $tier;
                }
            }
        }

        return $query;
    }

    protected function assertDrawable(Raffle $raffle): void
    {
        if ($raffle->isArchived()) {
            throw DrawException::invalidStatus('This raffle has been archived and cannot be drawn.', 'Raffle is archived.');
        }

        if (! $raffle->status->canDraw()) {
            throw DrawException::invalidStatus(match ($raffle->status) {
                RaffleStatus::Draft => 'This raffle is still a draft. Mark it READY before drawing.',
                RaffleStatus::Completed => 'This raffle is already completed.',
                RaffleStatus::Cancelled => 'This raffle has been cancelled.',
                default => 'This raffle is not ready to be drawn.',
            }, "Raffle status is {$raffle->status->value}.");
        }
    }

    protected function recordFailure(Raffle $raffle, ?User $user, DrawResult $result, string $message, ?string $requestId, ?string $ipAddress): void
    {
        $raffle = $raffle->fresh() ?? $raffle;

        DrawEvent::create([
            'event_uuid' => (string) Str::uuid(),
            'raffle_id' => $raffle->id,
            'user_id' => $user?->id,
            'sequence' => null,
            'ticket_number' => null,
            'result' => $result,
            'message' => Str::limit($message, 250),
            'eligible_count' => 0,
            'request_id' => $requestId,
            'ip_address' => $ipAddress,
            'context' => ['status' => $raffle->status->value],
        ]);
    }
}
