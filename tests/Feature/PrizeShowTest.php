<?php

namespace Tests\Feature;

use App\Models\PrizeSlide;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

class PrizeShowTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected function payload(array $overrides = []): array
    {
        return array_merge([
            'title' => 'Manual Raffle · Grand Prize',
            'prize_name' => 'Brand New Car',
            'prize_type' => 'item',
            'prize_value' => 1200000,
            'prize_currency' => 'PHP',
            'logos' => ['rent-ph/rentph-new-white-logo'],
        ], $overrides);
    }

    public function test_the_screen_is_on_standby_until_a_prize_goes_live(): void
    {
        $this->getJson('/api/prize-show')->assertOk()->assertJsonPath('data', null);
    }

    public function test_a_prize_can_be_saved_and_put_on_the_screen(): void
    {
        $id = $this->actingAs($this->admin())
            ->postJson('/api/prize-slides', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.logos.0.id', 'rent-ph/rentph-new-white-logo')
            ->json('data.id');

        $this->actingAs($this->admin())->postJson("/api/prize-slides/{$id}/live")->assertOk();

        $this->getJson('/api/prize-show')
            ->assertOk()
            ->assertJsonPath('data.prize_name', 'Brand New Car')
            ->assertJsonPath('data.title', 'Manual Raffle · Grand Prize');
    }

    public function test_only_one_prize_is_live_at_a_time(): void
    {
        $first = PrizeSlide::create(['prize_name' => 'First', 'prize_type' => 'cash', 'is_live' => true]);
        $second = PrizeSlide::create(['prize_name' => 'Second', 'prize_type' => 'cash']);

        $this->actingAs($this->admin())->postJson("/api/prize-slides/{$second->id}/live")->assertOk();

        $this->assertFalse($first->refresh()->is_live);
        $this->assertTrue($second->refresh()->is_live);
        $this->getJson('/api/prize-show')->assertJsonPath('data.prize_name', 'Second');
    }

    public function test_the_screen_can_be_blanked(): void
    {
        PrizeSlide::create(['prize_name' => 'Live', 'prize_type' => 'cash', 'is_live' => true]);

        $this->actingAs($this->admin())->postJson('/api/prize-slides/clear-live')->assertOk();

        $this->getJson('/api/prize-show')->assertJsonPath('data', null);
    }

    public function test_a_prize_can_be_edited_and_deleted(): void
    {
        $slide = PrizeSlide::create(['prize_name' => 'Old', 'prize_type' => 'cash']);

        $this->actingAs($this->admin())
            ->putJson("/api/prize-slides/{$slide->id}", $this->payload(['prize_name' => 'New', 'prize_type' => 'cash']))
            ->assertOk()
            ->assertJsonPath('data.prize_name', 'New');

        $this->actingAs($this->admin())->deleteJson("/api/prize-slides/{$slide->id}")->assertOk();
        $this->assertDatabaseMissing('prize_slides', ['id' => $slide->id]);
    }

    public function test_a_logo_outside_the_catalogue_is_rejected(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/prize-slides', $this->payload(['logos' => ['../../secret.png']]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('logos.0');
    }
}
