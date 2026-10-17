import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, ScrollText, Trash2, Upload, Users } from 'lucide-react';
import api, { parseError } from '../lib/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import DrawControls from '../components/raffle/DrawControls';
import RaffleTabs from '../components/raffle/RaffleTabs';
import WinnerHistory from '../components/raffle/WinnerHistory';
import StatusChip from '../components/ui/StatusChip';
import LoadingState from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { RedrawChoice, RedrawCount, validRedrawCount } from '../components/raffle/RedrawOptions';
import { hasPrizes, hasStagedPrizes } from '../lib/prizes';
import { useToast } from '../context/ToastContext';
import { deleteRaffleConfirmation } from '../lib/deleteRaffle';
import { formatDateTime, formatNumber, formatPrizeValue } from '../lib/format';

export default function RaffleDetail() {
    const { raffle: raffleId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();

    const [raffle, setRaffle] = useState(null);
    const [eligibleCount, setEligibleCount] = useState(0);
    const [winners, setWinners] = useState([]);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [lastWinner, setLastWinner] = useState(null);
    const [confirm, setConfirm] = useState(null);
    // The redraw dialog's choice: 'include' or 'exclude' previous winners.
    const [redrawChoice, setRedrawChoice] = useState(null);
    // How many winners the redraw should have — any number, fewer or more.
    const [redrawCount, setRedrawCount] = useState('');

    const load = useCallback(async () => {
        try {
            const [detail, winnerList, eventList] = await Promise.all([
                api.get(`/raffles/${raffleId}`),
                api.get(`/raffles/${raffleId}/winners`),
                api.get(`/raffles/${raffleId}/draw-events`),
            ]);

            setRaffle(detail.data.data);
            setEligibleCount(detail.data.eligible_count);
            setWinners(winnerList.data.data);
            setEvents(eventList.data.data);
            setLoadError(null);
        } catch (error) {
            setLoadError(parseError(error, 'This raffle could not be loaded.').message);
        } finally {
            setLoading(false);
        }
    }, [raffleId]);

    useEffect(() => { load(); }, [load]);

    const draw = async () => {
        setBusy(true);

        try {
            const requestId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
            const { data } = await api.post(`/raffles/${raffleId}/draw`, { request_id: requestId });

            setLastWinner(data.data);
            toast.success(`Winner #${data.data.position}: ticket ${data.data.ticket_number}`, { title: 'Draw complete' });
            await load();
        } catch (error) {
            toast.error(parseError(error, 'The draw could not be completed.').message);
        } finally {
            setBusy(false);
        }
    };

    const transition = async (action) => {
        setBusy(true);

        try {
            await api.post(`/raffles/${raffleId}/transition`, { action });
            toast.success('Raffle updated.');
            await load();
        } catch (error) {
            toast.error(parseError(error, 'The raffle could not be updated.').message);
        } finally {
            setBusy(false);
        }
    };

    const redraw = async (choice, count) => {
        setBusy(true);

        try {
            const { data } = await api.post(`/raffles/${raffleId}/redraw`, {
                include_previous_winners: choice === 'include',
                winners_count: Number(count),
            });
            setLastWinner(null);
            const winnersCount = data.data.winners_count;
            toast.success(
                `${winnersCount} winner${winnersCount === 1 ? '' : 's'} to draw from ${formatNumber(data.data.eligible_count)} tickets. Screens that are already open update on their own within a few seconds.`,
                { title: 'Ready to redraw' },
            );
            await load();
        } catch (error) {
            toast.error(parseError(error, 'The raffle could not be redrawn.').message);
        } finally {
            setBusy(false);
        }
    };

    // A pre-draw is played again, not re-picked: the same winners come out again.
    const replay = async () => {
        setBusy(true);
        try {
            const { data } = await api.post(`/raffles/${raffleId}/replay`);
            setLastWinner(null);
            const winnersCount = data.data.winners_count;
            toast.success(`The draw reveals the same ${winnersCount} winner${winnersCount === 1 ? '' : 's'} again, in the same order.`, { title: 'Ready to play again' });
            await load();
        } catch (error) {
            toast.error(parseError(error, 'The pre-draw could not be reset.').message);
        } finally {
            setBusy(false);
        }
    };

    const removeRaffle = async () => {
        setBusy(true);

        try {
            await api.delete(`/raffles/${raffleId}`);
            toast.success('Raffle deleted.');
            navigate('/raffles');
        } catch (error) {
            toast.error(parseError(error, 'The raffle could not be deleted.').message);
            setBusy(false);
        }
    };

    if (loading) {
        return <DashboardLayout title="Raffle"><LoadingState label="Loading raffle" rows={5} /></DashboardLayout>;
    }

    if (loadError) {
        return (
            <DashboardLayout title="Raffle">
                <EmptyState
                    title="Raffle not found"
                    description={loadError}
                    action={<Link to="/raffles" className="btn btn-outline">Back to raffles</Link>}
                />
            </DashboardLayout>
        );
    }

    const prize = formatPrizeValue(raffle.prize_value, raffle.prize_currency);

    return (
        <DashboardLayout
            title={raffle.name}
            subtitle={raffle.participant_pool || 'Raffle overview'}
            actions={
                <>
                    <button type="button" className="btn btn-ghost" onClick={() => navigate('/raffles')}>
                        <ArrowLeft size={15} />
                        <span className="hidden sm:inline">Raffles</span>
                    </button>
                    {!raffle.is_archived && (
                        <>
                            <Link to={`/raffles/${raffle.id}/participants`} className="btn btn-outline">
                                <Users size={15} />
                                <span className="hidden sm:inline">Participants</span>
                            </Link>
                            <Link to={`/raffles/${raffle.id}/edit`} className="btn btn-outline">
                                <Pencil size={15} />
                                <span className="hidden sm:inline">Edit</span>
                            </Link>
                        </>
                    )}
                    <button
                        type="button"
                        className="btn btn-ghost text-red-300/80 hover:bg-red-500/10 hover:text-red-300"
                        onClick={() => setConfirm({
                            ...deleteRaffleConfirmation({ ...raffle, winners_drawn: winners.length }),
                            run: removeRaffle,
                        })}
                        disabled={busy}
                    >
                        <Trash2 size={15} />
                        <span className="hidden sm:inline">Delete</span>
                    </button>
                </>
            }
        >
            <RaffleTabs raffleId={raffle.id} />

            <div className="space-y-6">
                {raffle.participants_count === 0 && (
                    <section className="panel flex flex-wrap items-center justify-between gap-4 border-gold/25 bg-gold/[0.05] p-5">
                        <div>
                            <p className="font-display text-sm font-bold text-white">No participants imported yet</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted">
                                This raffle needs its own participant list before it can be drawn. Import a CSV with a
                                ticket_number column — name, email, phone and category are optional.
                            </p>
                        </div>
                        <Link to={`/raffles/${raffle.id}/participants`} className="btn btn-gold">
                            <Upload size={16} /> Import CSV
                        </Link>
                    </section>
                )}

                <section className="panel p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <StatusChip status={raffle.status} />
                                {raffle.is_archived && <span className="chip border-white/10 bg-white/5 text-muted-dim">Archived</span>}
                                {raffle.allow_repeat_winners && (
                                    <span className="chip border-amber-400/25 bg-amber-400/10 text-amber-300">Repeats allowed</span>
                                )}
                            </div>

                            <p className="font-display text-2xl font-extrabold text-white">
                                {raffle.prize_name ? `${prize ? `${prize} · ` : ''}${raffle.prize_name}` : 'Prize not set yet'}
                            </p>

                            {raffle.description && (
                                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{raffle.description}</p>
                            )}
                        </div>
                    </div>

                    <dl className="mt-6 grid gap-x-6 gap-y-4 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-4">
                        <Detail label="Participants" value={`${formatNumber(raffle.participants_count)} tickets`} />
                        <Detail label="Pool label" value={raffle.participant_pool || '—'} />
                        <Detail label="Starts" value={formatDateTime(raffle.starts_at)} />
                        <Detail label="Ends" value={formatDateTime(raffle.ends_at)} />
                    </dl>
                </section>

                <DrawControls
                    raffle={raffle}
                    eligibleCount={eligibleCount}
                    busy={busy}
                    lastWinner={lastWinner}
                    onDraw={draw}
                    onRedraw={() => {
                        if (hasStagedPrizes(raffle)) {
                            setConfirm({
                                title: 'Play this pre-draw again?',
                                description: `The ${winners.length} revealed winner${winners.length === 1 ? '' : 's'} ${winners.length === 1 ? 'is' : 'are'} cleared and the pre-draw set back to READY. When it is drawn again, the same winners come out in the same order — nobody on the list changes.\n\nThe earlier reveals stay in the audit log.`,
                                confirmLabel: 'Play again — same winners',
                                tone: 'gold',
                                run: replay,
                            });
                            return;
                        }
                        setRedrawChoice(null);
                        setRedrawCount(String(raffle.winners_count));
                        setConfirm({
                            kind: 'redraw',
                            title: 'Redraw this raffle?',
                            description:
                                `The ${winners.length} current winner${winners.length === 1 ? '' : 's'} will be cleared and the raffle set back to READY, so it can be drawn again with as many winners as you choose below.\n\n`
                                + 'The original draws stay in the audit log.',
                            confirmLabel: 'Clear winners & redraw',
                            tone: 'gold',
                        });
                    }}
                    onTransition={(action) => {
                        if (action === 'cancel') {
                            setConfirm({
                                title: 'Cancel this raffle?',
                                description: 'No further draws will be possible until the raffle is reopened. Existing winners are kept.',
                                confirmLabel: 'Cancel raffle',
                                run: () => transition('cancel'),
                            });
                            return Promise.resolve();
                        }

                        if (action === 'complete') {
                            setConfirm({
                                title: 'Complete this raffle?',
                                description: 'The raffle will be closed to further draws.',
                                confirmLabel: 'Complete',
                                tone: 'gold',
                                run: () => transition('complete'),
                            });
                            return Promise.resolve();
                        }

                        return transition(action);
                    }}
                />

                <section>
                    <h2 className="mb-4 font-display text-base font-bold text-white">
                        Winners <span className="text-muted-dim">({winners.length})</span>
                    </h2>
                    <WinnerHistory winners={winners} emptyHint="Run the first draw to reveal a winning ticket." />
                </section>

                <section>
                    <h2 className="mb-4 flex items-center gap-2 font-display text-base font-bold text-white">
                        <ScrollText size={16} className="text-gold" />
                        Draw audit trail <span className="text-muted-dim">({events.length})</span>
                    </h2>

                    {events.length === 0 ? (
                        <div className="panel px-6 py-10 text-center text-sm text-muted-dim">
                            No draw activity recorded yet.
                        </div>
                    ) : (
                        <div className="panel overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[46rem] text-sm">
                                    <thead>
                                        <tr className="border-b border-line text-left text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                                            <th className="px-5 py-3.5 font-semibold">When</th>
                                            <th className="px-5 py-3.5 font-semibold">Result</th>
                                            <th className="px-5 py-3.5 font-semibold">Seq</th>
                                            <th className="px-5 py-3.5 font-semibold">Ticket</th>
                                            <th className="px-5 py-3.5 font-semibold">Eligible</th>
                                            <th className="px-5 py-3.5 font-semibold">By</th>
                                            <th className="px-5 py-3.5 font-semibold">Event ID</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-line">
                                        {events.map((event) => (
                                            <tr key={event.id} className="transition hover:bg-white/[0.02]">
                                                <td className="whitespace-nowrap px-5 py-3 text-muted">{formatDateTime(event.created_at)}</td>
                                                <td className="px-5 py-3"><StatusChip status={event.result} /></td>
                                                <td className="tabular px-5 py-3 text-muted">{event.sequence ?? '—'}</td>
                                                <td className="tabular px-5 py-3 font-semibold text-gold-bright">{event.ticket_number ?? '—'}</td>
                                                <td className="tabular px-5 py-3 text-muted">{formatNumber(event.eligible_count)}</td>
                                                <td className="px-5 py-3 text-muted">{event.user ?? '—'}</td>
                                                <td className="px-5 py-3">
                                                    <code className="rounded bg-black/40 px-2 py-1 text-[0.68rem] text-muted-dim">
                                                        {event.event_uuid.slice(0, 8)}
                                                    </code>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            <ConfirmDialog
                open={Boolean(confirm)}
                title={confirm?.title}
                description={confirm?.description}
                confirmLabel={confirm?.confirmLabel}
                tone={confirm?.tone ?? 'danger'}
                requireText={confirm?.requireText}
                confirmDisabled={confirm?.kind === 'redraw' && (!redrawChoice || !validRedrawCount(redrawCount))}
                busy={busy}
                onConfirm={async () => {
                    await (confirm.kind === 'redraw' ? redraw(redrawChoice, redrawCount) : confirm.run());
                    setConfirm(null);
                }}
                onCancel={() => setConfirm(null)}
            >
                {confirm?.kind === 'redraw' && (
                    <div className="space-y-5">
                        {!hasPrizes(raffle) && (
                            <RedrawCount value={redrawCount} onChange={setRedrawCount} eligible={eligibleCount + winners.length} />
                        )}
                        <RedrawChoice value={redrawChoice} onChange={setRedrawChoice} />
                    </div>
                )}
            </ConfirmDialog>
        </DashboardLayout>
    );
}

function Detail({ label, value }) {
    return (
        <div>
            <dt className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">{label}</dt>
            <dd className="mt-1 truncate text-sm text-white">{value}</dd>
        </div>
    );
}
