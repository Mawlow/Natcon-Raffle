<?php

namespace Tests\Feature;

use App\Enums\ParticipantStatus;
use App\Models\Participant;
use App\Models\Raffle;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

class ParticipantManagementTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected Raffle $raffle;

    protected function setUp(): void
    {
        parent::setUp();

        $this->raffle = Raffle::factory()->create();
    }

    protected function url(string $suffix = ''): string
    {
        return "/api/raffles/{$this->raffle->id}/participants".$suffix;
    }

    public function test_participants_are_paginated_server_side(): void
    {
        $this->participants($this->raffle, 60);

        $this->actingAs($this->admin())
            ->getJson($this->url('?per_page=25'))
            ->assertOk()
            ->assertJsonCount(25, 'data')
            ->assertJsonPath('meta.total', 60)
            ->assertJsonPath('meta.last_page', 3);
    }

    public function test_only_the_participants_of_that_raffle_are_listed(): void
    {
        $this->participants($this->raffle, 5);
        $this->participants(Raffle::factory()->create(), 9);

        $this->actingAs($this->admin())
            ->getJson($this->url())
            ->assertOk()
            ->assertJsonPath('meta.total', 5);
    }

    public function test_participants_can_be_searched_by_ticket_number(): void
    {
        $this->participants($this->raffle, 20);

        $this->actingAs($this->admin())
            ->getJson($this->url('?search=000007'))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.ticket_number', '000007');
    }

    public function test_participants_can_be_filtered_by_status_and_category(): void
    {
        $this->participants($this->raffle, 10, 'VISITOR');
        Participant::factory()->forRaffle($this->raffle)->ticket('000900')->create(['category' => 'VIP']);
        Participant::factory()->forRaffle($this->raffle)->ticket('000901')->disqualified()->create(['category' => 'VIP']);

        $admin = $this->admin();

        $this->actingAs($admin)->getJson($this->url('?category=VIP'))
            ->assertOk()->assertJsonCount(2, 'data');

        $this->actingAs($admin)->getJson($this->url('?status=DISQUALIFIED'))
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.ticket_number', '000901');
    }

    public function test_an_admin_can_create_a_participant_with_a_leading_zero_ticket(): void
    {
        $this->actingAs($this->admin())
            ->postJson($this->url(), [
                'ticket_number' => '000001',
                'name' => 'Juan Dela Cruz',
                'email' => 'juan@email.com',
                'category' => 'VISITOR',
            ])
            ->assertCreated()
            ->assertJsonPath('data.ticket_number', '000001')
            ->assertJsonPath('data.raffle_id', $this->raffle->id);

        $this->assertDatabaseHas('participants', [
            'raffle_id' => $this->raffle->id,
            'ticket_number' => '000001',
        ]);
    }

    public function test_duplicate_ticket_numbers_within_the_same_raffle_are_rejected(): void
    {
        Participant::factory()->forRaffle($this->raffle)->ticket('000001')->create();

        $this->actingAs($this->admin())
            ->postJson($this->url(), ['ticket_number' => '000001'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('ticket_number');
    }

    public function test_the_same_ticket_number_is_accepted_in_a_different_raffle(): void
    {
        Participant::factory()->forRaffle($this->raffle)->ticket('000001')->create();
        $other = Raffle::factory()->create();

        $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$other->id}/participants", ['ticket_number' => '000001'])
            ->assertCreated()
            ->assertJsonPath('data.raffle_id', $other->id);
    }

    public function test_a_hash_prefixed_ticket_can_be_added_by_hand(): void
    {
        $this->actingAs($this->admin())
            ->postJson($this->url(), ['ticket_number' => '#01', 'name' => 'Juan'])
            ->assertCreated()
            ->assertJsonPath('data.ticket_number', '#01');
    }

    public function test_a_ticket_number_with_unsupported_characters_is_rejected(): void
    {
        $this->actingAs($this->admin())
            ->postJson($this->url(), ['ticket_number' => '00 01/<script>'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('ticket_number');
    }

    public function test_an_admin_can_update_and_disqualify_a_participant(): void
    {
        $participant = Participant::factory()->forRaffle($this->raffle)->ticket('000001')->create();

        $this->actingAs($this->admin())
            ->putJson($this->url("/{$participant->id}"), [
                'name' => 'Updated Name',
                'status' => ParticipantStatus::Disqualified->value,
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Name')
            ->assertJsonPath('data.status', 'DISQUALIFIED');
    }

    public function test_a_participant_cannot_be_reached_through_another_raffle(): void
    {
        $participant = Participant::factory()->forRaffle($this->raffle)->ticket('000001')->create();
        $other = Raffle::factory()->create();

        $this->actingAs($this->admin())
            ->getJson("/api/raffles/{$other->id}/participants/{$participant->id}")
            ->assertNotFound();
    }

    public function test_an_admin_can_delete_a_participant(): void
    {
        $participant = Participant::factory()->forRaffle($this->raffle)->create();

        $this->actingAs($this->admin())
            ->deleteJson($this->url("/{$participant->id}"))
            ->assertOk();

        $this->assertDatabaseMissing('participants', ['id' => $participant->id]);
    }

    public function test_a_participant_who_has_won_cannot_be_deleted(): void
    {
        $raffle = $this->raffleWithPool(3);
        $outcome = app(RaffleDrawService::class)->draw($raffle, $this->admin());

        $this->actingAs($this->admin())
            ->deleteJson("/api/raffles/{$raffle->id}/participants/{$outcome->winner->participant_id}")
            ->assertStatus(409);

        $this->assertDatabaseHas('participants', ['id' => $outcome->winner->participant_id]);
    }

    public function test_the_whole_list_can_be_cleared_before_any_draw(): void
    {
        $this->participants($this->raffle, 6);

        $this->actingAs($this->admin())
            ->deleteJson($this->url())
            ->assertOk()
            ->assertJsonPath('data.deleted', 6);

        $this->assertSame(0, $this->raffle->participants()->count());
    }

    public function test_the_list_cannot_be_cleared_once_a_winner_has_been_drawn(): void
    {
        $raffle = $this->raffleWithPool(3);
        app(RaffleDrawService::class)->draw($raffle, $this->admin());

        $this->actingAs($this->admin())
            ->deleteJson("/api/raffles/{$raffle->id}/participants")
            ->assertStatus(409);

        $this->assertSame(3, $raffle->participants()->count());
    }

    public function test_participants_can_be_exported_as_csv(): void
    {
        $this->participants($this->raffle, 3);

        $response = $this->actingAs($this->admin())->get($this->url('/export'));

        $response->assertOk()->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $body = $response->streamedContent();

        $this->assertStringContainsString('ticket_number,name,email,phone,tag,developers,status', $body);
        // Tab-prefixed so spreadsheet software keeps the leading zeros.
        $this->assertStringContainsString('000001', $body);
    }

    public function test_a_visitor_lists_participants_as_the_administrator(): void
    {
        $this->admin();
        $this->participants($this->raffle, 3);

        $this->getJson($this->url())->assertOk()->assertJsonPath('meta.total', 3);
    }

    public function test_a_non_admin_cannot_list_participants(): void
    {
        $this->actingAs($this->nonAdmin())->getJson($this->url())->assertForbidden();
    }
}
