import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MonitorUp, Pencil, Plus, Users } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { switchWall } from '../../lib/wallSwitch';
import { groupBySet, inDrawingOrder } from '../../lib/sets';
import { saveLogoSizes } from '../../lib/logoSizes';
import { useToast } from '../../context/ToastContext';
import RaffleParticipants from '../../pages/RaffleParticipants';
import LoadingState from '../ui/LoadingState';
import ControlDrawer from './ControlDrawer';
import RaffleForm from './RaffleForm';

/**
 * Runs the whole event from one Control Center: pick any raffle and put it
 * on the LED wall, create a new raffle, edit this one and manage its
 * participants — all without leaving the Control Center (the forms open in a
 * panel over it). Putting a raffle on the wall switches the screens already
 * open in place, still fullscreen, and this Control Center moves with them.
 * `onWall` says whether this raffle's main screen is the one on the wall.
 */
function RaffleSwitcher({ raffleId, raffleName, setupKey, onWall, busy, onChanged }) {
    const navigate = useNavigate();
    const toast = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const [raffles, setRaffles] = useState(null);
    const [chosen, setChosen] = useState(String(raffleId));
    // Which panel is open over the Control Center: 'new', 'edit' or 'participants'.
    const [panel, setPanel] = useState(() => searchParams.get('panel'));
    // The raffle file whose raffles are listed: '' is every raffle. It starts
    // on this raffle's file, so an event's raffles are drawn one after another.
    const [files, setFiles] = useState([]);
    const [fileFilter, setFileFilter] = useState(null);

    const loadRaffles = useCallback(() => {
        api.get('/raffles', { params: { per_page: 100, include_predraws: 1 } })
            .then(({ data }) => setRaffles(data.data))
            .catch(() => setRaffles([]));
        api.get('/raffle-files')
            .then(({ data }) => setFiles(data.data))
            .catch(() => setFiles([]));
    }, []);
    useEffect(() => { loadRaffles(); }, [loadRaffles]);

    useEffect(() => {
        if (fileFilter !== null || raffles === null) return;
        const here = raffles.find((raffle) => String(raffle.id) === String(raffleId));
        setFileFilter(here?.raffle_file_id ? String(here.raffle_file_id) : '');
    }, [raffles, raffleId, fileFilter]);

    const listed = useMemo(() => (raffles ?? []).filter((raffle) => !fileFilter
        || String(raffle.raffle_file_id) === fileFilter
        || String(raffle.id) === String(raffleId)), [raffles, fileFilter, raffleId]);
    const activeFile = files.find((file) => String(file.id) === fileFilter) ?? null;

    const chooseFile = (value) => {
        setFileFilter(value);
        if (!value) return;
        // The file's first raffle still to draw is the one lined up next.
        const inFile = inDrawingOrder((raffles ?? []).filter((raffle) => String(raffle.raffle_file_id) === value && !raffle.is_predraw));
        const next = inFile.find((raffle) => !['COMPLETED', 'CANCELLED'].includes(raffle.status)) ?? inFile[0];
        if (next) setChosen(String(next.id));
    };

    // A panel asked for in the address (a new raffle opens on its
    // participants) is opened once, then dropped from the address.
    useEffect(() => {
        if (!searchParams.get('panel')) return;
        const next = new URLSearchParams(searchParams);
        next.delete('panel');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    const setupQuery = setupKey === 'one' ? '?setup=one' : '';
    const current = String(chosen) === String(raffleId);
    const close = useCallback(() => setPanel(null), []);

    const showOnWall = () => {
        switchWall(chosen, setupKey === 'one' ? 'single' : 'display');
        const name = raffles?.find((raffle) => String(raffle.id) === String(chosen))?.name;
        toast.success(`${name ?? 'The raffle'} is going up on the LED wall.`);
        if (!current) navigate(`/raffle/${chosen}/control${setupQuery}`);
    };

    return (
        <>
            <section className="panel flex flex-wrap items-end gap-3 p-4">
                {files.length > 0 && (
                    <div className="min-w-[12rem] pb-6 sm:max-w-xs">
                        <label className="label" htmlFor="raffle-file-switcher">Raffle file</label>
                        <select
                            id="raffle-file-switcher"
                            className="input"
                            value={fileFilter ?? ''}
                            onChange={(event) => chooseFile(event.target.value)}
                        >
                            <option value="">All raffles</option>
                            {files.map((file) => (
                                <option key={file.id} value={file.id}>{file.name} · {file.raffles_count} raffle{file.raffles_count === 1 ? '' : 's'}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="min-w-[14rem] flex-1">
                    <label className="label" htmlFor="raffle-switcher">Raffle on the LED wall</label>
                    <select
                        id="raffle-switcher"
                        className="input"
                        value={chosen}
                        onChange={(event) => setChosen(event.target.value)}
                        disabled={raffles === null}
                    >
                        {raffles === null && <option value={raffleId}>Loading raffles…</option>}
                        {/* The ordinary raffles by set (First Set, Second Set, …), then the pre-draws in a group of their own. */}
                        {[
                            ...groupBySet(listed.filter((raffle) => !raffle.is_predraw), 'Raffles'),
                            { set: 'predraw', label: 'Pre-drawn', raffles: listed.filter((raffle) => raffle.is_predraw) },
                        ].map((group) => group.raffles.length > 0 && (
                            <optgroup key={group.set ?? 'none'} label={group.label}>
                                {group.raffles.map((raffle) => (
                                    <option key={raffle.id} value={raffle.id}>
                                        {raffle.name} · {raffle.status}{String(raffle.id) === String(raffleId) ? ' (this one)' : ''}
                                    </option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                    <p className="mt-1.5 text-xs text-muted-dim">
                        {busy
                            ? 'Wait for the current draw to finish before switching.'
                            : onWall && current
                                ? 'The LED wall is showing this raffle.'
                                : 'The open screens switch in place and stay fullscreen.'}
                    </p>
                </div>

                <div className="flex flex-wrap gap-2 pb-6">
                    <button
                        type="button"
                        className="btn btn-gold"
                        onClick={showOnWall}
                        disabled={busy || raffles === null || (current && onWall)}
                    >
                        <MonitorUp size={15} />
                        Show on LED wall
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => setPanel('new')}>
                        <Plus size={15} />
                        New raffle
                    </button>
                    <button type="button" className="btn btn-ghost px-3" onClick={() => setPanel('edit')} title="Edit this raffle">
                        <Pencil size={15} />
                        Edit
                    </button>
                    <button type="button" className="btn btn-ghost px-3" onClick={() => setPanel('participants')} title="This raffle's participants">
                        <Users size={15} />
                        Participants
                    </button>
                </div>
            </section>

            <ControlDrawer
                open={panel === 'new'}
                title="New raffle"
                subtitle={activeFile
                    ? `In ${activeFile.name} — it starts with the file's participants.`
                    : 'It opens in its own Control Center, ready for its participants.'}
                onClose={close}
            >
                <NewRaffle
                    raffleFileId={activeFile?.id ?? null}
                    onCancel={close}
                    onCreated={(raffle) => {
                        close();
                        loadRaffles();
                        // Straight into the new raffle's Control Center — on its
                        // participants, unless it came with the file's.
                        const needsParticipants = !raffle.participants_count;
                        navigate(`/raffle/${raffle.id}/control${setupKey === 'one' ? '?setup=one' : ''}${needsParticipants ? `${setupKey === 'one' ? '&' : '?'}panel=participants` : ''}`);
                    }}
                />
            </ControlDrawer>

            <ControlDrawer open={panel === 'edit'} title="Edit raffle" subtitle={raffleName} onClose={close}>
                <EditRaffle
                    raffleId={raffleId}
                    onCancel={close}
                    onSaved={() => {
                        close();
                        loadRaffles();
                        onChanged?.();
                    }}
                />
            </ControlDrawer>

            <ControlDrawer
                open={panel === 'participants'}
                title="Participants"
                subtitle={raffleName}
                onClose={() => {
                    close();
                    onChanged?.();
                }}
            >
                <RaffleParticipants raffleId={raffleId} embedded />
            </ControlDrawer>
        </>
    );
}

export default memo(RaffleSwitcher);

function NewRaffle({ raffleFileId, onCancel, onCreated }) {
    const toast = useToast();
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const submit = async (payload) => {
        setSubmitting(true);
        setErrors({});
        try {
            const { data } = await api.post('/raffles', raffleFileId ? { ...payload, raffle_file_id: raffleFileId } : payload);
            saveLogoSizes(data.data.id, payload.logo_sizes);
            toast.success(data.data.participants_count
                ? `Raffle created with ${data.data.participants_count} participants. Set its prizes, then show it on the LED wall.`
                : 'Raffle created. Import its participants, then show it on the LED wall.');
            onCreated(data.data);
        } catch (error) {
            const parsed = parseError(error, 'The raffle could not be saved.');
            setErrors(parsed.errors);
            toast.error(parsed.message);
        } finally {
            setSubmitting(false);
        }
    };

    return <RaffleForm errors={errors} submitting={submitting} onSubmit={submit} onCancel={onCancel} />;
}

function EditRaffle({ raffleId, onCancel, onSaved }) {
    const toast = useToast();
    const [raffle, setRaffle] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        api.get(`/raffles/${raffleId}`)
            .then(({ data }) => setRaffle(data.data))
            .catch((error) => setLoadError(parseError(error, 'This raffle could not be loaded.').message));
    }, [raffleId]);

    const submit = async (payload) => {
        setSubmitting(true);
        setErrors({});
        try {
            await api.put(`/raffles/${raffleId}`, payload);
            saveLogoSizes(raffleId, payload.logo_sizes);
            toast.success('Raffle updated.');
            onSaved();
        } catch (error) {
            const parsed = parseError(error, 'The raffle could not be saved.');
            setErrors(parsed.errors);
            toast.error(parsed.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loadError) return <p className="text-sm text-red-300">{loadError}</p>;
    if (!raffle) return <LoadingState label="Loading raffle" />;
    return <RaffleForm raffle={raffle} errors={errors} submitting={submitting} onSubmit={submit} onCancel={onCancel} />;
}
