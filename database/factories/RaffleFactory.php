<?php

namespace Database\Factories;

use App\Enums\RaffleStatus;
use App\Models\Raffle;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Raffle> */
class RaffleFactory extends Factory
{
    protected $model = Raffle::class;

    public function definition(): array
    {
        $name = $this->faker->unique()->words(3, true).' Raffle';

        return [
            'name' => Str::title($name),
            'slug' => Str::slug($name).'-'.Str::lower(Str::random(5)),
            'description' => $this->faker->sentence(12),
            'prize_name' => $this->faker->randomElement(['Cash Prize', 'Smartphone', 'Travel Voucher', 'Laptop']),
            'prize_value' => $this->faker->randomElement([5000, 10000, 25000, 50000]),
            'prize_currency' => 'PHP',
            'winners_count' => 1,
            'participant_pool' => 'All Participants',
            'status' => RaffleStatus::Draft->value,
            'allow_repeat_winners' => false,
            'starts_at' => now(),
        ];
    }

    public function ready(): static
    {
        return $this->state(fn () => ['status' => RaffleStatus::Ready->value]);
    }

    public function live(): static
    {
        return $this->state(fn () => ['status' => RaffleStatus::Live->value]);
    }

    public function completed(): static
    {
        return $this->state(fn () => [
            'status' => RaffleStatus::Completed->value,
            'completed_at' => now(),
        ]);
    }

    public function winners(int $count): static
    {
        return $this->state(fn () => ['winners_count' => $count]);
    }

    public function allowRepeats(): static
    {
        return $this->state(fn () => ['allow_repeat_winners' => true]);
    }
}
