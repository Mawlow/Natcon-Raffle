<?php

namespace App\Http\Controllers\Api;

use App\Enums\RaffleStatus;
use App\Http\Controllers\Controller;
use App\Models\Raffle;
use App\Models\RafflePrize;
use App\Models\Winner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * A raffle's prize list — how many winners, what they win and who can win
 * it, drawn top to bottom — saved as a whole from the Control Center.
 *
 * The raffle's number of winners follows the list. Prizes that already have
 * winners stay: they cannot be removed or cut below the winners they have.
 */
class RafflePrizeController extends Controller
{
    public const MAX_WINNERS = 500;

    /** The rules for a prize list; `prizes` is required with at least `$min` prizes. */
    public static function rules(int $min = 0): array
    {
        return [
            'prizes' => [$min > 0 ? 'required' : 'present', 'array', 'min:'.$min, 'max:50'],
            'prizes.*.id' => ['nullable', 'integer'],
            'prizes.*.winners_count' => ['required', 'integer', 'min:1', 'max:'.self::MAX_WINNERS],
            'prizes.*.prize_name' => ['required', 'string', 'max:160'],
            'prizes.*.prize_type' => ['nullable', Rule::in(['cash', 'item'])],
            'prizes.*.prize_value' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'prizes.*.prize_currency' => ['nullable', 'string', 'max:8'],
            'prizes.*.draw_filter' => ['nullable', 'array'],
            'prizes.*.draw_filter.type' => ['nullable', Rule::in(['all', 'tag', 'developer', 'location', 'both'])],
            'prizes.*.draw_filter.tags' => ['nullable', 'array', 'max:100'],
            'prizes.*.draw_filter.tags.*' => ['string', 'max:160'],
            'prizes.*.draw_filter.developers' => ['nullable', 'array', 'max:100'],
            'prizes.*.draw_filter.developers.*' => ['string', 'max:160'],
            'prizes.*.draw_filter.locations' => ['nullable', 'array', 'max:100'],
            'prizes.*.draw_filter.locations.*' => ['string', 'max:160'],
            'prizes.*.draw_filter.values' => ['nullable', 'array', 'max:100'],
            'prizes.*.draw_filter.values.*' => ['string', 'max:160'],
            'prizes.*.include_previous_winners' => ['boolean'],
        ];
    }

    public static function messages(): array
    {
        return [
            'prizes.min' => 'Add at least one prize.',
            'prizes.*.prize_name.required' => 'Every prize needs a name.',
            'prizes.*.winners_count.min' => 'Every prize needs at least one winner.',
        ];
    }

    /** A new prize row's attributes, from a validated request row. */
    public static function attributes(array $row, int $order): array
    {
        return [
            'sort_order' => $order,
            'winners_count' => $row['winners_count'],
            'prize_name' => trim($row['prize_name']),
            'prize_type' => $row['prize_type'] ?? 'cash',
            'prize_value' => $row['prize_value'] ?? null,
            'prize_currency' => $row['prize_currency'] ?? 'PHP',
            'draw_filter' => Raffle::normalisePool($row['draw_filter'] ?? null),
            'include_previous_winners' => (bool) ($row['include_previous_winners'] ?? false),
        ];
    }

    public function update(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('update', $raffle);

        $validated = $request->validate(self::rules(), self::messages());

        $rows = $validated['prizes'];
        $total = array_sum(array_column($rows, 'winners_count'));

        if ($total > self::MAX_WINNERS) {
            return response()->json(['message' => 'A raffle can have at most '.self::MAX_WINNERS.' winners across all its prizes.'], 422);
        }

        if ($raffle->isLocked()) {
            return $this->lockedResponse($raffle, 'its prizes cannot be changed');
        }

        if ($rows !== [] && $raffle->hasStagedWinners()) {
            return response()->json(['message' => 'This raffle has pre-selected winners, each with their own prize. Clear that list first to use a prize list.'], 422);
        }

        // Not while a winner is being drawn.
        $lock = Cache::lock("raffle-draw:{$raffle->id}", 15);

        if (! $lock->get()) {
            return response()->json(['message' => 'A draw is in progress. Save the prizes again in a moment.'], 409);
        }

        try {
            return DB::transaction(function () use ($raffle, $rows, $total) {
                $existing = $raffle->prizes()->lockForUpdate()->get()->keyBy('id');
                $drawn = Winner::query()
                    ->where('raffle_id', $raffle->id)
                    ->whereNotNull('raffle_prize_id')
                    ->selectRaw('raffle_prize_id, count(*) as total')
                    ->groupBy('raffle_prize_id')
                    ->pluck('total', 'raffle_prize_id');
                $kept = [];

                foreach ($rows as $row) {
                    $id = $row['id'] ?? null;

                    if ($id !== null && ! $existing->has($id)) {
                        return response()->json(['message' => 'One of the prizes no longer exists. Reload and try again.'], 422);
                    }

                    if ($id !== null && $row['winners_count'] < ($drawn[$id] ?? 0)) {
                        return response()->json([
                            'message' => sprintf('"%s" already has %d winners, so it cannot have fewer.', $existing[$id]->prize_name, $drawn[$id]),
                        ], 422);
                    }

                    $kept[] = $id;
                }

                foreach ($existing->except(array_filter($kept)) as $removed) {
                    if (($drawn[$removed->id] ?? 0) > 0) {
                        return response()->json([
                            'message' => sprintf('"%s" already has winners, so it cannot be removed. Use Redraw to start over.', $removed->prize_name),
                        ], 422);
                    }

                    $removed->delete();
                }

                foreach ($rows as $order => $row) {
                    $attributes = self::attributes($row, $order);

                    isset($row['id'])
                        ? $existing[$row['id']]->update($attributes)
                        : $raffle->prizes()->create($attributes);
                }

                // The raffle's number of winners follows the prize list, and
                // its status follows whether every place is now filled.
                if ($rows !== []) {
                    $winners = $raffle->winners()->count();
                    $status = $raffle->status;

                    if ($winners >= $total && $winners > 0) {
                        $status = RaffleStatus::Completed;
                    } elseif ($status === RaffleStatus::Completed) {
                        $status = $winners > 0 ? RaffleStatus::Live : RaffleStatus::Ready;
                    }

                    $raffle->forceFill([
                        'winners_count' => $total,
                        'status' => $status,
                        'completed_at' => $status === RaffleStatus::Completed ? ($raffle->completed_at ?? now()) : null,
                    ])->save();
                }

                return response()->json([
                    'message' => 'Prizes saved.',
                    'data' => [
                        'prizes' => $raffle->refresh()->prizeList(),
                        'winners_count' => (int) $raffle->winners_count,
                        'status' => $raffle->status->value,
                    ],
                ]);
            });
        } finally {
            $lock->release();
        }
    }
}
