<?php

namespace Tests\Feature;

use App\Models\Raffle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/** Winners announced on stage, put on the Prize Display by hand. */
class PrizeSlideWinnerTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    private function file(): int
    {
        $fileId = $this->postJson('/api/raffle-files', ['name' => 'NATCON'])->json('data.id');
        $csv = UploadedFile::fake()->createWithContent('people.csv', "ticket_number,name\n001,Ana Cruz\n002,Ben Reyes\n003,Ana Lim\n");
        $this->postJson("/api/raffle-files/{$fileId}/participants", ['file' => $csv])->assertCreated();
        // Two raffles in the file carry the same list; the search shows each person once.
        foreach (['One', 'Two'] as $name) {
            $this->postJson('/api/raffles', ['name' => $name, 'raffle_file_id' => $fileId, 'ready' => true, 'prizes' => [['winners_count' => 1, 'prize_name' => 'P']]])->assertCreated();
        }

        return $fileId;
    }

    public function test_the_operator_finds_a_person_in_the_file_and_puts_them_on_the_screen(): void
    {
        $this->actingAs($this->admin());
        $fileId = $this->file();
        $this->assertSame(6, \App\Models\Participant::count());

        $found = $this->getJson('/api/prize-slides/participants?q=ana')->assertOk()->json();
        $this->assertSame($fileId, $found['file']);
        $this->assertSame(['Ana Cruz', 'Ana Lim'], array_column($found['data'], 'name'));
        $this->assertCount(1, $found['files']);

        $slide = $this->postJson('/api/prize-slides', ['prize_name' => 'Cash Prize', 'prize_type' => 'cash', 'prize_value' => 5000])->json('data.id');
        $this->postJson("/api/prize-slides/{$slide}/live")->assertOk();

        $this->postJson("/api/prize-slides/{$slide}/winners", ['participant_id' => $found['data'][0]['participant_id']])
            ->assertCreated()
            ->assertJsonPath('data.winners.0.name', 'Ana Cruz')
            ->assertJsonPath('data.winners.0.ticket_number', '001')
            ->assertJsonPath('data.winners.0.position', 1);
        // A person not on any list is typed in by hand.
        $this->postJson("/api/prize-slides/{$slide}/winners", ['name' => 'Walk-in Guest'])->assertCreated()->assertJsonPath('data.winners.1.position', 2);
        $this->postJson("/api/prize-slides/{$slide}/winners", [])->assertUnprocessable();

        // The screen lists them in order.
        $show = $this->getJson('/api/prize-show')->assertOk()->json('data');
        $this->assertSame(['Ana Cruz', 'Walk-in Guest'], array_column($show['winners'], 'name'));

        // Saved like a drawn raffle too: a completed raffle in the file, its
        // winners kept out of the whole event, one winner row per person.
        $raffle = Raffle::find($show['raffle_id']);
        $this->assertSame($fileId, $raffle->raffle_file_id);
        $this->assertSame('Cash Prize', $raffle->prize_name);
        $this->assertSame(\App\Enums\RaffleStatus::Completed, $raffle->status);
        $this->assertTrue($raffle->winners_out_for_event);
        $this->assertSame(2, $raffle->winners_count);
        $this->assertSame([['001', 1], ['', 2]], $raffle->winners()->get()->map(fn ($w) => [$w->ticket_number, $w->position])->all());
        $this->assertSame(\App\Enums\ParticipantStatus::Winner, \App\Models\Participant::where('ticket_number', '001')->first()->status);
        $this->getJson('/api/winners?raffle_id='.$raffle->id)->assertOk()->assertJsonPath('meta.total', 2);
        $this->assertStringContainsString('announced on stage', $raffle->drawEvents()->first()->message);

        // Removing one closes the gap; clearing empties the list.
        $firstId = $show['winners'][0]['id'];
        $this->deleteJson("/api/prize-slides/{$slide}/winners/{$firstId}")->assertOk()
            ->assertJsonPath('data.winners.0.name', 'Walk-in Guest')
            ->assertJsonPath('data.winners.0.position', 1);
        $this->assertSame([['', 1]], $raffle->winners()->get()->map(fn ($w) => [$w->ticket_number, $w->position])->all());
        $this->deleteJson("/api/prize-slides/{$slide}/winners")->assertOk()->assertJsonCount(0, 'data.winners');
        $this->assertSame(0, $raffle->winners()->count());
        $this->assertSame(\App\Enums\ParticipantStatus::Active, \App\Models\Participant::where('ticket_number', '001')->first()->status);

        // The next winner goes into the same raffle.
        $this->postJson("/api/prize-slides/{$slide}/winners", ['name' => 'Back Again'])->assertCreated()->assertJsonPath('data.raffle_id', $raffle->id);
        $this->assertSame(1, $raffle->winners()->count());
    }

    public function test_a_winner_put_up_on_stage_sits_out_every_other_draw_of_the_event(): void
    {
        $this->actingAs($this->admin());
        $fileId = $this->file();
        $draws = app(\App\Services\RaffleDrawService::class);
        $slide = $this->postJson('/api/prize-slides', ['prize_name' => 'Car', 'prize_type' => 'item'])->json('data.id');

        $ana = $this->getJson('/api/prize-slides/participants?q=Ana Cruz')->json('data.0');
        $this->postJson("/api/prize-slides/{$slide}/winners", ['participant_id' => $ana['participant_id']])->assertCreated();

        // Day 1 and Day 2 raffles alike: Ana is out, and marked a winner on every
        // list (and Day 1's winner stays out on Day 2, as wins carry across days).
        foreach ([1 => 2, 2 => 1] as $day => $eligible) {
            $raffle = Raffle::find($this->postJson('/api/raffles', ['name' => "Day {$day}", 'raffle_file_id' => $fileId, 'ready' => true, 'draw_day' => $day, 'prizes' => [['winners_count' => 1, 'prize_name' => 'P']]])->json('data.id'));
            $this->assertSame($eligible, $draws->eligibleTicketCount($raffle));
            $this->assertSame(\App\Enums\ParticipantStatus::Winner, $raffle->participants()->where('ticket_number', '001')->first()->status);
            $this->assertNotContains('001', array_map(fn ($o) => $o->winner->ticket_number, $draws->drawAll($raffle)));
        }

        // Taken off the screen, Ana is back in play: the only one still to win.
        $this->deleteJson("/api/prize-slides/{$slide}/winners")->assertOk();
        $late = Raffle::find($this->postJson('/api/raffles', ['name' => 'Late', 'raffle_file_id' => $fileId, 'ready' => true, 'draw_day' => 2, 'prizes' => [['winners_count' => 1, 'prize_name' => 'P']]])->json('data.id'));
        $this->assertSame(1, $draws->eligibleTicketCount($late));
        $this->assertSame(\App\Enums\ParticipantStatus::Active, $late->participants()->where('ticket_number', '001')->first()->status);
    }

    public function test_only_an_admin_puts_winners_up_and_a_winner_belongs_to_its_slide(): void
    {
        $this->actingAs($this->admin());
        $a = $this->postJson('/api/prize-slides', ['prize_name' => 'A', 'prize_type' => 'item'])->json('data.id');
        $b = $this->postJson('/api/prize-slides', ['prize_name' => 'B', 'prize_type' => 'item'])->json('data.id');
        $winner = $this->postJson("/api/prize-slides/{$a}/winners", ['name' => 'Someone'])->json('winner_id');
        $this->deleteJson("/api/prize-slides/{$b}/winners/{$winner}")->assertNotFound();

        // Deleting the slide takes its winners with it.
        $this->deleteJson("/api/prize-slides/{$a}")->assertOk();
        $this->assertSame(0, \App\Models\PrizeSlideWinner::count());

        $this->actingAs($this->nonAdmin());
        $this->postJson("/api/prize-slides/{$b}/winners", ['name' => 'X'])->assertForbidden();
        $this->getJson('/api/prize-slides/participants?q=x')->assertForbidden();
    }
}
