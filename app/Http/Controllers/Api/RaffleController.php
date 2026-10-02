<?php

namespace App\Http\Controllers\Api;

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
            ->withCount(['winners as winners_drawn_count', 'participants'])
            ->when(! $request->boolean('include_archived'), fn ($q) => $q->notArchived())
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

        $raffle = DB::transaction(function () use ($request) {
            $raffle = Raffle::create($request->safe()->except('settings') + [
                'slug' => $this->uniqueSlug($request->string('name')->toString()),
                'status' => $request->input('status', RaffleStatus::Draft->value),
                'created_by' => $request->user()->id,
            ]);

            RaffleSetting::create(['raffle_id' => $raffle->id] + (array) $request->input('settings', []));

            return $raffle;
        });

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

        if (isset($data['winners_count']) && $data['winners_count'] < $raffle->winners()->count()) {
            return response()->json([
                'message' => 'This raffle already has more winners drawn than that. To draw fewer winners, use Redraw — it clears the winners and lets you set the new number.',
            ], 422);
        }

        if ($raffle->status === RaffleStatus::Completed && isset($data['status']) && $data['status'] === RaffleStatus::Live->value) {
            return response()->json(['message' => 'A completed raffle cannot be set back to live.'], 422);
        }

        DB::transaction(function () use ($raffle, $data, $request) {
            $raffle->update($data);

            if ($request->filled('settings')) {
                RaffleSetting::updateOrCreate(
                    ['raffle_id' => $raffle->id],
                    (array) $request->input('settings'),
                );
            }
        });

        return response()->json(['data' => new RaffleResource($this->loadRaffle($raffle->refresh()))]);
    }

    public function destroy(Raffle $raffle): JsonResponse
    {
        $this->authorize('delete', $raffle);

        $raffle->delete();

        return response()->json(['message' => 'Raffle deleted.']);
    }

    /** Copy a raffle's configuration back to DRAFT — without participants, winners or draw history. */
    public function duplicate(Raffle $raffle): JsonResponse
    {
        $this->authorize('create', Raffle::class);

        $copy = DB::transaction(function () use ($raffle) {
            $copy = Raffle::create($raffle->only([
                'description', 'prize_name', 'prize_type', 'prize_value', 'prize_currency', 'logos', 'logo_left', 'logo_right',
                'winners_count', 'participant_pool', 'allow_repeat_winners',
            ]) + [
                'name' => Str::limit($raffle->name.' (Copy)', 160, ''),
                'slug' => $this->uniqueSlug($raffle->name.' copy'),
                'status' => RaffleStatus::Draft->value,
                'created_by' => request()->user()->id,
            ]);

            RaffleSetting::create(
                ['raffle_id' => $copy->id] +
                ($raffle->settings?->only([
                    'sound_countdown', 'sound_drawing', 'sound_winner', 'sound_celebration',
                    'show_confetti', 'countdown_seconds', 'roll_duration_ms', 'draw_mode',
                ]) ?? [])
            );

            return $copy;
        });

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
            ->loadCount(['winners as winners_drawn_count', 'participants']);
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
