<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Participant;
use App\Models\Raffle;
use App\Models\ReservedPick;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The reserved pick: one person who never comes up in a random draw and
 * wins only when armed for a raffle. Read and set from the Control Center.
 */
class ReservedPickController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->payload(ReservedPick::current(), $request->integer('raffle') ?: null)]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:160'],
            'ticket_number' => ['nullable', 'string', 'max:64'],
            'armed_raffle_id' => ['nullable', 'integer', 'exists:raffles,id'],
        ]);

        $pick = ReservedPick::current();
        $pick->fill([
            'name' => trim((string) ($validated['name'] ?? '')) ?: null,
            'ticket_number' => trim((string) ($validated['ticket_number'] ?? '')) ?: null,
        ]);

        if (array_key_exists('armed_raffle_id', $validated)) {
            $raffleId = $validated['armed_raffle_id'];
            $pick->armed_raffle_id = $raffleId;
            $pick->armed_position = null;

            if ($raffleId !== null) {
                $slot = ReservedPick::slotFor(Raffle::query()->findOrFail($raffleId));

                if ($slot === null) {
                    return response()->json(['message' => 'Every winner of this raffle is already drawn.'], 422);
                }

                $pick->armed_position = $slot;
            }
        }

        if (! $pick->isSet()) {
            $pick->armed_raffle_id = null;
            $pick->armed_position = null;
        }

        $pick->save();

        return response()->json(['data' => $this->payload($pick, $request->integer('raffle') ?: null)]);
    }

    /** @return array<string, mixed> */
    protected function payload(ReservedPick $pick, ?int $raffleId): array
    {
        $inRaffle = null;

        if ($raffleId !== null && $pick->isSet()) {
            $inRaffle = Participant::query()->where('participants.raffle_id', $raffleId)->tap(fn ($q) => $pick->matchParticipants($q))->exists();
        }

        return [
            'name' => $pick->name,
            'ticket_number' => $pick->ticket_number,
            'armed_raffle_id' => $pick->armed_raffle_id,
            'armed_position' => $pick->armed_position,
            'armed_raffle_name' => $pick->armed_raffle_id ? Raffle::query()->whereKey($pick->armed_raffle_id)->value('name') : null,
            // Whether the person is on the given raffle's participant list.
            'in_raffle' => $inRaffle,
        ];
    }
}
