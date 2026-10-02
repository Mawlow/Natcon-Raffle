<?php

namespace Tests\Feature;

use App\Models\Raffle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

class ErrorHandlingTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    public function test_errors_return_a_consistent_json_envelope(): void
    {
        $this->getJson('/api/raffles/9999/display')
            ->assertNotFound()
            ->assertJsonStructure(['message']);
    }

    public function test_stack_traces_are_not_exposed_when_debug_is_off(): void
    {
        config(['app.debug' => false]);

        $response = $this->actingAs($this->admin())
            ->postJson('/api/raffles/1/draw');

        $response->assertNotFound();

        $this->assertArrayNotHasKey('trace', $response->json());
        $this->assertArrayNotHasKey('file', $response->json());
        $this->assertArrayNotHasKey('exception', $response->json());
    }

    public function test_validation_errors_use_the_standard_errors_key(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/raffles', [])
            ->assertStatus(422)
            ->assertJsonStructure(['message', 'errors']);
    }

    public function test_an_api_call_with_no_admin_account_gets_a_friendly_message(): void
    {
        // Nothing for AutoLoginAdmin to adopt, so the guard rejects the request.
        $this->getJson('/api/dashboard')
            ->assertUnauthorized()
            ->assertJson(['message' => 'Please sign in to continue.']);
    }

    public function test_a_forbidden_api_call_gets_a_friendly_message(): void
    {
        $raffle = Raffle::factory()->create();

        $this->actingAs($this->nonAdmin())
            ->getJson("/api/raffles/{$raffle->id}")
            ->assertForbidden()
            ->assertJson(['message' => 'You are not allowed to perform this action.']);
    }
}
