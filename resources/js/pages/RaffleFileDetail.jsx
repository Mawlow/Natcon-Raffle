import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, CheckCircle2, ChevronRight, Folder, FolderOpen, ListChecks, Gift, MonitorPlay, Pencil, Plus, Trash2, Upload, Users, Wand2, X } from 'lucide-react';
import api, { parseError } from '../lib/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import RaffleCard from '../components/raffle/RaffleCard';
import PredrawPanel from '../components/raffle/PredrawPanel';
import CsvUploader from '../components/participants/CsvUploader';
import CsvPreview from '../components/participants/CsvPreview';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import RedrawDialog from '../components/raffle/RedrawDialog';
import LoadingState, { InlineSpinner } from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import { deleteRaffleConfirmation } from '../lib/deleteRaffle';
import { formatDateTime, formatNumber } from '../lib/format';
import { inDrawingOrder, setLabel } from '../lib/sets';
import { useToast } from '../context/ToastContext';

/**
 * One raffle file: an event's raffles with one participant list. Step 1 is
 * the participants (one CSV for the whole file), step 2 the raffles made in
 * it — each starts with those participants — and then the Control Center,
 * where the file's raffles are drawn one by one.
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
    const tab = ['predraw', 'completed'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'ready';
    const setTab = (key) => setSearchParams(key === 'ready' ? {} : { tab: key }, { replace: true });
    // In Ready to Draw, each set is a folder: ?set=1 is the First Set opened.
    const openSet = tab === 'ready' ? Number(searchParams.get('set')) || null : null;
    const openFolder = (set) => setSearchParams(set ? { set: String(set) } : {});

    // Choosing raffles to put into a set: First Set, Second Set, …
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState(() => new Set());
    const [savingSet, setSavingSet] = useState(false);

    const [confirm, setConfirm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [redrawing, setRedrawing] = useState(null);

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
    // The Control Center opens on the first raffle still to draw.
    const raffles = inDrawingOrder(allRaffles.filter((raffle) => !raffle.is_predraw && raffle.status !== 'COMPLETED'));
    const usedSets = [...new Set(allRaffles.map((raffle) => raffle.draw_set).filter(Boolean))].sort((a, b) => a - b);
    const nextSet = (usedSets.at(-1) ?? 0) + 1;
    // What the Ready to Draw tab shows: the open folder's raffles, or the
    // raffles in no folder yet (beneath the folders).
    const visible = raffles.filter((raffle) => (raffle.draw_set ?? null) === openSet);
    const folders = usedSets.map((set) => {
        const inSet = allRaffles.filter((raffle) => !raffle.is_predraw && raffle.draw_set === set);
        return { set, toDraw: inSet.filter((raffle) => raffle.status !== 'COMPLETED').length, total: inSet.length };
    });
    const folderNext = openSet ? visible.find((raffle) => raffle.status !== 'CANCELLED') : null;

    const toggleSelect = (raffle) => setSelected((current) => {
        const next = new Set(current);
        if (next.has(raffle.id)) next.delete(raffle.id); else next.add(raffle.id);
        return next;
    });
    const stopSelecting = () => { setSelecting(false); setSelected(new Set()); };

    const putInSet = async (set) => {
        setSavingSet(true);
        try {
            await api.post('/raffles/sets', { raffle_ids: [...selected], draw_set: set });
            toast.success(set ? `${selected.size} raffle${selected.size === 1 ? '' : 's'} put in the ${setLabel(set)}.` : `${selected.size} raffle${selected.size === 1 ? '' : 's'} taken out of their set.`);
            stopSelecting();
            await load();
        } catch (error) {
            toast.error(parseError(error, 'The set could not be saved.').message);
        } finally {
            setSavingSet(false);
        }
    };
    const completed = allRaffles.filter((raffle) => raffle.status === 'COMPLETED');
    const predrawsToPlay = allRaffles.filter((raffle) => raffle.is_predraw && raffle.status !== 'COMPLETED').length;
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
            selectable={selecting && !raffle.is_predraw}
            selected={selected.has(raffle.id)}
            onToggleSelect={toggleSelect}
            onRedraw={setRedrawing}
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

            {/* The file's raffles: ready to draw, and pre-draws */}
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
                                Each raffle starts with this file's participants. Set its prizes, logos and who can win, and it is saved ready to draw.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {raffles.length > 0 && !selecting && (
                                <button type="button" className="btn btn-outline" onClick={() => setSelecting(true)}>
                                    <ListChecks size={16} /> Put into set folders
                                </button>
                            )}
                            <Link to={`/raffles/new?file=${fileId}`} className="btn btn-gold">
                                <Plus size={16} /> New raffle in this file
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
                            <span className="ml-auto flex flex-wrap gap-2">
                                {[...usedSets, nextSet].map((set) => (
                                    <button
                                        key={set}
                                        type="button"
                                        className={set === nextSet ? 'btn btn-outline px-3 py-1.5 text-xs' : 'btn btn-gold px-3 py-1.5 text-xs'}
                                        disabled={selected.size === 0 || savingSet}
                                        onClick={() => putInSet(set)}
                                    >
                                        {set === nextSet ? <Plus size={13} /> : <Folder size={13} />}
                                        {set === nextSet ? `New folder: ${setLabel(set)}` : `Move to ${setLabel(set)}`}
                                    </button>
                                ))}
                                {usedSets.length > 0 && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost px-3 py-1.5 text-xs"
                                        disabled={selected.size === 0 || savingSet}
                                        onClick={() => putInSet(null)}
                                    >
                                        Take out of folder
                                    </button>
                                )}
                                <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={stopSelecting} disabled={savingSet}>
                                    <X size={13} /> Done
                                </button>
                            </span>
                        </div>
                    )}

                    {raffles.length === 0 ? (
                        <EmptyState
                            icon={Gift}
                            title="No raffles in this file yet"
                            description={hasParticipants
                                ? 'Create the raffles for this event — each one gets the participants above.'
                                : 'Upload the participants first, then create the raffles for this event.'}
                            action={<Link to={`/raffles/new?file=${fileId}`} className="btn btn-gold"><Plus size={16} /> Create raffle</Link>}
                        />
                    ) : (
                        <div className="space-y-6">
                            {openSet ? (
                                /* One set's folder, opened */
                                <div className="flex flex-wrap items-center gap-3">
                                    <button type="button" className="btn btn-ghost px-3" onClick={() => openFolder(null)}>
                                        <ArrowLeft size={15} /> All folders
                                    </button>
                                    <h4 className="flex items-center gap-2 font-display text-lg font-bold text-gold-bright">
                                        <FolderOpen size={18} /> {setLabel(openSet)}
                                        <span className="text-sm font-normal text-muted-dim">({visible.length} to draw)</span>
                                    </h4>
                                    {folderNext && (
                                        <Link to={`/raffle/${folderNext.id}/control`} className="btn btn-gold ml-auto">
                                            <MonitorPlay size={15} /> Draw the {setLabel(openSet)}
                                        </Link>
                                    )}
                                </div>
                            ) : folders.length > 0 && (
                                /* The set folders: First Set, Second Set, … */
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    {folders.map((folder) => (
                                        <button
                                            key={folder.set}
                                            type="button"
                                            onClick={() => openFolder(folder.set)}
                                            className="panel group flex items-center gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:border-gold/35"
                                        >
                                            <span className="rounded-xl border border-gold/25 bg-gold/10 p-2.5 text-gold">
                                                <Folder size={20} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block font-display text-base font-bold text-white group-hover:text-gold-bright">{setLabel(folder.set)}</span>
                                                <span className="text-xs text-muted-dim">
                                                    {folder.toDraw} to draw{folder.total > folder.toDraw ? ` · ${folder.total - folder.toDraw} completed` : ''}
                                                </span>
                                            </span>
                                            <ChevronRight size={16} className="text-muted-dim group-hover:text-gold" />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {visible.length > 0 ? (
                                <div>
                                    {!openSet && folders.length > 0 && (
                                        <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                                            Not in a folder ({visible.length})
                                        </h4>
                                    )}
                                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {visible.map(card)}
                                    </div>
                                </div>
                            ) : openSet && (
                                <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
                                    Every raffle in the {setLabel(openSet)} has been drawn — see the Completed tab.
                                </p>
                            )}
                        </div>
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
                                {readyCount} of {raffles.length} raffle{raffles.length === 1 ? '' : 's'} ready to draw. The Control Center lists this file's raffles — pick one, put it on the LED wall and draw.
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
                    ? <PredrawPanel raffleFileId={fileId} hidePlayed onChanged={load} initialOpen={Number(searchParams.get('open')) || null} />
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
                    <div className="mb-4">
                        <h3 className="flex items-center gap-2 font-display text-lg font-bold text-white">
                            <CheckCircle2 size={17} /> Completed
                        </h3>
                        <p className="mt-1 text-sm text-muted">
                            Raffles and pre-draws with all their winners drawn. To draw one again, use Clear winners &amp; redraw in its menu.
                        </p>
                    </div>

                    {completed.length === 0 ? (
                        <EmptyState
                            icon={CheckCircle2}
                            title="Nothing completed yet"
                            description="A raffle or pre-draw moves here once all its winners have been drawn."
                        />
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {completed.map(card)}
                        </div>
                    )}
                </section>
            )}

            <RedrawDialog raffle={redrawing} onClose={() => setRedrawing(null)} onDone={load} />

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
