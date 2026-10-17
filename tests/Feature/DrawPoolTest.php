<?php

namespace Tests\Feature;

use App\Exceptions\DrawException;
use App\Models\DrawEvent;
use App\Models\Participant;
use App\Models\Raffle;
use App\Services\RaffleDrawService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

/**
 * Drawing from one slice of a raffle's entrants — some tags, some
 * developers or some locations — and importing the masterlist those slices come from.
 */
class DrawPoolTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected RaffleDrawService $draws;

    protected function setUp(): void
    {
        parent::setUp();
        $this->draws = app(RaffleDrawService::class);
    }

    /** Tickets #1..#6: two ELITE, four NATCON ONLY, spread over three developers and two locations. */
    protected function taggedRaffle(array $attributes = []): Raffle
    {
        $raffle = $this->raffleWithPool(0, $attributes + ['winners_count' => 6]);

        foreach ([
            ['#1', 'ELITE', ['Cebu Landmasters', 'Filinvest'], 'Cebu'],
            ['#2', 'ELITE', null, 'Davao'],
            ['#3', 'NATCON ONLY', ['Cebu Landmasters'], 'Cebu'],
            ['#4', 'NATCON ONLY', ['Wee Comm'], 'Cebu'],
            ['#5', 'NATCON ONLY', ['Filinvest'], 'Davao'],
            ['#6', 'NATCON ONLY', null, null],
        ] as [$ticket, $tag, $developers, $location]) {
            Participant::factory()->create([
                'raffle_id' => $raffle->id,
                'ticket_number' => $ticket,
                'category' => $tag,
                'developers' => $developers,
                'location' => $location,
            ]);
        }

        return $raffle;
    }

    protected function drawEverything(Raffle $raffle): array
    {
        $tickets = [];

        try {
            while (true) {
                $tickets[] = $this->draws->draw($raffle->refresh())->winner->ticket_number;
            }
        } catch (DrawException) {
            sort($tickets);

            return $tickets;
        }
    }

    public function test_a_raffle_with_no_pool_draws_from_everyone(): void
    {
        $raffle = $this->taggedRaffle();

        $this->assertSame(6, $this->draws->eligibleTicketCount($raffle));
        $this->assertSame('all participants', $raffle->drawPoolLabel());
    }

    public function test_a_tag_pool_only_draws_participants_with_those_tags(): void
    {
        $raffle = $this->taggedRaffle(['draw_filter' => ['type' => 'tag', 'values' => ['ELITE']]]);

        $this->assertSame(['#1', '#2'], $this->drawEverything($raffle));
    }

    public function test_a_developer_pool_draws_anyone_qualified_under_any_chosen_developer(): void
    {
        $raffle = $this->taggedRaffle(['draw_filter' => ['type' => 'developer', 'values' => ['Filinvest', 'Wee Comm']]]);

        $this->assertSame(['#1', '#4', '#5'], $this->drawEverything($raffle));
    }

    public function test_an_empty_pool_selection_means_everyone(): void
    {
        $raffle = $this->taggedRaffle(['draw_filter' => ['type' => 'developer', 'values' => []]]);

        $this->assertNull($raffle->drawPool());
        $this->assertSame(6, $this->draws->eligibleTicketCount($raffle));
    }

    public function test_the_audit_log_records_the_pool_a_winner_came_from(): void
    {
        $raffle = $this->taggedRaffle(['draw_filter' => ['type' => 'tag', 'values' => ['ELITE']]]);

        $this->draws->draw($raffle);

        $event = DrawEvent::query()->where('raffle_id', $raffle->id)->sole();
        $this->assertStringContainsString('tag ELITE', $event->message);
        $this->assertSame(['type' => 'tag', 'values' => ['ELITE']], $event->context['draw_pool']);
    }

    public function test_an_exhausted_pool_says_which_pool_ran_out(): void
    {
        $raffle = $this->taggedRaffle(['draw_filter' => ['type' => 'tag', 'values' => ['GP']]]);

        $this->expectExceptionMessage('No eligible tickets are left in tag GP.');

        $this->draws->draw($raffle);
    }

    public function test_the_pool_is_saved_from_the_control_center(): void
    {
        $raffle = $this->taggedRaffle();

        $this->actingAs($this->admin())
            ->putJson("/api/raffles/{$raffle->id}", ['draw_filter' => ['type' => 'developer', 'values' => ['Wee Comm']]])
            ->assertOk()
            ->assertJsonPath('data.draw_filter', ['type' => 'developer', 'values' => ['Wee Comm']])
            ->assertJsonPath('data.draw_pool_label', 'developer Wee Comm');

        $this->actingAs($this->admin())
            ->getJson("/api/raffles/{$raffle->id}")
            ->assertJsonPath('eligible_count', 1);

        $this->actingAs($this->admin())
            ->putJson("/api/raffles/{$raffle->id}", ['draw_filter' => ['type' => 'all']])
            ->assertOk()
            ->assertJsonPath('data.draw_filter', null);
    }

    public function test_an_unknown_pool_type_is_rejected(): void
    {
        $raffle = $this->taggedRaffle();

        $this->actingAs($this->admin())
            ->putJson("/api/raffles/{$raffle->id}", ['draw_filter' => ['type' => 'team', 'values' => ['x']]])
            ->assertStatus(422);
    }

    public function test_the_pool_options_list_every_tag_and_developer_with_tickets_in_play(): void
    {
        $raffle = $this->taggedRaffle(['draw_filter' => ['type' => 'tag', 'values' => ['ELITE']]]);
        $this->draws->draw($raffle);

        $data = $this->actingAs($this->admin())
            ->getJson("/api/raffles/{$raffle->id}/participants/groups")
            ->assertOk()
            ->json('data');

        $this->assertSame([
            ['value' => 'NATCON ONLY', 'total' => 4, 'eligible' => 4],
            ['value' => 'ELITE', 'total' => 2, 'eligible' => 1],
        ], $data['tags']);
        $this->assertSame(['Cebu Landmasters', 'Filinvest', 'Wee Comm'], array_column($data['developers'], 'value'));
        // The ELITE winner was #1 (Cebu) or #2 (Davao): one location lost a ticket.
        $this->assertSame(['Cebu', 'Davao'], array_column($data['locations'], 'value'));
        $this->assertSame([3, 2], array_column($data['locations'], 'total'));
        $this->assertSame(4, array_sum(array_column($data['locations'], 'eligible')));
    }

    public function test_a_location_pool_only_draws_participants_from_those_places(): void
    {
        $raffle = $this->taggedRaffle(['draw_filter' => ['type' => 'location', 'values' => ['Cebu']]]);

        $this->assertSame('location Cebu', $raffle->drawPoolLabel());
        $this->assertSame(['#1', '#3', '#4'], $this->drawEverything($raffle));
    }

    public function test_a_location_can_be_combined_with_a_tag_and_a_developer(): void
    {
        $raffle = $this->taggedRaffle(['draw_filter' => ['type' => 'both', 'tags' => ['NATCON ONLY'], 'developers' => ['Cebu Landmasters', 'Filinvest'], 'locations' => ['Cebu']]]);

        $this->assertSame('tag NATCON ONLY and developers Cebu Landmasters, Filinvest and location Cebu', $raffle->drawPoolLabel());
        $this->assertSame(['#3'], $this->drawEverything($raffle));

        $this->assertSame(
            ['type' => 'both', 'tags' => ['ELITE'], 'locations' => ['Davao']],
            Raffle::normalisePool(['type' => 'both', 'tags' => ['ELITE'], 'developers' => [], 'locations' => ['Davao']]),
        );
        $this->assertSame(['type' => 'location', 'values' => ['Davao']], Raffle::normalisePool(['type' => 'both', 'locations' => ['Davao']]));
    }

    public function test_the_pool_count_and_the_saved_pool_take_a_location(): void
    {
        $raffle = $this->taggedRaffle();

        $this->actingAs($this->admin())
            ->getJson("/api/raffles/{$raffle->id}/participants/pool-count?type=both&tags[]=ELITE&locations[]=Davao")
            ->assertOk()
            ->assertJsonPath('data.count', 1);

        $this->actingAs($this->admin())->putJson("/api/raffles/{$raffle->id}", [
            'draw_filter' => ['type' => 'location', 'values' => ['Davao']],
        ])->assertOk();

        $this->assertSame(['#2', '#5'], $this->drawEverything($raffle->refresh()));
    }

    public function test_the_qualifier_masterlist_imports_tags_developers_and_the_ticket_name(): void
    {
        $raffle = $this->raffleWithPool(0);
        $csv = <<<'CSV'
        NATCON 2026 - MASTERLIST OF QUALIFIERS (TAGGED BY DEVELOPER & CATEGORY),,,,,,
        "Masterlist of Awardees, Qualifiers & Ticket Holders",,,,,,
        No.,Agent Name,Control No.,Ticket Name,QR Code,Tag,Ticket Type,Qualified Developers (Tags),Location,Cebu Landmasters
        1,Aida Veraque Rama,#06,Aida & Fernando Rama,pb-297,NATCON ONLY,Natcon Standard Ticket,Cebu Landmasters | Filinvest,Cebu,TRUE
        2,Percival Gonzales,#193,Percival Gonzales,pb-305,GP,Natcon Standard Ticket,Without Developer,,
        CSV;
        $path = tempnam(sys_get_temp_dir(), 'csv');
        file_put_contents($path, $csv);

        $this->actingAs($this->admin())
            ->post("/api/raffles/{$raffle->id}/participants/import", ['file' => new UploadedFile($path, 'qualifiers.csv', 'text/csv', null, true)], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.imported_rows', 2);

        $aida = Participant::query()->where('ticket_number', '#06')->sole();
        $this->assertSame('Aida & Fernando Rama', $aida->name);
        $this->assertSame('NATCON ONLY', $aida->category);
        $this->assertSame(['Cebu Landmasters', 'Filinvest'], $aida->developers);
        $this->assertSame('Cebu', $aida->location);
        $this->assertSame('Aida Veraque Rama', $aida->metadata['agent_name']);

        $percival = Participant::query()->where('ticket_number', '#193')->sole();
        $this->assertSame('GP', $percival->category);
        $this->assertNull($percival->developers);
        $this->assertNull($percival->location);
    }

    public function test_both_draws_only_participants_with_the_tag_and_the_developer(): void
    {
        $raffle = $this->taggedRaffle(['draw_filter' => ['type' => 'both', 'tags' => ['ELITE'], 'developers' => ['Cebu Landmasters']]]);

        $this->assertSame('tag ELITE and developer Cebu Landmasters', $raffle->drawPoolLabel());
        $this->assertSame(['#1'], $this->drawEverything($raffle));
    }

    public function test_both_with_one_list_is_just_that_list(): void
    {
        $this->assertSame(['type' => 'tag', 'values' => ['ELITE']], Raffle::normalisePool(['type' => 'both', 'tags' => ['ELITE'], 'developers' => []]));
        $this->assertNull(Raffle::normalisePool(['type' => 'both']));
    }

    public function test_the_pool_count_matches_both(): void
    {
        $raffle = $this->taggedRaffle();

        $this->actingAs($this->admin())
            ->getJson("/api/raffles/{$raffle->id}/participants/pool-count?type=both&tags[]=NATCON%20ONLY&developers[]=Filinvest&developers[]=Wee%20Comm")
            ->assertOk()
            ->assertJsonPath('data.count', 2);
    }

    public function test_both_can_be_saved_on_a_raffle(): void
    {
        $raffle = $this->taggedRaffle();

        $this->actingAs($this->admin())->putJson("/api/raffles/{$raffle->id}", [
            'draw_filter' => ['type' => 'both', 'tags' => ['ELITE'], 'developers' => ['Filinvest']],
        ])->assertOk();

        $this->assertSame(['#1'], $this->drawEverything($raffle->refresh()));
    }
}
