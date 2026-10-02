<?php

namespace App\Models;

use App\Enums\DrawResult;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DrawEvent extends Model
{
    protected $fillable = [
        'event_uuid',
        'raffle_id',
        'user_id',
        'sequence',
        'ticket_number',
        'result',
        'message',
        'eligible_count',
        'request_id',
        'ip_address',
        'context',
    ];

    protected function casts(): array
    {
        return [
            'result' => DrawResult::class,
            'context' => 'array',
        ];
    }

    public function raffle(): BelongsTo
    {
        return $this->belongsTo(Raffle::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
