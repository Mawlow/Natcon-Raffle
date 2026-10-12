import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Banknote, Gift, Info, ListOrdered, MousePointerClick, Users } from 'lucide-react';
import { InlineSpinner } from '../ui/LoadingState';
import CornerLogoPicker from './CornerLogoPicker';
import LogoPicker from './LogoPicker';
import { SizeSlider } from './LogoSizePanel';
import { loadLogoSizes } from '../../lib/logoSizes';
import { DISPLAY_TITLE, formatNumber, toLocalInput } from '../../lib/format';
import api from '../../lib/api';
import PrizeListEditor, { blankPrize, prizesPayload } from './PrizeListEditor';
import PoolPicker from './PoolPicker';

const BLANK = {
    // Only a label for the lists: every screen shows DISPLAY_TITLE (NATCON RAFFLE).
    name: '',
    // Who can win: null is everyone (see PoolPicker).
    draw_filter: null,
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
        countdown_seconds: 5,
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
export default function RaffleForm({ raffle, raffleFile = null, errors = {}, submitting, onSubmit, onCancel }) {
    const [form, setForm] = useState(BLANK);
    // A new raffle in a raffle file is set up in full here — its prizes and
    // who can win each — and saved ready to draw: the Control Center only draws it.
    const inFile = Boolean(raffleFile) && !raffle;
    const [prizes, setPrizes] = useState(() => [blankPrize()]);
    const [groups, setGroups] = useState(null);
    // The tags and developers to choose who can win from: the file's list for
    // a raffle being made in a file, the raffle's own list once it exists.
    const groupsUrl = inFile ? `/raffle-files/${raffleFile.id}/groups` : raffle?.id ? `/raffles/${raffle.id}/participants/groups` : null;
    useEffect(() => {
        if (!groupsUrl) return;
        api.get(groupsUrl)
            .then(({ data }) => setGroups(data.data))
            .catch(() => setGroups({ tags: [], developers: [] }));
    }, [groupsUrl]);
    // A raffle with a prize list sets who can win per prize, in the Control Center.
    const hasPrizeList = Boolean(raffle?.prizes?.length);
    const showPool = inFile || (Boolean(raffle) && !hasPrizeList);
    // How big the NATCON and company logos are drawn on the screens. They
    // live in this browser, not on the server, so they go back as
    // `logo_sizes` for the page to store once the raffle is saved.
    // A new raffle starts from the sizes last set, so logos sized once keep their size.
    const [logoSizes, setLogoSizes] = useState(() => loadLogoSizes(raffle?.id ?? null));
    useEffect(() => { if (raffle) setLogoSizes(loadLogoSizes(raffle.id)); }, [raffle?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // A new raffle starts with the logos of the latest raffle, ready to keep or change.
    useEffect(() => {
        if (raffle) return undefined;
        let live = true;
        api.get('/raffles', { params: { per_page: 5 } })
            .then(({ data }) => {
                const latest = data.data?.[0];
                if (!live || !latest) return;
                setForm((current) => (current.logos.length || current.logo_left || current.logo_right ? current : {
                    ...current,
                    logos: (latest.logos ?? []).map((logo) => logo.id),
                    logo_left: latest.logo_left?.id ?? null,
                    logo_right: latest.logo_right?.id ?? null,
                }));
            })
            .catch(() => {});
        return () => { live = false; };
    }, [raffle]);

    useEffect(() => {
        if (!raffle) return;

        setForm({
            ...BLANK,
            ...raffle,
            prize_value: raffle.prize_value ?? '',
            description: raffle.description ?? '',
            participant_pool: raffle.participant_pool ?? '',
            draw_filter: raffle.draw_filter ?? null,
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

        // The prize and the number of winners are set in the Control Center.
        const { prize_name, prize_type, prize_value, prize_currency, winners_count, ...rest } = form; // eslint-disable-line no-unused-vars
        onSubmit({
            ...rest,
            logo_sizes: logoSizes,
            participant_pool: form.participant_pool || null,
            logos: form.logos,
            description: form.description || null,
            starts_at: form.starts_at || null,
            ends_at: form.ends_at || null,
            draw_filter: form.draw_filter ?? { type: 'all' },
            // Prizes left on "same as participants" take the choice above.
            ...(inFile ? { prizes: prizesPayload(prizes, form.draw_filter), ready: true } : {}),
        });
    };

    const fieldError = (key) => errors[key]?.[0];

    return (
        <form onSubmit={submit} className="space-y-5">
            <section className="panel p-6">
                <h2 className="mb-5 font-display text-base font-bold text-white">Raffle details</h2>

                <div className="grid gap-5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                        <label className="label" htmlFor="name">Name</label>
                        <input
                            id="name"
                            className="input"
                            required
                            maxLength={160}
                            value={form.name}
                            onChange={(event) => set('name', event.target.value)}
                            placeholder="e.g. Cash Draw 1, iPhone Draw, Grand Prize"
                        />
                        <p className="mt-1.5 text-xs text-muted-dim">
                            Only to tell your raffles apart{inFile ? ` in ${raffleFile.name}` : ''} and in the Control Center. The screens always show the title {DISPLAY_TITLE}.
                        </p>
                        {fieldError('name') && <p className="mt-1.5 text-xs text-red-300">{fieldError('name')}</p>}
                    </div>
                </div>
            </section>

            <section className="panel p-6">
                <h2 className="mb-1 font-display text-base font-bold text-white">Participants</h2>
                <p className="mb-4 flex items-center gap-2 text-xs text-muted">
                    {inFile ? <Users size={14} className="shrink-0 text-gold" /> : <Info size={14} className="shrink-0 text-gold" />}
                    {inFile
                        ? (raffleFile.participants_count
                            ? `Starts with the ${formatNumber(raffleFile.participants_count)} participants of ${raffleFile.name}.`
                            : `${raffleFile.name} has no participants yet. Upload them on the raffle file's page; this raffle gets them too.`)
                        : raffle
                        ? 'Entrants come from the CSV imported on this raffle\'s Participants tab.'
                        : 'Once the raffle is created you will be taken straight to its Participants tab to import the CSV.'}
                </p>

                {showPool && (
                    <>
                        <p className="label">Who can win</p>
                        <PoolPicker value={form.draw_filter} onChange={(filter) => set('draw_filter', filter)} groups={groups} />
                        {inFile && (
                            <p className="mt-2 text-xs text-muted-dim">Every prize below uses this, unless you choose differently for that prize.</p>
                        )}
                    </>
                )}
                {hasPrizeList && (
                    <p className="text-xs text-muted-dim">This raffle has a prize list: who can win is set for each prize in the Control Center.</p>
                )}
            </section>

            {inFile && (
                <section className="panel p-6">
                    <h2 className="mb-1 font-display text-base font-bold text-white">Prizes &amp; who can win</h2>
                    <p className="mb-4 text-xs text-muted">
                        What each winner gets, how many winners, and which participants of {raffleFile.name} can win it.
                    </p>
                    <PrizeListEditor rows={prizes} onChange={setPrizes} groups={groups} errors={errors} defaultFilter={form.draw_filter} />
                    {fieldError('prizes') && <p className="mt-2 text-xs text-red-300">{fieldError('prizes')}</p>}
                </section>
            )}

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
                    sizes={logoSizes}
                    onSizeChange={(key, value) => setLogoSizes((current) => ({ ...current, [key]: value }))}
                    companyIds={form.logos}
                />
            </section>

            <section className="panel p-6">
                <h2 className="mb-1 font-display text-base font-bold text-white">Logo size</h2>
                <p className="mb-5 text-xs text-muted">
                    How big the logos are on the main, winner and prize screens. 100% is the normal size. The Congratulations screen has its own sizes, above.
                </p>
                <div className="grid gap-5 sm:grid-cols-2">
                    <SizeSlider label="NATCON logo" value={logoSizes.event} onChange={(value) => setLogoSizes((current) => ({ ...current, event: value }))} />
                    <SizeSlider
                        label="Company logos"
                        value={logoSizes.company}
                        onChange={(value) => setLogoSizes((current) => ({ ...current, company: value }))}
                        disabled={form.logos.length === 0}
                        hint={form.logos.length === 0 ? 'Add a company logo above first.' : null}
                    />
                </div>
            </section>

            <section className="panel p-6">
                <h2 className="mb-1 font-display text-base font-bold text-white">How the draw runs</h2>
                {!inFile && (
                    <p className="mb-5 flex items-center gap-2 text-xs text-muted">
                        <Info size={14} className="shrink-0 text-gold" />
                        The number of winners, the prize and who can win are set in the Control Center.
                    </p>
                )}

                <fieldset>
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

            <div className="flex flex-wrap justify-end gap-3">
                <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
                    Cancel
                </button>
                <button type="submit" className="btn btn-gold px-7" disabled={submitting}>
                    {submitting && <InlineSpinner />}
                    {raffle ? 'Save changes' : inFile ? 'Save — ready to draw' : 'Create raffle'}
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
