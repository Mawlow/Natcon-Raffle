import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, MonitorUp, Search, Trophy } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { switchWall } from '../../lib/wallSwitch';
import StatusChip from '../ui/StatusChip';
import { prizeLabel } from './RaffleSetupSection';

/**
 * Every raffle of the event, in the order they were run, each with all of
 * its winners — and a search across every winner's name and ticket. Any
 * raffle can be put back on the LED wall from here.
 */
export default memo(AllRafflesPanel);

function AllRafflesPanel({ raffleId, setupKey, reloadKey, busy }) {
    const navigate = useNavigate();
    const [raffles, setRaffles] = useState(null);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');

    const load = useCallback(() => (
        api.get('/raffles', { params: { per_page: 100, with_winners: 1, include_predraws: 1 } })
            .then(({ data }) => {
                // First raffle first, the way the event ran.
                setRaffles([...data.data].reverse());
                setError(null);
            })
            .catch((failure) => setError(parseError(failure, 'The raffles could not be loaded.').message))
    ), []);

    useEffect(() => { load(); }, [load, reloadKey]);

    const term = search.trim().toLowerCase();
    const shown = useMemo(() => (raffles ?? []).map((raffle, index) => ({
        ...raffle,
        number: index + 1,
        matches: (raffle.winners ?? []).filter((winner) => !term
            || winner.participant?.name?.toLowerCase().includes(term)
            || winner.ticket_number?.toLowerCase().includes(term)),
    })).filter((raffle) => !term || raffle.matches.length), [raffles, term]);

    const totalWinners = (raffles ?? []).reduce((sum, raffle) => sum + (raffle.winners?.length ?? 0), 0);

    const showOnWall = (id) => {
        switchWall(id, setupKey === 'one' ? 'single' : 'display');
        navigate(`/raffle/${id}/control${setupKey === 'one' ? '?setup=one' : ''}`);
    };

    if (error) return <p className="panel p-6 text-sm text-red-300">{error}</p>;
    if (!raffles) {
        return <p className="panel flex items-center gap-2 p-6 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> Loading raffles…</p>;
    }

    return (
        <div className="space-y-4">
            <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-sm text-muted">
                    <span className="font-semibold text-white">{formatNumber(raffles.length)}</span> raffle{raffles.length === 1 ? '' : 's'}
                    {' · '}
                    <span className="font-semibold text-gold-bright">{formatNumber(totalWinners)}</span> winner{totalWinners === 1 ? '' : 's'} in all
                </p>
                <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim" size={15} />
                    <input
                        type="search"
                        className="input pl-9"
                        placeholder="Find a winner by name or ticket…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
            </div>

            {shown.length === 0 && (
                <p className="panel p-6 text-sm text-muted">{term ? 'No winner matches that search.' : 'No raffles yet.'}</p>
            )}

            {shown.map((raffle) => {
                const current = String(raffle.id) === String(raffleId);
                const winners = [...raffle.matches].sort((a, b) => a.position - b.position);
                const prize = raffle.prize_name
                    ? prizeLabel(raffle.prize_type, raffle.prize_name, raffle.prize_value ?? '')
                    : raffle.prizes?.length ? raffle.prizes.map((item) => item.prize_name).join(' · ') : 'Prize not set yet';
                return (
                    <section key={raffle.id} className={`panel p-5 ${current ? 'ring-1 ring-gold/50' : ''}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-bold text-gold/80">#{raffle.number}</span>
                                    <span className="truncate font-display text-base font-bold text-white">{raffle.name}</span>
                                    <StatusChip status={raffle.status} />
                                    {current && <span className="chip border-gold/40 bg-gold/15 text-gold-bright">On the wall</span>}
                                </p>
                                <p className="mt-1 truncate text-sm text-muted">
                                    {prize}
                                    {' · '}
                                    {formatNumber(raffle.winners_drawn ?? raffle.winners?.length ?? 0)} / {formatNumber(raffle.winners_count)} winners drawn
                                </p>
                            </div>
                            {!current && (
                                <button type="button" className="btn btn-outline px-3 py-1.5 text-xs" onClick={() => showOnWall(raffle.id)} disabled={busy}>
                                    <MonitorUp size={13} />
                                    Show on LED wall
                                </button>
                            )}
                        </div>

                        {winners.length > 0 ? (
                            <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {winners.map((winner) => (
                                    <li key={winner.id} className="flex min-w-0 items-center gap-2.5 rounded-lg border border-gold/20 bg-white/[0.03] px-3 py-2">
                                        <span className="text-xs font-bold text-gold/80">#{winner.position}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-semibold text-gold-bright">{winner.participant?.name ?? winner.ticket_number}</span>
                                            <span className="block truncate text-xs text-muted-dim">
                                                Ticket {winner.ticket_number}{winner.prize_name ? ` · ${winner.prize_name}` : ''}
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <p className="mt-3 flex items-center gap-2 text-sm text-muted-dim">
                                <Trophy size={14} />
                                No winners drawn yet.
                            </p>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
