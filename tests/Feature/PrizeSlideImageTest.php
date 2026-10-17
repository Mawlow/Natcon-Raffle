<?php

namespace Tests\Feature;

use App\Models\PrizeSlide;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/** A photo of the prize on the Prize Display's slides. */
class PrizeSlideImageTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    public function test_a_slide_photo_is_saved_shown_replaced_and_removed(): void
    {
        Storage::fake('public');
        $this->actingAs($this->admin());
        $id = $this->postJson('/api/prize-slides', ['prize_name' => 'Brand New Car', 'prize_type' => 'item'])->assertCreated()->json('data.id');

        $this->postJson("/api/prize-slides/{$id}/image", ['image' => UploadedFile::fake()->image('car.jpg', 1200, 800)])->assertOk();
        $path = PrizeSlide::find($id)->image;
        Storage::disk('public')->assertExists($path);

        $this->postJson("/api/prize-slides/{$id}/live")->assertOk();
        $this->getJson('/api/prize-show')->assertJsonPath('data.image', '/storage/'.$path);

        $this->postJson("/api/prize-slides/{$id}/image", ['image' => UploadedFile::fake()->image('car2.png')])->assertOk();
        Storage::disk('public')->assertMissing($path);
        $this->postJson("/api/prize-slides/{$id}/image", ['image' => UploadedFile::fake()->create('notes.pdf', 10)])->assertUnprocessable();

        $this->deleteJson("/api/prize-slides/{$id}/image")->assertOk()->assertJsonPath('data.image', null);
        $this->assertNull(PrizeSlide::find($id)->image);
        $this->assertCount(0, Storage::disk('public')->allFiles());

        // Deleting a slide takes its photo with it.
        $this->postJson("/api/prize-slides/{$id}/image", ['image' => UploadedFile::fake()->image('car3.jpg')])->assertOk();
        $this->deleteJson("/api/prize-slides/{$id}")->assertOk();
        $this->assertCount(0, Storage::disk('public')->allFiles());
    }

    public function test_a_slide_can_have_a_logo_in_each_top_corner(): void
    {
        $this->actingAs($this->admin());
        $ids = array_slice(\App\Support\RaffleLogos::ids(), 0, 2);

        $id = $this->postJson('/api/prize-slides', ['prize_name' => 'Car', 'prize_type' => 'item', 'logo_left' => $ids[0], 'logo_right' => $ids[1]])
            ->assertCreated()
            ->assertJsonPath('data.logo_left.id', $ids[0])
            ->assertJsonPath('data.logo_right.id', $ids[1])
            ->json('data.id');

        $this->postJson("/api/prize-slides/{$id}/live")->assertOk();
        $this->getJson('/api/prize-show')->assertJsonPath('data.logo_right.id', $ids[1]);

        $this->putJson("/api/prize-slides/{$id}", ['prize_name' => 'Car', 'prize_type' => 'item', 'logo_left' => null])->assertOk()->assertJsonPath('data.logo_left', null);
        $this->postJson('/api/prize-slides', ['prize_name' => 'Car', 'prize_type' => 'item', 'logo_left' => 'nope/none'])->assertUnprocessable();
    }
}
