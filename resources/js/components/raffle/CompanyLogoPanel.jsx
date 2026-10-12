import { memo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import LogoPicker from './LogoPicker';

/**
 * This raffle's company logos — the partner companies shown on the prize
 * screen — set from the Control Center. Each change is saved at once; the
 * open screens pick it up on their next check with the server.
 */
export default memo(CompanyLogoPanel);

function CompanyLogoPanel({ raffle, raffleId, onSaved }) {
    const toast = useToast();
    const [saving, setSaving] = useState(false);

    const change = async (ids) => {
        setSaving(true);
        try {
            await api.put(`/raffles/${raffleId}`, { logos: ids });
            await onSaved();
        } catch (error) {
            toast.error(parseError(error, 'The logos could not be saved.').message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="panel p-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="font-display text-base font-bold text-white">Company logos</h2>
                    <p className="mt-0.5 text-xs text-muted">The partner companies for this raffle, shown on the prize screen. Saved as you choose.</p>
                </div>
                {saving && <Loader2 size={16} className="animate-spin text-gold" />}
            </div>
            <div className="mt-5">
                <LogoPicker value={(raffle.logos ?? []).map((logo) => logo.id)} onChange={change} />
            </div>
        </section>
    );
}
