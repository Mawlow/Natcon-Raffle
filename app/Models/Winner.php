<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Winner extends Model
{
    use HasFactory;

    protected $fillable = [
        'raffle_id',
        'participant_id',
        'draw_event_id',
        'ticket_number',
        'position',
        'drawn_at',
        'drawn_by',
    ];

    protected function casts(): array
    {
        return ['drawn_at' => 'datetime'];
    }

    public function raffle(): BelongsTo
    {
        return $this->belongsTo(Raffle::class);
    }

    public function participant(): BelongsTo
    {
        return $this->belongsTo(Participant::class);
    }

    public function drawEvent(): BelongsTo
    {
        return $this->belongsTo(DrawEvent::class);
    }

    public function drawnBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'drawn_by');
    }
}
