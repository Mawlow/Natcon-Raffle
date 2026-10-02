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
            'title' => $this->title,
            'prize_name' => $this->prize_name,
            'prize_type' => $this->prize_type ?? 'cash',
            'prize_value' => $this->prize_value !== null ? (float) $this->prize_value : null,
            'prize_currency' => $this->prize_currency,
            'logos' => RaffleLogos::findMany($this->logos),
            'is_live' => (bool) $this->is_live,
            'position' => (int) $this->position,
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
