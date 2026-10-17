<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One winner of a prize drawn by hand on stage, as announced by the host
 * and put on the Prize Display by the operator (see PrizeSlide).
 */
class PrizeSlideWinner extends Model
{
    protected $fillable = [
        'prize_slide_id',
        'participant_id',
        'winner_id',
        'ticket_number',
        'name',
        'position',
    ];

    public function slide(): BelongsTo
    {
        return $this->belongsTo(PrizeSlide::class, 'prize_slide_id');
    }

    /** The same win saved in the prize's raffle, like a drawn one. */
    public function winner(): BelongsTo
    {
        return $this->belongsTo(Winner::class);
    }

    public function participant(): BelongsTo
    {
        return $this->belongsTo(Participant::class);
    }
}
