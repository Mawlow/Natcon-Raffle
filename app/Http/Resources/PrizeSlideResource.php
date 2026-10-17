<?php

namespace App\Http\Resources;

use App\Support\RaffleLogos;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PrizeSlideResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            // The raffle the winners are saved in, once one has gone up.
            'raffle_id' => $this->raffle_id,
            'title' => $this->title,
            'prize_name' => $this->prize_name,
            'prize_type' => $this->prize_type ?? 'cash',
            'prize_value' => $this->prize_value !== null ? (float) $this->prize_value : null,
            'prize_currency' => $this->prize_currency,
            'logos' => RaffleLogos::findMany($this->logos),
            'logo_left' => RaffleLogos::find($this->logo_left),
            'logo_right' => RaffleLogos::find($this->logo_right),
            // A photo of the prize, shown large on the Prize Display.
            'image' => $this->imageUrl(),
            // The photo turns round and round on the screen.
            'spin' => (bool) $this->spin,
            // The winners announced on stage so far, shown on the screen in
            // this order. The list is loaded whenever it is wanted.
            'winners' => $this->whenLoaded('winners', fn () => $this->winners->map(fn ($winner) => [
                'id' => $winner->id,
                'position' => (int) $winner->position,
                'name' => $winner->name,
                'ticket_number' => $winner->ticket_number,
            ])->values()),
            'is_live' => (bool) $this->is_live,
            'position' => (int) $this->position,
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
