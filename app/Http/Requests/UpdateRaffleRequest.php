<?php

namespace App\Http\Requests;

use App\Enums\RaffleStatus;
use App\Support\RaffleLogos;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateRaffleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isAdmin() ?? false;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:2000'],
            'prize_name' => ['sometimes', 'required', 'string', 'max:160'],
            // cash: the amount is the headline. item: the prize itself (a
            // brand new car, say) is the headline and its value is optional.
            'prize_type' => ['sometimes', Rule::in(['cash', 'item'])],
            'prize_value' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'prize_currency' => ['nullable', 'string', 'max:8'],
            // Any number of catalogue logos, in display order; empty clears them.
            'logos' => ['nullable', 'array', 'max:20'],
            'logos.*' => ['string', 'distinct', Rule::in(RaffleLogos::ids())],
            // The "Congratulations" screen's top-left and top-right logos,
            // either side of NATCON; null leaves the corner empty.
            'logo_left' => ['nullable', 'string', Rule::in(RaffleLogos::ids())],
            'logo_right' => ['nullable', 'string', Rule::in(RaffleLogos::ids())],
            'winners_count' => ['sometimes', 'required', 'integer', 'min:1', 'max:500'],
            'participant_pool' => ['nullable', 'string', 'max:160'],
            // Who can win: null (everyone), or only the participants carrying
            // one of the chosen tags, qualified under one of the chosen developers,
            // or from one of the chosen locations.
            'draw_filter' => ['nullable', 'array'],
            'draw_filter.type' => ['required_with:draw_filter', Rule::in(['all', 'tag', 'developer', 'location', 'both'])],
            'draw_filter.tags' => ['nullable', 'array', 'max:100'],
            'draw_filter.tags.*' => ['string', 'max:160', 'distinct'],
            'draw_filter.developers' => ['nullable', 'array', 'max:100'],
            'draw_filter.developers.*' => ['string', 'max:160', 'distinct'],
            'draw_filter.locations' => ['nullable', 'array', 'max:100'],
            'draw_filter.locations.*' => ['string', 'max:160', 'distinct'],
            'draw_filter.values' => ['nullable', 'array', 'max:100'],
            'draw_filter.values.*' => ['string', 'max:160', 'distinct'],
            'status' => ['sometimes', Rule::in(RaffleStatus::values())],
            'allow_repeat_winners' => ['boolean'],
            // A big prize: its winners sit out every other draw of the event, all days.
            'winners_out_for_event' => ['boolean'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'settings' => ['nullable', 'array'],
            'settings.sound_countdown' => ['boolean'],
            'settings.sound_drawing' => ['boolean'],
            'settings.sound_winner' => ['boolean'],
            'settings.sound_celebration' => ['boolean'],
            'settings.show_confetti' => ['boolean'],
            'settings.countdown_seconds' => ['integer', 'min:0', 'max:10'],
            'settings.roll_duration_ms' => ['integer', 'min:1000', 'max:30000'],
            // one_by_one: each press of DRAW picks one winner.
            // all_at_once: one press draws every remaining winner in turn.
            'settings.draw_mode' => ['string', 'in:one_by_one,all_at_once'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('allow_repeat_winners')) {
            $this->merge(['allow_repeat_winners' => $this->boolean('allow_repeat_winners')]);
        }

        if ($this->has('winners_out_for_event')) {
            $this->merge(['winners_out_for_event' => $this->boolean('winners_out_for_event')]);
        }
    }
}
