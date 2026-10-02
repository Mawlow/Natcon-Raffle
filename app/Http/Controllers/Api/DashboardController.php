<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DrawEventResource;
use App\Http\Resources\WinnerResource;
use App\Models\DrawEvent;
use App\Models\Raffle;
use App\Models\Winner;
use App\Services\RaffleStatsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function index(RaffleStatsService $stats): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        return response()->json(['data' => $stats->dashboard()]);
    }

    /** Winner history across every raffle. */
    public function winners(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        $perPage = min(max((int) $request->integer('per_page', 25), 5), 100);

        $winners = Winner::query()
            ->with(['raffle', 'participant', 'drawEvent', 'drawnBy'])
            ->when($request->filled('raffle_id'), fn ($q) => $q->where('raffle_id', $request->integer('raffle_id')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $like = '%'.$request->string('search')->toString().'%';
                $q->where('ticket_number', 'like', $like);
            })
            ->latest('drawn_at')
            ->paginate($perPage)
            ->withQueryString();

        return response()->json([
            'data' => WinnerResource::collection($winners->items()),
            'meta' => [
                'current_page' => $winners->currentPage(),
                'last_page' => $winners->lastPage(),
                'per_page' => $winners->perPage(),
                'total' => $winners->total(),
            ],
        ]);
    }

    /** Full audit trail. */
    public function drawEvents(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        $perPage = min(max((int) $request->integer('per_page', 30), 5), 200);

        $events = DrawEvent::query()
            ->with(['raffle', 'user'])
            ->when($request->filled('raffle_id'), fn ($q) => $q->where('raffle_id', $request->integer('raffle_id')))
            ->when($request->filled('result'), fn ($q) => $q->where('result', $request->string('result')->toString()))
            ->latest('id')
            ->paginate($perPage)
            ->withQueryString();

        return response()->json([
            'data' => DrawEventResource::collection($events->items()),
            'meta' => [
                'current_page' => $events->currentPage(),
                'last_page' => $events->lastPage(),
                'per_page' => $events->perPage(),
                'total' => $events->total(),
            ],
        ]);
    }
}
