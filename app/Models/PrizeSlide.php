<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One prize for the Prize Display — the screen used for raffles drawn by
 * hand, which shows only the prize. At most one is live at a time.
 */
class PrizeSlide extends Model
{
    protected $fillable = [
        'title',
        'prize_name',
        'prize_type',
        'prize_value',
        'prize_currency',
        'logos',
        'is_live',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'prize_value' => 'decimal:2',
            'logos' => 'array',
            'is_live' => 'boolean',
        ];
    }
}
