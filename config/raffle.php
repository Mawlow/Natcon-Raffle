<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Owner PIN
    |--------------------------------------------------------------------------
    | This app signs everyone in as the administrator, so the PIN is what
    | tells the owner apart from the other operators. It is asked for when
    | unlocking a locked raffle — the one step that opens its winners up to
    | being changed or removed. Leave it empty and nothing can be unlocked.
    */
    'owner_pin' => env('RAFFLE_OWNER_PIN'),
];
