import { memo, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Image as ImageIcon, Loader2, MonitorPlay, Plus, Trash2, Undo2, Wand2 } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { switchWall } from '../../lib/wallSwitch';
import { useToast } from '../../context/ToastContext';
import StagedWinnersPanel from './StagedWinnersPanel';
import CompanyLogoPanel from './CompanyLogoPanel';
import CornerLogoPanel from './CornerLogoPanel';

/**
 * The Control Center's "Pre-drawn" tab: draws whose winners were chosen
 * before the event. Make one, pick its winners with their prizes (saved as
 * they are added), then play it on the main screen — it runs like any draw,
 * countdown and rolling names and all, and lands on the chosen winners.
 *
 * Every pre-draw is separate from the ordinary raffles, and anyone on one
 * has won: no ordinary draw can pick them. A new pre-draw takes its
 * participants from `raffleId` (or, on a pre-draw, from the raffle it came from).
 * Given `raffleFileId` — a raffle file's "Pre-draw" tab — it lists that
 * file's pre-draws, and a new one takes the file's participants.
 */
export default memo(PredrawPanel);

const statusOf = (predraw) => {
    if (predraw.winners_count === 0) return { label: 'No winners yet', tone: 'border-white/10 bg-white/5 text-muted' };
    if (predraw.winners_drawn >= predraw.winners_count) return { label: 'Played', tone: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300' };
    if (predraw.winners_drawn > 0) return { label: `${predraw.winners_drawn} of ${predraw.winners_count} revealed`, tone: 'border-gold/40 bg-gold/15 text-gold-bright' };
    return { label: 'Ready to play', tone: 'border-gold/40 bg-gold/15 text-gold-bright' };
};

function PredrawPanel({ raffleId = null, raffleFileId = null, setupKey, busy = false, hidePlayed = false, onChanged = null, initialOpen = null }) {
    const toast = useToast();
    const navigate = useNavigate();
    const [predraws, setPredraws] = useState(null);
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState(null);
    // A raffle just changed into a pre-draw opens ready for its winners.
    const [open, setOpen] = useState(initialOpen);
    const [confirmConvert, setConfirmConvert] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const load = useCallback(() => (
        api.get('/predraws', { params: raffleFileId ? { raffle_file_id: raffleFileId } : undefined })
            // A raffle file lists its played pre-draws under "Completed" instead.
            .then(({ data }) => setPredraws((data.data ?? []).filter((predraw) => !hidePlayed || predraw.status !== 'COMPLETED')))
            .catch(() => setPredraws([]))
    ), [raffleFileId, hidePlayed]);
    useEffect(() => {
        load();
    }, [load]);

    const create = async (event) => {
        event.preventDefault();
        setCreating(true);
        setError(null);
        try {
            const { data } = await api.post(
                raffleFileId ? `/raffle-files/${raffleFileId}/predraws` : `/raffles/${raffleId}/predraws`,
                { name: name.trim() },
            );
            setName('');
            await load();
            onChanged?.();
            setOpen(data.data.id);
            toast.success('Pre-draw created. Now add its winners.');
        } catch (failure) {
            setError(parseError(failure, 'The pre-draw could not be created.').message);
        } finally {
            setCreating(false);
        }
    };

    const play = (predraw) => {
        // Every open screen moves, whichever setup it is.
        switchWall(predraw.id);
        toast.success(`${predraw.name} is going up on the main screen.`);
        navigate(`/raffle/${predraw.id}/control${setupKey === 'one' ? '?setup=one' : ''}`);
    };

    // Back to an ordinary raffle: only while none of its winners is revealed.
    const toRaffle = async (predraw) => {
        try {
            await api.post(`/raffles/${predraw.id}/convert`, { to: 'raffle' });
            setConfirmConvert(null);
            if (open === predraw.id) setOpen(null);
            await load();
            onChanged?.();
            toast.success(`"${predraw.name}" is an ordinary raffle again. Edit it to set its prizes, then it is ready to draw.`);
        } catch (failure) {
            toast.error(parseError(failure, 'The pre-draw could not be changed.').message);
        }
    };

    const remove = async (predraw) => {
        try {
            await api.delete(`/predraws/${predraw.id}`);
            setConfirmDelete(null);
            if (open === predraw.id) setOpen(null);
            await load();
            onChanged?.();
            toast.success('Pre-draw deleted. Its winners can win other draws again.');
        } catch (failure) {
            toast.error(parseError(failure, 'The pre-draw could not be deleted.').message);
        }
    };

    return (
        <section className="space-y-5">
            <div className="panel p-6">
                <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
                    <Wand2 size={16} className="text-gold" />
                    Pre-drawn
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                    Draws whose winners are already chosen. Pick the winners and their prizes, then play it on the main
                    screen — it runs like a real draw and lands on them. Separate from the other raffles, and anyone in a
                    pre-draw can never win another draw.
                </p>

                <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-3">
                    <div className="min-w-[14rem] flex-1">
                        <label className="label" htmlFor="predraw-name">New pre-draw</label>
                        <input
                            id="predraw-name"
                            className="input"
                            maxLength={160}
                            placeholder="e.g. Grand Prize Draw"
                            value={name}
                            disabled={creating}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </div>
                    <button type="submit" className="btn btn-gold" disabled={creating || !name.trim()}>
                        {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                        Create pre-draw
                    </button>
                </form>
                {error && <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
            </div>

            {predraws === null ? (
                <div className="grid place-items-center py-10">
                    <Loader2 size={20} className="animate-spin text-gold" />
                </div>
            ) : predraws.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">No pre-draws yet.</p>
            ) : (
                <ul className="space-y-3">
                    {predraws.map((predraw) => {
                        const status = statusOf(predraw);
                        const expanded = open === predraw.id;
                        const current = String(predraw.id) === String(raffleId);
                        return (
                            <li key={predraw.id} className={`panel p-5 ${current ? 'ring-1 ring-gold/40' : ''}`}>
                                <div className="flex flex-wrap items-start gap-3">
                                    <div className="min-w-[12rem] flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-display text-base font-bold text-white">{predraw.name}</p>
                                            <span className={`chip ${status.tone}`}>{status.label}</span>
                                            {current && <span className="chip border-gold/40 bg-gold/15 text-gold-bright">Open now</span>}
                                        </div>
                                        <p className="mt-1 text-xs text-muted">
                                            {predraw.prizes.length
                                                ? predraw.prizes.map((prize) => `${prize.prize_name} × ${prize.count}`).join(' · ')
                                                : 'Add its winners and prizes below.'}
                                        </p>
                                        {predraw.winners?.length > 0 && (
                                            <p className="mt-1.5 text-sm text-white/85">
                                                {predraw.winners.map((winner) => winner.name || winner.ticket_number).join(', ')}
                                            </p>
                                        )}
                                        {predraw.source_raffle && (
                                            <p className="mt-0.5 text-xs text-muted-dim">Participants from {predraw.source_raffle.name}</p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            onClick={() => setOpen(expanded ? null : predraw.id)}
                                            aria-expanded={expanded}
                                        >
                                            {expanded ? 'Close' : 'Set up'}
                                            <ChevronDown size={14} className={`transition ${expanded ? 'rotate-180' : ''}`} />
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-gold"
                                            onClick={() => play(predraw)}
                                            disabled={busy || predraw.winners_count === 0}
                                            title={predraw.winners_count === 0 ? 'Add winners first' : busy ? 'Wait for the current draw to finish' : 'Put it on the main screen'}
                                        >
                                            <MonitorPlay size={15} />
                                            Play on main screen
                                        </button>
                                        {predraw.winners_drawn === 0 && !current && (
                                            confirmConvert === predraw.id ? (
                                                <>
                                                    <button type="button" className="btn btn-outline" onClick={() => toRaffle(predraw)}>Yes, make it a raffle</button>
                                                    <button type="button" className="btn btn-ghost" onClick={() => setConfirmConvert(null)}>Cancel</button>
                                                </>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost"
                                                    onClick={() => setConfirmConvert(predraw.id)}
                                                    title="Change back to an ordinary raffle — its picked winners are released"
                                                >
                                                    <Undo2 size={15} /> Make it a raffle
                                                </button>
                                            )
                                        )}
                                        {confirmDelete === predraw.id ? (
                                            <>
                                                <button type="button" className="btn btn-ghost text-red-300" onClick={() => remove(predraw)}>Yes, delete</button>
                                                <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
                                            </>
                                        ) : (
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                onClick={() => setConfirmDelete(predraw.id)}
                                                disabled={current}
                                                title={current ? 'Open another raffle to delete this one' : 'Delete pre-draw'}
                                                aria-label="Delete pre-draw"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {expanded && <PredrawEditor predrawId={predraw.id} busy={busy} onSaved={load} />}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

/**
 * One pre-draw, set up in place: 1. the prize and its winners (saved as they
 * are added), 2. optionally, its logos — they start as the main raffle's.
 */
function PredrawEditor({ predrawId, busy, onSaved }) {
    const [raffle, setRaffle] = useState(null);
    const [logosOpen, setLogosOpen] = useState(false);

    const load = useCallback(() => (
        api.get(`/raffles/${predrawId}/display`)
            .then(({ data }) => setRaffle(data.data))
            .catch(() => {})
    ), [predrawId]);
    useEffect(() => {
        load();
    }, [load]);

    const saved = useCallback(() => Promise.all([load(), onSaved()]), [load, onSaved]);

    if (!raffle) {
        return (
            <div className="mt-4 grid place-items-center py-6">
                <Loader2 size={18} className="animate-spin text-gold" />
            </div>
        );
    }

    return (
        <div className="mt-4 space-y-4">
            <StagedWinnersPanel raffle={raffle} raffleId={predrawId} midDraw={busy} onSaved={saved} />

            <section className="rounded-xl border border-line bg-black/20">
                <button
                    type="button"
                    className="flex w-full items-center gap-2 px-5 py-4 text-left"
                    onClick={() => setLogosOpen((value) => !value)}
                    aria-expanded={logosOpen}
                >
                    <ImageIcon size={16} className="text-gold" />
                    <span className="font-display text-base font-bold text-white">Logos</span>
                    <span className="text-xs text-muted">Optional — starts with the main raffle&apos;s logos</span>
                    <ChevronDown size={15} className={`ml-auto text-muted transition ${logosOpen ? 'rotate-180' : ''}`} />
                </button>
                {logosOpen && (
                    <div className="space-y-4 px-5 pb-5">
                        <CompanyLogoPanel raffle={raffle} raffleId={predrawId} onSaved={load} />
                        <CornerLogoPanel raffle={raffle} raffleId={predrawId} onSaved={load} />
                    </div>
                )}
            </section>
        </div>
    );
}
