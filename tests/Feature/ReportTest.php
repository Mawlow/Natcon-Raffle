<?php

namespace Tests\Feature;

use App\Models\Raffle;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/** Winner reports: every raffle's details and winners, to read, print or download. */
class ReportTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    public function test_every_raffle_is_reported_with_its_winners_pre_draws_included(): void
    {
        $raffle = $this->raffleWithPool(3, ['winners_count' => 1, 'prize_name' => 'Cash', 'prize_type' => 'item']);
        app(RaffleDrawService::class)->draw($raffle);
        $predrawId = $this->actingAs($this->admin())->postJson("/api/raffles/{$raffle->id}/predraws", ['name' => 'Motor Draw'])->json('data.id');

        // Only played raffles are reported: the pre-draw is not, until its winner is revealed.
        $reports = collect($this->getJson('/api/reports')->assertOk()->json('data'))->keyBy('id');
        $this->assertFalse($reports->has($predrawId));

        $predraw = Raffle::find($predrawId);
        $this->putJson("/api/raffles/{$predrawId}/staged-winners", ['winners' => [
            ['participant_id' => $predraw->participants()->where('status', 'ACTIVE')->first()->id, 'prize_name' => 'Motor'],
        ]])->assertOk();
        app(RaffleDrawService::class)->draw($predraw->refresh());
        $reports = collect($this->getJson('/api/reports')->assertOk()->json('data'))->keyBy('id');

        $this->assertSame('Pre-draw', $reports[$predrawId]['type']);
        $this->assertSame('Raffle', $reports[$raffle->id]['type']);
        $this->assertSame(['Cash × 1'], $reports[$raffle->id]['prizes']);
        $this->assertCount(1, $reports[$raffle->id]['winners']);
        $this->assertSame('Cash', $reports[$raffle->id]['winners'][0]['prize']);
        $this->assertNotNull($reports[$raffle->id]['winners'][0]['name']);
    }

    public function test_a_raffle_report_downloads_as_a_spreadsheet(): void
    {
        $raffle = $this->raffleWithPool(3, ['winners_count' => 2, 'prize_name' => 'Cash']);
        app(RaffleDrawService::class)->drawAll($raffle);

        $response = $this->actingAs($this->admin())->get("/api/reports/{$raffle->id}/export")->assertOk();
        $csv = $response->streamedContent();

        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);
        $this->assertStringContainsString('"Winner #",Prize,Name', $csv);
        $this->assertSame(3, substr_count(trim($csv), "\n") + 1);
        $this->assertStringContainsString('attachment', $response->headers->get('content-disposition'));
    }

    public function test_every_winner_downloads_in_one_spreadsheet(): void
    {
        foreach ([1, 2] as $i) {
            $raffle = $this->raffleWithPool(2, ['winners_count' => 1, 'prize_name' => "Prize {$i}", 'prize_type' => 'item']);
            app(RaffleDrawService::class)->draw($raffle);
        }

        $csv = $this->actingAs($this->admin())->get('/api/reports/export')->assertOk()->streamedContent();

        $this->assertStringContainsString('Prize 1', $csv);
        $this->assertStringContainsString('Prize 2', $csv);
    }

    public function test_a_cash_prize_is_reported_with_its_amount(): void
    {
        $raffle = $this->raffleWithPool(2, ['winners_count' => 1, 'prize_name' => 'Cash Prize', 'prize_type' => 'cash', 'prize_value' => 1000]);
        app(RaffleDrawService::class)->draw($raffle);

        $report = $this->actingAs($this->admin())->getJson("/api/reports/{$raffle->id}")->assertOk()->json('data');

        $this->assertSame(['₱1,000 CASH PRIZE × 1'], $report['prizes']);
        $this->assertSame('₱1,000 CASH PRIZE', $report['winners'][0]['prize']);
    }

    public function test_a_raffle_report_downloads_as_a_pdf(): void
    {
        $raffle = $this->raffleWithPool(3, ['winners_count' => 2, 'prize_name' => 'Cash Prize', 'prize_value' => 1000]);
        app(RaffleDrawService::class)->drawAll($raffle);

        $response = $this->actingAs($this->admin())->get("/api/reports/{$raffle->id}/export?format=pdf")->assertOk();

        $this->assertSame('application/pdf', $response->headers->get('content-type'));
        $this->assertStringContainsString('.pdf', $response->headers->get('content-disposition'));
        $this->assertStringStartsWith('%PDF', $response->getContent());
    }

    public function test_a_raffle_report_downloads_as_a_word_document(): void
    {
        $raffle = $this->raffleWithPool(3, ['winners_count' => 1, 'prize_name' => 'Car', 'prize_type' => 'item']);
        app(RaffleDrawService::class)->draw($raffle);

        $response = $this->actingAs($this->admin())->get("/api/reports/{$raffle->id}/export?format=docx")->assertOk();

        $this->assertStringContainsString('.docx', $response->headers->get('content-disposition'));
        $file = $response->baseResponse->getFile()->getPathname();
        $this->assertStringStartsWith('PK', file_get_contents($file));

        $zip = new \ZipArchive;
        $zip->open($file);
        $this->assertStringContainsString('Car', $zip->getFromName('word/document.xml'));
        $zip->close();
    }

    public function test_every_winner_downloads_as_one_pdf(): void
    {
        $raffle = $this->raffleWithPool(2, ['winners_count' => 1, 'prize_name' => 'Car', 'prize_type' => 'item']);
        app(RaffleDrawService::class)->draw($raffle);

        $this->actingAs($this->admin())->get('/api/reports/export?format=pdf')->assertOk()->assertHeader('content-type', 'application/pdf');
    }

    public function test_an_unknown_format_is_refused(): void
    {
        $raffle = $this->raffleWithPool(1);

        $this->actingAs($this->admin())->getJson("/api/reports/{$raffle->id}/export?format=exe")->assertStatus(422);
    }
}
