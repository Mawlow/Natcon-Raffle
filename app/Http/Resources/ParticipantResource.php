<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Admin-only representation. Never used by the public display endpoints. */
class ParticipantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'raffle_id' => $this->raffle_id,
            'ticket_number' => $this->ticket_number,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'category' => $this->category,
            'developers' => $this->developers ?? [],
            'status' => $this->status->value,
            'metadata' => $this->metadata,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
