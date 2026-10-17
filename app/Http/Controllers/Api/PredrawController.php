<?php

namespace App\Http\Controllers\Api;

use App\Enums\ParticipantStatus;
use App\Enums\RaffleStatus;
use App\Http\Controllers\Controller;
use App\Models\Raffle;
use App\Models\RaffleFile;
use App\Models\RaffleSetting;
use App\Services\RaffleDrawService;
use App\Services\RaffleFileService;
use App\Exceptions\DrawException;
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
 * pre-draw has won: no ordinary draw can pick them (see Raffle::stagedTicketsAround).
 *
 * A raffle already drawn can be kept as a pre-draw too (`keep`): its winners
 * become its pre-selected list, in the order they came out, and it is
 * locked so nobody can change them. Put in a set, it is played again at the
 * event (`replay`) — the screens run the draw and land on the same winners.
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
            // In playing order: by set, then newest first among the rest.
            ->orderByRaw('case when draw_day is null then 1 else 0 end')
            ->orderBy('draw_day')
            ->orderByRaw('case when draw_set is null then 1 else 0 end')
            ->orderBy('draw_set')
            ->orderByDesc('id')
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
                'draw_day' => $source->draw_day,
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
                ['raffle_id', 'ticket_number', 'name', 'email', 'phone', 'category', 'developers', 'location', 'metadata', 'status', 'created_at', 'updated_at'],
                DB::table('participants')
                    ->where('raffle_id', $source->id)
                    ->selectRaw(
                        "?, ticket_number, name, email, phone, category, developers, location, metadata, case when status in (?, ?) then status else ? end, ?, ?",
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

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            // Made inside one of the file's days: Day 1, Day 2, …
            'draw_day' => ['nullable', 'integer', 'min:1', 'max:30'],
        ]);

        if (! $raffleFile->hasParticipants()) {
            return response()->json(['message' => 'Upload this raffle file\'s participants first.'], 422);
        }

        $latest = $raffleFile->raffles()->where('is_predraw', false)->latest('id')->first();
        $name = trim($validated['name']);

        $predraw = DB::transaction(function () use ($raffleFile, $latest, $name, $request, $validated) {
            $predraw = Raffle::create(($latest?->only(['description', 'logos', 'logo_left', 'logo_right']) ?? []) + [
                'name' => $name,
                'draw_day' => $validated['draw_day'] ?? null,
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

    /**
     * Keep raffles already drawn as pre-draws, their winners intact: each
     * winner becomes a pre-selected winner in the place they were drawn,
     * with the prize they won, and the raffle is locked so the list cannot
     * be changed. Its winners, draw history and prizes stay as they are.
     * Optionally put straight into a set, so the event follows that order.
     * A pre-draw among them is only locked (and put in the set).
     */
    public function keep(Request $request, RaffleFileService $files): JsonResponse
    {
        $this->authorize('create', Raffle::class);

        $validated = $request->validate([
            'raffle_ids' => ['required', 'array', 'min:1', 'max:200'],
            'raffle_ids.*' => ['integer', 'distinct', 'exists:raffles,id'],
            'draw_set' => ['nullable', 'integer', 'min:1', 'max:50'],
            'draw_day' => ['nullable', 'integer', 'min:1', 'max:30'],
        ]);

        $kept = [];
        $skipped = [];

        foreach (Raffle::query()->whereIn('id', $validated['raffle_ids'])->orderBy('id')->get() as $raffle) {
            $problem = DB::transaction(function () use ($raffle, $request, $validated) {
                /** @var Raffle $locked */
                $locked = Raffle::query()->whereKey($raffle->id)->lockForUpdate()->firstOrFail();

                if ($locked->isArchived()) {
                    return 'it is archived';
                }

                if ($locked->winners()->doesntExist() && ! $locked->hasStagedWinners()) {
                    return 'it has no winners yet';
                }

                $attributes = ['locked_at' => $locked->locked_at ?? now()];

                if ($request->has('draw_set')) {
                    $attributes['draw_set'] = $validated['draw_set'] ?? null;
                }

                if ($request->has('draw_day')) {
                    $attributes['draw_day'] = $validated['draw_day'] ?? null;
                }

                if (! $locked->is_predraw && ! $locked->keepWinnersAsList()) {
                    return 'one of its winners is no longer in its participant list';
                }

                $locked->forceFill($attributes)->save();
                $locked->markTicketsWon($locked->stagedTicketNumbers());

                return null;
            });

            if ($problem === null) {
                $kept[] = $raffle->id;
            } else {
                $skipped[] = ['id' => $raffle->id, 'name' => $raffle->name, 'reason' => $problem];
            }
        }

        // Put on a day: the winner marks follow.
        if ($kept !== [] && $request->has('draw_day')) {
            foreach (Raffle::query()->whereIn('id', $kept)->whereNotNull('raffle_file_id')->with('raffleFile')->get()->pluck('raffleFile')->unique('id') as $file) {
                $files->resyncWinnerMarks($file);
            }
        }

        return response()->json([
            'message' => count($kept) === 0
                ? 'Nothing was kept: '.implode('; ', array_map(fn ($row) => "{$row['name']} — {$row['reason']}", $skipped)).'.'
                : sprintf('%d raffle%s kept as pre-draw%s, winners locked.', count($kept), count($kept) === 1 ? '' : 's', count($kept) === 1 ? '' : 's'),
            'data' => ['kept' => $kept, 'skipped' => $skipped],
        ]);
    }

    /**
     * Play pre-draws again, for the event: their revealed winners are cleared
     * so the screens can run the draw once more, and the draw lands on the
     * same winners because the pre-selected list stays as it is.
     */
    public function replay(Request $request, RaffleDrawService $draws): JsonResponse
    {
        $this->authorize('create', Raffle::class);

        $validated = $request->validate([
            'raffle_ids' => ['required', 'array', 'min:1', 'max:200'],
            'raffle_ids.*' => ['integer', 'distinct', 'exists:raffles,id'],
        ]);

        $reset = [];
        $skipped = [];

        foreach (Raffle::query()->whereIn('id', $validated['raffle_ids'])->orderBy('id')->get() as $raffle) {
            try {
                $draws->replay($raffle, $request->user(), $request->ip());
                $reset[] = $raffle->id;
            } catch (DrawException $e) {
                $skipped[] = ['id' => $raffle->id, 'name' => $raffle->name, 'reason' => $e->getMessage()];
            }
        }

        return response()->json([
            'message' => count($reset) === 0
                ? 'Nothing was reset: '.implode('; ', array_map(fn ($row) => "{$row['name']} — {$row['reason']}", $skipped))
                : sprintf('%d pre-draw%s ready to play again with the same winners.', count($reset), count($reset) === 1 ? '' : 's'),
            'data' => ['reset' => $reset, 'skipped' => $skipped],
        ]);
    }

    /** Lock a raffle's winners: no change to them until it is unlocked. */
    public function lock(Raffle $raffle): JsonResponse
    {
        $this->authorize('update', $raffle);

        if (! $raffle->isLocked()) {
            $raffle->forceFill(['locked_at' => now()])->save();
        }

        return response()->json(['message' => 'Winners locked.', 'data' => ['is_locked' => true]]);
    }

    /**
     * Unlock a raffle's winners — only with the owner PIN (RAFFLE_OWNER_PIN
     * in .env), since every operator is signed in as the administrator.
     */
    public function unlock(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('update', $raffle);

        $validated = $request->validate(['pin' => ['required', 'string', 'max:64']]);
        $pin = (string) config('raffle.owner_pin');

        if ($pin === '') {
            return response()->json(['message' => 'No owner PIN is set. Put RAFFLE_OWNER_PIN in the .env file first.'], 422);
        }

        if (! hash_equals($pin, trim($validated['pin']))) {
            return response()->json(['message' => 'Wrong PIN.'], 403);
        }

        $raffle->forceFill(['locked_at' => null])->save();

        return response()->json(['message' => 'Winners unlocked. Lock them again when you are done.', 'data' => ['is_locked' => false]]);
    }

    public function destroy(Raffle $raffle): JsonResponse
    {
        $this->authorize('delete', $raffle);

        abort_unless($raffle->is_predraw, 404);

        if ($raffle->isLocked()) {
            return $this->lockedResponse($raffle, 'it cannot be deleted');
        }

        DB::transaction(function () use ($raffle) {
            $tickets = $raffle->stagedTicketNumbers();

            $raffle->delete();

            // Its winners won nothing after all: wherever they were shown as a
            // winner only because of it, they are back in play.
            $raffle->releaseTickets($tickets);
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
            'raffle_file_id' => $raffle->raffle_file_id,
            'draw_day' => $raffle->draw_day,
            'draw_set' => $raffle->draw_set,
            'name' => $raffle->name,
            'status' => $raffle->status->value,
            'is_predraw' => true,
            'is_locked' => $raffle->isLocked(),
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
