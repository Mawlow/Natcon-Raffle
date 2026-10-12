<?php

namespace App\Providers;

use App\Models\Participant;
use App\Models\Raffle;
use App\Policies\ParticipantPolicy;
use App\Policies\RafflePolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        Gate::policy(Raffle::class, RafflePolicy::class);
        Gate::policy(Participant::class, ParticipantPolicy::class);

        // Draws are deliberately tight: a live event needs a handful per minute,
        // not hundreds. Limited per user and per raffle.
        RateLimiter::for('draw', function (Request $request) {
            $raffleId = $request->route('raffle')?->id ?? 'none';

            return [
                // Generous: the draw lock already lets only one draw run at a
                // time, and a busy event (auto-runs, pre-draws, retries) must
                // never be stopped by the limit.
                Limit::perMinute(120)->by('draw-user:'.($request->user()?->id ?? $request->ip())),
                Limit::perMinute(120)->by('draw-raffle:'.$raffleId),
            ];
        });
    }
}
