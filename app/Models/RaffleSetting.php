<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RaffleSetting extends Model
{
    protected $fillable = [
        'raffle_id',
        'sound_countdown',
        'sound_drawing',
        'sound_winner',
        'sound_celebration',
        'show_confetti',
        'countdown_seconds',
        'roll_duration_ms',
        'draw_mode',
    ];

    protected function casts(): array
    {
        return [
            'sound_countdown' => 'boolean',
            'sound_drawing' => 'boolean',
            'sound_winner' => 'boolean',
            'sound_celebration' => 'boolean',
            'show_confetti' => 'boolean',
            'countdown_seconds' => 'integer',
            'roll_duration_ms' => 'integer',
            'draw_mode' => 'string',
        ];
    }

    public function raffle(): BelongsTo
    {
        return $this->belongsTo(Raffle::class);
    }
}
