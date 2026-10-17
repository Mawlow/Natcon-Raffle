<?php

namespace Tests\Feature;

use App\Enums\DrawResult;
use App\Enums\RaffleStatus;
use App\Models\DrawEvent;
use App\Enums\ParticipantStatus;
use App\Models\Raffle;
use App\Models\RaffleFile;
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
        $predraw = $this->raffleWithPool(2);
        app(RaffleDrawService::class)->draw($main);

        $this->stage($predraw, [
            ['participant_id' => $predraw->participants()->where('ticket_number', '000001')->first()->id, 'prize_name' => 'Phone'],
        ])->assertStatus(422);

        $this->getJson("/api/raffles/{$predraw->id}/staged-winners")
            ->assertOk()
            ->assertJsonPath('won_elsewhere.000001', $main->name)
            ->assertJsonPath('still_to_win', 1);
    }

    public function test_earlier_winners_can_be_pre_selected_once_everyone_still_to_win_is_listed(): void
    {
        // Four people; two won on Day 1. A Day 2 pre-draw lists the two still to win first.
        $this->actingAs($this->admin());
        $fileId = $this->postJson('/api/raffle-files', ['name' => 'NATCON'])->json('data.id');
        $csv = \Illuminate\Http\UploadedFile::fake()->createWithContent('people.csv', "ticket_number,name\n001,A\n002,B\n003,C\n004,D\n");
        $this->postJson("/api/raffle-files/{$fileId}/participants", ['file' => $csv])->assertCreated();
        $make = fn (string $name, int $day, array $extra = []) => Raffle::find($this->postJson('/api/raffles', ['name' => $name, 'raffle_file_id' => $fileId, 'ready' => true, 'draw_day' => $day, 'winners_count' => 2] + $extra)->assertCreated()->json('data.id'));

        $dayOne = $make('Day 1 draw', 1, ['prizes' => [['winners_count' => 2, 'prize_name' => 'P']]]);
        $won = array_map(fn ($o) => $o->winner->ticket_number, app(RaffleDrawService::class)->drawAll($dayOne));
        $predraw = Raffle::find($this->postJson("/api/raffle-files/{$fileId}/predraws", ['name' => 'Day 2 pre-draw', 'draw_day' => 2])->json('data.id'));
        $person = fn (string $ticket) => $predraw->participants()->where('ticket_number', $ticket)->first()->id;
        $fresh = array_values(array_diff(['001', '002', '003', '004'], $won));

        // Two still to win: a Day 1 winner cannot be listed yet.
        $this->getJson("/api/raffles/{$predraw->id}/staged-winners")->assertJsonPath('still_to_win', 2)->assertJsonPath("won_elsewhere.{$won[0]}", 'Day 1 draw');
        $this->stage($predraw, [['participant_id' => $person($won[0]), 'prize_name' => 'Phone']])->assertStatus(422);

        // Both still-to-win people listed: everyone is back in, so a Day 1 winner can be listed too.
        $this->stage($predraw, [
            ['participant_id' => $person($fresh[0]), 'prize_name' => 'Phone'],
            ['participant_id' => $person($fresh[1]), 'prize_name' => 'Phone'],
        ])->assertOk();
        $this->getJson("/api/raffles/{$predraw->id}/staged-winners")->assertJsonPath('still_to_win', 0)->assertJsonMissingPath("won_elsewhere.{$won[0]}");
        $this->stage($predraw, [
            ['participant_id' => $person($fresh[0]), 'prize_name' => 'Phone'],
            ['participant_id' => $person($fresh[1]), 'prize_name' => 'Phone'],
            ['participant_id' => $person($won[0]), 'prize_name' => 'Phone'],
        ])->assertOk();

        // Day 2 set to everyone: Day 1 winners are pickable from the start, and no "still to win" count.
        $this->stage($predraw, [])->assertOk();
        $this->putJson("/api/raffle-files/{$fileId}/days/2", ['rule' => 'everyone'])->assertOk();
        $this->getJson("/api/raffles/{$predraw->id}/staged-winners")->assertJsonPath('still_to_win', null)->assertJsonMissingPath("won_elsewhere.{$won[0]}");
        $this->stage($predraw, [['participant_id' => $person($won[0]), 'prize_name' => 'Phone']])->assertOk();
    }

    public function test_a_winner_in_one_raffle_file_is_not_a_winner_in_another(): void
    {
        // Two raffle files — two events — whose tickets 000001–000003 are different people.
        $cebu = RaffleFile::create(['name' => 'Cebu']);
        $davao = RaffleFile::create(['name' => 'Davao']);
        $staged = $this->raffleWithPool(3, ['winners_count' => 1, 'raffle_file_id' => $cebu->id]);
        $sibling = $this->raffleWithPool(3, ['winners_count' => 1, 'raffle_file_id' => $cebu->id]);
        $other = $this->raffleWithPool(3, ['winners_count' => 3, 'raffle_file_id' => $davao->id]);

        $this->stage($staged, [
            ['participant_id' => $staged->participants()->where('ticket_number', '000001')->value('id'), 'prize_name' => 'Car'],
        ])->assertOk();

        // Shown as a winner in the file's other raffle, not in the other file.
        $this->assertSame(ParticipantStatus::Winner, $sibling->participants()->where('ticket_number', '000001')->first()->status);
        $this->assertSame(ParticipantStatus::Active, $other->participants()->where('ticket_number', '000001')->first()->status);

        // The other file can still draw ticket 000001, and pre-select it.
        $draws = app(RaffleDrawService::class);
        $this->assertSame(3, $draws->eligibleTicketCount($other));
        $this->assertSame(2, $draws->eligibleTicketCount($sibling));
        $this->assertSame([], $other->ticketsWonElsewhere());

        $tickets = array_map(fn ($o) => $o->winner->ticket_number, $draws->drawAll($other));
        sort($tickets);
        $this->assertSame(['000001', '000002', '000003'], $tickets);

        // Revealing the pre-selected winner marks the file's lists only.
        $draws->draw($staged->refresh());
        $this->assertSame(ParticipantStatus::Winner, $sibling->participants()->where('ticket_number', '000001')->first()->status);
        $fresh = $this->raffleWithPool(3, ['raffle_file_id' => $davao->id]);
        $this->assertSame(ParticipantStatus::Active, $fresh->participants()->where('ticket_number', '000001')->first()->status);
    }

    public function test_one_revealed_winner_can_be_taken_off_without_redrawing_the_rest(): void
    {
        [$raffle, $picked] = $this->stagedRaffle();
        $draws = app(RaffleDrawService::class);
        foreach ($picked as $_) {
            $draws->draw($raffle->refresh());
        }
        $raffle->refresh();
        $this->assertSame(RaffleStatus::Completed, $raffle->status);

        // The second winner (the Phone) was listed by mistake.
        $this->actingAs($this->admin())
            ->deleteJson("/api/raffles/{$raffle->id}/winners/2")
            ->assertOk()
            ->assertJsonPath('data.winners_count', 2)
            ->assertJsonPath('data.status', RaffleStatus::Completed->value);

        $raffle->refresh();
        $this->assertSame([$picked[0]->id, $picked[2]->id], array_column($raffle->stagedWinners(), 'participant_id'));
        $this->assertSame([[1, $picked[0]->ticket_number], [2, $picked[2]->ticket_number]], $raffle->winners()->orderBy('position')->get()->map(fn ($w) => [(int) $w->position, $w->ticket_number])->all());
        $this->assertSame(2, (int) $raffle->winners_count);
        $this->assertSame(ParticipantStatus::Active, $picked[1]->refresh()->status);
        $this->assertSame(ParticipantStatus::Winner, $picked[0]->refresh()->status);
        $this->assertTrue(DrawEvent::query()->where('raffle_id', $raffle->id)->where('result', DrawResult::Redraw)->where('ticket_number', $picked[1]->ticket_number)->exists());

        // A place that has not been revealed is not a winner yet.
        $this->deleteJson("/api/raffles/{$raffle->id}/winners/3")->assertStatus(404);
    }
}
