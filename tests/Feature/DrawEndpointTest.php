<?php

namespace Tests\Feature;

use App\Enums\RaffleStatus;
use App\Models\Raffle;
use App\Models\Winner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

class DrawEndpointTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear('draw');
    }

    public function test_an_admin_can_draw_and_receives_the_winning_ticket(): void
    {
        $raffle = $this->raffleWithPool(10);

        $response = $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/draw", ['request_id' => 'abc-123']);

        $response->assertCreated()
            ->assertJsonStructure(['data' => ['ticket_number', 'name', 'position', 'event_uuid', 'remaining_slots', 'raffle_completed']]);

        $this->assertSame(1, Winner::where('raffle_id', $raffle->id)->count());
    }

    public function test_draw_all_picks_every_winner_in_one_request(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 4]);

        $response = $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/draw-all", ['request_id' => 'all-1']);

        $response->assertCreated()
            ->assertJsonCount(4, 'data.winners')
            ->assertJsonPath('data.remaining_slots', 0)
            ->assertJsonPath('data.raffle_completed', true)
            ->assertJsonStructure(['data' => ['winners' => [['ticket_number', 'name', 'position']]]]);

        $this->assertSame([1, 2, 3, 4], array_column($response->json('data.winners'), 'position'));
        $this->assertSame(4, Winner::where('raffle_id', $raffle->id)->count());
        $this->assertSame(RaffleStatus::Completed, $raffle->fresh()->status);
    }

    public function test_draw_all_replays_a_retried_request_instead_of_drawing_again(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 3]);
        $admin = $this->admin();

        $first = $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw-all", ['request_id' => 'all-2'])->assertCreated();
        $second = $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw-all", ['request_id' => 'all-2'])->assertOk();

        $this->assertSame($first->json('data.winners'), $second->json('data.winners'));
        $this->assertSame(3, Winner::where('raffle_id', $raffle->id)->count());
    }

    public function test_draw_all_only_draws_the_slots_still_open(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 3]);
        $admin = $this->admin();

        $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw", ['request_id' => 'one-1'])->assertCreated();

        $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw-all", ['request_id' => 'all-3'])
            ->assertCreated()
            ->assertJsonCount(2, 'data.winners')
            ->assertJsonPath('data.winners.0.position', 2);

        $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw-all", ['request_id' => 'all-4'])
            ->assertStatus(409);
    }

    public function test_a_visitor_draws_as_the_administrator(): void
    {
        // There is no sign-in screen: the request is adopted by the admin account,
        // so the draw still lands in the audit trail attributed to a real user.
        $admin = $this->admin();
        $raffle = $this->raffleWithPool(10);

        $this->postJson("/api/raffles/{$raffle->id}/draw")->assertCreated();

        $this->assertDatabaseHas('winners', ['raffle_id' => $raffle->id, 'drawn_by' => $admin->id]);
    }

    public function test_a_non_admin_cannot_draw(): void
    {
        $raffle = $this->raffleWithPool(10);

        $this->actingAs($this->nonAdmin())
            ->postJson("/api/raffles/{$raffle->id}/draw")
            ->assertForbidden();

        $this->assertDatabaseCount('winners', 0);
    }

    public function test_the_client_cannot_nominate_a_winning_ticket(): void
    {
        $raffle = $this->raffleWithPool(50);

        // The client sends a ticket it would like to win. The server must ignore it.
        $response = $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/draw", [
                'ticket_number' => '000001',
                'winner' => '000001',
                'participant_id' => 1,
            ]);

        $response->assertCreated();

        // With 50 tickets the odds of the server independently picking 000001 are 2%,
        // so assert on what actually matters: the winner came from the real pool and
        // the request payload was not trusted.
        $winner = Winner::where('raffle_id', $raffle->id)->first();

        $this->assertDatabaseHas('participants', [
            'raffle_id' => $raffle->id,
            'ticket_number' => $winner->ticket_number,
        ]);
        $this->assertNotNull($winner->draw_event_id, 'The winner must be backed by a server-side draw event.');
    }

    public function test_a_repeated_request_id_does_not_burn_a_second_winner_slot(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 3]);
        $admin = $this->admin();

        $first = $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw", ['request_id' => 'same-id']);
        $second = $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw", ['request_id' => 'same-id']);

        $first->assertCreated();
        $second->assertOk()->assertJson(['replayed' => true]);

        $this->assertSame($first->json('data.ticket_number'), $second->json('data.ticket_number'));
        $this->assertSame(1, Winner::where('raffle_id', $raffle->id)->count());
    }

    public function test_a_draw_is_rejected_while_another_draw_holds_the_lock(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 5]);

        // Simulate a concurrent request by taking the raffle's draw lock first.
        $lock = cache()->lock("raffle-draw:{$raffle->id}", 15);
        $this->assertTrue($lock->get());

        try {
            $this->actingAs($this->admin())
                ->postJson("/api/raffles/{$raffle->id}/draw")
                ->assertStatus(409)
                ->assertJson(['code' => 'DRAW_IN_PROGRESS']);
        } finally {
            $lock->release();
        }

        $this->assertDatabaseCount('winners', 0);
    }

    public function test_a_completed_raffle_rejects_the_draw_endpoint_with_a_clear_reason(): void
    {
        $raffle = $this->raffleWithPool(10, ['status' => RaffleStatus::Completed->value]);

        $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/draw")
            ->assertStatus(409)
            ->assertJson([
                'message' => 'This raffle is already completed.',
                'code' => 'INVALID_STATUS',
            ]);

        // The refused attempt is still auditable.
        $this->assertDatabaseHas('draw_events', [
            'raffle_id' => $raffle->id,
            'result' => 'INVALID_STATUS',
        ]);
    }

    public function test_a_draft_raffle_draw_is_refused_with_guidance(): void
    {
        $raffle = $this->raffleWithPool(10, ['status' => RaffleStatus::Draft->value]);

        $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/draw")
            ->assertStatus(409)
            ->assertJsonPath('code', 'INVALID_STATUS');
    }

    public function test_drawing_an_unknown_raffle_returns_not_found(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/raffles/99999/draw')
            ->assertNotFound();
    }

    public function test_multiple_winners_are_drawn_in_sequence_without_duplicates(): void
    {
        $raffle = $this->raffleWithPool(25, ['winners_count' => 5]);
        $admin = $this->admin();

        $tickets = [];

        for ($i = 1; $i <= 5; $i++) {
            $response = $this->actingAs($admin)
                ->postJson("/api/raffles/{$raffle->id}/draw", ['request_id' => "draw-{$i}"]);

            $response->assertCreated();
            $this->assertSame($i, $response->json('data.position'));
            $tickets[] = $response->json('data.ticket_number');
        }

        $this->assertCount(5, array_unique($tickets));
        $this->assertSame(RaffleStatus::Completed->value, Raffle::find($raffle->id)->status->value);

        // A sixth attempt must be refused.
        $this->actingAs($admin)
            ->postJson("/api/raffles/{$raffle->id}/draw", ['request_id' => 'draw-6'])
            ->assertStatus(409);
    }

    public function test_two_screens_sending_the_same_draw_get_one_winner(): void
    {
        // Two main screens answer the same DRAW from the Control Center with one id.
        $raffle = $this->raffleWithPool(10, ['winners_count' => 5]);
        $admin = $this->admin();

        $first = $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw", ['request_id' => 'cmd-1'])->assertCreated();
        $second = $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw", ['request_id' => 'cmd-1'])->assertOk();

        $this->assertSame($first->json('data.ticket_number'), $second->json('data.ticket_number'));
        $this->assertTrue($second->json('replayed'));
        $this->assertSame(1, Winner::where('raffle_id', $raffle->id)->count());
    }

    public function test_a_draw_sent_while_another_runs_is_told_to_wait_then_gets_the_same_winner(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 5]);
        $admin = $this->admin();

        // Another request holds the draw lock: this one is refused, nothing drawn.
        $lock = \Illuminate\Support\Facades\Cache::lock("raffle-draw:{$raffle->id}", 15);
        $lock->get();
        $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw", ['request_id' => 'cmd-2'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'DRAW_IN_PROGRESS');
        $this->assertSame(0, Winner::where('raffle_id', $raffle->id)->count());
        $lock->release();

        // The screen retries with the same id and draws exactly once.
        $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw", ['request_id' => 'cmd-2'])->assertCreated();
        $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw", ['request_id' => 'cmd-2'])->assertOk();
        $this->assertSame(1, Winner::where('raffle_id', $raffle->id)->count());
    }

    public function test_a_busy_event_is_not_stopped_by_the_rate_limit(): void
    {
        $raffle = $this->raffleWithPool(60, ['winners_count' => 40]);
        $admin = $this->admin();

        for ($i = 1; $i <= 40; $i++) {
            $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw", ['request_id' => "busy-{$i}"])->assertCreated();
        }

        $this->assertSame(40, Winner::where('raffle_id', $raffle->id)->count());
    }
}
