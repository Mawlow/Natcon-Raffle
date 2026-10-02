import { memo, useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MonitorUp, Pencil, Plus, Users } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { switchWall } from '../../lib/wallSwitch';
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

    const loadRaffles = useCallback(() => {
        api.get('/raffles', { params: { per_page: 100 } })
            .then(({ data }) => setRaffles(data.data))
            .catch(() => setRaffles([]));
    }, []);
    useEffect(() => { loadRaffles(); }, [loadRaffles]);

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
                        {(raffles ?? []).map((raffle) => (
                            <option key={raffle.id} value={raffle.id}>
                                {raffle.name} · {raffle.status}{String(raffle.id) === String(raffleId) ? ' (this one)' : ''}
                            </option>
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

            <ControlDrawer open={panel === 'new'} title="New raffle" subtitle="It opens in its own Control Center, ready for its participants." onClose={close}>
                <NewRaffle
                    onCancel={close}
                    onCreated={(raffle) => {
                        close();
                        loadRaffles();
                        // Straight into the new raffle's Control Center, on its participants.
                        navigate(`/raffle/${raffle.id}/control?${setupKey === 'one' ? 'setup=one&' : ''}panel=participants`);
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

function NewRaffle({ onCancel, onCreated }) {
    const toast = useToast();
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const submit = async (payload) => {
        setSubmitting(true);
        setErrors({});
        try {
            const { data } = await api.post('/raffles', payload);
            toast.success('Raffle created. Import its participants, then show it on the LED wall.');
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
