import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { winnerName as baseName } from '../../lib/format';

// The winners endpoint nests the person; the screens' feed has the name flat.
const winnerName = (item) => item?.name?.trim() || item?.participant?.name?.trim() || baseName(item);
import { useToast } from '../../context/ToastContext';
import ConfirmDialog from '../ui/ConfirmDialog';

/**
 * Swap one of this raffle's winners with a winner of another raffle (or
 * another place of this one): each takes the other's place and the prize
 * that goes with it. The operator picks the other raffle, then the winner
 * there. A locked raffle on either side needs the owner PIN.
 */
export default function SwapWinnerDialog({ raffle, winner, onClose, onDone }) {
    const toast = useToast();
    const [raffles, setRaffles] = useState(null);
    const [otherId, setOtherId] = useState('');
    const [others, setOthers] = useState(null);
    const [otherPosition, setOtherPosition] = useState('');
    const [pin, setPin] = useState('');
    const [busy, setBusy] = useState(false);
    const open = Boolean(raffle && winner);

    // Every raffle with winners, this one's raffle file first.
    useEffect(() => {
        if (!open) return;
        setRaffles(null);
        setOtherId('');
        setOthers(null);
        setOtherPosition('');
        setPin('');
        api.get('/raffles', { params: { include_predraws: 1, per_page: 200 } })
            .then(({ data }) => {
                const list = (data.data ?? [])
                    .filter((item) => (item.winners_drawn ?? 0) > 0 && !item.is_archived)
                    .sort((x, y) => {
                        const sameX = x.raffle_file_id === raffle.raffle_file_id ? 0 : 1;
                        const sameY = y.raffle_file_id === raffle.raffle_file_id ? 0 : 1;
                        return sameX - sameY || (x.draw_day ?? 99) - (y.draw_day ?? 99) || x.name.localeCompare(y.name);
                    });
                setRaffles(list);
            })
            .catch((error) => toast.error(parseError(error, 'The raffles could not be loaded.').message));
    }, [open, raffle?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // The other raffle's winners.
    useEffect(() => {
        if (!otherId) {
            setOthers(null);
            return;
        }
        setOthers(null);
        setOtherPosition('');
        api.get(`/raffles/${otherId}/winners`)
            .then(({ data }) => setOthers([...(data.data ?? [])].sort((x, y) => x.position - y.position)))
            .catch((error) => toast.error(parseError(error, 'The winners could not be loaded.').message));
    }, [otherId]); // eslint-disable-line react-hooks/exhaustive-deps

    const other = useMemo(() => raffles?.find((item) => String(item.id) === String(otherId)) ?? null, [raffles, otherId]);
    const target = useMemo(() => others?.find((item) => String(item.position) === String(otherPosition)) ?? null, [others, otherPosition]);
    const needsPin = Boolean(raffle?.is_locked || other?.is_locked);
    const samePlace = other && Number(other.id) === Number(raffle?.id) && Number(otherPosition) === Number(winner?.position);
    const ready = Boolean(other && target && !samePlace && (!needsPin || pin.trim()));

    const run = async () => {
        setBusy(true);
        try {
            const { data } = await api.post('/winners/swap', {
                a: { raffle_id: raffle.id, position: winner.position },
                b: { raffle_id: other.id, position: target.position },
                ...(needsPin ? { pin: pin.trim() } : {}),
            });
            toast.success(
                `#${winner.position} here is now ${data.data.a.name || data.data.a.ticket_number}; #${target.position} of "${other.name}" is now ${data.data.b.name || data.data.b.ticket_number}.`,
                { title: 'Winners swapped' },
            );
            onDone?.();
            onClose();
        } catch (error) {
            toast.error(parseError(error, 'The winners could not be swapped.').message);
        } finally {
            setBusy(false);
        }
    };

    const label = (item) => `${winnerName(item)} · ${item.ticket_number}${item.prize_name ? ` · ${item.prize_name}` : ''}`;

    return (
        <ConfirmDialog
            open={open}
            title="Swap this winner?"
            description={open
                ? `Winner #${winner.position} of "${raffle.name}" (${winnerName(winner)}, ticket ${winner.ticket_number}) changes places with a winner of another raffle. Each keeps the place and prize they move into. Both stay winners.`
                : ''}
            confirmLabel="Swap winners"
            tone="gold"
            busy={busy}
            confirmDisabled={!ready}
            onConfirm={run}
            onCancel={onClose}
        >
            {open && (
                <div className="space-y-4">
                    <div>
                        <label className="label" htmlFor="swap-raffle">Swap with a winner of</label>
                        {raffles === null ? (
                            <p className="flex items-center gap-2 text-xs text-muted"><Loader2 size={12} className="animate-spin" /> Loading raffles…</p>
                        ) : (
                            <select id="swap-raffle" className="input" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
                                <option value="">Choose a raffle…</option>
                                {raffles.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.name}{item.draw_day ? ` · Day ${item.draw_day}` : ''} · {item.winners_drawn} winner{item.winners_drawn === 1 ? '' : 's'}{item.id === raffle.id ? ' (this raffle)' : ''}{item.is_locked ? ' · locked' : ''}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {otherId && (
                        <div>
                            <label className="label" htmlFor="swap-winner">Which winner</label>
                            {others === null ? (
                                <p className="flex items-center gap-2 text-xs text-muted"><Loader2 size={12} className="animate-spin" /> Loading winners…</p>
                            ) : (
                                <select id="swap-winner" className="input" value={otherPosition} onChange={(e) => setOtherPosition(e.target.value)}>
                                    <option value="">Choose a winner…</option>
                                    {others.map((item) => (
                                        <option key={item.position} value={item.position} disabled={Number(other?.id) === Number(raffle.id) && item.position === winner.position}>
                                            #{item.position} · {label(item)}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}

                    {target && (
                        <div className="rounded-xl border border-gold/30 bg-gold/[0.06] p-3.5 text-sm">
                            <div className="flex items-center gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs text-muted">#{winner.position} of {raffle.name} becomes</p>
                                    <p className="truncate font-semibold text-white">{winnerName(target)} <span className="text-muted">· {target.ticket_number}</span></p>
                                </div>
                                <ArrowLeftRight size={16} className="shrink-0 text-gold" />
                                <div className="min-w-0 flex-1 text-right">
                                    <p className="text-xs text-muted">#{target.position} of {other.name} becomes</p>
                                    <p className="truncate font-semibold text-white">{winnerName(winner)} <span className="text-muted">· {winner.ticket_number}</span></p>
                                </div>
                            </div>
                        </div>
                    )}

                    {needsPin && (
                        <div>
                            <label className="label" htmlFor="swap-pin">Owner PIN</label>
                            <input id="swap-pin" type="password" inputMode="numeric" autoComplete="off" className="input w-40" value={pin} onChange={(e) => setPin(e.target.value)} />
                            <p className="mt-1.5 text-xs text-muted-dim">{raffle.is_locked && other?.is_locked ? 'Both raffles are' : 'One of the raffles is'} locked.</p>
                        </div>
                    )}
                </div>
            )}
        </ConfirmDialog>
    );
}
