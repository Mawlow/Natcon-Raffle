<?php

namespace App\Enums;

enum ParticipantStatus: string
{
    case Active = 'ACTIVE';
    case Winner = 'WINNER';
    case Disqualified = 'DISQUALIFIED';
    // A previous winner left out of a redraw of the same raffle.
    case Excluded = 'EXCLUDED';
    // Not at the event. Marked from the Control Center, and undone the same
    // way if they turn up; kept out of every draw until then.
    case Absent = 'ABSENT';

    /** Statuses that keep a ticket out of every draw. */
    public static function ineligible(): array
    {
        return [self::Disqualified->value, self::Excluded->value, self::Absent->value];
    }

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
