<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/** A photo per prize, shown on the screens beside the prize's name. */
class PrizeImageTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    public function test_a_prize_photo_is_saved_shown_to_the_screens_and_removed(): void
    {
        Storage::fake('public');
        $raffle = $this->raffleWithPool(3, ['winners_count' => 1, 'prize_name' => 'Brand New Car', 'prize_type' => 'item']);
        $this->actingAs($this->admin());

        $this->postJson("/api/raffles/{$raffle->id}/prize-images", [
            'prize_name' => 'Brand New Car',
            'image' => UploadedFile::fake()->image('car.jpg', 1200, 800),
        ])->assertOk();

        $path = $raffle->refresh()->prize_images['Brand New Car'];
        Storage::disk('public')->assertExists($path);

        $this->getJson("/api/raffles/{$raffle->id}/display")->assertJsonPath('data.prize_images.Brand New Car', '/storage/'.$path);
        $this->getJson("/api/raffles/{$raffle->id}")->assertJsonPath('data.prize_images.Brand New Car', '/storage/'.$path);

        // Replaced: the old file goes.
        $this->postJson("/api/raffles/{$raffle->id}/prize-images", [
            'prize_name' => 'Brand New Car',
            'image' => UploadedFile::fake()->image('car2.png', 800, 600),
        ])->assertOk();
        Storage::disk('public')->assertMissing($path);

        $this->postJson("/api/raffles/{$raffle->id}/prize-images", ['prize_name' => 'Car', 'image' => UploadedFile::fake()->create('notes.pdf', 10)])->assertUnprocessable();

        $this->deleteJson("/api/raffles/{$raffle->id}/prize-images", ['prize_name' => 'Brand New Car'])->assertOk();
        $this->assertNull($raffle->refresh()->prize_images);
        $this->assertSame(0, count(Storage::disk('public')->allFiles()));
    }
}
