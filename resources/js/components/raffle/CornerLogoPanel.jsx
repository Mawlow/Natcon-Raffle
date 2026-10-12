import { memo, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import CornerLogoPicker from './CornerLogoPicker';
import { CHANGED_EVENT, loadLogoSizes, saveLogoSizes } from '../../lib/logoSizes';

/**
 * The "Congratulations" screen's corner logos, set from the Control Center.
 * Each change is saved at once; the open screens pick it up on their next
 * check with the server. `onSaved` reloads the raffle here.
 */
export default memo(CornerLogoPanel);

function CornerLogoPanel({ raffle, raffleId, onSaved }) {
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    // Their size lives with the other logo sizes, in this browser, and the
    // open screens follow each move straight away.
    const [sizes, setSizes] = useState(() => loadLogoSizes(raffleId));
    useEffect(() => {
        setSizes(loadLogoSizes(raffleId));
        const onChanged = (event) => {
            if (event.detail?.raffleId === String(raffleId)) setSizes(loadLogoSizes(raffleId));
        };
        window.addEventListener(CHANGED_EVENT, onChanged);
        return () => window.removeEventListener(CHANGED_EVENT, onChanged);
    }, [raffleId]);
    const resize = (key, value) => saveLogoSizes(raffleId, { ...loadLogoSizes(raffleId), [key]: value });

    const change = async (side, id) => {
        setSaving(true);
        try {
            await api.put(`/raffles/${raffleId}`, { [`logo_${side}`]: id });
            await onSaved();
        } catch (error) {
            toast.error(parseError(error, 'The logo could not be saved.').message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="panel p-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="font-display text-base font-bold text-white">Congratulations screen logos</h2>
                    <p className="mt-0.5 text-xs text-muted">Top left and top right, either side of NATCON, with this screen's own logo sizes. Saved as you choose.</p>
                </div>
                {saving && <Loader2 size={16} className="animate-spin text-gold" />}
            </div>
            <div className="mt-5">
                <CornerLogoPicker
                    value={{ left: raffle.logo_left?.id ?? null, right: raffle.logo_right?.id ?? null }}
                    onChange={change}
                    disabled={saving}
                    sizes={sizes}
                    onSizeChange={resize}
                    companyIds={(raffle.logos ?? []).map((logo) => logo.id)}
                />
            </div>
        </section>
    );
}
