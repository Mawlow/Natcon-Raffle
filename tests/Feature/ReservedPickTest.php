<?php

namespace Tests\Feature;

use App\Enums\RaffleStatus;
use App\Models\Participant;
use App\Models\ReservedPick;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

class ReservedPickTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected RaffleDrawService $draws;

    protected function setUp(): void
    {
        parent::setUp();
        $this->draws = app(RaffleDrawService::class);
    }

    protected function reservedIn($raffle): Participant
    {
        $person = Participant::create([
            'raffle_id' => $raffle->id,
            'name' => 'John Robert Maizo',
            'ticket_number' => '#384',
            'category' => 'STAFF',
        ]);
        ReservedPick::current()->fill(['name' => ' john robert maizo ', 'ticket_number' => '#384'])->save();

        return $person;
    }

    public function test_the_reserved_pick_never_wins_at_random(): void
    {
        // A pool of one other ticket, drawn 30 times with repeats allowed:
        // if the reserved pick were in play, missing them every time would
        // be as good as impossible.
        $raffle = $this->raffleWithPool(1, ['winners_count' => 30, 'allow_repeat_winners' => true]);
        $this->reservedIn($raffle);

        $this->assertSame(1, $this->draws->eligibleTicketCount($raffle));

        for ($i = 0; $i < 30; $i++) {
            $outcome = $this->draws->draw($raffle->refresh(), $this->admin());
            $this->assertNotSame('#384', $outcome->winner->ticket_number);
        }
    }

    public function test_armed_for_a_raffle_they_come_out_in_their_slot_then_it_disarms(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 5]);
        $person = $this->reservedIn($raffle);
        $admin = $this->admin();

        $slot = ReservedPick::slotFor($raffle);
        $this->assertContains($slot, [3, 4]);
        ReservedPick::current()->forceFill(['armed_raffle_id' => $raffle->id, 'armed_position' => $slot])->save();

        $tickets = [];
        for ($i = 1; $i <= 5; $i++) {
            $outcome = $this->draws->draw($raffle->refresh(), $admin);
            $tickets[$i] = $outcome->winner->ticket_number;

            if ($i === $slot) {
                $this->assertSame($person->id, $outcome->winner->participant_id);
                $this->assertTrue($outcome->drawEvent->context['reserved_pick']);
                $this->assertNull(ReservedPick::current()->armed_raffle_id);
            }
        }

        $this->assertSame('#384', $tickets[$slot]);
        $this->assertCount(1, array_keys($tickets, '#384', true));
        $this->assertNotSame('#384', $tickets[1]);
        $this->assertNotSame('#384', $tickets[5]);
    }

    public function test_the_slot_is_never_first_or_last_when_there_is_room(): void
    {
        $this->assertSame(1, ReservedPick::slotFor($this->raffleWithPool(1, ['winners_count' => 1])));
        $this->assertSame(2, ReservedPick::slotFor($this->raffleWithPool(1, ['winners_count' => 2])));
        $this->assertSame(2, ReservedPick::slotFor($this->raffleWithPool(1, ['winners_count' => 3])));
        $this->assertSame(3, ReservedPick::slotFor($this->raffleWithPool(1, ['winners_count' => 4])));

        for ($i = 0; $i < 20; $i++) {
            $this->assertContains(ReservedPick::slotFor($this->raffleWithPool(1, ['winners_count' => 5])), [3, 4]);
            $this->assertContains(ReservedPick::slotFor($this->raffleWithPool(1, ['winners_count' => 10])), [3, 4]);
        }
    }

    public function test_armed_for_another_raffle_this_one_stays_random(): void
    {
        $raffle = $this->raffleWithPool(1, ['winners_count' => 1]);
        $other = $this->raffleWithPool(1);
        $this->reservedIn($raffle);
        ReservedPick::current()->forceFill(['armed_raffle_id' => $other->id])->save();

        $outcome = $this->draws->draw($raffle, $this->admin());

        $this->assertNotSame('#384', $outcome->winner->ticket_number);
        $this->assertSame($other->id, ReservedPick::current()->armed_raffle_id);
    }

    public function test_the_control_center_can_read_and_arm_the_pick(): void
    {
        $raffle = $this->raffleWithPool(3, ['winners_count' => 3]);
        $this->reservedIn($raffle);
        $this->actingAs($this->admin());

        $this->getJson("/api/reserved-pick?raffle={$raffle->id}")
            ->assertOk()
            ->assertJsonPath('data.ticket_number', '#384')
            ->assertJsonPath('data.in_raffle', true)
            ->assertJsonPath('data.armed_raffle_id', null);

        $this->putJson("/api/reserved-pick?raffle={$raffle->id}", ['name' => 'John Robert Maizo', 'ticket_number' => '#384', 'armed_raffle_id' => $raffle->id])
            ->assertOk()
            ->assertJsonPath('data.armed_raffle_id', $raffle->id)
            ->assertJsonPath('data.armed_position', 2);

        $this->putJson("/api/reserved-pick?raffle={$raffle->id}", ['name' => 'John Robert Maizo', 'ticket_number' => '#384', 'armed_raffle_id' => null])
            ->assertOk()
            ->assertJsonPath('data.armed_raffle_id', null);
    }
}
