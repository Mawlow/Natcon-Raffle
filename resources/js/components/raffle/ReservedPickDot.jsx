import { useCallback, useEffect, useState } from 'react';
import api, { parseError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';

/**
 * The reserved pick, behind a near-invisible dot in the Control Center
 * header. The person set (by name and ticket, through the API) never comes
 * up in a random draw. Click the dot and it turns gold: they come out in
 * this raffle as the 3rd or 4th winner, never first or last, after which
 * the dot goes grey again by itself. Click it again to turn it off. Nothing
 * on the screens, the raffle card or the participant lists shows any of this.
 */
export default function ReservedPickDot({ raffleId, winnersDrawn, midDraw }) {
    const toast = useToast();
    const [pick, setPick] = useState(null);
    const [busy, setBusy] = useState(false);
    const id = Number(raffleId);

    const load = useCallback(() => (
        api.get('/reserved-pick', { params: { raffle: id } })
            .then(({ data }) => setPick(data.data))
            .catch(() => {})
    ), [id]);

    // Loaded with the page and again after every draw (it turns itself off).
    useEffect(() => {
        load();
    }, [load, winnersDrawn]);

    const armedHere = pick?.armed_raffle_id === id;
    const isSet = Boolean(pick?.name && pick?.ticket_number);

    const toggle = async () => {
        if (!pick || busy || midDraw) return;
        if (!isSet || pick.in_raffle === false) {
            toast.error(isSet ? 'Not on this raffle\'s participant list.' : 'Nobody is set.');
            return;
        }
        setBusy(true);
        try {
            const { data } = await api.put('/reserved-pick', {
                name: pick.name,
                ticket_number: pick.ticket_number,
                armed_raffle_id: armedHere ? null : id,
            }, { params: { raffle: id } });
            setPick(data.data);
        } catch (error) {
            toast.error(parseError(error, 'Could not change it.').message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={busy || midDraw}
            className={`block h-2.5 w-2.5 rounded-full transition ${
                armedHere ? 'bg-gold' : 'bg-white/10 hover:bg-white/25'
            }`}
            aria-label="Options"
        />
    );
}
