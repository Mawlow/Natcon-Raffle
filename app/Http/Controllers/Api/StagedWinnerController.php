<?php

namespace App\Http\Controllers\Api;

use App\Enums\RaffleStatus;
use App\Http\Controllers\Controller;
use App\Exceptions\DrawException;
use App\Models\Raffle;
use App\Services\RaffleDrawService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Pre-selected winners — for a raffle whose winners were chosen before the
 * event. The operator lists them in order with the prize each one won, and
 * the draw on the screens reveals them one after another. Saved as a whole
 * from the Control Center; an empty list turns the raffle back into an
 * ordinary random draw.
 *
 * The raffle's number of winners follows the list. Winners already revealed
 * keep their place: the list cannot be cut below them.
 */
class StagedWinnerController extends Controller
{
    public function show(Raffle $raffle): JsonResponse
    {
        $this->authorize('view', $raffle);

        return response()->json([
            'data' => $raffle->stagedWinnerList(),
            // Who already won elsewhere (ticket => where), so they cannot be picked.
            'won_elsewhere' => (object) $raffle->ticketsWonElsewhere(),
            // How many have not won anything yet: they are picked first. Null
            // when the day puts everyone back in.
            'still_to_win' => $raffle->stillToWinCount(),
        ]);
    }

    /**
     * Fills an open place on the list at random — a listed winner was taken
     * off — from one developer's people, or the raffle's own pool.
     */
    public function fill(Request $request, Raffle $raffle, RaffleDrawService $draws): JsonResponse
    {
        $this->authorize('update', $raffle);

        $validated = $request->validate([
            'developer' => ['nullable', 'string', 'max:160'],
            'prize_name' => ['required', 'string', 'max:160'],
            // The ticket just taken off: not picked again for its own place.
            'exclude_ticket' => ['nullable', 'string', 'max:64'],
        ]);

        if ($raffle->isLocked()) {
            return $this->lockedResponse($raffle, 'its pre-selected winners cannot be changed');
        }

        $lock = Cache::lock("raffle-draw:{$raffle->id}", 15);

        if (! $lock->get()) {
            return response()->json(['message' => 'A draw is in progress. Try again in a moment.'], 409);
        }

        try {
            $picked = $draws->fillStagedPlace($raffle, $validated['developer'] ?: null, trim($validated['prize_name']), $request->user(), $request->ip(), $validated['exclude_ticket'] ?? null);

            return response()->json([
                'message' => sprintf('%s (ticket %s) is winner #%d. Press DRAW to reveal them on the wall.', $picked['name'] ?: 'A participant', $picked['ticket_number'], $picked['position']),
                'data' => $picked,
            ]);
        } catch (DrawException $e) {
            return response()->json(['message' => $e->getMessage(), 'code' => $e->result->value], $e->status);
        } finally {
            $lock->release();
        }
    }

    public function update(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('update', $raffle);

        $validated = $request->validate([
            'winners' => ['present', 'array', 'max:'.RafflePrizeController::MAX_WINNERS],
            'winners.*.participant_id' => ['required', 'integer', 'distinct'],
            'winners.*.prize_name' => ['required', 'string', 'max:160'],
        ], [
            'winners.*.participant_id.distinct' => 'The same person is listed twice.',
            'winners.*.prize_name.required' => 'Every winner needs a prize.',
        ]);

        $rows = array_map(fn (array $row) => [
            'participant_id' => (int) $row['participant_id'],
            'prize_name' => trim($row['prize_name']),
        ], $validated['winners']);

        if ($raffle->isLocked()) {
            return $this->lockedResponse($raffle, 'its pre-selected winners cannot be changed');
        }

        // A pre-draw kept from a drawn raffle still has that raffle's prize
        // list, for the record; its winners carry their prizes as text.
        if ($rows !== [] && ! $raffle->is_predraw && $raffle->prizes()->exists()) {
            return response()->json(['message' => 'This raffle has a prize list. Remove it first to use pre-selected winners.'], 422);
        }

        $found = $raffle->participants()->whereIn('id', array_column($rows, 'participant_id'))->count();

        if ($found !== count($rows)) {
            return response()->json(['message' => 'One of the winners is no longer in the participant list. Reload and try again.'], 422);
        }

        // Anyone who already won — on another pre-draw, or in another draw —
        // cannot win again.
        $elsewhere = $raffle->participants()
            ->whereIn('id', array_column($rows, 'participant_id'))
            ->whereIn('ticket_number', array_map('strval', array_keys($raffle->ticketsWonElsewhere())))
            ->pluck('name')
            ->map(fn ($name) => $name ?: 'A participant')
            ->all();

        if ($elsewhere !== []) {
            return response()->json([
                'message' => sprintf(
                    '%s already won in another draw.',
                    implode(', ', array_slice($elsewhere, 0, 5)).(count($elsewhere) > 5 ? ' and '.(count($elsewhere) - 5).' more' : ''),
                ),
            ], 422);
        }

        // Not while a winner is being drawn.
        $lock = Cache::lock("raffle-draw:{$raffle->id}", 15);

        if (! $lock->get()) {
            return response()->json(['message' => 'A draw is in progress. Save the winners again in a moment.'], 409);
        }

        try {
            return DB::transaction(function () use ($raffle, $rows) {
                $locked = Raffle::query()->whereKey($raffle->id)->lockForUpdate()->firstOrFail();
                $before = $locked->stagedTicketNumbers();
                $revealed = $locked->winners()->get(['participant_id', 'position']);

                if ($rows !== [] && count($rows) < $revealed->count()) {
                    return response()->json([
                        'message' => sprintf('%d winners are already revealed, so the list needs at least %d.', $revealed->count(), $revealed->count()),
                    ], 422);
                }

                // Winners already on the screens stay who they are.
                foreach ($revealed as $winner) {
                    $row = $rows[$winner->position - 1] ?? null;

                    if ($rows !== [] && $row && $row['participant_id'] !== (int) $winner->participant_id) {
                        return response()->json([
                            'message' => sprintf('Winner #%d is already revealed, so they cannot be changed. Use Redraw to start over.', $winner->position),
                        ], 422);
                    }
                }

                $attributes = ['staged_winners' => $rows === [] ? null : $rows];

                // The raffle's number of winners follows the list, and its
                // status follows whether every place is now filled.
                if ($rows !== []) {
                    $total = count($rows);
                    $winners = $revealed->count();
                    $status = $locked->status;

                    if ($winners >= $total && $winners > 0) {
                        $status = RaffleStatus::Completed;
                    } elseif ($status === RaffleStatus::Completed) {
                        $status = $winners > 0 ? RaffleStatus::Live : RaffleStatus::Ready;
                    }

                    $attributes += [
                        'winners_count' => $total,
                        'status' => $status,
                        'completed_at' => $status === RaffleStatus::Completed ? ($locked->completed_at ?? now()) : null,
                    ];
                }

                $locked->forceFill($attributes)->save();

                // Picked is won: they show as winners in every participant
                // list straight away. Anyone taken off is back in play.
                $after = $locked->stagedTicketNumbers();
                $locked->markTicketsWon($after);
                $locked->releaseTickets(array_values(array_diff($before, $after)));

                return response()->json([
                    'message' => 'Pre-selected winners saved.',
                    'data' => [
                        'staged_winners' => $locked->stagedWinnerList(),
                        'winners_count' => (int) $locked->winners_count,
                        'status' => $locked->status->value,
                    ],
                ]);
            });
        } finally {
            $lock->release();
        }
    }
}
