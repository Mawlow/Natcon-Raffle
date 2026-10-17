<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One prize for the Prize Display — the screen used for raffles drawn by
 * hand, which shows only the prize. At most one is live at a time.
 */
class PrizeSlide extends Model
{
    protected $fillable = [
        'raffle_id',
        'title',
        'prize_name',
        'prize_type',
        'prize_value',
        'prize_currency',
        'logos',
        'logo_left',
        'logo_right',
        'image',
        'spin',
        'is_live',
        'position',
    ];

    /**
     * The raffle this prize is saved as: made when the first winner goes up,
     * it holds the winners announced on stage like a raffle drawn here.
     */
    public function raffle(): BelongsTo
    {
        return $this->belongsTo(Raffle::class);
    }

    /** The winners announced on stage so far, in the order they were put up. */
    public function winners(): HasMany
    {
        return $this->hasMany(PrizeSlideWinner::class)->orderBy('position')->orderBy('id');
    }

    /** The photo as the screen loads it, served from the public disk at /storage. */
    public function imageUrl(): ?string
    {
        return $this->image ? '/storage/'.ltrim($this->image, '/') : null;
    }

    protected function casts(): array
    {
        return [
            'prize_value' => 'decimal:2',
            'logos' => 'array',
            'is_live' => 'boolean',
            'spin' => 'boolean',
        ];
    }
}
