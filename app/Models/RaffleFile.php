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
        'day_rules',
        'created_by',
    ];

    /** A day's draws pick only from the people who have not won that day yet (the default). */
    public const RULE_REMAINING = 'remaining';

    /** A day's draws pick from everyone, the day's winners included. */
    public const RULE_EVERYONE = 'everyone';

    /** Who can win a day's draws: RULE_REMAINING unless the day was set to RULE_EVERYONE. */
    public function dayRule(?int $day): string
    {
        $rule = $day ? ($this->day_rules[(string) $day] ?? null) : null;

        return $rule === self::RULE_EVERYONE ? self::RULE_EVERYONE : self::RULE_REMAINING;
    }

    public function setDayRule(int $day, string $rule): void
    {
        $rules = $this->day_rules ?? [];
        if ($rule === self::RULE_EVERYONE) {
            $rules[(string) $day] = $rule;
        } else {
            unset($rules[(string) $day]);
        }
        $this->update(['day_rules' => $rules === [] ? null : $rules]);
    }

    protected function casts(): array
    {
        return [
            'participants_count' => 'integer',
            'participants_uploaded_at' => 'datetime',
            'day_rules' => 'array',
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
