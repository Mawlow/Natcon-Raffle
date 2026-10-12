import { memo, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Banknote, ChevronDown, Gift, ListPlus, Loader2, Plus, Trash2 } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { formatNumber, formatPrizeValue } from '../../lib/format';
import { useToast } from '../../context/ToastContext';
import PoolPicker, { poolSummary, usePoolGroups } from './PoolPicker';
import { AmountInput } from './RaffleForm';

/**
 * The prize list: several prizes in one raffle, each with its own number of
 * winners and its own rules for who can win it — 10 × ₱5,000 for everyone,
 * then 5 × iPhone for ELITE, then a car for Cebu Landmasters qualifiers.
 * The draw goes down the list in order, and the raffle's number of winners
 * is the total. Edited here and saved as a whole.
 *
 * Prizes that already have winners stay: they cannot be removed, or set
 * below the winners they have.
 */
export default memo(PrizesPanel);

let nextKey = 0;
const keyed = (prize) => ({ ...prize, key: prize.id ? `id-${prize.id}` : `new-${nextKey++}` });

const fromServer = (prizes = []) => prizes.map((prize) => keyed({
    id: prize.id,
    winners_count: String(prize.winners_count),
    winners_drawn: prize.winners_drawn ?? 0,
    prize_name: prize.prize_name,
    prize_type: prize.prize_type ?? 'cash',
    prize_value: prize.prize_value ?? '',
    prize_currency: prize.prize_currency ?? 'PHP',
    draw_filter: prize.draw_filter ?? null,
    draw_pool_label: prize.draw_pool_label,
    include_previous_winners: Boolean(prize.include_previous_winners),
}));

const blankPrize = () => keyed({
    id: null,
    winners_count: '1',
    winners_drawn: 0,
    prize_name: '',
    prize_type: 'cash',
    prize_value: '',
    prize_currency: 'PHP',
    draw_filter: null,
    include_previous_winners: false,
});


function PrizesPanel({ raffle, raffleId, midDraw, onSaved }) {
    const toast = useToast();
    const serverPrizes = raffle.prizes ?? [];
    const [rows, setRows] = useState(() => fromServer(serverPrizes));
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [openPool, setOpenPool] = useState(null);
    const [groups] = usePoolGroups(raffleId, raffle.winners?.length ?? 0);

    // Follow the server (winners drawn, a change from another window) until
    // the operator starts editing.
    const serverKey = JSON.stringify(serverPrizes);
    const lastServerKey = useRef(serverKey);
    useEffect(() => {
        if (serverKey === lastServerKey.current) return;
        lastServerKey.current = serverKey;
        if (!dirty) setRows(fromServer(serverPrizes));
    }, [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const edit = (updater) => {
        setRows(updater);
        setDirty(true);
        setError(null);
    };
    const setField = (key, field, value) => edit((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
    const move = (index, by) => edit((current) => {
        const next = [...current];
        [next[index], next[index + by]] = [next[index + by], next[index]];
        return next;
    });
    const remove = (key) => edit((current) => current.filter((row) => row.key !== key));
    const add = () => edit((current) => [...current, blankPrize()]);

    // Starting a list from the raffle's single prize keeps what is already set.
    const start = () => edit(() => [keyed({
        ...blankPrize(),
        winners_count: String(raffle.winners_count || 1),
        prize_name: raffle.prize_name ?? '',
        prize_type: raffle.prize_type ?? 'cash',
        prize_value: raffle.prize_value ?? '',
        prize_currency: raffle.prize_currency ?? 'PHP',
        draw_filter: raffle.draw_filter ?? null,
    }), blankPrize()]);

    const discard = () => {
        setRows(fromServer(serverPrizes));
        setDirty(false);
        setError(null);
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            await api.put(`/raffles/${raffleId}/prizes`, {
                prizes: rows.map((row) => ({
                    id: row.id,
                    winners_count: Number(row.winners_count),
                    // A cash prize has no name to type: it is shown with its amount.
                    prize_name: row.prize_type === 'cash' ? 'Cash Prize' : row.prize_name,
                    prize_type: row.prize_type,
                    prize_value: row.prize_value === '' ? null : Number(row.prize_value),
                    prize_currency: row.prize_currency || 'PHP',
                    draw_filter: row.draw_filter,
                    include_previous_winners: row.include_previous_winners,
                })),
            });
            setDirty(false);
            setOpenPool(null);
            await onSaved();
            toast.success(rows.length ? 'Prizes saved.' : 'Prize list removed.');
        } catch (failure) {
            const parsed = parseError(failure, 'The prizes could not be saved.');
            const first = Object.values(parsed.errors ?? {})[0]?.[0];
            setError(first ?? parsed.message);
        } finally {
            setSaving(false);
        }
    };

    const total = rows.reduce((sum, row) => sum + (Number(row.winners_count) || 0), 0);
    const locked = midDraw || saving;
    const current = raffle.current_prize_id;

    return (
        <section className="panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="font-display text-base font-bold text-white">Prizes</h2>
                    <p className="mt-0.5 text-xs text-muted">
                        {rows.length
                            ? `Drawn top to bottom. ${formatNumber(total)} winner${total === 1 ? '' : 's'} in all.`
                            : 'Give different prizes to different winners — each with its own number of winners and who can win it.'}
                        {midDraw && ' Locked while a draw is running.'}
                    </p>
                </div>
                {saving && <Loader2 size={16} className="shrink-0 animate-spin text-gold" />}
            </div>

            {rows.length === 0 ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line p-4">
                    <p className="text-sm text-muted">
                        One prize for all {formatNumber(raffle.winners_count)} winner{raffle.winners_count === 1 ? '' : 's'}:{' '}
                        <span className="font-semibold text-white">{raffle.prize_name}</span>
                    </p>
                    <button type="button" className="btn btn-outline" onClick={start} disabled={locked}>
                        <ListPlus size={15} />
                        Set up prize list
                    </button>
                </div>
            ) : (
                <ol className="mt-4 space-y-3">
                    {rows.map((row, index) => {
                        const drawn = row.winners_drawn;
                        const full = row.id && drawn >= Number(row.winners_count);
                        const isCurrent = row.id && row.id === current && !dirty;
                        const value = formatPrizeValue(row.prize_value === '' ? null : row.prize_value, row.prize_currency);
                        return (
                            <li
                                key={row.key}
                                className={`rounded-xl border p-4 ${isCurrent ? 'border-gold/50 bg-gold/[0.06]' : 'border-line bg-black/30'}`}
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-display text-sm font-extrabold text-gold/80">#{index + 1}</span>
                                    {isCurrent && <span className="chip border-gold/40 bg-gold/15 text-gold-bright">Drawing now</span>}
                                    {full && <span className="chip border-white/10 bg-white/5 text-muted">Done</span>}
                                    {row.id && <span className="text-xs text-muted-dim">{drawn} / {row.winners_count || 0} drawn</span>}
                                    <span className="ml-auto flex gap-1">
                                        <IconButton label="Move up" onClick={() => move(index, -1)} disabled={locked || index === 0}><ArrowUp size={14} /></IconButton>
                                        <IconButton label="Move down" onClick={() => move(index, 1)} disabled={locked || index === rows.length - 1}><ArrowDown size={14} /></IconButton>
                                        <IconButton
                                            label={drawn > 0 ? 'This prize has winners — use Redraw to start over' : 'Remove prize'}
                                            onClick={() => remove(row.key)}
                                            disabled={locked || drawn > 0}
                                            danger
                                        >
                                            <Trash2 size={14} />
                                        </IconButton>
                                    </span>
                                </div>

                                <div className={`mt-3 grid gap-3 ${row.prize_type === 'cash' ? 'sm:grid-cols-[6rem]' : 'sm:grid-cols-[6rem_1fr]'}`}>
                                    <div>
                                        <label className="label" htmlFor={`winners-${row.key}`}>Winners</label>
                                        <input
                                            id={`winners-${row.key}`}
                                            type="number"
                                            min={Math.max(1, drawn)}
                                            max="500"
                                            className="input"
                                            value={row.winners_count}
                                            disabled={locked}
                                            onChange={(event) => setField(row.key, 'winners_count', event.target.value)}
                                        />
                                    </div>
                                    {row.prize_type !== 'cash' && <div>
                                        <label className="label" htmlFor={`prize-${row.key}`}>Prize</label>
                                        <input
                                            id={`prize-${row.key}`}
                                            className="input"
                                            maxLength={160}
                                            placeholder={row.prize_type === 'item' ? 'Brand New Car' : 'Cash Prize'}
                                            value={row.prize_name}
                                            disabled={locked}
                                            onChange={(event) => setField(row.key, 'prize_name', event.target.value)}
                                        />
                                    </div>}
                                </div>

                                <div className="mt-3 flex flex-wrap items-end gap-3">
                                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-black/40 p-1" role="radiogroup" aria-label="Prize type">
                                        {[['cash', 'Cash', Banknote], ['item', 'Item', Gift]].map(([type, label, Icon]) => (
                                            <button
                                                key={type}
                                                type="button"
                                                role="radio"
                                                aria-checked={row.prize_type === type}
                                                disabled={locked}
                                                onClick={() => setField(row.key, 'prize_type', type)}
                                                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                                                    row.prize_type === type ? 'bg-gold text-black' : 'text-muted hover:text-white'
                                                }`}
                                            >
                                                <Icon size={14} />
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="w-40">
                                        <label className="label" htmlFor={`value-${row.key}`}>
                                            {row.prize_type === 'item' ? 'Worth (optional)' : 'Amount'}
                                        </label>
                                        <AmountInput
                                            id={`value-${row.key}`}
                                            className="input"
                                            placeholder="5,000"
                                            value={row.prize_value === null ? '' : String(row.prize_value)}
                                            disabled={locked}
                                            onChange={(amount) => setField(row.key, 'prize_value', amount)}
                                        />
                                    </div>
                                    {value && <span className="pb-2.5 text-sm font-semibold text-gold-bright">{row.prize_type === 'cash' ? `${value} CASH PRIZE` : `worth ${value}`}</span>}
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                                    <button
                                        type="button"
                                        className="flex min-w-0 items-center gap-1.5 text-sm text-muted transition hover:text-white"
                                        onClick={() => setOpenPool(openPool === row.key ? null : row.key)}
                                        aria-expanded={openPool === row.key}
                                    >
                                        <span>Who can win:</span>
                                        <span className="truncate font-semibold text-gold-bright">{poolSummary(row.draw_filter)}</span>
                                        <ChevronDown size={14} className={`shrink-0 transition ${openPool === row.key ? 'rotate-180' : ''}`} />
                                    </button>
                                    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                                        <input
                                            type="checkbox"
                                            className="size-4 accent-[#d4af37]"
                                            checked={row.include_previous_winners}
                                            disabled={locked}
                                            onChange={(event) => setField(row.key, 'include_previous_winners', event.target.checked)}
                                        />
                                        {row.include_previous_winners ? 'Earlier winners included' : 'Earlier winners excluded'}
                                    </label>
                                </div>

                                {openPool === row.key && (
                                    <div className="mt-3 rounded-lg border border-line bg-black/30 p-3">
                                        <PoolPicker
                                            value={row.draw_filter}
                                            onChange={(filter) => setField(row.key, 'draw_filter', filter)}
                                            groups={groups}
                                            disabled={locked}
                                        />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ol>
            )}

            {error && <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}

            {(rows.length > 0 || dirty) && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button type="button" className="btn btn-outline" onClick={add} disabled={locked}>
                        <Plus size={15} />
                        Add prize
                    </button>
                    {dirty && (
                        <span className="ml-auto flex gap-2">
                            <button type="button" className="btn btn-ghost" onClick={discard} disabled={saving}>Discard</button>
                            <button type="button" className="btn btn-gold" onClick={save} disabled={locked}>
                                {saving && <Loader2 size={15} className="animate-spin" />}
                                {rows.length ? 'Save prizes' : 'Remove prize list'}
                            </button>
                        </span>
                    )}
                </div>
            )}
        </section>
    );
}

function IconButton({ label, onClick, disabled, danger, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={label}
            aria-label={label}
            className={`rounded-lg border border-line p-1.5 text-muted transition disabled:opacity-35 ${
                danger ? 'hover:border-red-400/40 hover:text-red-300' : 'hover:border-gold/35 hover:text-gold'
            }`}
        >
            {children}
        </button>
    );
}
