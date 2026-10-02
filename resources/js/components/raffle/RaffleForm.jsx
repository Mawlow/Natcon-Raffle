import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Banknote, Gift, Info, ListOrdered, MousePointerClick } from 'lucide-react';
import { InlineSpinner } from '../ui/LoadingState';
import CornerLogoPicker from './CornerLogoPicker';
import LogoPicker from './LogoPicker';
import { toLocalInput } from '../../lib/format';

const BLANK = {
    name: '',
    description: '',
    prize_name: '',
    prize_type: 'cash',
    prize_value: '',
    prize_currency: 'PHP',
    logos: [],
    logo_left: null,
    logo_right: null,
    winners_count: 1,
    participant_pool: '',
    allow_repeat_winners: false,
    starts_at: '',
    ends_at: '',
    settings: {
        sound_countdown: true,
        sound_drawing: true,
        sound_winner: true,
        sound_celebration: true,
        show_confetti: true,
        countdown_seconds: 3,
        roll_duration_ms: 6000,
        draw_mode: 'one_by_one',
    },
};

export const PRIZE_TYPES = [
    {
        value: 'cash',
        icon: Banknote,
        title: 'Cash prize',
        text: 'The amount is the headline, e.g. ₱50,000.',
    },
    {
        value: 'item',
        icon: Gift,
        title: 'Item prize',
        text: 'The prize itself is the headline, e.g. a Brand New Car. Its value is optional.',
    },
];

const DRAW_MODES = [
    {
        value: 'one_by_one',
        icon: MousePointerClick,
        title: 'One at a time',
        text: 'Each press of DRAW picks one winner. You press again for the next.',
    },
    {
        value: 'all_at_once',
        icon: ListOrdered,
        title: 'All in one draw',
        text: 'One press draws every winner, revealed one after another automatically.',
    },
];

/*
 * Presentation and sound are fixed for the event, so the form no longer shows
 * them: new raffles get the defaults above, and an edited raffle keeps
 * whatever it already had.
 */
export default function RaffleForm({ raffle, errors = {}, submitting, onSubmit, onCancel }) {
    const [form, setForm] = useState(BLANK);

    useEffect(() => {
        if (!raffle) return;

        setForm({
            ...BLANK,
            ...raffle,
            prize_value: raffle.prize_value ?? '',
            description: raffle.description ?? '',
            participant_pool: raffle.participant_pool ?? '',
            prize_type: raffle.prize_type ?? 'cash',
            // The API returns each logo's details; the form only keeps the ids.
            logos: (raffle.logos ?? []).map((logo) => logo.id),
            logo_left: raffle.logo_left?.id ?? null,
            logo_right: raffle.logo_right?.id ?? null,
            starts_at: toLocalInput(raffle.starts_at),
            ends_at: toLocalInput(raffle.ends_at),
            settings: { ...BLANK.settings, ...(raffle.settings ?? {}) },
        });
    }, [raffle]);

    const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const setSetting = (key, value) => setForm((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));

    const submit = (event) => {
        event.preventDefault();

        onSubmit({
            ...form,
            prize_value: form.prize_value === '' ? null : Number(form.prize_value),
            winners_count: Number(form.winners_count),
            participant_pool: form.participant_pool || null,
            logos: form.logos,
            description: form.description || null,
            starts_at: form.starts_at || null,
            ends_at: form.ends_at || null,
        });
    };

    const fieldError = (key) => errors[key]?.[0];
    const isItem = form.prize_type === 'item';

    return (
        <form onSubmit={submit} className="space-y-5">
            <section className="panel p-6">
                <h2 className="mb-5 font-display text-base font-bold text-white">Raffle details</h2>

                <div className="grid gap-5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                        <label className="label" htmlFor="name">Raffle name</label>
                        <input
                            id="name"
                            className="input"
                            required
                            maxLength={160}
                            value={form.name}
                            onChange={(event) => set('name', event.target.value)}
                            placeholder="Grand Anniversary Raffle 2026"
                        />
                        {fieldError('name') && <p className="mt-1.5 text-xs text-red-300">{fieldError('name')}</p>}
                    </div>
                </div>
            </section>

            <section className="panel p-6">
                <h2 className="mb-1 font-display text-base font-bold text-white">
                    Company logos <span className="text-xs font-normal text-muted-dim">(optional)</span>
                </h2>
                <p className="mb-5 text-xs text-muted">
                    For a raffle run by one or more partner companies: their logos appear on the prize screen. Add as many as you need.
                </p>
                <LogoPicker
                    value={form.logos}
                    onChange={(ids) => set('logos', ids)}
                    error={fieldError('logos') ?? Object.entries(errors).find(([key]) => key.startsWith('logos.'))?.[1]?.[0]}
                />
            </section>

            <section className="panel p-6">
                <h2 className="mb-1 font-display text-base font-bold text-white">
                    Congratulations screen logos <span className="text-xs font-normal text-muted-dim">(optional)</span>
                </h2>
                <p className="mb-5 text-xs text-muted">
                    One logo in the top left and one in the top right, with the NATCON logo between them and "Congratulations!" beneath it.
                </p>
                <CornerLogoPicker
                    value={{ left: form.logo_left, right: form.logo_right }}
                    onChange={(side, id) => set(`logo_${side}`, id)}
                    errors={{ logo_left: fieldError('logo_left'), logo_right: fieldError('logo_right') }}
                />
            </section>

            <section className="panel p-6">
                <h2 className="mb-5 font-display text-base font-bold text-white">Prize &amp; winners</h2>

                <fieldset className="mb-5">
                    <legend className="label">What kind of prize?</legend>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {PRIZE_TYPES.map(({ value, icon: Icon, title, text }) => {
                            const selected = form.prize_type === value;
                            return (
                                <label
                                    key={value}
                                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-gold/50 ${
                                        selected ? 'border-gold/60 bg-gold/[0.07]' : 'border-line bg-black/30 hover:border-gold/30'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="prize_type"
                                        value={value}
                                        checked={selected}
                                        onChange={() => set('prize_type', value)}
                                        className="sr-only"
                                    />
                                    <Icon size={18} className={selected ? 'mt-0.5 text-gold' : 'mt-0.5 text-muted'} />
                                    <span>
                                        <span className="block text-sm font-semibold text-white">{title}</span>
                                        <span className="mt-0.5 block text-xs text-muted">{text}</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                    {fieldError('prize_type') && <p className="mt-1.5 text-xs text-red-300">{fieldError('prize_type')}</p>}
                </fieldset>

                <div className="grid gap-5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                        <label className="label" htmlFor="prize_name">{isItem ? 'Prize item' : 'Prize'}</label>
                        <input
                            id="prize_name"
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
                        <label className="label" htmlFor="prize_value">
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
                                id="prize_value"
                                className="input"
                                value={form.prize_value}
                                onChange={(value) => set('prize_value', value)}
                                placeholder={isItem ? '1,500,000' : '50,000'}
                            />
                        </div>
                        {fieldError('prize_value') && <p className="mt-1.5 text-xs text-red-300">{fieldError('prize_value')}</p>}
                    </div>

                    <div>
                        <label className="label" htmlFor="winners_count">Number of winners</label>
                        <input
                            id="winners_count"
                            type="number"
                            min="1"
                            max="500"
                            required
                            className="input"
                            value={form.winners_count}
                            onChange={(event) => set('winners_count', event.target.value)}
                        />
                        {fieldError('winners_count') && <p className="mt-1.5 text-xs text-red-300">{fieldError('winners_count')}</p>}
                    </div>
                </div>

                {/* Only meaningful when there is more than one winner to draw. */}
                {Number(form.winners_count) > 1 && (
                    <fieldset className="mt-5">
                        <legend className="label">How should the winners be drawn?</legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {DRAW_MODES.map(({ value, icon: Icon, title, text }) => {
                                const selected = form.settings.draw_mode === value;
                                return (
                                    <label
                                        key={value}
                                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-gold/50 ${
                                            selected ? 'border-gold/60 bg-gold/[0.07]' : 'border-line bg-black/30 hover:border-gold/30'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="draw_mode"
                                            value={value}
                                            className="sr-only"
                                            checked={selected}
                                            onChange={() => setSetting('draw_mode', value)}
                                        />
                                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${selected ? 'border-gold/50 bg-gold/15 text-gold-bright' : 'border-line text-muted'}`}>
                                            <Icon size={17} />
                                        </span>
                                        <span>
                                            <span className="block text-sm font-semibold text-white">{title}</span>
                                            <span className="mt-0.5 block text-xs leading-relaxed text-muted">{text}</span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                        {fieldError('settings.draw_mode') && <p className="mt-1.5 text-xs text-red-300">{fieldError('settings.draw_mode')}</p>}
                    </fieldset>
                )}

                <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-black/30 p-4">
                    <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-line bg-black/50 accent-[#d4af37]"
                        checked={form.allow_repeat_winners}
                        onChange={(event) => set('allow_repeat_winners', event.target.checked)}
                    />
                    <span>
                        <span className="block text-sm font-semibold text-white">Allow repeat winners</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                            Off by default. When off, a ticket that has already won this raffle is removed from the pool for every later draw.
                        </span>
                    </span>
                </label>
            </section>

            <section className="panel p-6">
                <h2 className="mb-5 font-display text-base font-bold text-white">Participants</h2>

                <p className="flex items-center gap-2 rounded-lg border border-gold/15 bg-gold/[0.04] px-3.5 py-2.5 text-xs text-muted">
                    <Info size={14} className="shrink-0 text-gold" />
                    {raffle
                        ? 'Entrants come from the CSV imported on this raffle\'s Participants tab.'
                        : 'Once the raffle is created you will be taken straight to its Participants tab to import the CSV.'}
                </p>
            </section>

            <div className="flex flex-wrap justify-end gap-3">
                <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-gold px-7" disabled={submitting}>
                    {submitting && <InlineSpinner />}
                    {raffle ? 'Save changes' : 'Create raffle'}
                </button>
            </div>
        </form>
    );
}

/** Adds thousands separators to a plain amount: "1234567.5" → "1,234,567.5". */
function withCommas(raw) {
    if (raw === '' || raw === null || raw === undefined) return '';
    const [whole, decimals] = String(raw).split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decimals === undefined ? grouped : `${grouped}.${decimals}`;
}

/** Keeps digits and a single decimal point, with at most two decimals. */
function toPlainAmount(text) {
    let cleaned = text.replace(/[^\d.]/g, '');
    const dot = cleaned.indexOf('.');
    if (dot !== -1) {
        cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    }
    // Drop leading zeros ("007" → "7") but keep "0" and "0.5".
    return cleaned.replace(/^0+(?=\d)/, '');
}

/**
 * A money field that shows commas while typing. It reports the plain
 * number string ("50000.5") to the form, so what is saved is unchanged.
 */
export function AmountInput({ value, onChange, ...props }) {
    const inputRef = useRef(null);
    // Where the caret should land after a re-format, counted in characters
    // that are not commas, so inserting a comma doesn't push it around.
    const caretRef = useRef(null);

    useLayoutEffect(() => {
        const input = inputRef.current;
        if (!input || caretRef.current === null || document.activeElement !== input) return;

        let seen = 0;
        let position = 0;
        while (position < input.value.length && seen < caretRef.current) {
            if (input.value[position] !== ',') seen++;
            position++;
        }
        input.setSelectionRange(position, position);
        caretRef.current = null;
    });

    const handleChange = (event) => {
        const { value: text, selectionStart } = event.target;
        caretRef.current = toPlainAmount(text.slice(0, selectionStart ?? text.length)).length;
        onChange(toPlainAmount(text));
    };

    return (
        <input
            {...props}
            ref={inputRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={withCommas(value)}
            onChange={handleChange}
        />
    );
}
