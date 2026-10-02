<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Reports who the API is acting as.
 *
 * This build has no sign-in screen — AutoLoginAdmin adopts the administrator
 * account for every request — so there is nothing here but /me, which the
 * dashboard uses to label the header.
 */
class AuthController extends Controller
{
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'data' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
            ],
        ]);
    }
}
