import { useEffect, useState } from 'react';
import { Dices, Loader2, X } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { useToast } from '../../context/ToastContext';

/**
 * After a winner is taken off (absent, say): where the replacement comes
 * from — one developer's people, or the raffle's own pool.
 *
 * On a pre-draw (`staged`), the replacement is picked now and goes on the
 * end of the list with the same prize; the next DRAW on the wall reveals
 * them like any winner. On a random raffle, the choice is kept for the next
 * DRAW, which then picks from that developer only. `place` is
 * { prize_name, position, ticket_number } of the winner taken off.
 */
export default function FillPlacePanel({ raffleId, place, poolLabel, staged = true, onDone, onClose, disabled = false }) {
    const toast = useToast();
    const [developers, setDevelopers] = useState(null);
    const [developer, setDeveloper] = useState('');
    const [picking, setPicking] = useState(false);

    useEffect(() => {
        api.get(`/raffles/${raffleId}/participants/groups`)
            .then(({ data }) => setDevelopers(data.data?.developers ?? []))
            .catch(() => setDevelopers([]));
    }, [raffleId]);

    const pick = async () => {
        setPicking(true);
        try {
            const { data } = await api.post(`/raffles/${raffleId}/winners/replace`, {
                developer: developer || null,
                prize_name: place.prize_name,
                exclude_ticket: place.ticket_number ?? null,
            });
            toast.success(data.message, { title: 'Replacement picked' });
            await onDone?.(data.data);
        } catch (error) {
            toast.error(parseError(error, 'No replacement could be picked.').message);
        } finally {
            setPicking(false);
        }
    };

    return (
        <div className="mt-4 rounded-xl border border-gold/40 bg-gold/[0.07] p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-display text-sm font-bold text-white">Winner #{place.position} taken off — pick the replacement now?</p>
                    <p className="mt-0.5 text-xs text-muted">
                        Picks someone at random who has not won today, from the developer you choose, and puts them straight into the winners list{staged ? ' and on the pre-draw list' : ''}. The screens update by themselves; nothing is drawn on the wall.
                    </p>
                </div>
                <button type="button" className="rounded p-1 text-muted hover:text-white" onClick={onClose} aria-label="Leave the place open" disabled={picking}>
                    <X size={14} />
                </button>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="min-w-[14rem] flex-1">
                    <label className="label" htmlFor="fill-developer">Pick from</label>
                    <select
                        id="fill-developer"
                        className="input"
                        value={developer}
                        onChange={(event) => setDeveloper(event.target.value)}
                        disabled={developers === null || picking}
                    >
                        <option value="">{poolLabel ? `This raffle's pool (${poolLabel})` : 'All participants'}</option>
                        {(developers ?? []).map((group) => (
                            <option key={group.value} value={group.value}>
                                {group.value} · {formatNumber(group.eligible)} in play
                            </option>
                        ))}
                    </select>
                </div>
                <button type="button" className="btn btn-gold" onClick={pick} disabled={picking || disabled || developers === null}>
                    {picking ? <Loader2 size={15} className="animate-spin" /> : <Dices size={15} />}
                    Pick at random
                </button>
            </div>
        </div>
    );
}
