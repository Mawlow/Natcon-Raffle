<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DrawController;
use App\Http\Controllers\Api\ParticipantController;
use App\Http\Controllers\Api\PrizeSlideController;
use App\Http\Controllers\Api\PublicDisplayController;
use App\Http\Controllers\Api\RaffleController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Public endpoints
|--------------------------------------------------------------------------
| Ticket numbers only. These feed the projector display and deliberately
| expose no participant identity.
*/
Route::get('/raffles/{raffle}/display', [PublicDisplayController::class, 'show'])
    ->middleware('throttle:120,1')
    ->name('api.raffles.display');

// The Prize Display screen: the live prize only.
Route::get('/prize-show', [PrizeSlideController::class, 'current'])
    ->middleware('throttle:120,1')
    ->name('api.prize-show');

/*
|--------------------------------------------------------------------------
| Admin API
|--------------------------------------------------------------------------
| There is no sign-in screen: AutoLoginAdmin adopts the administrator account
| for every request, and the guard below then sees an authenticated user.
*/
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me'])->name('api.me');

    /*
    |----------------------------------------------------------------------
    | Dashboard, winner history and audit log
    |----------------------------------------------------------------------
    */
    Route::get('/dashboard', [DashboardController::class, 'index'])->name('api.dashboard');
    Route::get('/winners', [DashboardController::class, 'winners'])->name('api.winners.index');
    Route::get('/draw-events', [DashboardController::class, 'drawEvents'])->name('api.draw-events.index');

    /*
    |----------------------------------------------------------------------
    | Participants — always scoped to one raffle
    |----------------------------------------------------------------------
    | A participant list is imported into a specific raffle, so every one of
    | these routes is nested under the raffle it belongs to.
    */
    Route::prefix('raffles/{raffle}')->group(function () {
        Route::get('/participants/export', [ParticipantController::class, 'export'])->name('api.raffles.participants.export');
        Route::get('/participants/stats', [ParticipantController::class, 'stats'])->name('api.raffles.participants.stats');
        Route::post('/participants/import/preview', [ParticipantController::class, 'preview'])
            ->middleware('throttle:30,1')
            ->name('api.raffles.participants.import.preview');
        Route::post('/participants/import', [ParticipantController::class, 'import'])
            ->middleware('throttle:20,1')
            ->name('api.raffles.participants.import');
        Route::delete('/participants', [ParticipantController::class, 'clear'])->name('api.raffles.participants.clear');
        Route::apiResource('participants', ParticipantController::class)->names('api.raffles.participants');
    });

    /*
    |----------------------------------------------------------------------
    | Raffles
    |----------------------------------------------------------------------
    */
    /*
    |----------------------------------------------------------------------
    | Prize Display — prizes for raffles drawn by hand
    |----------------------------------------------------------------------
    */
    Route::post('/prize-slides/clear-live', [PrizeSlideController::class, 'clear'])->name('api.prize-slides.clear-live');
    Route::post('/prize-slides/{prizeSlide}/live', [PrizeSlideController::class, 'live'])->name('api.prize-slides.live');
    Route::apiResource('prize-slides', PrizeSlideController::class)->except('show')->names('api.prize-slides');

    Route::apiResource('raffles', RaffleController::class)->names('api.raffles');
    Route::post('/raffles/{raffle}/duplicate', [RaffleController::class, 'duplicate'])->name('api.raffles.duplicate');
    Route::post('/raffles/{raffle}/archive', [RaffleController::class, 'archive'])->name('api.raffles.archive');
    Route::post('/raffles/{raffle}/restore', [RaffleController::class, 'restore'])->name('api.raffles.restore');
    Route::post('/raffles/{raffle}/transition', [RaffleController::class, 'transition'])->name('api.raffles.transition');
    Route::get('/raffles/{raffle}/winners', [RaffleController::class, 'winners'])->name('api.raffles.winners');
    Route::get('/raffles/{raffle}/draw-events', [RaffleController::class, 'drawEvents'])->name('api.raffles.draw-events');

    /*
    |----------------------------------------------------------------------
    | The draw — server-authoritative, rate limited, one at a time
    |----------------------------------------------------------------------
    */
    Route::post('/raffles/{raffle}/draw', [DrawController::class, 'store'])
        ->middleware('throttle:draw')
        ->name('api.raffles.draw');
    Route::post('/raffles/{raffle}/draw-all', [DrawController::class, 'storeAll'])
        ->middleware('throttle:draw')
        ->name('api.raffles.draw-all');
    Route::post('/raffles/{raffle}/redraw', [DrawController::class, 'redraw'])
        ->middleware('throttle:draw')
        ->name('api.raffles.redraw');
});
