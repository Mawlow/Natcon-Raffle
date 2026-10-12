<?php

namespace App\Services;

use App\Enums\ParticipantStatus;
use App\Models\Participant;
use App\Models\ParticipantImport;
use App\Models\Raffle;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Parses, validates and commits participant CSV uploads for a single raffle.
 *
 * Every read and write here is scoped to the raffle the file was uploaded to,
 * so the same ticket number may appear in two different raffles.
 *
 * Ticket numbers are treated as strings throughout so that leading zeros
 * ("000001") survive the round trip to MySQL and back.
 */
class ParticipantImportService
{
    public const MAX_ROWS = 100000;

    /**
     * Characters a ticket number may contain.
     *
     * Real ticket numbers carry prefixes and punctuation — `#01`, `A-1`,
     * `VIP/002`, `TBL 12` — so the set is wider than plain alphanumerics. It
     * still excludes quotes, angle brackets, commas and control characters, so
     * a ticket is always safe to print on the projector and to match exactly.
     * At least one letter or digit is required, so `---` is not a ticket.
     */
    public const TICKET_PATTERN = '/^(?=.*[A-Za-z0-9])[A-Za-z0-9 #._\/-]{1,64}$/';

    /** Header aliases accepted for each known column. */
    /**
     * Words in a heading that mean the column is not the ticket number itself,
     * even when it mentions a ticket: "Ticket ID", "Ticket Image File",
     * "Ticket Type" or "Ticket Count" are not what gets drawn.
     */
    protected const NOT_A_TICKET = ['id', 'name', 'file', 'image', 'img', 'qr', 'url', 'link', 'type', 'status', 'count', 'total', 'price', 'amount', 'qty', 'quantity', 'date', 'time'];

    /** What a developers cell says when the participant qualified under none. */
    protected const NO_DEVELOPER = '/^(without|no) developers?$|^(none|n\/?a|-+)$/i';

    /** How far down the file to look for the heading row. */
    protected const HEADER_SEARCH_ROWS = 50;

    protected const COLUMN_ALIASES = [
        'ticket_number' => ['ticket_number', 'ticket', 'ticket no', 'ticket number', 'ticketno', 'ticket_no', 'ticket nos', 'ticket num', 'ticket code', 'ticket #', 'raffle ticket', 'raffle number', 'raffle no', 'entry number', 'entry no', 'stub number', 'stub no', 'control no', 'control number', 'control #', 'number'],
        // "Ticket Name" is the name printed on the ticket, so it is what the
        // screens show — ahead of an "Agent Name" or other name column.
        'name' => ['ticket name', 'name', 'full_name', 'full name', 'participant', 'participant_name', 'attendee', 'attendee name', 'guest', 'guest name', 'customer', 'customer name', 'client', 'client name', 'registrant', 'winner name'],
        'email' => ['email', 'email_address', 'e-mail', 'email address', 'e-mail address'],
        'phone' => ['phone', 'mobile', 'contact', 'phone_number', 'contact_number', 'mobile number', 'mobile no', 'cellphone', 'cell', 'tel', 'telephone'],
        'category' => ['tag', 'tags', 'category', 'type', 'segment', 'group'],
        'developers' => ['qualified developers (tags)', 'qualified developers', 'developers', 'developer', 'developer tags', 'qualified developer'],
        'status' => ['status'],
    ];

    /**
     * Read a CSV into a structured preview: valid rows, invalid rows and duplicates.
     * Nothing is written to the database here.
     */
    public function preview(Raffle $raffle, UploadedFile $file, int $previewLimit = 25): array
    {
        [$header, $rows, $delimiter] = $this->readCsv($file->getRealPath());

        $map = $this->mapHeader($header);
        $nameParts = isset($map['name']) ? [] : $this->nameParts($header, $map);

        if (! isset($map['ticket_number'])) {
            $found = array_values(array_filter($header, 'filled'));

            throw new RuntimeException(
                'The CSV must contain a "ticket_number" column. '.
                ($found === []
                    ? 'No column headings were found on the first row.'
                    : 'The columns found were: '.implode(', ', array_map(fn ($label) => '"'.$label.'"', array_slice($found, 0, 20))).'.')
            );
        }

        $known = array_keys(self::COLUMN_ALIASES);
        $extraColumns = [];

        foreach ($header as $index => $label) {
            if (! in_array($index, $map, true) && ! in_array($index, $nameParts, true) && filled($label)) {
                $extraColumns[$index] = $this->normaliseKey($label);
            }
        }

        $valid = [];
        $invalid = [];
        $seen = [];
        $duplicatesInFile = [];

        foreach ($rows as $lineNumber => $row) {
            $ticket = $this->cell($row, $map['ticket_number'] ?? null);

            if (blank($ticket)) {
                $invalid[] = ['line' => $lineNumber, 'ticket_number' => null, 'reason' => 'Missing ticket number'];

                continue;
            }

            // Runs of whitespace inside a ticket are collapsed so "A  1" and
            // "A 1" cannot become two different tickets.
            $ticket = preg_replace('/\s+/', ' ', $ticket);

            if (! preg_match(self::TICKET_PATTERN, $ticket)) {
                $invalid[] = [
                    'line' => $lineNumber,
                    'ticket_number' => $ticket,
                    'reason' => $this->ticketRejectionReason($ticket),
                ];

                continue;
            }

            if (isset($seen[$ticket])) {
                $duplicatesInFile[] = ['line' => $lineNumber, 'ticket_number' => $ticket, 'reason' => 'Duplicate ticket number in file (first seen on line '.$seen[$ticket].')'];

                continue;
            }

            $email = $this->cell($row, $map['email'] ?? null);

            if (filled($email) && ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $invalid[] = ['line' => $lineNumber, 'ticket_number' => $ticket, 'reason' => 'Invalid email address'];

                continue;
            }

            $status = strtoupper((string) $this->cell($row, $map['status'] ?? null));

            if (blank($status) || ! in_array($status, ParticipantStatus::values(), true)) {
                $status = ParticipantStatus::Active->value;
            }

            $metadata = [];

            foreach ($extraColumns as $index => $key) {
                $value = $this->cell($row, $index);

                if (filled($value)) {
                    $metadata[$key] = $value;
                }
            }

            $seen[$ticket] = $lineNumber;

            $name = $this->cell($row, $map['name'] ?? null);

            if ($name === null && $nameParts !== []) {
                $parts = array_filter(array_map(fn ($index) => $this->cell($row, $index), $nameParts));
                $name = $parts === [] ? null : implode(' ', $parts);
            }

            $valid[] = [
                'line' => $lineNumber,
                'ticket_number' => $ticket,
                'name' => $name,
                'email' => $email,
                'phone' => $this->cell($row, $map['phone'] ?? null),
                'category' => $this->cell($row, $map['category'] ?? null),
                'developers' => $this->developers($this->cell($row, $map['developers'] ?? null)),
                'status' => $status,
                'metadata' => $metadata === [] ? null : $metadata,
            ];
        }

        $existing = $this->existingTicketNumbers($raffle, array_column($valid, 'ticket_number'));

        $fileHash = hash_file('sha256', $file->getRealPath());
        $previousImport = ParticipantImport::query()
            ->where('raffle_id', $raffle->id)
            ->where('file_hash', $fileHash)
            ->latest('id')
            ->first();

        return [
            'file_hash' => $fileHash,
            'original_filename' => $file->getClientOriginalName(),
            'delimiter' => $this->delimiterName($delimiter),
            'detected_columns' => array_values(array_intersect($known, array_keys($map))),
            'extra_columns' => array_values($extraColumns),
            'total_rows' => count($rows),
            'valid_count' => count($valid),
            'invalid_count' => count($invalid),
            'duplicate_in_file_count' => count($duplicatesInFile),
            'existing_count' => count($existing),
            'new_count' => count($valid) - count($existing),
            'already_imported' => $previousImport !== null,
            'already_imported_at' => $previousImport?->created_at?->toIso8601String(),
            'preview_rows' => array_map(
                fn (array $row) => $this->withExistsFlag($row, $existing),
                array_slice($valid, 0, $previewLimit),
            ),
            'invalid_rows' => array_slice(array_merge($invalid, $duplicatesInFile), 0, $previewLimit),
            'rows' => $valid,
        ];
    }

    /**
     * Commit a previously previewed file.
     *
     * @param  'skip'|'update'  $onDuplicate  What to do with ticket numbers that already exist.
     * @param  bool  $keepStatus  On update, leave an existing ticket's status (winner, absent…) as it is.
     */
    public function import(Raffle $raffle, UploadedFile $file, ?User $user, string $onDuplicate = 'skip', bool $keepStatus = false): ParticipantImport
    {
        $preview = $this->preview($raffle, $file);
        $rows = $preview['rows'];

        if ($rows === []) {
            throw new RuntimeException('The CSV contains no importable rows.');
        }

        if (count($rows) > self::MAX_ROWS) {
            throw new RuntimeException('The CSV exceeds the maximum of '.number_format(self::MAX_ROWS).' rows.');
        }

        $imported = 0;
        $updated = 0;
        $skipped = $preview['invalid_count'] + $preview['duplicate_in_file_count'];

        DB::transaction(function () use ($raffle, $rows, $onDuplicate, $keepStatus, &$imported, &$updated, &$skipped) {
            foreach (array_chunk($rows, 500) as $chunk) {
                $tickets = array_column($chunk, 'ticket_number');
                $existing = Participant::query()
                    ->forRaffle($raffle)
                    ->whereIn('ticket_number', $tickets)
                    ->pluck('id', 'ticket_number');

                $insert = [];
                $now = now();

                foreach ($chunk as $row) {
                    $payload = [
                        'raffle_id' => $raffle->id,
                        'ticket_number' => $row['ticket_number'],
                        'name' => $row['name'],
                        'email' => $row['email'],
                        'phone' => $row['phone'],
                        'category' => $row['category'],
                        'developers' => $row['developers'] === null ? null : json_encode($row['developers']),
                        'status' => $row['status'],
                        'metadata' => $row['metadata'] === null ? null : json_encode($row['metadata']),
                    ];

                    if (isset($existing[$row['ticket_number']])) {
                        if ($onDuplicate === 'update') {
                            Participant::query()
                                ->whereKey($existing[$row['ticket_number']])
                                ->update(($keepStatus ? array_diff_key($payload, ['status' => true]) : $payload) + ['updated_at' => $now]);
                            $updated++;
                        } else {
                            $skipped++;
                        }

                        continue;
                    }

                    $insert[] = $payload + ['created_at' => $now, 'updated_at' => $now];
                    $imported++;
                }

                if ($insert !== []) {
                    DB::table('participants')->insert($insert);
                }
            }
        });

        return ParticipantImport::create([
            'raffle_id' => $raffle->id,
            'user_id' => $user?->id,
            'original_filename' => $preview['original_filename'],
            'file_hash' => $preview['file_hash'],
            'total_rows' => $preview['total_rows'],
            'imported_rows' => $imported,
            'updated_rows' => $updated,
            'skipped_rows' => $skipped,
            'status' => 'COMPLETED',
            'summary' => [
                'detected_columns' => $preview['detected_columns'],
                'extra_columns' => $preview['extra_columns'],
                'invalid_rows' => $preview['invalid_rows'],
                'on_duplicate' => $onDuplicate,
            ],
        ]);
    }

    /**
     * Read the upload into a header row plus data rows.
     *
     * Spreadsheet exports are not reliably comma separated — Excel uses
     * semicolons in several locales, and "Save as CSV" from Sheets or a copy
     * out of a spreadsheet often yields tabs — so the delimiter is sniffed from
     * the header line rather than assumed.
     *
     * @return array{0: array<int, string>, 1: array<int, array<int, string>>, 2: string}
     */
    protected function readCsv(string $path): array
    {
        $contents = @file_get_contents($path);

        if ($contents === false) {
            throw new RuntimeException('The uploaded file could not be read.');
        }

        $contents = $this->toUtf8($contents);
        $delimiter = $this->sniffDelimiter($contents);

        $handle = fopen('php://temp', 'r+');
        fwrite($handle, $contents);
        rewind($handle);

        $lines = [];
        $line = 0;

        while (($row = fgetcsv($handle, 0, $delimiter, '"', '')) !== false) {
            $line++;

            if ($row === [null] || count(array_filter($row, fn ($cell) => filled(trim((string) $cell)))) === 0) {
                continue;
            }

            $lines[$line] = $row;
        }

        fclose($handle);

        if ($lines === []) {
            throw new RuntimeException('The CSV appears to be empty.');
        }

        $headerLine = $this->findHeaderLine($lines);
        $header = array_map(fn ($cell) => trim((string) $cell), $lines[$headerLine]);

        $rows = array_filter($lines, fn ($line) => $line > $headerLine, ARRAY_FILTER_USE_KEY);

        return [$header, $rows, $delimiter];
    }

    /**
     * Spreadsheet exports often open with a title, a subtitle or a block of
     * totals before the real column headings, so the heading row is the first
     * one near the top that names a ticket number column. A file with no such
     * row falls back to its first row, which then produces the usual
     * "columns found" error.
     *
     * @param  array<int, array<int, string>>  $lines
     */
    protected function findHeaderLine(array $lines): int
    {
        // A heading row has more than one heading, which rules out a title
        // line that merely mentions tickets. Exact headings are looked for
        // first, then any heading that speaks of a ticket.
        $candidates = array_filter(
            array_slice($lines, 0, self::HEADER_SEARCH_ROWS, true),
            fn ($row) => count(array_filter($row, fn ($cell) => filled(trim((string) $cell)))) >= 2,
        );

        foreach ([false, true] as $guessTicket) {
            foreach ($candidates as $line => $row) {
                $map = $this->mapHeader(array_map(fn ($cell) => trim((string) $cell), $row), $guessTicket);

                if (isset($map['ticket_number'])) {
                    return $line;
                }
            }
        }

        return array_key_first($lines);
    }

    /**
     * Normalise the upload to UTF-8 without a byte-order mark.
     *
     * Excel's "Unicode Text" export is UTF-16, which every byte-oriented
     * function here would otherwise read as gibberish.
     */
    protected function toUtf8(string $contents): string
    {
        if (str_starts_with($contents, "\xFF\xFE") || str_starts_with($contents, "\xFE\xFF")) {
            $encoding = str_starts_with($contents, "\xFF\xFE") ? 'UTF-16LE' : 'UTF-16BE';
            $converted = @mb_convert_encoding(substr($contents, 2), 'UTF-8', $encoding);

            if ($converted !== false) {
                $contents = $converted;
            }
        }

        // UTF-8 BOM, which would otherwise glue itself to the first header name.
        return preg_replace('/^\xEF\xBB\xBF/', '', $contents) ?? $contents;
    }

    /**
     * Pick the delimiter that splits the opening lines into the most columns.
     * Several lines are sampled because the first may be a one-cell title.
     */
    protected function sniffDelimiter(string $contents): string
    {
        $sample = array_slice(array_filter(preg_split('/\r\n|\r|\n/', $contents, 21) ?: [], 'filled'), 0, 20);

        if ($sample === []) {
            return ',';
        }

        $best = ',';
        $bestCount = 0;

        foreach ([',', "\t", ';', '|'] as $candidate) {
            $count = max(array_map(fn ($line) => count(str_getcsv($line, $candidate, '"', '')), $sample));

            if ($count > $bestCount) {
                $best = $candidate;
                $bestCount = $count;
            }
        }

        return $best;
    }

    /** @return array<string, int> Canonical column name => column index. */
    protected function mapHeader(array $header, bool $guessTicket = true): array
    {
        $map = [];
        $keys = array_map(fn ($label) => $this->normaliseKey((string) $label), $header);

        // Aliases are tried in order, so the most specific heading wins even
        // when a looser one sits further left ("Ticket No." over "Number").
        foreach (self::COLUMN_ALIASES as $canonical => $aliases) {
            foreach ($aliases as $alias) {
                $index = array_search($this->normaliseKey($alias), $keys, true);

                if ($index !== false && ! in_array($index, $map, true)) {
                    $map[$canonical] = $index;
                    break;
                }
            }
        }

        // Any other heading that speaks of a ticket — "Raffle Ticket No.",
        // "Ticket Serial" — unless it names something about the ticket rather
        // than the ticket itself ("Ticket ID", "Ticket Image File").
        if ($guessTicket && ! isset($map['ticket_number'])) {
            foreach ($keys as $index => $key) {
                $words = explode('_', $key);

                // A long sentence that mentions tickets is a note, not a heading.
                if (count($words) > 4) {
                    continue;
                }

                if (in_array('ticket', $words, true) && array_intersect($words, self::NOT_A_TICKET) === [] && ! in_array($index, $map, true)) {
                    $map['ticket_number'] = $index;
                    break;
                }
            }
        }

        // Second pass for the descriptive headings spreadsheets tend to carry:
        // "Attendee / Couple Name" is a name, "Contact Phone" is a phone. Only
        // the optional columns take part — the ticket number is never guessed
        // from a heading that does not mention a ticket, because guessing it
        // wrong would silently raffle the wrong values.
        foreach (['name', 'email', 'phone', 'category'] as $canonical) {
            if (isset($map[$canonical])) {
                continue;
            }

            foreach ($keys as $index => $key) {
                if (in_array($index, $map, true) || in_array($key, ['first_name', 'last_name', 'middle_name', 'file_name'], true)) {
                    continue;
                }

                if (str_ends_with($key, '_'.$canonical)) {
                    $map[$canonical] = $index;
                    break;
                }
            }
        }

        return $map;
    }

    /**
     * With no single name column, a name split over "First Name", "Middle
     * Name" and "Last Name" columns is joined back together, in that order.
     *
     * @return array<int, int> Column indexes, in the order to join them.
     */
    protected function nameParts(array $header, array $map): array
    {
        $keys = array_map(fn ($label) => $this->normaliseKey((string) $label), $header);
        $parts = [];

        foreach ([['first_name', 'firstname', 'given_name', 'first'], ['middle_name', 'middlename', 'middle_initial', 'mi'], ['last_name', 'lastname', 'surname', 'family_name', 'last']] as $aliases) {
            foreach ($aliases as $alias) {
                $index = array_search($alias, $keys, true);

                if ($index !== false && ! in_array($index, $map, true)) {
                    $parts[] = $index;
                    break;
                }
            }
        }

        // A lone middle name is not a name.
        return count($parts) >= 2 || (count($parts) === 1 && ! in_array($keys[$parts[0]], ['middle_name', 'middlename', 'middle_initial', 'mi'], true)) ? $parts : [];
    }

    /**
     * "Cebu Landmasters | Filinvest" into ['Cebu Landmasters', 'Filinvest'].
     * Commas are left alone because company names carry them ("Ayala Land, Inc.").
     *
     * @return array<int, string>|null
     */
    protected function developers(?string $cell): ?array
    {
        if ($cell === null) {
            return null;
        }

        $names = [];

        foreach (preg_split('/\s*[|;\r\n]+\s*/', $cell) ?: [] as $name) {
            $name = preg_replace('/\s+/', ' ', trim($name));

            if ($name !== '' && ! preg_match(self::NO_DEVELOPER, $name) && ! in_array($name, $names, true)) {
                $names[] = $name;
            }
        }

        return $names === [] ? null : $names;
    }

    /** Say which characters were the problem, rather than just that there was one. */
    protected function ticketRejectionReason(string $ticket): string
    {
        if (mb_strlen($ticket) > 64) {
            return 'Ticket number is longer than 64 characters';
        }

        if (! preg_match('/[A-Za-z0-9]/', $ticket)) {
            return 'Ticket number contains no letters or digits';
        }

        $offending = preg_split('//u', preg_replace('/[A-Za-z0-9 #._\/-]/', '', $ticket), -1, PREG_SPLIT_NO_EMPTY);
        $offending = array_values(array_unique($offending ?: []));

        return $offending === []
            ? 'Ticket number contains unsupported characters'
            : 'Ticket number contains unsupported characters: '.implode(' ', array_slice($offending, 0, 5));
    }

    protected function delimiterName(string $delimiter): string
    {
        return match ($delimiter) {
            "\t" => 'tab',
            ';' => 'semicolon',
            '|' => 'pipe',
            default => 'comma',
        };
    }

    protected function normaliseKey(string $label): string
    {
        // "Ticket No." and "Ticket No" are the same heading.
        return trim(preg_replace('/[^a-z0-9]+/', '_', strtolower(trim($label))) ?? '', '_');
    }

    protected function cell(array $row, ?int $index): ?string
    {
        if ($index === null || ! array_key_exists($index, $row)) {
            return null;
        }

        $value = trim((string) $row[$index]);

        return $value === '' ? null : $value;
    }

    /** @return array<int, string> */
    protected function existingTicketNumbers(Raffle $raffle, array $tickets): array
    {
        $found = [];

        foreach (array_chunk($tickets, 2000) as $chunk) {
            $found = array_merge($found, Participant::query()
                ->forRaffle($raffle)
                ->whereIn('ticket_number', $chunk)
                ->pluck('ticket_number')
                ->all());
        }

        return $found;
    }

    protected function withExistsFlag(array $row, array $existing): array
    {
        $row['already_exists'] = in_array($row['ticket_number'], $existing, true);
        unset($row['metadata']);

        return $row;
    }
}
