import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Trash2, UserPlus, X } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { notifyPrizeShow } from '../../lib/prizeShowSync';
import { useToast } from '../../context/ToastContext';
import ConfirmDialog from '../ui/ConfirmDialog';
import { InlineSpinner } from '../ui/LoadingState';

// How long after the last keystroke the search runs.
const SEARCH_DELAY_MS = 250;

/**
 * The winners of a raffle drawn by hand, for the prize on the Prize Display.
 * As the host announces a name, the operator types it here, finds the person
 * in the participant list of a raffle file (the same list the manual raffle
 * was drawn from) and puts them on the screen. The screen lists everyone put
 * up so far, like a finished raffle's winners. A person who is on no list can
 * be typed in as they are. `onChange` runs after every change so the caller
 * can reload the prizes; the screen is told at once.
 */
export default function ManualWinners({ slide, onChange, compact = false }) {
    const toast = useToast();
    const winners = slide.winners ?? [];
    const [term, setTerm] = useState('');
    const [files, setFiles] = useState([]);
    const [fileId, setFileId] = useState(null);
    const [results, setResults] = useState([]);
    const [more, setMore] = useState(false);
    const [searching, setSearching] = useState(false);
    const [busy, setBusy] = useState(null);
    const [clearing, setClearing] = useState(false);
    const inputRef = useRef(null);
    const requestRef = useRef(0);

    const search = useCallback(async (q, file) => {
        const id = ++requestRef.current;
        setSearching(true);
        try {
            const { data } = await api.get('/prize-slides/participants', { params: { q, file: file ?? undefined } });
            if (id !== requestRef.current) return;
            setFiles(data.files ?? []);
            if (data.file && data.file !== file) setFileId(data.file);
            setResults(data.data ?? []);
            setMore(Boolean(data.more));
        } catch (error) {
            if (id === requestRef.current) toast.error(parseError(error, 'The participant list could not be searched.').message);
        } finally {
            if (id === requestRef.current) setSearching(false);
        }
    }, [toast]);

    // The files to search come with the first (empty) search.
    useEffect(() => {
        search('', null);
    }, [search]);

    useEffect(() => {
        const q = term.trim();
        if (!q) {
            setResults([]);
            setMore(false);
            return undefined;
        }
        const timer = setTimeout(() => search(q, fileId), SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [term, fileId, search]);

    const put = async (payload, label) => {
        setBusy(label);
        try {
            await api.post(`/prize-slides/${slide.id}/winners`, payload);
            notifyPrizeShow();
            toast.success(`${label} is on the screen.`);
            setTerm('');
            setResults([]);
            inputRef.current?.focus();
            await onChange?.();
        } catch (error) {
            toast.error(parseError(error, 'The winner could not be put on the screen.').message);
        } finally {
            setBusy(null);
        }
    };

    const remove = async (winner) => {
        setBusy(`remove-${winner.id}`);
        try {
            await api.delete(`/prize-slides/${slide.id}/winners/${winner.id}`);
            notifyPrizeShow();
            await onChange?.();
        } catch (error) {
            toast.error(parseError(error, 'The winner could not be taken off.').message);
        } finally {
            setBusy(null);
        }
    };

    const clear = async () => {
        setBusy('clear');
        try {
            await api.delete(`/prize-slides/${slide.id}/winners`);
            notifyPrizeShow();
            setClearing(false);
            await onChange?.();
        } catch (error) {
            toast.error(parseError(error, 'The winners could not be cleared.').message);
        } finally {
            setBusy(null);
        }
    };

    const alreadyUp = (person) => winners.some((winner) => (person.ticket_number && winner.ticket_number === person.ticket_number));
    const typed = term.trim();
    const file = files.find((item) => item.id === fileId) ?? null;

    return (
        <div className={compact ? 'rounded-xl border border-line bg-black/20 p-3' : ''}>
            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                    <label className="label" htmlFor={`winner-search-${slide.id}`}>
                        {compact ? 'Winner announced' : 'Name or ticket announced by the host'}
                    </label>
                    <div className="relative">
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim" />
                        <input
                            ref={inputRef}
                            id={`winner-search-${slide.id}`}
                            className="input pl-9 pr-9"
                            autoComplete="off"
                            placeholder="Type the name…"
                            value={term}
                            onChange={(event) => setTerm(event.target.value)}
                            onKeyDown={(event) => {
                                // Enter puts the only match up, or the typed name when there is none.
                                if (event.key !== 'Enter' || !typed || busy) return;
                                event.preventDefault();
                                if (results.length === 1) put({ participant_id: results[0].participant_id }, results[0].name || results[0].ticket_number);
                                else if (results.length === 0 && !searching) put({ name: typed }, typed);
                            }}
                        />
                        {term && (
                            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-white" onClick={() => setTerm('')} aria-label="Clear the search">
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>
                {files.length > 1 && (
                    <div>
                        <label className="label" htmlFor={`winner-file-${slide.id}`}>Participant list</label>
                        <select id={`winner-file-${slide.id}`} className="input" value={fileId ?? ''} onChange={(event) => setFileId(Number(event.target.value))}>
                            {files.map((item) => (
                                <option key={item.id} value={item.id}>{item.name} ({formatNumber(item.participants_count)})</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>
            {files.length === 1 && file && !compact && (
                <p className="mt-1.5 text-xs text-muted-dim">Searching the {formatNumber(file.participants_count)} participants of “{file.name}”.</p>
            )}

            {/* The matches: press one to put that person on the screen. */}
            {typed && (
                <div className="mt-3 overflow-hidden rounded-xl border border-line bg-black/30">
                    {searching && results.length === 0 && (
                        <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted"><InlineSpinner /> Searching…</p>
                    )}
                    {results.map((person) => {
                        const up = alreadyUp(person);
                        const label = person.name || person.ticket_number;
                        return (
                            <button
                                key={`${person.ticket_number}-${person.participant_id}`}
                                type="button"
                                disabled={Boolean(busy)}
                                onClick={() => put({ participant_id: person.participant_id }, label)}
                                className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left transition last:border-b-0 hover:bg-gold/10 disabled:opacity-60"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-white">{label}</span>
                                    <span className="block truncate text-xs text-muted">
                                        Ticket {person.ticket_number}
                                        {person.category ? ` · ${person.category}` : ''}
                                        {person.location ? ` · ${person.location}` : ''}
                                        {up ? ' · already on the screen' : ''}
                                    </span>
                                </span>
                                {busy === label ? <InlineSpinner /> : <span className="btn btn-gold px-3 py-1.5 text-xs">{up ? 'Show again' : 'Display'}</span>}
                            </button>
                        );
                    })}
                    {more && <p className="px-4 py-2 text-xs text-muted-dim">More people match: type a little more of the name.</p>}
                    {!searching && results.length === 0 && (
                        <button
                            type="button"
                            disabled={Boolean(busy)}
                            onClick={() => put({ name: typed }, typed)}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-gold/10 disabled:opacity-60"
                        >
                            <UserPlus size={16} className="shrink-0 text-gold" />
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-white">Display “{typed}” as typed</span>
                                <span className="block text-xs text-muted">Nobody in the list matches; the name goes up exactly like this.</span>
                            </span>
                            {busy === typed && <InlineSpinner />}
                        </button>
                    )}
                </div>
            )}

            {/* Who is on the screen now, in order. */}
            <div className="mt-4 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">
                    On the screen · {winners.length} {winners.length === 1 ? 'winner' : 'winners'}
                    {slide.raffle_id && (
                        <>
                            {' · '}
                            <Link to={`/raffles/${slide.raffle_id}`} className="normal-case tracking-normal text-gold hover:underline">Saved as a raffle</Link>
                        </>
                    )}
                </p>
                {winners.length > 0 && (
                    <button type="button" className="btn btn-ghost px-2.5 py-1 text-xs" onClick={() => setClearing(true)} disabled={Boolean(busy)}>
                        <Trash2 size={13} />
                        Clear all
                    </button>
                )}
            </div>
            {winners.length === 0 ? (
                <p className="mt-2 text-xs text-muted-dim">No winner yet: the screen shows the prize on its own. Whoever goes up here is saved as a winner, like a drawn raffle, and is out of every other raffle.</p>
            ) : (
                <ol className={`mt-2 grid gap-1.5 ${compact ? '' : 'sm:grid-cols-2'}`}>
                    {winners.map((winner) => (
                        <li key={winner.id} className="flex items-center gap-3 rounded-lg border border-line bg-black/30 px-3 py-2">
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-gold/50 bg-gold/15 text-[0.65rem] font-bold text-gold">{winner.position}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-white">{winner.name}</span>
                                {winner.ticket_number && <span className="block text-xs text-muted">Ticket {winner.ticket_number}</span>}
                            </span>
                            <button
                                type="button"
                                className="rounded p-1 text-muted transition hover:text-red-300"
                                onClick={() => remove(winner)}
                                disabled={Boolean(busy)}
                                aria-label={`Take ${winner.name} off the screen`}
                                title="Take off the screen"
                            >
                                {busy === `remove-${winner.id}` ? <InlineSpinner /> : <X size={14} />}
                            </button>
                        </li>
                    ))}
                </ol>
            )}

            <ConfirmDialog
                open={clearing}
                title="Clear every winner from the screen?"
                description={`All ${winners.length} ${winners.length === 1 ? 'winner' : 'winners'} of “${slide.prize_name}” come off the Prize Display, which goes back to showing the prize on its own.`}
                confirmLabel="Clear the winners"
                busy={busy === 'clear'}
                onConfirm={clear}
                onCancel={() => setClearing(false)}
            />
        </div>
    );
}
