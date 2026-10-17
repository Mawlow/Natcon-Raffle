<?php

namespace App\Http\Requests;

use App\Support\RaffleLogos;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PrizeSlideRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isAdmin() ?? false;
    }

    public function rules(): array
    {
        return [
            // The line above the prize, e.g. "Manual Raffle · Grand Prize".
            'title' => ['nullable', 'string', 'max:160'],
            'prize_name' => ['required', 'string', 'max:160'],
            // cash: the amount is the headline. item: the prize itself is.
            'prize_type' => ['required', Rule::in(['cash', 'item'])],
            'prize_value' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'prize_currency' => ['nullable', 'string', 'max:8'],
            'logos' => ['nullable', 'array', 'max:20'],
            'logos.*' => ['string', 'distinct', Rule::in(RaffleLogos::ids())],
            // The top-left and top-right logos, either side of NATCON; null leaves the corner empty.
            'logo_left' => ['nullable', 'string', Rule::in(RaffleLogos::ids())],
            'logo_right' => ['nullable', 'string', Rule::in(RaffleLogos::ids())],
            // The photo turning round and round on the screen, like a product on a turntable.
            'spin' => ['nullable', 'boolean'],
        ];
    }
}
