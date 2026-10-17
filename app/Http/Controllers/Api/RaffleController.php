<?php

namespace App\Http\Controllers\Api;

use App\Enums\ParticipantStatus;
use App\Enums\RaffleStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRaffleRequest;
use App\Http\Requests\UpdateRaffleRequest;
use App\Http\Resources\DrawEventResource;
use App\Http\Resources\RaffleResource;
use App\Http\Resources\WinnerResource;
use App\Models\Raffle;
use App\Models\RaffleSetting;
use App\Services\RaffleDrawService;
use App\Services\RaffleFileService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RaffleController extends Controller
{
    public function __construct(protected RaffleDrawService $draws) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        $perPage = min(max((int) $request->integer('per_page', 15), 5), 100);

        $raffles = Raffle::query()
            ->withCount(['winners as winners_drawn_count', 'participants', 'predraws'])
            // The Control Center's "All raffles": every raffle with its winners.
            ->when($request->boolean('with_winners'), fn ($q) => $q->with(['winners.participant', 'winners.prize']))
            ->when(! $request->boolean('include_archived'), fn ($q) => $q->notArchived())
            // Pre-draws have their own list (the Control Center's "Pre-drawn").
            ->when(! $request->boolean('include_predraws'), fn ($q) => $q->where('is_predraw', false))
            // One raffle file's raffles: the file's page and the Control Center's file picker.
            ->when($request->filled('raffle_file_id'), fn ($q) => $q->where('raffle_file_id', $request->integer('raffle_file_id')))
            // The Raffles page's "not in a file" list.
            ->when($request->boolean('unfiled'), fn ($q) => $q->whereNull('raffle_file_id'))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')->toString()))
            ->when($request->filled('search'), function ($q) use ($request) {
                $like = '%'.$request->string('search')->toString().'%';
                $q->where(fn ($sub) => $sub->where('name', 'like', $like)->orWhere('prize_name', 'like', $like));
            })
            ->latest('created_at')
            ->paginate($perPage)
            ->withQueryString();

        return response()->json([
            'data' => RaffleResource::collection($raffles->items()),
            'meta' => [
                'current_page' => $raffles->currentPage(),
                'last_page' => $raffles->lastPage(),
                'per_page' => $raffles->perPage(),
                'total' => $raffles->total(),
            ],
            'filters' => ['statuses' => RaffleStatus::values()],
        ]);
    }

    public function store(StoreRaffleRequest $request): JsonResponse
    {
        $this->authorize('create', Raffle::class);

        $prizes = $request->input('prizes') ?? [];
        $total = array_sum(array_column($prizes, 'winners_count'));

        if ($total > RafflePrizeController::MAX_WINNERS) {
            return response()->json(['message' => 'A raffle can have at most '.RafflePrizeController::MAX_WINNERS.' winners across all its prizes.'], 422);
        }

        $raffle = DB::transaction(function () use ($request, $prizes, $total) {
            $raffle = Raffle::create(array_filter($request->safe()->except(['settings', 'prizes', 'ready']), fn ($value) => $value !== null) + [
                'winners_count' => 1,
                'slug' => $this->uniqueSlug($request->string('name')->toString()),
                'status' => $request->input('status', RaffleStatus::Draft->value),
                'created_by' => $request->user()->id,
            ]);

            RaffleSetting::create(['raffle_id' => $raffle->id] + (array) $request->input('settings', []));

            // Its prize list, set up with it; the number of winners follows the list.
            foreach (array_values($prizes) as $order => $row) {
                $raffle->prizes()->create(RafflePrizeController::attributes($row, $order));
            }

            if ($prizes !== []) {
                $raffle->forceFill(['winners_count' => $total])->save();
            }

            return $raffle;
        });

        // Made in a raffle file: it starts with the file's participants.
        if ($raffle->raffleFile) {
            app(RaffleFileService::class)->importInto($raffle->raffleFile, $raffle, $request->user());
        }

        // Saved ready to draw: only once it has its prizes and participants.
        if ($request->boolean('ready') && $prizes !== [] && $raffle->participants()->exists()) {
            $raffle->forceFill(['status' => RaffleStatus::Ready])->save();
        }

        return response()->json(['data' => new RaffleResource($this->loadRaffle($raffle))], 201);
    }

    public function show(Raffle $raffle): JsonResponse
    {
        $this->authorize('view', $raffle);

        return response()->json([
            'data' => new RaffleResource($this->loadRaffle($raffle)),
            'eligible_count' => $this->draws->eligibleTicketCount($raffle),
        ]);
    }

    public function update(UpdateRaffleRequest $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('update', $raffle);

        $data = $request->safe()->except('settings');

        // With a prize list, the number of winners comes from the prizes.
        if ($raffle->prizes()->exists()) {
            unset($data['winners_count']);
        }

        // Locked: the name, logos and settings can change; the winners cannot.
        if ($raffle->isLocked()) {
            unset($data['winners_count'], $data['status'], $data['allow_repeat_winners'], $data['draw_filter']);
        }

        if (isset($data['winners_count']) && $data['winners_count'] < $raffle->winners()->count()) {
            return response()->json([
                'message' => 'This raffle already has more winners drawn than that. To draw fewer winners, use Redraw — it clears the winners and lets you set the new number.',
            ], 422);
        }

        if ($raffle->status === RaffleStatus::Completed && isset($data['status']) && $data['status'] === RaffleStatus::Live->value) {
            return response()->json(['message' => 'A completed raffle cannot be set back to live.'], 422);
        }

        $keepOutChanged = array_key_exists('winners_out_for_event', $data) && (bool) $data['winners_out_for_event'] !== (bool) $raffle->winners_out_for_event;

        DB::transaction(function () use ($raffle, $data, $request) {
            $raffle->update($data);

            if ($request->filled('settings')) {
                RaffleSetting::updateOrCreate(
                    ['raffle_id' => $raffle->id],
                    (array) $request->input('settings'),
                );
            }
        });

        // Its winners now sit out the whole event (or no longer do): the
        // file's other lists show them accordingly.
        if ($keepOutChanged && $raffle->raffleFile) {
            app(RaffleFileService::class)->resyncWinnerMarks($raffle->raffleFile);
        }

        return response()->json(['data' => new RaffleResource($this->loadRaffle($raffle->refresh()))]);
    }

    public function destroy(Raffle $raffle): JsonResponse
    {
        $this->authorize('delete', $raffle);

        if ($raffle->isLocked()) {
            return $this->lockedResponse($raffle, 'it cannot be deleted');
        }

        DB::transaction(function () use ($raffle) {
            // Its pre-draws go with it: they were made from its participants,
            // and would otherwise be left behind with their winners.
            $predraws = Raffle::query()->where('is_predraw', true)->where('source_raffle_id', $raffle->id)->get();
            $tickets = $raffle->stagedTicketNumbers();

            foreach ($predraws as $predraw) {
                $tickets = array_merge($tickets, $predraw->stagedTicketNumbers());
                $predraw->delete();
            }

            $raffle->delete();

            // Their pre-selected winners won nothing after all: back in play
            // wherever they were shown as a winner only because of them.
            $raffle->releaseTickets(array_values(array_unique($tickets)));
        });

        return response()->json(['message' => 'Raffle deleted.']);
    }

    /**
     * The next round of the event, straight from the Control Center: only its
     * winners, prize and who can win are chosen. One prize makes a plain
     * raffle drawn from that pool; several make a prize list. Everything else — logos, sound, how the draw runs —
     * and the participants come from this raffle, so the new round is READY
     * to draw at once. Anyone who already won here (or was left out of this
     * round) can be left out of the next one too.
     */
    public function nextRound(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('create', Raffle::class);

        $validated = $request->validate(RafflePrizeController::rules(1) + [
            'name' => ['nullable', 'string', 'max:160'],
            'leave_out_winners' => ['boolean'],
            // This round's own logos; left out, they are copied from this raffle.
            'logos' => ['sometimes', 'nullable', 'array', 'max:20'],
            'logos.*' => ['string', 'distinct', \Illuminate\Validation\Rule::in(\App\Support\RaffleLogos::ids())],
            'logo_left' => ['sometimes', 'nullable', 'string', \Illuminate\Validation\Rule::in(\App\Support\RaffleLogos::ids())],
            'logo_right' => ['sometimes', 'nullable', 'string', \Illuminate\Validation\Rule::in(\App\Support\RaffleLogos::ids())],
        ], RafflePrizeController::messages());

        $total = array_sum(array_column($validated['prizes'], 'winners_count'));

        if ($total > RafflePrizeController::MAX_WINNERS) {
            return response()->json(['message' => 'A raffle can have at most '.RafflePrizeController::MAX_WINNERS.' winners across all its prizes.'], 422);
        }

        $leaveOut = (bool) ($validated['leave_out_winners'] ?? true);

        $round = DB::transaction(function () use ($raffle, $validated, $total, $leaveOut) {
            $name = trim($validated['name'] ?? '') ?: $raffle->name;
            $first = $validated['prizes'][0];

            $logos = array_intersect_key($validated, array_flip(['logos', 'logo_left', 'logo_right']));

            $round = Raffle::create($logos + $raffle->only([
                'description', 'logos', 'logo_left', 'logo_right', 'participant_pool', 'allow_repeat_winners',
            ]) + [
                'name' => $name,
                'slug' => $this->uniqueSlug($name),
                // The headline prize, for the lists outside the Control Center.
                'prize_name' => trim($first['prize_name']),
                'prize_type' => $first['prize_type'] ?? 'cash',
                'prize_value' => $first['prize_value'] ?? null,
                'prize_currency' => $first['prize_currency'] ?? 'PHP',
                'winners_count' => $total,
                // With one prize, who can win is the raffle's own pool.
                'draw_filter' => count($validated['prizes']) === 1 ? Raffle::normalisePool($first['draw_filter'] ?? null) : null,
                'status' => RaffleStatus::Draft->value,
                'created_by' => request()->user()->id,
            ]);

            if (count($validated['prizes']) > 1) {
                foreach ($validated['prizes'] as $order => $row) {
                    $round->prizes()->create(RafflePrizeController::attributes($row, $order));
                }
            }

            RaffleSetting::create(
                ['raffle_id' => $round->id] +
                ($raffle->settings?->only([
                    'sound_countdown', 'sound_drawing', 'sound_winner', 'sound_celebration',
                    'show_confetti', 'countdown_seconds', 'roll_duration_ms', 'draw_mode',
                ]) ?? [])
            );

            // Disqualified and absent stay that way. With winners left out, this
            // round's winners — and anyone an earlier round already left out —
            // sit this one out too. Everyone else starts fresh.
            $active = ParticipantStatus::Active->value;
            $out = ParticipantStatus::Excluded->value;
            $status = $leaveOut
                ? "case when status in ('DISQUALIFIED', 'ABSENT') then status
                       when status in ('WINNER', 'EXCLUDED') then '{$out}'
                       when exists (select 1 from winners w where w.raffle_id = participants.raffle_id and w.ticket_number = participants.ticket_number) then '{$out}'
                       else '{$active}' end"
                : "case when status in ('DISQUALIFIED', 'ABSENT') then status else '{$active}' end";
            $now = now()->toDateTimeString();

            DB::table('participants')->insertUsing(
                ['raffle_id', 'ticket_number', 'name', 'email', 'phone', 'category', 'developers', 'location', 'metadata', 'status', 'created_at', 'updated_at'],
                DB::table('participants')
                    ->where('raffle_id', $raffle->id)
                    ->selectRaw("?, ticket_number, name, email, phone, category, developers, location, metadata, {$status}, ?, ?", [$round->id, $now, $now]),
            );

            if ($round->participants()->exists()) {
                $round->update(['status' => RaffleStatus::Ready->value]);
            }

            return $round;
        });

        return response()->json(['data' => new RaffleResource($this->loadRaffle($round->refresh()))], 201);
    }

    /** Copy a raffle's configuration back to DRAFT — without participants, winners or draw history. */
    public function duplicate(Raffle $raffle): JsonResponse
    {
        $this->authorize('create', Raffle::class);

        $copy = DB::transaction(function () use ($raffle) {
            $copy = Raffle::create($raffle->only([
                'raffle_file_id', 'description', 'prize_name', 'prize_type', 'prize_value', 'prize_currency', 'logos', 'logo_left', 'logo_right',
                'winners_count', 'participant_pool', 'draw_filter', 'allow_repeat_winners',
            ]) + [
                'name' => Str::limit($raffle->name.' (Copy)', 160, ''),
                'slug' => $this->uniqueSlug($raffle->name.' copy'),
                'status' => RaffleStatus::Draft->value,
                'created_by' => request()->user()->id,
            ]);

            foreach ($raffle->prizes as $prize) {
                $copy->prizes()->create($prize->only([
                    'sort_order', 'winners_count', 'prize_name', 'prize_type', 'prize_value',
                    'prize_currency', 'draw_filter', 'include_previous_winners',
                ]));
            }

            RaffleSetting::create(
                ['raffle_id' => $copy->id] +
                ($raffle->settings?->only([
                    'sound_countdown', 'sound_drawing', 'sound_winner', 'sound_celebration',
                    'show_confetti', 'countdown_seconds', 'roll_duration_ms', 'draw_mode',
                ]) ?? [])
            );

            return $copy;
        });

        // A copy made in a raffle file starts with the file's participants, like any raffle made there.
        if ($copy->raffleFile) {
            app(RaffleFileService::class)->importInto($copy->raffleFile, $copy, request()->user());
        }

        return response()->json(['data' => new RaffleResource($this->loadRaffle($copy))], 201);
    }

    public function archive(Raffle $raffle): JsonResponse
    {
        $this->authorize('archive', $raffle);

        $raffle->update(['archived_at' => now()]);

        return response()->json(['data' => new RaffleResource($this->loadRaffle($raffle->refresh()))]);
    }

    public function restore(Raffle $raffle): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        $raffle->update(['archived_at' => null]);

        return response()->json(['data' => new RaffleResource($this->loadRaffle($raffle->refresh()))]);
    }

    /**
     * Put a raffle in a raffle file, or take it out (null). It keeps its own
     * participants and winners; only where it is listed changes.
     */
    public function moveToFile(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        $validated = $request->validate([
            'raffle_file_id' => ['nullable', 'integer', 'exists:raffle_files,id'],
        ]);

        $raffle->update(['raffle_file_id' => $validated['raffle_file_id'] ?? null]);

        return response()->json(['data' => new RaffleResource($this->loadRaffle($raffle->refresh()))]);
    }

    /**
     * Put the chosen raffles in a set — 1 for the First Set, 2 for the
     * Second, … — or take them out of their set (null); and, or instead, on
     * a day of the event — 1 for Day 1, … — or off their day (null). Only
     * what is sent changes. Days and sets only order the raffles for
     * drawing; nothing about the draw itself changes.
     */
    public function assignSet(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        $validated = $request->validate([
            'raffle_ids' => ['required', 'array', 'min:1', 'max:200'],
            'raffle_ids.*' => ['integer', 'distinct', 'exists:raffles,id'],
            'draw_set' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:50'],
            'draw_day' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:30'],
        ]);

        $changes = array_intersect_key($validated, array_flip(['draw_set', 'draw_day']));

        if ($changes === []) {
            return response()->json(['message' => 'Choose a set or a day.'], 422);
        }

        $updated = Raffle::query()->whereIn('id', $validated['raffle_ids'])->update($changes);

        // A new day is a fresh start: the winner marks follow the raffles.
        if (array_key_exists('draw_day', $changes)) {
            $files = Raffle::query()->whereIn('id', $validated['raffle_ids'])->whereNotNull('raffle_file_id')->with('raffleFile')->get()->pluck('raffleFile')->unique('id');

            foreach ($files as $file) {
                app(RaffleFileService::class)->resyncWinnerMarks($file);
            }
        }

        return response()->json(['message' => isset($changes['draw_day']) ? 'Days saved.' : 'Sets saved.', 'data' => ['updated' => $updated]]);
    }

    /**
     * Turn a raffle into a pre-draw (its winners are then picked before the
     * event and revealed by the draw), or a pre-draw back into an ordinary
     * raffle. Only before any winner is drawn. A pre-draw gives each winner
     * their own prize, so a raffle's prize list goes; a pre-draw's picked
     * winners go back into play when it becomes an ordinary raffle again.
     */
    public function convert(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('update', $raffle);

        $validated = $request->validate(['to' => ['required', 'in:predraw,raffle']]);
        $toPredraw = $validated['to'] === 'predraw';

        if ($raffle->is_predraw === $toPredraw) {
            return response()->json(['message' => $toPredraw ? 'This is already a pre-draw.' : 'This is already an ordinary raffle.'], 422);
        }

        if ($raffle->isLocked()) {
            return $this->lockedResponse($raffle, 'it cannot be changed into an ordinary raffle');
        }

        if ($raffle->winners()->exists()) {
            return response()->json([
                'message' => 'This raffle already has winners. Clear them first (Clear winners & redraw), then change it.',
            ], 409);
        }

        DB::transaction(function () use ($raffle, $toPredraw) {
            $locked = Raffle::query()->whereKey($raffle->id)->lockForUpdate()->firstOrFail();
            $hasParticipants = $locked->participants()->exists();

            if ($toPredraw) {
                $locked->prizes()->delete();
                // It keeps its set: pre-draws are played in set order too.
                $locked->forceFill([
                    'is_predraw' => true,
                    'winners_count' => 1,
                    'status' => $hasParticipants ? RaffleStatus::Ready : RaffleStatus::Draft,
                    'completed_at' => null,
                ])->save();

                return;
            }

            $tickets = $locked->stagedTicketNumbers();

            $locked->forceFill([
                'is_predraw' => false,
                'source_raffle_id' => null,
                'staged_winners' => null,
                'winners_count' => 1,
                // It needs its prizes again before it is ready to draw.
                'status' => RaffleStatus::Draft,
                'completed_at' => null,
            ])->save();

            $locked->releaseTickets($tickets);
        });

        return response()->json([
            'message' => $toPredraw ? 'Changed to a pre-draw.' : 'Changed to an ordinary raffle.',
            'data' => new RaffleResource($this->loadRaffle($raffle->refresh())),
        ]);
    }

    /** Move a raffle through its lifecycle: ready / live / paused / completed / cancelled. */
    public function transition(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('update', $raffle);

        $validated = $request->validate([
            'action' => ['required', 'in:ready,start,pause,complete,cancel,reopen'],
        ]);

        $target = match ($validated['action']) {
            'ready' => RaffleStatus::Ready,
            'start' => RaffleStatus::Live,
            'pause' => RaffleStatus::Ready,
            'complete' => RaffleStatus::Completed,
            'cancel' => RaffleStatus::Cancelled,
            'reopen' => RaffleStatus::Ready,
        };

        if ($raffle->status === RaffleStatus::Completed && $validated['action'] === 'start') {
            return response()->json(['message' => 'This raffle is already completed.'], 409);
        }

        if ($raffle->isLocked() && $validated['action'] === 'cancel') {
            return $this->lockedResponse($raffle, 'it cannot be cancelled');
        }

        if (in_array($validated['action'], ['ready', 'start'], true) && blank($raffle->prize_name) && $raffle->prizes()->doesntExist()) {
            return response()->json([
                'message' => 'Set the number of winners and the prize first.',
            ], 422);
        }

        if (in_array($validated['action'], ['ready', 'start'], true) && $raffle->participants()->doesntExist()) {
            return response()->json([
                'message' => 'This raffle has no participants yet. Import a participant CSV first.',
            ], 422);
        }

        $raffle->update([
            'status' => $target->value,
            'completed_at' => $target === RaffleStatus::Completed ? now() : null,
        ]);

        return response()->json(['data' => new RaffleResource($this->loadRaffle($raffle->refresh()))]);
    }

    /** Admin winner list — includes participant identity, unlike the public display. */
    public function winners(Raffle $raffle): JsonResponse
    {
        $this->authorize('view', $raffle);

        $winners = $raffle->winners()
            ->with(['participant', 'drawEvent', 'drawnBy', 'raffle'])
            ->get();

        return response()->json(['data' => WinnerResource::collection($winners)]);
    }

    public function drawEvents(Raffle $raffle): JsonResponse
    {
        $this->authorize('view', $raffle);

        $events = $raffle->drawEvents()->with('user')->limit(200)->get();

        return response()->json(['data' => DrawEventResource::collection($events)]);
    }

    protected function loadRaffle(Raffle $raffle): Raffle
    {
        return $raffle->loadMissing(['settings', 'creator', 'winners'])
            ->loadCount(['winners as winners_drawn_count', 'participants', 'predraws']);
    }

    protected function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'raffle';
        $slug = $base;
        $i = 2;

        while (Raffle::query()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }
}
