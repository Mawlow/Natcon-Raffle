import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText, Gift, Play, Plus, Trophy, Users } from 'lucide-react';
import api, { parseError } from '../lib/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import StatCard from '../components/ui/StatCard';
import StatusChip from '../components/ui/StatusChip';
import LoadingState from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import { formatDateTime } from '../lib/format';

/**
 * The home screen of the control panel. It reads top to bottom: a few
 * headline numbers, then the raffles themselves, each with one obvious next
 * step, and the latest winners beside them.
 */
export default function Dashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.get('/dashboard')
            .then(({ data }) => setStats(data.data))
            .catch((err) => setError(parseError(err, 'The dashboard could not be loaded.').message))
            .finally(() => setLoading(false));
    }, []);

    return (
        <DashboardLayout
            title="Welcome back"
            subtitle="Everything you need to run the raffle, in one place."
            actions={
                <div className="flex flex-wrap gap-2">
                    <Link to="/reports" className="btn btn-outline">
                        <FileText size={16} />
                        <span className="hidden sm:inline">Winner Reports</span>
                    </Link>
                    <Link to="/raffles/new" className="btn btn-gold">
                        <Plus size={16} />
                        <span className="hidden sm:inline">New Raffle</span>
                    </Link>
                </div>
            }
        >
            {loading && <LoadingState label="Loading dashboard" rows={4} />}

            {error && !loading && (
                <EmptyState title="Unable to load the dashboard" description={error} />
            )}

            {stats && !loading && (
                <div className="space-y-8">
                    {/* At a glance */}
                    <section>
                        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">At a glance</h2>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <StatCard
                                icon={Users}
                                label="Participants"
                                value={stats.totals.participants}
                                hint="Tickets across all raffles"
                                delay={0}
                            />
                            <StatCard
                                icon={Gift}
                                label="Raffles running"
                                value={stats.totals.active_raffles}
                                hint="Ready or live right now"
                                accent={stats.totals.active_raffles > 0}
                                delay={0.05}
                            />
                            <StatCard
                                icon={Trophy}
                                label="Winners drawn"
                                value={stats.totals.winners}
                                hint="So far, in every raffle"
                                delay={0.1}
                            />
                        </div>
                    </section>

                    <div className="grid gap-6 lg:grid-cols-3">
                        {/* Raffles */}
                        <section className="lg:col-span-2">
                            <header className="mb-3 flex items-center justify-between gap-3">
                                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Your raffles</h2>
                                <Link to="/raffles" className="text-xs font-semibold text-gold transition hover:text-gold-bright">
                                    See all raffles
                                </Link>
                            </header>

                            {stats.recent_raffles.length === 0 ? (
                                <div className="panel flex flex-col items-center gap-4 px-6 py-12 text-center">
                                    <Gift size={28} className="text-gold" />
                                    <div>
                                        <p className="font-display text-base font-bold text-white">No raffles yet</p>
                                        <p className="mt-1 text-sm text-muted">Create your first raffle to get started.</p>
                                    </div>
                                    <Link to="/raffles/new" className="btn btn-gold">
                                        <Plus size={16} />
                                        Create a raffle
                                    </Link>
                                </div>
                            ) : (
                                <ul className="space-y-3">
                                    {stats.recent_raffles.map((raffle) => (
                                        <RaffleRow key={raffle.id} raffle={raffle} />
                                    ))}
                                </ul>
                            )}
                        </section>

                        {/* Latest winners */}
                        <section>
                            <header className="mb-3 flex items-center justify-between gap-3">
                                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Latest winners</h2>
                                <Link to="/winners" className="text-xs font-semibold text-gold transition hover:text-gold-bright">
                                    See all winners
                                </Link>
                            </header>

                            <div className="panel p-5">
                                {stats.recent_winners.length === 0 ? (
                                    <p className="py-8 text-center text-sm text-muted-dim">No winners drawn yet.</p>
                                ) : (
                                    <ul className="divide-y divide-line">
                                        {stats.recent_winners.map((winner) => (
                                            <li key={winner.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold">
                                                    <Trophy size={15} />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="tabular font-display text-base font-extrabold text-gold-bright">
                                                        Ticket {winner.ticket_number}
                                                    </p>
                                                    <p className="truncate text-xs text-muted">
                                                        {winner.raffle ?? 'Raffle'} · Winner #{winner.position}
                                                    </p>
                                                    <p className="text-[0.7rem] text-muted-dim">{formatDateTime(winner.drawn_at)}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}

/** One raffle: what it is, how far the draw has got, and what to do next. */
function RaffleRow({ raffle }) {
    const drawn = raffle.winners_drawn ?? 0;
    const total = raffle.winners_count || 0;
    const percent = total > 0 ? Math.min(100, Math.round((drawn / total) * 100)) : 0;
    const next = nextStep(raffle);

    return (
        <li className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-display text-base font-bold text-white">{raffle.name}</p>
                    <StatusChip status={raffle.status} />
                </div>
                <p className="mt-0.5 truncate text-sm text-muted">Prize: {raffle.prize_name ?? 'not set yet'}</p>

                <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-gold" style={{ width: `${percent}%` }} />
                    </div>
                    <p className="shrink-0 text-xs text-muted">
                        {drawn} of {total} winners drawn
                    </p>
                </div>
            </div>

            {next.external ? (
                <a href={next.to} className={`btn ${next.primary ? 'btn-gold' : 'btn-outline'} shrink-0`}>
                    <next.icon size={15} />
                    {next.label}
                </a>
            ) : (
                <Link to={next.to} className={`btn ${next.primary ? 'btn-gold' : 'btn-outline'} shrink-0`}>
                    <next.icon size={15} />
                    {next.label}
                </Link>
            )}
        </li>
    );
}

/** The single most useful action for a raffle in its current state. */
function nextStep(raffle) {
    switch (raffle.status) {
        case 'READY':
        case 'LIVE':
            return { label: 'Open draw screen', to: `/raffle/${raffle.id}/display`, icon: Play, primary: true, external: true };
        case 'DRAFT':
            return { label: 'Finish setup', to: `/raffles/${raffle.id}`, icon: ArrowRight, primary: false };
        default:
            return { label: 'View results', to: `/raffles/${raffle.id}`, icon: Trophy, primary: false };
    }
}
