<?php

namespace App\Http\Controllers\Api;

use App\Enums\RaffleStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\ImportParticipantsRequest;
use App\Models\Participant;
use App\Models\Raffle;
use App\Models\RaffleFile;
use App\Services\RaffleFileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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

    /** Who can win, for a raffle being made in this file: its tags and developers. */
    public function groups(RaffleFile $raffleFile): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        return response()->json(['data' => $this->files->poolOptions($raffleFile)]);
    }

    /** @return array<string, mixed> */
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
