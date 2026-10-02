import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, EyeOff, MonitorPlay, Pencil, Plus, RotateCcw, Trash2, Tv, X } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { formatPrizeValue } from '../../lib/format';
import { DEFAULT_LOGO_SIZES, loadLogoSizes, saveLogoSizes } from '../../lib/logoSizes';
import { PRIZE_SHOW_SIZES_KEY, notifyPrizeShow } from '../../lib/prizeShowSync';
import LogoPicker from '../raffle/LogoPicker';
import { SizeSlider } from '../raffle/LogoSizePanel';
import { AmountInput, PRIZE_TYPES } from '../raffle/RaffleForm';
import ConfirmDialog from '../ui/ConfirmDialog';
import LoadingState, { InlineSpinner } from '../ui/LoadingState';
import LogoMark from '../ui/LogoMark';
import { useToast } from '../../context/ToastContext';

const BLANK = {
    title: '',
    prize_name: '',
    prize_type: 'cash',
    prize_value: '',
    prize_currency: 'PHP',
    logos: [],
};

// Kept fresh, so a prize added in one window shows up in the others.
const REFRESH_MS = 10000;

/** "₱50,000 Cash Prize" or "Brand New Car (worth ₱1,500,000)". */
export function prizeLine(slide) {
    const value = formatPrizeValue(slide.prize_value, slide.prize_currency);
    if (slide.prize_type === 'item') return value ? `${slide.prize_name} (worth ${value})` : slide.prize_name;
    return value ? `${value} ${slide.prize_name}` : slide.prize_name;
}

/**
 * Everything for the Prize Display — the screen for raffles drawn by hand,
 * which shows only a prize: add, edit and delete prizes with their company
 * logos, choose which one is on the screen (or none), and size the logos.
 *
 * The Prize Display page shows it full width (`variant="page"`); every
 * raffle's Control Center carries it as a compact panel (`variant="panel"`),
 * with the form and the logo sizes folded away until wanted. `onLive(slide)`
 * runs once a prize is on the screen — the Control Center uses it to turn its
 * main screen over to the Prize Display. `showDisabled` holds back the
 * "Show on screen" buttons, with `showHint` saying why.
 */
export default function PrizeManager({ variant = 'page', onLive, showDisabled = false, showHint = null, aside = null }) {
    const toast = useToast();
    const panel = variant === 'panel';
    const [slides, setSlides] = useState(null);
    const [form, setForm] = useState(BLANK);
    const [editingId, setEditingId] = useState(null);
    // In the panel the form is folded away until "Add a prize" or an edit.
    const [formOpen, setFormOpen] = useState(!panel);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [deleting, setDeleting] = useState(null);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get('/prize-slides');
            setSlides(data.data);
        } catch (error) {
            setSlides((current) => {
                if (current === null) toast.error(parseError(error, 'The prizes could not be loaded.').message);
                return current ?? [];
            });
        }
    }, [toast]);

    useEffect(() => {
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => clearInterval(timer);
    }, [load]);

    const live = slides?.find((slide) => slide.is_live) ?? null;
    const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

    const closeForm = () => {
        setForm(BLANK);
        setEditingId(null);
        setErrors({});
        if (panel) setFormOpen(false);
    };

    const openNew = () => {
        setForm(BLANK);
        setEditingId(null);
        setErrors({});
        setFormOpen(true);
    };

    const edit = (slide) => {
        setEditingId(slide.id);
        setErrors({});
        setForm({
            title: slide.title ?? '',
            prize_name: slide.prize_name,
            prize_type: slide.prize_type,
            prize_value: slide.prize_value ?? '',
            prize_currency: slide.prize_currency ?? 'PHP',
            logos: (slide.logos ?? []).map((logo) => logo.id),
        });
        setFormOpen(true);
        if (!panel) window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Saves the form; with `andShow`, puts the prize on the screen as well.
    const save = async (andShow = false) => {
        setSaving(true);
        setErrors({});
        const payload = {
            ...form,
            title: form.title || null,
            prize_value: form.prize_value === '' ? null : Number(form.prize_value),
        };
        try {
            const { data } = editingId
                ? await api.put(`/prize-slides/${editingId}`, payload)
                : await api.post('/prize-slides', payload);
            if (andShow) await api.post(`/prize-slides/${data.data.id}/live`);
            toast.success(andShow ? 'Saved and on the screen.' : editingId ? 'Prize updated.' : 'Prize saved.');
            closeForm();
            await load();
            notifyPrizeShow();
            if (andShow) onLive?.(data.data);
        } catch (error) {
            const parsed = parseError(error, 'The prize could not be saved.');
            setErrors(parsed.errors);
            toast.error(parsed.message);
        } finally {
            setSaving(false);
        }
    };

    const showOnScreen = async (slide) => {
        setBusyId(slide.id);
        try {
            if (!slide.is_live) await api.post(`/prize-slides/${slide.id}/live`);
            await load();
            notifyPrizeShow();
            onLive?.(slide);
        } catch (error) {
            toast.error(parseError(error, 'The prize could not be put on the screen.').message);
        } finally {
            setBusyId(null);
        }
    };

    const blank = async () => {
        setBusyId('blank');
        try {
            await api.post('/prize-slides/clear-live');
            await load();
            notifyPrizeShow();
        } catch (error) {
            toast.error(parseError(error, 'The screen could not be cleared.').message);
        } finally {
            setBusyId(null);
        }
    };

    const remove = async () => {
        try {
            await api.delete(`/prize-slides/${deleting.id}`);
            if (editingId === deleting.id) closeForm();
            setDeleting(null);
            await load();
            notifyPrizeShow();
        } catch (error) {
            toast.error(parseError(error, 'The prize could not be deleted.').message);
        }
    };

    const formBlock = (
        <PrizeForm
            form={form}
            set={set}
            errors={errors}
            saving={saving}
            editing={Boolean(editingId)}
            showDisabled={showDisabled}
            onSave={save}
            onCancel={closeForm}
            compact={panel}
        />
    );

    const list = (
        <PrizeList
            slides={slides}
            busyId={busyId}
            showDisabled={showDisabled}
            onShow={showOnScreen}
            onEdit={edit}
            onDelete={setDeleting}
            editingId={editingId}
            compact={panel}
        />
    );

    const dialog = (
        <ConfirmDialog
            open={Boolean(deleting)}
            title="Delete this prize?"
            description={deleting ? `“${prizeLine(deleting)}” will be removed${deleting.is_live ? ' and taken off the screen' : ''}.` : ''}
            confirmLabel="Delete"
            onConfirm={remove}
            onCancel={() => setDeleting(null)}
        />
    );

    if (panel) {
        return (
            <div>
                <LiveLine live={live} busy={busyId === 'blank'} onBlank={blank} compact />
                {showHint && <p className="mt-2 text-xs text-muted-dim">{showHint}</p>}

                <div className="mt-5 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">Prizes</p>
                    {!formOpen && (
                        <button type="button" className="btn btn-outline px-3 py-1.5 text-xs" onClick={openNew}>
                            <Plus size={13} />
                            Add a prize
                        </button>
                    )}
                </div>

                {formOpen && (
                    <div className="mt-3 rounded-xl border border-gold/30 bg-gold/[0.03] p-4">
                        <div className="mb-4 flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-white">{editingId ? 'Edit prize' : 'Add a prize'}</p>
                            <button type="button" className="rounded p-1 text-muted hover:text-white" onClick={closeForm} aria-label="Close the form">
                                <X size={15} />
                            </button>
                        </div>
                        {formBlock}
                    </div>
                )}

                <div className="mt-3">{list}</div>

                <details className="group mt-5 rounded-xl border border-line bg-black/20">
                    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-white">
                        Prize Display logo size
                        <ChevronDown size={15} className="text-muted transition group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-line px-4 py-4">
                        <SizeControls />
                    </div>
                </details>

                {dialog}
            </div>
        );
    }

    return (
        <>
            <section className="panel panel-gold p-5">
                <LiveLine live={live} busy={busyId === 'blank'} onBlank={blank} />
            </section>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
                <div className="space-y-5">
                    <section className="panel p-6">
                        <div className="mb-5 flex items-center justify-between gap-3">
                            <h2 className="font-display text-base font-bold text-white">{editingId ? 'Edit prize' : 'Add a prize'}</h2>
                            {editingId && (
                                <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={closeForm}>
                                    <RotateCcw size={13} />
                                    Cancel editing
                                </button>
                            )}
                        </div>
                        {formBlock}
                    </section>

                    <section className="panel p-6">
                        <h2 className="font-display text-base font-bold text-white">Saved prizes</h2>
                        <p className="mt-0.5 text-xs text-muted">Press “Show on screen” to switch the wall to that prize. You can switch any time.</p>
                        <div className="mt-5">{list}</div>
                    </section>
                </div>

                <aside className="space-y-5">
                    {aside}
                    <section className="panel p-6">
                        <h2 className="font-display text-base font-bold text-white">Logo size</h2>
                        <p className="mt-0.5 text-xs text-muted">Changes show on the screen straight away.</p>
                        <div className="mt-5">
                            <SizeControls />
                        </div>
                    </section>
                </aside>
            </div>

            {dialog}
        </>
    );
}

/** What the Prize Display shows right now, with the button to blank it. */
function LiveLine({ live, busy, onBlank, compact = false }) {
    return (
        <div className={`flex flex-wrap items-center justify-between gap-3 ${compact ? 'rounded-xl border border-line bg-black/30 p-3' : ''}`}>
            <div className="flex min-w-0 items-center gap-3">
                <span className={`grid shrink-0 place-items-center rounded-xl border ${compact ? 'h-9 w-9' : 'h-11 w-11'} ${live ? 'border-gold/50 bg-gold/15 text-gold' : 'border-line text-muted-dim'}`}>
                    <Tv size={compact ? 16 : 19} />
                </span>
                <div className="min-w-0">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-dim">On the Prize Display now</p>
                    <p className={`truncate font-display font-extrabold text-white ${compact ? 'text-sm' : 'text-lg'}`}>
                        {live ? prizeLine(live) : 'Standby: the NATCON logo'}
                    </p>
                    {live?.title && <p className="truncate text-xs text-muted">{live.title}</p>}
                </div>
            </div>
            <button type="button" className={`btn btn-outline ${compact ? 'px-3 py-1.5 text-xs' : ''}`} onClick={onBlank} disabled={!live || busy}>
                {busy ? <InlineSpinner /> : <EyeOff size={compact ? 13 : 15} />}
                {compact ? 'None (NATCON logo)' : 'Blank screen'}
            </button>
        </div>
    );
}

function PrizeForm({ form, set, errors, saving, editing, showDisabled, onSave, onCancel, compact }) {
    const isItem = form.prize_type === 'item';
    const fieldError = (key) => errors[key]?.[0];
    const id = (name) => `${compact ? 'panel' : 'page'}-${name}`;

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                onSave(false);
            }}
            className="space-y-5"
        >
            <div>
                <label className="label" htmlFor={id('title')}>
                    Title <span className="text-xs font-normal text-muted-dim">(optional, shown above the prize)</span>
                </label>
                <input
                    id={id('title')}
                    className="input"
                    maxLength={160}
                    value={form.title}
                    onChange={(event) => set('title', event.target.value)}
                    placeholder="Manual Raffle · Grand Prize"
                />
                {fieldError('title') && <p className="mt-1.5 text-xs text-red-300">{fieldError('title')}</p>}
            </div>

            <fieldset>
                <legend className="label">What kind of prize?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                    {PRIZE_TYPES.map(({ value, icon: Icon, title, text }) => {
                        const selected = form.prize_type === value;
                        return (
                            <label
                                key={value}
                                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition focus-within:ring-2 focus-within:ring-gold/50 ${
                                    selected ? 'border-gold/60 bg-gold/[0.07]' : 'border-line bg-black/30 hover:border-gold/30'
                                }`}
                            >
                                <input type="radio" name={id('prize_type')} value={value} checked={selected} onChange={() => set('prize_type', value)} className="sr-only" />
                                <Icon size={18} className={selected ? 'mt-0.5 text-gold' : 'mt-0.5 text-muted'} />
                                <span>
                                    <span className="block text-sm font-semibold text-white">{title}</span>
                                    {!compact && <span className="mt-0.5 block text-xs text-muted">{text}</span>}
                                </span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>

            <div className="grid gap-5 sm:grid-cols-2">
                <div>
                    <label className="label" htmlFor={id('prize_name')}>{isItem ? 'Prize item' : 'Prize'}</label>
                    <input
                        id={id('prize_name')}
                        className="input"
                        required
                        maxLength={160}
                        value={form.prize_name}
                        onChange={(event) => set('prize_name', event.target.value)}
                        placeholder={isItem ? 'Brand New Car' : 'Cash Prize'}
                    />
                    {fieldError('prize_name') && <p className="mt-1.5 text-xs text-red-300">{fieldError('prize_name')}</p>}
                </div>

                <div>
                    <label className="label" htmlFor={id('prize_value')}>
                        {isItem ? <>Item value <span className="text-xs font-normal text-muted-dim">(optional)</span></> : 'Cash amount'}
                    </label>
                    <div className="flex gap-2">
                        <select
                            className="input w-24 shrink-0"
                            value={form.prize_currency}
                            onChange={(event) => set('prize_currency', event.target.value)}
                            aria-label="Currency"
                        >
                            {['PHP', 'USD', 'EUR', 'GBP', 'SGD', 'AUD', 'JPY'].map((code) => (
                                <option key={code} value={code}>{code}</option>
                            ))}
                        </select>
                        <AmountInput
                            id={id('prize_value')}
                            className="input"
                            value={form.prize_value}
                            onChange={(value) => set('prize_value', value)}
                            placeholder={isItem ? '1,500,000' : '50,000'}
                        />
                    </div>
                    {fieldError('prize_value') && <p className="mt-1.5 text-xs text-red-300">{fieldError('prize_value')}</p>}
                </div>
            </div>

            <div>
                <p className="label">Company logos <span className="text-xs font-normal text-muted-dim">(optional)</span></p>
                <LogoPicker
                    value={form.logos}
                    onChange={(ids) => set('logos', ids)}
                    error={fieldError('logos') ?? Object.entries(errors).find(([key]) => key.startsWith('logos.'))?.[1]?.[0]}
                />
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
                {compact && (
                    <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>
                        Cancel
                    </button>
                )}
                <button type="submit" className="btn btn-outline" disabled={saving}>
                    {saving ? <InlineSpinner /> : <Plus size={15} />}
                    {editing ? 'Save changes' : 'Save prize'}
                </button>
                <button type="button" className="btn btn-gold" disabled={saving || showDisabled} onClick={() => onSave(true)}>
                    {saving ? <InlineSpinner /> : <MonitorPlay size={15} />}
                    Save and show on screen
                </button>
            </div>
        </form>
    );
}

function PrizeList({ slides, busyId, showDisabled, onShow, onEdit, onDelete, editingId, compact }) {
    if (slides === null) return <LoadingState />;

    if (slides.length === 0) {
        return (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted-dim">
                No prizes yet. {compact ? 'Press “Add a prize”.' : 'Add one above.'}
            </p>
        );
    }

    return (
        <ul className={`space-y-2.5 ${compact ? 'max-h-[28rem] overflow-y-auto pr-1' : ''}`}>
            {slides.map((slide) => (
                <li
                    key={slide.id}
                    className={`flex flex-wrap items-center gap-3 rounded-xl border ${compact ? 'px-3 py-2.5' : 'p-4'} ${
                        slide.is_live ? 'border-gold/60 bg-gold/[0.07]' : editingId === slide.id ? 'border-gold/30 bg-black/30' : 'border-line bg-black/30'
                    }`}
                >
                    <div className="min-w-0 flex-1">
                        {slide.title && <p className="truncate text-[0.7rem] text-muted">{slide.title}</p>}
                        <p className={`truncate font-display font-extrabold text-white ${compact ? 'text-sm' : 'text-base'}`}>{prizeLine(slide)}</p>
                        {slide.logos?.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-2">
                                {slide.logos.map((logo) => (
                                    <span key={logo.id} className={`grid place-items-center ${compact ? 'h-6 w-12' : 'h-8 w-16'}`}>
                                        <LogoMark logo={logo} className="max-h-full max-w-full text-[0.5rem]" imgClassName={compact ? 'max-h-5' : 'max-h-7'} />
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            className={`btn ${slide.is_live ? 'btn-outline' : 'btn-gold'} px-3 py-1.5 text-xs`}
                            onClick={() => onShow(slide)}
                            disabled={busyId !== null || showDisabled}
                            title={slide.is_live ? 'This prize is live; show it on the screen' : 'Put this prize on the screen'}
                        >
                            {busyId === slide.id ? <InlineSpinner /> : slide.is_live
                                ? <span className="h-2 w-2 animate-pulse rounded-full bg-gold" />
                                : <MonitorPlay size={13} />}
                            {slide.is_live ? 'Live · show' : 'Show on screen'}
                        </button>
                        <button type="button" className="btn btn-ghost px-2 py-1.5" onClick={() => onEdit(slide)} aria-label={`Edit ${slide.prize_name}`} title="Edit">
                            <Pencil size={14} />
                        </button>
                        <button type="button" className="btn btn-ghost px-2 py-1.5 hover:text-red-300" onClick={() => onDelete(slide)} aria-label={`Delete ${slide.prize_name}`} title="Delete">
                            <Trash2 size={14} />
                        </button>
                    </div>
                </li>
            ))}
        </ul>
    );
}

/** NATCON and company logo sizes for the Prize Display, saved as they move. */
function SizeControls() {
    const [sizes, setSizes] = useState(() => loadLogoSizes(PRIZE_SHOW_SIZES_KEY));

    const change = (key, value) => {
        saveLogoSizes(PRIZE_SHOW_SIZES_KEY, { ...sizes, [key]: value });
        setSizes(loadLogoSizes(PRIZE_SHOW_SIZES_KEY));
    };

    const reset = () => {
        saveLogoSizes(PRIZE_SHOW_SIZES_KEY, DEFAULT_LOGO_SIZES);
        setSizes({ ...DEFAULT_LOGO_SIZES });
    };

    const isDefault = sizes.event === DEFAULT_LOGO_SIZES.event && sizes.company === DEFAULT_LOGO_SIZES.company;

    return (
        <div className="space-y-5">
            <SizeSlider label="NATCON logo" value={sizes.event} onChange={(value) => change('event', value)} />
            <SizeSlider label="Company logos" value={sizes.company} onChange={(value) => change('company', value)} />
            <div className="flex justify-end">
                <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={reset} disabled={isDefault}>
                    <RotateCcw size={13} />
                    Reset sizes
                </button>
            </div>
        </div>
    );
}
