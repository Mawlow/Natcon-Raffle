<?php

namespace Tests\Feature;

use App\Models\Participant;
use App\Models\Raffle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Support\RaffleTestHelpers;
use Tests\TestCase;

class ParticipantImportTest extends TestCase
{
    use RefreshDatabase, RaffleTestHelpers;

    protected Raffle $raffle;

    protected function setUp(): void
    {
        parent::setUp();

        // A CSV is always imported into one specific raffle.
        $this->raffle = Raffle::factory()->create();
    }

    protected function import(array $payload = [])
    {
        return $this->post("/api/raffles/{$this->raffle->id}/participants/import", $payload, ['Accept' => 'application/json']);
    }

    protected function previewImport(array $payload = [])
    {
        return $this->post("/api/raffles/{$this->raffle->id}/participants/import/preview", $payload, ['Accept' => 'application/json']);
    }

    protected function csv(string $contents, string $name = 'participants.csv'): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'csv');
        file_put_contents($path, $contents);

        return new UploadedFile($path, $name, 'text/csv', null, true);
    }

    public function test_a_valid_csv_is_previewed_without_writing_to_the_database(): void
    {
        $file = $this->csv(<<<'CSV'
        ticket_number,name,email,category
        000001,Juan Dela Cruz,juan@email.com,VISITOR
        000002,Maria Santos,maria@email.com,VISITOR
        000003,Pedro Cruz,pedro@email.com,VIP
        CSV);

        $response = $this->actingAs($this->admin())
            ->previewImport(['file' => $file]);

        $response->assertOk()
            ->assertJsonPath('data.valid_count', 3)
            ->assertJsonPath('data.invalid_count', 0)
            ->assertJsonPath('data.new_count', 3);

        $this->assertDatabaseCount('participants', 0);
    }

    public function test_importing_stores_participants_and_preserves_leading_zeros(): void
    {
        $file = $this->csv(<<<'CSV'
        ticket_number,name,email,category
        000001,Juan Dela Cruz,juan@email.com,VISITOR
        000042,Maria Santos,maria@email.com,VIP
        CSV);

        $this->actingAs($this->admin())
            ->import(['file' => $file])
            ->assertCreated()
            ->assertJsonPath('data.imported_rows', 2);

        $this->assertDatabaseHas('participants', ['raffle_id' => $this->raffle->id, 'ticket_number' => '000001', 'name' => 'Juan Dela Cruz']);
        $this->assertDatabaseHas('participants', ['raffle_id' => $this->raffle->id, 'ticket_number' => '000042', 'category' => 'VIP']);

        // The string must survive the round trip untouched.
        $this->assertSame('000042', Participant::forRaffle($this->raffle)->where('name', 'Maria Santos')->value('ticket_number'));
    }

    public function test_only_the_ticket_number_column_is_required(): void
    {
        $file = $this->csv("ticket_number\n000010\n000011\n");

        $this->actingAs($this->admin())
            ->import(['file' => $file])
            ->assertCreated()
            ->assertJsonPath('data.imported_rows', 2);
    }

    public function test_duplicate_ticket_numbers_inside_the_file_are_detected(): void
    {
        $file = $this->csv(<<<'CSV'
        ticket_number,name
        000001,First
        000002,Second
        000001,Duplicate
        CSV);

        $this->actingAs($this->admin())
            ->previewImport(['file' => $file])
            ->assertOk()
            ->assertJsonPath('data.valid_count', 2)
            ->assertJsonPath('data.duplicate_in_file_count', 1);
    }

    public function test_rows_missing_a_ticket_number_are_reported_as_invalid(): void
    {
        $file = $this->csv(<<<'CSV'
        ticket_number,name
        000001,Valid
        ,Missing ticket
        000003,Also valid
        CSV);

        $response = $this->actingAs($this->admin())
            ->previewImport(['file' => $file]);

        $response->assertOk()
            ->assertJsonPath('data.valid_count', 2)
            ->assertJsonPath('data.invalid_count', 1);

        $this->assertSame('Missing ticket number', $response->json('data.invalid_rows.0.reason'));
    }

    public function test_an_invalid_email_marks_only_that_row_invalid(): void
    {
        $file = $this->csv(<<<'CSV'
        ticket_number,name,email
        000001,Good,good@email.com
        000002,Bad,not-an-email
        CSV);

        $this->actingAs($this->admin())
            ->previewImport(['file' => $file])
            ->assertOk()
            ->assertJsonPath('data.valid_count', 1)
            ->assertJsonPath('data.invalid_count', 1);
    }

    public function test_existing_ticket_numbers_are_skipped_by_default(): void
    {
        Participant::factory()->forRaffle($this->raffle)->ticket('000001')->create(['name' => 'Original']);

        $file = $this->csv("ticket_number,name\n000001,Replacement\n000002,New Person\n");

        $this->actingAs($this->admin())
            ->import(['file' => $file])
            ->assertCreated()
            ->assertJsonPath('data.imported_rows', 1)
            ->assertJsonPath('data.skipped_rows', 1);

        $this->assertSame('Original', Participant::forRaffle($this->raffle)->where('ticket_number', '000001')->value('name'));
    }

    public function test_existing_ticket_numbers_can_be_updated_on_request(): void
    {
        Participant::factory()->forRaffle($this->raffle)->ticket('000001')->create(['name' => 'Original']);

        $file = $this->csv("ticket_number,name\n000001,Replacement\n");

        $this->actingAs($this->admin())
            ->import(['file' => $file, 'on_duplicate' => 'update'])
            ->assertCreated()
            ->assertJsonPath('data.updated_rows', 1);

        $this->assertSame('Replacement', Participant::forRaffle($this->raffle)->where('ticket_number', '000001')->value('name'));
    }

    public function test_re_uploading_the_same_file_is_flagged_as_a_duplicate_import(): void
    {
        $contents = "ticket_number,name\n000001,Juan\n";

        $this->actingAs($this->admin())
            ->import(['file' => $this->csv($contents)])
            ->assertCreated();

        $this->actingAs($this->admin())
            ->previewImport(['file' => $this->csv($contents)])
            ->assertOk()
            ->assertJsonPath('data.already_imported', true);
    }

    public function test_unknown_columns_are_kept_as_participant_metadata(): void
    {
        $file = $this->csv("ticket_number,name,table_number\n000001,Juan,12\n");

        $this->actingAs($this->admin())
            ->import(['file' => $file])
            ->assertCreated();

        $this->assertSame(
            ['table_number' => '12'],
            Participant::forRaffle($this->raffle)->where('ticket_number', '000001')->value('metadata'),
        );
    }

    public function test_a_csv_without_a_ticket_number_column_is_rejected_and_lists_what_it_found(): void
    {
        $file = $this->csv("name,email\nJuan,juan@email.com\n");

        $this->actingAs($this->admin())
            ->previewImport(['file' => $file])
            ->assertStatus(422)
            ->assertJson(fn ($json) => $json->where(
                'message',
                'The CSV must contain a "ticket_number" column. The columns found were: "name", "email".',
            ));
    }

    public function test_a_tab_separated_export_is_read_correctly(): void
    {
        // Spreadsheet exports are routinely tab separated even when named .csv.
        $file = $this->csv(
            "Control No.\tticket_number\tAttendee / Couple Name\tTeam\n".
            "1\t000001\tJuan Dela Cruz\tAlpha\n".
            "2\t000002\tMaria Santos\tBravo\n"
        );

        $this->actingAs($this->admin())
            ->previewImport(['file' => $file])
            ->assertOk()
            ->assertJsonPath('data.delimiter', 'tab')
            ->assertJsonPath('data.valid_count', 2)
            ->assertJsonPath('data.preview_rows.0.ticket_number', '000001')
            ->assertJsonPath('data.preview_rows.0.name', 'Juan Dela Cruz');
    }

    public function test_a_semicolon_separated_export_is_read_correctly(): void
    {
        $file = $this->csv("ticket_number;name\n000001;Juan Dela Cruz\n");

        $this->actingAs($this->admin())
            ->previewImport(['file' => $file])
            ->assertOk()
            ->assertJsonPath('data.delimiter', 'semicolon')
            ->assertJsonPath('data.valid_count', 1)
            ->assertJsonPath('data.preview_rows.0.name', 'Juan Dela Cruz');
    }

    public function test_a_utf8_bom_does_not_hide_the_first_column(): void
    {
        $file = $this->csv("\xEF\xBB\xBFticket_number,name\n000001,Juan\n");

        $this->actingAs($this->admin())
            ->previewImport(['file' => $file])
            ->assertOk()
            ->assertJsonPath('data.valid_count', 1);
    }

    public function test_a_utf16_export_is_converted_before_parsing(): void
    {
        // Excel's "Unicode Text" export.
        $file = $this->csv("\xFF\xFE".mb_convert_encoding("ticket_number,name\n000001,Juan\n", 'UTF-16LE', 'UTF-8'));

        $this->actingAs($this->admin())
            ->previewImport(['file' => $file])
            ->assertOk()
            ->assertJsonPath('data.valid_count', 1)
            ->assertJsonPath('data.preview_rows.0.ticket_number', '000001');
    }

    public function test_a_descriptive_heading_is_matched_to_the_optional_columns(): void
    {
        $file = $this->csv("ticket_number,Attendee / Couple Name,Contact Phone,Award / Category\n000001,Juan Dela Cruz,+639171234567,Best Booth\n");

        $response = $this->actingAs($this->admin())->previewImport(['file' => $file])->assertOk();

        $this->assertSame('Juan Dela Cruz', $response->json('data.preview_rows.0.name'));
        $this->assertSame('Best Booth', $response->json('data.preview_rows.0.category'));
    }

    public function test_a_ticket_id_column_is_never_guessed_as_the_ticket_number(): void
    {
        $file = $this->csv("Control No.,Ticket ID,Attendee Name\n1,T-1,Juan\n");

        $this->actingAs($this->admin())
            ->previewImport(['file' => $file])
            ->assertStatus(422);
    }

    public function test_title_and_summary_rows_above_the_headings_are_skipped(): void
    {
        // A spreadsheet export with a title, a subtitle and a totals block
        // before the real column headings.
        $file = $this->csv(<<<'CSV'
          NATIONAL REAL ESTATE CONVENTION 2026 — FINAL TICKETS MASTERLIST,,,,,
        "  Official Generated Tickets (Couples Unified on 1 Ticket) | Mactan Cebu",,,,,
        ,,,,,
        TOTAL TICKETS,,COUPLE TICKETS,,INDIVIDUAL TICKETS,
        2,,1,,1,
        ,,,,,
        Control No.,Ticket No.,Attendee / Couple Name,Ticket ID,Team,Award / Category
        01,#01,Aaron Joseph Duremdes,115,BEX Team,TOP AGENT
        02,#02,Alberto & Leydace Biano,9,LR Premier,TOP GLOBAL PARTNER
        CSV);

        $response = $this->actingAs($this->admin())->previewImport(['file' => $file])->assertOk();

        $this->assertSame(2, $response->json('data.valid_count'));
        $this->assertSame(0, $response->json('data.invalid_count'));
        $this->assertSame('#01', $response->json('data.preview_rows.0.ticket_number'));
        $this->assertSame('Aaron Joseph Duremdes', $response->json('data.preview_rows.0.name'));
        $this->assertSame('TOP AGENT', $response->json('data.preview_rows.0.category'));
        $this->assertContains('team', $response->json('data.extra_columns'));
    }

    public function test_a_heading_that_speaks_of_a_ticket_is_used_as_the_ticket_number(): void
    {
        $file = $this->csv("Row,Raffle Ticket Serial,Ticket ID,Guest Name\n1,A-100,55,Juan\n");

        $response = $this->actingAs($this->admin())->previewImport(['file' => $file])->assertOk();

        $this->assertSame('A-100', $response->json('data.preview_rows.0.ticket_number'));
        $this->assertSame('Juan', $response->json('data.preview_rows.0.name'));
    }

    public function test_first_and_last_name_columns_are_joined_into_the_name(): void
    {
        $file = $this->csv("Ticket #,First Name,Last Name,E-mail Address\n000001,Juan,Dela Cruz,juan@email.com\n");

        $response = $this->actingAs($this->admin())->previewImport(['file' => $file])->assertOk();

        $this->assertSame('000001', $response->json('data.preview_rows.0.ticket_number'));
        $this->assertSame('Juan Dela Cruz', $response->json('data.preview_rows.0.name'));
        $this->assertSame('juan@email.com', $response->json('data.preview_rows.0.email'));
    }

    public function test_ticket_numbers_with_prefixes_and_punctuation_are_accepted(): void
    {
        // Real event exports look like this — a hash prefix, a slash, a space.
        $file = $this->csv(<<<'CSV'
        ticket_number,name
        #01,Juan
        A-1,Maria
        VIP/002,Pedro
        TBL 12,Ana
        CSV);

        $this->actingAs($this->admin())
            ->import(['file' => $file])
            ->assertCreated()
            ->assertJsonPath('data.imported_rows', 4);

        $this->assertSame(
            ['#01', 'A-1', 'TBL 12', 'VIP/002'],
            $this->raffle->participants()->orderBy('ticket_number')->pluck('ticket_number')->all(),
        );
    }

    public function test_a_ticket_number_with_unsafe_characters_is_rejected_and_names_them(): void
    {
        // The good row comes first so the upload still sniffs as plain text.
        $file = $this->csv("ticket_number,name\n000002,Good\nA<1>,Bad\n");

        $response = $this->actingAs($this->admin())->previewImport(['file' => $file])->assertOk();

        $response->assertJsonPath('data.valid_count', 1)
            ->assertJsonPath('data.invalid_count', 1);

        $this->assertStringContainsString(
            'unsupported characters: < >',
            $response->json('data.invalid_rows.0.reason'),
        );
    }

    public function test_a_ticket_number_of_punctuation_alone_is_rejected(): void
    {
        $file = $this->csv("ticket_number,name\n---,Nope\n");

        $this->actingAs($this->admin())
            ->previewImport(['file' => $file])
            ->assertOk()
            ->assertJsonPath('data.valid_count', 0)
            ->assertJsonPath('data.invalid_rows.0.reason', 'Ticket number contains no letters or digits');
    }

    public function test_repeated_spaces_inside_a_ticket_number_are_collapsed(): void
    {
        $file = $this->csv("ticket_number,name\n\"TBL  12\",Ana\n");

        $this->actingAs($this->admin())
            ->import(['file' => $file])
            ->assertCreated();

        $this->assertSame('TBL 12', $this->raffle->participants()->value('ticket_number'));
    }

    public function test_a_non_csv_upload_is_rejected(): void
    {
        $file = UploadedFile::fake()->create('payload.php', 4, 'application/x-php');

        $this->actingAs($this->admin())
            ->import(['file' => $file])
            ->assertStatus(422)
            ->assertJsonValidationErrors('file');
    }

    public function test_an_oversized_upload_is_rejected(): void
    {
        $file = UploadedFile::fake()->create('big.csv', 11 * 1024, 'text/csv');

        $this->actingAs($this->admin())
            ->import(['file' => $file])
            ->assertStatus(422)
            ->assertJsonValidationErrors('file');
    }

    public function test_the_same_file_can_be_imported_into_two_different_raffles(): void
    {
        $contents = "ticket_number,name\n000001,Juan\n000002,Maria\n";
        $other = Raffle::factory()->create();

        $this->actingAs($this->admin())->import(['file' => $this->csv($contents)])->assertCreated();

        $this->actingAs($this->admin())
            ->post("/api/raffles/{$other->id}/participants/import", ['file' => $this->csv($contents)], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.imported_rows', 2);

        $this->assertSame(2, $this->raffle->participants()->count());
        $this->assertSame(2, $other->participants()->count());
    }

    public function test_an_import_into_one_raffle_is_not_flagged_as_duplicate_in_another(): void
    {
        $contents = "ticket_number,name\n000001,Juan\n";
        $other = Raffle::factory()->create();

        $this->actingAs($this->admin())->import(['file' => $this->csv($contents)])->assertCreated();

        $this->actingAs($this->admin())
            ->post("/api/raffles/{$other->id}/participants/import/preview", ['file' => $this->csv($contents)], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.already_imported', false)
            ->assertJsonPath('data.existing_count', 0);
    }

    public function test_a_visitor_imports_as_the_administrator(): void
    {
        // No sign-in screen: the request is adopted by the admin account.
        $this->admin();
        $file = $this->csv("ticket_number\n000001\n");

        $this->import(['file' => $file])->assertCreated();

        $this->assertSame(1, $this->raffle->participants()->count());
    }
}
