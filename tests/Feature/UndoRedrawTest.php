<?php

namespace Tests\Feature;

use App\Enums\ParticipantStatus;
use App\Models\Raffle;
use App\Models\RaffleFile;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/**
 * A redraw pressed by mistake — one winner was meant to be replaced, not
 * everyone cleared — undone with the owner PIN from the draw log.
 */
class UndoRedrawTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected RaffleDrawService $draws;

    protected function setUp(): void
    {
        parent::setUp();
        $this->draws = app(RaffleDrawService::class);
        config(['raffle.owner_pin' => '4321']);
        $this->actingAs($this->admin());
    }

    /** A file of eight people and a raffle with a prize list of four winners. */
    protected function fileRaffle(): Raffle
    {
        $fileId = $this->postJson('/api/raffle-files', ['name' => 'NATCON'])->json('data.id');
        $rows = implode("\n", array_map(fn ($n) => sprintf('#%d,Person %d', $n, $n), range(1, 8)));
        $csv = UploadedFile::fake()->createWithContent('people.csv', "ticket_number,name\n{$rows}\n");
        $this->postJson("/api/raffle-files/{$fileId}/participants", ['file' => $csv])->assertCreated();

        return Raffle::find($this->postJson('/api/raffles', [
            'name' => 'Vouchers', 'raffle_file_id' => $fileId, 'ready' => true, 'draw_day' => 1,
            'prizes' => [['winners_count' => 4, 'prize_name' => 'Voucher']],
        ])->assertCreated()->json('data.id'));
    }

    public function test_an_accidental_redraw_is_undone_and_the_removed_winner_stays_off(): void
    {
        $raffle = $this->fileRaffle();
        $original = array_map(fn ($o) => $o->winner->ticket_number, $this->draws->drawAll($raffle));
        $this->assertCount(4, $original);
        $drawnAt = $raffle->winners()->orderBy('position')->first()->drawn_at;

        // Winner #2 is absent: taken off, one place open.
        $this->deleteJson("/api/raffles/{$raffle->id}/winners/2")->assertOk();
        $this->assertSame('LIVE', $raffle->refresh()->status->value);
        $this->getJson("/api/raffles/{$raffle->id}")->assertJsonPath('data.undoable_redraw', null);

        // Pressed by mistake: everyone cleared and four new people drawn.
        $this->postJson("/api/raffles/{$raffle->id}/redraw", ['include_previous_winners' => false])->assertOk();
        $this->getJson("/api/raffles/{$raffle->id}")->assertJsonPath('data.undoable_redraw.cleared', 3);
        $redrawn = array_map(fn ($o) => $o->winner->ticket_number, $this->draws->drawAll($raffle->refresh()));
        $this->assertCount(4, $redrawn);
        $this->assertEmpty(array_intersect($original, $redrawn));

        $this->postJson("/api/raffles/{$raffle->id}/undo-redraw", ['pin' => '0000'])->assertForbidden();
        $this->postJson("/api/raffles/{$raffle->id}/undo-redraw", [])->assertUnprocessable();

        $this->postJson("/api/raffles/{$raffle->id}/undo-redraw", ['pin' => '4321'])
            ->assertOk()
            ->assertJsonPath('data.restored', 3)
            ->assertJsonPath('data.cleared', 4)
            ->assertJsonPath('data.status', 'LIVE');

        // The three stand again in order, with their original draw times; #2 is still off.
        $raffle->refresh();
        $winners = $raffle->winners()->orderBy('position')->get();
        $expected = array_values(array_diff_key($original, [1 => true]));
        $this->assertSame($expected, $winners->pluck('ticket_number')->all());
        $this->assertSame([1, 2, 3], $winners->pluck('position')->all());
        $this->assertTrue($winners->first()->drawn_at->equalTo($drawnAt));
        $this->assertNotNull($winners->first()->draw_event_id);
        $this->assertSame('Voucher', $winners->first()->prize?->prize_name);

        $status = fn ($ticket) => $raffle->participants()->where('ticket_number', $ticket)->first()->status;
        foreach ($expected as $ticket) {
            $this->assertSame(ParticipantStatus::Winner, $status($ticket));
        }
        $this->assertSame(ParticipantStatus::Excluded, $status($original[1]));
        foreach ($redrawn as $ticket) {
            $this->assertSame(ParticipantStatus::Active, $status($ticket));
        }

        // Only the one open place is drawn, from everyone but the absentee and the three.
        $this->assertSame(4, $this->draws->eligibleTicketCount($raffle));
        $this->getJson("/api/raffles/{$raffle->id}")->assertJsonPath('data.undoable_redraw', null);
        $this->postJson("/api/raffles/{$raffle->id}/undo-redraw", ['pin' => '4321'])->assertStatus(409);

        $replacement = $this->draws->draw($raffle)->winner;
        $this->assertSame(4, $replacement->position);
        $this->assertNotContains($replacement->ticket_number, array_merge($original, []));
        $this->assertSame('COMPLETED', $raffle->refresh()->status->value);

        // The file's other lists show the restored winners as winners again.
        $other = Raffle::find($this->postJson('/api/raffles', [
            'name' => 'Later', 'raffle_file_id' => $raffle->raffle_file_id, 'ready' => true, 'draw_day' => 1,
            'prizes' => [['winners_count' => 1, 'prize_name' => 'P']],
        ])->json('data.id'));
        $this->assertSame(ParticipantStatus::Winner, $other->participants()->where('ticket_number', $expected[0])->first()->status);
        // A cleared redrawn winner who was not drawn again for the open place is free again.
        $free = array_values(array_diff($redrawn, [$replacement->ticket_number]))[0];
        $this->assertSame(ParticipantStatus::Active, $other->participants()->where('ticket_number', $free)->first()->status);
    }

    public function test_a_completed_redraw_is_undone_to_completed(): void
    {
        $raffle = $this->raffleWithPool(6, ['winners_count' => 2, 'prize_name' => 'Cash']);
        $original = array_map(fn ($o) => $o->winner->ticket_number, $this->draws->drawAll($raffle));

        $this->postJson("/api/raffles/{$raffle->id}/redraw", ['include_previous_winners' => true])->assertOk();
        $this->postJson("/api/raffles/{$raffle->id}/undo-redraw", ['pin' => '4321'])->assertOk()->assertJsonPath('data.status', 'COMPLETED');

        $raffle->refresh();
        $this->assertSame($original, $raffle->winners()->orderBy('position')->pluck('ticket_number')->all());
        $this->assertNotNull($raffle->completed_at);
        $this->assertSame('Cash', $raffle->winners()->first()->prize_name ?? $raffle->prize_name);
    }
}
