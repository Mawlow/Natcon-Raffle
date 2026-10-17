import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, FileType, Loader2, Printer, Search, Trophy } from 'lucide-react';
import api, { parseError } from '../lib/api';
import { downloadFile } from '../lib/download';
import { formatDateTime, formatNumber } from '../lib/format';
import DashboardLayout from '../components/layout/DashboardLayout';
import LoadingState from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import StatusChip from '../components/ui/StatusChip';
import { useToast } from '../context/ToastContext';

/**
 * Winner reports: every raffle — pre-draws too — with its details and the
 * full list of its winners. Each can be downloaded as a spreadsheet (CSV,
 * which Excel opens) or printed (or saved as a PDF from the print window);
 * so can all of them at once.
 */
export default function Reports() {
    const toast = useToast();
    const [reports, setReports] = useState(null);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [type, setType] = useState('all');
    const [downloading, setDownloading] = useState(null);

    useEffect(() => {
        api.get('/reports')
            .then(({ data }) => setReports(data.data))
            .catch((failure) => setError(parseError(failure, 'The reports could not be loaded.').message));
    }, []);

    const shown = useMemo(() => {
        const term = search.trim().toLowerCase();
        return (reports ?? []).filter((report) => (
            (type === 'all' || (type === 'predraw') === (report.type === 'Pre-draw'))
            && (!term || report.name.toLowerCase().includes(term)
                || report.winners.some((winner) => `${winner.name ?? ''} ${winner.ticket_number}`.toLowerCase().includes(term)))
        ));
    }, [reports, search, type]);

    const download = async (key, path, fallback) => {
        setDownloading(key);
        try {
            await downloadFile(path, fallback);
        } catch (failure) {
            toast.error(parseError(failure, 'The file could not be downloaded.').message);
        } finally {
            setDownloading(null);
        }
    };

    const totalWinners = (reports ?? []).reduce((sum, report) => sum + report.winners.length, 0);

    return (
        <DashboardLayout
            title="Winner Reports"
            subtitle="Every raffle with its details and winners — download it or print it."
            actions={(
                <div className="flex flex-wrap gap-2">
                    <a href="/reports/print" target="_blank" rel="noreferrer" className="btn btn-outline">
                        <Printer size={16} />
                        <span className="hidden sm:inline">Print all</span>
                    </a>
                    <DownloadMenu
                        label="Download all"
                        primary
                        busy={downloading === 'all'}
                        disabled={downloading !== null || !totalWinners}
                        onPick={(format) => download('all', `/reports/export?format=${format}`, `natcon-raffle-winners.${format}`)}
                    />
                </div>
            )}
        >
            {reports === null && !error && <LoadingState label="Loading reports" rows={4} />}
            {error && <EmptyState title="Unable to load the reports" description={error} />}

            {reports && (
                <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative min-w-[14rem] flex-1">
                            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim" />
                            <input
                                type="search"
                                className="input pl-9"
                                placeholder="Search a raffle, a winner or a ticket"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-black/40 p-1" role="radiogroup" aria-label="Show">
                            {[['all', 'All'], ['raffle', 'Raffles'], ['predraw', 'Pre-draws']].map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    role="radio"
                                    aria-checked={type === key}
                                    onClick={() => setType(key)}
                                    className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${type === key ? 'bg-gold text-black' : 'text-muted hover:text-white'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {shown.length === 0 ? (
                        <EmptyState title="Nothing to show" description={search ? 'No raffle or winner matches.' : 'No raffle has been played yet. A raffle appears here once its winners are drawn.'} />
                    ) : (
                        <ul className="space-y-4">
                            {shown.map((report) => (
                                <ReportCard
                                    key={report.id}
                                    report={report}
                                    downloading={downloading === report.id}
                                    onDownload={(format) => download(report.id, `/reports/${report.id}/export?format=${format}`, `raffle-${report.id}-winners.${format}`)}
                                />
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </DashboardLayout>
    );
}

function ReportCard({ report, downloading, onDownload }) {
    const [open, setOpen] = useState(false);
    const count = report.winners.length;

    return (
        <li className="panel p-5">
            <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-[14rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-lg font-bold text-white">{report.name}</p>
                        <span className={`chip ${report.type === 'Pre-draw' ? 'border-gold/40 bg-gold/15 text-gold-bright' : 'border-white/10 bg-white/5 text-muted'}`}>{report.type}</span>
                        <StatusChip status={report.status} />
                        {report.is_archived && <span className="chip border-white/10 bg-white/5 text-muted-dim">Archived</span>}
                    </div>

                    <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <Detail label="Prizes" value={report.prizes.length ? report.prizes.join(' · ') : '—'} />
                        <Detail label="Who can win" value={report.who_can_win} />
                        <Detail label="Winners" value={`${formatNumber(report.winners_drawn)} of ${formatNumber(report.winners_count)} drawn`} />
                        <Detail label="Participants" value={formatNumber(report.participants_count)} />
                        <Detail label="Created" value={formatDateTime(report.created_at)} />
                        {report.completed_at && <Detail label="Completed" value={formatDateTime(report.completed_at)} />}
                        {report.source_raffle && <Detail label="Participants from" value={report.source_raffle} />}
                    </dl>
                </div>

                <div className="flex flex-wrap gap-2">
                    <a href={`/reports/print?raffle=${report.id}`} target="_blank" rel="noreferrer" className="btn btn-outline">
                        <Printer size={15} />
                        Print
                    </a>
                    <DownloadMenu
                        label="Download"
                        busy={downloading}
                        disabled={downloading || count === 0}
                        title={count === 0 ? 'No winners yet' : undefined}
                        onPick={onDownload}
                    />
                </div>
            </div>

            {count > 0 ? (
                <div className="mt-4">
                    <button
                        type="button"
                        className="flex items-center gap-2 text-sm font-semibold text-gold transition hover:text-gold-bright"
                        onClick={() => setOpen((value) => !value)}
                        aria-expanded={open}
                    >
                        <Trophy size={15} />
                        {open ? 'Hide' : 'Show'} {count} winner{count === 1 ? '' : 's'}
                        <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
                    </button>

                    {open && (
                        <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                            <table className="w-full min-w-[40rem] text-left text-sm">
                                <thead className="bg-black/40 text-xs uppercase tracking-wider text-muted">
                                    <tr>
                                        <th className="px-3 py-2.5">#</th>
                                        <th className="px-3 py-2.5">Prize</th>
                                        <th className="px-3 py-2.5">Name</th>
                                        <th className="px-3 py-2.5">Ticket</th>
                                        <th className="px-3 py-2.5">Phone</th>
                                        <th className="px-3 py-2.5">Tag</th>
                                        <th className="px-3 py-2.5">Day</th>
                                        <th className="px-3 py-2.5">Drawn</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                    {report.winners.map((winner) => (
                                        <tr key={winner.position}>
                                            <td className="px-3 py-2 font-display font-bold text-gold/80">{winner.position}</td>
                                            <td className="px-3 py-2 text-gold-bright">{winner.prize ?? '—'}</td>
                                            <td className="px-3 py-2 font-semibold text-white">{winner.name ?? '—'}</td>
                                            <td className="tabular px-3 py-2 text-muted">{winner.ticket_number}</td>
                                            <td className="px-3 py-2 text-muted">{winner.phone ?? '—'}</td>
                                            <td className="px-3 py-2 text-muted">{winner.tag ?? '—'}</td>
                                            <td className="whitespace-nowrap px-3 py-2">
                                                {winner.event_day
                                                    ? <span className="chip border-gold/30 bg-gold/10 text-gold-bright">{winner.event_day}</span>
                                                    : <span className="text-muted-dim">—</span>}
                                            </td>
                                            <td className="px-3 py-2 text-xs text-muted-dim">{formatDateTime(winner.drawn_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : (
                <p className="mt-4 flex items-center gap-2 text-sm text-muted-dim">
                    <FileText size={14} />
                    No winners drawn yet.
                </p>
            )}
        </li>
    );
}

const FORMATS = [
    { key: 'csv', label: 'Excel (CSV)', hint: 'Spreadsheet — opens in Excel', icon: FileSpreadsheet },
    { key: 'pdf', label: 'PDF', hint: 'Ready to print or share', icon: FileText },
    { key: 'docx', label: 'Word', hint: 'Editable document', icon: FileType },
];

/** "Download" with a choice of file: Excel (CSV), PDF or Word. */
function DownloadMenu({ label, primary = false, busy, disabled, title, onPick }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                className={`btn ${primary ? 'btn-gold' : 'btn-outline'}`}
                disabled={disabled}
                title={title}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
            >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                <span className={primary ? 'hidden sm:inline' : ''}>{label}</span>
                <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <ul role="menu" className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-panel shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
                    {FORMATS.map(({ key, label: name, hint, icon: Icon }) => (
                        <li key={key} role="none">
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                    setOpen(false);
                                    onPick(key);
                                }}
                                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-gold/[0.08]"
                            >
                                <Icon size={17} className="shrink-0 text-gold" />
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-white">{name}</span>
                                    <span className="block text-xs text-muted-dim">{hint}</span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function Detail({ label, value }) {
    return (
        <div className="min-w-0">
            <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-dim">{label}</dt>
            <dd className="mt-0.5 text-white/90">{value}</dd>
        </div>
    );
}
