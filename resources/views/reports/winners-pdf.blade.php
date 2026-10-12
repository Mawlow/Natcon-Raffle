{{-- The winner report as a PDF: one raffle per page, black on white, like the print view. --}}
<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        @page { margin: 14mm; }
        body { font-family: 'DejaVu Sans', sans-serif; font-size: 10px; color: #111; }
        .page { page-break-after: always; }
        .page:last-child { page-break-after: auto; }
        .eyebrow { font-size: 8px; letter-spacing: 3px; text-transform: uppercase; color: #666; }
        h1 { font-size: 20px; margin: 2px 0 0; }
        .sub { color: #555; margin: 2px 0 10px; }
        .rule { border-bottom: 2px solid #111; margin-bottom: 10px; }
        .details { width: 100%; margin-bottom: 12px; }
        .details td { padding: 2px 12px 2px 0; vertical-align: top; }
        .label { font-size: 7px; letter-spacing: 1px; text-transform: uppercase; color: #777; }
        table.winners { width: 100%; border-collapse: collapse; }
        table.winners th { text-align: left; border-bottom: 2px solid #111; padding: 5px 6px 5px 0; font-size: 9px; }
        table.winners td { border-bottom: 1px solid #ccc; padding: 5px 6px 5px 0; vertical-align: top; }
        .sign { width: 100%; margin-top: 36px; }
        .sign td { width: 50%; padding-right: 30px; }
        .line { border-bottom: 1px solid #111; height: 26px; }
        .muted { color: #777; }
    </style>
</head>
<body>
@foreach ($reports as $report)
    <div class="page">
        <div class="eyebrow">{{ $title }} · Winners Report</div>
        <h1>{{ $report['name'] }}</h1>
        <div class="sub">{{ $report['type'] }} · {{ $report['status'] }}</div>
        <div class="rule"></div>

        <table class="details">
            <tr>
                <td><div class="label">Prizes</div>{{ $report['prizes'] ? implode(', ', $report['prizes']) : '—' }}</td>
                <td><div class="label">Who can win</div>{{ $report['who_can_win'] }}</td>
                <td><div class="label">Winners</div>{{ $report['winners_drawn'] }} of {{ $report['winners_count'] }}</td>
                <td><div class="label">Participants</div>{{ number_format($report['participants_count']) }}</td>
            </tr>
        </table>

        <table class="winners">
            <thead>
                <tr>
                    <th>#</th><th>Prize</th><th>Name</th><th>Ticket</th><th>Phone</th><th>Tag</th><th>Day</th><th>Drawn</th><th style="width: 90px">Signature</th>
                </tr>
            </thead>
            <tbody>
            @forelse ($report['winners'] as $winner)
                <tr>
                    <td><strong>{{ $winner['position'] }}</strong></td>
                    <td>{{ $winner['prize'] ?? '—' }}</td>
                    <td><strong>{{ $winner['name'] ?? '—' }}</strong></td>
                    <td>{{ $winner['ticket_number'] }}</td>
                    <td>{{ $winner['phone'] ?? '—' }}</td>
                    <td>{{ $winner['tag'] ?? '—' }}</td>
                    <td>{{ $winner['event_day'] ?? '—' }}</td>
                    <td>{{ $winner['drawn_local'] ?? '—' }}</td>
                    <td></td>
                </tr>
            @empty
                <tr><td colspan="9" class="muted">No winners drawn yet.</td></tr>
            @endforelse
            </tbody>
        </table>

        <table class="sign">
            <tr>
                <td><div class="line"></div><div class="muted">Prepared by</div></td>
                <td><div class="line"></div><div class="muted">Checked by</div></td>
            </tr>
        </table>
        <p class="muted" style="margin-top: 14px">Downloaded {{ $printed }}</p>
    </div>
@endforeach
</body>
</html>
