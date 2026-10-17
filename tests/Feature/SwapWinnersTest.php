<?php

namespace Tests\Feature;

use App\Enums\ParticipantStatus;
use App\Models\DrawEvent;
use App\Models\Participant;
use App\Models\Raffle;
use App\Models\RaffleFile;
use App\Models\RaffleSetting;
use App\Models\Winner;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

class SwapWinnersTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    /** Two raffles sharing one participant list (a raffle file), each drawn. */
    protected function twoDrawnRaffles(): array
    {
        $file = RaffleFile::create(['name' => 'Event']);
        $raffles = [];

        foreach ([1, 2] as $n) {
            $raffle = Raffle::factory()->ready()->create(['raffle_file_id' => $file->id, 'winners_count' => 2, 'name' => "Raffle $n"]);
            RaffleSetting::create(['raffle_id' => $raffle->id]);

            foreach (range(1, 6) as $t) {
                Participant::create(['raffle_id' => $raffle->id, 'name' => "Person $t", 'ticket_number' => "T$t"]);
            }

            $raffles[] = $raffle;
        }

        $draws = app(RaffleDrawService::class);

        foreach ($raffles as $raffle) {
            $draws->draw($raffle, $this->admin());
            $draws->draw($raffle->refresh(), $this->admin());
        }

        return array_map(fn (Raffle $r) => $r->refresh(), $raffles);
    }

    public function test_two_winners_change_places_across_raffles(): void
    {
        [$a, $b] = $this->twoDrawnRaffles();
        $this->actingAs($this->admin());

        $wa = $a->winners()->where('position', 1)->first();
        $wb = $b->winners()->where('position', 2)->first();

        $this->postJson('/api/winners/swap', [
            'a' => ['raffle_id' => $a->id, 'position' => 1],
            'b' => ['raffle_id' => $b->id, 'position' => 2],
        ])->assertOk()
            ->assertJsonPath('data.a.ticket_number', $wb->ticket_number)
            ->assertJsonPath('data.b.ticket_number', $wa->ticket_number);

        $newA = $a->winners()->where('position', 1)->first();
        $newB = $b->winners()->where('position', 2)->first();
        $this->assertSame($wb->ticket_number, $newA->ticket_number);
        $this->assertSame($wa->ticket_number, $newB->ticket_number);
        // The participant rows belong to the raffle each winner now sits in.
        $this->assertSame($a->id, $newA->participant->raffle_id);
        $this->assertSame($b->id, $newB->participant->raffle_id);
        // Both still marked winners everywhere in the file.
        foreach ([$wa->ticket_number, $wb->ticket_number] as $ticket) {
            $this->assertSame(2, Participant::query()->whereIn('raffle_id', [$a->id, $b->id])->where('ticket_number', $ticket)->where('status', ParticipantStatus::Winner)->count());
        }
        $this->assertSame(1, DrawEvent::query()->where('raffle_id', $a->id)->where('context->swap', true)->count());
        $this->assertSame(1, DrawEvent::query()->where('raffle_id', $b->id)->where('context->swap', true)->count());
    }

    public function test_a_swap_follows_a_pre_selected_list(): void
    {
        [$a, $b] = $this->twoDrawnRaffles();
        $this->actingAs($this->admin());
        // Kept (locked) raffles: the list names the people, and the PIN is needed.
        config(['raffle.owner_pin' => '2468']);
        $this->postJson('/api/predraws/keep', ['raffle_ids' => [$a->id, $b->id]])->assertOk();

        $wa = $a->winners()->where('position', 2)->first();
        $wb = $b->winners()->where('position', 1)->first();

        $this->postJson('/api/winners/swap', [
            'a' => ['raffle_id' => $a->id, 'position' => 2],
            'b' => ['raffle_id' => $b->id, 'position' => 1],
        ])->assertStatus(423);

        $this->postJson('/api/winners/swap', [
            'a' => ['raffle_id' => $a->id, 'position' => 2],
            'b' => ['raffle_id' => $b->id, 'position' => 1],
            'pin' => '2468',
        ])->assertOk();

        $a->refresh();
        $b->refresh();
        $this->assertSame($wb->ticket_number, $a->stagedWinnerList()[1]['ticket_number']);
        $this->assertSame($wa->ticket_number, $b->stagedWinnerList()[0]['ticket_number']);
        // Played again, the swapped people come out.
        $this->assertSame(array_column($a->stagedWinnerList(), 'ticket_number'), $a->winners()->orderBy('position')->pluck('ticket_number')->all());
    }

    public function test_someone_who_already_won_the_other_raffle_cannot_be_swapped_in(): void
    {
        [$a, $b] = $this->twoDrawnRaffles();
        $this->actingAs($this->admin());
        $ticket = $a->winners()->where('position', 1)->value('ticket_number');
        // Make them a winner of B too, by hand.
        $other = $b->winners()->where('position', 2)->first();
        $other->forceFill(['ticket_number' => $ticket, 'participant_id' => Participant::query()->where('raffle_id', $b->id)->where('ticket_number', $ticket)->value('id')])->save();

        $this->postJson('/api/winners/swap', [
            'a' => ['raffle_id' => $a->id, 'position' => 1],
            'b' => ['raffle_id' => $b->id, 'position' => 1],
        ])->assertStatus(422);
    }

    public function test_two_places_of_one_raffle_swap(): void
    {
        [$a] = $this->twoDrawnRaffles();
        $this->actingAs($this->admin());
        $before = $a->winners()->orderBy('position')->pluck('ticket_number')->all();

        $this->postJson('/api/winners/swap', [
            'a' => ['raffle_id' => $a->id, 'position' => 1],
            'b' => ['raffle_id' => $a->id, 'position' => 2],
        ])->assertOk();

        $this->assertSame(array_reverse($before), $a->winners()->orderBy('position')->pluck('ticket_number')->all());
        $this->assertSame(2, Winner::query()->where('raffle_id', $a->id)->count());
    }
}
