<?php

namespace App\Http\Controllers\Api;

use App\Enums\ParticipantStatus;
use App\Enums\RaffleStatus;
use App\Http\Controllers\Controller;
use App\Models\Raffle;
use App\Models\RaffleFile;
use App\Models\RaffleSetting;
use App\Services\RaffleFileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Pre-draws — the Control Center's "Pre-drawn" section. A pre-draw is a
 * draw whose winners were chosen before the event: the operator makes one,
 * picks its winners with their prizes, and plays it on the main screen,
 * where it runs like any draw (countdown, rolling names, reveal) but lands
 * on the chosen winners. Each pre-draw is a raffle of its own, apart from
 * the ordinary raffles; it gets a copy of the participants of the raffle it
 * is made from, so its winners are picked from the same people. Anyone on a
 * pre-draw has won: no ordinary draw can pick them (see Raffle::stagedTickets).
 */
class PredrawController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        $predraws = Raffle::query()
            ->where('is_predraw', true)
            ->notArchived()
            // One raffle file's pre-draws: the file's "Pre-draw" tab.
            ->when($request->filled('raffle_file_id'), fn ($q) => $q->where('raffle_file_id', $request->integer('raffle_file_id')))
            ->withCount('winners as winners_drawn_count')
            ->with('sourceRaffle:id,name')
            ->latest('id')
            ->get()
            ->map(fn (Raffle $raffle) => $this->summary($raffle));

        return response()->json(['data' => $predraws]);
    }

    public function store(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('create', Raffle::class);

        $validated = $request->validate(['name' => ['required', 'string', 'max:160']]);

        // Made from an ordinary raffle; made from a pre-draw, it uses that one's source.
        $source = $raffle->is_predraw && $raffle->sourceRaffle ? $raffle->sourceRaffle : $raffle;

        $predraw = DB::transaction(function () use ($source, $validated, $request) {
            $name = trim($validated['name']);

            $predraw = Raffle::create($source->only(['description', 'logos', 'logo_left', 'logo_right']) + [
                'name' => $name,
                'slug' => $this->uniqueSlug($name),
                'winners_count' => 1,
                'status' => RaffleStatus::Ready->value,
                'is_predraw' => true,
                'source_raffle_id' => $source->id,
                // In the same raffle file, so the file's Control Center lists it.
                'raffle_file_id' => $source->raffle_file_id,
                'created_by' => $request->user()->id,
            ]);

            RaffleSetting::create(
                ['raffle_id' => $predraw->id] +
                ($source->settings?->only([
                    'sound_countdown', 'sound_drawing', 'sound_winner', 'sound_celebration',
                    'show_confetti', 'countdown_seconds', 'roll_duration_ms', 'draw_mode',
                ]) ?? [])
            );

            // Disqualified stay disqualified and earlier winners stay winners;
            // everyone else can be picked.
            $active = ParticipantStatus::Active->value;
            $winner = ParticipantStatus::Winner->value;
            $disqualified = ParticipantStatus::Disqualified->value;
            $now = now()->toDateTimeString();

            DB::table('participants')->insertUsing(
                ['raffle_id', 'ticket_number', 'name', 'email', 'phone', 'category', 'developers', 'metadata', 'status', 'created_at', 'updated_at'],
                DB::table('participants')
                    ->where('raffle_id', $source->id)
                    ->selectRaw(
                        "?, ticket_number, name, email, phone, category, developers, metadata, case when status in (?, ?) then status else ? end, ?, ?",
                        [$predraw->id, $disqualified, $winner, $active, $now, $now],
                    ),
            );

            return $predraw;
        });

        return response()->json([
            'message' => 'Pre-draw created.',
            'data' => $this->summary($predraw->loadCount('winners as winners_drawn_count')->load('sourceRaffle:id,name')),
        ], 201);
    }

    /**
     * A pre-draw made in a raffle file: its participants are the file's, and
     * it starts with the logos of the file's latest raffle, if it has one.
     */
    public function storeForFile(Request $request, RaffleFile $raffleFile, RaffleFileService $files): JsonResponse
    {
        $this->authorize('create', Raffle::class);

        $validated = $request->validate(['name' => ['required', 'string', 'max:160']]);

        if (! $raffleFile->hasParticipants()) {
            return response()->json(['message' => 'Upload this raffle file\'s participants first.'], 422);
        }

        $latest = $raffleFile->raffles()->where('is_predraw', false)->latest('id')->first();
        $name = trim($validated['name']);

        $predraw = DB::transaction(function () use ($raffleFile, $latest, $name, $request) {
            $predraw = Raffle::create(($latest?->only(['description', 'logos', 'logo_left', 'logo_right']) ?? []) + [
                'name' => $name,
                'slug' => $this->uniqueSlug($name),
                'winners_count' => 1,
                'status' => RaffleStatus::Ready->value,
                'is_predraw' => true,
                'raffle_file_id' => $raffleFile->id,
                'created_by' => $request->user()->id,
            ]);

            RaffleSetting::create(
                ['raffle_id' => $predraw->id] +
                ($latest?->settings?->only([
                    'sound_countdown', 'sound_drawing', 'sound_winner', 'sound_celebration',
                    'show_confetti', 'countdown_seconds', 'roll_duration_ms', 'draw_mode',
                ]) ?? [])
            );

            return $predraw;
        });

        $files->importInto($raffleFile, $predraw, $request->user());

        return response()->json([
            'message' => 'Pre-draw created.',
            'data' => $this->summary($predraw->loadCount('winners as winners_drawn_count')->load('sourceRaffle:id,name')),
        ], 201);
    }

    public function destroy(Raffle $raffle): JsonResponse
    {
        $this->authorize('delete', $raffle);

        abort_unless($raffle->is_predraw, 404);

        DB::transaction(function () use ($raffle) {
            $tickets = $raffle->stagedTicketNumbers();

            $raffle->delete();

            // Its winners won nothing after all: wherever they were shown as a
            // winner only because of it, they are back in play.
            Raffle::releaseTickets($tickets);
        });

        return response()->json(['message' => 'Pre-draw deleted.']);
    }

    /** @return array<string, mixed> */
    protected function summary(Raffle $raffle): array
    {
        $prizes = [];
        foreach ($raffle->stagedWinners() as $entry) {
            $prizes[$entry['prize_name']] = ($prizes[$entry['prize_name']] ?? 0) + 1;
        }

        return [
            'id' => $raffle->id,
            'name' => $raffle->name,
            'status' => $raffle->status->value,
            'source_raffle' => $raffle->sourceRaffle ? ['id' => $raffle->sourceRaffle->id, 'name' => $raffle->sourceRaffle->name] : null,
            'winners_count' => count($raffle->stagedWinners()),
            'winners_drawn' => (int) ($raffle->winners_drawn_count ?? 0),
            'prizes' => array_map(fn ($name, $count) => ['prize_name' => $name, 'count' => $count], array_keys($prizes), $prizes),
            'winners' => array_map(fn ($entry) => [
                'name' => $entry['name'],
                'ticket_number' => $entry['ticket_number'],
                'prize_name' => $entry['prize_name'],
            ], $raffle->stagedWinnerList()),
            'created_at' => $raffle->created_at?->toIso8601String(),
        ];
    }

    protected function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'pre-draw';
        $slug = $base;
        $i = 2;

        while (Raffle::query()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }
}
