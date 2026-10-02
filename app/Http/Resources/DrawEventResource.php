<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DrawEventResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'event_uuid' => $this->event_uuid,
            'raffle_id' => $this->raffle_id,
            'raffle' => $this->whenLoaded('raffle', fn () => $this->raffle?->name),
            'sequence' => $this->sequence,
            'ticket_number' => $this->ticket_number,
            'result' => $this->result->value,
            'message' => $this->message,
            'eligible_count' => (int) $this->eligible_count,
            'request_id' => $this->request_id,
            'ip_address' => $this->ip_address,
            'user' => $this->whenLoaded('user', fn () => $this->user?->name),
            'context' => $this->context,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
