<?php

namespace Tests\Feature;

use App\Models\Participant;
use App\Models\Raffle;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

class RedrawTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    /** A raffle with every winner already drawn. */
    protected function drawnRaffle(int $pool = 6, int $winners = 2): Raffle
    {
        $raffle = $this->raffleWithPool($pool, ['winners_count' => $winners]);
        app(RaffleDrawService::class)->drawAll($raffle, $this->admin());

        return $raffle->refresh();
    }

    public function test_a_redraw_can_let_previous_winners_win_again(): void
    {
        $raffle = $this->drawnRaffle();
        $previous = $raffle->winners()->pluck('ticket_number')->all();

        $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/redraw", ['include_previous_winners' => true])
            ->assertOk()
            ->assertJsonPath('data.cleared', $previous)
            ->assertJsonPath('data.eligible_count', 6);

        $raffle->refresh();
        $this->assertSame('READY', $raffle->status->value);
        $this->assertNull($raffle->completed_at);
        $this->assertDatabaseMissing('winners', ['raffle_id' => $raffle->id]);
        $this->assertSame(0, Participant::where('raffle_id', $raffle->id)->where('status', '!=', 'ACTIVE')->count());

        $this->assertDatabaseHas('draw_events', ['raffle_id' => $raffle->id, 'result' => 'REDRAW']);
        // The original draws stay in the audit trail.
        $this->assertSame(2, $raffle->drawEvents()->where('result', 'SUCCESS')->count());
    }

    public function test_a_redraw_can_leave_previous_winners_out(): void
    {
        $raffle = $this->drawnRaffle(pool: 4, winners: 2);
        $previous = $raffle->winners()->pluck('ticket_number')->all();

        $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/redraw", ['include_previous_winners' => false])
            ->assertOk()
            ->assertJsonPath('data.eligible_count', 2);

        foreach ($previous as $ticket) {
            $this->assertDatabaseHas('participants', ['raffle_id' => $raffle->id, 'ticket_number' => $ticket, 'status' => 'EXCLUDED']);
        }

        // With only the two other tickets left, the redraw must pick exactly them.
        app(RaffleDrawService::class)->drawAll($raffle->refresh(), $this->admin());
        $redrawn = $raffle->winners()->pluck('ticket_number')->all();

        $this->assertCount(2, $redrawn);
        $this->assertEmpty(array_intersect($previous, $redrawn));
    }

    public function test_excluded_tickets_stay_out_even_when_repeat_winners_are_allowed(): void
    {
        $raffle = $this->drawnRaffle(pool: 3, winners: 1);
        $raffle->update(['allow_repeat_winners' => true]);

        $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/redraw", ['include_previous_winners' => false])
            ->assertOk()
            ->assertJsonPath('data.eligible_count', 2);
    }

    public function test_letting_previous_winners_back_in_also_returns_earlier_exclusions(): void
    {
        $raffle = $this->drawnRaffle(pool: 5, winners: 1);
        $admin = $this->admin();

        $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/redraw", ['include_previous_winners' => false])->assertOk();
        app(RaffleDrawService::class)->drawAll($raffle->refresh(), $admin);

        $this->actingAs($admin)
            ->postJson("/api/raffles/{$raffle->id}/redraw", ['include_previous_winners' => true])
            ->assertOk()
            ->assertJsonPath('data.eligible_count', 5);
    }

    public function test_a_raffle_with_no_winners_cannot_be_redrawn(): void
    {
        $raffle = $this->raffleWithPool(5);

        $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/redraw", ['include_previous_winners' => true])
            ->assertStatus(409);
    }

    public function test_an_archived_raffle_cannot_be_redrawn(): void
    {
        $raffle = $this->drawnRaffle();
        $raffle->forceFill(['archived_at' => now()])->save();

        $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/redraw", ['include_previous_winners' => true])
            ->assertForbidden();

        $this->assertSame(2, $raffle->winners()->count());
    }

    public function test_the_redraw_option_is_required(): void
    {
        $raffle = $this->drawnRaffle();

        $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/redraw", [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('include_previous_winners');
    }

    public function test_a_non_admin_cannot_redraw(): void
    {
        $raffle = $this->drawnRaffle();

        $this->actingAs($this->nonAdmin())
            ->postJson("/api/raffles/{$raffle->id}/redraw", ['include_previous_winners' => true])
            ->assertForbidden();

        $this->assertSame(2, $raffle->winners()->count());
    }
}
