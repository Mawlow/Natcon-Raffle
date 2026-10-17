<?php

namespace Tests\Feature;

use App\Enums\ParticipantStatus;
use App\Models\Participant;
use App\Models\Raffle;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

class RaffleFileTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
    }

    protected function csv(string $contents): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'csv');
        file_put_contents($path, $contents);

        return new UploadedFile($path, 'people.csv', 'text/csv', null, true);
    }

    protected function makeFile(string $name = 'NATCON 2026'): int
    {
        return $this->actingAs($this->admin())->postJson('/api/raffle-files', ['name' => $name])
            ->assertCreated()
            ->assertJsonPath('data.name', $name)
            ->json('data.id');
    }

    public function test_a_raffle_made_in_a_file_starts_with_the_files_participants(): void
    {
        $fileId = $this->makeFile();

        $this->postJson("/api/raffle-files/{$fileId}/participants", [
            'file' => $this->csv("ticket_number,name\n001,Ana\n002,Ben\n003,Cy\n"),
        ])->assertCreated()->assertJsonPath('data.participants', 3);

        $raffleId = $this->postJson('/api/raffles', ['name' => 'Grand Prize', 'raffle_file_id' => $fileId])
            ->assertCreated()
            ->assertJsonPath('data.raffle_file_id', $fileId)
            ->assertJsonPath('data.participants_count', 3)
            ->json('data.id');

        $this->getJson("/api/raffles?raffle_file_id={$fileId}")->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $raffleId);
        $this->getJson("/api/raffle-files/{$fileId}")->assertOk()->assertJsonPath('data.raffles_count', 1);
    }

    public function test_a_new_upload_reaches_raffles_not_yet_drawn_and_keeps_statuses(): void
    {
        $fileId = $this->makeFile();
        $this->postJson("/api/raffle-files/{$fileId}/participants", ['file' => $this->csv("ticket_number,name\n001,Ana\n002,Ben\n")])->assertCreated();

        $raffleId = $this->postJson('/api/raffles', ['name' => 'Minor', 'raffle_file_id' => $fileId])->json('data.id');
        Participant::where('raffle_id', $raffleId)->where('ticket_number', '001')->update(['status' => 'ABSENT']);

        $this->postJson("/api/raffle-files/{$fileId}/participants", [
            'file' => $this->csv("ticket_number,name\n001,Ana Cruz\n002,Ben\n003,Cy\n"),
        ])->assertCreated()->assertJsonPath('data.synced', 1);

        $people = Participant::where('raffle_id', $raffleId)->orderBy('ticket_number')->get();
        $this->assertCount(3, $people);
        $this->assertSame('Ana Cruz', $people[0]->name);
        $this->assertSame('ABSENT', $people[0]->status->value);
    }

    public function test_marking_someone_absent_marks_them_absent_in_the_files_other_raffles(): void
    {
        $fileId = $this->makeFile();
        $this->postJson("/api/raffle-files/{$fileId}/participants", ['file' => $this->csv("ticket_number,name\n001,Ana\n002,Ben\n")])->assertCreated();

        $first = $this->postJson('/api/raffles', ['name' => 'One', 'raffle_file_id' => $fileId])->json('data.id');
        $second = $this->postJson('/api/raffles', ['name' => 'Two', 'raffle_file_id' => $fileId])->json('data.id');
        $outside = $this->raffleWithPool(0);
        Participant::create(['raffle_id' => $outside->id, 'ticket_number' => '001', 'status' => 'ACTIVE']);

        $ana = Participant::where('raffle_id', $first)->where('ticket_number', '001')->first();
        $this->putJson("/api/raffles/{$first}/participants/{$ana->id}", ['status' => 'ABSENT'])->assertOk();

        $this->assertSame('ABSENT', Participant::where('raffle_id', $second)->where('ticket_number', '001')->first()->status->value);
        $this->assertSame('ACTIVE', Participant::where('raffle_id', $outside->id)->where('ticket_number', '001')->first()->status->value);

        // A raffle made after that starts with them absent too.
        $third = $this->postJson('/api/raffles', ['name' => 'Three', 'raffle_file_id' => $fileId])->json('data.id');
        $this->assertSame('ABSENT', Participant::where('raffle_id', $third)->where('ticket_number', '001')->first()->status->value);
    }

    public function test_deleting_a_file_keeps_its_raffles(): void
    {
        $fileId = $this->makeFile();
        $raffleId = $this->postJson('/api/raffles', ['name' => 'Kept', 'raffle_file_id' => $fileId])->json('data.id');

        $this->deleteJson("/api/raffle-files/{$fileId}")->assertOk();

        $this->assertNull(Raffle::find($raffleId)->raffle_file_id);
    }

    public function test_a_raffle_can_be_made_in_a_file_ready_to_draw_with_its_prizes(): void
    {
        $fileId = $this->makeFile();
        $this->postJson("/api/raffle-files/{$fileId}/participants", [
            'file' => $this->csv("ticket_number,name,tag\n001,Ana,ELITE\n002,Ben,ELITE\n003,Cy,VIP\n"),
        ])->assertCreated();

        $this->getJson("/api/raffle-files/{$fileId}/groups")->assertOk()
            ->assertJsonPath('data.tags.0.value', 'ELITE')
            ->assertJsonPath('data.tags.0.total', 2);

        $raffle = $this->postJson('/api/raffles', [
            'name' => 'Grand Prize',
            'raffle_file_id' => $fileId,
            'logos' => [],
            'ready' => true,
            'prizes' => [
                ['winners_count' => 2, 'prize_name' => 'Cash Prize', 'prize_type' => 'cash', 'prize_value' => 5000],
                ['winners_count' => 1, 'prize_name' => 'iPhone', 'prize_type' => 'item', 'draw_filter' => ['type' => 'tag', 'values' => ['ELITE']]],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.status', 'READY')
            ->assertJsonPath('data.winners_count', 3)
            ->assertJsonPath('data.participants_count', 3)
            ->assertJsonCount(2, 'data.prizes');

        // It draws straight away.
        $this->postJson("/api/raffles/{$raffle->json('data.id')}/draw")->assertSuccessful();
    }

    public function test_a_raffle_without_prizes_is_not_saved_ready(): void
    {
        $fileId = $this->makeFile();
        $this->postJson("/api/raffle-files/{$fileId}/participants", ['file' => $this->csv("ticket_number\n001\n")])->assertCreated();

        $this->postJson('/api/raffles', ['name' => 'Bare', 'raffle_file_id' => $fileId, 'ready' => true])
            ->assertCreated()->assertJsonPath('data.status', 'DRAFT');
    }

    public function test_every_prize_needs_a_name(): void
    {
        $fileId = $this->makeFile();

        $this->postJson('/api/raffles', [
            'name' => 'Broken', 'raffle_file_id' => $fileId,
            'prizes' => [['winners_count' => 1, 'prize_name' => '']],
        ])->assertUnprocessable()->assertJsonValidationErrors('prizes.0.prize_name');
    }

    public function test_a_completed_raffle_can_be_cleared_and_made_ready_again(): void
    {
        $fileId = $this->makeFile();
        $this->postJson("/api/raffle-files/{$fileId}/participants", [
            'file' => $this->csv("ticket_number\n001\n002\n003\n"),
        ])->assertCreated();

        $id = $this->postJson('/api/raffles', [
            'name' => 'Done', 'raffle_file_id' => $fileId, 'ready' => true,
            'prizes' => [['winners_count' => 2, 'prize_name' => 'Cash Prize', 'prize_value' => 1000]],
        ])->json('data.id');

        $this->postJson("/api/raffles/{$id}/draw")->assertSuccessful();
        $this->postJson("/api/raffles/{$id}/draw")->assertSuccessful();
        $this->getJson("/api/raffles/{$id}")->assertJsonPath('data.status', 'COMPLETED');

        // From a raffle list: no number of winners sent, as the prize list sets it.
        $this->postJson("/api/raffles/{$id}/redraw", ['include_previous_winners' => true])
            ->assertOk()->assertJsonPath('data.winners_count', 2);

        $this->getJson("/api/raffles/{$id}")
            ->assertJsonPath('data.status', 'READY')
            ->assertJsonPath('data.winners_drawn', 0);
        $this->postJson("/api/raffles/{$id}/draw")->assertSuccessful();
    }

    public function test_a_pre_draw_can_be_made_in_a_file_with_the_files_participants(): void
    {
        $fileId = $this->makeFile();
        $this->postJson("/api/raffle-files/{$fileId}/predraws", ['name' => 'Too soon'])->assertUnprocessable();

        $this->postJson("/api/raffle-files/{$fileId}/participants", ['file' => $this->csv("ticket_number\n001\n002\n")])->assertCreated();

        $id = $this->postJson("/api/raffle-files/{$fileId}/predraws", ['name' => 'Grand Pre-draw'])
            ->assertCreated()->json('data.id');

        $predraw = Raffle::find($id);
        $this->assertTrue($predraw->is_predraw);
        $this->assertSame($fileId, $predraw->raffle_file_id);
        $this->assertSame(2, $predraw->participants()->count());

        $this->getJson("/api/predraws?raffle_file_id={$fileId}")->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/predraws?raffle_file_id=999')->assertOk()->assertJsonCount(0, 'data');
        // Not one of the file's ordinary raffles.
        $this->getJson("/api/raffles?raffle_file_id={$fileId}")->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_a_raffle_not_in_a_file_can_be_moved_into_one(): void
    {
        $fileId = $this->makeFile();
        $raffle = $this->raffleWithPool(4);

        $this->getJson('/api/raffles?unfiled=1')->assertOk()->assertJsonCount(1, 'data');

        $this->postJson("/api/raffles/{$raffle->id}/file", ['raffle_file_id' => $fileId])
            ->assertOk()->assertJsonPath('data.raffle_file_id', $fileId)
            ->assertJsonPath('data.participants_count', 4);

        $this->getJson('/api/raffles?unfiled=1')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/raffles?raffle_file_id={$fileId}")->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_deleting_a_raffle_deletes_its_pre_draws_and_frees_their_winners(): void
    {
        $raffle = $this->raffleWithPool(4);
        $predrawId = $this->actingAs($this->admin())->postJson("/api/raffles/{$raffle->id}/predraws", ['name' => 'Early'])->assertCreated()->json('data.id');
        $other = $this->raffleWithPool(0);

        // Someone is pre-selected on the pre-draw, and is in another raffle too.
        $chosen = Participant::where('raffle_id', $predrawId)->first();
        Participant::create(['raffle_id' => $other->id, 'ticket_number' => $chosen->ticket_number, 'status' => 'ACTIVE']);
        $this->putJson("/api/raffles/{$predrawId}/staged-winners", [
            'winners' => [['participant_id' => $chosen->id, 'prize_name' => 'Cash Prize']],
        ])->assertOk();
        $this->assertSame('WINNER', Participant::where('raffle_id', $other->id)->first()->status->value);

        $this->getJson("/api/raffles/{$raffle->id}")->assertJsonPath('data.predraws_count', 1);
        $this->deleteJson("/api/raffles/{$raffle->id}")->assertOk();

        $this->assertNull(Raffle::find($predrawId));
        $this->assertSame('ACTIVE', Participant::where('raffle_id', $other->id)->first()->status->value);
    }

    public function test_raffles_can_be_put_into_sets_and_taken_out(): void
    {
        $fileId = $this->makeFile();
        $one = $this->postJson('/api/raffles', ['name' => 'One', 'raffle_file_id' => $fileId])->json('data.id');
        $two = $this->postJson('/api/raffles', ['name' => 'Two', 'raffle_file_id' => $fileId])->json('data.id');
        $three = $this->postJson('/api/raffles', ['name' => 'Three', 'raffle_file_id' => $fileId])->json('data.id');

        $this->postJson('/api/raffles/sets', ['raffle_ids' => [$one, $two], 'draw_set' => 1])
            ->assertOk()->assertJsonPath('data.updated', 2);
        $this->postJson('/api/raffles/sets', ['raffle_ids' => [$three], 'draw_set' => 2])->assertOk();

        $this->getJson("/api/raffles/{$one}")->assertJsonPath('data.draw_set', 1);
        $this->getJson("/api/raffles/{$three}")->assertJsonPath('data.draw_set', 2);

        $this->postJson('/api/raffles/sets', ['raffle_ids' => [$two], 'draw_set' => null])->assertOk();
        $this->getJson("/api/raffles/{$two}")->assertJsonPath('data.draw_set', null);

        $this->postJson('/api/raffles/sets', ['raffle_ids' => [], 'draw_set' => 1])->assertUnprocessable();

        // Days sit above sets; sending only a day leaves the sets alone.
        $this->postJson('/api/raffles/sets', ['raffle_ids' => [$one, $three], 'draw_day' => 2])->assertOk();
        $this->getJson("/api/raffles/{$one}")->assertJsonPath('data.draw_day', 2)->assertJsonPath('data.draw_set', 1);
        $this->postJson('/api/raffles/sets', ['raffle_ids' => [$one], 'draw_day' => null])->assertOk();
        $this->getJson("/api/raffles/{$one}")->assertJsonPath('data.draw_day', null);
        $this->postJson('/api/raffles/sets', ['raffle_ids' => [$one]])->assertUnprocessable();
    }

    public function test_a_raffle_can_be_changed_into_a_pre_draw_and_back(): void
    {
        $fileId = $this->makeFile();
        $this->postJson("/api/raffle-files/{$fileId}/participants", ['file' => $this->csv("ticket_number\n001\n002\n003\n")])->assertCreated();
        $id = $this->postJson('/api/raffles', [
            'name' => 'Switch', 'raffle_file_id' => $fileId, 'ready' => true,
            'prizes' => [['winners_count' => 1, 'prize_name' => 'Cash Prize', 'prize_value' => 500]],
        ])->json('data.id');
        $this->postJson('/api/raffles/sets', ['raffle_ids' => [$id], 'draw_set' => 1])->assertOk();

        $this->postJson("/api/raffles/{$id}/convert", ['to' => 'predraw'])->assertOk()
            ->assertJsonPath('data.is_predraw', true)
            ->assertJsonPath('data.status', 'READY')
            // It keeps its set: pre-draws are played in set order too.
            ->assertJsonPath('data.draw_set', 1)
            ->assertJsonCount(0, 'data.prizes');
        $this->getJson("/api/predraws?raffle_file_id={$fileId}")->assertJsonCount(1, 'data');

        // Its winners are picked, and they count as having won elsewhere.
        $other = $this->postJson('/api/raffles', ['name' => 'Other', 'raffle_file_id' => $fileId])->json('data.id');
        $chosen = Participant::where('raffle_id', $id)->where('ticket_number', '001')->first();
        $this->putJson("/api/raffles/{$id}/staged-winners", ['winners' => [['participant_id' => $chosen->id, 'prize_name' => 'Car']]])->assertOk();
        $this->assertSame('WINNER', Participant::where('raffle_id', $other)->where('ticket_number', '001')->first()->status->value);

        $this->postJson("/api/raffles/{$id}/convert", ['to' => 'raffle'])->assertOk()
            ->assertJsonPath('data.is_predraw', false)
            ->assertJsonPath('data.status', 'DRAFT')
            ->assertJsonCount(0, 'data.staged_winners');
        $this->assertSame('ACTIVE', Participant::where('raffle_id', $other)->where('ticket_number', '001')->first()->status->value);
    }

    public function test_a_raffle_with_winners_cannot_be_changed(): void
    {
        $fileId = $this->makeFile();
        $this->postJson("/api/raffle-files/{$fileId}/participants", ['file' => $this->csv("ticket_number\n001\n002\n")])->assertCreated();
        $id = $this->postJson('/api/raffles', [
            'name' => 'Drawn', 'raffle_file_id' => $fileId, 'ready' => true,
            'prizes' => [['winners_count' => 2, 'prize_name' => 'Cash Prize', 'prize_value' => 500]],
        ])->json('data.id');
        $this->postJson("/api/raffles/{$id}/draw")->assertSuccessful();

        $this->postJson("/api/raffles/{$id}/convert", ['to' => 'predraw'])->assertStatus(409);
    }

    public function test_everyone_in_a_file_wins_once_across_its_raffles(): void
    {
        $fileId = $this->makeFile();
        $this->postJson("/api/raffle-files/{$fileId}/participants", [
            'file' => $this->csv("ticket_number,name\n001,Ana\n002,Ben\n003,Cy\n004,Dee\n"),
        ])->assertCreated();

        $make = fn (string $name, int $winners) => Raffle::findOrFail($this->postJson('/api/raffles', [
            'name' => $name,
            'raffle_file_id' => $fileId,
            'ready' => true,
            'prizes' => [['winners_count' => $winners, 'prize_name' => 'Cash Prize', 'prize_type' => 'cash', 'prize_value' => 500]],
        ])->assertCreated()->json('data.id'));

        $draws = app(RaffleDrawService::class);
        $first = $make('First Draw', 2);
        $won = array_map(fn ($o) => $o->winner->ticket_number, $draws->drawAll($first));
        sort($won);

        // A raffle made afterwards shows them as winners and leaves them out.
        $second = $make('Second Draw', 2);
        $this->assertSame(2, $second->participants()->where('status', ParticipantStatus::Winner->value)->count());
        $this->assertSame(2, $draws->eligibleTicketCount($second));
        $this->getJson("/api/raffles/{$second->id}/participants/pool-count")->assertOk()->assertJsonPath('data.count', 2);

        $secondWon = array_map(fn ($o) => $o->winner->ticket_number, $draws->drawAll($second));
        sort($secondWon);
        $this->assertSame([], array_intersect($won, $secondWon));
        $everyone = array_merge($won, $secondWon);
        sort($everyone);
        $this->assertSame(['001', '002', '003', '004'], $everyone);

        // The first raffle's winners show as winners in the second's list too.
        foreach ($won as $ticket) {
            $this->assertSame(ParticipantStatus::Winner, $second->participants()->where('ticket_number', $ticket)->first()->status);
        }

        // Everyone has won once: a third raffle has everyone back in play.
        $third = $make('Third Draw', 1);
        $this->assertSame(4, $draws->eligibleTicketCount($third));

        // Redrawing the first raffle puts its winners back in play everywhere
        // in the file — and, two people never having won, only they are drawn.
        $this->postJson("/api/raffles/{$first->id}/redraw", ['include_previous_winners' => true])->assertOk();
        $this->assertSame(2, $draws->eligibleTicketCount($third));
        foreach ($won as $ticket) {
            $this->assertSame(ParticipantStatus::Active, $third->participants()->where('ticket_number', $ticket)->first()->status);
        }
    }
}
