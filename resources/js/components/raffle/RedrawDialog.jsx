import { useEffect, useState } from 'react';
import api, { parseError } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { useToast } from '../../context/ToastContext';
import ConfirmDialog from '../ui/ConfirmDialog';
import { RedrawChoice, RedrawCount, validRedrawCount } from './RedrawOptions';

/**
 * Clear a raffle's winners and set it back to READY, from a raffle list —
 * the same redraw as the raffle page and the Control Center. A raffle with a
 * prize list keeps its number of winners (it comes from the prizes).
 */
export default function RedrawDialog({ raffle, onClose, onDone }) {
    const toast = useToast();
    const [choice, setChoice] = useState(null);
    const [count, setCount] = useState('');
    const [busy, setBusy] = useState(false);
    const hasPrizeList = Boolean(raffle?.prizes?.length);

    useEffect(() => {
        if (!raffle) return;
        setChoice(null);
        setCount(String(raffle.winners_count ?? 1));
    }, [raffle]);

    const run = async () => {
        setBusy(true);
        try {
            const { data } = await api.post(`/raffles/${raffle.id}/redraw`, {
                include_previous_winners: choice === 'include',
                ...(hasPrizeList ? {} : { winners_count: Number(count) }),
            });
            const winners = data.data.winners_count;
            toast.success(
                `"${raffle.name}" is ready to draw again: ${winners} winner${winners === 1 ? '' : 's'} from ${formatNumber(data.data.eligible_count)} tickets. Open screens update within a few seconds.`,
                { title: 'Winners cleared' },
            );
            onDone?.();
            onClose();
        } catch (error) {
            toast.error(parseError(error, 'The raffle could not be redrawn.').message);
        } finally {
            setBusy(false);
        }
    };

    const drawn = raffle?.winners_drawn ?? 0;

    return (
        <ConfirmDialog
            open={Boolean(raffle)}
            title="Clear the winners and draw again?"
            description={raffle
                ? `The ${drawn} winner${drawn === 1 ? '' : 's'} of "${raffle.name}" will be cleared and the raffle set back to READY, so it can be drawn again from the Control Center.\n\nThe original draws stay in the audit log.`
                : ''}
            confirmLabel="Clear winners & make ready"
            tone="gold"
            busy={busy}
            confirmDisabled={!choice || (!hasPrizeList && !validRedrawCount(count))}
            onConfirm={run}
            onCancel={onClose}
        >
            {raffle && (
                <div className="space-y-5">
                    {!hasPrizeList && (
                        <RedrawCount value={count} onChange={setCount} eligible={raffle.participants_count ?? 0} />
                    )}
                    <RedrawChoice value={choice} onChange={setChoice} />
                </div>
            )}
        </ConfirmDialog>
    );
}
