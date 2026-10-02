<?php

namespace Database\Factories;

use App\Models\Participant;
use App\Models\Raffle;
use App\Models\Winner;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Winner> */
class WinnerFactory extends Factory
{
    protected $model = Winner::class;

    public function definition(): array
    {
        return [
            'raffle_id' => Raffle::factory(),
            'participant_id' => Participant::factory(),
            'ticket_number' => str_pad((string) $this->faker->unique()->numberBetween(1, 999999), 6, '0', STR_PAD_LEFT),
            'position' => 1,
            'drawn_at' => now(),
        ];
    }
}
