<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/**
 * This build has no sign-in screen: AutoLoginAdmin adopts the administrator
 * account for every API request.
 */
class AutoLoginTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    public function test_a_visitor_is_signed_in_as_the_administrator(): void
    {
        $admin = $this->admin(['name' => 'Raffle Administrator']);

        $this->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('data.email', $admin->email)
            ->assertJsonPath('data.role', 'admin');

        $this->assertAuthenticatedAs($admin);
    }

    public function test_admin_endpoints_are_reachable_without_signing_in(): void
    {
        $this->admin();

        foreach (['/api/dashboard', '/api/raffles', '/api/winners', '/api/draw-events'] as $endpoint) {
            $this->getJson($endpoint)->assertOk();
        }
    }

    public function test_the_first_active_admin_is_adopted_not_a_viewer(): void
    {
        User::factory()->create(['role' => 'viewer', 'is_active' => true]);
        $admin = $this->admin();

        $this->getJson('/api/me')->assertOk()->assertJsonPath('data.email', $admin->email);
    }

    public function test_a_deactivated_admin_is_never_adopted(): void
    {
        $this->admin(['is_active' => false]);

        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_requests_are_refused_when_no_administrator_account_exists(): void
    {
        $this->getJson('/api/dashboard')
            ->assertUnauthorized()
            ->assertJson(['message' => 'Please sign in to continue.']);
    }

    public function test_an_already_authenticated_user_is_left_alone(): void
    {
        $this->admin();
        $viewer = $this->nonAdmin();

        // The viewer keeps their own identity and is still stopped by the policies.
        $this->actingAs($viewer)->getJson('/api/raffles')->assertForbidden();
        $this->assertAuthenticatedAs($viewer);
    }

    public function test_the_spa_shell_is_served_for_app_routes(): void
    {
        $this->get('/dashboard')->assertOk()->assertSee('id="app"', false);
        $this->get('/raffle/1/display')->assertOk()->assertSee('id="app"', false);
    }

    public function test_the_login_endpoints_are_gone(): void
    {
        $this->postJson('/api/login', ['email' => 'admin@raffle.test', 'password' => 'password'])
            ->assertNotFound();

        $this->postJson('/api/logout')->assertNotFound();
    }
}
