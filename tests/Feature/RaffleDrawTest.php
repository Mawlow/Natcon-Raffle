<?php

namespace Tests\Feature;

use App\Enums\DrawResult;
use App\Enums\ParticipantStatus;
use App\Enums\RaffleStatus;
use App\Exceptions\DrawException;
use App\Models\DrawEvent;
use App\Models\Participant;
use App\Models\Raffle;
use App\Models\Winner;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

class RaffleDrawTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected RaffleDrawService $draws;

    protected function setUp(): void
    {
        parent::setUp();
        $this->draws = app(RaffleDrawService::class);
    }

    public function test_a_draw_selects_an_eligible_ticket_and_records_a_winner(): void
    {
        $raffle = $this->raffleWithPool(20);
        $admin = $this->admin();

        $outcome = $this->draws->draw($raffle, $admin, 'req-1', '127.0.0.1');

        $this->assertSame(1, $outcome->winner->position);
        $this->assertTrue(
            Participant::where('ticket_number', $outcome->winner->ticket_number)->exists(),
            'The winning ticket must belong to a real participant.',
        );
        $this->assertDatabaseHas('winners', [
            'raffle_id' => $raffle->id,
            'ticket_number' => $outcome->winner->ticket_number,
            'position' => 1,
        ]);
    }

    /** The headline guarantee of the whole system. */
    public function test_the_same_ticket_cannot_win_twice_when_repeat_winners_are_disabled(): void
    {
        // A pool of exactly two tickets makes a repeat overwhelmingly likely if the
        // exclusion were broken.
        $raffle = $this->raffleWithPool(2, ['winners_count' => 2, 'allow_repeat_winners' => false]);
        $admin = $this->admin();

        $first = $this->draws->draw($raffle, $admin);
        $second = $this->draws->draw($raffle->refresh(), $admin);

        $this->assertNotSame($first->winner->ticket_number, $second->winner->ticket_number);
        $this->assertSame(
            2,
            Winner::where('raffle_id', $raffle->id)->distinct()->count('ticket_number'),
            'Each winner must hold a distinct ticket number.',
        );
    }

    public function test_repeated_draws_never_produce_a_duplicate_across_a_large_raffle(): void
    {
        $raffle = $this->raffleWithPool(30, ['winners_count' => 30]);
        $admin = $this->admin();

        $outcomes = $this->draws->drawAll($raffle, $admin);
        $tickets = array_map(fn ($outcome) => $outcome->winner->ticket_number, $outcomes);

        $this->assertCount(30, $tickets);
        $this->assertSame(count($tickets), count(array_unique($tickets)));
    }

    public function test_a_ticket_may_win_again_when_repeat_winners_are_explicitly_allowed(): void
    {
        $raffle = $this->raffleWithPool(1, ['winners_count' => 3, 'allow_repeat_winners' => true]);
        $admin = $this->admin();

        $this->draws->drawAll($raffle, $admin);

        $this->assertSame(3, Winner::where('raffle_id', $raffle->id)->count());
        $this->assertSame(1, Winner::where('raffle_id', $raffle->id)->distinct()->count('ticket_number'));
    }

    public function test_drawing_more_winners_than_configured_is_rejected(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 1]);
        $admin = $this->admin();

        $this->draws->draw($raffle, $admin);

        $this->expectException(DrawException::class);
        $this->draws->draw($raffle->refresh(), $admin);
    }

    public function test_a_completed_raffle_cannot_be_drawn(): void
    {
        $raffle = $this->raffleWithPool(10, ['status' => RaffleStatus::Completed->value, 'winners_count' => 2]);

        try {
            $this->draws->draw($raffle, $this->admin());
            $this->fail('A completed raffle should not be drawable.');
        } catch (DrawException $e) {
            $this->assertSame(DrawResult::InvalidStatus, $e->result);
        }
    }

    public function test_a_draft_raffle_cannot_be_drawn(): void
    {
        $raffle = $this->raffleWithPool(10, ['status' => RaffleStatus::Draft->value]);

        $this->expectException(DrawException::class);
        $this->draws->draw($raffle, $this->admin());
    }

    public function test_an_empty_pool_is_reported_rather_than_crashing(): void
    {
        $raffle = Raffle::factory()->ready()->create();

        try {
            $this->draws->draw($raffle, $this->admin());
            $this->fail('An empty pool should raise a draw exception.');
        } catch (DrawException $e) {
            $this->assertSame(DrawResult::NoEligibleParticipants, $e->result);
        }
    }

    public function test_disqualified_participants_are_never_drawn(): void
    {
        $raffle = Raffle::factory()->ready()->create(['winners_count' => 1]);
        $this->participants($raffle, 5);
        Participant::query()->forRaffle($raffle)->where('ticket_number', '!=', '000003')
            ->update(['status' => ParticipantStatus::Disqualified->value]);

        $outcome = $this->draws->draw($raffle->refresh(), $this->admin());

        $this->assertSame('000003', $outcome->winner->ticket_number);
    }

    public function test_the_winning_participant_is_marked_as_a_winner(): void
    {
        $raffle = $this->raffleWithPool(5);

        $outcome = $this->draws->draw($raffle, $this->admin());

        $this->assertSame(
            ParticipantStatus::Winner,
            Participant::find($outcome->winner->participant_id)->status,
        );
    }

    public function test_a_raffle_completes_automatically_once_every_slot_is_filled(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 2]);
        $admin = $this->admin();

        $this->draws->draw($raffle, $admin);
        $this->assertSame(RaffleStatus::Live, $raffle->refresh()->status);

        $this->draws->draw($raffle->refresh(), $admin);
        $this->assertSame(RaffleStatus::Completed, $raffle->refresh()->status);
        $this->assertNotNull($raffle->refresh()->completed_at);
    }

    public function test_every_successful_draw_writes_an_audit_event(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 2]);
        $admin = $this->admin();

        $outcome = $this->draws->draw($raffle, $admin, 'request-abc', '10.0.0.5');

        $event = DrawEvent::where('raffle_id', $raffle->id)->latest('id')->first();

        $this->assertSame(DrawResult::Success, $event->result);
        $this->assertSame($outcome->winner->ticket_number, $event->ticket_number);
        $this->assertSame(1, $event->sequence);
        $this->assertSame($admin->id, $event->user_id);
        $this->assertSame('request-abc', $event->request_id);
        $this->assertSame('10.0.0.5', $event->ip_address);
        $this->assertNotEmpty($event->event_uuid);
    }

    public function test_a_rejected_draw_is_still_recorded_in_the_audit_log(): void
    {
        $raffle = $this->raffleWithPool(5, ['status' => RaffleStatus::Draft->value]);

        try {
            $this->draws->draw($raffle, $this->admin(), 'rejected-1');
        } catch (DrawException) {
            // expected
        }

        $this->assertDatabaseHas('draw_events', [
            'raffle_id' => $raffle->id,
            'result' => DrawResult::InvalidStatus->value,
            'request_id' => 'rejected-1',
        ]);
        $this->assertDatabaseCount('winners', 0);
    }

    public function test_ticket_numbers_keep_their_leading_zeros_through_a_draw(): void
    {
        $raffle = Raffle::factory()->ready()->create(['winners_count' => 1]);
        Participant::factory()->forRaffle($raffle)->ticket('000007')->create();

        $outcome = $this->draws->draw($raffle->refresh(), $this->admin());

        $this->assertSame('000007', $outcome->winner->ticket_number);
        $this->assertSame('000007', $outcome->toPublicArray()['ticket_number']);
    }
}
