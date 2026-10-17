import { useRef, useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { prizeNames } from '../../lib/prizes';
import { useToast } from '../../context/ToastContext';

/**
 * A photo for each prize — the brand new car — shown on the main screen
 * beside the prize's name. One per prize name: the raffle's own prize, each
 * prize of its prize list, or each prize of its pre-selected list. JPG, PNG
 * or WebP, up to 8 MB; a picture on a plain or transparent background looks
 * best in the gold frame.
 */
export default function PrizePhotoPanel({ raffle, raffleId, onSaved }) {
    const toast = useToast();
    const [busy, setBusy] = useState(null);
    const names = prizeNames(raffle);
    const images = raffle?.prize_images ?? {};

    const upload = async (name, file) => {
        if (!file) return;
        setBusy(name);
        const body = new FormData();
        body.append('prize_name', name);
        body.append('image', file);
        try {
            await api.post(`/raffles/${raffleId}/prize-images`, body);
            await onSaved?.();
            toast.success(`Photo saved for ${name}. The main screen shows it beside the prize.`);
        } catch (failure) {
            toast.error(parseError(failure, 'The photo could not be saved.').message);
        } finally {
            setBusy(null);
        }
    };

    const remove = async (name) => {
        setBusy(name);
        try {
            await api.delete(`/raffles/${raffleId}/prize-images`, { data: { prize_name: name } });
            await onSaved?.();
            toast.success(`Photo removed from ${name}.`);
        } catch (failure) {
            toast.error(parseError(failure, 'The photo could not be removed.').message);
        } finally {
            setBusy(null);
        }
    };

    if (names.length === 0) return null;

    return (
        <section className="panel p-6">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
                <Camera size={16} className="text-gold" />
                Prize photos
            </h2>
            <p className="mt-0.5 text-xs text-muted">
                A picture of the prize, shown on the main screen in a gold frame beside its name. JPG, PNG or WebP up to 8 MB — a photo on a plain or see-through background looks best.
            </p>

            <ul className="mt-4 space-y-2.5">
                {names.map((name) => (
                    <PrizeRow key={name} name={name} src={images[name] ?? null} busy={busy === name} onUpload={(file) => upload(name, file)} onRemove={() => remove(name)} />
                ))}
            </ul>
        </section>
    );
}

function PrizeRow({ name, src, busy, onUpload, onRemove }) {
    const input = useRef(null);
    return (
        <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-black/30 p-3">
            <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-gold/25 bg-black/60">
                {src
                    ? <img src={src} alt={name} className="h-full w-full object-contain p-1" />
                    : <Camera size={18} className="text-muted-dim" />}
            </div>
            <p className="min-w-[10rem] flex-1 truncate text-sm font-semibold text-white" title={name}>{name}</p>
            <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => { onUpload(event.target.files?.[0]); event.target.value = ''; }}
            />
            <button type="button" className="btn btn-outline px-3 py-1.5 text-xs" onClick={() => input.current?.click()} disabled={busy}>
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                {src ? 'Change photo' : 'Add photo'}
            </button>
            {src && (
                <button type="button" className="btn btn-ghost px-2 py-1.5 text-xs text-red-300/80 hover:text-red-300" onClick={onRemove} disabled={busy} aria-label={`Remove the photo of ${name}`} title="Remove photo">
                    <Trash2 size={13} />
                </button>
            )}
        </li>
    );
}
