<?php

namespace Tests\Feature;

use App\Models\Participant;
use App\Models\Raffle;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

class PublicDisplayTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    public function test_the_display_endpoint_is_reachable_without_signing_in(): void
    {
        $raffle = $this->raffleWithPool(5);

        $this->getJson("/api/raffles/{$raffle->id}/display")
            ->assertOk()
            ->assertJsonPath('data.name', $raffle->name)
            ->assertJsonPath('data.prize_name', $raffle->prize_name);
    }

    /**
     * The wall shows names — each winner's, and a sample of the names in play
     * for the roller — but nothing else that identifies a person may appear
     * in the payload that drives the projector.
     */
    public function test_the_display_payload_shows_names_but_no_other_identity(): void
    {
        $raffle = Raffle::factory()->ready()->create(['winners_count' => 2]);
        $this->participants($raffle, 5);

        app(RaffleDrawService::class)->drawAll($raffle->refresh(), $this->admin());

        $winnerTicket = $raffle->winners()->orderBy('position')->value('ticket_number');
        $loserTicket = Participant::query()->forRaffle($raffle)
            ->whereNotIn('ticket_number', $raffle->winners()->pluck('ticket_number'))
            ->value('ticket_number');

        Participant::query()->forRaffle($raffle)->where('ticket_number', $winnerTicket)->update([
            'name' => 'Very Unique Winner Name',
            'email' => 'very-unique-address@example.test',
            'phone' => '+639171234567',
        ]);
        Participant::query()->forRaffle($raffle)->where('ticket_number', $loserTicket)->update([
            'email' => 'loser-address@example.test',
            'phone' => '+639179999999',
        ]);

        $response = $this->getJson("/api/raffles/{$raffle->id}/display")->assertOk();
        $body = $response->getContent();

        $this->assertStringContainsString('Very Unique Winner Name', $body);

        foreach (['very-unique-address@example.test', '+639171234567', 'loser-address@example.test', '+639179999999'] as $secret) {
            $this->assertStringNotContainsString($secret, $body);
        }

        foreach (['"email":', '"phone":', 'participant_id'] as $key) {
            $this->assertStringNotContainsString($key, $body);
        }

        $winner = $response->json('data.winners.0');
        $this->assertSame(['ticket_number', 'name', 'position', 'drawn_at'], array_keys($winner));
        $this->assertSame('Very Unique Winner Name', $winner['name']);
    }

    public function test_the_display_payload_only_contains_ticket_numbers_for_the_roller(): void
    {
        $raffle = $this->raffleWithPool(8);

        $tickets = $this->getJson("/api/raffles/{$raffle->id}/display")
            ->assertOk()
            ->json('data.sample_tickets');

        $this->assertNotEmpty($tickets);

        foreach ($tickets as $ticket) {
            $this->assertIsString($ticket);
            $this->assertTrue(
                Participant::where('ticket_number', $ticket)->exists(),
                "Sample ticket {$ticket} should be a real ticket number.",
            );
        }
    }

    public function test_the_roller_names_are_only_names_still_in_play(): void
    {
        $raffle = $this->raffleWithPool(8, ['winners_count' => 1]);
        app(RaffleDrawService::class)->draw($raffle, $this->admin());
        $winnerName = $raffle->winners()->first()->participant->name;

        $names = $this->getJson("/api/raffles/{$raffle->id}/display")
            ->assertOk()
            ->json('data.sample_names');

        $this->assertCount(7, $names);
        $this->assertNotContains($winnerName, $names);
        foreach ($names as $name) {
            $this->assertTrue(Participant::where('name', $name)->exists());
        }
    }

    public function test_the_display_reports_the_eligible_count_and_settings(): void
    {
        $raffle = $this->raffleWithPool(12, ['winners_count' => 3]);

        $this->getJson("/api/raffles/{$raffle->id}/display")
            ->assertOk()
            ->assertJsonPath('data.eligible_count', 12)
            ->assertJsonPath('data.winners_count', 3)
            ->assertJsonStructure(['data' => ['settings' => [
                'sound_countdown', 'sound_drawing', 'sound_winner',
                'sound_celebration', 'show_confetti', 'countdown_seconds', 'roll_duration_ms',
                'draw_mode',
            ]]]);
    }

    public function test_the_admin_winner_list_does_include_participant_details(): void
    {
        $raffle = $this->raffleWithPool(5);
        app(RaffleDrawService::class)->draw($raffle, $this->admin());

        $this->actingAs($this->admin())
            ->getJson("/api/raffles/{$raffle->id}/winners")
            ->assertOk()
            ->assertJsonStructure(['data' => [['ticket_number', 'position', 'participant' => ['name', 'email']]]]);
    }

    public function test_an_unknown_raffle_display_returns_not_found(): void
    {
        $this->getJson('/api/raffles/4242/display')->assertNotFound();
    }
}
