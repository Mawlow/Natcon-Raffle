<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Raffle;
use App\Models\Winner;
use App\Support\EventDay;
use Illuminate\Http\JsonResponse;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Request;
use PhpOffice\PhpWord\IOFactory;
use PhpOffice\PhpWord\PhpWord;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Winner reports — the admin dashboard's "Reports": every raffle (pre-draws
 * too) with its details and the full list of its winners, to read, print or
 * download as a spreadsheet (CSV, which Excel opens).
 */
class ReportController extends Controller
{
    /** Every raffle's report, newest first. */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Raffle::class);

        $raffles = Raffle::query()
            ->with(['sourceRaffle:id,name', 'winners.participant', 'winners.prize'])
            ->withCount('participants')
            ->latest('id')
            ->get();

        return response()->json(['data' => $raffles->map(fn (Raffle $raffle) => $this->report($raffle))->values()]);
    }

    /** One raffle's report. */
    public function show(Raffle $raffle): JsonResponse
    {
        $this->authorize('view', $raffle);

        $raffle->load(['sourceRaffle:id,name', 'winners.participant', 'winners.prize'])->loadCount('participants');

        return response()->json(['data' => $this->report($raffle)]);
    }

    /** One raffle's winners, as ?format=csv (default), pdf or docx (Word). */
    public function export(Request $request, Raffle $raffle): Response
    {
        $this->authorize('view', $raffle);

        $raffle->load(['sourceRaffle:id,name', 'winners.participant', 'winners.prize'])->loadCount('participants');

        return $this->download([$raffle], $raffle->slug.'-winners-'.now()->format('Y-m-d'), $this->format($request));
    }

    /** Every raffle's winners in one file, as ?format=csv (default), pdf or docx (Word). */
    public function exportAll(Request $request): Response
    {
        $this->authorize('viewAny', Raffle::class);

        $raffles = Raffle::query()
            ->with(['sourceRaffle:id,name', 'winners.participant', 'winners.prize'])
            ->withCount('participants')
            ->oldest('id')
            ->get();

        return $this->download($raffles->all(), 'natcon-raffle-winners-'.now()->format('Y-m-d'), $this->format($request));
    }

    protected function format(Request $request): string
    {
        $format = strtolower($request->query('format', 'csv'));

        abort_unless(in_array($format, ['csv', 'pdf', 'docx'], true), 422, 'Choose csv, pdf or docx.');

        return $format;
    }

    /** @param array<int, Raffle> $raffles */
    protected function download(array $raffles, string $name, string $format): Response
    {
        if ($format === 'csv') {
            return $this->csv($raffles, $name.'.csv');
        }

        // The PDF and Word files list the raffles that have winners.
        $reports = array_values(array_filter(
            array_map(fn (Raffle $raffle) => $this->report($raffle), $raffles),
            fn (array $report) => $report['winners'] !== [] || count($raffles) === 1,
        ));

        return $format === 'pdf' ? $this->pdf($reports, $name.'.pdf') : $this->word($reports, $name.'.docx');
    }

    /** @param array<int, array<string, mixed>> $reports */
    protected function pdf(array $reports, string $filename): Response
    {
        $html = view('reports.winners-pdf', [
            'reports' => $reports,
            'title' => 'NATCON RAFFLE',
            'printed' => now()->timezone(EventDay::TIMEZONE)->format('M j, Y g:i A'),
        ])->render();

        $pdf = new Dompdf(new Options(['defaultFont' => 'DejaVu Sans', 'isRemoteEnabled' => false]));
        $pdf->loadHtml($html, 'UTF-8');
        $pdf->setPaper('A4', 'landscape');
        $pdf->render();

        return response($pdf->output(), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    /** @param array<int, array<string, mixed>> $reports */
    protected function word(array $reports, string $filename): Response
    {
        $word = new PhpWord;
        $word->setDefaultFontName('Calibri');
        $word->setDefaultFontSize(10);
        $header = ['bold' => true, 'size' => 9];
        $columns = ['#' => 500, 'Prize' => 2400, 'Name' => 2800, 'Ticket' => 1100, 'Phone' => 1600, 'Tag' => 1400, 'Day' => 800, 'Drawn' => 1700, 'Signature' => 1700];

        foreach ($reports as $index => $report) {
            $section = $word->addSection(['orientation' => 'landscape', 'marginTop' => 700, 'marginBottom' => 700, 'marginLeft' => 700, 'marginRight' => 700]);

            $section->addText('NATCON RAFFLE · WINNERS REPORT', ['size' => 8, 'color' => '666666']);
            $section->addText($report['name'], ['bold' => true, 'size' => 18]);
            $section->addText($report['type'].' · '.$report['status'], ['color' => '555555']);
            $section->addText(implode('     ', [
                'Prizes: '.($report['prizes'] ? implode(', ', $report['prizes']) : '—'),
                'Who can win: '.$report['who_can_win'],
                'Winners: '.$report['winners_drawn'].' of '.$report['winners_count'],
                'Participants: '.number_format($report['participants_count']),
            ]), ['size' => 9]);
            $section->addTextBreak();

            $table = $section->addTable(['borderBottomSize' => 6, 'borderBottomColor' => 'BBBBBB', 'insideHBorderSize' => 6, 'insideHBorderColor' => 'CCCCCC', 'cellMargin' => 60]);
            $table->addRow();
            foreach ($columns as $title => $width) {
                $table->addCell($width, ['borderBottomSize' => 12, 'borderBottomColor' => '111111'])->addText($title, $header);
            }

            foreach ($report['winners'] as $winner) {
                $table->addRow();
                foreach ([
                    (string) $winner['position'], $winner['prize'] ?? '—', $winner['name'] ?? '—', $winner['ticket_number'],
                    $winner['phone'] ?? '—', $winner['tag'] ?? '—', $winner['event_day'] ?? '—', $winner['drawn_local'] ?? '—', '',
                ] as $column => $text) {
                    $table->addCell(array_values($columns)[$column])->addText($text, in_array($column, [0, 2], true) ? ['bold' => true] : []);
                }
            }

            if ($report['winners'] === []) {
                $section->addText('No winners drawn yet.', ['color' => '777777']);
            }

            $section->addTextBreak(2);
            $sign = $section->addTable();
            $sign->addRow();
            foreach (['Prepared by', 'Checked by'] as $role) {
                $cell = $sign->addCell(5500);
                $cell->addText('______________________________');
                $cell->addText($role, ['color' => '777777']);
            }
        }

        $path = tempnam(sys_get_temp_dir(), 'report');
        IOFactory::createWriter($word, 'Word2007')->save($path);

        return response()->download($path, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ])->deleteFileAfterSend();
    }

    /** @return array<string, mixed> */
    protected function report(Raffle $raffle): array
    {
        return [
            'id' => $raffle->id,
            'name' => $raffle->name,
            'type' => $raffle->is_predraw ? 'Pre-draw' : 'Raffle',
            'status' => $raffle->status->value,
            'is_archived' => $raffle->archived_at !== null,
            'source_raffle' => $raffle->sourceRaffle?->name,
            'prizes' => $this->prizes($raffle),
            'who_can_win' => $raffle->is_predraw ? 'Chosen before the event' : $raffle->drawPoolLabel(),
            'participants_count' => (int) $raffle->participants_count,
            'winners_count' => (int) $raffle->winners_count,
            'winners_drawn' => $raffle->winners->count(),
            'created_at' => $raffle->created_at?->toIso8601String(),
            'completed_at' => $raffle->completed_at?->toIso8601String(),
            'winners' => $raffle->winners->map(fn (Winner $winner) => $this->winner($winner, $raffle))->values()->all(),
        ];
    }

    /**
     * The raffle's prizes as one line each: its prize list, its pre-selected
     * prizes, or its single prize.
     *
     * @return array<int, string>
     */
    protected function prizes(Raffle $raffle): array
    {
        if ($raffle->hasStagedWinners()) {
            $counts = array_count_values(array_column($raffle->stagedWinners(), 'prize_name'));

            return array_map(fn ($name, $count) => "{$name} × {$count}", array_keys($counts), $counts);
        }

        $tiers = $raffle->prizeList();

        if ($tiers !== []) {
            return array_map(fn ($prize) => $this->prizeText($prize['prize_type'], $prize['prize_name'], $prize['prize_value'], $prize['prize_currency'])." × {$prize['winners_count']}", $tiers);
        }

        $single = $this->prizeText($raffle->prize_type, $raffle->prize_name, $raffle->prize_value, $raffle->prize_currency);

        return $single ? ["{$single} × {$raffle->winners_count}"] : [];
    }

    /** A prize as the screens show it: "₱1,000 CASH PRIZE" for cash, the item's name otherwise. */
    protected function prizeText(?string $type, ?string $name, $value, ?string $currency): ?string
    {
        if (($type ?? 'cash') === 'cash' && $value !== null && (float) $value > 0) {
            $symbol = ['PHP' => '₱', 'USD' => '$', 'EUR' => '€'][$currency ?? 'PHP'] ?? (($currency ?? 'PHP').' ');
            $amount = fmod((float) $value, 1.0) == 0.0 ? number_format((float) $value) : number_format((float) $value, 2);

            return "{$symbol}{$amount} CASH PRIZE";
        }

        return $name ?: null;
    }

    /** @return array<string, mixed> */
    protected function winner(Winner $winner, Raffle $raffle): array
    {
        return [
            'position' => (int) $winner->position,
            'prize' => $winner->prize_name
                ?? ($winner->prize
                    ? $this->prizeText($winner->prize->prize_type, $winner->prize->prize_name, $winner->prize->prize_value, $winner->prize->prize_currency)
                    : $this->prizeText($raffle->prize_type, $raffle->prize_name, $raffle->prize_value, $raffle->prize_currency)),
            'ticket_number' => $winner->ticket_number,
            'name' => $winner->participant?->name,
            'phone' => $winner->participant?->phone,
            'email' => $winner->participant?->email,
            'tag' => $winner->participant?->category,
            'developers' => implode(', ', (array) ($winner->participant?->developers ?? [])),
            'drawn_at' => $winner->drawn_at?->toIso8601String(),
            // Day 1 (the 18th) or Day 2 (the 19th), in Philippine time.
            'event_day' => EventDay::of($winner->drawn_at),
            'drawn_local' => $winner->drawn_at?->copy()->timezone(EventDay::TIMEZONE)->format('M j, g:i A'),
        ];
    }

    /** @param array<int, Raffle> $raffles */
    protected function csv(array $raffles, string $filename): StreamedResponse
    {
        return response()->streamDownload(function () use ($raffles) {
            $handle = fopen('php://output', 'w');
            // A byte-order mark, so Excel reads names with ñ and accents correctly.
            fwrite($handle, "\xEF\xBB\xBF");
            fputcsv($handle, ['Raffle', 'Type', 'Winner #', 'Prize', 'Name', 'Ticket number', 'Phone', 'Email', 'Tag', 'Developers', 'Day', 'Drawn at']);

            foreach ($raffles as $raffle) {
                foreach ($raffle->winners as $winner) {
                    $row = $this->winner($winner, $raffle);
                    fputcsv($handle, [
                        $raffle->name,
                        $raffle->is_predraw ? 'Pre-draw' : 'Raffle',
                        $row['position'],
                        $row['prize'],
                        $row['name'],
                        // Prefixed so spreadsheet apps keep the leading zeros.
                        "\t".$row['ticket_number'],
                        $row['phone'],
                        $row['email'],
                        $row['tag'],
                        $row['developers'],
                        $row['event_day'],
                        $winner->drawn_at?->copy()->timezone(EventDay::TIMEZONE)->format('Y-m-d H:i'),
                    ]);
                }
            }

            fclose($handle);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}
