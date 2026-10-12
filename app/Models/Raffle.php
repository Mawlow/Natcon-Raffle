<?php

namespace App\Models;

use App\Enums\ParticipantStatus;
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

    /** Draw only from participants carrying one of the chosen tags. */
    public const POOL_TAG = 'tag';

    /** Draw only from participants qualified under one of the chosen developers. */
    public const POOL_DEVELOPER = 'developer';

    /** Draw only from participants with one of the chosen tags AND one of the chosen developers. */
    public const POOL_BOTH = 'both';

    protected $fillable = [
        'raffle_file_id',
        'draw_set',
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
        'draw_filter',
        'staged_winners',
        'is_predraw',
        'source_raffle_id',
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
            'draw_filter' => 'array',
            'staged_winners' => 'array',
            'is_predraw' => 'boolean',
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

    /** The pre-draws made from this raffle (see PredrawController). */
    public function predraws(): HasMany
    {
        return $this->hasMany(Raffle::class, 'source_raffle_id')->where('is_predraw', true);
    }

    /** The raffle file (event) this raffle belongs to, if any. */
    public function raffleFile(): BelongsTo
    {
        return $this->belongsTo(RaffleFile::class);
    }

    /** For a pre-draw: the raffle its participants were copied from. */
    public function sourceRaffle(): BelongsTo
    {
        return $this->belongsTo(Raffle::class, 'source_raffle_id');
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

    /** Prize tiers, in the order they are drawn. None means one prize for every winner. */
    public function prizes(): HasMany
    {
        return $this->hasMany(RafflePrize::class)->orderBy('sort_order')->orderBy('id');
    }

    /**
     * The tier the next winner is drawn for: the first with a place left.
     * Null when the raffle has no tiers, or every tier is full.
     */
    public function nextPrize(): ?RafflePrize
    {
        $drawn = Winner::query()
            ->where('raffle_id', $this->id)
            ->whereNotNull('raffle_prize_id')
            ->selectRaw('raffle_prize_id, count(*) as total')
            ->groupBy('raffle_prize_id')
            ->pluck('total', 'raffle_prize_id');

        return $this->prizes()->get()->first(fn (RafflePrize $prize) => ($drawn[$prize->id] ?? 0) < $prize->winners_count);
    }

    /**
     * Pre-selected winners, in draw order: each draw reveals the next one
     * instead of picking at random. Empty for an ordinary raffle.
     *
     * @return array<int, array{participant_id: int, prize_name: string}>
     */
    public function stagedWinners(): array
    {
        return array_values($this->staged_winners ?? []);
    }

    public function hasStagedWinners(): bool
    {
        return $this->stagedWinners() !== [];
    }

    /**
     * Ticket numbers on any raffle's pre-selected winners list (other than
     * `$except`). A pre-selected winner has won: no other draw can pick them.
     *
     * @return array<int, string>
     */
    public static function stagedTickets(?int $except = null): array
    {
        $ids = static::query()
            ->whereNotNull('staged_winners')
            ->when($except !== null, fn (Builder $q) => $q->whereKeyNot($except))
            ->get(['id', 'staged_winners'])
            ->flatMap(fn (Raffle $raffle) => array_column($raffle->stagedWinners(), 'participant_id'))
            ->unique()
            ->values()
            ->all();

        if ($ids === []) {
            return [];
        }

        return Participant::query()->whereIn('id', $ids)->distinct()->pluck('ticket_number')->all();
    }

    /** Ticket numbers on this raffle's pre-selected list. @return array<int, string> */
    public function stagedTicketNumbers(): array
    {
        $ids = array_column($this->stagedWinners(), 'participant_id');

        return $ids === [] ? [] : Participant::query()->whereIn('id', $ids)->pluck('ticket_number')->all();
    }

    /** Shows these tickets as winners in every participant list they are in. */
    public static function markTicketsWon(array $tickets): void
    {
        if ($tickets === []) {
            return;
        }

        Participant::query()
            ->whereIn('ticket_number', $tickets)
            ->where('status', ParticipantStatus::Active->value)
            ->update(['status' => ParticipantStatus::Winner->value]);
    }

    /**
     * Puts these tickets back in play wherever they were shown as winners only
     * because of a pre-selected list: not where they were drawn, and not if
     * another pre-selected list still has them.
     */
    public static function releaseTickets(array $tickets): void
    {
        $tickets = array_values(array_diff($tickets, static::stagedTickets()));

        if ($tickets === []) {
            return;
        }

        Participant::query()
            ->whereIn('ticket_number', $tickets)
            ->where('status', ParticipantStatus::Winner->value)
            ->whereNotExists(fn ($won) => $won->selectRaw('1')->from('winners')
                ->whereColumn('winners.raffle_id', 'participants.raffle_id')
                ->whereColumn('winners.ticket_number', 'participants.ticket_number'))
            ->update(['status' => ParticipantStatus::Active->value]);
    }

    /**
     * Everyone who has already won somewhere other than this raffle — on
     * another raffle's pre-selected list, or drawn in another raffle — keyed
     * by ticket number, with where they won. They cannot be pre-selected here.
     *
     * @return array<string, string>
     */
    public function ticketsWonElsewhere(): array
    {
        $taken = [];

        $others = static::query()
            ->whereNotNull('staged_winners')
            ->whereKeyNot($this->id)
            ->get(['id', 'name', 'staged_winners']);

        foreach ($others as $other) {
            $tickets = Participant::query()
                ->whereIn('id', array_column($other->stagedWinners(), 'participant_id'))
                ->pluck('ticket_number');

            foreach ($tickets as $ticket) {
                $taken[$ticket] ??= $other->name;
            }
        }

        Winner::query()
            ->where('winners.raffle_id', '!=', $this->id)
            ->join('raffles', 'raffles.id', '=', 'winners.raffle_id')
            ->get(['winners.ticket_number', 'raffles.name'])
            ->each(function ($winner) use (&$taken) {
                $taken[$winner->ticket_number] ??= $winner->name;
            });

        return $taken;
    }

    /**
     * The pre-selected winners as the Control Center sees them, each with
     * the participant's name and ticket.
     *
     * @return array<int, array<string, mixed>>
     */
    public function stagedWinnerList(): array
    {
        $staged = $this->stagedWinners();

        if ($staged === []) {
            return [];
        }

        $people = Participant::query()
            ->where('raffle_id', $this->id)
            ->whereIn('id', array_column($staged, 'participant_id'))
            ->get(['id', 'name', 'ticket_number'])
            ->keyBy('id');

        return array_map(fn (array $entry) => [
            'participant_id' => (int) $entry['participant_id'],
            'name' => $people->get($entry['participant_id'])?->name,
            'ticket_number' => $people->get($entry['participant_id'])?->ticket_number,
            'prize_name' => $entry['prize_name'],
        ], $staged);
    }

    /**
     * The prize tiers as the screens and Control Center see them, each with
     * how many of its winners are out.
     *
     * @return array<int, array<string, mixed>>
     */
    public function prizeList(): array
    {
        $drawn = Winner::query()
            ->where('raffle_id', $this->id)
            ->whereNotNull('raffle_prize_id')
            ->selectRaw('raffle_prize_id, count(*) as total')
            ->groupBy('raffle_prize_id')
            ->pluck('total', 'raffle_prize_id');

        return $this->prizes()->get()
            ->map(fn (RafflePrize $prize) => $prize->toDisplayArray((int) ($drawn[$prize->id] ?? 0)))
            ->all();
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

    /**
     * The slice of participants this raffle is drawn from, or null for all of
     * them. An empty selection also means all of them.
     *
     * @return array{type: string, values: array<int, string>}|null
     */
    public function drawPool(): ?array
    {
        return self::normalisePool($this->draw_filter);
    }

    /**
     * A pool as { type: tag|developer, values } or, for both at once,
     * { type: both, tags, developers }. "Both" with only one list filled is
     * just that list; nothing chosen is everyone (null).
     *
     * @return array<string, mixed>|null
     */
    public static function normalisePool(?array $filter): ?array
    {
        $type = $filter['type'] ?? null;

        if ($type === self::POOL_BOTH) {
            $tags = array_values(array_unique(array_filter((array) ($filter['tags'] ?? []), 'filled')));
            $developers = array_values(array_unique(array_filter((array) ($filter['developers'] ?? []), 'filled')));

            return match (true) {
                $tags !== [] && $developers !== [] => ['type' => self::POOL_BOTH, 'tags' => $tags, 'developers' => $developers],
                $tags !== [] => ['type' => self::POOL_TAG, 'values' => $tags],
                $developers !== [] => ['type' => self::POOL_DEVELOPER, 'values' => $developers],
                default => null,
            };
        }

        $values = array_values(array_filter((array) ($filter['values'] ?? []), 'filled'));

        if (! in_array($type, [self::POOL_TAG, self::POOL_DEVELOPER], true) || $values === []) {
            return null;
        }

        return ['type' => $type, 'values' => $values];
    }

    /** "all participants", "tag ELITE" or "developers Cebu Landmasters, Filinvest". */
    public function drawPoolLabel(): string
    {
        return self::poolLabel($this->drawPool());
    }

    public static function poolLabel(?array $pool): string
    {
        if ($pool === null) {
            return 'all participants';
        }

        $list = fn (string $noun, array $values) => $noun.(count($values) === 1 ? ' ' : 's ').implode(', ', $values);

        if ($pool['type'] === self::POOL_BOTH) {
            return $list('tag', $pool['tags']).' and '.$list('developer', $pool['developers']);
        }

        return $list($pool['type'] === self::POOL_TAG ? 'tag' : 'developer', $pool['values']);
    }

    /**
     * Narrows a participants query to a pool: the chosen tags, the chosen
     * developers, or — for both — participants with one of the tags and
     * one of the developers.
     */
    public static function applyPool(Builder $query, ?array $pool, string $table = 'participants'): Builder
    {
        if ($pool === null) {
            return $query;
        }

        $tags = $pool['type'] === self::POOL_TAG ? $pool['values'] : ($pool['tags'] ?? []);
        $developers = $pool['type'] === self::POOL_DEVELOPER ? $pool['values'] : ($pool['developers'] ?? []);

        if ($tags !== []) {
            $query->whereIn("{$table}.category", $tags);
        }

        if ($developers !== []) {
            $query->where(function (Builder $any) use ($developers, $table) {
                foreach ($developers as $developer) {
                    $any->orWhereJsonContains("{$table}.developers", $developer);
                }
            });
        }

        return $query;
    }
}
