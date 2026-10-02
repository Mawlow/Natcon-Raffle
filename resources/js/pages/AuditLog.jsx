import { useCallback, useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import api, { parseError } from '../lib/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatusChip from '../components/ui/StatusChip';
import LoadingState from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import { useToast } from '../context/ToastContext';
import { formatDateTime, formatNumber } from '../lib/format';

const RESULTS = ['SUCCESS', 'NO_ELIGIBLE_PARTICIPANTS', 'ALL_WINNERS_DRAWN', 'INVALID_STATUS', 'FAILED'];

export default function AuditLog() {
    const toast = useToast();

    const [events, setEvents] = useState([]);
    const [meta, setMeta] = useState(null);
    const [raffles, setRaffles] = useState([]);
    const [raffleId, setRaffleId] = useState('');
    const [result, setResult] = useState('');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/raffles', { params: { per_page: 100, include_archived: 1 } })
            .then(({ data }) => setRaffles(data.data))
            .catch(() => setRaffles([]));
    }, []);

    const load = useCallback(async () => {
        setLoading(true);

        try {
            const { data } = await api.get('/draw-events', {
                params: { page, raffle_id: raffleId || undefined, result: result || undefined, per_page: 30 },
            });
            setEvents(data.data);
            setMeta(data.meta);
        } catch (error) {
            toast.error(parseError(error, 'The audit log could not be loaded.').message);
        } finally {
            setLoading(false);
        }
    }, [page, raffleId, result, toast]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { setPage(1); }, [raffleId, result]);

    return (
        <DashboardLayout
            title="Audit log"
            subtitle="Every draw attempt, successful or not"
        >
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <select
                    className="input w-auto min-w-[14rem]"
                    value={raffleId}
                    onChange={(event) => setRaffleId(event.target.value)}
                >
                    <option value="">All raffles</option>
                    {raffles.map((raffle) => (
                        <option key={raffle.id} value={raffle.id}>{raffle.name}</option>
                    ))}
                </select>

                <select
                    className="input w-auto min-w-[14rem]"
                    value={result}
                    onChange={(event) => setResult(event.target.value)}
                >
                    <option value="">All results</option>
                    {RESULTS.map((value) => (
                        <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>
                    ))}
                </select>
            </div>

            {loading && <LoadingState label="Loading audit log" rows={6} />}

            {!loading && events.length === 0 && (
                <EmptyState
                    icon={ScrollText}
                    title="No draw events recorded"
                    description="Every draw — and every rejected attempt — is written here with a unique event ID for transparency."
                />
            )}

            {!loading && events.length > 0 && (
                <>
                    <div className="panel overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[60rem] text-sm">
                                <thead>
                                    <tr className="border-b border-line text-left text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                                        <th className="px-5 py-3.5 font-semibold">When</th>
                                        <th className="px-5 py-3.5 font-semibold">Raffle</th>
                                        <th className="px-5 py-3.5 font-semibold">Result</th>
                                        <th className="px-5 py-3.5 font-semibold">Seq</th>
                                        <th className="px-5 py-3.5 font-semibold">Ticket</th>
                                        <th className="px-5 py-3.5 font-semibold">Eligible</th>
                                        <th className="px-5 py-3.5 font-semibold">By</th>
                                        <th className="px-5 py-3.5 font-semibold">IP</th>
                                        <th className="px-5 py-3.5 font-semibold">Event ID</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                    {events.map((event) => (
                                        <tr key={event.id} className="transition hover:bg-white/[0.02]">
                                            <td className="whitespace-nowrap px-5 py-3 text-muted">{formatDateTime(event.created_at)}</td>
                                            <td className="max-w-[12rem] truncate px-5 py-3 text-white">{event.raffle ?? '—'}</td>
                                            <td className="px-5 py-3">
                                                <StatusChip status={event.result} />
                                                {event.message && (
                                                    <p className="mt-1 max-w-[16rem] truncate text-xs text-muted-dim" title={event.message}>
                                                        {event.message}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="tabular px-5 py-3 text-muted">{event.sequence ?? '—'}</td>
                                            <td className="tabular px-5 py-3 font-semibold text-gold-bright">{event.ticket_number ?? '—'}</td>
                                            <td className="tabular px-5 py-3 text-muted">{formatNumber(event.eligible_count)}</td>
                                            <td className="px-5 py-3 text-muted">{event.user ?? '—'}</td>
                                            <td className="px-5 py-3 text-muted-dim">{event.ip_address ?? '—'}</td>
                                            <td className="px-5 py-3">
                                                <code className="rounded bg-black/40 px-2 py-1 text-[0.68rem] text-muted-dim" title={event.event_uuid}>
                                                    {event.event_uuid.slice(0, 8)}
                                                </code>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="mt-5">
                        <Pagination meta={meta} onChange={setPage} />
                    </div>
                </>
            )}
        </DashboardLayout>
    );
}
