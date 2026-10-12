import { memo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { useToast } from '../../context/ToastContext';
import PoolPicker, { usePoolGroups } from './PoolPicker';

/**
 * Who can win the next draw, for a raffle with one prize: every participant,
 * only the chosen tags, or only the chosen developers. Saved on the raffle as
 * each choice is made, and the server applies it to every draw — the screens
 * only ever see the result. It can change between winners. (A raffle with a
 * prize list sets this per prize instead.)
 */
export default memo(DrawPoolPanel);

function DrawPoolPanel({ raffle, raffleId, midDraw, onSaved }) {
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    // Counts change as winners come out, so reload them with each one.
    const [groups, reloadGroups] = usePoolGroups(raffleId, raffle.winners?.length ?? 0);

    const save = async (filter) => {
        setSaving(true);
        try {
            await api.put(`/raffles/${raffleId}`, { draw_filter: filter ?? { type: 'all' } });
            await Promise.all([onSaved(), reloadGroups()]);
        } catch (error) {
            toast.error(parseError(error, 'Who can win could not be saved.').message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="panel p-6">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="font-display text-base font-bold text-white">Who can win</h2>
                    <p className="mt-0.5 text-xs text-muted">
                        Drawing from <span className="font-semibold text-gold-bright">{raffle.draw_pool_label ?? 'all participants'}</span>
                        {' · '}{formatNumber(raffle.eligible_count)} tickets in play.
                        {midDraw ? ' Locked while a draw is running.' : ' Can change between winners.'}
                    </p>
                </div>
                {saving && <Loader2 size={16} className="shrink-0 animate-spin text-gold" />}
            </div>

            <div className="mt-4">
                <PoolPicker value={raffle.draw_filter ?? null} onChange={save} groups={groups} disabled={midDraw || saving} />
            </div>
        </section>
    );
}
