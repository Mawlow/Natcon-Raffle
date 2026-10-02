<?php

namespace Database\Seeders;

use App\Enums\ParticipantStatus;
use App\Enums\RaffleStatus;
use App\Models\Participant;
use App\Models\Raffle;
use App\Models\RaffleSetting;
use App\Models\User;
use App\Services\RaffleDrawService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::updateOrCreate(
            ['email' => 'admin@raffle.test'],
            [
                'name' => 'Raffle Administrator',
                'password' => 'password',
                'role' => 'super-admin',
                'is_active' => true,
                'email_verified_at' => now(),
            ],
        );

        $this->seedRaffles($admin);

        $this->command?->newLine();
        $this->command?->info('Admin login:  admin@raffle.test');
        $this->command?->info('Password:     password');
    }

    protected function seedRaffles(User $admin): void
    {
        if (Raffle::query()->exists()) {
            $this->command?->warn('Raffles already exist — skipping raffle seeding.');

            return;
        }

        $draws = app(RaffleDrawService::class);

        $definitions = [
            [
                'name' => 'Grand Anniversary Raffle 2026',
                'description' => 'The headline draw of the anniversary celebration.',
                'prize_name' => 'Cash Prize',
                'prize_value' => 50000,
                'winners_count' => 3,
                'participant_pool' => 'Anniversary Participants 2026',
                'participants' => 100,
                'status' => RaffleStatus::Ready->value,
                'draw' => 0,
            ],
            [
                'name' => 'VIP Lounge Giveaway',
                'description' => 'Exclusive draw for VIP guests only.',
                'prize_name' => 'Weekend Staycation',
                'prize_value' => 18000,
                'winners_count' => 2,
                'participant_pool' => 'VIP Guests',
                'participants' => 40,
                'status' => RaffleStatus::Ready->value,
                'draw' => 0,
            ],
            [
                'name' => 'Christmas Giveaway 2025',
                'description' => 'Completed year-end draw, kept for the winner archive.',
                'prize_name' => 'Smartphone Bundle',
                'prize_value' => 35000,
                'winners_count' => 2,
                'participant_pool' => 'All Participants',
                'participants' => 60,
                'status' => RaffleStatus::Ready->value,
                'draw' => 2,
            ],
            [
                'name' => 'Company Anniversary Draft',
                'description' => 'Still being configured.',
                'prize_name' => 'Travel Voucher',
                'prize_value' => 25000,
                'winners_count' => 1,
                'participant_pool' => 'Staff',
                'participants' => 0,
                'status' => RaffleStatus::Draft->value,
                'draw' => 0,
            ],
        ];

        foreach ($definitions as $definition) {
            $drawCount = $definition['draw'];
            $participantCount = $definition['participants'];
            unset($definition['draw'], $definition['participants']);

            $raffle = Raffle::create($definition + [
                'slug' => Str::slug($definition['name']),
                'prize_currency' => 'PHP',
                'allow_repeat_winners' => false,
                'starts_at' => now()->subDays(1),
                'created_by' => $admin->id,
            ]);

            RaffleSetting::create(['raffle_id' => $raffle->id]);
            $this->seedParticipants($raffle, $participantCount);

            for ($i = 0; $i < $drawCount; $i++) {
                $draws->draw($raffle, $admin, 'seed-'.Str::random(12), '127.0.0.1');
            }
        }

        $this->command?->info('Seeded '.count($definitions).' raffles with their own participant lists.');
    }

    /**
     * Give one raffle its own entrants, as an imported CSV would.
     *
     * Ticket numbers restart at 000001 for every raffle — they are unique per
     * raffle, not globally.
     */
    protected function seedParticipants(Raffle $raffle, int $count): void
    {
        if ($count === 0) {
            return;
        }

        $categories = ['VISITOR', 'VISITOR', 'VISITOR', 'VIP', 'STAFF', 'PARTNER'];
        $rows = [];
        $now = now();

        for ($i = 1; $i <= $count; $i++) {
            $rows[] = [
                'raffle_id' => $raffle->id,
                'ticket_number' => str_pad((string) $i, 6, '0', STR_PAD_LEFT),
                'name' => fake()->name(),
                'email' => sprintf('participant%03d@example.test', $i),
                'phone' => fake()->numerify('+639#########'),
                'category' => $categories[$i % count($categories)],
                'status' => ParticipantStatus::Active->value,
                'metadata' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        // One disqualified entry per raffle, so the eligibility rules show up in seeded data.
        $rows[] = [
            'raffle_id' => $raffle->id,
            'ticket_number' => str_pad((string) ($count + 1), 6, '0', STR_PAD_LEFT),
            'name' => 'Disqualified Entry',
            'email' => 'disqualified@example.test',
            'phone' => null,
            'category' => 'VISITOR',
            'status' => ParticipantStatus::Disqualified->value,
            'metadata' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ];

        foreach (array_chunk($rows, 200) as $chunk) {
            Participant::insert($chunk);
        }
    }
}
