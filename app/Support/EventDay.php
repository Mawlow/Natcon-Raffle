<?php

namespace App\Support;

use Carbon\CarbonInterface;

/**
 * Which day of NATCON a moment falls on: the 18th is Day 1, the 19th Day 2,
 * counted in Philippine time (the app itself runs on UTC).
 */
class EventDay
{
    public const TIMEZONE = 'Asia/Manila';

    /** Day of the month => label. */
    public const DAYS = [18 => 'Day 1', 19 => 'Day 2'];

    /** "Day 1", "Day 2", or null for any other day. */
    public static function of(?CarbonInterface $moment): ?string
    {
        if ($moment === null) {
            return null;
        }

        return self::DAYS[(int) $moment->copy()->timezone(self::TIMEZONE)->format('j')] ?? null;
    }
}
