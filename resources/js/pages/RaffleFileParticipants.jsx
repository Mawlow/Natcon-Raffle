import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Gift, Layers, MonitorPlay, Search, Trophy, Users } from 'lucide-react';
import api, { parseError } from '../lib/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import LoadingState, { InlineSpinner } from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import StatusChip from '../components/ui/StatusChip';
import { useToast } from '../context/ToastContext';
import { formatDateTime, formatNumber } from '../lib/format';
import { dayLabel, setLabel } from '../lib/sets';

const PER_PAGE = 50;

/**
 * Everyone in a raffle file, searchable, each with what they have won at
 * the event: the raffle, the prize, the day and the set of every win. One
 * list serves all of the file's raffles, so this is the place to answer
 * "has this person won, and what?" without opening each raffle in turn.
 */
export default function RaffleFileParticipants() {
    const { file: fileId } = useParams();
    const toast = useToast();

    const [raffleFile, setRaffleFile] = useState(null);
    const [rows, setRows] = useState(null);
    const [meta, setMeta] = useState(null);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);

    const [search, setSearch] = useState('');
    const [winnersOnly, setWinnersOnly] = useState(false);
    const [page, setPage] = useState(1);

    useEffect(() => {
        api.get(`/raffle-files/${fileId}`)
            .then(({ data }) => setRaffleFile(data.data))
            .catch((error) => toast.error(parseError(error, 'The raffle file could not be loaded.').message));
    }, [fileId, toast]);

    const load = useCallback(async () => {
        const { data } = await api.get(`/raffle-files/${fileId}/participants`, {
            params: { page, per_page: PER_PAGE, search: search.trim() || undefined, winners: winnersOnly ? 1 : undefined },
        });
        setRows(data.data);
        setMeta(data.meta);
        setSummary(data.summary);
    }, [fileId, page, search, winnersOnly]);

    // Searching waits for a pause in typing.
    useEffect(() => {
        setSearching(true);
        const timer = setTimeout(() => {
            load()
                .catch((error) => toast.error(parseError(error, 'Participants could not be loaded.').message))
                .finally(() => { setLoading(false); setSearching(false); });
        }, search ? 300 : 0);
        return () => clearTimeout(timer);
    }, [load, search, toast]);

    const changeSearch = (value) => { setSearch(value); setPage(1); };
    const toggleWinners = () => { setWinnersOnly((current) => !current); setPage(1); };

    const term = search.trim();

    return (
        <DashboardLayout
            title={raffleFile ? `${raffleFile.name} — Participants` : 'Participants'}
            subtitle="Everyone in the file, and what each of them has won"
            actions={
                <Link to={`/raffle-files/${fileId}`} className="btn btn-ghost">
                    <ArrowLeft size={15} /> <span className="hidden sm:inline">Back to the file</span>
                </Link>
            }
        >
            {/* Search and the two counts */}
            <div className="panel mb-5 flex flex-wrap items-center gap-3 p-4">
                <div className="relative min-w-[16rem] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim" size={15} />
                    <input
                        type="search"
                        className="input pl-9"
                        placeholder="Search by name, ticket number, phone or email…"
                        value={search}
                        onChange={(event) => changeSearch(event.target.value)}
                        autoFocus
                    />
                </div>
                <button
                    type="button"
                    className={`btn px-3 py-2 text-xs ${winnersOnly ? 'btn-gold' : 'btn-outline'}`}
                    onClick={toggleWinners}
                    aria-pressed={winnersOnly}
                >
                    <Trophy size={13} />
                    Winners only
                </button>
                {summary && (
                    <p className="w-full text-sm text-muted sm:w-auto">
                        <span className="font-semibold text-white">{formatNumber(summary.people)}</span> participant{summary.people === 1 ? '' : 's'}
                        {' · '}
                        <span className="font-semibold text-gold-bright">{formatNumber(summary.winners)}</span> winner{summary.winners === 1 ? '' : 's'}
                        {searching && <InlineSpinner className="ml-2" />}
                    </p>
                )}
            </div>

            {loading ? (
                <LoadingState label="Loading participants…" />
            ) : rows.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title={term ? 'Nobody matches that search' : winnersOnly ? 'No winners yet' : 'No participants yet'}
                    description={term
                        ? 'Try a different spelling, or a ticket number or phone number.'
                        : winnersOnly ? 'Winners show up here as the raffles are drawn.' : 'Upload the participant CSV in the raffle file first.'}
                />
            ) : (
                <>
                    <ol className="space-y-2">
                        {rows.map((person) => <PersonRow key={person.id} person={person} />)}
                    </ol>
                    <Pagination meta={meta} onChange={setPage} />
                </>
            )}
        </DashboardLayout>
    );
}

/** One person: who they are, then each of their wins with its raffle, prize, day and set. */
function PersonRow({ person }) {
    const won = person.wins.length > 0;
    const details = [
        person.phone,
        person.email,
        person.category,
        person.location,
        Array.isArray(person.developers) && person.developers.length ? person.developers.join(', ') : null,
    ].filter(Boolean);

    return (
        <li className={`panel p-4 ${won ? 'ring-1 ring-gold/30' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                        <span className={`truncate font-display text-base font-bold ${won ? 'text-gold-bright' : 'text-white'}`}>
                            {person.name || <span className="text-muted">No name</span>}
                        </span>
                        <span className="tabular rounded border border-line bg-black/30 px-1.5 py-0.5 text-xs text-muted">Ticket {person.ticket_number}</span>
                        <StatusChip status={person.status} />
                    </p>
                    {details.length > 0 && <p className="mt-1 truncate text-xs text-muted-dim">{details.join(' · ')}</p>}
                </div>
                <p className={`flex shrink-0 items-center gap-1.5 text-xs font-semibold ${won ? 'text-gold' : 'text-muted-dim'}`}>
                    <Trophy size={13} />
                    {won ? `${person.wins.length} win${person.wins.length === 1 ? '' : 's'}` : 'No wins yet'}
                </p>
            </div>

            {won && (
                <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                    {person.wins.map((win) => <WinCard key={win.id} win={win} />)}
                </ol>
            )}
        </li>
    );
}

function WinCard({ win }) {
    const day = win.draw_day ? dayLabel(win.draw_day) : win.event_day;
    return (
        <li className="rounded-lg border border-gold/20 bg-gold/[0.04] px-3 py-2.5">
            <p className="flex min-w-0 items-center gap-2">
                <span className="text-xs font-bold text-gold/80">#{win.position}</span>
                <Link to={`/raffles/${win.raffle_id}`} className="truncate text-sm font-semibold text-white hover:text-gold">{win.raffle_name}</Link>
                {win.on_stage && (
                    <span className="chip shrink-0 border-gold/30 bg-gold/10 text-[0.65rem] text-gold" title="Announced on stage through the Prize Display">
                        <MonitorPlay size={11} /> On stage
                    </span>
                )}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1 text-gold-bright"><Gift size={12} /> {win.prize_name || 'Prize not set'}</span>
                {day && <span className="flex items-center gap-1"><Calendar size={12} /> {day}</span>}
                {win.draw_set && <span className="flex items-center gap-1"><Layers size={12} /> {setLabel(win.draw_set)}</span>}
                {win.drawn_at && <span className="text-muted-dim">{formatDateTime(win.drawn_at)}</span>}
            </p>
        </li>
    );
}
