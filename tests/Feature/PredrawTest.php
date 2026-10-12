<?php

namespace Tests\Feature;

use App\Enums\ParticipantStatus;
use App\Models\Raffle;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/** Pre-draws: their own draws, with winners chosen before the event. */
class PredrawTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected function createPredraw(Raffle $source, string $name = 'Grand Prize')
    {
        return $this->actingAs($this->admin())->postJson("/api/raffles/{$source->id}/predraws", ['name' => $name]);
    }

    public function test_a_pre_draw_is_its_own_raffle_with_a_copy_of_the_participants(): void
    {
        $source = $this->raffleWithPool(6, ['winners_count' => 3]);

        $id = $this->createPredraw($source)->assertCreated()->json('data.id');
        $predraw = Raffle::findOrFail($id);

        $this->assertTrue($predraw->is_predraw);
        $this->assertSame($source->id, $predraw->source_raffle_id);
        $this->assertSame(6, $predraw->participants()->count());
        // The raffle it came from is untouched.
        $this->assertSame(3, $source->refresh()->winners_count);
    }

    public function test_pre_draws_are_listed_apart_from_the_raffles(): void
    {
        $source = $this->raffleWithPool(3);
        $id = $this->createPredraw($source)->json('data.id');

        $raffles = collect($this->getJson('/api/raffles')->assertOk()->json('data'))->pluck('id');
        $this->assertTrue($raffles->contains($source->id));
        $this->assertFalse($raffles->contains($id));

        $this->assertSame([$id], collect($this->getJson('/api/predraws')->assertOk()->json('data'))->pluck('id')->all());
    }

    public function test_pre_draw_winners_are_revealed_there_and_never_win_the_main_raffle(): void
    {
        $source = $this->raffleWithPool(4, ['winners_count' => 2]);
        $predraw = Raffle::findOrFail($this->createPredraw($source)->json('data.id'));
        $people = $predraw->participants()->orderBy('ticket_number')->get();

        $this->putJson("/api/raffles/{$predraw->id}/staged-winners", ['winners' => [
            ['participant_id' => $people[0]->id, 'prize_name' => 'Car'],
            ['participant_id' => $people[1]->id, 'prize_name' => 'Car'],
        ]])->assertOk();

        $draws = app(RaffleDrawService::class);

        $revealed = array_map(fn ($o) => $o->winner->ticket_number, $draws->drawAll($predraw->refresh()));
        $this->assertSame(['000001', '000002'], $revealed);

        $main = array_map(fn ($o) => $o->winner->ticket_number, $draws->drawAll($source));
        sort($main);
        $this->assertSame(['000003', '000004'], $main);
    }

    public function test_deleting_a_pre_draw_lets_its_winners_win_again(): void
    {
        $source = $this->raffleWithPool(3);
        $predraw = Raffle::findOrFail($this->createPredraw($source)->json('data.id'));
        $this->putJson("/api/raffles/{$predraw->id}/staged-winners", ['winners' => [
            ['participant_id' => $predraw->participants()->first()->id, 'prize_name' => 'Car'],
        ]])->assertOk();

        $this->assertSame(2, app(RaffleDrawService::class)->eligibleTicketCount($source));

        $this->deleteJson("/api/predraws/{$predraw->id}")->assertOk();

        $this->assertSame(3, app(RaffleDrawService::class)->eligibleTicketCount($source));
    }

    public function test_only_a_pre_draw_can_be_deleted_here(): void
    {
        $raffle = $this->raffleWithPool(1);

        $this->actingAs($this->admin())->deleteJson("/api/predraws/{$raffle->id}")->assertNotFound();
    }

    public function test_a_pre_draw_can_have_its_own_logos(): void
    {
        $source = $this->raffleWithPool(2);
        $id = $this->createPredraw($source)->json('data.id');
        $logo = \App\Support\RaffleLogos::ids()[0];

        $this->putJson("/api/raffles/{$id}", ['logos' => [$logo], 'logo_left' => $logo])->assertOk();

        $this->assertSame([$logo], Raffle::findOrFail($id)->logos);
        $this->assertSame($logo, Raffle::findOrFail($id)->logo_left);
        // The main raffle keeps its own.
        $this->assertNotSame($logo, $source->refresh()->logo_left);
    }

    public function test_a_pre_draw_winner_shows_as_a_winner_in_every_participant_list(): void
    {
        $source = $this->raffleWithPool(3);
        $first = Raffle::findOrFail($this->createPredraw($source, 'Motor')->json('data.id'));
        $second = Raffle::findOrFail($this->createPredraw($source, 'Phone')->json('data.id'));

        $this->putJson("/api/raffles/{$first->id}/staged-winners", ['winners' => [
            ['participant_id' => $first->participants()->where('ticket_number', '000001')->value('id'), 'prize_name' => 'Motor'],
        ]])->assertOk();
        app(RaffleDrawService::class)->draw($first->refresh());

        foreach ([$source, $first, $second] as $raffle) {
            $this->assertSame(ParticipantStatus::Winner, $raffle->participants()->where('ticket_number', '000001')->first()->status);
        }

        // A pre-draw made afterwards shows them as a winner too.
        $third = Raffle::findOrFail($this->createPredraw($source, 'Car')->json('data.id'));
        $this->assertSame(ParticipantStatus::Winner, $third->participants()->where('ticket_number', '000001')->first()->status);

        // Deleting the pre-draw puts them back in play.
        $this->deleteJson("/api/predraws/{$first->id}")->assertOk();
        $this->assertSame(ParticipantStatus::Active, $source->participants()->where('ticket_number', '000001')->first()->status);
    }

    public function test_pre_draws_can_be_listed_with_the_raffles_when_asked(): void
    {
        $source = $this->raffleWithPool(1);
        $id = $this->createPredraw($source)->json('data.id');

        $ids = collect($this->getJson('/api/raffles?include_predraws=1&with_winners=1')->assertOk()->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($id));
    }

    public function test_picked_winners_show_as_winners_before_the_draw(): void
    {
        $source = $this->raffleWithPool(3);
        $predraw = Raffle::findOrFail($this->createPredraw($source)->json('data.id'));
        $pick = fn (string $ticket) => ['participant_id' => $predraw->participants()->where('ticket_number', $ticket)->value('id'), 'prize_name' => 'Car'];
        $status = fn (string $ticket) => $source->participants()->where('ticket_number', $ticket)->first()->status;

        $this->putJson("/api/raffles/{$predraw->id}/staged-winners", ['winners' => [$pick('000001'), $pick('000002')]])->assertOk();

        $this->assertSame(ParticipantStatus::Winner, $status('000001'));
        $this->assertSame(ParticipantStatus::Winner, $status('000002'));

        // Taken off the list before the draw: back in play.
        $this->putJson("/api/raffles/{$predraw->id}/staged-winners", ['winners' => [$pick('000001')]])->assertOk();

        $this->assertSame(ParticipantStatus::Winner, $status('000001'));
        $this->assertSame(ParticipantStatus::Active, $status('000002'));
    }
}
