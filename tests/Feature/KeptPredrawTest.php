<?php

namespace Tests\Feature;

use App\Enums\ParticipantStatus;
use App\Enums\RaffleStatus;
use App\Models\DrawEvent;
use App\Models\Raffle;
use App\Models\RaffleFile;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/**
 * A raffle already drawn, kept as a locked pre-draw: its winners become its
 * pre-selected list and are played again at the event, in set order, with
 * nobody able to change them without the owner PIN.
 */
class KeptPredrawTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected function setUp(): void
    {
        parent::setUp();
        config(['raffle.owner_pin' => '4321']);
        $this->actingAs($this->admin());
    }

    /** A raffle in a file, drawn to the end, with a prize list. */
    protected function drawnRaffle(int $winners = 3, array $prize = ['prize_name' => 'Hotel Voucher', 'prize_type' => 'item']): Raffle
    {
        $file = RaffleFile::query()->create(['name' => 'NATCON', 'created_by' => auth()->id()]);
        $raffle = $this->raffleWithPool(10, ['winners_count' => $winners, 'raffle_file_id' => $file->id]);
        $raffle->prizes()->create($prize + ['sort_order' => 0, 'winners_count' => $winners, 'prize_currency' => 'PHP']);

        app(RaffleDrawService::class)->drawAll($raffle);

        return $raffle->refresh();
    }

    public function test_a_drawn_raffle_is_kept_as_a_locked_pre_draw_with_its_winners_as_the_list(): void
    {
        $raffle = $this->drawnRaffle();
        $won = $raffle->winners()->orderBy('position')->get();

        $this->postJson('/api/predraws/keep', ['raffle_ids' => [$raffle->id], 'draw_set' => 2])
            ->assertOk()
            ->assertJsonPath('data.kept', [$raffle->id])
            ->assertJsonPath('data.skipped', []);

        $raffle->refresh();
        $this->assertTrue($raffle->is_predraw);
        $this->assertTrue($raffle->isLocked());
        $this->assertSame(2, $raffle->draw_set);
        $this->assertSame(RaffleStatus::Completed, $raffle->status);
        $this->assertSame(3, $raffle->winners_count);

        // The list is the winners, in the order they came out, with their prize.
        $this->assertSame(
            $won->map(fn ($w) => ['participant_id' => $w->participant_id, 'prize_name' => 'Hotel Voucher'])->all(),
            $raffle->stagedWinners(),
        );
        // Nothing is lost: the winners, their prize list and the draw history stay.
        $this->assertSame(3, $raffle->winners()->count());
        $this->assertSame(['Hotel Voucher', 'Hotel Voucher', 'Hotel Voucher'], $raffle->winners()->pluck('prize_name')->all());
        $this->assertSame(1, $raffle->prizes()->count());
        $this->assertSame(3, DrawEvent::query()->where('raffle_id', $raffle->id)->count());

        $this->getJson("/api/raffles/{$raffle->id}")
            ->assertJsonPath('data.is_locked', true)
            ->assertJsonPath('data.is_predraw', true)
            ->assertJsonCount(3, 'data.staged_winners');
        $this->getJson('/api/predraws')->assertJsonPath('data.0.is_locked', true)->assertJsonPath('data.0.draw_set', 2);
    }

    public function test_a_cash_prize_is_named_with_its_amount_on_the_list(): void
    {
        $raffle = $this->drawnRaffle(1, ['prize_name' => 'Cash Prize', 'prize_type' => 'cash', 'prize_value' => 3000]);

        $this->postJson('/api/predraws/keep', ['raffle_ids' => [$raffle->id]])->assertOk();

        $this->assertSame('₱3,000 Cash Prize', $raffle->refresh()->stagedWinners()[0]['prize_name']);
    }

    public function test_playing_again_reveals_the_same_winners_in_the_same_order(): void
    {
        $raffle = $this->drawnRaffle();
        $before = $raffle->winners()->orderBy('position')->pluck('ticket_number')->all();
        $this->postJson('/api/predraws/keep', ['raffle_ids' => [$raffle->id]])->assertOk();

        $this->postJson("/api/raffles/{$raffle->id}/replay")->assertOk()
            ->assertJsonPath('data.cleared', $before)
            ->assertJsonPath('data.winners_count', 3);

        $raffle->refresh();
        $this->assertSame(RaffleStatus::Ready, $raffle->status);
        $this->assertSame(0, $raffle->winners()->count());
        $this->assertTrue($raffle->isLocked());
        $this->assertCount(3, $raffle->stagedWinners());
        // Still winners in the participant list: nobody is released or left out.
        $this->assertSame(3, $raffle->participants()->whereIn('ticket_number', $before)->where('status', ParticipantStatus::Winner)->count());

        $draws = app(RaffleDrawService::class);
        $again = [];
        for ($i = 0; $i < 3; $i++) {
            $again[] = $draws->draw($raffle->refresh())->winner->ticket_number;
        }

        $this->assertSame($before, $again);
        $this->assertSame(RaffleStatus::Completed, $raffle->refresh()->status);
        $this->assertStringContainsString('Played again', DrawEvent::query()->where('raffle_id', $raffle->id)->where('context->replay', true)->value('message'));
    }

    /** Straight from the redraw dialog: no "keep" step first. */
    public function test_a_raffle_drawn_at_random_is_played_again_with_the_same_winners(): void
    {
        $raffle = $this->drawnRaffle();
        $before = $raffle->winners()->orderBy('position')->pluck('ticket_number')->all();
        $this->assertFalse($raffle->is_predraw);

        $this->postJson("/api/raffles/{$raffle->id}/replay")->assertOk()
            ->assertJsonPath('data.cleared', $before)
            ->assertJsonPath('data.winners_count', 3);

        $raffle->refresh();
        $this->assertTrue($raffle->is_predraw);
        $this->assertTrue($raffle->isLocked());
        $this->assertSame(RaffleStatus::Ready, $raffle->status);
        $this->assertCount(3, $raffle->stagedWinners());

        $draws = app(RaffleDrawService::class);
        $again = [];
        for ($i = 0; $i < 3; $i++) {
            $again[] = $draws->draw($raffle->refresh())->winner->ticket_number;
        }

        $this->assertSame($before, $again);
        $this->assertSame(RaffleStatus::Completed, $raffle->refresh()->status);
    }

    public function test_a_raffle_without_winners_cannot_be_played_again(): void
    {
        $raffle = $this->raffleWithPool(5);

        $this->postJson("/api/raffles/{$raffle->id}/replay")->assertStatus(422);
        $this->assertFalse($raffle->refresh()->is_predraw);
    }

    public function test_a_redraw_of_a_pre_draw_keeps_its_winners_too(): void
    {
        $raffle = $this->drawnRaffle();
        $before = $raffle->winners()->orderBy('position')->pluck('ticket_number')->all();
        $this->postJson('/api/predraws/keep', ['raffle_ids' => [$raffle->id]])->assertOk();

        // Whatever the redraw asks, a pre-selected list is never re-picked.
        $this->postJson("/api/raffles/{$raffle->id}/redraw", ['include_previous_winners' => false, 'winners_count' => 3])->assertOk();

        $raffle->refresh();
        $this->assertCount(3, $raffle->stagedWinners());
        $this->assertSame(0, $raffle->participants()->where('status', ParticipantStatus::Excluded)->count());
        $this->assertSame($before, array_map(fn ($o) => $o->winner->ticket_number, app(RaffleDrawService::class)->drawAll($raffle)));
    }

    public function test_bulk_replay_resets_every_pre_draw_and_reports_the_rest(): void
    {
        $one = $this->drawnRaffle();
        $plain = $this->raffleWithPool(3, ['winners_count' => 1]);
        $this->postJson('/api/predraws/keep', ['raffle_ids' => [$one->id]])->assertOk();

        $this->postJson('/api/predraws/replay', ['raffle_ids' => [$one->id, $plain->id]])->assertOk()
            ->assertJsonPath('data.reset', [$one->id])
            ->assertJsonPath('data.skipped.0.id', $plain->id);

        $this->assertSame(RaffleStatus::Ready, $one->refresh()->status);
    }

    public function test_a_locked_raffle_refuses_every_change_to_its_winners(): void
    {
        $raffle = $this->drawnRaffle();
        $this->postJson('/api/predraws/keep', ['raffle_ids' => [$raffle->id]])->assertOk();
        $raffle->refresh();

        $this->putJson("/api/raffles/{$raffle->id}/staged-winners", ['winners' => []])->assertStatus(423);
        $this->deleteJson("/api/raffles/{$raffle->id}/winners/1")->assertStatus(423);
        $this->deleteJson("/api/predraws/{$raffle->id}")->assertStatus(423);
        $this->deleteJson("/api/raffles/{$raffle->id}")->assertStatus(423);
        $this->postJson("/api/raffles/{$raffle->id}/convert", ['to' => 'raffle'])->assertStatus(423);
        $this->putJson("/api/raffles/{$raffle->id}/prizes", ['prizes' => []])->assertStatus(423);
        $this->deleteJson("/api/raffles/{$raffle->id}/participants")->assertStatus(423);
        $this->postJson("/api/raffles/{$raffle->id}/transition", ['action' => 'cancel'])->assertStatus(423);

        $this->assertSame(3, $raffle->winners()->count());
        $this->assertCount(3, $raffle->refresh()->stagedWinners());
        $this->assertNotNull(Raffle::find($raffle->id));

        // The name can still change; the number of winners cannot.
        $this->putJson("/api/raffles/{$raffle->id}", ['name' => 'Renamed', 'winners_count' => 9])->assertOk()
            ->assertJsonPath('data.name', 'Renamed')
            ->assertJsonPath('data.winners_count', 3);
    }

    public function test_only_the_owner_pin_unlocks_a_raffle(): void
    {
        $raffle = $this->drawnRaffle();
        $this->postJson('/api/predraws/keep', ['raffle_ids' => [$raffle->id]])->assertOk();

        $this->postJson("/api/raffles/{$raffle->id}/unlock", ['pin' => '0000'])->assertForbidden();
        $this->assertTrue($raffle->refresh()->isLocked());

        $this->postJson("/api/raffles/{$raffle->id}/unlock", ['pin' => '4321'])->assertOk()->assertJsonPath('data.is_locked', false);
        $this->assertFalse($raffle->refresh()->isLocked());

        // Unlocked, the owner can take a winner off; then lock it again.
        $this->deleteJson("/api/raffles/{$raffle->id}/winners/3")->assertOk();
        $this->assertCount(2, $raffle->refresh()->stagedWinners());

        $this->postJson("/api/raffles/{$raffle->id}/lock")->assertOk()->assertJsonPath('data.is_locked', true);
        $this->deleteJson("/api/raffles/{$raffle->id}/winners/1")->assertStatus(423);
    }

    public function test_unlocking_needs_a_pin_to_be_set(): void
    {
        config(['raffle.owner_pin' => null]);
        $raffle = $this->drawnRaffle();
        $this->postJson('/api/predraws/keep', ['raffle_ids' => [$raffle->id]])->assertOk();

        $this->postJson("/api/raffles/{$raffle->id}/unlock", ['pin' => ''])->assertUnprocessable();
        $this->postJson("/api/raffles/{$raffle->id}/unlock", ['pin' => 'anything'])->assertUnprocessable();
        $this->assertTrue($raffle->refresh()->isLocked());
    }

    public function test_a_raffle_without_winners_is_not_kept(): void
    {
        $raffle = $this->raffleWithPool(3, ['winners_count' => 1]);

        $this->postJson('/api/predraws/keep', ['raffle_ids' => [$raffle->id]])->assertOk()
            ->assertJsonPath('data.kept', [])
            ->assertJsonPath('data.skipped.0.reason', 'it has no winners yet');

        $this->assertFalse($raffle->refresh()->is_predraw);
        $this->assertFalse($raffle->isLocked());
    }

    public function test_an_existing_pre_draw_is_only_locked_and_put_in_its_set(): void
    {
        [$raffle] = $this->stagedPredraw();

        $this->postJson('/api/predraws/keep', ['raffle_ids' => [$raffle->id], 'draw_set' => 1])->assertOk()->assertJsonPath('data.kept', [$raffle->id]);

        $raffle->refresh();
        $this->assertTrue($raffle->isLocked());
        $this->assertSame(1, $raffle->draw_set);
        $this->assertCount(2, $raffle->stagedWinners());
    }

    /** A pre-draw with two pre-selected winners, played to the end. */
    protected function stagedPredraw(): array
    {
        $raffle = $this->raffleWithPool(5, ['winners_count' => 1, 'is_predraw' => true]);
        $people = $raffle->participants()->orderBy('id')->get();
        $this->putJson("/api/raffles/{$raffle->id}/staged-winners", ['winners' => [
            ['participant_id' => $people[0]->id, 'prize_name' => 'Phone'],
            ['participant_id' => $people[3]->id, 'prize_name' => 'Phone'],
        ]])->assertOk();
        app(RaffleDrawService::class)->drawAll($raffle->refresh());

        return [$raffle->refresh(), $people];
    }
}
