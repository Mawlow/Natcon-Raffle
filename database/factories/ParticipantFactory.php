<?php

namespace Database\Factories;

use App\Enums\ParticipantStatus;
use App\Models\Participant;
use App\Models\Raffle;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Participant> */
class ParticipantFactory extends Factory
{
    protected $model = Participant::class;

    public function definition(): array
    {
        return [
            'raffle_id' => Raffle::factory(),
            // Padded so leading zeros are exercised everywhere, including tests.
            'ticket_number' => str_pad((string) $this->faker->unique()->numberBetween(1, 999999), 6, '0', STR_PAD_LEFT),
            'name' => $this->faker->name(),
            'email' => $this->faker->unique()->safeEmail(),
            'phone' => $this->faker->numerify('+639#########'),
            'category' => $this->faker->randomElement(['VISITOR', 'VIP', 'STAFF', 'PARTNER']),
            'status' => ParticipantStatus::Active->value,
            'metadata' => null,
        ];
    }

    public function disqualified(): static
    {
        return $this->state(fn () => ['status' => ParticipantStatus::Disqualified->value]);
    }

    public function ticket(string $ticketNumber): static
    {
        return $this->state(fn () => ['ticket_number' => $ticketNumber]);
    }

    public function forRaffle(Raffle $raffle): static
    {
        return $this->state(fn () => ['raffle_id' => $raffle->id]);
    }
}
