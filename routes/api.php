<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DrawController;
use App\Http\Controllers\Api\ParticipantController;
use App\Http\Controllers\Api\PredrawController;
use App\Http\Controllers\Api\PrizeSlideController;
use App\Http\Controllers\Api\PublicDisplayController;
use App\Http\Controllers\Api\RaffleController;
use App\Http\Controllers\Api\RaffleFileController;
use App\Http\Controllers\Api\RafflePrizeController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\StagedWinnerController;
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

    // Winner reports: every raffle with its winners, to print or download.
    Route::get('/reports', [ReportController::class, 'index'])->name('api.reports.index');
    Route::get('/reports/export', [ReportController::class, 'exportAll'])->name('api.reports.export');
    Route::get('/reports/{raffle}', [ReportController::class, 'show'])->name('api.reports.show');
    Route::get('/reports/{raffle}/export', [ReportController::class, 'export'])->name('api.reports.raffle-export');

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
        Route::get('/participants/groups', [ParticipantController::class, 'groups'])->name('api.raffles.participants.groups');
        Route::get('/participants/pool-count', [ParticipantController::class, 'poolCount'])->name('api.raffles.participants.pool-count');
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

    // Raffle files: an event's raffles with one shared participant list.
    Route::apiResource('raffle-files', RaffleFileController::class)->names('api.raffle-files');
    Route::get('/raffle-files/{raffleFile}/groups', [RaffleFileController::class, 'groups'])->name('api.raffle-files.groups');
    Route::post('/raffle-files/{raffleFile}/participants/preview', [RaffleFileController::class, 'preview'])->name('api.raffle-files.preview');
    Route::post('/raffle-files/{raffleFile}/participants', [RaffleFileController::class, 'import'])->name('api.raffle-files.import');

    Route::apiResource('raffles', RaffleController::class)->names('api.raffles');
    Route::post('/raffles/{raffle}/duplicate', [RaffleController::class, 'duplicate'])->name('api.raffles.duplicate');
    Route::post('/raffles/{raffle}/next-round', [RaffleController::class, 'nextRound'])->name('api.raffles.next-round');
    Route::post('/raffles/{raffle}/archive', [RaffleController::class, 'archive'])->name('api.raffles.archive');
    Route::post('/raffles/{raffle}/file', [RaffleController::class, 'moveToFile'])->name('api.raffles.file');
    Route::post('/raffles/{raffle}/convert', [RaffleController::class, 'convert'])->name('api.raffles.convert');
    Route::post('/raffles/sets', [RaffleController::class, 'assignSet'])->name('api.raffles.sets');
    Route::post('/raffles/{raffle}/restore', [RaffleController::class, 'restore'])->name('api.raffles.restore');
    Route::post('/raffles/{raffle}/transition', [RaffleController::class, 'transition'])->name('api.raffles.transition');
    Route::get('/raffles/{raffle}/winners', [RaffleController::class, 'winners'])->name('api.raffles.winners');
    Route::put('/raffles/{raffle}/prizes', [RafflePrizeController::class, 'update'])->name('api.raffles.prizes.update');
    Route::get('/raffles/{raffle}/staged-winners', [StagedWinnerController::class, 'show'])->name('api.raffles.staged-winners.show');
    // Pre-draws: winners chosen before the event, revealed on the screens.
    Route::get('/predraws', [PredrawController::class, 'index'])->name('api.predraws.index');
    Route::post('/raffles/{raffle}/predraws', [PredrawController::class, 'store'])->name('api.predraws.store');
    Route::post('/raffle-files/{raffleFile}/predraws', [PredrawController::class, 'storeForFile'])->name('api.raffle-files.predraws.store');
    Route::delete('/predraws/{raffle}', [PredrawController::class, 'destroy'])->name('api.predraws.destroy');
    Route::put('/raffles/{raffle}/staged-winners', [StagedWinnerController::class, 'update'])->name('api.raffles.staged-winners.update');
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
