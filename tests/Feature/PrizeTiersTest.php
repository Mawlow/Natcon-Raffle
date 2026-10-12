<?php

namespace Tests\Feature;

use App\Enums\RaffleStatus;
use App\Exceptions\DrawException;
use App\Models\Participant;
use App\Models\Raffle;
use App\Models\Winner;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/** One raffle, several prizes: 2 × cash, then 1 × phone, drawn in order. */
class PrizeTiersTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected RaffleDrawService $draws;

    protected function setUp(): void
    {
        parent::setUp();
        $this->draws = app(RaffleDrawService::class);
    }

    protected function savePrizes(Raffle $raffle, array $prizes)
    {
        return $this->actingAs($this->admin())->putJson("/api/raffles/{$raffle->id}/prizes", ['prizes' => $prizes]);
    }

    protected function tieredRaffle(int $participants = 10, bool $phoneIncludesPrevious = false): Raffle
    {
        $raffle = $this->raffleWithPool($participants, ['winners_count' => 1]);

        $this->savePrizes($raffle, [
            ['winners_count' => 2, 'prize_name' => 'Cash', 'prize_type' => 'cash', 'prize_value' => 5000],
            ['winners_count' => 1, 'prize_name' => 'Phone', 'prize_type' => 'item', 'include_previous_winners' => $phoneIncludesPrevious],
        ])->assertOk();

        return $raffle->refresh();
    }

    public function test_saving_prizes_sets_the_number_of_winners(): void
    {
        $raffle = $this->tieredRaffle();

        $this->assertSame(3, $raffle->winners_count);
        $this->assertSame(['Cash', 'Phone'], array_column($raffle->prizeList(), 'prize_name'));
    }

    public function test_winners_are_drawn_for_each_prize_in_order(): void
    {
        $raffle = $this->tieredRaffle();
        [$cash, $phone] = $raffle->prizes;

        $prizes = [];
        for ($i = 0; $i < 3; $i++) {
            $prizes[] = $this->draws->draw($raffle->refresh())->winner->raffle_prize_id;
        }

        $this->assertSame([$cash->id, $cash->id, $phone->id], $prizes);
        $this->assertSame(RaffleStatus::Completed, $raffle->refresh()->status);
    }

    public function test_a_prize_leaves_earlier_winners_out_by_default(): void
    {
        // Three tickets, three places: the phone must go to the one ticket that has not won.
        $raffle = $this->tieredRaffle(3);

        $cashWinners = [
            $this->draws->draw($raffle->refresh())->winner->ticket_number,
            $this->draws->draw($raffle->refresh())->winner->ticket_number,
        ];
        $phone = $this->draws->draw($raffle->refresh())->winner->ticket_number;

        $this->assertNotContains($phone, $cashWinners);
    }

    public function test_a_prize_can_include_earlier_winners(): void
    {
        // Two tickets, both win cash — the phone can only go out if they are included.
        $raffle = $this->tieredRaffle(2, phoneIncludesPrevious: true);

        $this->draws->draw($raffle->refresh());
        $this->draws->draw($raffle->refresh());
        $phone = $this->draws->draw($raffle->refresh());

        $this->assertSame($raffle->prizes[1]->id, $phone->winner->raffle_prize_id);
    }

    public function test_excluding_earlier_winners_can_run_a_prize_out_of_tickets(): void
    {
        $raffle = $this->tieredRaffle(2);
        $this->draws->draw($raffle->refresh());
        $this->draws->draw($raffle->refresh());

        $this->expectException(DrawException::class);
        $this->draws->draw($raffle->refresh());
    }

    public function test_each_prize_draws_from_its_own_pool(): void
    {
        $raffle = $this->raffleWithPool(0);
        foreach (['#1' => 'ELITE', '#2' => 'NATCON ONLY', '#3' => 'NATCON ONLY'] as $ticket => $tag) {
            Participant::factory()->create(['raffle_id' => $raffle->id, 'ticket_number' => $ticket, 'category' => $tag]);
        }

        $this->savePrizes($raffle, [
            ['winners_count' => 1, 'prize_name' => 'Elite prize', 'draw_filter' => ['type' => 'tag', 'values' => ['ELITE']]],
            ['winners_count' => 1, 'prize_name' => 'Anyone'],
        ])->assertOk();

        $this->assertSame('#1', $this->draws->draw($raffle->refresh())->winner->ticket_number);
    }

    public function test_draw_all_only_draws_the_current_prize(): void
    {
        $raffle = $this->tieredRaffle();

        $outcomes = $this->draws->drawAll($raffle->refresh());

        $this->assertCount(2, $outcomes);
        $this->assertSame(1, $raffle->refresh()->remainingWinnerSlots());
    }

    public function test_a_prize_with_winners_cannot_be_removed_or_cut_below_them(): void
    {
        $raffle = $this->tieredRaffle();
        $this->draws->draw($raffle->refresh());
        $this->draws->draw($raffle->refresh());
        [$cash, $phone] = $raffle->prizes;

        $this->savePrizes($raffle, [['id' => $phone->id, 'winners_count' => 1, 'prize_name' => 'Phone']])->assertStatus(422);
        $this->savePrizes($raffle, [
            ['id' => $cash->id, 'winners_count' => 1, 'prize_name' => 'Cash'],
            ['id' => $phone->id, 'winners_count' => 1, 'prize_name' => 'Phone'],
        ])->assertStatus(422);
    }

    public function test_adding_a_prize_to_a_completed_raffle_reopens_it(): void
    {
        $raffle = $this->tieredRaffle();
        $this->draws->drawAll($raffle->refresh());
        $this->draws->drawAll($raffle->refresh());
        $this->assertSame(RaffleStatus::Completed, $raffle->refresh()->status);

        $prizes = collect($raffle->prizeList())->map(fn ($p) => ['id' => $p['id'], 'winners_count' => $p['winners_count'], 'prize_name' => $p['prize_name']])->all();
        $prizes[] = ['winners_count' => 1, 'prize_name' => 'Bonus'];

        $this->savePrizes($raffle, $prizes)
            ->assertOk()
            ->assertJsonPath('data.winners_count', 4)
            ->assertJsonPath('data.status', 'LIVE');

        $this->assertSame('Bonus', $this->draws->draw($raffle->refresh())->winner->prize->prize_name);
    }

    public function test_the_display_shows_the_next_prize_and_each_winners_prize(): void
    {
        $raffle = $this->tieredRaffle();
        $this->draws->drawAll($raffle->refresh());

        $data = $this->getJson("/api/raffles/{$raffle->id}/display")->assertOk()->json('data');

        $this->assertSame('Phone', $data['prize_name']);
        $this->assertSame('item', $data['prize_type']);
        $this->assertSame($raffle->prizes[1]->id, $data['current_prize_id']);
        $this->assertSame([2, 0], array_column($data['prizes'], 'winners_drawn'));
        $this->assertSame($raffle->prizes[0]->id, $data['winners'][0]['prize_id']);
    }

    public function test_editing_the_raffle_keeps_the_winners_from_the_prize_list(): void
    {
        $raffle = $this->tieredRaffle();

        $this->actingAs($this->admin())
            ->putJson("/api/raffles/{$raffle->id}", ['winners_count' => 50])
            ->assertOk()
            ->assertJsonPath('data.winners_count', 3);
    }

    public function test_a_raffle_without_prizes_still_draws_as_before(): void
    {
        $raffle = $this->raffleWithPool(5, ['winners_count' => 2]);

        $this->draws->drawAll($raffle);

        $this->assertSame(2, Winner::query()->where('raffle_id', $raffle->id)->whereNull('raffle_prize_id')->count());
    }
}
