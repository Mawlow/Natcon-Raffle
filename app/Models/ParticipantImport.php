<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ParticipantImport extends Model
{
    protected $fillable = [
        'raffle_id',
        'user_id',
        'original_filename',
        'file_hash',
        'total_rows',
        'imported_rows',
        'updated_rows',
        'skipped_rows',
        'status',
        'summary',
    ];

    protected function casts(): array
    {
        return ['summary' => 'array'];
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
