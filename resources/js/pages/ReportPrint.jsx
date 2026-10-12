import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import api, { parseError } from '../lib/api';
import { DISPLAY_TITLE, formatDateTime, formatNumber } from '../lib/format';

/**
 * The winner report, ready for paper: black on white, one raffle per page,
 * with its details, every winner and lines to sign. `?raffle=ID` prints one
 * raffle; without it, every raffle that has winners. The browser's print
 * window can also save it as a PDF.
 */
export default function ReportPrint() {
    const [searchParams] = useSearchParams();
    const raffleId = searchParams.get('raffle');
    const [reports, setReports] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const request = raffleId
            ? api.get(`/reports/${raffleId}`).then(({ data }) => [data.data])
            : api.get('/reports').then(({ data }) => data.data.filter((report) => report.winners.length > 0).reverse());
        request
            .then(setReports)
            .catch((failure) => setError(parseError(failure, 'The report could not be loaded.').message));
    }, [raffleId]);

    useEffect(() => {
        const title = document.title;
        document.title = reports?.length === 1 ? `${reports[0].name} — Winners` : `${DISPLAY_TITLE} — Winners`;
        return () => { document.title = title; };
    }, [reports]);

    const printed = new Date().toISOString();

    return (
        <div className="report-print min-h-screen bg-white text-black">
            <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-white/95 px-6 py-3 backdrop-blur">
                <p className="flex-1 text-sm text-neutral-600">
                    Print it, or choose <strong>Save as PDF</strong> in the print window to keep a copy on this device.
                </p>
                <button
                    type="button"
                    onClick={() => window.print()}
                    disabled={!reports?.length}
                    className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                    <Printer size={16} />
                    Print
                </button>
            </div>

            <main className="mx-auto max-w-5xl px-6 py-8">
                {error && <p className="text-red-700">{error}</p>}
                {!reports && !error && <p className="text-neutral-500">Loading the report…</p>}
                {reports?.length === 0 && <p className="text-neutral-500">No winners have been drawn yet.</p>}

                {reports?.map((report) => (
                    <section key={report.id} className="report-page mb-12">
                        <header className="border-b-2 border-black pb-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">{DISPLAY_TITLE} · Winners Report</p>
                            <h1 className="mt-1 text-2xl font-bold">{report.name}</h1>
                            <p className="mt-0.5 text-sm text-neutral-600">{report.type} · {report.status}</p>
                        </header>

                        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
                            <PrintDetail label="Prizes" value={report.prizes.length ? report.prizes.join(', ') : '—'} />
                            <PrintDetail label="Who can win" value={report.who_can_win} />
                            <PrintDetail label="Winners" value={`${formatNumber(report.winners_drawn)} of ${formatNumber(report.winners_count)}`} />
                            <PrintDetail label="Participants" value={formatNumber(report.participants_count)} />
                            <PrintDetail label="Created" value={formatDateTime(report.created_at)} />
                            <PrintDetail label="Completed" value={report.completed_at ? formatDateTime(report.completed_at) : '—'} />
                        </dl>

                        <table className="mt-5 w-full border-collapse text-sm">
                            <thead>
                                <tr className="border-b-2 border-black text-left">
                                    <th className="py-2 pr-3">#</th>
                                    <th className="py-2 pr-3">Prize</th>
                                    <th className="py-2 pr-3">Name</th>
                                    <th className="py-2 pr-3">Ticket</th>
                                    <th className="py-2 pr-3">Phone</th>
                                    <th className="py-2 pr-3">Tag</th>
                                    <th className="py-2 pr-3">Day</th>
                                    <th className="py-2">Signature</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.winners.length === 0 ? (
                                    <tr><td colSpan={8} className="py-4 text-neutral-500">No winners drawn yet.</td></tr>
                                ) : report.winners.map((winner) => (
                                    <tr key={winner.position} className="border-b border-neutral-300 align-top">
                                        <td className="py-2 pr-3 font-semibold">{winner.position}</td>
                                        <td className="py-2 pr-3">{winner.prize ?? '—'}</td>
                                        <td className="py-2 pr-3 font-semibold">{winner.name ?? '—'}</td>
                                        <td className="py-2 pr-3 tabular-nums">{winner.ticket_number}</td>
                                        <td className="py-2 pr-3">{winner.phone ?? '—'}</td>
                                        <td className="py-2 pr-3">{winner.tag ?? '—'}</td>
                                        <td className="whitespace-nowrap py-2 pr-3 font-semibold">{winner.event_day ?? '—'}</td>
                                        <td className="w-40 py-2" />
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="mt-12 grid grid-cols-2 gap-12 text-sm">
                            {['Prepared by', 'Checked by'].map((role) => (
                                <div key={role}>
                                    <div className="border-b border-black pb-8" />
                                    <p className="mt-1 text-neutral-600">{role}</p>
                                </div>
                            ))}
                        </div>

                        <p className="mt-6 text-xs text-neutral-500">Printed {formatDateTime(printed)}</p>
                    </section>
                ))}
            </main>
        </div>
    );
}

function PrintDetail({ label, value }) {
    return (
        <div>
            <dt className="text-[0.68rem] font-semibold uppercase tracking-wider text-neutral-500">{label}</dt>
            <dd className="font-medium">{value}</dd>
        </div>
    );
}
