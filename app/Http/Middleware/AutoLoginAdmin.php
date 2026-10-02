<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Signs every visitor in as the raffle administrator.
 *
 * This app runs on an event operator's machine and has no sign-in screen, so
 * there is nobody to authenticate: the first active admin account is adopted
 * for the request instead. Everything downstream — policies, the audit trail's
 * "drawn by" column, `/api/me` — keeps working exactly as it did.
 *
 * Anyone who can reach this server is therefore an administrator. Delete this
 * middleware from bootstrap/app.php to put the login screen back in charge.
 */
class AutoLoginAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! Auth::check()) {
            $admin = User::query()
                ->where('is_active', true)
                ->whereIn('role', ['admin', 'super-admin'])
                ->orderBy('id')
                ->first();

            if ($admin !== null) {
                Auth::guard('web')->login($admin);
            }
        }

        return $next($request);
    }
}
