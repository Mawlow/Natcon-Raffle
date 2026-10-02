<?php

use App\Exceptions\DrawException;
use App\Http\Middleware\AutoLoginAdmin;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\View\Middleware\ShareErrorsFromSession;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // The SPA is served by this same Laravel app, so the API is session
        // authenticated rather than token based. Declaring the session stack
        // explicitly keeps CSRF protection on every state-changing API call
        // without depending on origin sniffing.
        //
        // AutoLoginAdmin runs once the session exists and adopts the admin
        // account, because this build has no sign-in screen. Remove that one
        // line to require a login again.
        $middleware->api(prepend: [
            EncryptCookies::class,
            AddQueuedCookiesToResponse::class,
            StartSession::class,
            ShareErrorsFromSession::class,
            ValidateCsrfToken::class,
            SubstituteBindings::class,
            AutoLoginAdmin::class,
        ]);

        // Laravel sorts middleware by priority, and the route's auth middleware
        // outranks anything unlisted — so say explicitly that the admin is
        // adopted before the guard looks for a user. The priority list keys off
        // the contract, not the concrete Authenticate class.
        $middleware->prependToPriorityList(
            before: AuthenticatesRequests::class,
            prepend: AutoLoginAdmin::class,
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Consistent JSON error envelopes; stack traces never reach the client in production.
        $exceptions->render(function (DrawException $e, Request $request) {
            if ($request->expectsJson()) {
                return response()->json(['message' => $e->getMessage(), 'code' => $e->result->value], $e->status);
            }
        });

        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'Please sign in to continue.'], 401);
            }
        });

        // Laravel converts an AuthorizationException into Symfony's
        // AccessDeniedHttpException on the way out, so both are handled.
        $exceptions->render(function (AuthorizationException|AccessDeniedHttpException $e, Request $request) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'You are not allowed to perform this action.'], 403);
            }
        });

        $exceptions->render(function (ModelNotFoundException|NotFoundHttpException $e, Request $request) {
            if ($request->expectsJson()) {
                return response()->json(['message' => 'The requested resource could not be found.'], 404);
            }
        });

        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->expectsJson() || $e instanceof HttpExceptionInterface || config('app.debug')) {
                return null;
            }

            report($e);

            return response()->json(['message' => 'Something went wrong. Please try again.'], 500);
        });
    })->create();
