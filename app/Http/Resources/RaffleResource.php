<?php

namespace App\Http\Resources;

use App\Support\RaffleLogos;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RaffleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'prize_name' => $this->prize_name,
            'prize_type' => $this->prize_type ?? 'cash',
            'prize_value' => $this->prize_value !== null ? (float) $this->prize_value : null,
            'prize_currency' => $this->prize_currency,
            'logos' => RaffleLogos::findMany($this->logos),
            'logo_left' => RaffleLogos::find($this->logo_left),
            'logo_right' => RaffleLogos::find($this->logo_right),
            'winners_count' => (int) $this->winners_count,
            'winners_drawn' => (int) ($this->winners_drawn_count ?? $this->whenLoaded('winners', fn () => $this->winners->count(), 0)),
            'participant_pool' => $this->participant_pool,
            'participants_count' => (int) ($this->participants_count ?? 0),
            'status' => $this->status->value,
            'allow_repeat_winners' => (bool) $this->allow_repeat_winners,
            'is_archived' => $this->archived_at !== null,
            'starts_at' => $this->starts_at?->toIso8601String(),
            'ends_at' => $this->ends_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'archived_at' => $this->archived_at?->toIso8601String(),
            'created_by' => $this->whenLoaded('creator', fn () => $this->creator?->name),
            'settings' => $this->whenLoaded('settings', fn () => $this->settings ? [
                'sound_countdown' => $this->settings->sound_countdown,
                'sound_drawing' => $this->settings->sound_drawing,
                'sound_winner' => $this->settings->sound_winner,
                'sound_celebration' => $this->settings->sound_celebration,
                'show_confetti' => $this->settings->show_confetti,
                'countdown_seconds' => $this->settings->countdown_seconds,
                'roll_duration_ms' => $this->settings->roll_duration_ms,
                'draw_mode' => $this->settings->draw_mode ?? 'one_by_one',
            ] : null),
            'winners' => WinnerResource::collection($this->whenLoaded('winners')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
