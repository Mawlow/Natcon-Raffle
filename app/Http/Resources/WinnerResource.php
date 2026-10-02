<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Admin winner view. Participant identity is only ever included when the
 * relation was explicitly eager-loaded by an admin-scoped controller.
 */
class WinnerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'ticket_number' => $this->ticket_number,
            'position' => (int) $this->position,
            'drawn_at' => $this->drawn_at?->toIso8601String(),
            'raffle' => $this->whenLoaded('raffle', fn () => [
                'id' => $this->raffle->id,
                'name' => $this->raffle->name,
                'slug' => $this->raffle->slug,
                'prize_name' => $this->raffle->prize_name,
                'prize_value' => $this->raffle->prize_value !== null ? (float) $this->raffle->prize_value : null,
                'prize_currency' => $this->raffle->prize_currency,
            ]),
            'participant' => $this->whenLoaded('participant', fn () => $this->participant ? [
                'id' => $this->participant->id,
                'name' => $this->participant->name,
                'email' => $this->participant->email,
                'phone' => $this->participant->phone,
                'category' => $this->participant->category,
            ] : null),
            'draw_event' => $this->whenLoaded('drawEvent', fn () => $this->drawEvent ? [
                'event_uuid' => $this->drawEvent->event_uuid,
                'sequence' => $this->drawEvent->sequence,
                'created_at' => $this->drawEvent->created_at?->toIso8601String(),
            ] : null),
            'drawn_by' => $this->whenLoaded('drawnBy', fn () => $this->drawnBy?->name),
        ];
    }
}
