<?php

namespace App\Http\Controllers\Api;

use App\Enums\RaffleStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\ImportParticipantsRequest;
use App\Models\Participant;
use App\Models\Raffle;
use App\Models\PrizeSlide;
use App\Models\RaffleFile;
use App\Models\Winner;
use App\Support\EventDay;
use App\Services\RaffleFileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Raffle files — an event's raffles kept together with one participant list.
 * Made with just a name; the participants are uploaded once, and every raffle
 * made in the file starts with them.
 */
class RaffleFileController extends Controller
{
    public function __construct(protected RaffleFileService $files) {}

    public function index(): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        $files = RaffleFile::query()
            ->withCount(['raffles' => fn ($q) => $q->notArchived()->where('is_predraw', false)])
            ->latest('id')
            ->get();

        return response()->json(['data' => $files->map(fn (RaffleFile $file) => $this->summary($file))]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Raffle::class);

        $validated = $request->validate(['name' => ['required', 'string', 'max:160']]);

        $file = RaffleFile::create(['name' => trim($validated['name']), 'created_by' => $request->user()->id]);

        return response()->json(['data' => $this->summary($file->loadCount('raffles'))], 201);
    }

    public function show(RaffleFile $raffleFile): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        return response()->json(['data' => $this->summary($raffleFile->loadCount([
            'raffles' => fn ($q) => $q->notArchived()->where('is_predraw', false),
        ]))]);
    }

    public function update(Request $request, RaffleFile $raffleFile): JsonResponse
    {
        $this->authorize('create', Raffle::class);

        $validated = $request->validate(['name' => ['required', 'string', 'max:160']]);

        $raffleFile->update(['name' => trim($validated['name'])]);

        return response()->json(['data' => $this->summary($raffleFile->loadCount('raffles'))]);
    }

    /** Deletes the file only: its raffles are kept, no longer in a file. */
    public function destroy(RaffleFile $raffleFile): JsonResponse
    {
        $this->authorize('create', Raffle::class);

        if ($raffleFile->participants_path) {
            Storage::disk('local')->delete($raffleFile->participants_path);
        }

        $raffleFile->delete();

        return response()->json(['message' => 'Raffle file deleted.']);
    }

    public function preview(ImportParticipantsRequest $request, RaffleFile $raffleFile): JsonResponse
    {
        $this->authorize('import', Participant::class);

        try {
            return response()->json(['data' => $this->files->preview($request->file('file'))]);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function import(ImportParticipantsRequest $request, RaffleFile $raffleFile): JsonResponse
    {
        $this->authorize('import', Participant::class);

        try {
            $result = $this->files->upload($raffleFile, $request->file('file'), $request->user());
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Participants uploaded.',
            'data' => $result + ['file' => $this->summary($raffleFile->refresh()->loadCount('raffles'))],
        ], 201);
    }

    /**
     * A day of the event in numbers: how many wins its raffles have given
     * out, how many people are still to win that day, how many have never
     * won in the whole event — and who its draws pick from (see dayRule).
     */
    public function day(RaffleFile $raffleFile, int $day): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        return response()->json(['data' => $this->files->dayStats($raffleFile, $day)]);
    }

    /** Who a day's draws pick from: the people still to win that day, or everyone. */
    public function updateDay(Request $request, RaffleFile $raffleFile, int $day): JsonResponse
    {
        $this->authorize('create', Raffle::class);

        $validated = $request->validate(['rule' => ['required', Rule::in([RaffleFile::RULE_REMAINING, RaffleFile::RULE_EVERYONE])]]);

        $raffleFile->setDayRule($day, $validated['rule']);

        return response()->json([
            'message' => $validated['rule'] === RaffleFile::RULE_EVERYONE
                ? sprintf('Day %d draws from everyone: its winners can win again that day.', $day)
                : sprintf('Day %d draws only from the people who have not won that day.', $day),
            'data' => $this->files->dayStats($raffleFile->refresh(), $day),
        ]);
    }

    /**
     * A day's people as a spreadsheet: `list=remaining` (still to win
     * anything) or `list=won` (won so far, with what they won).
     */
    public function exportDay(Request $request, RaffleFile $raffleFile, int $day): StreamedResponse
    {
        $this->authorize('viewAny', Raffle::class);

        $list = $request->validate(['list' => ['required', Rule::in(['remaining', 'won'])]])['list'];
        $people = $this->files->dayPeople($raffleFile, $day);
        $rows = $people[$list];
        $wins = $people['wins'];
        $filename = sprintf('%s-day-%d-%s-%s.csv', Str::slug($raffleFile->name) ?: 'raffle-file', $day, $list === 'won' ? 'won-so-far' : 'still-to-win', now()->format('Y-m-d-His'));

        return response()->streamDownload(function () use ($rows, $wins, $list) {
            $handle = fopen('php://output', 'w');
            // A BOM so spreadsheet apps read the accents.
            fwrite($handle, "\xEF\xBB\xBF");
            fputcsv($handle, array_merge(['Ticket number', 'Name', 'Email', 'Phone', 'Tag', 'Developers', 'Location'], $list === 'won' ? ['Wins', 'Won'] : []));

            foreach ($rows as $participant) {
                $won = $wins[$participant->ticket_number] ?? [];
                fputcsv($handle, array_merge([
                    // Prefixed so spreadsheet apps keep the leading zeros.
                    "\t".$participant->ticket_number,
                    $participant->name,
                    $participant->email,
                    $participant->phone,
                    $participant->category,
                    implode(' | ', (array) $participant->developers),
                    $participant->location,
                ], $list === 'won' ? [count($won), implode(' | ', $won)] : []));
            }

            fclose($handle);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** Who can win, for a raffle being made in this file: its tags and developers. */
    public function groups(RaffleFile $raffleFile): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        return response()->json(['data' => $this->files->poolOptions($raffleFile)]);
    }

    /** @return array<string, mixed> */
    /**
     * The file's people, each with everything they have won at the event:
     * a search by name, ticket, phone or email across the whole list, and
     * for each win the raffle, the prize, the day and the set. Every raffle
     * in the file holds the same list, so one raffle stands for the file;
     * the wins come from all of the file's raffles, stage winners included.
     */
    public function participants(Request $request, RaffleFile $raffleFile): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        $inFile = $raffleFile->raffles()->get();
        $rep = $inFile->first(fn (Raffle $raffle) => ! $raffle->isArchived() && $raffle->participants()->exists())
            ?? $inFile->first(fn (Raffle $raffle) => $raffle->participants()->exists());

        if ($rep === null) {
            return response()->json(['data' => [], 'meta' => ['current_page' => 1, 'last_page' => 1, 'per_page' => 50, 'total' => 0], 'summary' => ['people' => 0, 'winners' => 0]]);
        }

        $raffleIds = $inFile->pluck('id');
        $wonTickets = Winner::query()->whereIn('raffle_id', $raffleIds)->distinct()->pluck('ticket_number');
        $perPage = min(max((int) $request->integer('per_page', 50), 10), 200);

        $people = Participant::query()
            ->forRaffle($rep)
            ->search($request->string('search')->toString())
            ->when($request->boolean('winners'), fn ($q) => $q->whereIn('ticket_number', $wonTickets))
            ->orderByRaw('name is null')
            ->orderBy($request->string('sort')->toString() === 'ticket_number' ? 'ticket_number' : 'name')
            ->orderBy('ticket_number')
            ->paginate($perPage)
            ->withQueryString();

        $byId = $inFile->keyBy('id');
        // Raffles made by the Prize Display: their winners were announced on stage.
        $onStage = PrizeSlide::query()->whereIn('raffle_id', $raffleIds)->pluck('raffle_id')->flip();
        $wins = Winner::query()
            ->whereIn('raffle_id', $raffleIds)
            ->whereIn('ticket_number', collect($people->items())->pluck('ticket_number'))
            ->with('prize')
            ->orderBy('drawn_at')
            ->get()
            ->groupBy('ticket_number');

        $rows = collect($people->items())->map(function (Participant $person) use ($wins, $byId, $onStage) {
            return [
                'id' => $person->id,
                'ticket_number' => $person->ticket_number,
                'name' => $person->name,
                'email' => $person->email,
                'phone' => $person->phone,
                'category' => $person->category,
                'developers' => $person->developers,
                'location' => $person->location,
                'status' => $person->status?->value ?? $person->status,
                'wins' => ($wins[$person->ticket_number] ?? collect())->map(function (Winner $winner) use ($byId, $onStage) {
                    $raffle = $byId[$winner->raffle_id];

                    return [
                        'id' => $winner->id,
                        'raffle_id' => $raffle->id,
                        'raffle_name' => $raffle->name,
                        'prize_name' => $winner->prize_name ?? $winner->prize?->prize_name ?? $raffle->prize_name,
                        'position' => (int) $winner->position,
                        'drawn_at' => $winner->drawn_at?->toIso8601String(),
                        'event_day' => EventDay::of($winner->drawn_at),
                        'draw_day' => $raffle->draw_day,
                        'draw_set' => $raffle->draw_set,
                        'on_stage' => isset($onStage[$raffle->id]),
                    ];
                })->values(),
            ];
        });

        return response()->json([
            'data' => $rows,
            'meta' => [
                'current_page' => $people->currentPage(),
                'last_page' => $people->lastPage(),
                'per_page' => $people->perPage(),
                'total' => $people->total(),
            ],
            'summary' => [
                'people' => Participant::query()->forRaffle($rep)->count(),
                'winners' => Participant::query()->forRaffle($rep)->whereIn('ticket_number', $wonTickets)->count(),
            ],
        ]);
    }

    protected function summary(RaffleFile $file): array
    {
        return [
            'id' => $file->id,
            'name' => $file->name,
            'participants_filename' => $file->participants_filename,
            'participants_count' => $file->participants_count,
            'participants_uploaded_at' => $file->participants_uploaded_at?->toIso8601String(),
            'raffles_count' => (int) ($file->raffles_count ?? 0),
            'ready_count' => $file->raffles()->notArchived()->where('status', RaffleStatus::Ready->value)->count(),
            // Where the file's Control Center opens: the first raffle still to draw.
            'next_raffle_id' => $file->raffles()
                ->notArchived()
                ->where('is_predraw', false)
                ->whereNotIn('status', [RaffleStatus::Completed->value, RaffleStatus::Cancelled->value])
                // In drawing order: the First Set, the Second, …, then raffles in no set.
                ->orderByRaw('draw_set is null')
                ->orderBy('draw_set')
                ->orderBy('id')
                ->value('id') ?? $file->raffles()->notArchived()->orderByDesc('id')->value('id'),
            'created_at' => $file->created_at?->toIso8601String(),
        ];
    }
}
