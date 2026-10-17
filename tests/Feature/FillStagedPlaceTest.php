<?php

namespace Tests\Feature;

use App\Models\Raffle;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/**
 * A pre-draw's winner taken off (absent): the open place is filled at
 * random from one developer, following the day's rules, and the next draw
 * reveals the replacement.
 */
class FillStagedPlaceTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    public function test_an_open_place_on_a_pre_draw_is_filled_at_random_from_a_developer(): void
    {
        $this->actingAs($this->admin());
        $fileId = $this->postJson('/api/raffle-files', ['name' => 'NATCON'])->json('data.id');
        $csv = UploadedFile::fake()->createWithContent('people.csv', "ticket_number,name,developers\n001,A,Alpha\n002,B,Alpha\n003,C,Alpha\n004,D,Beta\n005,E,Beta\n");
        $this->postJson("/api/raffle-files/{$fileId}/participants", ['file' => $csv])->assertCreated();

        // A pre-draw listing A, B and C; A and B revealed on stage; C is absent and taken off.
        $predraw = Raffle::find($this->postJson("/api/raffle-files/{$fileId}/predraws", ['name' => 'Alpha pre-draw', 'draw_day' => 1])->json('data.id'));
        $id = fn (string $ticket) => $predraw->participants()->where('ticket_number', $ticket)->value('id');
        $this->putJson("/api/raffles/{$predraw->id}/staged-winners", ['winners' => [
            ['participant_id' => $id('001'), 'prize_name' => 'Phone'],
            ['participant_id' => $id('002'), 'prize_name' => 'Phone'],
            ['participant_id' => $id('003'), 'prize_name' => 'Phone'],
        ]])->assertOk();
        $draws = app(RaffleDrawService::class);
        $draws->draw($predraw->refresh());
        $draws->draw($predraw->refresh());
        $draws->draw($predraw->refresh());
        $this->deleteJson("/api/raffles/{$predraw->id}/winners/3")->assertOk();
        $this->assertSame(2, (int) $predraw->refresh()->winners_count);

        // Alpha has nobody left (A and B won, C was taken off and is back in but... C is Alpha and free again).
        // Beta: D or E, picked at random, goes on the list as #3.
        $picked = $this->postJson("/api/raffles/{$predraw->id}/staged-winners/fill", ['developer' => 'Beta', 'prize_name' => 'Phone'])
            ->assertOk()->json('data');
        $this->assertContains($picked['ticket_number'], ['004', '005']);
        $this->assertSame(3, $picked['position']);
        $this->assertSame(3, (int) $predraw->refresh()->winners_count);
        $this->assertSame('LIVE', $predraw->status->value);

        // The next draw reveals the replacement on the wall.
        $this->assertSame($picked['ticket_number'], $draws->draw($predraw->refresh())->winner->ticket_number);
        $this->assertSame('COMPLETED', $predraw->refresh()->status->value);

        // A developer with nobody left to win is refused.
        $this->deleteJson("/api/raffles/{$predraw->id}/winners/3")->assertOk();
        $this->putJson("/api/raffles/{$predraw->id}/staged-winners", ['winners' => [
            ['participant_id' => $id('001'), 'prize_name' => 'Phone'],
            ['participant_id' => $id('002'), 'prize_name' => 'Phone'],
            ['participant_id' => $id('004'), 'prize_name' => 'Phone'],
            ['participant_id' => $id('005'), 'prize_name' => 'Phone'],
        ]])->assertOk();
        $this->postJson("/api/raffles/{$predraw->id}/staged-winners/fill", ['developer' => 'Alpha', 'prize_name' => 'Phone'])
            ->assertOk()->assertJsonPath('data.ticket_number', '003');
        $this->postJson("/api/raffles/{$predraw->id}/staged-winners/fill", ['developer' => 'Alpha', 'prize_name' => 'Phone'])
            ->assertStatus(422);
    }

    public function test_a_winner_taken_off_a_completed_raffle_is_replaced_at_once_from_a_developer(): void
    {
        $this->actingAs($this->admin());
        $fileId = $this->postJson('/api/raffle-files', ['name' => 'NATCON'])->json('data.id');
        $csv = UploadedFile::fake()->createWithContent('people.csv', "ticket_number,name,developers\n001,A,Alpha\n002,B,Alpha\n003,C,Beta\n004,D,Beta\n005,E,Beta\n");
        $this->postJson("/api/raffle-files/{$fileId}/participants", ['file' => $csv])->assertCreated();
        $draws = app(RaffleDrawService::class);

        // A completed random raffle: #2 is absent, taken off, and replaced from Beta right away.
        $raffle = Raffle::find($this->postJson('/api/raffles', ['name' => 'Random draw', 'raffle_file_id' => $fileId, 'ready' => true, 'draw_day' => 1, 'prizes' => [['winners_count' => 2, 'prize_name' => 'Phone']]])->assertCreated()->json('data.id'));
        $draws->draw($raffle);
        $gone = $draws->draw($raffle->refresh())->winner->ticket_number;
        $this->assertSame('COMPLETED', $raffle->refresh()->status->value);
        $this->deleteJson("/api/raffles/{$raffle->id}/winners/2")->assertOk();
        $picked = $this->postJson("/api/raffles/{$raffle->id}/winners/replace", ['developer' => 'Beta', 'exclude_ticket' => $gone])->assertOk()->json('data');
        $this->assertContains($picked['ticket_number'], ['003', '004', '005']);
        $this->assertNotSame($gone, $picked['ticket_number']);
        $this->assertSame(2, $picked['position']);
        $this->assertSame('COMPLETED', $raffle->refresh()->status->value);
        $this->assertSame(2, $raffle->winners()->count());
        $this->assertSame('Phone', $raffle->winners()->where('position', 2)->first()->prize?->prize_name);
        // Every place taken: another replacement is refused until a winner is taken off.
        $this->postJson("/api/raffles/{$raffle->id}/winners/replace", ['developer' => 'Beta'])->assertStatus(422);

        // The same on a completed pre-draw: the replacement joins the list too.
        $predraw = Raffle::find($this->postJson("/api/raffle-files/{$fileId}/predraws", ['name' => 'Pre-draw', 'draw_day' => 2])->json('data.id'));
        $id = fn (string $ticket) => $predraw->participants()->where('ticket_number', $ticket)->value('id');
        $free = array_values(array_diff(['001', '002', '003', '004', '005'], $raffle->winners()->pluck('ticket_number')->all()));
        $this->putJson("/api/raffles/{$predraw->id}/staged-winners", ['winners' => [['participant_id' => $id($free[0]), 'prize_name' => 'Bag']]])->assertOk();
        $draws->draw($predraw->refresh());
        $this->assertSame('COMPLETED', $predraw->refresh()->status->value);
        $this->deleteJson("/api/raffles/{$predraw->id}/winners/1")->assertOk();
        $picked = $this->postJson("/api/raffles/{$predraw->id}/winners/replace", ['developer' => null, 'prize_name' => 'Bag', 'exclude_ticket' => $free[0]])->assertOk()->json('data');
        $this->assertNotSame($free[0], $picked['ticket_number']);
        $this->assertSame('COMPLETED', $predraw->refresh()->status->value);
        $this->assertSame([$id($picked['ticket_number'])], array_column($predraw->stagedWinners(), 'participant_id'));
        $this->assertSame('Bag', $predraw->winners()->first()->prize_name);
    }

    public function test_a_random_raffles_next_draw_can_be_told_which_developer_to_pick_from(): void
    {
        $this->actingAs($this->admin());
        $fileId = $this->postJson('/api/raffle-files', ['name' => 'NATCON'])->json('data.id');
        $csv = UploadedFile::fake()->createWithContent('people.csv', "ticket_number,name,developers\n001,A,Alpha\n002,B,Alpha\n003,C,Beta\n004,D,Beta\n005,E,Beta\n");
        $this->postJson("/api/raffle-files/{$fileId}/participants", ['file' => $csv])->assertCreated();
        $raffle = Raffle::find($this->postJson('/api/raffles', ['name' => 'Random draw', 'raffle_file_id' => $fileId, 'ready' => true, 'draw_day' => 1, 'prizes' => [['winners_count' => 2, 'prize_name' => 'Phone']]])->assertCreated()->json('data.id'));
        $draws = app(RaffleDrawService::class);

        // Two winners drawn (three Betas, so Beta always has someone left); #2 is absent and taken off.
        $draws->draw($raffle);
        $draws->draw($raffle->refresh());
        $this->deleteJson("/api/raffles/{$raffle->id}/winners/2")->assertOk();

        // The next draw is told to pick from Beta only, and does; then the choice clears itself.
        $this->putJson("/api/raffles/{$raffle->id}/next-draw-pool", ['developer' => 'Beta'])->assertOk();
        $this->assertSame('developer Beta', $this->getJson("/api/raffles/{$raffle->id}")->json('data.next_draw_pool_label'));
        $replacement = $draws->draw($raffle->refresh())->winner->ticket_number;
        $this->assertContains($replacement, ['003', '004', '005']);
        $this->assertNull($raffle->refresh()->next_draw_pool);
        $this->assertSame('COMPLETED', $raffle->status->value);
    }

    public function test_a_kept_raffle_with_one_winner_can_fill_its_place_after_the_winner_is_taken_off(): void
    {
        $this->actingAs($this->admin());
        $fileId = $this->postJson('/api/raffle-files', ['name' => 'NATCON'])->json('data.id');
        $csv = UploadedFile::fake()->createWithContent('people.csv', "ticket_number,name,developers\n001,A,Alpha\n002,B,Beta\n003,C,Beta\n");
        $this->postJson("/api/raffle-files/{$fileId}/participants", ['file' => $csv])->assertCreated();

        // A one-winner raffle drawn and kept as a pre-draw to replay; its winner is absent.
        $raffle = Raffle::find($this->postJson('/api/raffles', ['name' => 'Kept draw', 'raffle_file_id' => $fileId, 'ready' => true, 'draw_day' => 1, 'prizes' => [['winners_count' => 1, 'prize_name' => 'Phone']]])->assertCreated()->json('data.id'));
        $draws = app(RaffleDrawService::class);
        $won = $draws->draw($raffle)->winner->ticket_number;
        $this->postJson('/api/predraws/keep', ['raffle_ids' => [$raffle->id]])->assertOk();
        $this->postJson("/api/raffles/{$raffle->id}/unlock", ['pin' => config('raffle.owner_pin')])->assertOk();
        $this->deleteJson("/api/raffles/{$raffle->id}/winners/1")->assertOk();
        $this->assertSame(0, $raffle->refresh()->winners()->count());

        // The absent winner is not picked again for their own place.
        $picked = $this->postJson("/api/raffles/{$raffle->id}/staged-winners/fill", ['developer' => 'Beta', 'prize_name' => 'Phone', 'exclude_ticket' => $won])->assertOk()->json('data');
        $this->assertContains($picked['ticket_number'], ['002', '003']);
        $this->assertNotSame($won, $picked['ticket_number']);
        $this->assertSame($picked['ticket_number'], $draws->draw($raffle->refresh())->winner->ticket_number);
        $this->assertSame('COMPLETED', $raffle->refresh()->status->value);
    }
}
