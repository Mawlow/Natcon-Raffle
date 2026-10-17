<?php

namespace App\Services;

use App\Enums\ParticipantStatus;
use App\Enums\RaffleStatus;
use App\Models\Participant;
use App\Models\Raffle;
use App\Models\RaffleFile;
use App\Models\Winner;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;

/**
 * Keeps a raffle file's raffles on its participant list. The file keeps the
 * uploaded CSV; each raffle in it gets the CSV imported into its own list, so
 * the draw, pools, winners and reports work exactly as for any raffle.
 */
class RaffleFileService
{
    /** Statuses that are about the person, not one raffle: shared by the whole file. */
    public const SHARED_STATUSES = ['ACTIVE', 'ABSENT', 'DISQUALIFIED'];

    public function __construct(protected ParticipantImportService $imports) {}

    /** Check a CSV before it becomes the file's participant list. Nothing is written. */
    public function preview(UploadedFile $file): array
    {
        // An unsaved raffle: nothing is "already in" it, so the counts read
        // as the file's list on its own.
        $preview = $this->imports->preview(new Raffle, $file);
        unset($preview['rows']);

        return $preview;
    }

    /**
     * Make this CSV the file's participant list, and bring every raffle in
     * the file that has not been drawn yet onto it: new people are added and
     * everyone's details updated, while who is a winner or absent is kept.
     *
     * @return array{participants: int, synced: int, skipped: int}
     */
    public function upload(RaffleFile $raffleFile, UploadedFile $file, ?User $user): array
    {
        $preview = $this->preview($file);

        if ($preview['valid_count'] === 0) {
            throw new \RuntimeException('The CSV contains no importable rows.');
        }

        $old = $raffleFile->participants_path;
        $path = $file->storeAs('raffle-files', $raffleFile->id.'-'.now()->format('YmdHis').'.csv', 'local');

        $raffleFile->update([
            'participants_path' => $path,
            'participants_filename' => $file->getClientOriginalName(),
            'participants_count' => $preview['valid_count'],
            'participants_uploaded_at' => now(),
        ]);

        if ($old && $old !== $path) {
            Storage::disk('local')->delete($old);
        }

        $synced = 0;
        $skipped = 0;

        foreach ($raffleFile->raffles()->withCount('winners as drawn_count')->get() as $raffle) {
            if (! $this->canSync($raffle)) {
                $skipped++;

                continue;
            }

            $this->importInto($raffleFile, $raffle, $user);
            $synced++;
        }

        return ['participants' => $preview['valid_count'], 'synced' => $synced, 'skipped' => $skipped];
    }

    /** Give a raffle made in the file the file's participants. */
    public function importInto(RaffleFile $raffleFile, Raffle $raffle, ?User $user): void
    {
        $csv = $this->storedCsv($raffleFile);

        if ($csv === null) {
            return;
        }

        $this->imports->import($raffle, $csv, $user, 'update', keepStatus: true);

        // Someone marked absent or disqualified in the file's other raffles
        // starts that way here too, and whoever already won one of them is
        // shown as a winner: everyone in a file wins once.
        $this->copySharedStatuses($raffleFile, $raffle);
        $raffle->markTicketsWon(array_unique(array_merge($raffle->ticketsWonAround(), $raffle->stagedTicketsAround())));
    }

    /**
     * Works out again which tickets each of the file's participant lists
     * shows as winners — after a raffle changes day, or starts or stops
     * keeping its winners out for the event. A ticket is a winner in a list
     * when it won that raffle, or won (or is pre-selected) in a raffle
     * sharing its people that day, or in a raffle whose winners sit out the
     * whole event. Disqualified, absent and excluded stay as they are.
     */
    public function resyncWinnerMarks(RaffleFile $raffleFile): void
    {
        foreach ($raffleFile->raffles()->get() as $raffle) {
            $winners = array_values(array_unique(array_merge(
                $raffle->winners()->pluck('ticket_number')->all(),
                $raffle->stagedTicketNumbers(),
                $raffle->stagedTicketsAround(exceptSelf: true),
                $raffle->ticketsWonAround(),
            )));

            $raffle->participants()
                ->where('status', ParticipantStatus::Winner->value)
                ->when($winners !== [], fn ($q) => $q->whereNotIn('ticket_number', $winners))
                ->update(['status' => ParticipantStatus::Active->value, 'updated_at' => now()]);

            foreach (array_chunk($winners, 500) as $chunk) {
                $raffle->participants()
                    ->where('status', ParticipantStatus::Active->value)
                    ->whereIn('ticket_number', $chunk)
                    ->update(['status' => ParticipantStatus::Winner->value, 'updated_at' => now()]);
            }
        }
    }

    /**
     * A day in numbers. Every raffle in the file carries the same people, so
     * one of the day's raffles stands for the list; with none, a raffle of
     * the file does (its winners are then nobody's).
     *
     * @return array{day: int, rule: string, raffles: int, winners: int, winners_people: int, participants: int, remaining: int, never_won: int, kept_out: int}
     */
    public function dayStats(RaffleFile $raffleFile, int $day): array
    {
        $dayRaffles = $raffleFile->raffles()->notArchived()->where('draw_day', $day)->get();
        $inFile = $raffleFile->raffles()->notArchived()->get();
        $rep = $dayRaffles->first(fn (Raffle $raffle) => $raffle->participants()->exists())
            ?? $inFile->first(fn (Raffle $raffle) => $raffle->participants()->exists());

        $winners = Winner::query()->whereIn('raffle_id', $dayRaffles->pluck('id'));
        $wonToday = (clone $winners)->distinct()->pluck('ticket_number')->all();
        $stagedToday = $dayRaffles->flatMap(fn (Raffle $raffle) => $raffle->stagedTicketNumbers())->unique()->values()->all();
        // Won so far: on this day or an earlier one. A later day's lists do
        // not count against this day (Day 2's pre-draws take nobody out of Day 1).
        $upToDay = $inFile->filter(fn (Raffle $raffle) => $raffle->draw_day === null || $raffle->draw_day <= $day);
        $wonEver = Winner::query()->whereIn('raffle_id', $upToDay->pluck('id'))->distinct()->pluck('ticket_number')->all();
        $stagedEver = $upToDay->flatMap(fn (Raffle $raffle) => $raffle->stagedTicketNumbers())->unique()->values()->all();
        $keptOut = $rep ? array_values(array_unique(array_merge($rep->ticketsKeptOut(), $rep->winners_out_for_event ? $rep->winners()->pluck('ticket_number')->all() : []))) : [];

        $people = $rep ? $rep->participants()->whereNotIn('status', ParticipantStatus::ineligible()) : null;
        $count = fn (array $out) => $people ? (clone $people)->whereNotIn('ticket_number', $out)->count() : 0;

        return [
            'day' => $day,
            'rule' => $raffleFile->dayRule($day),
            'raffles' => $dayRaffles->count(),
            // Wins given out that day, and how many different people won them.
            'winners' => (clone $winners)->count(),
            'winners_people' => count($wonToday),
            'participants' => $people ? (clone $people)->count() : 0,
            // Still to win: nobody who has won or is on a list on this day or
            // an earlier one, nor a big-prize winner. Who the day's draws pick
            // from first, unless its rule is "everyone".
            'remaining' => $count(array_unique(array_merge($wonEver, $stagedEver, $keptOut))),
            'never_won' => $count(array_unique(array_merge($wonEver, $stagedEver, $keptOut))),
            // How many different people have won something in the event, up to this day.
            'won_people' => count(array_unique(array_merge($wonEver, $stagedEver))),
            // Still to win this day only (its own wins and lists).
            'remaining_today' => $count(array_unique(array_merge($wonToday, $stagedToday, $keptOut))),
            'kept_out' => count($keptOut),
        ];
    }

    /**
     * The people of the event by what they have won, for a day's download:
     * `remaining` are still to win anything (and not out for the event);
     * `won` have won something, any day, each with what — "Raffle name ·
     * prize (Day 1)" per win, pre-selected lists included.
     *
     * @return array{remaining: \Illuminate\Database\Eloquent\Collection<int, Participant>, won: \Illuminate\Database\Eloquent\Collection<int, Participant>, wins: array<string, array<int, string>>}
     */
    public function dayPeople(RaffleFile $raffleFile, int $day): array
    {
        $inFile = $raffleFile->raffles()->notArchived()->get();
        $rep = $inFile->first(fn (Raffle $raffle) => $raffle->draw_day === $day && $raffle->participants()->exists())
            ?? $inFile->first(fn (Raffle $raffle) => $raffle->participants()->exists());

        if ($rep === null) {
            return ['remaining' => Participant::query()->whereRaw('1 = 0')->get(), 'won' => Participant::query()->whereRaw('1 = 0')->get(), 'wins' => []];
        }

        $byId = $inFile->keyBy('id');
        $label = fn (Raffle $raffle, ?string $prize) => trim($raffle->name.' · '.($prize ?: ($raffle->prize_name ?? 'prize'))).($raffle->draw_day ? sprintf(' (Day %d)', $raffle->draw_day) : '');

        $wins = [];
        // Wins up to this day decide who is still to win; later days' wins are listed but take nobody out.
        $wonUpToDay = [];
        $upTo = fn (Raffle $raffle) => $raffle->draw_day === null || $raffle->draw_day <= $day;
        Winner::query()->whereIn('raffle_id', $inFile->pluck('id'))->with('prize')->orderBy('drawn_at')->get()
            ->each(function (Winner $winner) use (&$wins, &$wonUpToDay, $byId, $label, $upTo) {
                $wins[$winner->ticket_number][] = $label($byId[$winner->raffle_id], $winner->prize_name ?? $winner->prize?->prize_name);
                if ($upTo($byId[$winner->raffle_id])) {
                    $wonUpToDay[$winner->ticket_number] = true;
                }
            });
        foreach ($inFile as $raffle) {
            $drawn = Winner::query()->where('raffle_id', $raffle->id)->pluck('ticket_number')->all();
            foreach ($raffle->stagedWinners() as $entry) {
                $ticket = Participant::query()->whereKey($entry['participant_id'])->value('ticket_number');
                if ($ticket !== null && ! in_array($ticket, $drawn, true)) {
                    $wins[$ticket][] = $label($raffle, $entry['prize_name'] ?? null).' — pre-selected';
                    if ($upTo($raffle)) {
                        $wonUpToDay[$ticket] = true;
                    }
                }
            }
        }
        $keptOut = array_values(array_unique(array_merge($rep->ticketsKeptOut(), $rep->winners_out_for_event ? $rep->winners()->pluck('ticket_number')->all() : [])));

        $people = $rep->participants()->whereNotIn('status', ParticipantStatus::ineligible())->orderBy('ticket_number');
        $wonTickets = array_keys($wins);

        return [
            'remaining' => (clone $people)->whereNotIn('ticket_number', array_unique(array_merge(array_keys($wonUpToDay), $keptOut)))->get(),
            'won' => (clone $people)->whereIn('ticket_number', $wonTickets)->get(),
            'wins' => $wins,
        ];
    }

    /**
     * Marking someone absent, disqualified or back to active in one raffle
     * marks them the same in the file's other raffles — they are the same
     * person at the same event. Winners stay winners.
     */
    public function shareStatus(Raffle $raffle, string $ticket, string $status): void
    {
        if ($raffle->raffle_file_id === null || ! in_array($status, self::SHARED_STATUSES, true)) {
            return;
        }

        Participant::query()
            ->where('ticket_number', $ticket)
            ->whereIn('status', self::SHARED_STATUSES)
            ->whereIn('raffle_id', Raffle::query()
                ->where('raffle_file_id', $raffle->raffle_file_id)
                ->whereKeyNot($raffle->id)
                ->select('id'))
            ->update(['status' => $status, 'updated_at' => now()]);
    }

    /**
     * The file's tags, developers and locations with how many people carry
     * each — the choices for "who can win" while a raffle is made, before it exists.
     *
     * @return array{tags: array<int, array>, developers: array<int, array>, locations: array<int, array>}
     */
    public function poolOptions(RaffleFile $raffleFile): array
    {
        $tags = [];
        $developers = [];
        $locations = [];

        $csv = $this->storedCsv($raffleFile);

        if ($csv !== null) {
            foreach ($this->imports->preview(new Raffle, $csv)['rows'] as $row) {
                if (in_array($row['status'], ParticipantStatus::ineligible(), true)) {
                    continue;
                }

                if (filled($row['category'])) {
                    $tags[$row['category']] = ($tags[$row['category']] ?? 0) + 1;
                }

                foreach ((array) $row['developers'] as $developer) {
                    $developers[$developer] = ($developers[$developer] ?? 0) + 1;
                }

                if (filled($row['location'])) {
                    $locations[$row['location']] = ($locations[$row['location']] ?? 0) + 1;
                }
            }
        }

        // Shaped like RaffleDrawService::poolOptions, biggest groups first.
        $shape = fn (array $counts) => collect($counts)
            ->map(fn ($total, $value) => ['value' => (string) $value, 'total' => $total, 'eligible' => $total])
            ->sortBy([['total', 'desc'], ['value', 'asc']])
            ->values()
            ->all();

        return ['tags' => $shape($tags), 'developers' => $shape($developers), 'locations' => $shape($locations)];
    }

    protected function storedCsv(RaffleFile $raffleFile): ?UploadedFile
    {
        if (! $raffleFile->hasParticipants() || ! Storage::disk('local')->exists($raffleFile->participants_path)) {
            return null;
        }

        return new UploadedFile(
            Storage::disk('local')->path($raffleFile->participants_path),
            $raffleFile->participants_filename ?? 'participants.csv',
            'text/csv',
            null,
            true,
        );
    }

    /** Raffles still being set up take a new list; ones already drawn keep theirs. */
    protected function canSync(Raffle $raffle): bool
    {
        return (int) $raffle->drawn_count === 0
            && ! in_array($raffle->status, [RaffleStatus::Completed, RaffleStatus::Cancelled], true);
    }

    protected function copySharedStatuses(RaffleFile $raffleFile, Raffle $raffle): void
    {
        $marked = Participant::query()
            ->whereIn('status', [ParticipantStatus::Absent->value, ParticipantStatus::Disqualified->value])
            ->whereIn('raffle_id', $raffleFile->raffles()->whereKeyNot($raffle->id)->select('id'))
            ->get(['ticket_number', 'status']);

        /** @var Collection<string, Collection> $byStatus */
        $byStatus = $marked->groupBy(fn ($participant) => $participant->status->value);

        foreach ($byStatus as $status => $rows) {
            foreach ($rows->pluck('ticket_number')->unique()->chunk(500) as $tickets) {
                $raffle->participants()
                    ->whereIn('ticket_number', $tickets->all())
                    ->where('status', ParticipantStatus::Active->value)
                    ->update(['status' => $status, 'updated_at' => now()]);
            }
        }
    }
}
