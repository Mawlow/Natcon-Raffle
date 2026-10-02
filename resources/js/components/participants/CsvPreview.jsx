import { AlertTriangle, CheckCircle2, Copy, FileWarning } from 'lucide-react';
import { formatNumber } from '../../lib/format';

export default function CsvPreview({ preview }) {
    if (!preview) return null;

    const tiles = [
        { label: 'Rows read', value: preview.total_rows, icon: CheckCircle2, tone: 'text-white' },
        { label: 'Valid rows', value: preview.valid_count, icon: CheckCircle2, tone: 'text-emerald-300' },
        { label: 'New tickets', value: preview.new_count, icon: CheckCircle2, tone: 'text-gold-bright' },
        { label: 'Already in system', value: preview.existing_count, icon: Copy, tone: 'text-sky-300' },
        { label: 'Duplicates in file', value: preview.duplicate_in_file_count, icon: Copy, tone: 'text-amber-300' },
        { label: 'Invalid rows', value: preview.invalid_count, icon: FileWarning, tone: 'text-red-300' },
    ];

    return (
        <div className="space-y-5">
            {preview.already_imported && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-4 py-3.5">
                    <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-300" />
                    <p className="text-sm leading-relaxed text-amber-200/90">
                        This exact file was already imported into this raffle on{' '}
                        {new Date(preview.already_imported_at).toLocaleString()}. Importing again is safe —
                        ticket numbers already in this raffle are skipped unless you choose to update them.
                    </p>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {tiles.map(({ label, value, icon: Icon, tone }) => (
                    <div key={label} className="rounded-xl border border-line bg-black/30 px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
                            <Icon size={13} className={tone} />
                        </div>
                        <p className={`tabular mt-1.5 font-display text-2xl font-extrabold ${tone}`}>
                            {formatNumber(value)}
                        </p>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-semibold uppercase tracking-wider text-muted-dim">Detected columns:</span>
                {preview.delimiter && preview.delimiter !== 'comma' && (
                    <code className="rounded bg-sky-400/10 px-2 py-0.5 text-sky-300" title="Column separator found in the file">
                        {preview.delimiter}-separated
                    </code>
                )}
                {preview.detected_columns.map((column) => (
                    <code key={column} className="rounded bg-gold/10 px-2 py-0.5 text-gold-bright">{column}</code>
                ))}
                {preview.extra_columns.map((column) => (
                    <code key={column} className="rounded bg-white/5 px-2 py-0.5 text-muted-dim" title="Stored as participant metadata">
                        {column}
                    </code>
                ))}
            </div>

            {preview.preview_rows.length > 0 && (
                <div className="panel overflow-hidden">
                    <p className="border-b border-line px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted">
                        Preview — first {preview.preview_rows.length} valid rows
                    </p>
                    <div className="max-h-72 overflow-auto">
                        <table className="w-full min-w-[40rem] text-sm">
                            <thead className="sticky top-0 bg-panel">
                                <tr className="border-b border-line text-left text-[0.65rem] uppercase tracking-[0.12em] text-muted">
                                    <th className="px-5 py-2.5 font-semibold">Line</th>
                                    <th className="px-5 py-2.5 font-semibold">Ticket</th>
                                    <th className="px-5 py-2.5 font-semibold">Name</th>
                                    <th className="px-5 py-2.5 font-semibold">Email</th>
                                    <th className="px-5 py-2.5 font-semibold">Category</th>
                                    <th className="px-5 py-2.5 font-semibold">State</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                                {preview.preview_rows.map((row) => (
                                    <tr key={row.line}>
                                        <td className="px-5 py-2.5 text-muted-dim">{row.line}</td>
                                        <td className="tabular px-5 py-2.5 font-semibold text-gold-bright">{row.ticket_number}</td>
                                        <td className="max-w-[12rem] truncate px-5 py-2.5 text-white">{row.name ?? '—'}</td>
                                        <td className="max-w-[14rem] truncate px-5 py-2.5 text-muted">{row.email ?? '—'}</td>
                                        <td className="px-5 py-2.5 text-muted">{row.category ?? '—'}</td>
                                        <td className="px-5 py-2.5">
                                            {row.already_exists ? (
                                                <span className="chip border-sky-400/25 bg-sky-400/10 text-sky-300">Exists</span>
                                            ) : (
                                                <span className="chip border-emerald-400/25 bg-emerald-400/10 text-emerald-300">New</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {preview.invalid_rows.length > 0 && (
                <div className="panel overflow-hidden border-red-400/20">
                    <p className="border-b border-line px-5 py-3 text-xs font-semibold uppercase tracking-wider text-red-300">
                        Rows that will be skipped
                    </p>
                    <div className="max-h-56 overflow-auto">
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-line">
                                {preview.invalid_rows.map((row, index) => (
                                    <tr key={`${row.line}-${index}`}>
                                        <td className="w-20 px-5 py-2.5 text-muted-dim">Line {row.line}</td>
                                        <td className="tabular w-32 px-5 py-2.5 text-white">{row.ticket_number ?? '—'}</td>
                                        <td className="px-5 py-2.5 text-red-300/90">{row.reason}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
