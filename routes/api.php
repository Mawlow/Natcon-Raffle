<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DrawController;
use App\Http\Controllers\Api\ParticipantController;
use App\Http\Controllers\Api\PredrawController;
use App\Http\Controllers\Api\PrizeImageController;
use App\Http\Controllers\Api\PrizeSlideController;
use App\Http\Controllers\Api\PrizeSlideWinnerController;
use App\Http\Controllers\Api\PublicDisplayController;
use App\Http\Controllers\Api\RaffleController;
use App\Http\Controllers\Api\RaffleFileController;
use App\Http\Controllers\Api\RafflePrizeController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\ReservedPickController;
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
    ->middleware('throttle:screens')
    ->name('api.raffles.display');

// The Prize Display screen: the live prize only.
Route::get('/prize-show', [PrizeSlideController::class, 'current'])
    ->middleware('throttle:screens')
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
            ->middleware('throttle:imports')
            ->name('api.raffles.participants.import.preview');
        Route::post('/participants/import', [ParticipantController::class, 'import'])
            ->middleware('throttle:imports')
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
    // A photo of the prize, shown large on the Prize Display.
    Route::post('/prize-slides/{prizeSlide}/image', [PrizeSlideController::class, 'storeImage'])->name('api.prize-slides.image.store');
    Route::delete('/prize-slides/{prizeSlide}/image', [PrizeSlideController::class, 'destroyImage'])->name('api.prize-slides.image.destroy');
    // The winners announced on stage, looked up in a file's participant list.
    Route::get('/prize-slides/participants', [PrizeSlideWinnerController::class, 'search'])->name('api.prize-slides.participants');
    Route::post('/prize-slides/{prizeSlide}/winners', [PrizeSlideWinnerController::class, 'store'])->name('api.prize-slides.winners.store');
    Route::delete('/prize-slides/{prizeSlide}/winners', [PrizeSlideWinnerController::class, 'clear'])->name('api.prize-slides.winners.clear');
    Route::delete('/prize-slides/{prizeSlide}/winners/{winner}', [PrizeSlideWinnerController::class, 'destroy'])->name('api.prize-slides.winners.destroy');
    Route::apiResource('prize-slides', PrizeSlideController::class)->except('show')->names('api.prize-slides');

    // Raffle files: an event's raffles with one shared participant list.
    Route::apiResource('raffle-files', RaffleFileController::class)->names('api.raffle-files');
    Route::get('/raffle-files/{raffleFile}/groups', [RaffleFileController::class, 'groups'])->name('api.raffle-files.groups');
    // A day of the event: its winners and who is still to win, and who its draws pick from.
    Route::get('/raffle-files/{raffleFile}/days/{day}', [RaffleFileController::class, 'day'])->whereNumber('day')->name('api.raffle-files.day');
    Route::put('/raffle-files/{raffleFile}/days/{day}', [RaffleFileController::class, 'updateDay'])->whereNumber('day')->name('api.raffle-files.day.update');
    Route::get('/raffle-files/{raffleFile}/days/{day}/export', [RaffleFileController::class, 'exportDay'])->whereNumber('day')->name('api.raffle-files.day.export');
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
    // A photo for a prize, shown on the screens beside its name.
    Route::post('/raffles/{raffle}/prize-images', [PrizeImageController::class, 'store'])->name('api.raffles.prize-images.store');
    Route::delete('/raffles/{raffle}/prize-images', [PrizeImageController::class, 'destroy'])->name('api.raffles.prize-images.destroy');
    Route::get('/raffles/{raffle}/staged-winners', [StagedWinnerController::class, 'show'])->name('api.raffles.staged-winners.show');
    // Pre-draws: winners chosen before the event, revealed on the screens.
    Route::get('/predraws', [PredrawController::class, 'index'])->name('api.predraws.index');
    Route::post('/raffles/{raffle}/predraws', [PredrawController::class, 'store'])->name('api.predraws.store');
    Route::post('/raffle-files/{raffleFile}/predraws', [PredrawController::class, 'storeForFile'])->name('api.raffle-files.predraws.store');
    Route::delete('/predraws/{raffle}', [PredrawController::class, 'destroy'])->name('api.predraws.destroy');
    // Raffles already drawn, kept as pre-draws with their winners locked; and played again at the event.
    Route::post('/predraws/keep', [PredrawController::class, 'keep'])->name('api.predraws.keep');
    Route::post('/predraws/replay', [PredrawController::class, 'replay'])->name('api.predraws.replay');
    // Locked winners cannot be changed or removed; only the owner PIN unlocks them.
    Route::post('/raffles/{raffle}/lock', [PredrawController::class, 'lock'])->name('api.raffles.lock');
    Route::post('/raffles/{raffle}/unlock', [PredrawController::class, 'unlock'])
        ->middleware('throttle:pin')
        ->name('api.raffles.unlock');
    Route::put('/raffles/{raffle}/staged-winners', [StagedWinnerController::class, 'update'])->name('api.raffles.staged-winners.update');
    // A winner taken off is replaced at random right now, from one developer — no draw on the wall.
    Route::post('/raffles/{raffle}/winners/replace', [DrawController::class, 'replaceWinner'])
        ->middleware('throttle:draw')
        ->name('api.raffles.winners.replace');
    // The very next draw of a random raffle picks from one developer (a replacement after a removal).
    Route::put('/raffles/{raffle}/next-draw-pool', [DrawController::class, 'nextDrawPool'])->name('api.raffles.next-draw-pool');
    // An open place on the list filled at random, from one developer or the raffle's pool.
    Route::post('/raffles/{raffle}/staged-winners/fill', [StagedWinnerController::class, 'fill'])
        ->middleware('throttle:draw')
        ->name('api.raffles.staged-winners.fill');
    // The reserved pick: out of every random draw; wins when armed for a raffle.
    Route::get('/reserved-pick', [ReservedPickController::class, 'show'])->name('api.reserved-pick.show');
    Route::put('/reserved-pick', [ReservedPickController::class, 'update'])->name('api.reserved-pick.update');
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
    // A pre-draw played again: the same winners, revealed once more.
    Route::post('/raffles/{raffle}/replay', [DrawController::class, 'replay'])
        ->middleware('throttle:draw')
        ->name('api.raffles.replay');
    // A redraw pressed by mistake, undone with the owner PIN.
    Route::post('/raffles/{raffle}/undo-redraw', [DrawController::class, 'undoRedraw'])
        ->middleware('throttle:pin')
        ->name('api.raffles.undo-redraw');
    // One revealed winner off a pre-selected list, without redrawing the rest.
    // Two winners change places (and prizes), across raffles or within one.
    Route::post('/winners/swap', [DrawController::class, 'swapWinners'])->name('api.winners.swap');
    Route::delete('/raffles/{raffle}/winners/{position}', [DrawController::class, 'removeWinner'])
        ->whereNumber('position')
        ->name('api.raffles.winners.remove');
});
