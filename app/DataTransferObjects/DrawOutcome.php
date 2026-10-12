<?php

namespace App\DataTransferObjects;

use App\Models\DrawEvent;
use App\Models\Raffle;
use App\Models\Winner;

/**
 * The result of a single server-side draw. The ticket number carried here is
 * authoritative; the frontend only animates towards it.
 */
readonly class DrawOutcome
{
    public function __construct(
        public Winner $winner,
        public DrawEvent $drawEvent,
        public Raffle $raffle,
        public int $eligibleCountBeforeDraw,
        public int $remainingSlots,
        public bool $raffleCompleted,
    ) {}

    /** The payload the screens get: the ticket and the winner's name, never their email, phone or id. */
    public function toPublicArray(): array
    {
        return [
            'ticket_number' => $this->winner->ticket_number,
            'name' => $this->winner->participant?->name,
            'position' => $this->winner->position,
            'prize_id' => $this->winner->raffle_prize_id,
            'prize_name' => $this->winner->prize_name,
            'drawn_at' => $this->winner->drawn_at?->toIso8601String(),
            'event_uuid' => $this->drawEvent->event_uuid,
            'eligible_count' => $this->eligibleCountBeforeDraw,
            'remaining_slots' => $this->remainingSlots,
            'raffle_completed' => $this->raffleCompleted,
            'raffle_status' => $this->raffle->status->value,
        ];
    }
}
