<?php

namespace Tests\Support;

use App\Models\Participant;
use App\Models\Raffle;
use App\Models\RaffleSetting;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;

trait RaffleTestHelpers
{
    protected function admin(array $attributes = []): User
    {
        return User::factory()->create($attributes + [
            'role' => 'admin',
            'is_active' => true,
        ]);
    }

    protected function nonAdmin(): User
    {
        return User::factory()->create(['role' => 'viewer', 'is_active' => true]);
    }

    /**
     * Entrants for one raffle, on tickets 000001, 000002, …
     *
     * @return Collection<int, Participant>
     */
    protected function participants(Raffle $raffle, int $count, ?string $category = null): Collection
    {
        return Participant::factory()
            ->count($count)
            ->sequence(fn ($sequence) => [
                'raffle_id' => $raffle->id,
                'ticket_number' => str_pad((string) ($sequence->index + 1), 6, '0', STR_PAD_LEFT),
                'category' => $category ?? 'VISITOR',
            ])
            ->create();
    }

    /** A ready raffle with its participants already imported. */
    protected function raffleWithPool(int $participantCount = 10, array $attributes = []): Raffle
    {
        $raffle = Raffle::factory()->ready()->create($attributes);
        RaffleSetting::create(['raffle_id' => $raffle->id]);

        if ($participantCount > 0) {
            $this->participants($raffle, $participantCount);
        }

        return $raffle->refresh();
    }
}
