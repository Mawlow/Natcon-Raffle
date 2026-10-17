import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ListMusic, Loader2, Lock, Play, RotateCw, Wand2 } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { switchWall } from '../../lib/wallSwitch';
import { dayLabel, setLabel } from '../../lib/sets';
import { useToast } from '../../context/ToastContext';

/**
 * The event's running order, right beside the big button: Day 1, Day 2, …
 * then that day's sets, then the raffles in the open set, in playing order.
 * One click on a raffle puts it on the LED wall and moves this Control
 * Center to it, ready to draw; a raffle already played is played again with
 * the same winners in the same click. Pre-draws and ordinary raffles alike.
 */
export default memo(PlaylistPanel);

const DONE = ['COMPLETED', 'CANCELLED'];
const order = (a, b) => (a === null ? 1 : b === null ? -1 : a - b);
const played = (raffle) => (raffle.winners_drawn ?? 0) > 0;

function PlaylistPanel({ raffleId, raffleFileId = null, setupKey, busy = false, reloadKey = null, onReplayed = null }) {
    const navigate = useNavigate();
    const toast = useToast();
    const [raffles, setRaffles] = useState(null);
    const [files, setFiles] = useState([]);
    // The file, day and set open in the list. Null means "not chosen yet":
    // they follow the raffle on the wall until the operator picks one.
    const [file, setFile] = useState(null);
    const [day, setDay] = useState(null);
    const [set, setSet] = useState(null);
    const [working, setWorking] = useState(null);

    const load = useCallback(() => (
        api.get('/raffles', { params: { per_page: 100, include_predraws: 1 } })
            .then(({ data }) => setRaffles(data.data))
            .catch(() => setRaffles([]))
    ), []);
    useEffect(() => { load(); }, [load, reloadKey]);
    useEffect(() => {
        api.get('/raffle-files').then(({ data }) => setFiles(data.data)).catch(() => setFiles([]));
    }, []);

    // Moving to another raffle opens the list on its file, day and set.
    const here = raffles?.find((raffle) => String(raffle.id) === String(raffleId)) ?? null;
    useEffect(() => {
        if (!here) return;
        setFile(here.raffle_file_id ? String(here.raffle_file_id) : '');
        setDay(here.draw_day ?? null);
        setSet(here.draw_set ?? null);
    }, [here?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    const fileId = file ?? (raffleFileId ? String(raffleFileId) : '');

    const inFile = useMemo(() => (raffles ?? []).filter((raffle) => !fileId || String(raffle.raffle_file_id) === fileId), [raffles, fileId]);
    const days = useMemo(() => [...new Set(inFile.map((raffle) => raffle.draw_day ?? null))].sort(order), [inFile]);
    const inDay = useMemo(() => inFile.filter((raffle) => (raffle.draw_day ?? null) === day), [inFile, day]);
    const sets = useMemo(() => [...new Set(inDay.map((raffle) => raffle.draw_set ?? null))].sort(order), [inDay]);
    const listed = useMemo(() => inDay.filter((raffle) => (raffle.draw_set ?? null) === set), [inDay, set]);

    // A day or set that is not there (another file chosen): the first one.
    useEffect(() => {
        if (raffles && days.length && !days.includes(day)) setDay(days[0]);
    }, [raffles, days, day]);
    useEffect(() => {
        if (raffles && sets.length && !sets.includes(set)) setSet(sets[0]);
    }, [raffles, sets, set]);

    const setupQuery = setupKey === 'three' ? '?setup=three' : '';
    const goTo = (raffle) => {
        switchWall(raffle.id, setupKey === 'one' ? 'single' : 'display');
        navigate(`/raffle/${raffle.id}/control${setupQuery}`);
    };

    // Play: onto the wall, ready to draw. Played already: its revealed
    // winners are cleared first, so the same ones come out again.
    const play = async (raffle) => {
        const current = String(raffle.id) === String(raffleId);
        if (!played(raffle)) {
            if (!current) {
                goTo(raffle);
                toast.success(`${raffle.name} is on the LED wall, ready to draw.`);
            }
            return;
        }
        setWorking(raffle.id);
        try {
            await api.post(`/raffles/${raffle.id}/replay`);
            if (current) await onReplayed?.();
            else goTo(raffle);
            load();
            toast.success(`${raffle.name} is on the LED wall: the draw reveals the same winners again.`, { title: 'Ready to play again' });
        } catch (error) {
            toast.error(parseError(error, 'The raffle could not be played again.').message);
        } finally {
            setWorking(null);
        }
    };

    // The raffle lined up after the one on the wall, in this set.
    const index = listed.findIndex((raffle) => String(raffle.id) === String(raffleId));
    const next = index >= 0 ? listed.slice(index + 1).find((raffle) => !played(raffle) && !DONE.includes(raffle.status)) : null;

    return (
        <section className="panel p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
                        <ListMusic size={16} className="text-gold" /> Playlist
                    </h2>
                    <p className="mt-0.5 text-xs text-muted">Pick the day and set, then one click plays a raffle — or plays it again with the same winners.</p>
                </div>
                {files.length > 1 && (
                    <select className="input w-32 shrink-0 px-2 py-1.5 text-xs" aria-label="Raffle file" value={fileId} onChange={(event) => setFile(event.target.value)}>
                        <option value="">All files</option>
                        {files.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                )}
            </div>

            {raffles === null ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Loading…</p>
            ) : inFile.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No raffles here yet.</p>
            ) : (
                <>
                    {days.length > 1 || days[0] !== null ? (
                        <div className="mt-4 flex flex-wrap gap-1 rounded-lg border border-line bg-black/40 p-1" role="tablist" aria-label="Day">
                            {days.map((item) => (
                                <button
                                    key={item ?? 'none'}
                                    type="button"
                                    role="tab"
                                    aria-selected={item === day}
                                    onClick={() => setDay(item)}
                                    className={`flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition ${item === day ? 'bg-gold text-black' : 'text-muted hover:text-white'}`}
                                >
                                    {item === null ? 'No day' : dayLabel(item)}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    {(sets.length > 1 || sets[0] !== null) && (
                        <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Set">
                            {sets.map((item) => {
                                const members = inDay.filter((raffle) => (raffle.draw_set ?? null) === item);
                                const done = members.filter((raffle) => played(raffle) || DONE.includes(raffle.status)).length;
                                return (
                                    <button
                                        key={item ?? 'none'}
                                        type="button"
                                        role="tab"
                                        aria-selected={item === set}
                                        onClick={() => setSet(item)}
                                        className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                            item === set ? 'border-gold/60 bg-gold/15 text-gold-bright' : 'border-line text-muted hover:border-gold/30 hover:text-white'
                                        }`}
                                    >
                                        {item === null ? 'No set' : setLabel(item)}
                                        <span className="ml-1.5 font-normal text-muted-dim">{done}/{members.length}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <ol className="mt-3 space-y-1.5">
                        {listed.map((raffle, position) => {
                            const current = String(raffle.id) === String(raffleId);
                            const again = played(raffle);
                            const isNext = next && next.id === raffle.id;
                            const spinning = working === raffle.id;
                            return (
                                <li
                                    key={raffle.id}
                                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
                                        current ? 'border-gold/50 bg-gold/[0.08]' : isNext ? 'border-gold/25 bg-black/30' : 'border-line bg-black/30'
                                    }`}
                                >
                                    <span className="w-5 shrink-0 text-right text-xs font-bold text-gold/80">{position + 1}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5">
                                            <span className={`truncate text-sm font-semibold ${current ? 'text-gold-bright' : 'text-white'}`}>{raffle.name}</span>
                                            {raffle.is_predraw && <Wand2 size={12} className="shrink-0 text-gold/70" title="Pre-draw" />}
                                            {raffle.is_locked && <Lock size={12} className="shrink-0 text-emerald-300" title="Winners locked" />}
                                        </span>
                                        <span className="block truncate text-xs text-muted-dim">
                                            {current ? 'On the wall' : isNext ? 'Up next' : again ? 'Played' : raffle.status === 'DRAFT' ? 'Draft' : 'Ready'}
                                            {' · '}
                                            {raffle.winners_drawn ?? 0}/{raffle.winners_count} winners
                                        </span>
                                    </span>
                                    {current && !again ? (
                                        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-gold-bright"><Check size={13} /> Ready</span>
                                    ) : (
                                        <button
                                            type="button"
                                            className={`btn shrink-0 px-2.5 py-1 text-xs ${again ? 'btn-outline' : 'btn-gold'}`}
                                            onClick={() => play(raffle)}
                                            disabled={busy || working !== null}
                                            title={again ? 'Play again: the same winners come out in the same order' : 'Put it on the LED wall, ready to draw'}
                                        >
                                            {spinning ? <Loader2 size={13} className="animate-spin" /> : again ? <RotateCw size={13} /> : <Play size={13} />}
                                            {again ? 'Replay' : 'Play'}
                                        </button>
                                    )}
                                </li>
                            );
                        })}
                        {listed.length === 0 && <li className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">Nothing in this set.</li>}
                    </ol>
                    {busy && <p className="mt-2 text-xs text-muted-dim">Wait for the current draw to finish before switching.</p>}
                </>
            )}
        </section>
    );
}
