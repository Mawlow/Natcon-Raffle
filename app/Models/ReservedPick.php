<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The reserved pick: one person who never comes up in a random draw and
 * wins only when the operator arms the pick for a raffle. A single row.
 */
class ReservedPick extends Model
{
    protected $fillable = ['name', 'ticket_number', 'armed_raffle_id', 'armed_position'];

    public static function current(): self
    {
        return static::query()->firstOrCreate([]);
    }

    public function armedRaffle(): BelongsTo
    {
        return $this->belongsTo(Raffle::class, 'armed_raffle_id');
    }

    /** Whether a person is set at all. */
    public function isSet(): bool
    {
        return trim((string) $this->ticket_number) !== '' && trim((string) $this->name) !== '';
    }

    public function isArmedFor(Raffle|int $raffle): bool
    {
        return $this->isSet() && $this->armed_raffle_id !== null
            && (int) $this->armed_raffle_id === (int) ($raffle instanceof Raffle ? $raffle->id : $raffle);
    }

    /** Narrow a participants query to this person. */
    public function matchParticipants(Builder $query): Builder
    {
        return $query
            ->whereRaw('LOWER(TRIM(participants.ticket_number)) = ?', [mb_strtolower(trim((string) $this->ticket_number))])
            ->whereRaw('LOWER(TRIM(participants.name)) = ?', [mb_strtolower(trim((string) $this->name))]);
    }

    /** Take this person out of a participants query. */
    public function excludeFrom(Builder $query): Builder
    {
        if (! $this->isSet()) {
            return $query;
        }

        return $query->whereNot(fn (Builder $q) => $this->matchParticipants($q));
    }

    /**
     * The slot the pick comes out in for a raffle: the 3rd or 4th winner,
     * never the first and never the last. A raffle with too few winners for
     * that takes the latest slot it can. Null when every slot is filled.
     */
    public static function slotFor(Raffle $raffle): ?int
    {
        $total = max(1, (int) $raffle->winners_count);
        $drawn = (int) $raffle->winners()->count();

        if ($drawn >= $total) {
            return null;
        }

        if ($total <= 2) {
            // No slot that is neither first nor last: take the last one.
            $slot = $total;
        } else {
            $middle = array_values(array_filter([3, 4], fn (int $p) => $p <= $total - 1));
            $slot = $middle === [] ? 2 : $middle[random_int(0, count($middle) - 1)];
        }

        // Already past that slot: the next draw, as long as it is not the last.
        $slot = max($slot, $drawn + 1);

        return min($slot, $total);
    }

    /** Whether the draw landing in this position is the pick's. */
    public function takesPosition(int $position): bool
    {
        return $this->armed_position === null || $position >= (int) $this->armed_position;
    }

    public function disarm(): void
    {
        if ($this->armed_raffle_id !== null || $this->armed_position !== null) {
            $this->forceFill(['armed_raffle_id' => null, 'armed_position' => null])->save();
        }
    }
}
