import { useEffect, useState } from 'react';
import { Banknote, CheckCircle2, ChevronDown, Gift, Loader2, MonitorUp, Pencil, Users } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { formatNumber, formatPrizeValue } from '../../lib/format';
import PoolPicker, { usePoolGroups } from './PoolPicker';
import LogoPicker from './LogoPicker';
import CornerLogoPicker from './CornerLogoPicker';
import { SizeSlider } from './LogoSizePanel';
import { AmountInput } from './RaffleForm';
import { DEFAULT_LOGO_SIZES, loadLogoSizes, saveLogoSizes } from '../../lib/logoSizes';

/*
 * The three things a raffle needs before it is drawn — how many winners, the
 * prize, and which participants can win — set right in the Control Center.
 *
 *   mode "current": this raffle, before its first winner. Saving marks it
 *                   ready, and it folds down to a one-line summary.
 *   mode "next":    once this raffle is drawn, the next one. It copies this
 *                   raffle's participants and look, and goes straight onto
 *                   the LED wall.
 */

export const prizeLabel = (type, name, value) => {
    const amount = formatPrizeValue(value === '' ? null : value, 'PHP');
    // Cash is just its amount: "₱1,000 CASH PRIZE".
    if (type === 'cash') return amount ? `${amount} CASH PRIZE` : name || null;
    if (!name) return null;
    return amount ? `${name} (worth ${amount})` : name;
};

// A cash prize has no name to type: it is called this, and shown with its amount.
const CASH_PRIZE_NAME = 'Cash Prize';

export default function RaffleSetupSection({ raffle, mode = 'current', onDone }) {
    const next = mode === 'next';
    const isSet = !next && Boolean(raffle.prize_name);
    const [open, setOpen] = useState(!isSet);
    // Every raffle at the event is the NATCON Raffle; it can still be renamed.
    const [name, setName] = useState('NATCON RAFFLE');
    const [winners, setWinners] = useState(() => String(next ? 1 : raffle.winners_count || 1));
    const [prizeType, setPrizeType] = useState(() => (next ? 'cash' : raffle.prize_type ?? 'cash'));
    const [prizeName, setPrizeName] = useState(() => (next ? '' : raffle.prize_name ?? ''));
    const [prizeValue, setPrizeValue] = useState(() => (next || raffle.prize_value == null ? '' : String(raffle.prize_value)));
    const [pool, setPool] = useState(() => (next ? null : raffle.draw_filter ?? null));
    const [leaveOut, setLeaveOut] = useState(true);
    // The raffle's logos: the company logos on the prize screen, and the
    // Congratulations screen's top-left and top-right logos. The next raffle
    // starts with this one's.
    const [logos, setLogos] = useState(() => (raffle.logos ?? []).map((logo) => logo.id));
    const [corners, setCorners] = useState(() => ({ left: raffle.logo_left?.id ?? null, right: raffle.logo_right?.id ?? null }));
    const [logosOpen, setLogosOpen] = useState(false);
    // How big the NATCON and company logos are drawn on the screens. They
    // live in this browser (lib/logoSizes); the next raffle starts with this
    // one's and gets them the moment it is created.
    const [sizes, setSizes] = useState(() => loadLogoSizes(raffle.id));
    const setSize = (key, value) => setSizes((current) => ({ ...current, [key]: value }));
    const [count, setCount] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [groups] = usePoolGroups(raffle.id, `${raffle.winners?.length ?? 0}-${raffle.eligible_count}`);

    // How many people the chosen participants come to, as you choose.
    useEffect(() => {
        let live = true;
        const timer = setTimeout(() => {
            api.get(`/raffles/${raffle.id}/participants/pool-count`, {
                params: { type: pool?.type, values: pool?.values, tags: pool?.tags, developers: pool?.developers, leave_out: !next || leaveOut ? 1 : 0 },
            })
                .then(({ data }) => { if (live) setCount(data.data.count); })
                .catch(() => { if (live) setCount(null); });
        }, 200);
        return () => { live = false; clearTimeout(timer); };
    }, [raffle.id, pool, leaveOut, next, raffle.eligible_count]);

    const winnersNumber = Number(winners) || 0;
    const tooFew = count !== null && count > 0 && winnersNumber > count;
    const label = prizeLabel(prizeType, prizeName.trim(), prizeValue);
    const cash = prizeType === 'cash';
    const prizeSet = cash ? Number(prizeValue) > 0 : Boolean(prizeName.trim());
    const ready = winnersNumber >= 1 && prizeSet && (!next || (name.trim() && !tooFew && count !== 0));

    const prize = {
        winners_count: winnersNumber,
        prize_name: cash ? CASH_PRIZE_NAME : prizeName.trim(),
        prize_type: prizeType,
        prize_value: prizeValue === '' ? null : Number(prizeValue),
        prize_currency: 'PHP',
    };
    const logoFields = { logos, logo_left: corners.left, logo_right: corners.right };

    const submit = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        try {
            if (next) {
                const { data } = await api.post(`/raffles/${raffle.id}/next-round`, {
                    name,
                    leave_out_winners: leaveOut,
                    prizes: [{ ...prize, draw_filter: pool }],
                    ...logoFields,
                });
                saveLogoSizes(data.data.id, sizes);
                onDone(data.data);
                return;
            }

            await api.put(`/raffles/${raffle.id}`, { ...prize, draw_filter: pool ?? { type: 'all' }, ...logoFields });
            saveLogoSizes(raffle.id, sizes);
            // With participants in, the raffle is ready to draw straight away.
            if (raffle.status === 'DRAFT' && count > 0) {
                await api.post(`/raffles/${raffle.id}/transition`, { action: 'ready' }).catch(() => {});
            }
            await onDone();
            setOpen(false);
        } catch (failure) {
            const parsed = parseError(failure, next ? 'The next raffle could not be started.' : 'The raffle could not be saved.');
            setError(Object.values(parsed.errors ?? {})[0]?.[0] ?? parsed.message);
        } finally {
            setSaving(false);
        }
    };

    // This raffle, already set up: one line, with a way back in.
    if (!next && !open) {
        return (
            <section className="panel flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="flex min-w-0 items-center gap-3">
                    <CheckCircle2 size={20} className="shrink-0 text-gold" />
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                            {formatNumber(raffle.winners_count)} winner{raffle.winners_count === 1 ? '' : 's'}
                            {' · '}{prizeLabel(raffle.prize_type, raffle.prize_name, raffle.prize_value ?? '')}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted">
                            From {raffle.draw_pool_label ?? 'all participants'} · {formatNumber(raffle.eligible_count)} can win
                        </p>
                    </div>
                </div>
                <button type="button" className="btn btn-ghost px-3" onClick={() => setOpen(true)}>
                    <Pencil size={14} />
                    Change
                </button>
            </section>
        );
    }

    return (
        <form onSubmit={submit} className="panel panel-gold p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold/80">{next ? 'Up next' : 'Before the draw'}</p>
            <h2 className="mt-1 font-display text-xl font-bold text-white">{next ? 'Set up the next raffle' : 'Set up this raffle'}</h2>
            <p className="mt-0.5 text-sm text-muted">
                {next
                    ? 'Choose the winners, the prize and who can win. It goes straight onto the LED wall.'
                    : 'Choose the winners, the prize and who can win. The main screen shows the NATCON welcome until you start.'}
            </p>

            {next && (
                <div className="mt-5">
                    <label className="label" htmlFor="next_name">Raffle name</label>
                    <input id="next_name" className="input" maxLength={160} placeholder="e.g. Grand Raffle" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
            )}

            <div className="mt-5 grid gap-4 md:grid-cols-[11rem_1fr]">
                <Step number={1} title="Winners">
                    <input
                        type="number"
                        min="1"
                        max="500"
                        className="input text-center font-display text-3xl font-extrabold text-gold-bright"
                        value={winners}
                        onChange={(event) => setWinners(event.target.value)}
                        aria-label="Number of winners"
                    />
                </Step>

                <Step number={2} title="Prize">
                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-black/40 p-1 sm:w-64" role="radiogroup" aria-label="Prize type">
                        {[['cash', 'Cash', Banknote], ['item', 'Item', Gift]].map(([type, text, Icon]) => (
                            <button
                                key={type}
                                type="button"
                                role="radio"
                                aria-checked={prizeType === type}
                                onClick={() => setPrizeType(type)}
                                className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                                    prizeType === type ? 'bg-gold text-black' : 'text-muted hover:text-white'
                                }`}
                            >
                                <Icon size={14} />
                                {text}
                            </button>
                        ))}
                    </div>
                    {cash ? (
                        // Cash: just the amount, with commas as it is typed.
                        <div className="mt-3">
                            <div className="relative sm:w-64">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-gold">₱</span>
                                <AmountInput
                                    className="input pl-8 font-display text-lg font-bold text-gold-bright"
                                    placeholder="1,000"
                                    value={prizeValue}
                                    onChange={setPrizeValue}
                                    aria-label="Cash amount"
                                />
                            </div>
                            {label && <p className="mt-1.5 text-xs text-muted">On the screen: <span className="font-semibold text-gold-bright">{label}</span></p>}
                        </div>
                    ) : (
                        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_10rem]">
                            <input
                                className="input"
                                maxLength={160}
                                placeholder="e.g. Brand New Car"
                                value={prizeName}
                                onChange={(event) => setPrizeName(event.target.value)}
                                aria-label="Prize name"
                            />
                            <AmountInput
                                className="input"
                                placeholder="Worth (optional)"
                                value={prizeValue}
                                onChange={setPrizeValue}
                                aria-label="Worth"
                            />
                        </div>
                    )}
                </Step>
            </div>

            <div className="mt-4">
                <Step number={3} title="Participants">
                    <PoolPicker value={pool} onChange={setPool} groups={groups} />
                    {next && (
                        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-white">
                            <input type="checkbox" className="size-4 accent-[#d4af37]" checked={leaveOut} onChange={(event) => setLeaveOut(event.target.checked)} />
                            Leave out people who already won
                        </label>
                    )}
                </Step>
            </div>

            <div className="mt-4">
                <Step number={4} title="Logos" optional>
                    <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 text-left text-sm text-muted transition hover:text-white"
                        onClick={() => setLogosOpen((current) => !current)}
                        aria-expanded={logosOpen}
                    >
                        <span className="min-w-0 truncate">
                            {logos.length ? `${logos.length} company logo${logos.length === 1 ? '' : 's'}` : 'No company logos'}
                            {' · Congratulations: '}
                            {[corners.left, corners.right].filter(Boolean).length
                                ? `${[corners.left, corners.right].filter(Boolean).length} of 2 corners`
                                : 'no corner logos'}
                            {(sizes.cornerLeft !== DEFAULT_LOGO_SIZES.cornerLeft || sizes.cornerRight !== DEFAULT_LOGO_SIZES.cornerRight || sizes.congrats !== DEFAULT_LOGO_SIZES.congrats) && [corners.left, corners.right].some(Boolean)
                                && ` (left ${sizes.cornerLeft}% / NATCON ${sizes.congrats}% / right ${sizes.cornerRight}%)`}
                            {(sizes.event !== DEFAULT_LOGO_SIZES.event || sizes.company !== DEFAULT_LOGO_SIZES.company)
                                && ` · NATCON ${sizes.event}% / company ${sizes.company}%`}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 font-semibold text-gold-bright">
                            {logosOpen ? 'Done' : 'Change logos'}
                            <ChevronDown size={14} className={`transition ${logosOpen ? 'rotate-180' : ''}`} />
                        </span>
                    </button>

                    {logosOpen && (
                        <div className="mt-4 space-y-5">
                            <div>
                                <p className="label">Company logos <span className="normal-case tracking-normal text-muted-dim">— on the prize screen</span></p>
                                <LogoPicker value={logos} onChange={setLogos} />
                            </div>
                            <div>
                                <p className="label">Congratulations screen logos <span className="normal-case tracking-normal text-muted-dim">— either side of NATCON</span></p>
                                <CornerLogoPicker
                                    value={corners}
                                    onChange={(side, id) => setCorners((current) => ({ ...current, [side]: id }))}
                                    sizes={sizes}
                                    onSizeChange={setSize}
                                    companyIds={logos}
                                />
                            </div>
                            <div>
                                <p className="label">Logo size <span className="normal-case tracking-normal text-muted-dim">— main, winner and prize screens</span></p>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <SizeSlider label="NATCON logo" value={sizes.event} onChange={(value) => setSize('event', value)} />
                                    <SizeSlider
                                        label="Company logos"
                                        value={sizes.company}
                                        onChange={(value) => setSize('company', value)}
                                        disabled={logos.length === 0}
                                        hint={logos.length === 0 ? 'Add a company logo first.' : null}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </Step>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gold/30 bg-black/40 px-5 py-4">
                <div className="min-w-0 text-sm">
                    <p className="font-semibold text-white">
                        {formatNumber(winnersNumber)} winner{winnersNumber === 1 ? '' : 's'}
                        {' · '}
                        {label ?? <span className="text-muted-dim">no prize yet</span>}
                    </p>
                    <p className={`mt-0.5 flex items-center gap-1.5 ${tooFew || count === 0 ? 'text-red-300' : 'text-muted'}`}>
                        <Users size={13} />
                        {count === null
                            ? 'Counting participants…'
                            : count === 0
                                ? (pool ? 'No one can win with these participants.' : 'No participants yet — import them with Participants above.')
                                : tooFew
                                    ? `Only ${formatNumber(count)} can win — fewer than ${formatNumber(winnersNumber)} winners.`
                                    : `${formatNumber(count)} participant${count === 1 ? '' : 's'} can win`}
                    </p>
                </div>
                <div className="flex gap-2">
                    {!next && isSet && (
                        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
                    )}
                    <button type="submit" className="btn btn-gold px-6 py-3" disabled={!ready || saving}>
                        {saving ? <Loader2 size={16} className="animate-spin" /> : next ? <MonitorUp size={16} /> : <CheckCircle2 size={16} />}
                        {next ? 'Start on LED wall' : 'Save'}
                    </button>
                </div>
            </div>

            {error && <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
        </form>
    );
}

function Step({ number, title, optional = false, children }) {
    return (
        <div className="h-full rounded-xl border border-line bg-black/30 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <span className="grid size-6 place-items-center rounded-full bg-gold text-xs font-extrabold text-black">{number}</span>
                {title}
                {optional && <span className="text-xs font-normal text-muted-dim">(optional)</span>}
            </p>
            {children}
        </div>
    );
}
