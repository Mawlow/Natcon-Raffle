<?php

namespace App\Services;

use App\Enums\ParticipantStatus;
use App\Enums\RaffleStatus;
use App\Models\Participant;
use App\Models\Raffle;
use App\Models\RaffleFile;
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
        // starts that way here too.
        $this->copySharedStatuses($raffleFile, $raffle);
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
     * The file's tags and developers with how many people carry each — the
     * choices for "who can win" while a raffle is made, before it exists.
     *
     * @return array{tags: array<int, array>, developers: array<int, array>}
     */
    public function poolOptions(RaffleFile $raffleFile): array
    {
        $tags = [];
        $developers = [];

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
            }
        }

        // Shaped like RaffleDrawService::poolOptions, biggest groups first.
        $shape = fn (array $counts) => collect($counts)
            ->map(fn ($total, $value) => ['value' => (string) $value, 'total' => $total, 'eligible' => $total])
            ->sortBy([['total', 'desc'], ['value', 'asc']])
            ->values()
            ->all();

        return ['tags' => $shape($tags), 'developers' => $shape($developers)];
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
