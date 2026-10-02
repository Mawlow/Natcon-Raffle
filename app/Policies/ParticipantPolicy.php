<?php

namespace App\Policies;

use App\Models\Participant;
use App\Models\User;

class ParticipantPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->isAdmin();
    }

    public function view(User $user, Participant $participant): bool
    {
        return $user->isAdmin();
    }

    public function create(User $user): bool
    {
        return $user->isAdmin();
    }

    public function update(User $user, Participant $participant): bool
    {
        return $user->isAdmin();
    }

    public function delete(User $user, Participant $participant): bool
    {
        return $user->isAdmin();
    }

    public function import(User $user): bool
    {
        return $user->isAdmin();
    }
}
