<?php

namespace Tests\Feature;

use App\Enums\ParticipantStatus;
use App\Models\Raffle;
use App\Models\RaffleFile;
use App\Models\Winner;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/**
 * Days: everyone in a raffle file wins once a day and is back in play the
 * next day — unless they won a big prize, which keeps them out of the
 * whole event. And once everyone has won, everyone is back in play.
 */
class DrawDaysTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected RaffleDrawService $draws;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAs($this->admin());
        $this->draws = app(RaffleDrawService::class);
    }

    /** A file with four people, and a way to make a ready raffle in it on a day. */
    protected function fileWithPeople(): array
    {
        $fileId = $this->postJson('/api/raffle-files', ['name' => 'NATCON'])->json('data.id');
        $csv = UploadedFile::fake()->createWithContent('people.csv', "ticket_number,name\n001,A\n002,B\n003,C\n004,D\n");
        $this->postJson("/api/raffle-files/{$fileId}/participants", ['file' => $csv])->assertCreated();

        $make = fn (string $name, int $winners, ?int $day, array $extra = []) => Raffle::find($this->postJson('/api/raffles', [
            'name' => $name, 'raffle_file_id' => $fileId, 'ready' => true, 'draw_day' => $day,
            'prizes' => [['winners_count' => $winners, 'prize_name' => 'Prize']],
        ] + $extra)->assertCreated()->json('data.id'));

        return [RaffleFile::find($fileId), $make];
    }

    public function test_a_winner_on_day_one_stays_out_on_day_two_unless_day_two_puts_everyone_back_in(): void
    {
        [$file, $make] = $this->fileWithPeople();

        $first = $make('Day 1 draw', 2, 1);
        $won = array_map(fn ($o) => $o->winner->ticket_number, $this->draws->drawAll($first));

        $sameDay = $make('Day 1 second draw', 1, 1);
        $this->assertSame(2, $this->draws->eligibleTicketCount($sameDay));
        $this->assertSame(2, $sameDay->participants()->where('status', ParticipantStatus::Winner)->count());

        // Day 2 still to win: the Day 1 winners are out, and marked winners there too.
        $nextDay = $make('Day 2 draw', 1, 2);
        $this->assertSame(2, $this->draws->eligibleTicketCount($nextDay));
        $this->assertSame(2, $nextDay->participants()->whereIn('ticket_number', $won)->where('status', ParticipantStatus::Winner)->count());
        $stats = $this->getJson("/api/raffle-files/{$file->id}/days/2")->json('data');
        $this->assertSame([2, 4, 2], [$stats['remaining'], $stats['remaining_today'], $stats['won_people']]);

        // Day 2 everyone: all four are back in, Day 1's winners included.
        $this->putJson("/api/raffle-files/{$file->id}/days/2", ['rule' => 'everyone'])->assertOk();
        $this->assertSame(4, $this->draws->eligibleTicketCount($nextDay->refresh()));
        // Day 1 keeps its own rule.
        $this->assertSame(2, $this->draws->eligibleTicketCount($sameDay->refresh()));
    }

    public function test_a_big_prize_keeps_its_winners_out_of_every_day(): void
    {
        [, $make] = $this->fileWithPeople();

        $big = $make('Grand prize', 1, 1, ['winners_out_for_event' => true]);
        $this->assertTrue($big->winners_out_for_event);
        $won = $this->draws->draw($big)->winner->ticket_number;

        $nextDay = $make('Day 2 draw', 3, 2);
        $this->assertSame(3, $this->draws->eligibleTicketCount($nextDay));
        $this->assertSame(ParticipantStatus::Winner, $nextDay->participants()->where('ticket_number', $won)->first()->status);
        $this->assertNotContains($won, array_map(fn ($o) => $o->winner->ticket_number, $this->draws->drawAll($nextDay)));

        // Turned off again: an ordinary Day 1 winner. Everyone has won now,
        // and they come back in order — the Day 1 winner first, since the
        // other three won on Day 2 itself.
        $this->putJson("/api/raffles/{$big->id}", ['winners_out_for_event' => false])->assertOk()->assertJsonPath('data.winners_out_for_event', false);
        $another = $make('Day 2 late draw', 1, 2);
        $this->assertSame(1, $this->draws->eligibleTicketCount($another));
        $this->assertSame($won, $this->draws->draw($another)->winner->ticket_number);
        $this->assertSame(ParticipantStatus::Winner, $another->participants()->where('ticket_number', $won)->first()->status);
    }

    public function test_a_later_days_lists_count_for_nothing_on_an_earlier_day_and_days_come_back_in_order(): void
    {
        [$file, $make] = $this->fileWithPeople();

        // Day 1: A and B won. A Day 2 pre-draw lists C.
        $first = $make('Day 1 draw', 2, 1);
        $wonDayOne = array_map(fn ($o) => $o->winner->ticket_number, $this->draws->drawAll($first));
        $predraw = Raffle::find($this->postJson("/api/raffle-files/{$file->id}/predraws", ['name' => 'Day 2 pre-draw', 'draw_day' => 2])->json('data.id'));
        $fresh = array_values(array_diff(['001', '002', '003', '004'], $wonDayOne));
        $listed = $predraw->participants()->where('ticket_number', $fresh[0])->first();
        $this->putJson("/api/raffles/{$predraw->id}/staged-winners", ['winners' => [['participant_id' => $listed->id, 'prize_name' => 'Phone']]])->assertOk();

        // Day 1 still has both C and D to win: the Day 2 list takes nobody out of Day 1.
        $this->assertSame(2, $this->getJson("/api/raffle-files/{$file->id}/days/1")->json('data.remaining'));
        $more = $make('Day 1 later draw', 1, 1);
        $this->assertSame(2, $this->draws->eligibleTicketCount($more));
        // Day 2 has only D still to win.
        $this->assertSame(1, $this->getJson("/api/raffle-files/{$file->id}/days/2")->json('data.remaining'));

        // Day 2 draws: D first; then the Day 1 winners A and B, before C who is on a Day 2 list.
        $this->draws->drawAll($more); // one of C or D wins Day 1 too
        $dayTwo = $make('Day 2 draw', 4, 2);
        $order = array_map(fn ($o) => $o->winner->ticket_number, $this->draws->drawAll($dayTwo));
        $stillToWin = array_values(array_diff($fresh, [$fresh[0]], Winner::query()->pluck('ticket_number')->all()));
        $this->assertSame(4, count($order));
        if ($stillToWin !== []) {
            $this->assertSame($stillToWin[0], $order[0]);
        }
        // C, listed for Day 2, is drawn last of all.
        $this->assertSame($fresh[0], end($order));
    }

    public function test_once_everyone_has_won_everyone_is_back_in_play_except_big_prize_winners(): void
    {
        [, $make] = $this->fileWithPeople();

        $big = $make('Grand prize', 1, 1, ['winners_out_for_event' => true]);
        $bigWinner = $this->draws->draw($big)->winner->ticket_number;
        $rest = $make('Everyone else', 3, 1);
        $this->draws->drawAll($rest);

        // Everyone has won once: the next draw of the day has everyone back — but the grand prize winner.
        $again = $make('Bonus draw', 1, 1);
        $this->assertSame(3, $this->draws->eligibleTicketCount($again));
        $this->assertNotSame($bigWinner, $this->draws->draw($again)->winner->ticket_number);
    }

    public function test_a_day_can_put_its_winners_back_in_play_and_counts_its_winners(): void
    {
        [$file, $make] = $this->fileWithPeople();

        $first = $make('First', 2, 1);
        $won = array_map(fn ($o) => $o->winner->ticket_number, $this->draws->drawAll($first));

        $stats = $this->getJson("/api/raffle-files/{$file->id}/days/1")->assertOk()->json('data');
        $this->assertSame(['rule' => 'remaining', 'raffles' => 1, 'winners' => 2, 'winners_people' => 2, 'participants' => 4, 'remaining' => 2, 'never_won' => 2], array_intersect_key($stats, array_flip(['rule', 'raffles', 'winners', 'winners_people', 'participants', 'remaining', 'never_won'])));

        // Remaining only: the two winners are out of the day's next draw.
        $next = $make('Next', 1, 1);
        $this->assertSame(2, $this->draws->eligibleTicketCount($next));

        // Everyone: they are back in.
        $this->putJson("/api/raffle-files/{$file->id}/days/1", ['rule' => 'everyone'])->assertOk()->assertJsonPath('data.rule', 'everyone');
        $this->assertSame(4, $this->draws->eligibleTicketCount($next->refresh()));
        $this->getJson("/api/raffles/{$next->id}/participants/pool-count")->assertOk();

        // A big prize's winners stay out even then.
        $big = $make('Grand', 1, 1, ['winners_out_for_event' => true]);
        $bigWinner = $this->draws->draw($big)->winner->ticket_number;
        $this->assertSame(3, $this->draws->eligibleTicketCount($next->refresh()));
        $this->assertNotContains($bigWinner, [$this->draws->draw($next)->winner->ticket_number]);

        // Day 2 is untouched by Day 1's rule.
        $this->assertSame('remaining', $file->refresh()->dayRule(2));
        $this->putJson("/api/raffle-files/{$file->id}/days/1", ['rule' => 'remaining'])->assertOk()->assertJsonPath('data.rule', 'remaining');
        $this->putJson("/api/raffle-files/{$file->id}/days/1", ['rule' => 'nope'])->assertUnprocessable();
    }

    public function test_a_day_lists_who_is_still_to_win_and_who_has_won_as_spreadsheets(): void
    {
        [$file, $make] = $this->fileWithPeople();
        $first = $make('Vouchers', 2, 1);
        $won = array_map(fn ($o) => $o->winner->ticket_number, $this->draws->drawAll($first));

        $remaining = $this->get("/api/raffle-files/{$file->id}/days/2/export?list=remaining")->assertOk()->assertHeader('content-type', 'text/csv; charset=UTF-8');
        $this->assertStringContainsString('still-to-win', $remaining->headers->get('content-disposition'));
        $lines = array_values(array_filter(explode("\n", trim($remaining->streamedContent()))));
        $this->assertCount(3, $lines);
        foreach ($won as $ticket) {
            $this->assertStringNotContainsString("\t{$ticket}", $remaining->streamedContent());
        }

        $wonList = $this->get("/api/raffle-files/{$file->id}/days/2/export?list=won")->assertOk();
        $content = $wonList->streamedContent();
        $this->assertCount(3, array_values(array_filter(explode("\n", trim($content)))));
        $this->assertStringContainsString('Vouchers · Prize (Day 1)', $content);
        foreach ($won as $ticket) {
            $this->assertStringContainsString("\t{$ticket}", $content);
        }

        $this->get("/api/raffle-files/{$file->id}/days/2/export?list=nope")->assertStatus(302);
    }
}
