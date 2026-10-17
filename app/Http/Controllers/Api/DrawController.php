<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\DrawException;
use App\Http\Controllers\Controller;
use App\Models\Raffle;
use App\Enums\RaffleStatus;
use App\Models\Winner;
use App\Services\RaffleDrawService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * The only endpoint that can produce a winner.
 *
 * The client sends no candidate ticket — it receives one.
 */
class DrawController extends Controller
{
    public function __construct(protected RaffleDrawService $draws) {}

    public function store(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('draw', $raffle);

        $validated = $request->validate([
            // Idempotency key: a retried request returns the original result
            // instead of burning a second winner slot.
            'request_id' => ['nullable', 'string', 'max:64', 'regex:/^[A-Za-z0-9\-_]+$/'],
        ]);

        $requestId = $validated['request_id'] ?? (string) Str::uuid();
        $lockKey = "raffle-draw:{$raffle->id}";
        $lock = Cache::lock($lockKey, 15);

        if (! $lock->get()) {
            return response()->json([
                'message' => 'A draw for this raffle is already in progress.',
                'code' => 'DRAW_IN_PROGRESS',
            ], 409);
        }

        try {
            $replayKey = "raffle-draw-request:{$raffle->id}:{$requestId}";

            if ($cached = Cache::get($replayKey)) {
                return response()->json(['data' => $cached, 'replayed' => true]);
            }

            $outcome = $this->draws->draw($raffle, $request->user(), $requestId, $request->ip());
            $payload = $outcome->toPublicArray();

            Cache::put($replayKey, $payload, now()->addMinutes(10));

            return response()->json(['data' => $payload], 201);
        } catch (DrawException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => $e->result->value,
            ], $e->status);
        } finally {
            $lock->release();
        }
    }

    /**
     * Draw every remaining winner in one go, for the "one drumroll, all
     * revealed together" mode. Shares the single draw's lock and replay
     * cache, so a retried request returns the same winners.
     */
    public function storeAll(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('draw', $raffle);

        $validated = $request->validate([
            'request_id' => ['nullable', 'string', 'max:64', 'regex:/^[A-Za-z0-9\-_]+$/'],
        ]);

        $requestId = $validated['request_id'] ?? (string) Str::uuid();
        $lock = Cache::lock("raffle-draw:{$raffle->id}", 30);

        if (! $lock->get()) {
            return response()->json([
                'message' => 'A draw for this raffle is already in progress.',
                'code' => 'DRAW_IN_PROGRESS',
            ], 409);
        }

        try {
            $replayKey = "raffle-draw-all-request:{$raffle->id}:{$requestId}";

            if ($cached = Cache::get($replayKey)) {
                return response()->json(['data' => $cached, 'replayed' => true]);
            }

            $outcomes = $this->draws->drawAll($raffle, $request->user(), $requestId, $request->ip());

            if ($outcomes === []) {
                return response()->json([
                    'message' => 'All winners have already been drawn.',
                    'code' => 'ALL_WINNERS_DRAWN',
                ], 409);
            }

            $last = end($outcomes);
            $payload = [
                'winners' => array_map(fn ($outcome) => $outcome->toPublicArray(), $outcomes),
                'remaining_slots' => $last->remainingSlots,
                'raffle_completed' => $last->raffleCompleted,
                'raffle_status' => $last->raffle->status->value,
            ];

            Cache::put($replayKey, $payload, now()->addMinutes(10));

            return response()->json(['data' => $payload], 201);
        } catch (DrawException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => $e->result->value,
            ], $e->status);
        } finally {
            $lock->release();
        }
    }

    /**
     * Clear the raffle's winners so it can be drawn again. Shares the draw's
     * lock, so a redraw can never land in the middle of a draw.
     */
    public function redraw(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('draw', $raffle);

        $validated = $request->validate([
            'include_previous_winners' => ['required', 'boolean'],
            // Optional: how many winners the new draw should have. Any number
            // works, fewer or more than before — the old winners are cleared.
            'winners_count' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        $lock = Cache::lock("raffle-draw:{$raffle->id}", 15);

        if (! $lock->get()) {
            return response()->json([
                'message' => 'A draw for this raffle is in progress. Try the redraw again in a moment.',
                'code' => 'DRAW_IN_PROGRESS',
            ], 409);
        }

        try {
            $result = $this->draws->redraw(
                $raffle,
                $request->user(),
                (bool) $validated['include_previous_winners'],
                $request->ip(),
                isset($validated['winners_count']) ? (int) $validated['winners_count'] : null,
            );

            return response()->json([
                'message' => 'The raffle is ready to be drawn again.',
                'data' => $result,
            ]);
        } catch (DrawException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => $e->result->value,
            ], $e->status);
        } finally {
            $lock->release();
        }
    }

    /**
     * Play a raffle with pre-selected winners again: the revealed winners are
     * cleared and the next draws reveal the same winners in the same order.
     */
    public function replay(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('draw', $raffle);

        $lock = Cache::lock("raffle-draw:{$raffle->id}", 15);

        if (! $lock->get()) {
            return response()->json([
                'message' => 'A draw for this raffle is in progress. Try again in a moment.',
                'code' => 'DRAW_IN_PROGRESS',
            ], 409);
        }

        try {
            $result = $this->draws->replay($raffle, $request->user(), $request->ip());

            return response()->json([
                'message' => 'Ready to play again: the draw reveals the same winners.',
                'data' => $result,
            ]);
        } catch (DrawException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => $e->result->value,
            ], $e->status);
        } finally {
            $lock->release();
        }
    }

    /**
     * Who the very next draw picks from: one developer, for a replacement
     * after a winner was taken off — or nobody in particular (null) to go
     * back to the raffle's own pool. Cleared by itself once that draw is made.
     */
    public function nextDrawPool(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('draw', $raffle);

        $validated = $request->validate(['developer' => ['nullable', 'string', 'max:160']]);
        $developer = $validated['developer'] ?? null;

        $raffle->forceFill(['next_draw_pool' => $developer ? ['type' => 'developer', 'values' => [$developer]] : null])->save();

        return response()->json([
            'message' => $developer
                ? sprintf('The next draw picks from %s only. Press DRAW on the wall to reveal them.', $developer)
                : 'The next draw picks from the raffle\'s own pool again.',
            'data' => ['next_draw_pool_label' => $developer ? Raffle::poolLabel(['type' => 'developer', 'values' => [$developer]]) : null],
        ]);
    }

    /**
     * Fills the open place at random right now — no draw on the wall — from
     * one developer, or the raffle's own pool: a winner taken off a finished
     * raffle is replaced from the Control Center.
     */
    public function replaceWinner(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('draw', $raffle);

        $validated = $request->validate([
            'developer' => ['nullable', 'string', 'max:160'],
            'prize_name' => ['nullable', 'string', 'max:160'],
            'exclude_ticket' => ['nullable', 'string', 'max:64'],
        ]);

        $lock = Cache::lock("raffle-draw:{$raffle->id}", 15);

        if (! $lock->get()) {
            return response()->json(['message' => 'A draw for this raffle is in progress. Try again in a moment.', 'code' => 'DRAW_IN_PROGRESS'], 409);
        }

        try {
            $picked = $this->draws->replaceWinner($raffle, $validated['developer'] ?: null, $validated['prize_name'] ?? null, $request->user(), $request->ip(), $validated['exclude_ticket'] ?? null);

            return response()->json([
                'message' => sprintf('%s (ticket %s) is now winner #%d. The screens show the new list.', $picked['name'] ?: 'A participant', $picked['ticket_number'], $picked['position']),
                'data' => $picked,
            ]);
        } catch (DrawException $e) {
            return response()->json(['message' => $e->getMessage(), 'code' => $e->result->value], $e->status);
        } finally {
            $lock->release();
        }
    }

    /** Takes one winner — by their place, #1, #2, … — off a raffle, leaving a place open for a replacement. */
    public function removeWinner(Request $request, Raffle $raffle, int $position): JsonResponse
    {
        $this->authorize('draw', $raffle);

        $winner = Winner::query()->where('raffle_id', $raffle->id)->where('position', $position)->first();

        if ($winner === null) {
            return response()->json(['message' => sprintf('There is no winner #%d in this raffle.', $position)], 404);
        }

        $lock = Cache::lock("raffle-draw:{$raffle->id}", 15);

        if (! $lock->get()) {
            return response()->json([
                'message' => 'A draw for this raffle is in progress. Try again in a moment.',
                'code' => 'DRAW_IN_PROGRESS',
            ], 409);
        }

        try {
            $result = $this->draws->removeWinner($raffle, $winner, $request->user(), $request->ip());

            return response()->json([
                'message' => $result['status'] === RaffleStatus::Completed->value
                    ? sprintf('Ticket %s is no longer a winner.', $result['removed'])
                    : sprintf('Ticket %s is no longer a winner. Draw again on the main screen for the replacement.', $result['removed']),
                'data' => $result,
            ]);
        } catch (DrawException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => $e->result->value,
            ], $e->status);
        } finally {
            $lock->release();
        }
    }

    /**
     * Swap two winners — between two raffles, or two places of one. Each
     * takes the other's place and prize. A locked raffle needs the owner PIN.
     */
    public function swapWinners(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'a.raffle_id' => ['required', 'integer', 'exists:raffles,id'],
            'a.position' => ['required', 'integer', 'min:1'],
            'b.raffle_id' => ['required', 'integer', 'exists:raffles,id'],
            'b.position' => ['required', 'integer', 'min:1'],
            'pin' => ['nullable', 'string', 'max:64'],
        ]);

        $a = Raffle::query()->findOrFail($validated['a']['raffle_id']);
        $b = Raffle::query()->findOrFail($validated['b']['raffle_id']);
        $this->authorize('draw', $a);
        $this->authorize('draw', $b);

        if ($a->isLocked() || $b->isLocked()) {
            $pin = (string) config('raffle.owner_pin');

            if ($pin === '') {
                return response()->json(['message' => 'No owner PIN is set. Put RAFFLE_OWNER_PIN in the .env file first.'], 422);
            }

            if (! hash_equals($pin, trim((string) ($validated['pin'] ?? '')))) {
                return response()->json(['message' => ($a->isLocked() ? $a : $b)->name.' is locked: enter the owner PIN to swap its winner.', 'code' => 'RAFFLE_LOCKED'], 423);
            }
        }

        $locks = [];

        foreach (array_unique([$a->id, $b->id]) as $id) {
            $lock = Cache::lock("raffle-draw:{$id}", 15);

            if (! $lock->get()) {
                foreach ($locks as $held) {
                    $held->release();
                }

                return response()->json(['message' => 'A draw for one of these raffles is in progress. Try again in a moment.', 'code' => 'DRAW_IN_PROGRESS'], 409);
            }

            $locks[] = $lock;
        }

        try {
            $result = $this->draws->swapWinners($a, (int) $validated['a']['position'], $b, (int) $validated['b']['position'], $request->user(), $request->ip());

            return response()->json(['message' => 'Winners swapped.', 'data' => $result]);
        } catch (DrawException $e) {
            return response()->json(['message' => $e->getMessage(), 'code' => $e->result->value], $e->status);
        } finally {
            foreach ($locks as $lock) {
                $lock->release();
            }
        }
    }

    /**
     * Undo the raffle's latest redraw, with the owner PIN: the winners it
     * cleared come back from the draw log and anyone drawn since is cleared.
     * For a redraw pressed by mistake — when one winner was meant to be
     * taken off and replaced, not everyone cleared.
     */
    public function undoRedraw(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('draw', $raffle);

        $validated = $request->validate(['pin' => ['required', 'string', 'max:64']]);
        $pin = (string) config('raffle.owner_pin');

        if ($pin === '') {
            return response()->json(['message' => 'No owner PIN is set. Put RAFFLE_OWNER_PIN in the .env file first.'], 422);
        }

        if (! hash_equals($pin, trim($validated['pin']))) {
            return response()->json(['message' => 'Wrong PIN.'], 403);
        }

        $lock = Cache::lock("raffle-draw:{$raffle->id}", 15);

        if (! $lock->get()) {
            return response()->json([
                'message' => 'A draw for this raffle is in progress. Try again in a moment.',
                'code' => 'DRAW_IN_PROGRESS',
            ], 409);
        }

        try {
            $result = $this->draws->undoRedraw($raffle, $request->user(), $request->ip());
            $open = $result['winners_count'] - $result['restored'];

            return response()->json([
                'message' => sprintf(
                    '%d winner%s restored%s.%s',
                    $result['restored'],
                    $result['restored'] === 1 ? '' : 's',
                    $result['cleared'] > 0 ? sprintf(' and the %d drawn since cleared', $result['cleared']) : '',
                    $open > 0 ? sprintf(' %d place%s open: draw on the main screen for the replacement.', $open, $open === 1 ? ' is' : 's are') : '',
                ),
                'data' => $result,
            ]);
        } catch (DrawException $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'code' => $e->result->value,
            ], $e->status);
        } finally {
            $lock->release();
        }
    }
}
