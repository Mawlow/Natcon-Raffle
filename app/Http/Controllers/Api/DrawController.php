<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\DrawException;
use App\Http\Controllers\Controller;
use App\Models\Raffle;
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
}
