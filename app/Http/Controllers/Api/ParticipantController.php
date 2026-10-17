<?php

namespace App\Http\Controllers\Api;

use App\Enums\ParticipantStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\ImportParticipantsRequest;
use App\Http\Requests\StoreParticipantRequest;
use App\Http\Resources\ParticipantResource;
use App\Models\Participant;
use App\Models\Raffle;
use App\Services\ParticipantImportService;
use App\Services\RaffleFileService;
use App\Services\RaffleDrawService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Participants of one raffle.
 *
 * Every route here is nested under /raffles/{raffle}, and every query is
 * scoped to that raffle — a participant is never visible from another one.
 */
class ParticipantController extends Controller
{
    public function __construct(protected ParticipantImportService $imports, protected RaffleFileService $files) {}

    public function index(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('viewAny', Participant::class);

        $perPage = min(max((int) $request->integer('per_page', 25), 5), 200);

        $participants = $raffle->participants()
            ->search($request->string('search')->toString())
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')->toString()))
            ->when($request->filled('category'), fn ($q) => $q->where('category', $request->string('category')->toString()))
            ->when($request->filled('developer'), fn ($q) => $q->whereJsonContains('developers', $request->string('developer')->toString()))
            ->when($request->filled('location'), fn ($q) => $q->where('location', $request->string('location')->toString()))
            ->orderBy($this->sortColumn($request), $request->string('direction')->toString() === 'desc' ? 'desc' : 'asc')
            ->paginate($perPage)
            ->withQueryString();

        return response()->json([
            'data' => ParticipantResource::collection($participants->items()),
            'meta' => [
                'current_page' => $participants->currentPage(),
                'last_page' => $participants->lastPage(),
                'per_page' => $participants->perPage(),
                'total' => $participants->total(),
                'from' => $participants->firstItem(),
                'to' => $participants->lastItem(),
            ],
            'filters' => [
                'statuses' => ParticipantStatus::values(),
                'categories' => $raffle->participants()
                    ->whereNotNull('category')
                    ->distinct()
                    ->orderBy('category')
                    ->limit(100)
                    ->pluck('category'),
                'developers' => $raffle->participants()
                    ->whereNotNull('developers')
                    ->pluck('developers')
                    ->flatten()
                    ->unique()
                    ->sort()
                    ->values(),
                'locations' => $raffle->participants()
                    ->whereNotNull('location')
                    ->distinct()
                    ->orderBy('location')
                    ->limit(100)
                    ->pluck('location'),
            ],
        ]);
    }

    public function store(StoreParticipantRequest $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('create', Participant::class);

        $participant = $raffle->participants()->create($request->validated() + [
            'status' => $request->input('status', ParticipantStatus::Active->value),
        ]);

        return response()->json(['data' => new ParticipantResource($participant)], 201);
    }

    public function show(Raffle $raffle, Participant $participant): JsonResponse
    {
        $this->authorize('view', $participant);
        $this->assertBelongsTo($raffle, $participant);

        $participant->load(['winners.raffle:id,name,prize_name']);

        return response()->json([
            'data' => new ParticipantResource($participant),
            'wins' => $participant->winners->map(fn ($winner) => [
                'raffle' => $winner->raffle?->name,
                'prize_name' => $winner->raffle?->prize_name,
                'position' => $winner->position,
                'drawn_at' => $winner->drawn_at?->toIso8601String(),
            ]),
        ]);
    }

    public function update(StoreParticipantRequest $request, Raffle $raffle, Participant $participant): JsonResponse
    {
        $this->authorize('update', $participant);
        $this->assertBelongsTo($raffle, $participant);

        $participant->update($request->validated());

        // In a raffle file: absent, disqualified or back again in all of the file's raffles.
        if ($request->filled('status')) {
            $this->files->shareStatus($raffle, $participant->ticket_number, $participant->status->value);
        }

        return response()->json(['data' => new ParticipantResource($participant->refresh())]);
    }

    public function destroy(Raffle $raffle, Participant $participant): JsonResponse
    {
        $this->authorize('delete', $participant);
        $this->assertBelongsTo($raffle, $participant);

        if ($raffle->isLocked()) {
            return $this->lockedResponse($raffle, 'its participants cannot be deleted');
        }

        if ($participant->winners()->exists()) {
            return response()->json([
                'message' => 'This participant has won a raffle and cannot be deleted. Disqualify them instead.',
            ], 409);
        }

        $participant->delete();

        return response()->json(['message' => 'Participant deleted.']);
    }

    /** Remove every participant from this raffle, so a fresh CSV can be imported. */
    public function clear(Raffle $raffle): JsonResponse
    {
        $this->authorize('update', $raffle);

        if ($raffle->isLocked()) {
            return $this->lockedResponse($raffle, 'its participants cannot be cleared');
        }

        if ($raffle->winners()->exists()) {
            return response()->json([
                'message' => 'Winners have already been drawn for this raffle, so its participants cannot be cleared.',
            ], 409);
        }

        $deleted = $raffle->participants()->delete();

        return response()->json([
            'message' => 'Participants cleared.',
            'data' => ['deleted' => $deleted],
        ]);
    }

    /** Parse and validate a CSV without writing anything. */
    public function preview(ImportParticipantsRequest $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('import', Participant::class);

        try {
            $preview = $this->imports->preview($raffle, $request->file('file'));
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        unset($preview['rows']);

        return response()->json(['data' => $preview]);
    }

    public function import(ImportParticipantsRequest $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('import', Participant::class);

        try {
            $import = $this->imports->import(
                $raffle,
                $request->file('file'),
                $request->user(),
                $request->input('on_duplicate', 'skip'),
            );
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Import completed.',
            'data' => [
                'id' => $import->id,
                'original_filename' => $import->original_filename,
                'total_rows' => $import->total_rows,
                'imported_rows' => $import->imported_rows,
                'updated_rows' => $import->updated_rows,
                'skipped_rows' => $import->skipped_rows,
                'summary' => $import->summary,
            ],
        ], 201);
    }

    public function export(Request $request, Raffle $raffle): StreamedResponse
    {
        $this->authorize('viewAny', Participant::class);

        $query = $raffle->participants()
            ->search($request->string('search')->toString())
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')->toString()))
            ->when($request->filled('category'), fn ($q) => $q->where('category', $request->string('category')->toString()))
            ->when($request->filled('developer'), fn ($q) => $q->whereJsonContains('developers', $request->string('developer')->toString()))
            ->when($request->filled('location'), fn ($q) => $q->where('location', $request->string('location')->toString()))
            ->orderBy('ticket_number');

        $filename = $raffle->slug.'-participants-'.now()->format('Y-m-d-His').'.csv';

        return response()->streamDownload(function () use ($query) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['ticket_number', 'name', 'email', 'phone', 'tag', 'developers', 'location', 'status']);

            $query->chunkById(1000, function ($chunk) use ($handle) {
                foreach ($chunk as $participant) {
                    fputcsv($handle, [
                        // Prefixed so spreadsheet apps keep the leading zeros.
                        "\t".$participant->ticket_number,
                        $participant->name,
                        $participant->email,
                        $participant->phone,
                        $participant->category,
                        implode(' | ', (array) $participant->developers),
                        $participant->location,
                        $participant->status->value,
                    ]);
                }
            });

            fclose($handle);
        }, $filename, ['Content-Type' => 'text/csv']);
    }

    public function stats(Raffle $raffle): JsonResponse
    {
        $this->authorize('viewAny', Participant::class);

        return response()->json([
            'data' => DB::table('participants')
                ->where('raffle_id', $raffle->id)
                ->selectRaw('status, count(*) as total')
                ->groupBy('status')
                ->pluck('total', 'status'),
        ]);
    }

    /**
     * How many of this raffle's participants could win a next round drawn
     * from the given tags, developers or locations — leaving out anyone who already won
     * (or sat this one out), unless `leave_out` is off. Disqualified and absent never count.
     */
    public function poolCount(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('viewAny', Participant::class);

        $validated = $request->validate([
            'type' => ['nullable', 'in:all,tag,developer,location,both'],
            'values' => ['nullable', 'array', 'max:100'],
            'values.*' => ['string', 'max:160'],
            'tags' => ['nullable', 'array', 'max:100'],
            'tags.*' => ['string', 'max:160'],
            'developers' => ['nullable', 'array', 'max:100'],
            'developers.*' => ['string', 'max:160'],
            'locations' => ['nullable', 'array', 'max:100'],
            'locations.*' => ['string', 'max:160'],
            'leave_out' => ['nullable', 'boolean'],
        ]);
        $pool = Raffle::normalisePool([
            'type' => $validated['type'] ?? null,
            'values' => $validated['values'] ?? [],
            'tags' => $validated['tags'] ?? [],
            'developers' => $validated['developers'] ?? [],
            'locations' => $validated['locations'] ?? [],
        ]);

        $count = Raffle::applyPool($raffle->participants()->getQuery(), $pool)
            ->whereNotIn('status', [ParticipantStatus::Disqualified->value, ParticipantStatus::Absent->value])
            ->when($request->boolean('leave_out', true), fn ($q) => $q
                ->whereNotIn('status', [ParticipantStatus::Winner->value, ParticipantStatus::Excluded->value])
                ->whereNotIn('ticket_number', $raffle->winners()->select('ticket_number')))
            // Anyone who won in another raffle of the file — drawn there, or
            // on its pre-selected list — never wins another draw in it.
            // — unless the day puts its winners back in play; the big-prize winners stay out either way.
            ->whereNotIn('ticket_number', $raffle->dayWinnersBackIn()
                ? $raffle->ticketsKeptOut()
                : array_unique(array_merge($raffle->stagedTicketsAround(), $raffle->ticketsWonAround())))
            ->count();

        return response()->json(['data' => ['count' => $count]]);
    }

    /** The tags, developers and locations a raffle can be drawn from, with their ticket counts. */
    public function groups(Raffle $raffle, RaffleDrawService $draws): JsonResponse
    {
        $this->authorize('viewAny', Participant::class);

        return response()->json(['data' => $draws->poolOptions($raffle)]);
    }

    /** Guards against /raffles/1/participants/{id of another raffle's participant}. */
    protected function assertBelongsTo(Raffle $raffle, Participant $participant): void
    {
        abort_unless($participant->raffle_id === $raffle->id, 404);
    }

    protected function sortColumn(Request $request): string
    {
        $allowed = ['ticket_number', 'name', 'email', 'category', 'location', 'status', 'created_at'];
        $sort = $request->string('sort')->toString();

        return in_array($sort, $allowed, true) ? $sort : 'ticket_number';
    }
}
