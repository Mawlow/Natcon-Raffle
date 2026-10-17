<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Raffle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

/**
 * Prize photos: a picture for a prize — the brand new car — shown on the
 * screens beside its name. One per prize name, kept on the raffle, so a
 * raffle's own prize, each prize of a prize list and each prize of a
 * pre-selected list can have its own.
 */
class PrizeImageController extends Controller
{
    public function store(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('update', $raffle);

        $validated = $request->validate([
            'prize_name' => ['required', 'string', 'max:160'],
            'image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
        ]);

        $name = trim($validated['prize_name']);
        $images = $raffle->prize_images ?? [];

        $path = $request->file('image')->store("prize-images/{$raffle->id}", 'public');

        if (isset($images[$name])) {
            Storage::disk('public')->delete($images[$name]);
        }

        $images[$name] = $path;
        $raffle->forceFill(['prize_images' => $images])->save();

        return response()->json([
            'message' => 'Prize photo saved.',
            'data' => ['prize_images' => Raffle::prizeImageUrls($images)],
        ]);
    }

    public function destroy(Request $request, Raffle $raffle): JsonResponse
    {
        $this->authorize('update', $raffle);

        $validated = $request->validate(['prize_name' => ['required', 'string', 'max:160']]);

        $name = trim($validated['prize_name']);
        $images = $raffle->prize_images ?? [];

        if (isset($images[$name])) {
            Storage::disk('public')->delete($images[$name]);
            unset($images[$name]);
            $raffle->forceFill(['prize_images' => $images === [] ? null : $images])->save();
        }

        return response()->json([
            'message' => 'Prize photo removed.',
            'data' => ['prize_images' => Raffle::prizeImageUrls($images)],
        ]);
    }
}
