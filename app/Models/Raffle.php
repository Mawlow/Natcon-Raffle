<?php

namespace App\Models;

use App\Enums\RaffleStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Raffle extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'description',
        'prize_name',
        'prize_type',
        'prize_value',
        'prize_currency',
        'logos',
        'logo_left',
        'logo_right',
        'winners_count',
        'participant_pool',
        'status',
        'allow_repeat_winners',
        'starts_at',
        'ends_at',
        'completed_at',
        'archived_at',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => RaffleStatus::class,
            'allow_repeat_winners' => 'boolean',
            'prize_value' => 'decimal:2',
            'logos' => 'array',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'completed_at' => 'datetime',
            'archived_at' => 'datetime',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function settings(): HasOne
    {
        return $this->hasOne(RaffleSetting::class);
    }

    public function winners(): HasMany
    {
        return $this->hasMany(Winner::class)->orderBy('position');
    }

    public function drawEvents(): HasMany
    {
        return $this->hasMany(DrawEvent::class)->latest('id');
    }

    /** The raffle's entrants — everything imported from its CSV. */
    public function participants(): HasMany
    {
        return $this->hasMany(Participant::class);
    }

    public function imports(): HasMany
    {
        return $this->hasMany(ParticipantImport::class)->latest('id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereIn('status', [RaffleStatus::Ready->value, RaffleStatus::Live->value]);
    }

    public function scopeNotArchived(Builder $query): Builder
    {
        return $query->whereNull('archived_at');
    }

    public function remainingWinnerSlots(): int
    {
        return max(0, $this->winners_count - $this->winners()->count());
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }
}
