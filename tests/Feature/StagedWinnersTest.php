<?php

namespace Tests\Feature;

use App\Enums\DrawResult;
use App\Enums\RaffleStatus;
use App\Models\DrawEvent;
use App\Models\Raffle;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/** Winners chosen before the event, revealed in order with their prizes. */
class StagedWinnersTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected function stage(Raffle $raffle, array $winners)
    {
        return $this->actingAs($this->admin())->putJson("/api/raffles/{$raffle->id}/staged-winners", ['winners' => $winners]);
    }

    /** A raffle with three pre-selected winners: picks the 5th, 2nd and 8th participants. */
    protected function stagedRaffle(): array
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 1]);
        $people = $raffle->participants()->orderBy('id')->get();
        $picked = [$people[4], $people[1], $people[7]];

        $this->stage($raffle, [
            ['participant_id' => $picked[0]->id, 'prize_name' => 'Gift Card'],
            ['participant_id' => $picked[1]->id, 'prize_name' => 'Phone'],
            ['participant_id' => $picked[2]->id, 'prize_name' => 'Brand New Car'],
        ])->assertOk();

        return [$raffle->refresh(), $picked];
    }

    public function test_draws_reveal_the_listed_winners_in_order_with_their_prizes(): void
    {
        [$raffle, $picked] = $this->stagedRaffle();
        $this->assertSame(3, $raffle->winners_count);

        $draws = app(RaffleDrawService::class);
        $outcomes = [];
        for ($i = 0; $i < 3; $i++) {
            $outcomes[] = $draws->draw($raffle->refresh());
        }

        $this->assertSame(array_map(fn ($p) => $p->id, $picked), array_map(fn ($o) => $o->winner->participant_id, $outcomes));
        $this->assertSame(['Gift Card', 'Phone', 'Brand New Car'], array_map(fn ($o) => $o->winner->prize_name, $outcomes));
        $this->assertSame(RaffleStatus::Completed, $raffle->refresh()->status);

        // The audit log says the winners came from the list.
        $this->assertStringContainsString('pre-selected', DrawEvent::query()->where('result', DrawResult::Success)->first()->message);
    }

    public function test_draw_all_reveals_one_prize_at_a_time(): void
    {
        $raffle = $this->raffleWithPool(10, ['winners_count' => 1]);
        $people = $raffle->participants()->orderBy('id')->get();

        $this->stage($raffle, [
            ['participant_id' => $people[0]->id, 'prize_name' => 'Phone'],
            ['participant_id' => $people[1]->id, 'prize_name' => 'Phone'],
            ['participant_id' => $people[2]->id, 'prize_name' => 'Phone'],
            ['participant_id' => $people[3]->id, 'prize_name' => 'Car'],
        ])->assertOk();

        $draws = app(RaffleDrawService::class);

        $phones = $draws->drawAll($raffle->refresh());
        $this->assertSame(['Phone', 'Phone', 'Phone'], array_map(fn ($o) => $o->winner->prize_name, $phones));

        $car = $draws->drawAll($raffle->refresh());
        $this->assertCount(1, $car);
        $this->assertSame($people[3]->id, $car[0]->winner->participant_id);
        $this->assertTrue($car[0]->raffleCompleted);
    }

    public function test_the_screens_get_the_prizes_but_not_who_is_listed(): void
    {
        [$raffle, $picked] = $this->stagedRaffle();
        app(RaffleDrawService::class)->draw($raffle);

        $data = $this->getJson("/api/raffles/{$raffle->id}/display")->assertOk()->json('data');

        $this->assertSame(['Gift Card', 'Phone', 'Brand New Car'], $data['staged_prizes']);
        $this->assertSame('Gift Card', $data['winners'][0]['prize_name']);
        $this->assertArrayNotHasKey('staged_winners', $data);
        $this->assertStringNotContainsString((string) $picked[2]->ticket_number, json_encode($data['winners']));
    }

    public function test_revealed_winners_cannot_be_changed(): void
    {
        [$raffle, $picked] = $this->stagedRaffle();
        app(RaffleDrawService::class)->draw($raffle);

        $this->stage($raffle, [
            ['participant_id' => $picked[1]->id, 'prize_name' => 'Phone'],
        ])->assertStatus(422);
    }

    public function test_listed_winners_must_be_in_the_raffle(): void
    {
        $raffle = $this->raffleWithPool(3);
        $other = $this->raffleWithPool(3);

        $this->stage($raffle, [
            ['participant_id' => $other->participants()->first()->id, 'prize_name' => 'Phone'],
        ])->assertStatus(422);
    }

    public function test_clearing_the_list_returns_to_a_random_draw(): void
    {
        [$raffle] = $this->stagedRaffle();

        $this->stage($raffle, [])->assertOk();

        $this->assertFalse($raffle->refresh()->hasStagedWinners());
    }

    public function test_pre_selected_winners_are_never_drawn_in_another_raffle(): void
    {
        // The same people (tickets 000001–000004) in two raffles.
        $staged = $this->raffleWithPool(4, ['winners_count' => 1]);
        $other = $this->raffleWithPool(4, ['winners_count' => 2]);
        $people = $staged->participants()->orderBy('ticket_number')->get();

        $this->stage($staged, [
            ['participant_id' => $people[0]->id, 'prize_name' => 'Car'],
            ['participant_id' => $people[1]->id, 'prize_name' => 'Phone'],
        ])->assertOk();

        $draws = app(RaffleDrawService::class);
        $this->assertSame(2, $draws->eligibleTicketCount($other));

        $tickets = array_map(fn ($o) => $o->winner->ticket_number, $draws->drawAll($other));
        sort($tickets);
        $this->assertSame(['000003', '000004'], $tickets);
    }

    public function test_someone_cannot_be_pre_selected_in_two_raffles(): void
    {
        $first = $this->raffleWithPool(3);
        $second = $this->raffleWithPool(3);

        $this->stage($first, [
            ['participant_id' => $first->participants()->where('ticket_number', '000001')->value('id'), 'prize_name' => 'Car'],
        ])->assertOk();

        $this->stage($second, [
            ['participant_id' => $second->participants()->where('ticket_number', '000001')->value('id'), 'prize_name' => 'Phone'],
        ])->assertStatus(422)->assertJsonFragment(['message' => $second->participants()->where('ticket_number', '000001')->value('name').' already won in another draw.']);
    }

    public function test_someone_drawn_in_another_raffle_cannot_be_pre_selected(): void
    {
        $main = $this->raffleWithPool(1, ['winners_count' => 1]);
        $predraw = $this->raffleWithPool(1);
        app(RaffleDrawService::class)->draw($main);

        $this->stage($predraw, [
            ['participant_id' => $predraw->participants()->first()->id, 'prize_name' => 'Phone'],
        ])->assertStatus(422);

        $this->getJson("/api/raffles/{$predraw->id}/staged-winners")
            ->assertOk()
            ->assertJsonPath('won_elsewhere.000001', $main->name);
    }
}
