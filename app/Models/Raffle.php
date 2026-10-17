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

    /** Draw only from participants from one of the chosen locations ("Cebu"). */
    public const POOL_LOCATION = 'location';

    /**
     * Draw only from participants matching every list chosen: one of the
     * tags AND one of the developers AND one of the locations, whichever
     * of the three are set.
     */
    public const POOL_BOTH = 'both';

    /** The single-list pool types, each with the list it reads under "both". */
    public const POOL_LISTS = [self::POOL_TAG => 'tags', self::POOL_DEVELOPER => 'developers', self::POOL_LOCATION => 'locations'];

    protected $fillable = [
        'raffle_file_id',
        'draw_day',
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
        'prize_images',
        'winners_count',
        'participant_pool',
        'draw_filter',
        'next_draw_pool',
        'staged_winners',
        'is_predraw',
        'locked_at',
        'source_raffle_id',
        'status',
        'allow_repeat_winners',
        'winners_out_for_event',
        'only_never_won',
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
            'winners_out_for_event' => 'boolean',
            'only_never_won' => 'boolean',
            'prize_value' => 'decimal:2',
            'logos' => 'array',
            'prize_images' => 'array',
            'draw_filter' => 'array',
            'next_draw_pool' => 'array',
            'staged_winners' => 'array',
            'is_predraw' => 'boolean',
            'locked_at' => 'datetime',
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
     * The raffles this one shares its people with: every raffle in the same
     * raffle file on the same day — or, for a raffle in no file, every other
     * raffle in no file. A ticket number means the same person only inside
     * this group; another file is another event with its own numbering, so
     * a winner there is not a winner here. Everyone wins once a day: a
     * winner on Day 1 is back in play on Day 2, another day's draws.
     */
    public function scopeSharingPeopleWith(Builder $query, Raffle $raffle): Builder
    {
        if ($raffle->raffle_file_id === null) {
            return $query->whereNull('raffle_file_id');
        }

        // Every raffle in the file, whatever its day: a winner on Day 1 is
        // still a winner on Day 2 — unless Day 2's rule puts everyone back in
        // (see RaffleFile::dayRule and dayWinnersBackIn).
        return $query->where('raffle_file_id', $raffle->raffle_file_id);
    }

    /**
     * The other raffles of this raffle's file whose winners sit out the
     * whole event — a big prize, say — whatever day they are drawn on.
     */
    public function scopeKeepingWinnersOutAround(Builder $query, Raffle $raffle): Builder
    {
        if ($raffle->raffle_file_id === null) {
            return $query->whereRaw('1 = 0');
        }

        return $query->where('raffle_file_id', $raffle->raffle_file_id)
            ->where('winners_out_for_event', true)
            ->whereKeyNot($raffle->id);
    }

    /**
     * The raffles drawn on this raffle's day or before it (and the ones in
     * no day). A later day's draws and pre-selected lists do not count
     * against an earlier day: Day 2's lists take nobody out of Day 1.
     */
    public function scopeOnOrBeforeDayOf(Builder $query, Raffle $raffle): Builder
    {
        if ($raffle->draw_day === null) {
            return $query;
        }

        return $query->where(fn (Builder $q) => $q->whereNull('draw_day')->orWhere('draw_day', '<=', $raffle->draw_day));
    }

    /** The raffles drawn on this raffle's own day (and the ones in no day). */
    public function scopeOnDayOf(Builder $query, Raffle $raffle): Builder
    {
        if ($raffle->draw_day === null) {
            return $query;
        }

        return $query->where(fn (Builder $q) => $q->whereNull('draw_day')->orWhere('draw_day', $raffle->draw_day));
    }

    /**
     * The raffles whose participant lists show this raffle's winners as
     * winners: the ones sharing its people — or, when its winners sit out
     * the whole event, every raffle in its file.
     */
    protected function listsMarkedByThis(): Builder
    {
        return $this->winners_out_for_event && $this->raffle_file_id !== null
            ? static::query()->where('raffle_file_id', $this->raffle_file_id)
            : static::query()->sharingPeopleWith($this);
    }

    /**
     * Ticket numbers that won in the other raffles of this raffle's file
     * whose winners sit out the whole event — drawn there, or on their
     * pre-selected lists. They cannot win here, whatever the day.
     *
     * @return array<int, string>
     */
    public function ticketsKeptOut(): array
    {
        $raffles = static::query()->keepingWinnersOutAround($this);

        $staged = (clone $raffles)->whereNotNull('staged_winners')
            ->get(['id', 'staged_winners'])
            ->flatMap(fn (Raffle $raffle) => array_column($raffle->stagedWinners(), 'participant_id'))
            ->unique()->values()->all();

        $tickets = $staged === [] ? [] : Participant::query()->whereIn('id', $staged)->distinct()->pluck('ticket_number')->all();

        $won = Winner::query()->whereIn('winners.raffle_id', (clone $raffles)->select('id'))->distinct()->pluck('winners.ticket_number')->all();

        return array_values(array_unique(array_merge($tickets, $won, $this->ticketsWonOnStage())));
    }

    /**
     * Ticket numbers put on the Prize Display as winners of a raffle drawn by
     * hand (see PrizeSlideWinner), taken from this raffle's file. The manual
     * draw is the major draw: its winners sit out every other draw of the
     * event, whatever the day.
     *
     * @return array<int, string>
     */
    public function ticketsWonOnStage(): array
    {
        if ($this->raffle_file_id === null) {
            return [];
        }

        return PrizeSlideWinner::query()
            ->join('participants', 'participants.id', '=', 'prize_slide_winners.participant_id')
            ->join('raffles', 'raffles.id', '=', 'participants.raffle_id')
            ->where('raffles.raffle_file_id', $this->raffle_file_id)
            ->distinct()
            ->pluck('participants.ticket_number')
            ->all();
    }

    /**
     * Ticket numbers on the pre-selected winners list of any raffle sharing
     * this raffle's people (other than this raffle itself, when `$exceptSelf`).
     * A pre-selected winner has won: no other draw in the group can pick them.
     *
     * @return array<int, string>
     */
    public function stagedTicketsAround(bool $exceptSelf = false): array
    {
        $ids = static::query()
            ->where(fn (Builder $q) => $q->sharingPeopleWith($this)->orWhere(fn (Builder $out) => $out->keepingWinnersOutAround($this)))
            ->whereNotNull('staged_winners')
            ->when($exceptSelf, fn (Builder $q) => $q->whereKeyNot($this->id))
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

    /**
     * Ticket numbers drawn as winners in the other raffles of this raffle's
     * file that it shares its people with (the same day), plus the winners
     * of the file's raffles whose winners sit out the whole event. Everyone
     * in a file wins once a day: a winner of one raffle is out of the day's
     * other draws. A raffle in no file shares no winners this way (its
     * pre-draws are covered by their pre-selected lists).
     *
     * @return array<int, string>
     */
    public function ticketsWonAround(): array
    {
        if ($this->raffle_file_id === null) {
            return [];
        }

        return array_values(array_unique(array_merge($this->ticketsWonToday(), $this->ticketsKeptOut())));
    }

    /**
     * Ticket numbers that have won anything in the event, any day: drawn in
     * or on the pre-selected list of any other raffle of this raffle's
     * file, Day 2's included. Who a raffle "for the people still to win"
     * (`only_never_won`) leaves out.
     *
     * @return array<int, string>
     */
    public function ticketsWonAnyDay(): array
    {
        if ($this->raffle_file_id === null) {
            return [];
        }

        $won = Winner::query()
            ->whereIn('winners.raffle_id', static::query()->sharingPeopleWith($this)->whereKeyNot($this->id)->select('id'))
            ->distinct()
            ->pluck('winners.ticket_number')
            ->all();

        $stagedIds = static::query()
            ->sharingPeopleWith($this)
            ->whereNotNull('staged_winners')
            ->whereKeyNot($this->id)
            ->get(['id', 'staged_winners'])
            ->flatMap(fn (Raffle $raffle) => array_column($raffle->stagedWinners(), 'participant_id'))
            ->unique()->values()->all();
        $staged = $stagedIds === [] ? [] : Participant::query()->whereIn('id', $stagedIds)->distinct()->pluck('ticket_number')->all();

        return array_values(array_unique(array_merge($won, $staged, $this->ticketsKeptOut())));
    }

    /**
     * Whether this raffle's day puts its winners back in play: the file's
     * rule for the day is "everyone", so winning earlier in the day does not
     * keep anyone out of this draw. Big-prize winners stay out regardless.
     */
    public function dayWinnersBackIn(): bool
    {
        return $this->raffle_file_id !== null
            && $this->draw_day !== null
            && $this->raffleFile?->dayRule($this->draw_day) === RaffleFile::RULE_EVERYONE;
    }

    /**
     * Ticket numbers drawn as winners in the other raffles sharing this
     * raffle's people: the same file, the same day.
     *
     * @return array<int, string>
     */
    public function ticketsWonToday(bool $sameDayOnly = false): array
    {
        if ($this->raffle_file_id === null) {
            return [];
        }

        return Winner::query()
            ->whereIn('winners.raffle_id', static::query()->sharingPeopleWith($this)
                ->when($sameDayOnly, fn (Builder $q) => $q->onDayOf($this), fn (Builder $q) => $q->onOrBeforeDayOf($this))
                ->whereKeyNot($this->id)->select('id'))
            ->distinct()
            ->pluck('winners.ticket_number')
            ->all();
    }

    /**
     * Ticket numbers on the pre-selected lists of the other raffles sharing
     * this raffle's people (the same day), without the event-wide ones.
     *
     * @return array<int, string>
     */
    public function stagedTicketsToday(bool $sameDayOnly = false): array
    {
        $ids = static::query()
            ->sharingPeopleWith($this)
            ->when($sameDayOnly, fn (Builder $q) => $q->onDayOf($this), fn (Builder $q) => $q->onOrBeforeDayOf($this))
            ->whereNotNull('staged_winners')
            ->whereKeyNot($this->id)
            ->get(['id', 'staged_winners'])
            ->flatMap(fn (Raffle $raffle) => array_column($raffle->stagedWinners(), 'participant_id'))
            ->unique()->values()->all();

        return $ids === [] ? [] : Participant::query()->whereIn('id', $ids)->distinct()->pluck('ticket_number')->all();
    }

    /** Ticket numbers on this raffle's pre-selected list. @return array<int, string> */
    public function stagedTicketNumbers(): array
    {
        $ids = array_column($this->stagedWinners(), 'participant_id');

        return $ids === [] ? [] : Participant::query()->whereIn('id', $ids)->pluck('ticket_number')->all();
    }

    /**
     * The prize photos as the screens load them: prize name => URL, served
     * from the public disk at /storage. Relative, so it works on whatever
     * address the screens use.
     *
     * @return array<string, string>
     */
    public static function prizeImageUrls(?array $images): array
    {
        return array_map(fn (string $path) => '/storage/'.ltrim($path, '/'), $images ?? []);
    }

    /**
     * Shows these tickets as winners in every participant list of the raffles
     * sharing this one's people — or of the whole file, when this raffle's
     * winners sit out the whole event.
     */
    public function markTicketsWon(array $tickets): void
    {
        if ($tickets === []) {
            return;
        }

        Participant::query()
            ->whereIn('raffle_id', $this->listsMarkedByThis()->select('id'))
            ->whereIn('ticket_number', $tickets)
            ->where('status', ParticipantStatus::Active->value)
            ->update(['status' => ParticipantStatus::Winner->value]);
    }

    /**
     * Puts these tickets back in play, in the lists of the raffles sharing
     * this one's people, wherever they were shown as winners only because of
     * a pre-selected list: not where they were drawn, and not if another
     * pre-selected list in the group still has them.
     */
    public function releaseTickets(array $tickets): void
    {
        $tickets = array_values(array_diff($tickets, $this->stagedTicketsAround()));

        if ($tickets === []) {
            return;
        }

        Participant::query()
            ->whereIn('raffle_id', $this->listsMarkedByThis()->select('id'))
            ->whereIn('ticket_number', $tickets)
            ->where('status', ParticipantStatus::Winner->value)
            ->whereNotExists(fn ($won) => $won->selectRaw('1')->from('winners')
                ->whereColumn('winners.raffle_id', 'participants.raffle_id')
                ->whereColumn('winners.ticket_number', 'participants.ticket_number'))
            ->update(['status' => ParticipantStatus::Active->value]);
    }

    /**
     * Everyone who has already won somewhere other than this raffle, among
     * the raffles sharing its people — on another raffle's pre-selected
     * list, or drawn in another raffle — keyed by ticket number, with where
     * they won. They cannot be pre-selected here.
     *
     * @return array<string, string>
     */
    public function ticketsWonElsewhere(): array
    {
        // Out for the whole event: big-prize winners and the winners put up
        // on stage. Never pickable, whatever the day's rule.
        $keptOut = $this->ticketsTakenIn(static::query()->keepingWinnersOutAround($this));
        foreach ($this->ticketsWonOnStage() as $ticket) {
            $keptOut[$ticket] ??= 'the Prize Display';
        }

        // The day puts earlier winners back in: only those stay out.
        if ($this->dayWinnersBackIn()) {
            return $keptOut;
        }

        $taken = $this->ticketsTakenIn(static::query()->sharingPeopleWith($this)->onOrBeforeDayOf($this)->whereKeyNot($this->id)) + $keptOut;

        // Everyone still to win is on a list already (this one or another):
        // the earlier winners are back in, as in an ordinary draw, so the
        // event's draws never run dry. The big-prize winners stay out.
        $open = $this->participants()
            ->whereNotIn('status', ParticipantStatus::ineligible())
            ->whereNotIn('ticket_number', array_unique(array_merge(array_keys($taken), $this->stagedTicketNumbers())))
            ->exists();

        return $open ? $taken : $keptOut;
    }

    /**
     * How many of this raffle's people have not won anything yet — not on
     * any list, not drawn anywhere in the event — and so are picked first
     * for a pre-draw. Null when the day puts everyone back in.
     */
    public function stillToWinCount(): ?int
    {
        if ($this->dayWinnersBackIn()) {
            return null;
        }

        $taken = $this->only_never_won ? $this->ticketsWonAnyDay() : array_merge(
            array_keys($this->ticketsTakenIn(static::query()->sharingPeopleWith($this)->onOrBeforeDayOf($this))),
            $this->ticketsKeptOut(),
        );

        return $this->participants()
            ->whereNotIn('status', ParticipantStatus::ineligible())
            ->whereNotIn('ticket_number', array_unique($taken))
            ->count();
    }

    /**
     * Ticket numbers that won in the given raffles — drawn there, or on
     * their pre-selected lists — keyed by ticket, with the raffle's name.
     *
     * @return array<string, string>
     */
    protected function ticketsTakenIn(Builder $raffles): array
    {
        $taken = [];

        foreach ((clone $raffles)->whereNotNull('staged_winners')->get(['id', 'name', 'staged_winners']) as $other) {
            $tickets = Participant::query()
                ->whereIn('id', array_column($other->stagedWinners(), 'participant_id'))
                ->pluck('ticket_number');

            foreach ($tickets as $ticket) {
                $taken[$ticket] ??= $other->name;
            }
        }

        Winner::query()
            ->whereIn('winners.raffle_id', (clone $raffles)->select('raffles.id'))
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

    /**
     * Raffles that were played: completed, or with at least one winner
     * drawn. Only these have anything to report.
     */
    public function scopePlayed(Builder $query): Builder
    {
        return $query->where(fn (Builder $q) => $q->where('status', RaffleStatus::Completed->value)->orWhereHas('winners'));
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
     * Locked: its winners stay as they are. The pre-selected list cannot be
     * changed, no winner can be taken off, and it cannot be deleted or made
     * an ordinary raffle again — until the owner unlocks it with the PIN.
     * Playing it again on the screens is allowed: that reveals the same winners.
     */
    public function isLocked(): bool
    {
        return $this->locked_at !== null;
    }

    /**
     * The pre-selected list that replays this raffle's winners exactly as
     * they were drawn: each winner in their place, with the prize they won.
     * Null if a winner is no longer in the participant list.
     *
     * @return array<int, array{participant_id: int, prize_name: string}>|null
     */
    /**
     * Keep this drawn raffle's winners as its pre-selected list, in the
     * places they were drawn and with the prizes they won, so the draw can
     * be played again and land on the same people. The raffle becomes a
     * locked pre-draw. False when a winner is no longer in the participant
     * list; nothing changes then. A raffle with a list already is left alone.
     */
    public function keepWinnersAsList(): bool
    {
        if ($this->hasStagedWinners()) {
            return true;
        }

        $list = $this->stagedListFromWinners();

        if ($list === null || $list === []) {
            return false;
        }

        // The winners carry their prize as text from now on, like any
        // pre-selected winner, so the list and the reports agree.
        foreach ($this->winners()->with('prize')->get() as $winner) {
            if (blank($winner->prize_name)) {
                $winner->forceFill(['prize_name' => self::prizeLabel($winner->prize ?? $this)])->save();
            }
        }

        $this->forceFill([
            'is_predraw' => true,
            'source_raffle_id' => null,
            'staged_winners' => $list,
            'winners_count' => count($list),
            'locked_at' => $this->locked_at ?? now(),
        ])->save();

        return true;
    }

    public function stagedListFromWinners(): ?array
    {
        $list = [];

        foreach ($this->winners()->with('prize')->get() as $winner) {
            $participantId = $winner->participant_id
                ?? Participant::query()->where('raffle_id', $this->id)->where('ticket_number', $winner->ticket_number)->value('id');

            if ($participantId === null) {
                return null;
            }

            $list[] = [
                'participant_id' => (int) $participantId,
                'prize_name' => $winner->prize_name ?: self::prizeLabel($winner->prize ?? $this),
            ];
        }

        return $list;
    }

    /**
     * One line naming a prize for the pre-selected list, where each winner
     * carries their prize as text: "Hotel Vouchers", or for cash "₱3,000 Cash Prize".
     */
    public static function prizeLabel(Raffle|RafflePrize $prize): string
    {
        $name = trim((string) $prize->prize_name) ?: 'Prize';

        if (($prize->prize_type ?? 'cash') !== 'cash' || $prize->prize_value === null) {
            return $name;
        }

        $symbols = ['PHP' => '₱', 'USD' => '$', 'EUR' => '€', 'GBP' => '£', 'JPY' => '¥', 'SGD' => 'S$', 'AUD' => 'A$'];
        $currency = $prize->prize_currency ?: 'PHP';
        $amount = (float) $prize->prize_value;
        $formatted = ($symbols[$currency] ?? $currency.' ').number_format($amount, floor($amount) == $amount ? 0 : 2);

        // "₱3,000 Cash Prize" — unless the name already says the amount.
        return str_contains($name, number_format($amount, 0)) ? $name : $formatted.' '.$name;
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
     * A pool as { type: tag|developer|location, values } or, for several
     * lists at once, { type: both, tags?, developers?, locations? } with only
     * the filled lists. "Both" with one list filled is just that list;
     * nothing chosen is everyone (null).
     *
     * @return array<string, mixed>|null
     */
    public static function normalisePool(?array $filter): ?array
    {
        $type = $filter['type'] ?? null;
        $clean = fn ($values) => array_values(array_unique(array_filter((array) $values, 'filled')));

        if ($type === self::POOL_BOTH) {
            $lists = [];

            foreach (self::POOL_LISTS as $single => $key) {
                $values = $clean($filter[$key] ?? []);

                if ($values !== []) {
                    $lists[$key] = $values;
                }
            }

            return match (count($lists)) {
                0 => null,
                1 => ['type' => array_search(array_key_first($lists), self::POOL_LISTS, true), 'values' => reset($lists)],
                default => ['type' => self::POOL_BOTH] + $lists,
            };
        }

        $values = $clean($filter['values'] ?? []);

        if ($type === null || ! isset(self::POOL_LISTS[$type]) || $values === []) {
            return null;
        }

        return ['type' => $type, 'values' => $values];
    }

    /**
     * The lists a pool draws from, by list name: {tags, developers,
     * locations}, each possibly empty.
     *
     * @return array{tags: array<int, string>, developers: array<int, string>, locations: array<int, string>}
     */
    public static function poolLists(?array $pool): array
    {
        $lists = array_fill_keys(array_values(self::POOL_LISTS), []);

        if ($pool === null) {
            return $lists;
        }

        if ($pool['type'] === self::POOL_BOTH) {
            foreach (self::POOL_LISTS as $key) {
                $lists[$key] = array_values((array) ($pool[$key] ?? []));
            }

            return $lists;
        }

        $lists[self::POOL_LISTS[$pool['type']]] = array_values((array) ($pool['values'] ?? []));

        return $lists;
    }

    /** "all participants", "tag ELITE", "location Cebu" or "developers Cebu Landmasters, Filinvest". */
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
        $parts = [];

        foreach (self::POOL_LISTS as $noun => $key) {
            $values = self::poolLists($pool)[$key];

            if ($values !== []) {
                $parts[] = $list($noun, $values);
            }
        }

        return implode(' and ', $parts);
    }

    /**
     * Narrows a participants query to a pool: the chosen tags, developers
     * or locations, or — for several at once — participants matching one
     * value from every chosen list.
     */
    public static function applyPool(Builder $query, ?array $pool, string $table = 'participants'): Builder
    {
        if ($pool === null) {
            return $query;
        }

        ['tags' => $tags, 'developers' => $developers, 'locations' => $locations] = self::poolLists($pool);

        if ($tags !== []) {
            $query->whereIn("{$table}.category", $tags);
        }

        if ($locations !== []) {
            $query->whereIn("{$table}.location", $locations);
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
