<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PrizeSlideRequest;
use App\Http\Resources\PrizeSlideResource;
use App\Models\PrizeSlide;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * The Prize Display: prizes for raffles drawn by hand, and which one the
 * screen is showing. Only one prize is live at a time; none live leaves the
 * screen on its standby card.
 */
class PrizeSlideController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => PrizeSlideResource::collection(PrizeSlide::with('winners')->orderBy('position')->orderBy('id')->get()),
        ]);
    }

    public function store(PrizeSlideRequest $request): JsonResponse
    {
        $slide = PrizeSlide::create($request->validated() + [
            'position' => (int) PrizeSlide::max('position') + 1,
        ]);

        return response()->json(['data' => new PrizeSlideResource($slide)], 201);
    }

    public function update(PrizeSlideRequest $request, PrizeSlide $prizeSlide): JsonResponse
    {
        $prizeSlide->update($request->validated());

        return response()->json(['data' => new PrizeSlideResource($prizeSlide->refresh())]);
    }

    public function destroy(Request $request, PrizeSlide $prizeSlide): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403);

        if ($prizeSlide->image) {
            Storage::disk('public')->delete($prizeSlide->image);
        }

        $prizeSlide->delete();

        return response()->json(['message' => 'Prize deleted.']);
    }

    /** A photo of the prize, shown large on the screen; replaces any earlier one. */
    public function storeImage(Request $request, PrizeSlide $prizeSlide): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403);

        $request->validate(['image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192']]);

        $path = $request->file('image')->store('prize-slides', 'public');

        if ($prizeSlide->image) {
            Storage::disk('public')->delete($prizeSlide->image);
        }

        $prizeSlide->update(['image' => $path]);

        return response()->json(['data' => new PrizeSlideResource($prizeSlide->refresh())]);
    }

    public function destroyImage(Request $request, PrizeSlide $prizeSlide): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403);

        if ($prizeSlide->image) {
            Storage::disk('public')->delete($prizeSlide->image);
            $prizeSlide->update(['image' => null]);
        }

        return response()->json(['data' => new PrizeSlideResource($prizeSlide->refresh())]);
    }

    /** Puts this prize on the screen, taking any other off. */
    public function live(Request $request, PrizeSlide $prizeSlide): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403);

        DB::transaction(function () use ($prizeSlide) {
            PrizeSlide::where('id', '!=', $prizeSlide->id)->where('is_live', true)->update(['is_live' => false]);
            $prizeSlide->update(['is_live' => true]);
        });

        return response()->json(['data' => new PrizeSlideResource($prizeSlide->refresh()->load('winners'))]);
    }

    /** Takes every prize off the screen, leaving the standby card. */
    public function clear(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isAdmin(), 403);

        PrizeSlide::where('is_live', true)->update(['is_live' => false]);

        return response()->json(['data' => null]);
    }

    /** What the screen shows: the live prize, or null for standby. Public. */
    public function current(): JsonResponse
    {
        $slide = PrizeSlide::with('winners')->where('is_live', true)->first();

        return response()->json(['data' => $slide ? new PrizeSlideResource($slide) : null]);
    }
}
