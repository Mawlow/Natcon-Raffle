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

                // With prize tiers, the winner is drawn for the first tier
                // with a place left, under that tier's own rules.
                $hasTiers = $locked->prizes()->exists();
                $prize = $hasTiers ? $locked->nextPrize() : null;

                if ($hasTiers && $prize === null) {
                    throw DrawException::allWinnersDrawn();
                }

                $poolLabel = $prize?->drawPoolLabel() ?? $locked->drawPoolLabel();
                $eligible = $this->eligibleEntriesQuery($locked, true, $prize);
                $eligibleCount = (clone $eligible)->count();

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

                Participant::query()
                    ->whereKey($selected->id)
                    ->where('status', ParticipantStatus::Active->value)
                    ->update(['status' => ParticipantStatus::Winner->value]);

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
        // other pre-draws' — not only this one.
        Participant::query()
            ->where('ticket_number', $participant->ticket_number)
            ->where('status', ParticipantStatus::Active->value)
            ->update(['status' => ParticipantStatus::Winner->value]);

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
     * Every tag and developer in the raffle, each with how many of its
     * tickets exist and how many are still in play (ignoring the pool the
     * raffle is currently drawn from), for choosing who can win.
     *
     * @return array{tags: array<int, array{value: string, total: int, eligible: int}>, developers: array<int, array{value: string, total: int, eligible: int}>}
     */
    public function poolOptions(Raffle $raffle): array
    {
        $eligibleIds = array_flip($this->eligibleEntriesQuery($raffle, false)->pluck('participants.id')->all());
        $tags = [];
        $developers = [];

        $count = function (array &$groups, string $value, bool $eligible) {
            $groups[$value] ??= ['value' => $value, 'total' => 0, 'eligible' => 0];
            $groups[$value]['total']++;
            $groups[$value]['eligible'] += $eligible ? 1 : 0;
        };

        $raffle->participants()
            ->select(['id', 'category', 'developers'])
            ->chunkById(2000, function ($chunk) use (&$tags, &$developers, $eligibleIds, $count) {
                foreach ($chunk as $participant) {
                    $eligible = isset($eligibleIds[$participant->id]);

                    if (filled($participant->category)) {
                        $count($tags, $participant->category, $eligible);
                    }

                    foreach ((array) $participant->developers as $developer) {
                        $count($developers, $developer, $eligible);
                    }
                }
            });

        // Biggest groups first, so the usual picks are at the top.
        $sorted = fn (array $groups) => collect($groups)->sortBy([['total', 'desc'], ['value', 'asc']])->values()->all();

        return ['tags' => $sorted($tags), 'developers' => $sorted($developers)];
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
            Raffle::markTicketsWon(Raffle::stagedTickets());

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
     * Eligible entries: imported into this raffle, inside the pool the raffle
     * is drawn from (its chosen tags or developers, if any), not disqualified
     * or excluded, and — unless repeat winners are explicitly allowed — not
     * already a winner here.
     */
    protected function eligibleEntriesQuery(Raffle $raffle, bool $withinPool = true, ?RafflePrize $prize = null): Builder
    {
        $query = Participant::query()
            ->where('participants.raffle_id', $raffle->id)
            ->whereNotIn('participants.status', ParticipantStatus::ineligible());

        // A raffle with prize tiers draws under the next tier's rules.
        $prize ??= $raffle->nextPrize();
        $pool = $withinPool ? ($prize ? $prize->drawPool() : $raffle->drawPool()) : null;

        Raffle::applyPool($query, $pool);

        // Anyone pre-selected as a winner in another raffle has already won.
        $staged = Raffle::stagedTickets($raffle->id);

        if ($staged !== []) {
            $query->whereNotIn('participants.ticket_number', $staged);
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
