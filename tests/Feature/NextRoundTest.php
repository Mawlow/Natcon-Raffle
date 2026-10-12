<?php

namespace Tests\Feature;

use App\Enums\ParticipantStatus;
use App\Enums\RaffleStatus;
use App\Models\Participant;
use App\Models\Raffle;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/** After one raffle is drawn, the next round is set up from the Control Center with only its prizes. */
class NextRoundTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected function nextRound(Raffle $raffle, array $payload = [])
    {
        return $this->actingAs($this->admin())->postJson("/api/raffles/{$raffle->id}/next-round", $payload + [
            'name' => 'Round 2',
            'prizes' => [
                ['winners_count' => 3, 'prize_name' => 'Cash', 'prize_type' => 'cash', 'prize_value' => 1000],
                ['winners_count' => 1, 'prize_name' => 'TV', 'prize_type' => 'item'],
            ],
        ]);
    }

    /** A finished first raffle: 5 tickets, 2 winners, ticket 000005 disqualified. */
    protected function drawnRaffle(): Raffle
    {
        $raffle = $this->raffleWithPool(5, ['winners_count' => 2, 'logo_left' => null]);
        Participant::query()->where('ticket_number', '000005')->update(['status' => ParticipantStatus::Disqualified->value]);
        app(RaffleDrawService::class)->drawAll($raffle);

        return $raffle->refresh();
    }

    public function test_the_next_round_is_ready_with_its_prizes_and_the_same_participants(): void
    {
        $first = $this->drawnRaffle();

        $data = $this->nextRound($first)->assertCreated()->json('data');

        $round = Raffle::findOrFail($data['id']);
        $this->assertSame('Round 2', $round->name);
        $this->assertSame(RaffleStatus::Ready, $round->status);
        $this->assertSame(4, $round->winners_count);
        $this->assertSame(['Cash', 'TV'], array_column($round->prizeList(), 'prize_name'));
        $this->assertSame(5, $round->participants()->count());
        $this->assertSame(0, $round->winners()->count());
        $this->assertSame(RaffleStatus::Completed, $first->refresh()->status, 'The first raffle is left alone.');
    }

    public function test_earlier_winners_are_left_out_by_default(): void
    {
        $first = $this->drawnRaffle();
        $winners = $first->winners->pluck('ticket_number')->all();

        $round = Raffle::findOrFail($this->nextRound($first)->json('data.id'));

        $statuses = $round->participants()->pluck('status', 'ticket_number')->map->value->all();
        foreach ($winners as $ticket) {
            $this->assertSame('EXCLUDED', $statuses[$ticket]);
        }
        $this->assertSame('DISQUALIFIED', $statuses['000005']);
        $this->assertSame(2, collect($statuses)->filter(fn ($status) => $status === 'ACTIVE')->count());
    }

    public function test_earlier_winners_can_be_kept_in(): void
    {
        $first = $this->drawnRaffle();

        $round = Raffle::findOrFail($this->nextRound($first, ['leave_out_winners' => false])->json('data.id'));

        $this->assertSame(4, $round->participants()->where('status', 'ACTIVE')->count());
        $this->assertSame(1, $round->participants()->where('status', 'DISQUALIFIED')->count());
    }

    public function test_a_round_left_out_stays_out_in_the_round_after(): void
    {
        $first = $this->drawnRaffle();
        $second = Raffle::findOrFail($this->nextRound($first)->json('data.id'));

        $third = Raffle::findOrFail($this->nextRound($second, ['name' => 'Round 3'])->json('data.id'));

        $this->assertSame(2, $third->participants()->where('status', 'EXCLUDED')->count());
    }

    public function test_a_round_needs_at_least_one_prize(): void
    {
        $this->nextRound($this->drawnRaffle(), ['prizes' => []])->assertStatus(422);
    }

    public function test_one_prize_makes_a_plain_raffle_drawn_from_the_chosen_participants(): void
    {
        $first = $this->drawnRaffle();
        Participant::query()->where('raffle_id', $first->id)->where('ticket_number', '000004')->update(['category' => 'ELITE']);

        $round = Raffle::findOrFail($this->nextRound($first, ['prizes' => [
            ['winners_count' => 1, 'prize_name' => 'Phone', 'prize_type' => 'item', 'draw_filter' => ['type' => 'tag', 'values' => ['ELITE']]],
        ]])->assertCreated()->json('data.id'));

        $this->assertSame([], $round->prizeList());
        $this->assertSame('Phone', $round->prize_name);
        $this->assertSame(1, $round->winners_count);
        $this->assertSame(['type' => 'tag', 'values' => ['ELITE']], $round->drawPool());
    }

    public function test_the_pool_count_matches_who_the_next_round_could_draw(): void
    {
        $first = $this->drawnRaffle();
        Participant::query()->where('raffle_id', $first->id)->whereIn('ticket_number', ['000001', '000002', '000003', '000004'])->update(['category' => 'ELITE']);
        $count = fn (array $query) => $this->actingAs($this->admin())
            ->getJson("/api/raffles/{$first->id}/participants/pool-count?".http_build_query($query))
            ->assertOk()
            ->json('data.count');

        // 5 tickets: 1 disqualified, 2 already won.
        $this->assertSame(2, $count([]));
        $this->assertSame(4, $count(['leave_out' => 0]));
        $this->assertSame(4, $count(['leave_out' => 0, 'type' => 'tag', 'values' => ['ELITE']]));
        $this->assertSame(0, $count(['type' => 'tag', 'values' => ['NOBODY']]));
    }

    public function test_every_raffle_is_listed_with_its_winners(): void
    {
        $first = $this->drawnRaffle();
        $this->nextRound($first)->assertCreated();

        $raffles = collect($this->actingAs($this->admin())
            ->getJson('/api/raffles?per_page=100&with_winners=1')
            ->assertOk()
            ->json('data'))->keyBy('id');

        $this->assertCount(2, $raffles);
        $winners = $raffles[$first->id]['winners'];
        $this->assertCount(2, $winners);
        $this->assertNotEmpty($winners[0]['participant']['name']);
        $this->assertSame($first->winners[0]->ticket_number, $winners[0]['ticket_number']);
    }

    public function test_the_next_round_keeps_the_name_it_is_given(): void
    {
        $data = $this->nextRound($this->drawnRaffle(), ['name' => 'Grand Raffle'])->json('data');

        $this->assertSame('Grand Raffle', $data['name']);
    }

    public function test_the_next_round_can_have_its_own_logos(): void
    {
        $first = $this->drawnRaffle();
        $ids = \App\Support\RaffleLogos::ids();
        $first->update(['logos' => [$ids[0]], 'logo_left' => $ids[0], 'logo_right' => null]);

        $copied = Raffle::findOrFail($this->nextRound($first)->json('data.id'));
        $this->assertSame([$ids[0]], $copied->logos);
        $this->assertSame($ids[0], $copied->logo_left);

        $own = Raffle::findOrFail($this->nextRound($first, ['logos' => [$ids[1]], 'logo_left' => null, 'logo_right' => $ids[1]])->json('data.id'));
        $this->assertSame([$ids[1]], $own->logos);
        $this->assertNull($own->logo_left);
        $this->assertSame($ids[1], $own->logo_right);
    }
}
