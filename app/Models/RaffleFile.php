<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An event's raffles kept together, with one participant list for all of
 * them. The list is the uploaded CSV; each raffle in the file holds its own
 * copy of it (see RaffleFileService), so draws work exactly as before.
 */
class RaffleFile extends Model
{
    protected $fillable = [
        'name',
        'participants_path',
        'participants_filename',
        'participants_count',
        'participants_uploaded_at',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'participants_count' => 'integer',
            'participants_uploaded_at' => 'datetime',
        ];
    }

    public function raffles(): HasMany
    {
        return $this->hasMany(Raffle::class);
    }

    public function hasParticipants(): bool
    {
        return $this->participants_path !== null;
    }
}
