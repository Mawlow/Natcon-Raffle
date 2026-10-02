<?php

namespace App\Models;

use App\Enums\ParticipantStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An entrant in one specific raffle.
 *
 * Participants are raffle-scoped: the CSV is imported into a raffle and the
 * rows it creates belong to that raffle alone. Ticket numbers are therefore
 * unique per raffle, never globally.
 */
class Participant extends Model
{
    use HasFactory;

    protected $fillable = [
        'raffle_id',
        'ticket_number',
        'name',
        'email',
        'phone',
        'category',
        'status',
        'metadata',
        'import_batch_id',
    ];

    protected function casts(): array
    {
        return [
            'status' => ParticipantStatus::class,
            'metadata' => 'array',
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

    public function scopeForRaffle(Builder $query, Raffle|int $raffle): Builder
    {
        return $query->where('raffle_id', $raffle instanceof Raffle ? $raffle->id : $raffle);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (blank($term)) {
            return $query;
        }

        $like = '%'.str_replace(['%', '_'], ['\%', '\_'], trim($term)).'%';

        return $query->where(function (Builder $q) use ($like) {
            $q->where('ticket_number', 'like', $like)
                ->orWhere('name', 'like', $like)
                ->orWhere('email', 'like', $like)
                ->orWhere('phone', 'like', $like);
        });
    }

    public function scopeEligible(Builder $query): Builder
    {
        return $query->whereNotIn('status', ParticipantStatus::ineligible());
    }
}
