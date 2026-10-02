<?php

namespace App\Enums;

enum ParticipantStatus: string
{
    case Active = 'ACTIVE';
    case Winner = 'WINNER';
    case Disqualified = 'DISQUALIFIED';
    // A previous winner left out of a redraw of the same raffle.
    case Excluded = 'EXCLUDED';

    /** Statuses that keep a ticket out of every draw. */
    public static function ineligible(): array
    {
        return [self::Disqualified->value, self::Excluded->value];
    }

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
