import { memo, useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Gift, Loader2, Plus, Search, Trash2, Wand2, X } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

/**
 * Pre-selected winners — for a raffle whose winners were chosen before the
 * event. The operator types a prize, ticks everyone who won it, and adds
 * them in one go; prize by prize, in the order they should come out. On the
 * screens the draw runs as usual (countdown, rolling names, reveal) and each
 * draw lands on the next winner here. Every change is saved straight away;
 * emptying the list makes the raffle an ordinary random draw again.
 *
 * Winners already revealed stay where they are.
 */
export default memo(StagedWinnersPanel);

const fromServer = (list = []) => list.map((entry) => ({
    participant_id: entry.participant_id,
    name: entry.name,
    ticket_number: entry.ticket_number,
    prize_name: entry.prize_name ?? '',
}));

/** The list as prize groups: each run of winners with the same prize. */
function groupsOf(rows) {
    const groups = [];
    rows.forEach((row, index) => {
        const last = groups[groups.length - 1];
        if (last && last.prize === row.prize_name) last.rows.push({ ...row, index });
        else groups.push({ prize: row.prize_name, start: index, rows: [{ ...row, index }] });
    });
    return groups;
}

function StagedWinnersPanel({ raffle, raffleId, midDraw, onSaved }) {
    const toast = useToast();
    const [serverList, setServerList] = useState([]);
    // Who already won elsewhere: ticket number => where.
    const [wonElsewhere, setWonElsewhere] = useState({});
    const [rows, setRows] = useState([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const revealed = raffle.winners?.length ?? 0;
    const blockedByPrizes = (raffle.prizes?.length ?? 0) > 0;
    const [loaded, setLoaded] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    // Who is on the list is admin-only, so it is loaded here rather than
    // with the raffle (which comes from the screens' public feed). Loaded
    // again when the prizes on the list or the winners drawn change.
    const stagedKey = JSON.stringify(raffle.staged_prizes ?? []);
    const load = useCallback(() => (
        api.get(`/raffles/${raffleId}/staged-winners`)
            .then(({ data }) => {
                setServerList(data.data ?? []);
                setWonElsewhere(data.won_elsewhere ?? {});
            })
            .catch(() => {})
            .finally(() => setLoaded(true))
    ), [raffleId]);
    useEffect(() => {
        load();
    }, [load, stagedKey, revealed]);

    // Follow the server (winners revealed, a change from another window).
    const serverKey = JSON.stringify(serverList);
    useEffect(() => {
        setRows(fromServer(serverList));
    }, [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // Every change is saved straight away. The list shows the change at
    // once, and goes back to what is saved if the server turns it down.
    const persist = async (next, done) => {
        setRows(next);
        setSaving(true);
        setError(null);
        try {
            await api.put(`/raffles/${raffleId}/staged-winners`, {
                winners: next.map((row) => ({ participant_id: row.participant_id, prize_name: row.prize_name })),
            });
            await Promise.all([load(), onSaved()]);
            if (done) toast.success(done);
            return true;
        } catch (failure) {
            const parsed = parseError(failure, 'The winners could not be saved.');
            const first = Object.values(parsed.errors ?? {})[0]?.[0];
            setError(first ?? parsed.message);
            setRows(fromServer(serverList));
            return false;
        } finally {
            setSaving(false);
        }
    };

    const groups = groupsOf(rows);
    const fromGroups = (list) => list.flatMap((group) => group.rows.map(({ index, ...row }) => row));

    const renameGroup = (group, name) => persist(rows.map((row, at) => (
        at >= group.start && at < group.start + group.rows.length ? { ...row, prize_name: name } : row
    )));
    const moveGroup = (at, by) => {
        const next = [...groups];
        [next[at], next[at + by]] = [next[at + by], next[at]];
        persist(fromGroups(next));
    };
    const removeGroup = (at) => persist(fromGroups(groups.filter((_, index) => index !== at)), 'Prize removed.');
    const removePerson = (index) => persist(rows.filter((_, at) => at !== index));
    const addMany = (people, prize) => persist([
        ...rows,
        ...people.map((person) => ({
            participant_id: person.id,
            name: person.name,
            ticket_number: person.ticket_number,
            prize_name: prize,
        })),
    ], `${people.length} winner${people.length === 1 ? '' : 's'} saved for ${prize}. The draw is ready.`);

    // Winners from an earlier, ordinary draw hold the first places, so the
    // list cannot start until they are cleared.
    const earlierWinners = loaded && revealed > serverList.length ? revealed : 0;
    const clearEarlier = async () => {
        setSaving(true);
        setError(null);
        try {
            // The cleared winners go back into the participant list, so they
            // can be picked here.
            await api.post(`/raffles/${raffleId}/redraw`, { include_previous_winners: true });
            setConfirmClear(false);
            await Promise.all([load(), onSaved()]);
            toast.success('Earlier winners cleared. Add the pre-selected winners now.');
        } catch (failure) {
            setError(parseError(failure, 'The earlier winners could not be cleared.').message);
        } finally {
            setSaving(false);
        }
    };

    const locked = midDraw || saving || blockedByPrizes || earlierWinners > 0;
    const listed = new Set(rows.map((row) => row.participant_id));
    // A prize group with a winner already revealed stays where it is.
    const isFixed = (group) => Boolean(group) && group.start < revealed;

    return (
        <section className="panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
                        <Wand2 size={16} className="text-gold" />
                        Pre-selected winners
                    </h2>
                    <p className="mt-0.5 text-xs text-muted">
                        {blockedByPrizes
                            ? 'This raffle has a prize list. Remove it below to reveal winners chosen before the event.'
                            : rows.length
                                ? `The draw reveals these ${rows.length} winner${rows.length === 1 ? '' : 's'} prize by prize, top to bottom — no random pick.`
                                : 'Winners already chosen? Type a prize, tick everyone who won it, and the draw on the screens reveals them.'}
                        {midDraw && ' Locked while a draw is running.'}
                    </p>
                </div>
                {saving && <Loader2 size={16} className="shrink-0 animate-spin text-gold" />}
            </div>

            {!blockedByPrizes && (
                <>
                    {groups.length > 0 && (
                        <ol className="mt-4 space-y-3">
                            {groups.map((group, at) => {
                                const fixed = isFixed(group);
                                return (
                                    <li key={`${group.start}-${group.rows[0].participant_id}`} className="rounded-xl border border-line bg-black/30 p-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Gift size={15} className="shrink-0 text-gold" />
                                            <PrizeName
                                                value={group.prize}
                                                disabled={locked || fixed}
                                                onSave={(name) => renameGroup(group, name)}
                                            />
                                            <span className="text-xs text-muted-dim">
                                                {group.rows.length} winner{group.rows.length === 1 ? '' : 's'}
                                            </span>
                                            <span className="flex gap-1">
                                                <IconButton label="Move prize up" onClick={() => moveGroup(at, -1)} disabled={locked || fixed || at === 0 || isFixed(groups[at - 1])}><ArrowUp size={14} /></IconButton>
                                                <IconButton label="Move prize down" onClick={() => moveGroup(at, 1)} disabled={locked || fixed || at === groups.length - 1}><ArrowDown size={14} /></IconButton>
                                                <IconButton
                                                    label={fixed ? 'Already revealed — use Redraw to start over' : 'Remove this prize and its winners'}
                                                    onClick={() => removeGroup(at)}
                                                    disabled={locked || fixed}
                                                    danger
                                                >
                                                    <Trash2 size={14} />
                                                </IconButton>
                                            </span>
                                        </div>

                                        <ul className="mt-3 flex flex-wrap gap-2">
                                            {group.rows.map((row) => {
                                                const done = row.index < revealed;
                                                return (
                                                    <li
                                                        key={row.participant_id}
                                                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${done ? 'border-gold/30 bg-gold/[0.06]' : 'border-line bg-black/40'}`}
                                                    >
                                                        <span className="font-display text-xs font-extrabold text-gold/80">#{row.index + 1}</span>
                                                        <span className="max-w-[14rem] truncate font-semibold text-white">{row.name || 'Unnamed participant'}</span>
                                                        <span className="text-xs text-muted-dim">{done ? 'Revealed' : row.ticket_number}</span>
                                                        {!done && (
                                                            <button
                                                                type="button"
                                                                className="rounded p-0.5 text-muted transition hover:text-red-300 disabled:opacity-35"
                                                                onClick={() => removePerson(row.index)}
                                                                disabled={locked}
                                                                aria-label={`Remove ${row.name || 'winner'}`}
                                                                title="Remove"
                                                            >
                                                                <X size={13} />
                                                            </button>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </li>
                                );
                            })}
                        </ol>
                    )}

                    {earlierWinners > 0 ? (
                        <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
                            <p className="text-sm font-semibold text-amber-200">
                                This raffle already has {earlierWinners} winner{earlierWinners === 1 ? '' : 's'} from an earlier draw.
                            </p>
                            <p className="mt-1 text-sm text-muted">
                                They hold the first places, so pre-selected winners cannot be added until they are cleared.
                                Clearing puts them back in the participant list and keeps the earlier draw in the audit log.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {confirmClear ? (
                                    <>
                                        <button type="button" className="btn btn-gold" onClick={clearEarlier} disabled={saving || midDraw}>
                                            {saving && <Loader2 size={15} className="animate-spin" />}
                                            Yes, clear {earlierWinners} winner{earlierWinners === 1 ? '' : 's'}
                                        </button>
                                        <button type="button" className="btn btn-ghost" onClick={() => setConfirmClear(false)} disabled={saving}>Cancel</button>
                                    </>
                                ) : (
                                    <button type="button" className="btn btn-outline" onClick={() => setConfirmClear(true)} disabled={midDraw}>
                                        <Trash2 size={15} />
                                        Clear earlier winners
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <AddWinners raffleId={raffleId} listed={listed} wonElsewhere={wonElsewhere} disabled={locked} onAdd={addMany} />
                    )}
                </>
            )}

            {error && <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}

        </section>
    );
}

/**
 * Adds a batch of winners who all won the same prize: type the prize, tick
 * the people (searching as often as needed — ticks are kept), then add.
 */
function AddWinners({ raffleId, listed, wonElsewhere, disabled, onAdd }) {
    const [prize, setPrize] = useState('');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [picked, setPicked] = useState(() => new Map());

    useEffect(() => {
        const term = query.trim();
        if (!term) {
            setResults([]);
            return undefined;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const { data } = await api.get(`/raffles/${raffleId}/participants`, { params: { search: term, per_page: 25, sort: 'name' } });
                if (!cancelled) setResults(data.data ?? []);
            } catch {
                if (!cancelled) setResults([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, raffleId]);

    const toggle = (person) => setPicked((current) => {
        const next = new Map(current);
        if (next.has(person.id)) next.delete(person.id);
        else next.set(person.id, person);
        return next;
    });
    // Already on this list, or already won elsewhere: cannot be picked.
    const takenBy = (person) => (listed.has(person.id) ? 'Already listed' : wonElsewhere[person.ticket_number] ? `Already won · ${wonElsewhere[person.ticket_number]}` : null);
    const pickable = results.filter((person) => !takenBy(person));
    const allShownPicked = pickable.length > 0 && pickable.every((person) => picked.has(person.id));
    const toggleAllShown = () => setPicked((current) => {
        const next = new Map(current);
        pickable.forEach((person) => (allShownPicked ? next.delete(person.id) : next.set(person.id, person)));
        return next;
    });

    const chosen = [...picked.values()].filter((person) => !takenBy(person));
    const canAdd = !disabled && prize.trim() !== '' && chosen.length > 0;
    // The form clears once the winners are saved; if the save fails they
    // stay ticked so it can be tried again.
    const add = async () => {
        if (!(await onAdd(chosen, prize.trim()))) return;
        setPicked(new Map());
        setQuery('');
        setPrize('');
    };

    return (
        <div className="mt-5 rounded-xl border border-dashed border-line p-4">
            <p className="font-display text-sm font-bold text-white">Add winners</p>

            <div className="mt-3">
                <label className="label" htmlFor={`staged-prize-${raffleId}`}>1. Prize they won</label>
                <input
                    id={`staged-prize-${raffleId}`}
                    className="input"
                    maxLength={160}
                    placeholder="e.g. Brand New Car"
                    value={prize}
                    disabled={disabled}
                    onChange={(event) => setPrize(event.target.value)}
                />
            </div>

            <div className="mt-3">
                <label className="label" htmlFor={`staged-search-${raffleId}`}>2. Tick the winners</label>
                <div className="relative">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim" />
                    <input
                        id={`staged-search-${raffleId}`}
                        type="search"
                        className="input pl-9"
                        placeholder="Search by name or ticket number"
                        value={query}
                        disabled={disabled}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                    {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gold" />}
                </div>

                {query.trim() && !loading && results.length === 0 && (
                    <p className="mt-2 text-sm text-muted">No one matches.</p>
                )}

                {results.length > 0 && (
                    <div className="mt-2 overflow-hidden rounded-xl border border-line">
                        {pickable.length > 1 && (
                            <button
                                type="button"
                                onClick={toggleAllShown}
                                disabled={disabled}
                                className="flex w-full items-center gap-3 border-b border-line bg-black/50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted transition hover:text-white"
                            >
                                <Tick on={allShownPicked} />
                                {allShownPicked ? 'Untick all shown' : `Tick all ${pickable.length} shown`}
                            </button>
                        )}
                        <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                            {results.map((person) => {
                                const taken = takenBy(person);
                                const on = picked.has(person.id);
                                return (
                                    <li key={person.id}>
                                        <button
                                            type="button"
                                            disabled={disabled || Boolean(taken)}
                                            onClick={() => toggle(person)}
                                            aria-pressed={on}
                                            className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition disabled:opacity-40 ${on ? 'bg-gold/[0.1]' : 'bg-black/30 hover:bg-gold/[0.05]'}`}
                                        >
                                            <Tick on={on} />
                                            <span className="min-w-0 flex-1 truncate font-semibold text-white">{person.name || 'Unnamed participant'}</span>
                                            <span className="shrink-0 text-xs text-muted-dim">{taken ?? `Ticket ${person.ticket_number}`}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>

            {chosen.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                    {chosen.map((person) => (
                        <li key={person.id} className="flex items-center gap-1.5 rounded-full border border-gold/35 bg-gold/[0.08] py-1 pl-3 pr-1.5 text-xs font-semibold text-white">
                            {person.name || person.ticket_number}
                            <button type="button" onClick={() => toggle(person)} className="rounded-full p-0.5 text-muted hover:text-white" aria-label={`Untick ${person.name || 'participant'}`}>
                                <X size={12} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
                {chosen.length > 0 && !prize.trim() && <span className="text-xs text-muted">Type the prize first.</span>}
                <button type="button" className="btn btn-outline" onClick={add} disabled={!canAdd}>
                    <Plus size={15} />
                    {chosen.length
                        ? `Save ${chosen.length} winner${chosen.length === 1 ? '' : 's'}${prize.trim() ? ` — ${prize.trim()}` : ''}`
                        : 'Add winners'}
                </button>
            </div>
        </div>
    );
}

/** A prize's name, saved when the operator leaves the field or presses Enter. */
function PrizeName({ value, disabled, onSave }) {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    const commit = () => {
        const name = draft.trim();
        if (!name) setDraft(value);
        else if (name !== value) onSave(name);
    };
    return (
        <input
            className="input min-w-[12rem] flex-1 font-semibold"
            maxLength={160}
            placeholder="Prize"
            aria-label="Prize"
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') setDraft(value);
            }}
        />
    );
}

function Tick({ on }) {
    return (
        <span className={`grid size-4 shrink-0 place-items-center rounded border ${on ? 'border-gold bg-gold text-black' : 'border-line bg-black/40'}`} aria-hidden="true">
            {on && <Check size={12} strokeWidth={3} />}
        </span>
    );
}

function IconButton({ label, onClick, disabled, danger, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={label}
            aria-label={label}
            className={`rounded-lg border border-line p-1.5 text-muted transition disabled:opacity-35 ${
                danger ? 'hover:border-red-400/40 hover:text-red-300' : 'hover:border-gold/35 hover:text-gold'
            }`}
        >
            {children}
        </button>
    );
}
