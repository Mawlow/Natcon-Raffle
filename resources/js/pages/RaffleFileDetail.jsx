import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Check, CheckCircle2, ChevronRight, Folder, FolderOpen, ListChecks, Gift, Lock, MonitorPlay, Pencil, Play, Plus, Trash2, Upload, Users, Wand2, X } from 'lucide-react';
import api, { parseError } from '../lib/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import RaffleCard from '../components/raffle/RaffleCard';
import DayStats from '../components/raffle/DayStats';
import PredrawPanel from '../components/raffle/PredrawPanel';
import CsvUploader from '../components/participants/CsvUploader';
import CsvPreview from '../components/participants/CsvPreview';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import RedrawDialog from '../components/raffle/RedrawDialog';
import UnlockDialog, { lockWinners } from '../components/raffle/UnlockDialog';
import SetFolders from '../components/raffle/SetFolders';
import LoadingState, { InlineSpinner } from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import { deleteRaffleConfirmation } from '../lib/deleteRaffle';
import { formatDateTime, formatNumber } from '../lib/format';
import { dayLabel, inDrawingOrder, setLabel } from '../lib/sets';
import { useToast } from '../context/ToastContext';

/**
 * One raffle file: an event's raffles with one participant list. Step 1 is
 * the participants (one CSV for the whole file), step 2 the raffles made in
 * it — each starts with those participants — and then the Control Center,
 * where the file's raffles are drawn one by one.
 *
 * The file is split into days — Day 1, Day 2, … — each with its own Ready
 * to Draw, Pre-draw and Completed tabs and its own set folders; open the
 * file and pick the day.
 *
 * A raffle already drawn can be kept as a pre-draw: its winners become its
 * pre-selected list, locked so nobody can change them, and it is put in a
 * set — then at the event it is played again, in set order, and the screens
 * land on the same winners.
 */
export default function RaffleFileDetail() {
    const { file: fileId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();

    const [raffleFile, setRaffleFile] = useState(null);
    // Every raffle in the file, pre-draws included; split into the tabs below.
    const [allRaffles, setAllRaffles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);

    const [renaming, setRenaming] = useState(false);
    const [name, setName] = useState('');

    const [uploadOpen, setUploadOpen] = useState(false);
    const [csv, setCsv] = useState(null);
    const [preview, setPreview] = useState(null);
    const [previewing, setPreviewing] = useState(false);
    const [importing, setImporting] = useState(false);

    // The file's three lists: raffles to draw, pre-draws, and the completed ones.
    const [searchParams, setSearchParams] = useSearchParams();
    // The day open: ?day=1 is Day 1, ?day=0 the raffles in no day; none is
    // the day folders. Inside a day, ?tab= and ?set= as before.
    const dayKey = searchParams.get('day');
    const dayOpen = dayKey !== null;
    const day = dayOpen ? (Number(dayKey) || null) : null;
    const tab = ['predraw', 'completed'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'ready';
    const params = (extra) => ({ ...(dayOpen ? { day: dayKey } : {}), ...extra });
    const openDay = (next) => { stopSelecting(); setSearchParams(next === null ? {} : { day: String(next) }); };
    const setTab = (key) => {
        stopSelecting();
        setSearchParams(params(key === 'ready' ? {} : { tab: key }), { replace: true });
    };
    // In Ready to Draw, each set is a folder: ?set=2 is the Second Set opened.
    const openSet = tab === 'ready' ? Number(searchParams.get('set')) || null : null;
    const openFolder = (set) => setSearchParams(params(set ? { set: String(set) } : {}));

    // Choosing raffles to put into a set: First Set, Second Set, …
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState(() => new Set());
    const [savingSet, setSavingSet] = useState(false);

    const [confirm, setConfirm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [redrawing, setRedrawing] = useState(null);
    // Drawn raffles kept as pre-draws (with the set to put them in), played
    // again for the event, or unlocked with the owner PIN.
    const [keeping, setKeeping] = useState(null);
    const [keepSet, setKeepSet] = useState('');
    const [keepDay, setKeepDay] = useState('');
    const [replayingMany, setReplayingMany] = useState(null);
    const [unlocking, setUnlocking] = useState(null);
    // The Completed tab's open set folder: the record of what was drawn, set by set.
    const [completedSet, setCompletedSet] = useState(null);

    const load = useCallback(async () => {
        try {
            const [file, list] = await Promise.all([
                api.get(`/raffle-files/${fileId}`),
                api.get('/raffles', { params: { raffle_file_id: fileId, include_predraws: 1, per_page: 100 } }),
            ]);
            setRaffleFile(file.data.data);
            setAllRaffles(list.data.data);
        } catch (error) {
            setLoadError(parseError(error, 'This raffle file could not be loaded.').message);
        } finally {
            setLoading(false);
        }
    }, [fileId]);

    useEffect(() => { load(); }, [load]);

    const rename = async (event) => {
        event.preventDefault();
        try {
            const { data } = await api.put(`/raffle-files/${fileId}`, { name });
            setRaffleFile((current) => ({ ...current, ...data.data }));
            setRenaming(false);
        } catch (error) {
            toast.error(parseError(error, 'The name could not be saved.').message);
        }
    };

    const runPreview = async (candidate) => {
        setCsv(candidate);
        setPreview(null);
        setPreviewing(true);

        const body = new FormData();
        body.append('file', candidate);

        try {
            const { data } = await api.post(`/raffle-files/${fileId}/participants/preview`, body);
            setPreview(data.data);
        } catch (error) {
            toast.error(parseError(error, 'The CSV could not be read.').message);
            setCsv(null);
        } finally {
            setPreviewing(false);
        }
    };

    const runImport = async () => {
        setImporting(true);

        const body = new FormData();
        body.append('file', csv);

        try {
            const { data } = await api.post(`/raffle-files/${fileId}/participants`, body);
            const { participants, synced, skipped } = data.data;
            toast.success(
                `${formatNumber(participants)} participants saved${synced ? `, ${synced} raffle${synced === 1 ? '' : 's'} updated` : ''}${skipped ? `, ${skipped} already drawn left as they were` : ''}.`,
                { title: 'Participants uploaded' },
            );
            closeUpload();
            load();
        } catch (error) {
            toast.error(parseError(error, 'The upload failed.').message);
        } finally {
            setImporting(false);
        }
    };

    const closeUpload = () => {
        setUploadOpen(false);
        setCsv(null);
        setPreview(null);
    };

    const runConfirmed = async () => {
        if (!confirm) return;
        setBusy(true);

        try {
            await confirm.run();
            toast.success(confirm.successMessage);
            setConfirm(null);
            if (confirm.after) confirm.after(); else load();
        } catch (error) {
            toast.error(parseError(error, 'The action could not be completed.').message);
        } finally {
            setBusy(false);
        }
    };

    const duplicate = async (raffle) => {
        try {
            const { data } = await api.post(`/raffles/${raffle.id}/duplicate`);
            toast.success(`"${data.data.name}" created in this file.`);
            load();
        } catch (error) {
            toast.error(parseError(error, 'The raffle could not be duplicated.').message);
        }
    };

    const hasParticipants = Boolean(raffleFile?.participants_count);
    // The days: Day 1, Day 2, … and the raffles in no day yet.
    const usedDays = [...new Set(allRaffles.map((raffle) => raffle.draw_day).filter(Boolean))].sort((a, b) => a - b);
    const nextDay = (usedDays.at(-1) ?? 0) + 1;
    const noDayCount = allRaffles.filter((raffle) => !raffle.draw_day).length;
    // The open day's raffles: everything below is about these.
    const dayRaffles = allRaffles.filter((raffle) => (raffle.draw_day ?? null) === day);
    // Drawn in set order: every ordinary raffle, and the pre-draws put in a set.
    const inSets = (raffle) => !raffle.is_predraw || Boolean(raffle.draw_set);
    // The Control Center opens on the first raffle still to draw.
    const raffles = inDrawingOrder(dayRaffles.filter((raffle) => inSets(raffle) && raffle.status !== 'COMPLETED'));
    const usedSets = [...new Set(dayRaffles.map((raffle) => raffle.draw_set).filter(Boolean))].sort((a, b) => a - b);
    const nextSet = (usedSets.at(-1) ?? 0) + 1;
    // What the Ready to Draw tab shows: the open folder's raffles, or the
    // raffles in no folder yet (beneath the folders).
    const visible = raffles.filter((raffle) => (raffle.draw_set ?? null) === openSet);
    // A day's folder card: what is in it.
    const daySummary = (inDay) => {
        const toDraw = inDay.filter((raffle) => inSets(raffle) && raffle.status !== 'COMPLETED').length;
        const done = inDay.filter((raffle) => raffle.status === 'COMPLETED').length;
        return [toDraw ? `${toDraw} to draw` : null, done ? `${done} completed` : null].filter(Boolean).join(' · ') || 'Empty';
    };

    const toggleSelect = (raffle) => setSelected((current) => {
        const next = new Set(current);
        if (next.has(raffle.id)) next.delete(raffle.id); else next.add(raffle.id);
        return next;
    });
    const stopSelecting = () => { setSelecting(false); setSelected(new Set()); };

    // Into a set folder (`draw_set`) or a day folder (`draw_day`), or out of one (null).
    const putInSet = async (set, field = 'draw_set') => {
        setSavingSet(true);
        try {
            await api.post('/raffles/sets', { raffle_ids: [...selected], [field]: set });
            const count = `${selected.size} raffle${selected.size === 1 ? '' : 's'}`;
            const name = field === 'draw_day' ? dayLabel(set) : `the ${setLabel(set)}`;
            toast.success(set ? `${count} put in ${name}.` : `${count} taken out of their ${field === 'draw_day' ? 'day' : 'set'}.`);
            stopSelecting();
            await load();
        } catch (error) {
            toast.error(parseError(error, 'The set could not be saved.').message);
        } finally {
            setSavingSet(false);
        }
    };
    const completed = inDrawingOrder(dayRaffles.filter((raffle) => raffle.status === 'COMPLETED'));
    const selectedRaffles = dayRaffles.filter((raffle) => selected.has(raffle.id));

    // Drawn raffles kept as pre-draws, their winners locked, in the chosen set.
    const keep = async () => {
        setBusy(true);
        try {
            const { data } = await api.post('/predraws/keep', {
                raffle_ids: keeping.map((raffle) => raffle.id),
                ...(keepSet === 'keep' ? {} : { draw_set: keepSet ? Number(keepSet) : null }),
                ...(keepDay === 'keep' ? {} : { draw_day: keepDay ? Number(keepDay) : null }),
            });
            toast.success(data.message, { title: data.data.kept.length ? 'Kept as pre-draws' : 'Nothing kept' });
            data.data.skipped.forEach((row) => toast.error(`${row.name}: ${row.reason}.`));
            setKeeping(null);
            stopSelecting();
            await load();
        } catch (error) {
            toast.error(parseError(error, 'The raffles could not be kept as pre-draws.').message);
        } finally {
            setBusy(false);
        }
    };

    // Played again for the event: revealed winners cleared, the same winners come out again.
    const replayMany = async () => {
        setBusy(true);
        try {
            const { data } = await api.post('/predraws/replay', { raffle_ids: replayingMany.map((raffle) => raffle.id) });
            toast.success(data.message, { title: data.data.reset.length ? 'Ready to play again' : 'Nothing reset' });
            data.data.skipped.forEach((row) => toast.error(`${row.name}: ${row.reason}`));
            setReplayingMany(null);
            stopSelecting();
            await load();
        } catch (error) {
            toast.error(parseError(error, 'The pre-draws could not be reset.').message);
        } finally {
            setBusy(false);
        }
    };

    const lockMany = async (list) => {
        setBusy(true);
        try {
            await Promise.all(list.map((raffle) => lockWinners(raffle)));
            toast.success(`${list.length} raffle${list.length === 1 ? '' : 's'} locked: the winners cannot be changed without the owner PIN.`, { title: 'Locked' });
            stopSelecting();
            await load();
        } catch (error) {
            toast.error(parseError(error, 'The winners could not be locked.').message);
        } finally {
            setBusy(false);
        }
    };

    // The toolbar's folder buttons: the days, then the sets, each with a new one and a way out.
    const folderButtons = (
        <>
            <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted-dim">Move to day</span>
            {[...usedDays, nextDay].map((day) => (
                <button
                    key={`day-${day}`}
                    type="button"
                    className={day === nextDay ? 'btn btn-outline px-3 py-1.5 text-xs' : 'btn btn-gold px-3 py-1.5 text-xs'}
                    disabled={selected.size === 0 || savingSet}
                    onClick={() => putInSet(day, 'draw_day')}
                >
                    {day === nextDay ? <Plus size={13} /> : <Calendar size={13} />}
                    {day === nextDay ? `New: ${dayLabel(day)}` : dayLabel(day)}
                </button>
            ))}
            {usedDays.length > 0 && (
                <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" disabled={selected.size === 0 || savingSet} onClick={() => putInSet(null, 'draw_day')}>
                    No day
                </button>
            )}
            <span className="ml-2 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted-dim">Set</span>
            {[...usedSets, nextSet].map((set) => (
                <button
                    key={`set-${set}`}
                    type="button"
                    className={set === nextSet ? 'btn btn-outline px-3 py-1.5 text-xs' : 'btn btn-gold px-3 py-1.5 text-xs'}
                    disabled={selected.size === 0 || savingSet}
                    onClick={() => putInSet(set)}
                >
                    {set === nextSet ? <Plus size={13} /> : <Folder size={13} />}
                    {set === nextSet ? `New: ${setLabel(set)}` : setLabel(set)}
                </button>
            ))}
            {usedSets.length > 0 && (
                <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" disabled={selected.size === 0 || savingSet} onClick={() => putInSet(null)}>
                    No set
                </button>
            )}
        </>
    );

    // The set folders of the open day, the same on every tab. `action` goes
    // beside an open set's name.
    const dayFolders = ({ items, set, onSet, summary, action = null, emptyLabel, render }) => (
        <SetFolders items={items} openSet={set} onOpen={onSet} noneLabel="Not in a set" emptyLabel={emptyLabel} summary={summary} action={action}>
            {render}
        </SetFolders>
    );
    const dayName = day ? dayLabel(day) : 'Not in a day';
    const newRaffleLink = `/raffles/new?file=${fileId}${day ? `&day=${day}` : ''}`;

    // A big prize: its winners are left out of every other draw of the event, all days.
    const toggleOut = async (raffle) => {
        const on = !raffle.winners_out_for_event;
        try {
            await api.put(`/raffles/${raffle.id}`, { winners_out_for_event: on });
            toast.success(on
                ? `"${raffle.name}" is a big prize: its winners are out of every other draw in this file, on every day.`
                : `"${raffle.name}"'s winners can win other days' draws again.`);
            await load();
        } catch (error) {
            toast.error(parseError(error, 'The raffle could not be changed.').message);
        }
    };

    const toggleNeverWon = async (raffle) => {
        const on = !raffle.only_never_won;
        try {
            await api.put(`/raffles/${raffle.id}`, { only_never_won: on });
            toast.success(on
                ? `"${raffle.name}" now draws only from the people who have won nothing in the event yet, any day.`
                : `"${raffle.name}" is back to the usual pool: a day at a time.`);
            await load();
        } catch (error) {
            toast.error(parseError(error, 'The raffle could not be changed.').message);
        }
    };

    const openKeep = (list) => {
        setKeepSet(list.some((raffle) => raffle.draw_set) ? 'keep' : '');
        setKeepDay(list.some((raffle) => raffle.draw_day) ? 'keep' : (day ? String(day) : ''));
        setKeeping(list);
    };
    // Pre-draws still to play, plus the kept (locked) ones waiting in their sets.
    const predrawsToPlay = dayRaffles.filter((raffle) => raffle.is_predraw && (raffle.status !== 'COMPLETED' || raffle.is_locked)).length;
    const readyCount = raffles.filter((raffle) => raffle.status === 'READY').length;
    const firstToDraw = raffles.find((raffle) => !['COMPLETED', 'CANCELLED'].includes(raffle.status)) ?? raffles[0];

    const card = (raffle, index) => (
        <RaffleCard
            key={raffle.id}
            raffle={raffle}
            delay={index * 0.04}
            onDuplicate={raffle.is_predraw ? undefined : duplicate}
            onConvert={(target) => setConfirm({
                title: 'Change this raffle to a pre-draw?',
                description:
                    `"${target.name}" becomes a pre-draw: you pick its winners before the event, and the draw on the screens reveals them.\n\n`
                    + (target.prizes?.length
                        ? `Its prize list (${target.prizes.length} prize${target.prizes.length === 1 ? '' : 's'}) is removed — in a pre-draw you type each winner's prize as you pick them. `
                        : '')
                    + 'Its participants, logos and settings stay. You can change it back while no winner has been revealed.',
                confirmLabel: 'Change to pre-draw',
                tone: 'gold',
                successMessage: `"${target.name}" is now a pre-draw. Pick its winners below.`,
                run: () => api.post(`/raffles/${target.id}/convert`, { to: 'predraw' }),
                after: () => { setSearchParams({ tab: 'predraw', open: String(target.id) }); load(); },
            })}
            selectable={selecting}
            selected={selected.has(raffle.id)}
            onToggleSelect={toggleSelect}
            onRedraw={setRedrawing}
            onKeep={(target) => openKeep([target])}
            onToggleOut={toggleOut}
            onToggleNeverWon={toggleNeverWon}
            onLock={(target) => lockMany([target])}
            onUnlock={setUnlocking}
            onArchive={(target) => setConfirm({
                title: 'Archive this raffle?',
                description: `"${target.name}" will be hidden from the active list. Its winners and audit trail are kept.`,
                confirmLabel: 'Archive',
                successMessage: 'Raffle archived.',
                run: () => api.post(`/raffles/${target.id}/archive`),
            })}
            onDelete={(target) => setConfirm({
                ...deleteRaffleConfirmation(target),
                successMessage: 'Raffle deleted.',
                run: () => api.delete(`/raffles/${target.id}`),
            })}
        />
    );

    if (loading) {
        return <DashboardLayout title="Raffle file"><LoadingState label="Loading raffle file" /></DashboardLayout>;
    }

    if (loadError) {
        return <DashboardLayout title="Raffle file"><EmptyState title="Raffle file not found" description={loadError} /></DashboardLayout>;
    }

    return (
        <DashboardLayout
            title={raffleFile.name}
            subtitle="Raffle file — one participant list for all of its raffles"
            actions={
                <>
                    <Link to="/raffles" className="btn btn-ghost">
                        <ArrowLeft size={15} /> <span className="hidden sm:inline">Raffles</span>
                    </Link>
                    {hasParticipants && (
                        <Link to={`/raffle-files/${fileId}/participants`} className="btn btn-outline">
                            <Users size={15} />
                            <span className="hidden sm:inline">Participants</span>
                        </Link>
                    )}
                    {firstToDraw && (
                        <Link to={`/raffle/${firstToDraw.id}/control`} className="btn btn-gold">
                            <MonitorPlay size={16} />
                            <span className="hidden sm:inline">Open Control Center</span>
                        </Link>
                    )}
                </>
            }
        >
            <div className="mb-6 flex flex-wrap items-center gap-3">
                <FolderOpen className="text-gold" size={20} />
                {renaming ? (
                    <form onSubmit={rename} className="flex flex-1 flex-wrap items-center gap-2">
                        <input className="input max-w-md" value={name} onChange={(event) => setName(event.target.value)} autoFocus maxLength={160} required />
                        <button type="submit" className="btn btn-gold px-3"><Check size={15} /> Save</button>
                        <button type="button" className="btn btn-ghost px-3" onClick={() => setRenaming(false)}><X size={15} /></button>
                    </form>
                ) : (
                    <>
                        <h2 className="font-display text-xl font-bold text-white">{raffleFile.name}</h2>
                        <button type="button" className="btn btn-ghost px-2.5 py-1 text-xs" onClick={() => { setName(raffleFile.name); setRenaming(true); }}>
                            <Pencil size={13} /> Rename
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost px-2.5 py-1 text-xs text-red-300/80 hover:text-red-300"
                            onClick={() => setConfirm({
                                title: 'Delete this raffle file?',
                                description: `"${raffleFile.name}" will be deleted. Its ${allRaffles.length} raffle${allRaffles.length === 1 ? '' : 's'} and their participants and winners are kept — they just stop being in a file.`,
                                confirmLabel: 'Delete file',
                                successMessage: 'Raffle file deleted.',
                                run: () => api.delete(`/raffle-files/${fileId}`),
                                after: () => navigate('/raffles'),
                            })}
                        >
                            <Trash2 size={13} /> Delete file
                        </button>
                    </>
                )}
            </div>

            {/* The participants, shared by all of the file's raffles */}
            <section className="panel mb-6 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h3 className="mt-1 flex items-center gap-2 font-display text-lg font-bold text-white">
                            <Users size={17} /> Participants
                        </h3>
                        <p className="mt-1 text-sm text-muted">
                            {hasParticipants
                                ? <>{formatNumber(raffleFile.participants_count)} participants from <span className="text-white">{raffleFile.participants_filename}</span>, uploaded {formatDateTime(raffleFile.participants_uploaded_at)}.</>
                                : 'Upload the participant CSV once. Every raffle in this file uses it.'}
                        </p>
                    </div>
                    <button type="button" className={hasParticipants ? 'btn btn-outline' : 'btn btn-gold'} onClick={() => setUploadOpen(true)}>
                        <Upload size={15} /> {hasParticipants ? 'Upload a new list' : 'Upload participants'}
                    </button>
                </div>

                {uploadOpen && (
                    <div className="mt-5 space-y-5 border-t border-line pt-5">
                        <CsvUploader file={csv} onFile={runPreview} onClear={() => { setCsv(null); setPreview(null); }} disabled={importing} />

                        {previewing && (
                            <p className="flex items-center gap-2.5 text-sm text-muted">
                                <InlineSpinner /> Validating file…
                            </p>
                        )}

                        <CsvPreview preview={preview} />

                        {hasParticipants && (
                            <p className="text-xs text-muted">
                                The new list replaces the old one. Raffles not drawn yet get any new people and the updated details; who is absent, disqualified or already a winner stays that way. Raffles already drawn keep their list.
                            </p>
                        )}

                        <div className="flex justify-end gap-2.5">
                            <button type="button" className="btn btn-ghost" onClick={closeUpload} disabled={importing}>Cancel</button>
                            <button
                                type="button"
                                className="btn btn-gold px-7"
                                onClick={runImport}
                                disabled={!preview || preview.valid_count === 0 || importing}
                            >
                                {importing && <InlineSpinner />}
                                {preview ? `Save ${formatNumber(preview.valid_count)} participants` : 'Save'}
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* The days: open one to see its raffles, pre-draws and completed draws. */}
            {!dayOpen && (
                <section>
                    <div className="mb-4">
                        <h3 className="flex items-center gap-2 font-display text-lg font-bold text-white">
                            <Calendar size={17} /> Days
                        </h3>
                        <p className="mt-1 text-sm text-muted">
                            Each day of the event has its own raffles to draw, pre-draws and completed draws, in set folders. Open a day to work in it.
                        </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {usedDays.map((used) => (
                            <button
                                key={used}
                                type="button"
                                onClick={() => openDay(used)}
                                className="panel group flex items-center gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:border-gold/35"
                            >
                                <span className="rounded-xl border border-gold/25 bg-gold/10 p-2.5 text-gold"><FolderOpen size={20} /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="block font-display text-base font-bold text-white group-hover:text-gold-bright">{dayLabel(used)}</span>
                                    <span className="text-xs text-muted-dim">{daySummary(allRaffles.filter((raffle) => raffle.draw_day === used))}</span>
                                </span>
                                <ChevronRight size={16} className="text-muted-dim group-hover:text-gold" />
                            </button>
                        ))}
                        {noDayCount > 0 && (
                            <button
                                type="button"
                                onClick={() => openDay(0)}
                                className="panel group flex items-center gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:border-gold/35"
                            >
                                <span className="rounded-xl border border-line bg-white/5 p-2.5 text-muted"><Folder size={20} /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="block font-display text-base font-bold text-white group-hover:text-gold-bright">Not in a day</span>
                                    <span className="text-xs text-muted-dim">{daySummary(allRaffles.filter((raffle) => !raffle.draw_day))}</span>
                                </span>
                                <ChevronRight size={16} className="text-muted-dim group-hover:text-gold" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => openDay(nextDay)}
                            className="group flex items-center gap-3 rounded-2xl border border-dashed border-line p-4 text-left transition hover:border-gold/45"
                        >
                            <span className="rounded-xl border border-line bg-white/5 p-2.5 text-muted group-hover:text-gold"><Plus size={20} /></span>
                            <span className="min-w-0 flex-1">
                                <span className="block font-display text-base font-bold text-white group-hover:text-gold-bright">New: {dayLabel(nextDay)}</span>
                                <span className="text-xs text-muted-dim">Make its raffles and pre-draws inside it</span>
                            </span>
                        </button>
                    </div>
                </section>
            )}

            {dayOpen && (
            <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-ghost px-3" onClick={() => openDay(null)}>
                    <ArrowLeft size={15} /> All days
                </button>
                <h3 className="flex items-center gap-2 font-display text-xl font-bold text-gold-bright">
                    <Calendar size={19} /> {dayName}
                    <span className="text-sm font-normal text-muted-dim">({dayRaffles.length} raffle{dayRaffles.length === 1 ? '' : 's'})</span>
                </h3>
            </div>

            {/* The day in numbers, and who its draws pick from. */}
            {day && <DayStats fileId={fileId} day={day} version={allRaffles} />}

            {/* The day's raffles: ready to draw, pre-draws, and completed */}
            <nav className="mb-5 flex flex-wrap gap-2 border-b border-line pb-3" aria-label="Raffle file sections">
                {[
                    { key: 'ready', label: 'Ready to Draw', icon: Gift, count: raffles.length },
                    { key: 'predraw', label: 'Pre-draw', icon: Wand2, count: predrawsToPlay },
                    { key: 'completed', label: 'Completed', icon: CheckCircle2, count: completed.length },
                ].map(({ key, label, icon: Icon, count }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        aria-current={tab === key ? 'page' : undefined}
                        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                            tab === key
                                ? 'border border-gold/45 bg-gold/12 text-gold-bright'
                                : 'border border-line text-muted hover:text-white'
                        }`}
                    >
                        <Icon size={15} />
                        {label}
                        {count !== null && <span className="tabular rounded-md bg-white/5 px-1.5 text-xs text-muted-dim">{count}</span>}
                    </button>
                ))}
            </nav>

            {tab === 'ready' && (
                <>
                {/* The raffles, each saved ready to draw */}
                <section>
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h3 className="mt-1 flex items-center gap-2 font-display text-lg font-bold text-white">
                                <Gift size={17} /> Ready to Draw
                            </h3>
                            <p className="mt-1 text-sm text-muted">
                                {dayName}'s raffles, in the order they are drawn. Each starts with this file's participants; set its prizes, logos and who can win, and it is saved ready to draw.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {raffles.length > 0 && !selecting && (
                                <button type="button" className="btn btn-outline" onClick={() => setSelecting(true)}>
                                    <ListChecks size={16} /> Put into day & set folders
                                </button>
                            )}
                            <Link to={newRaffleLink} className="btn btn-gold">
                                <Plus size={16} /> New raffle in {dayName}
                            </Link>
                        </div>
                    </div>

                    {selecting && (
                        <div className="panel panel-gold sticky top-3 z-20 mb-5 flex flex-wrap items-center gap-2 p-4">
                            <p className="mr-2 text-sm text-white">
                                <span className="font-semibold text-gold-bright">{selected.size}</span> selected
                                <span className="text-muted"> — tick the raffles, then choose their folder.</span>
                            </p>
                            <button
                                type="button"
                                className="btn btn-ghost px-3 py-1.5 text-xs"
                                onClick={() => setSelected(selected.size === visible.length ? new Set() : new Set(visible.map((raffle) => raffle.id)))}
                            >
                                {selected.size === visible.length && visible.length > 0 ? 'Select none' : 'Select all'}
                            </button>
                            <span className="ml-auto flex flex-wrap items-center gap-2">
                                {folderButtons}
                                <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={stopSelecting} disabled={savingSet}>
                                    <X size={13} /> Done
                                </button>
                            </span>
                        </div>
                    )}

                    {raffles.length === 0 ? (
                        <EmptyState
                            icon={Gift}
                            title={`No raffles to draw in ${dayName}`}
                            description={hasParticipants
                                ? `Create ${dayName}'s raffles here — each one gets the participants above.`
                                : 'Upload the participants first, then create the raffles for this event.'}
                            action={<Link to={newRaffleLink} className="btn btn-gold"><Plus size={16} /> Create raffle</Link>}
                        />
                    ) : (
                        dayFolders({
                            items: raffles,
                            set: openSet,
                            onSet: openFolder,
                            summary: (inFolder) => `${inFolder.length} to draw`,
                            emptyLabel: 'Everything in this folder has been drawn — see the Completed tab.',
                            action: (inFolder) => {
                                const next = inFolder.find((raffle) => raffle.status !== 'CANCELLED');
                                return next && (
                                    <Link to={`/raffle/${next.id}/control`} className="btn btn-gold">
                                        <MonitorPlay size={15} /> Draw the {setLabel(openSet)}
                                    </Link>
                                );
                            },
                            render: (inFolder) => (
                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                    {inFolder.map(card)}
                                </div>
                            ),
                        })
                    )}
                </section>

                {/* Off to the Control Center to draw them */}
                {raffles.length > 0 && (
                    <section className="panel panel-gold mt-6 flex flex-wrap items-center justify-between gap-4 p-5">
                        <div>
                            <h3 className="mt-1 flex items-center gap-2 font-display text-lg font-bold text-white">
                                <MonitorPlay size={17} /> Draw them
                            </h3>
                            <p className="mt-1 text-sm text-muted">
                                {readyCount} of {raffles.length} raffle{raffles.length === 1 ? '' : 's'} ready to draw in {dayName}. The Control Center lists this file's raffles by day and set — pick one, put it on the LED wall and draw.
                            </p>
                        </div>
                        {firstToDraw && (
                            <Link to={`/raffle/${firstToDraw.id}/control`} className="btn btn-gold px-6">
                                <MonitorPlay size={16} /> Open Control Center
                            </Link>
                        )}
                    </section>
                )}
                </>
            )}

            {tab === 'predraw' && (
                hasParticipants
                    ? <PredrawPanel raffleFileId={fileId} day={day} hidePlayed onChanged={load} initialOpen={Number(searchParams.get('open')) || null} />
                    : (
                        <EmptyState
                            icon={Wand2}
                            title="Upload the participants first"
                            description="A pre-draw's winners are picked from this file's participants. Upload them above."
                        />
                    )
            )}

            {tab === 'completed' && (
                <section>
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h3 className="flex items-center gap-2 font-display text-lg font-bold text-white">
                                <CheckCircle2 size={17} /> Completed
                            </h3>
                            <p className="mt-1 text-sm text-muted">
                                Raffles and pre-draws with all their winners drawn. Keep a drawn raffle as a pre-draw to play it again at the event with the same winners — its winners are locked, and only the owner PIN unlocks them.
                            </p>
                        </div>
                        {completed.length > 0 && !selecting && (
                            <button type="button" className="btn btn-outline" onClick={() => setSelecting(true)}>
                                <ListChecks size={16} /> Select raffles
                            </button>
                        )}
                    </div>

                    {selecting && (
                        <div className="panel panel-gold sticky top-3 z-20 mb-5 flex flex-wrap items-center gap-2 p-4">
                            <p className="mr-2 text-sm text-white">
                                <span className="font-semibold text-gold-bright">{selected.size}</span> selected
                                <span className="text-muted"> — tick the raffles, then choose what to do with them.</span>
                            </p>
                            <button
                                type="button"
                                className="btn btn-ghost px-3 py-1.5 text-xs"
                                onClick={() => setSelected(selected.size === completed.length ? new Set() : new Set(completed.map((raffle) => raffle.id)))}
                            >
                                {selected.size === completed.length && completed.length > 0 ? 'Select none' : 'Select all'}
                            </button>
                            <span className="ml-auto flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="btn btn-gold px-3 py-1.5 text-xs"
                                    disabled={selected.size === 0 || busy}
                                    onClick={() => openKeep(selectedRaffles)}
                                    title="Their winners become pre-selected lists, locked, in a set of your choice"
                                >
                                    <Wand2 size={13} /> Keep winners as pre-draws
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-outline px-3 py-1.5 text-xs"
                                    disabled={selected.size === 0 || busy || !selectedRaffles.some((raffle) => raffle.is_predraw)}
                                    onClick={() => setReplayingMany(selectedRaffles.filter((raffle) => raffle.is_predraw))}
                                    title="Clear their revealed winners so the draw reveals the same winners again"
                                >
                                    <Play size={13} /> Play again
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-outline px-3 py-1.5 text-xs"
                                    disabled={selected.size === 0 || busy || !selectedRaffles.some((raffle) => !raffle.is_locked)}
                                    onClick={() => lockMany(selectedRaffles.filter((raffle) => !raffle.is_locked))}
                                >
                                    <Lock size={13} /> Lock winners
                                </button>
                                {folderButtons}
                                <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={stopSelecting} disabled={savingSet || busy}>
                                    <X size={13} /> Done
                                </button>
                            </span>
                        </div>
                    )}

                    {completed.length === 0 ? (
                        <EmptyState
                            icon={CheckCircle2}
                            title="Nothing completed yet"
                            description="A raffle or pre-draw moves here once all its winners have been drawn."
                        />
                    ) : (
                        dayFolders({
                            items: completed,
                            set: completedSet,
                            onSet: setCompletedSet,
                            emptyLabel: 'Nothing completed in this folder yet.',
                            summary: (inFolder) => {
                                const predraws = inFolder.filter((raffle) => raffle.is_predraw).length;
                                return `${inFolder.length} completed${predraws ? ` · ${predraws} pre-draw${predraws === 1 ? '' : 's'}` : ''}`;
                            },
                            render: (inFolder) => (
                                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                    {inFolder.map(card)}
                                </div>
                            ),
                        })
                    )}
                </section>
            )}

            </>
            )}

            <RedrawDialog raffle={redrawing} onClose={() => setRedrawing(null)} onDone={load} />
            <UnlockDialog raffle={unlocking} onClose={() => setUnlocking(null)} onDone={load} />

            {/* Drawn raffles kept as pre-draws: which set they are played in. */}
            <ConfirmDialog
                open={Boolean(keeping)}
                title={keeping?.length === 1 ? `Keep "${keeping[0].name}" as a pre-draw?` : `Keep ${keeping?.length ?? 0} raffles as pre-draws?`}
                description={
                    'Each raffle\'s winners become its pre-selected list — the same people, in the order they were drawn, with the prize they won — and the winners are locked so nobody can change or remove them. Nothing is deleted: the winners, prizes and draw history stay.\n\n'
                    + 'At the event, play it again from its set: the screens run the draw and land on the same winners.'
                }
                confirmLabel="Keep as pre-draws"
                tone="gold"
                busy={busy}
                onConfirm={keep}
                onCancel={() => setKeeping(null)}
            >
                <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label className="label" htmlFor="keep-day">Which day?</label>
                    <select id="keep-day" className="input" value={keepDay} onChange={(event) => setKeepDay(event.target.value)} disabled={busy}>
                        {keeping?.some((raffle) => raffle.draw_day) && <option value="keep">Keep their current days</option>}
                        <option value="">No day yet</option>
                        {[...usedDays, nextDay].map((day) => (
                            <option key={day} value={day}>{day === nextDay ? `New: ${dayLabel(day)}` : dayLabel(day)}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="label" htmlFor="keep-set">Which set?</label>
                    <select id="keep-set" className="input" value={keepSet} onChange={(event) => setKeepSet(event.target.value)} disabled={busy}>
                        {keeping?.some((raffle) => raffle.draw_set) && <option value="keep">Keep their current sets</option>}
                        <option value="">Not in a set yet</option>
                        {[...usedSets, nextSet].map((set) => (
                            <option key={set} value={set}>{set === nextSet ? `New: ${setLabel(set)}` : setLabel(set)}</option>
                        ))}
                    </select>
                </div>
                </div>
            </ConfirmDialog>

            <ConfirmDialog
                open={Boolean(replayingMany)}
                title={replayingMany?.length === 1 ? `Play "${replayingMany[0].name}" again?` : `Play ${replayingMany?.length ?? 0} pre-draws again?`}
                description={
                    'Their revealed winners are cleared from the screens and the pre-draws set back to READY. When each one is drawn again, the same winners come out in the same order — nobody on the lists changes.\n\n'
                    + 'The earlier reveals stay in the audit log.'
                }
                confirmLabel="Play again — same winners"
                tone="gold"
                busy={busy}
                onConfirm={replayMany}
                onCancel={() => setReplayingMany(null)}
            />

            <ConfirmDialog
                open={Boolean(confirm)}
                title={confirm?.title}
                description={confirm?.description}
                confirmLabel={confirm?.confirmLabel}
                tone={confirm?.tone ?? 'danger'}
                requireText={confirm?.requireText}
                busy={busy}
                onConfirm={runConfirmed}
                onCancel={() => setConfirm(null)}
            />
        </DashboardLayout>
    );
}
