import { memo, useCallback, useEffect, useState } from 'react';
import { Loader2, Search, UserCheck, UserX } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { useToast } from '../../context/ToastContext';
import StatusChip from '../ui/StatusChip';

/**
 * Attendance, from the Control Center: anyone who did not come is marked
 * absent and kept out of every draw — this raffle's and the next ones' —
 * until they are marked present again. Winners stay winners.
 *
 * Importing the list or editing someone's details is done under
 * Participants at the top of the Control Center.
 */
export default memo(AttendancePanel);

const PER_PAGE = 50;

const FILTERS = [
    { key: '', label: 'Everyone' },
    { key: 'ACTIVE', label: 'Present' },
    { key: 'ABSENT', label: 'Absent' },
    { key: 'WINNER', label: 'Winners' },
];

function AttendancePanel({ raffleId, midDraw, onChanged }) {
    const toast = useToast();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('');
    const [rows, setRows] = useState(null);
    const [meta, setMeta] = useState(null);
    const [stats, setStats] = useState({});
    const [loadingMore, setLoadingMore] = useState(false);
    const [busy, setBusy] = useState(null);
    const base = `/raffles/${raffleId}/participants`;

    const loadStats = useCallback(() => (
        api.get(`${base}/stats`).then(({ data }) => setStats(data.data ?? {})).catch(() => {})
    ), [base]);

    const load = useCallback(async (page = 1) => {
        const { data } = await api.get(base, {
            params: { page, per_page: PER_PAGE, search: search.trim() || undefined, status: filter || undefined, sort: 'name' },
        });
        setRows((current) => (page === 1 ? data.data : [...(current ?? []), ...data.data]));
        setMeta(data.meta);
    }, [base, search, filter]);

    // Searching waits for a pause in typing.
    useEffect(() => {
        const timer = setTimeout(() => {
            load(1).catch((error) => toast.error(parseError(error, 'Participants could not be loaded.').message));
        }, search ? 300 : 0);
        return () => clearTimeout(timer);
    }, [load, search, toast]);

    useEffect(() => { loadStats(); }, [loadStats]);

    const more = async () => {
        setLoadingMore(true);
        try {
            await load((meta?.current_page ?? 1) + 1);
        } finally {
            setLoadingMore(false);
        }
    };

    const setStatus = async (participant, status) => {
        setBusy(participant.id);
        try {
            const { data } = await api.put(`${base}/${participant.id}`, { status });
            setRows((current) => current
                .map((row) => (row.id === participant.id ? data.data : row))
                // Someone who no longer matches the filter leaves the list.
                .filter((row) => !filter || row.status === filter));
            await Promise.all([loadStats(), onChanged?.()]);
            toast.success(`${participant.name ?? participant.ticket_number} marked ${status === 'ABSENT' ? 'absent' : 'present'}.`);
        } catch (error) {
            toast.error(parseError(error, 'The change could not be saved.').message);
        } finally {
            setBusy(null);
        }
    };

    const count = (status) => Number(stats[status] ?? 0);
    const total = Object.values(stats).reduce((sum, value) => sum + Number(value), 0);

    return (
        <section className="panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="font-display text-base font-bold text-white">Participants</h2>
                    <p className="mt-0.5 text-xs text-muted">
                        Mark anyone who is not here as absent — they cannot win until they are marked present again.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                    <Stat label="In all" value={total} />
                    <Stat label="Present" value={count('ACTIVE')} tone="text-emerald-300" />
                    <Stat label="Absent" value={count('ABSENT')} tone="text-amber-300" />
                    <Stat label="Winners" value={count('WINNER')} tone="text-gold-bright" />
                </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="relative min-w-[14rem] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim" size={15} />
                    <input
                        type="search"
                        className="input pl-9"
                        placeholder="Find by name or ticket…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
                <div className="flex gap-1 rounded-lg border border-line bg-black/40 p-1" role="radiogroup" aria-label="Show">
                    {FILTERS.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            role="radio"
                            aria-checked={filter === item.key}
                            onClick={() => setFilter(item.key)}
                            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                                filter === item.key ? 'bg-gold text-black' : 'text-muted hover:text-white'
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            {midDraw && <p className="mt-3 text-xs text-gold-bright">A draw is running — changes wait until it is done.</p>}

            {rows === null ? (
                <p className="mt-5 flex items-center gap-2 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> Loading participants…</p>
            ) : rows.length === 0 ? (
                <p className="mt-5 text-sm text-muted">
                    {search || filter ? 'No one matches.' : 'No participants yet — import them with Participants at the top.'}
                </p>
            ) : (
                <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
                    {rows.map((participant) => {
                        const absent = participant.status === 'ABSENT';
                        const canToggle = participant.status === 'ACTIVE' || absent;
                        return (
                            <li
                                key={participant.id}
                                className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${absent ? 'bg-amber-400/[0.04]' : 'bg-black/20'}`}
                            >
                                <span className="tabular w-16 shrink-0 font-display text-sm font-bold text-gold-bright">{participant.ticket_number}</span>
                                <span className="min-w-0 flex-1">
                                    <span className={`block truncate text-sm font-semibold ${absent ? 'text-muted line-through decoration-amber-300/60' : 'text-white'}`}>
                                        {participant.name ?? '—'}
                                    </span>
                                    {participant.category && <span className="block truncate text-xs text-muted-dim">{participant.category}</span>}
                                </span>
                                <StatusChip status={participant.status} />
                                {canToggle ? (
                                    <button
                                        type="button"
                                        className={`btn w-36 justify-center px-3 py-1.5 text-xs ${absent ? 'btn-outline' : 'btn-ghost text-amber-300'}`}
                                        onClick={() => setStatus(participant, absent ? 'ACTIVE' : 'ABSENT')}
                                        disabled={midDraw || busy === participant.id}
                                    >
                                        {busy === participant.id
                                            ? <Loader2 size={13} className="animate-spin" />
                                            : absent ? <UserCheck size={13} /> : <UserX size={13} />}
                                        {absent ? 'Mark present' : 'Mark absent'}
                                    </button>
                                ) : (
                                    <span className="w-36 text-center text-xs text-muted-dim">
                                        {participant.status === 'WINNER' ? 'Already won' : '—'}
                                    </span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {meta && meta.current_page < meta.last_page && (
                <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted">
                    <span>Showing {formatNumber(rows?.length ?? 0)} of {formatNumber(meta.total)}</span>
                    <button type="button" className="btn btn-outline px-3 py-1.5 text-xs" onClick={more} disabled={loadingMore}>
                        {loadingMore && <Loader2 size={13} className="animate-spin" />}
                        Show more
                    </button>
                </div>
            )}
        </section>
    );
}

function Stat({ label, value, tone = 'text-white' }) {
    return (
        <span className="rounded-lg border border-line bg-black/30 px-3 py-1.5">
            <span className="text-muted">{label} </span>
            <span className={`tabular font-display font-bold ${tone}`}>{formatNumber(value)}</span>
        </span>
    );
}
