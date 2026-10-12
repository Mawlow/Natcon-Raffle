<?php

namespace Tests\Feature;

use App\Enums\RaffleStatus;
use App\Models\Participant;
use App\Models\Raffle;
use App\Models\RaffleSetting;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

class RaffleManagementTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Grand Anniversary Raffle 2026',
            'description' => 'The headline draw.',
            'prize_name' => 'Cash Prize',
            'prize_value' => 50000,
            'prize_currency' => 'PHP',
            'winners_count' => 3,
            'participant_pool' => 'Anniversary Participants 2026',
        ], $overrides);
    }

    public function test_an_admin_can_create_a_raffle(): void
    {
        $response = $this->actingAs($this->admin())
            ->postJson('/api/raffles', $this->payload());

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Grand Anniversary Raffle 2026')
            ->assertJsonPath('data.winners_count', 3)
            ->assertJsonPath('data.status', 'DRAFT')
            ->assertJsonPath('data.allow_repeat_winners', false);

        $this->assertDatabaseHas('raffles', ['slug' => 'grand-anniversary-raffle-2026']);
        $this->assertDatabaseHas('raffle_settings', ['raffle_id' => $response->json('data.id')]);
    }

    public function test_repeat_winners_are_disabled_by_default(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/raffles', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.allow_repeat_winners', false);
    }

    public function test_creating_a_raffle_requires_a_name(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/raffles', ['winners_count' => 0])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'winners_count'])
            ->assertJsonMissingValidationErrors(['prize_name']);
    }

    /** The prize and the number of winners are set afterwards, in the Control Center. */
    public function test_a_raffle_can_be_created_without_a_prize_or_winners(): void
    {
        $id = $this->actingAs($this->admin())
            ->postJson('/api/raffles', ['name' => 'Raffle 2'])
            ->assertCreated()
            ->assertJsonPath('data.prize_name', null)
            ->assertJsonPath('data.winners_count', 1)
            ->json('data.id');

        $raffle = \App\Models\Raffle::findOrFail($id);
        $this->participants($raffle, 3);

        $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$id}/transition", ['action' => 'ready'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Set the number of winners and the prize first.');

        $this->actingAs($this->admin())
            ->putJson("/api/raffles/{$id}", ['winners_count' => 2, 'prize_name' => 'Cash', 'prize_type' => 'cash', 'prize_value' => 1000])
            ->assertOk();

        $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$id}/transition", ['action' => 'ready'])
            ->assertOk()
            ->assertJsonPath('data.status', 'READY');
    }

    public function test_a_visitor_creates_a_raffle_as_the_administrator(): void
    {
        $admin = $this->admin();

        $response = $this->postJson('/api/raffles', $this->payload())->assertCreated();

        $this->assertDatabaseHas('raffles', ['id' => $response->json('data.id'), 'created_by' => $admin->id]);
    }

    public function test_a_non_admin_cannot_create_a_raffle(): void
    {
        $this->actingAs($this->nonAdmin())
            ->postJson('/api/raffles', $this->payload())
            ->assertForbidden();
    }

    public function test_duplicate_raffle_names_receive_distinct_slugs(): void
    {
        $admin = $this->admin();

        $first = $this->actingAs($admin)->postJson('/api/raffles', $this->payload())->json('data.slug');
        $second = $this->actingAs($admin)->postJson('/api/raffles', $this->payload())->json('data.slug');

        $this->assertNotSame($first, $second);
    }

    public function test_a_raffle_with_imported_participants_can_be_made_ready(): void
    {
        $raffle = Raffle::factory()->create();
        RaffleSetting::create(['raffle_id' => $raffle->id]);
        $this->participants($raffle, 15);

        $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/transition", ['action' => 'ready'])
            ->assertOk()
            ->assertJsonPath('data.status', 'READY')
            ->assertJsonPath('data.participants_count', 15);
    }

    public function test_two_raffles_may_use_the_same_ticket_numbers(): void
    {
        $first = Raffle::factory()->create();
        $second = Raffle::factory()->create();

        $this->participants($first, 5);
        $this->participants($second, 5);

        $this->assertSame(5, $first->participants()->count());
        $this->assertSame(5, $second->participants()->count());
        $this->assertDatabaseCount('participants', 10);
    }

    public function test_a_raffle_without_participants_cannot_be_made_ready(): void
    {
        $raffle = Raffle::factory()->create();

        $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/transition", ['action' => 'ready'])
            ->assertStatus(422);

        $this->assertSame(RaffleStatus::Draft, $raffle->refresh()->status);
    }

    public function test_a_raffle_can_be_paused_and_resumed(): void
    {
        $raffle = $this->raffleWithPool(10);
        $admin = $this->admin();

        $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/transition", ['action' => 'start'])
            ->assertOk()->assertJsonPath('data.status', 'LIVE');

        $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/transition", ['action' => 'pause'])
            ->assertOk()->assertJsonPath('data.status', 'READY');
    }

    public function test_the_winner_count_cannot_drop_below_the_winners_already_drawn(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 3]);
        $admin = $this->admin();

        app(RaffleDrawService::class)->draw($raffle, $admin);
        app(RaffleDrawService::class)->draw($raffle->refresh(), $admin);

        $this->actingAs($admin)
            ->putJson("/api/raffles/{$raffle->id}", ['winners_count' => 1])
            ->assertStatus(422);

        $this->assertSame(3, $raffle->refresh()->winners_count);
    }

    public function test_a_draft_raffle_with_no_winners_can_be_deleted(): void
    {
        $raffle = Raffle::factory()->create();

        $this->actingAs($this->admin())
            ->deleteJson("/api/raffles/{$raffle->id}")
            ->assertOk();

        $this->assertDatabaseMissing('raffles', ['id' => $raffle->id]);
    }

    public function test_a_drawn_raffle_is_deleted_together_with_everything_it_owns(): void
    {
        $raffle = $this->raffleWithPool(5);
        app(RaffleDrawService::class)->draw($raffle, $this->admin());

        $this->actingAs($this->admin())
            ->deleteJson("/api/raffles/{$raffle->id}")
            ->assertOk();

        $this->assertDatabaseMissing('raffles', ['id' => $raffle->id]);
        $this->assertDatabaseMissing('participants', ['raffle_id' => $raffle->id]);
        $this->assertDatabaseMissing('winners', ['raffle_id' => $raffle->id]);
        $this->assertDatabaseMissing('draw_events', ['raffle_id' => $raffle->id]);
        $this->assertDatabaseMissing('raffle_settings', ['raffle_id' => $raffle->id]);
    }

    public function test_an_archived_raffle_can_be_deleted(): void
    {
        $raffle = $this->raffleWithPool(3);
        $raffle->forceFill(['archived_at' => now()])->save();

        $this->actingAs($this->admin())
            ->deleteJson("/api/raffles/{$raffle->id}")
            ->assertOk();

        $this->assertDatabaseMissing('raffles', ['id' => $raffle->id]);
    }

    public function test_a_non_admin_cannot_delete_a_raffle(): void
    {
        $raffle = $this->raffleWithPool(3);

        $this->actingAs($this->nonAdmin())
            ->deleteJson("/api/raffles/{$raffle->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('raffles', ['id' => $raffle->id]);
    }

    public function test_a_raffle_can_be_archived_and_restored(): void
    {
        $raffle = $this->raffleWithPool(5);
        $admin = $this->admin();

        $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/archive")
            ->assertOk()->assertJsonPath('data.is_archived', true);

        // Archived raffles drop out of the default listing.
        $this->actingAs($admin)->getJson('/api/raffles')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($admin)->getJson('/api/raffles?include_archived=1')->assertOk()->assertJsonCount(1, 'data');

        $this->actingAs($admin)->postJson("/api/raffles/{$raffle->id}/restore")
            ->assertOk()->assertJsonPath('data.is_archived', false);
    }

    public function test_an_archived_raffle_cannot_be_drawn(): void
    {
        $raffle = $this->raffleWithPool(5);
        $raffle->update(['archived_at' => now()]);

        $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/draw")
            ->assertForbidden();
    }

    public function test_a_raffle_defaults_to_drawing_winners_one_at_a_time(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/raffles', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.settings.draw_mode', 'one_by_one');
    }

    public function test_a_raffle_can_be_set_to_draw_all_winners_in_one_draw(): void
    {
        $response = $this->actingAs($this->admin())
            ->postJson('/api/raffles', $this->payload(['settings' => ['draw_mode' => 'all_at_once']]))
            ->assertCreated()
            ->assertJsonPath('data.settings.draw_mode', 'all_at_once');

        $id = $response->json('data.id');

        $this->actingAs($this->admin())
            ->putJson("/api/raffles/{$id}", ['settings' => ['draw_mode' => 'one_by_one']])
            ->assertOk()
            ->assertJsonPath('data.settings.draw_mode', 'one_by_one');
    }

    public function test_an_unknown_draw_mode_is_rejected(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/raffles', $this->payload(['settings' => ['draw_mode' => 'everything']]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('settings.draw_mode');
    }

    public function test_a_raffle_can_be_branded_with_catalogue_logos(): void
    {
        $response = $this->actingAs($this->admin())
            ->postJson('/api/raffles', $this->payload(['logos' => ['rent-ph/rentph-new-white-logo', 'developers/argus']]))
            ->assertCreated()
            ->assertJsonPath('data.logos.0.id', 'rent-ph/rentph-new-white-logo')
            ->assertJsonPath('data.logos.0.path', '/images/logos/rent-ph/rentph-new-white-logo.png')
            ->assertJsonPath('data.logos.0.tone', 'light')
            ->assertJsonPath('data.logos.1.id', 'developers/argus');

        $id = $response->json('data.id');

        $this->getJson("/api/raffles/{$id}/display")
            ->assertOk()
            ->assertJsonPath('data.logos.0.id', 'rent-ph/rentph-new-white-logo');

        $this->actingAs($this->admin())
            ->putJson("/api/raffles/{$id}", ['logos' => []])
            ->assertOk()
            ->assertJsonPath('data.logos', []);
    }

    public function test_a_raffle_can_set_corner_logos_for_the_congratulations_screen(): void
    {
        $response = $this->actingAs($this->admin())
            ->postJson('/api/raffles', $this->payload([
                'logo_left' => 'rent-ph/rentph-new-white-logo',
                'logo_right' => 'fire/fire-logo-white',
            ]))
            ->assertCreated()
            ->assertJsonPath('data.logo_left.id', 'rent-ph/rentph-new-white-logo')
            ->assertJsonPath('data.logo_right.path', '/images/logos/fire/fire-logo-white.png');

        $id = $response->json('data.id');

        $this->getJson("/api/raffles/{$id}/display")
            ->assertOk()
            ->assertJsonPath('data.logo_left.id', 'rent-ph/rentph-new-white-logo')
            ->assertJsonPath('data.logo_right.id', 'fire/fire-logo-white');

        $this->actingAs($this->admin())
            ->putJson("/api/raffles/{$id}", ['logo_right' => null])
            ->assertOk()
            ->assertJsonPath('data.logo_left.id', 'rent-ph/rentph-new-white-logo')
            ->assertJsonPath('data.logo_right', null);

        $this->actingAs($this->admin())
            ->putJson("/api/raffles/{$id}", ['logo_left' => '../../secret.png'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('logo_left');
    }

    public function test_a_logo_outside_the_catalogue_is_rejected(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/raffles', $this->payload(['logos' => ['../../secret.png']]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('logos.0');
    }

    public function test_a_raffle_without_logos_reports_none(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/raffles', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.logos', [])
            ->assertJsonPath('data.logo_left', null)
            ->assertJsonPath('data.logo_right', null);
    }

    public function test_duplicating_a_raffle_copies_settings_but_not_winners(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 2]);
        app(RaffleDrawService::class)->draw($raffle, $this->admin());

        $response = $this->actingAs($this->admin())
            ->postJson("/api/raffles/{$raffle->id}/duplicate")
            ->assertCreated();

        $copyId = $response->json('data.id');

        $this->assertNotSame($raffle->id, $copyId);
        $this->assertSame('DRAFT', $response->json('data.status'));
        $this->assertSame(2, $response->json('data.winners_count'));
        $this->assertDatabaseMissing('winners', ['raffle_id' => $copyId]);
        $this->assertDatabaseHas('raffle_settings', ['raffle_id' => $copyId]);
    }

    public function test_the_dashboard_reports_totals(): void
    {
        $raffle = $this->raffleWithPool(12, ['winners_count' => 1]);
        app(RaffleDrawService::class)->draw($raffle, $this->admin());

        $this->actingAs($this->admin())
            ->getJson('/api/dashboard')
            ->assertOk()
            ->assertJsonPath('data.totals.participants', 12)
            ->assertJsonPath('data.totals.winners', 1)
            ->assertJsonPath('data.totals.completed_raffles', 1);
    }

    public function test_the_audit_log_lists_draw_events(): void
    {
        $raffle = $this->raffleWithPool(5);
        app(RaffleDrawService::class)->draw($raffle, $this->admin());

        $this->actingAs($this->admin())
            ->getJson('/api/draw-events')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.result', 'SUCCESS');
    }

    public function test_the_audit_log_is_readable_without_signing_in(): void
    {
        $this->admin();

        $this->getJson('/api/draw-events')->assertOk();
    }
}
