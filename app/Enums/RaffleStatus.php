<?php

namespace App\Enums;

enum RaffleStatus: string
{
    case Draft = 'DRAFT';
    case Ready = 'READY';
    case Live = 'LIVE';
    case Completed = 'COMPLETED';
    case Cancelled = 'CANCELLED';

    /** Statuses from which a draw may be performed. */
    public function canDraw(): bool
    {
        return in_array($this, [self::Ready, self::Live], true);
    }

    public function isTerminal(): bool
    {
        return in_array($this, [self::Completed, self::Cancelled], true);
    }

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
