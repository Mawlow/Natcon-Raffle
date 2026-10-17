import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import ConfirmDialog from '../ui/ConfirmDialog';

/**
 * Unlocks a raffle's winners with the owner PIN. Everyone is signed in as
 * the administrator, so the PIN (RAFFLE_OWNER_PIN in .env) is what tells
 * the owner apart: only they can open a locked raffle's winners up to
 * being changed or removed. `raffle` is the one to unlock, or null.
 */
export default function UnlockDialog({ raffle, onClose, onDone }) {
    const toast = useToast();
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (raffle) {
            setPin('');
            setError(null);
        }
    }, [raffle]);

    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            const { data } = await api.post(`/raffles/${raffle.id}/unlock`, { pin });
            toast.success(data.message ?? 'Winners unlocked.', { title: 'Unlocked' });
            onDone?.(raffle);
            onClose();
        } catch (failure) {
            setError(parseError(failure, 'The raffle could not be unlocked.').message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <ConfirmDialog
            open={Boolean(raffle)}
            title="Unlock the winners?"
            description={raffle
                ? `"${raffle.name}" is locked so nobody can change or remove its winners. Only the owner can unlock it, with the owner PIN.\n\nOnce unlocked, its pre-selected list can be edited, winners taken off, and the raffle deleted — so lock it again when you are done.`
                : ''}
            confirmLabel="Unlock"
            tone="gold"
            busy={busy}
            confirmDisabled={pin.trim() === ''}
            onConfirm={run}
            onCancel={onClose}
        >
            <div>
                <label className="label" htmlFor="owner-pin">Owner PIN</label>
                <div className="relative">
                    <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim" />
                    <input
                        id="owner-pin"
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        autoFocus
                        className="input pl-9"
                        value={pin}
                        disabled={busy}
                        onChange={(event) => setPin(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && pin.trim() && !busy) run();
                        }}
                    />
                </div>
                {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
            </div>
        </ConfirmDialog>
    );
}

/** Locks a raffle's winners straight away (no PIN needed to lock). */
export async function lockWinners(raffle) {
    const { data } = await api.post(`/raffles/${raffle.id}/lock`);
    return data;
}
