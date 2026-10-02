<?php

use Illuminate\Support\Facades\Route;

/*
| Everything is served by the React SPA. Laravel owns the API; this route just
| boots the application shell and lets React Router take over.
*/
Route::view('/{any?}', 'app')
    ->where('any', '^(?!api|storage|up).*$')
    ->name('app');
