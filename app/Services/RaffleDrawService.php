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

                $eligible = $this->eligibleEntriesQuery($locked);
                $eligibleCount = (clone $eligible)->count();

                if ($eligibleCount === 0) {
                    throw DrawException::noEligibleParticipants('No eligible tickets remain.');
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
                    'message' => sprintf('Winner #%d drawn.', $position),
                    'eligible_count' => $eligibleCount,
                    'request_id' => $requestId,
                    'ip_address' => $ipAddress,
                    'context' => [
                        'allow_repeat_winners' => $locked->allow_repeat_winners,
                        'winners_count' => $locked->winners_count,
                        'selection_offset' => $offset,
                    ],
                ]);

                $winner = Winner::create([
                    'raffle_id' => $locked->id,
                    'participant_id' => $selected->id,
                    'draw_event_id' => $drawEvent->id,
                    'ticket_number' => $selected->ticket_number,
                    'position' => $position,
                    'drawn_at' => Carbon::now(),
                    'drawn_by' => $user?->id,
                ]);

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
     * Draw every remaining winner slot in sequence.
     *
     * @return array<int, DrawOutcome>
     */
    public function drawAll(Raffle $raffle, ?User $user = null, ?string $requestId = null, ?string $ipAddress = null): array
    {
        $outcomes = [];

        while ($raffle->fresh()->remainingWinnerSlots() > 0) {
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
     * Eligible entries: imported into this raffle, not disqualified or
     * excluded, and — unless repeat winners are explicitly allowed — not
     * already a winner here.
     */
    protected function eligibleEntriesQuery(Raffle $raffle): Builder
    {
        $query = Participant::query()
            ->where('participants.raffle_id', $raffle->id)
            ->whereNotIn('participants.status', ParticipantStatus::ineligible());

        if (! $raffle->allow_repeat_winners) {
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
