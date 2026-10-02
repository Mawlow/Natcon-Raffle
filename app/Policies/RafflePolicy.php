<?php

namespace App\Policies;

use App\Models\Raffle;
use App\Models\User;

class RafflePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->isAdmin();
    }

    public function view(User $user, Raffle $raffle): bool
    {
        return $user->isAdmin();
    }

    public function create(User $user): bool
    {
        return $user->isAdmin();
    }

    public function update(User $user, Raffle $raffle): bool
    {
        return $user->isAdmin() && ! $raffle->isArchived();
    }

    /**
     * Any raffle can be deleted outright, whatever its state. The database
     * cascades the delete to its participants, winners, draw events, imports
     * and settings; the admin screens make the operator confirm that first.
     */
    public function delete(User $user, Raffle $raffle): bool
    {
        return $user->isAdmin();
    }

    public function archive(User $user, Raffle $raffle): bool
    {
        return $user->isAdmin() && ! $raffle->isArchived();
    }

    /**
     * Whether the user may attempt a draw at all.
     *
     * Deliberately does not check the raffle's status: RaffleDrawService owns
     * that rule, so a wrongly-timed attempt gets a specific message and an
     * audit record instead of a bare 403.
     */
    public function draw(User $user, Raffle $raffle): bool
    {
        return $user->isAdmin() && ! $raffle->isArchived();
    }
}
