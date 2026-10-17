import { useEffect, useState } from 'react';
import api, { parseError } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { useToast } from '../../context/ToastContext';
import ConfirmDialog from '../ui/ConfirmDialog';
import { RedrawChoice, RedrawCount, RedrawMode, validRedrawCount } from './RedrawOptions';

/** A pre-draw with its winners already chosen: it is played again, not re-picked. */
export const isReplay = (raffle) => Boolean(raffle?.is_predraw) && ((raffle.staged_prizes?.length ?? raffle.winners_count ?? 0) > 0);

/**
 * Clear a raffle's winners and set it back to READY, from a raffle list —
 * the same redraw as the raffle page and the Control Center. A raffle with a
 * prize list keeps its number of winners (it comes from the prizes).
 *
 * A pre-draw is not redrawn but played again: its revealed winners are
 * cleared from the screens and the draw reveals the same winners once more,
 * in the same order, because its pre-selected list stays as it is.
 */
export default function RedrawDialog({ raffle, onClose, onDone }) {
    const toast = useToast();
    const [choice, setChoice] = useState(null);
    const [count, setCount] = useState('');
    const [busy, setBusy] = useState(false);
    const hasPrizeList = Boolean(raffle?.prizes?.length);
    // A raffle drawn at random that has winners can be played again too:
    // its winners become its list. The operator chooses that or a random redraw.
    const [mode, setMode] = useState('same');
    const canKeep = !isReplay(raffle) && (raffle?.winners_drawn ?? 0) > 0;
    const replay = isReplay(raffle) || (canKeep && mode === 'same');

    useEffect(() => {
        if (!raffle) return;
        setChoice(null);
        setMode('same');
        setCount(String(raffle.winners_count ?? 1));
    }, [raffle]);

    const run = async () => {
        setBusy(true);
        try {
            if (replay) {
                const { data } = await api.post(`/raffles/${raffle.id}/replay`);
                const winners = data.data.winners_count;
                toast.success(
                    `"${raffle.name}" is ready to play again: the draw reveals the same ${winners} winner${winners === 1 ? '' : 's'} in the same order.`,
                    { title: 'Ready to play again' },
                );
            } else {
                const { data } = await api.post(`/raffles/${raffle.id}/redraw`, {
                    include_previous_winners: choice === 'include',
                    ...(hasPrizeList ? {} : { winners_count: Number(count) }),
                });
                const winners = data.data.winners_count;
                toast.success(
                    `"${raffle.name}" is ready to draw again: ${winners} winner${winners === 1 ? '' : 's'} from ${formatNumber(data.data.eligible_count)} tickets. Open screens update within a few seconds.`,
                    { title: 'Winners cleared' },
                );
            }
            onDone?.();
            onClose();
        } catch (error) {
            toast.error(parseError(error, replay ? 'The pre-draw could not be reset.' : 'The raffle could not be redrawn.').message);
        } finally {
            setBusy(false);
        }
    };

    const drawn = raffle?.winners_drawn ?? 0;

    if (replay && !canKeep) {
        return (
            <ConfirmDialog
                open={Boolean(raffle)}
                title="Play this pre-draw again?"
                description={raffle
                    ? `The ${drawn} revealed winner${drawn === 1 ? '' : 's'} of "${raffle.name}" ${drawn === 1 ? 'is' : 'are'} cleared from the screens and the pre-draw set back to READY. When it is drawn again, the same winners come out in the same order — nobody on the list changes.\n\nThe earlier reveals stay in the audit log.`
                    : ''}
                confirmLabel="Play again — same winners"
                tone="gold"
                busy={busy}
                onConfirm={run}
                onCancel={onClose}
            />
        );
    }

    return (
        <ConfirmDialog
            open={Boolean(raffle)}
            title={canKeep ? 'Redraw this raffle?' : 'Clear the winners and draw again?'}
            description={raffle
                ? canKeep
                    ? `"${raffle.name}" has ${drawn} winner${drawn === 1 ? '' : 's'}. Play it again on the screens with the same winners, or clear them and draw new ones at random. Either way it is set back to READY for the Control Center.\n\nThe original draws stay in the audit log.`
                    : `The ${drawn} winner${drawn === 1 ? '' : 's'} of "${raffle.name}" will be cleared and the raffle set back to READY, so it can be drawn again from the Control Center.\n\nThe original draws stay in the audit log.`
                : ''}
            confirmLabel={replay ? 'Play again — same winners' : 'Clear winners & make ready'}
            tone="gold"
            busy={busy}
            confirmDisabled={!replay && (!choice || (!hasPrizeList && !validRedrawCount(count)))}
            onConfirm={run}
            onCancel={onClose}
        >
            {raffle && (
                <div className="space-y-5">
                    {canKeep && <RedrawMode value={mode} onChange={setMode} />}
                    {!replay && !hasPrizeList && (
                        <RedrawCount value={count} onChange={setCount} eligible={raffle.participants_count ?? 0} />
                    )}
                    {!replay && <RedrawChoice value={choice} onChange={setChoice} />}
                </div>
            )}
        </ConfirmDialog>
    );
}
