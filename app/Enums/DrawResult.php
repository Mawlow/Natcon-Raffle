<?php

namespace App\Enums;

enum DrawResult: string
{
    case Success = 'SUCCESS';
    case NoEligibleParticipants = 'NO_ELIGIBLE_PARTICIPANTS';
    case AllWinnersDrawn = 'ALL_WINNERS_DRAWN';
    case InvalidStatus = 'INVALID_STATUS';
    case Failed = 'FAILED';
    // Not a draw: the raffle's winners were cleared so it could be drawn again.
    case Redraw = 'REDRAW';
}
