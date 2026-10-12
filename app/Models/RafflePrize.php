<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One prize tier of a raffle: how many winners, what they win, and who can
 * win it. Tiers are drawn in `sort_order`; the next winner always comes from
 * the first tier that still has a place left.
 */
class RafflePrize extends Model
{
    protected $fillable = [
        'raffle_id',
        'sort_order',
        'winners_count',
        'prize_name',
        'prize_type',
        'prize_value',
        'prize_currency',
        'draw_filter',
        'include_previous_winners',
    ];

    protected function casts(): array
    {
        return [
            'winners_count' => 'integer',
            'prize_value' => 'decimal:2',
            'draw_filter' => 'array',
            'include_previous_winners' => 'boolean',
        ];
    }

    public function raffle(): BelongsTo
    {
        return $this->belongsTo(Raffle::class);
    }

    public function winners(): HasMany
    {
        return $this->hasMany(Winner::class);
    }

    /** @return array{type: string, values: array<int, string>}|null */
    public function drawPool(): ?array
    {
        return Raffle::normalisePool($this->draw_filter);
    }

    public function drawPoolLabel(): string
    {
        return Raffle::poolLabel($this->drawPool());
    }

    /** What the screens and the Control Center show for this tier. */
    public function toDisplayArray(int $drawn = 0): array
    {
        return [
            'id' => $this->id,
            'winners_count' => (int) $this->winners_count,
            'winners_drawn' => $drawn,
            'prize_name' => $this->prize_name,
            'prize_type' => $this->prize_type ?? 'cash',
            'prize_value' => $this->prize_value !== null ? (float) $this->prize_value : null,
            'prize_currency' => $this->prize_currency,
            'draw_filter' => $this->drawPool(),
            'draw_pool_label' => $this->drawPoolLabel(),
            'include_previous_winners' => (bool) $this->include_previous_winners,
        ];
    }
}
