<?php

namespace Tests\Feature;

use App\Models\Participant;
use App\Models\Raffle;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/** People not at the event are marked absent in the Control Center and kept out of every draw. */
class AbsentParticipantsTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected function mark(Raffle $raffle, string $ticket, string $status)
    {
        $participant = Participant::query()->where('raffle_id', $raffle->id)->where('ticket_number', $ticket)->sole();

        return $this->actingAs($this->admin())->putJson("/api/raffles/{$raffle->id}/participants/{$participant->id}", ['status' => $status]);
    }

    public function test_an_absent_participant_is_never_drawn(): void
    {
        $raffle = $this->raffleWithPool(3, ['winners_count' => 3]);
        $this->mark($raffle, '000002', 'ABSENT')->assertOk()->assertJsonPath('data.status', 'ABSENT');

        $draws = app(RaffleDrawService::class);
        $this->assertSame(2, $draws->eligibleTicketCount($raffle));

        $tickets = [$draws->draw($raffle->refresh())->winner->ticket_number, $draws->draw($raffle->refresh())->winner->ticket_number];
        $this->assertNotContains('000002', $tickets);
    }

    public function test_marking_them_present_again_puts_them_back_in(): void
    {
        $raffle = $this->raffleWithPool(3);
        $this->mark($raffle, '000002', 'ABSENT');
        $this->mark($raffle, '000002', 'ACTIVE')->assertOk();

        $this->assertSame(3, app(RaffleDrawService::class)->eligibleTicketCount($raffle));
    }

    public function test_absent_stays_absent_in_the_next_raffle(): void
    {
        $raffle = $this->raffleWithPool(3, ['winners_count' => 1]);
        $this->mark($raffle, '000002', 'ABSENT');
        app(RaffleDrawService::class)->draw($raffle);

        $next = $this->actingAs($this->admin())->postJson("/api/raffles/{$raffle->id}/next-round", [
            'name' => 'Next', 'leave_out_winners' => false,
            'prizes' => [['winners_count' => 1, 'prize_name' => 'Cash']],
        ])->assertCreated()->json('data.id');

        $this->assertSame('ABSENT', Participant::query()->where('raffle_id', $next)->where('ticket_number', '000002')->value('status')->value);
        $this->actingAs($this->admin())
            ->getJson("/api/raffles/{$next}/participants/pool-count?leave_out=0")
            ->assertJsonPath('data.count', 2);
    }
}
