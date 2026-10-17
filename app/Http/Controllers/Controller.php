<?php

namespace App\Http\Controllers;

use App\Models\Raffle;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Foundation\Validation\ValidatesRequests;

abstract class Controller
{
    use AuthorizesRequests, ValidatesRequests;

    /**
     * The answer to changing a locked raffle's winners: nothing about them
     * can change until the owner unlocks it with the PIN.
     */
    protected function lockedResponse(Raffle $raffle, string $because = 'its winners cannot be changed'): JsonResponse
    {
        return response()->json([
            'message' => sprintf('"%s" is locked: %s. Unlock it with the owner PIN first.', $raffle->name, $because),
            'code' => 'RAFFLE_LOCKED',
        ], 423);
    }
}
