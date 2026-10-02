<?php

namespace App\Http\Requests;

use App\Enums\RaffleStatus;
use App\Support\RaffleLogos;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreRaffleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isAdmin() ?? false;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:2000'],
            'prize_name' => ['required', 'string', 'max:160'],
            // cash: the amount is the headline. item: the prize itself (a
            // brand new car, say) is the headline and its value is optional.
            'prize_type' => ['nullable', Rule::in(['cash', 'item'])],
            'prize_value' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'prize_currency' => ['nullable', 'string', 'max:8'],
            // Any number of catalogue logos, in display order; empty clears them.
            'logos' => ['nullable', 'array', 'max:20'],
            'logos.*' => ['string', 'distinct', Rule::in(RaffleLogos::ids())],
            // The "Congratulations" screen's top-left and top-right logos,
            // either side of NATCON; null leaves the corner empty.
            'logo_left' => ['nullable', 'string', Rule::in(RaffleLogos::ids())],
            'logo_right' => ['nullable', 'string', Rule::in(RaffleLogos::ids())],
            'winners_count' => ['required', 'integer', 'min:1', 'max:500'],
            'participant_pool' => ['nullable', 'string', 'max:160'],
            'status' => ['nullable', Rule::in([RaffleStatus::Draft->value, RaffleStatus::Ready->value])],
            'allow_repeat_winners' => ['boolean'],
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
        $this->merge([
            'allow_repeat_winners' => $this->boolean('allow_repeat_winners'),
        ]);
    }
}
