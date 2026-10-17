import { useState } from 'react';
import { ArrowDown, ArrowUp, Banknote, ChevronDown, Gift, Plus, Trash2 } from 'lucide-react';
import { formatNumber, formatPrizeValue } from '../../lib/format';
import PoolPicker, { poolSummary } from './PoolPicker';
import { AmountInput } from './RaffleForm';

/*
 * The prize list for a raffle being made: each prize with its number of
 * winners and who can win it, drawn top to bottom. Like the Control Center's
 * Prizes panel, but for a raffle not saved yet — the rows go up with it.
 * `groups` are the tags, developers and locations to choose from.
 */
let nextKey = 0;

export const blankPrize = () => ({
    key: `prize-${nextKey++}`,
    winners_count: '1',
    prize_name: '',
    prize_type: 'cash',
    prize_value: '',
    prize_currency: 'PHP',
    draw_filter: null,
    // false: who can win follows the raffle's Participants choice.
    own_pool: false,
    include_previous_winners: false,
});

/** The rows as the API takes them; a prize with no choice of its own takes `defaultFilter`. */
export const prizesPayload = (rows, defaultFilter = null) => rows.map((row) => ({
    winners_count: Number(row.winners_count),
    // A cash prize has no name to type: it is shown with its amount.
    prize_name: row.prize_type === 'cash' ? 'Cash Prize' : row.prize_name.trim(),
    prize_type: row.prize_type,
    prize_value: row.prize_value === '' ? null : Number(row.prize_value),
    prize_currency: row.prize_currency || 'PHP',
    draw_filter: row.own_pool ? row.draw_filter : defaultFilter,
    include_previous_winners: row.include_previous_winners,
}));

export default function PrizeListEditor({ rows, onChange, groups, errors = {}, defaultFilter = null }) {
    const [openPool, setOpenPool] = useState(null);

    const setField = (key, field, value) => onChange(rows.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
    const move = (index, by) => {
        const next = [...rows];
        [next[index], next[index + by]] = [next[index + by], next[index]];
        onChange(next);
    };
    const total = rows.reduce((sum, row) => sum + (Number(row.winners_count) || 0), 0);
    const rowError = (index, field) => errors[`prizes.${index}.${field}`]?.[0];

    return (
        <div>
            <p className="mb-4 text-xs text-muted">
                {rows.length
                    ? `Drawn top to bottom. ${formatNumber(total)} winner${total === 1 ? '' : 's'} in all.`
                    : 'Add at least one prize.'}
            </p>

            <ol className="space-y-3">
                {rows.map((row, index) => {
                    const value = formatPrizeValue(row.prize_value === '' ? null : row.prize_value, row.prize_currency);
                    return (
                        <li key={row.key} className="rounded-xl border border-line bg-black/30 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-display text-sm font-extrabold text-gold/80">#{index + 1}</span>
                                <span className="ml-auto flex gap-1">
                                    <IconButton label="Move up" onClick={() => move(index, -1)} disabled={index === 0}><ArrowUp size={14} /></IconButton>
                                    <IconButton label="Move down" onClick={() => move(index, 1)} disabled={index === rows.length - 1}><ArrowDown size={14} /></IconButton>
                                    <IconButton label="Remove prize" onClick={() => onChange(rows.filter((item) => item.key !== row.key))} disabled={rows.length === 1} danger>
                                        <Trash2 size={14} />
                                    </IconButton>
                                </span>
                            </div>

                            <div className="mt-3 flex flex-wrap items-end gap-3">
                                <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-black/40 p-1" role="radiogroup" aria-label="Prize type">
                                    {[['cash', 'Cash', Banknote], ['item', 'Item', Gift]].map(([type, label, Icon]) => (
                                        <button
                                            key={type}
                                            type="button"
                                            role="radio"
                                            aria-checked={row.prize_type === type}
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
                                <div className="w-24">
                                    <label className="label" htmlFor={`winners-${row.key}`}>Winners</label>
                                    <input
                                        id={`winners-${row.key}`}
                                        type="number"
                                        min="1"
                                        max="500"
                                        required
                                        className="input"
                                        value={row.winners_count}
                                        onChange={(event) => setField(row.key, 'winners_count', event.target.value)}
                                    />
                                </div>
                                {row.prize_type === 'item' && (
                                    <div className="min-w-[12rem] flex-1">
                                        <label className="label" htmlFor={`prize-${row.key}`}>Prize</label>
                                        <input
                                            id={`prize-${row.key}`}
                                            className="input"
                                            maxLength={160}
                                            required
                                            placeholder="Brand New Car"
                                            value={row.prize_name}
                                            onChange={(event) => setField(row.key, 'prize_name', event.target.value)}
                                        />
                                    </div>
                                )}
                                <div className="w-40">
                                    <label className="label" htmlFor={`value-${row.key}`}>
                                        {row.prize_type === 'item' ? 'Worth (optional)' : 'Amount'}
                                    </label>
                                    <AmountInput
                                        id={`value-${row.key}`}
                                        className="input"
                                        placeholder="5,000"
                                        required={row.prize_type === 'cash'}
                                        value={row.prize_value === null ? '' : String(row.prize_value)}
                                        onChange={(amount) => setField(row.key, 'prize_value', amount)}
                                    />
                                </div>
                                {value && <span className="pb-2.5 text-sm font-semibold text-gold-bright">{row.prize_type === 'cash' ? `${value} CASH PRIZE` : `worth ${value}`}</span>}
                            </div>

                            {['prize_name', 'winners_count', 'prize_value'].map((field) => rowError(index, field) && (
                                <p key={field} className="mt-1.5 text-xs text-red-300">{rowError(index, field)}</p>
                            ))}

                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                                <button
                                    type="button"
                                    className="flex min-w-0 items-center gap-1.5 text-sm text-muted transition hover:text-white"
                                    onClick={() => setOpenPool(openPool === row.key ? null : row.key)}
                                    aria-expanded={openPool === row.key}
                                >
                                    <span>Who can win:</span>
                                    <span className="truncate font-semibold text-gold-bright">
                                        {row.own_pool ? poolSummary(row.draw_filter) : `Same as participants (${poolSummary(defaultFilter)})`}
                                    </span>
                                    <ChevronDown size={14} className={`shrink-0 transition ${openPool === row.key ? 'rotate-180' : ''}`} />
                                </button>
                                {index > 0 && (
                                    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                                        <input
                                            type="checkbox"
                                            className="size-4 accent-[#d4af37]"
                                            checked={row.include_previous_winners}
                                            onChange={(event) => setField(row.key, 'include_previous_winners', event.target.checked)}
                                        />
                                        {row.include_previous_winners ? 'Earlier winners included' : 'Earlier winners excluded'}
                                    </label>
                                )}
                            </div>

                            {openPool === row.key && (
                                <div className="mt-3 rounded-lg border border-line bg-black/30 p-3">
                                    <PoolPicker
                                        value={row.own_pool ? row.draw_filter : defaultFilter}
                                        onChange={(filter) => onChange(rows.map((item) => (item.key === row.key ? { ...item, draw_filter: filter, own_pool: true } : item)))}
                                        groups={groups}
                                    />
                                    {row.own_pool && (
                                        <button
                                            type="button"
                                            className="mt-2 text-xs text-muted underline-offset-2 hover:text-white hover:underline"
                                            onClick={() => onChange(rows.map((item) => (item.key === row.key ? { ...item, draw_filter: null, own_pool: false } : item)))}
                                        >
                                            Use the participants choice again
                                        </button>
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ol>

            <button type="button" className="btn btn-outline mt-4" onClick={() => onChange([...rows, blankPrize()])}>
                <Plus size={15} />
                Add prize
            </button>
        </div>
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
