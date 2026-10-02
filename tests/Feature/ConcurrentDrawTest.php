<?php

namespace Tests\Feature;

use App\Exceptions\DrawException;
use App\Models\Winner;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/**
 * Race-condition protection.
 *
 * A real concurrent test needs real parallel connections, which the in-memory
 * SQLite test database cannot provide. These tests instead pin down the
 * invariants that make a race harmless: the unique (raffle_id, position) index
 * and the re-read of the winner count inside the locked transaction.
 */
class ConcurrentDrawTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    public function test_two_winners_can_never_share_a_position(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 3]);
        $admin = $this->admin();

        $first = app(RaffleDrawService::class)->draw($raffle, $admin);

        // Simulate a racing request that slipped past the application check:
        // the unique index must still refuse the duplicate position.
        $this->expectException(\Illuminate\Database\UniqueConstraintViolationException::class);

        Winner::create([
            'raffle_id' => $raffle->id,
            'participant_id' => $first->winner->participant_id,
            'ticket_number' => $first->winner->ticket_number,
            'position' => $first->winner->position,
            'drawn_at' => now(),
        ]);
    }

    public function test_the_winner_count_is_re_read_inside_the_locked_transaction(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 1]);
        $admin = $this->admin();
        $service = app(RaffleDrawService::class);

        $service->draw($raffle, $admin);

        // The stale in-memory $raffle still believes no winner exists. The service
        // must re-read state under the lock rather than trusting the caller.
        try {
            $service->draw($raffle, $admin);
            $this->fail('A second draw should have been refused.');
        } catch (DrawException) {
            // expected
        }

        $this->assertSame(1, Winner::where('raffle_id', $raffle->id)->count());
    }

    public function test_a_failed_draw_leaves_no_partial_winner_or_orphaned_state(): void
    {
        $raffle = $this->raffleWithPool(1, ['winners_count' => 2]);
        $admin = $this->admin();
        $service = app(RaffleDrawService::class);

        $service->draw($raffle, $admin);

        // The only ticket has now won, so the second draw finds an empty pool.
        try {
            $service->draw($raffle->refresh(), $admin);
            $this->fail('The second draw should have failed.');
        } catch (DrawException) {
            // expected
        }

        $this->assertSame(1, Winner::where('raffle_id', $raffle->id)->count());
        $this->assertSame(0, DB::table('winners')->where('position', 2)->count());
        // The failure is still audited.
        $this->assertDatabaseHas('draw_events', [
            'raffle_id' => $raffle->id,
            'result' => 'NO_ELIGIBLE_PARTICIPANTS',
        ]);
    }

    public function test_the_draw_lock_is_released_after_a_failed_draw(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 2]);
        $admin = $this->admin();

        // Force a failure by archiving the raffle, then confirm a later valid
        // draw is not blocked by a lock left behind.
        $raffle->update(['archived_at' => now()]);
        $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw")->assertForbidden();

        $raffle->update(['archived_at' => null]);
        $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/draw")->assertCreated();
    }
}
