import { useMemo, useState } from 'react';
import { ImageOff, Search, X } from 'lucide-react';
import LOGOS from '../../../data/raffle-logos.json';
import { EVENT_LOGO } from '../landing/EventScene';
import LogoMark from '../ui/LogoMark';

const GROUPS = [...new Set(LOGOS.map((logo) => logo.group))];

const SIDES = [
    { key: 'left', label: 'Top left' },
    { key: 'right', label: 'Top right' },
];

/**
 * Picks the two logos for the "Congratulations" screen's top corners, one
 * either side of the NATCON logo. `value` is { left, right } as catalogue
 * ids (or null); `onChange(side, id)` sets one corner. Both corners empty
 * keeps the screen's usual layout.
 */
export default function CornerLogoPicker({ value = {}, onChange, disabled = false, errors = {} }) {
    const [picking, setPicking] = useState(null);
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState('');

    const matches = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return LOGOS.filter((logo) =>
            (!group || logo.group === group)
            && (!needle || `${logo.label} ${logo.group}`.toLowerCase().includes(needle)),
        );
    }, [query, group]);

    const find = (id) => LOGOS.find((logo) => logo.id === id) ?? null;

    const choose = (id) => {
        onChange(picking, id);
        setPicking(null);
    };

    return (
        <div>
            {/* The top of the screen in miniature: left, NATCON, right. */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 rounded-xl border border-line bg-black/30 p-4">
                {SIDES.slice(0, 1).map((side) => (
                    <Slot
                        key={side.key}
                        side={side}
                        logo={find(value[side.key])}
                        active={picking === side.key}
                        disabled={disabled}
                        onPick={() => setPicking((current) => (current === side.key ? null : side.key))}
                        onClear={() => onChange(side.key, null)}
                        error={errors[`logo_${side.key}`]}
                    />
                ))}
                <div className="flex flex-col items-center gap-1.5 pt-6">
                    <img src={EVENT_LOGO} alt="NATCON" className="h-12 w-auto object-contain" />
                    <span className="font-lux text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-gold/80">Congratulations!</span>
                </div>
                {SIDES.slice(1).map((side) => (
                    <Slot
                        key={side.key}
                        side={side}
                        logo={find(value[side.key])}
                        active={picking === side.key}
                        disabled={disabled}
                        onPick={() => setPicking((current) => (current === side.key ? null : side.key))}
                        onClear={() => onChange(side.key, null)}
                        error={errors[`logo_${side.key}`]}
                    />
                ))}
            </div>

            {picking && (
                <div className="mt-3 rounded-xl border border-line bg-black/30 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="mr-auto text-sm font-semibold text-white">
                            Choose the {SIDES.find((side) => side.key === picking).label.toLowerCase()} logo
                        </p>
                        <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => setPicking(null)}>
                            Cancel
                        </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <label className="relative min-w-[12rem] flex-1">
                            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim" />
                            <input
                                type="search"
                                className="input pl-9"
                                placeholder="Search logos"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                aria-label="Search logos"
                            />
                        </label>
                        <select className="input w-auto" value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Filter by company">
                            <option value="">All companies</option>
                            {GROUPS.map((name) => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>

                    <ul className="mt-3 grid max-h-[22rem] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                        {matches.map((logo) => {
                            const isSelected = value[picking] === logo.id;
                            return (
                                <li key={logo.id}>
                                    <button
                                        type="button"
                                        onClick={() => choose(logo.id)}
                                        className={`group flex h-full w-full flex-col items-center gap-2 rounded-lg border p-3 transition ${
                                            isSelected ? 'border-gold/70 bg-gold/[0.08]' : 'border-line bg-[#0b0b0b] hover:border-gold/35'
                                        }`}
                                        aria-pressed={isSelected}
                                    >
                                        <span className="grid h-16 w-full place-items-center">
                                            <LogoMark logo={logo} loading="lazy" className="max-h-full max-w-full text-[0.6rem]" imgClassName="max-h-12" />
                                        </span>
                                        <span className="w-full truncate text-center text-[0.7rem] text-muted group-hover:text-white">{logo.label}</span>
                                    </button>
                                </li>
                            );
                        })}
                        {matches.length === 0 && (
                            <li className="col-span-full py-8 text-center text-sm text-muted-dim">No logos match that search.</li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}

function Slot({ side, logo, active, disabled, onPick, onClear, error }) {
    return (
        <div className="flex min-w-0 flex-col items-center gap-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-dim">{side.label}</span>
            <button
                type="button"
                onClick={onPick}
                disabled={disabled}
                className={`grid h-20 w-full place-items-center rounded-lg border p-2 transition disabled:opacity-50 ${
                    active ? 'border-gold/70 bg-gold/[0.08]' : logo ? 'border-line bg-[#0b0b0b] hover:border-gold/35' : 'border-dashed border-line hover:border-gold/35'
                }`}
                aria-label={logo ? `Change the ${side.label.toLowerCase()} logo` : `Choose the ${side.label.toLowerCase()} logo`}
            >
                {logo
                    ? <LogoMark logo={logo} className="max-h-full max-w-full text-[0.6rem]" imgClassName="max-h-14" />
                    : <ImageOff size={18} className="text-muted-dim" />}
            </button>
            <div className="flex w-full items-center justify-center gap-1">
                <span className="min-w-0 truncate text-[0.7rem] text-muted">{logo ? logo.label : 'None'}</span>
                {logo && (
                    <button type="button" className="rounded p-0.5 text-muted hover:text-red-300 disabled:opacity-30" onClick={onClear} disabled={disabled} aria-label={`Remove the ${side.label.toLowerCase()} logo`}>
                        <X size={13} />
                    </button>
                )}
            </div>
            {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
    );
}
