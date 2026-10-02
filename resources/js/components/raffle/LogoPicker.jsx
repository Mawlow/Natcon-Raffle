import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ImageOff, Plus, Search, X } from 'lucide-react';
import LOGOS from '../../../data/raffle-logos.json';
import LogoMark from '../ui/LogoMark';

const GROUPS = [...new Set(LOGOS.map((logo) => logo.group))];

/**
 * Picks any number of company logos for a raffle from the fixed catalogue —
 * one sponsor or several. They show on the prize screen in the order chosen.
 * Only catalogue logos can be chosen; there is no upload.
 */
export default function LogoPicker({ value = [], onChange, error }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState('');

    const selected = value.map((id) => LOGOS.find((logo) => logo.id === id)).filter(Boolean);

    const matches = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return LOGOS.filter((logo) =>
            (!group || logo.group === group)
            && (!needle || `${logo.label} ${logo.group}`.toLowerCase().includes(needle)),
        );
    }, [query, group]);

    // Clicking a logo in the catalogue adds it, or takes it off if it is
    // already in; the catalogue stays open so several can be picked in a row.
    const toggle = (id) => onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
    const remove = (id) => onChange(value.filter((item) => item !== id));
    const move = (index, step) => {
        const next = [...value];
        const target = index + step;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };

    return (
        <div>
            {/* Current choice */}
            <div className="rounded-xl border border-line bg-black/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">
                            {selected.length === 0 ? 'No logos' : `${selected.length} logo${selected.length === 1 ? '' : 's'} selected`}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                            {selected.length === 0
                                ? 'The prize screen shows only the raffle title and prize.'
                                : 'Shown on the prize screen in this order. Use the arrows to reorder.'}
                        </p>
                    </div>

                    <div className="flex gap-2">
                        {selected.length > 0 && (
                            <button type="button" className="btn btn-ghost" onClick={() => onChange([])}>
                                <X size={15} />
                                Clear all
                            </button>
                        )}
                        <button type="button" className="btn btn-outline" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
                            <Plus size={15} />
                            {open ? 'Done' : selected.length ? 'Add more logos' : 'Add logos'}
                        </button>
                    </div>
                </div>

                {selected.length > 0 ? (
                    <ul className="mt-4 flex flex-wrap gap-3">
                        {selected.map((logo, index) => (
                            <li key={logo.id} className="flex w-40 flex-col items-center gap-2 rounded-lg border border-line bg-[#0b0b0b] p-2">
                                <span className="grid h-16 w-full place-items-center">
                                    <LogoMark logo={logo} className="max-h-full max-w-full text-[0.6rem]" imgClassName="max-h-12" />
                                </span>
                                <span className="w-full truncate text-center text-[0.7rem] text-muted">{logo.label}</span>
                                <span className="flex w-full items-center justify-between">
                                    <button type="button" className="rounded p-1 text-muted hover:text-gold disabled:opacity-25" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${logo.label} left`}>
                                        <ChevronLeft size={15} />
                                    </button>
                                    <button type="button" className="rounded p-1 text-muted hover:text-red-300" onClick={() => remove(logo.id)} aria-label={`Remove ${logo.label}`}>
                                        <X size={15} />
                                    </button>
                                    <button type="button" className="rounded p-1 text-muted hover:text-gold disabled:opacity-25" onClick={() => move(index, 1)} disabled={index === selected.length - 1} aria-label={`Move ${logo.label} right`}>
                                        <ChevronRight size={15} />
                                    </button>
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="mt-4 grid h-20 w-40 place-items-center rounded-lg border border-dashed border-line">
                        <ImageOff size={20} className="text-muted-dim" />
                    </div>
                )}
            </div>

            {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}

            {/* Catalogue */}
            {open && (
                <div className="mt-3 rounded-xl border border-line bg-black/30 p-4">
                    <div className="flex flex-wrap gap-2">
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
                        <select
                            className="input w-auto"
                            value={group}
                            onChange={(event) => setGroup(event.target.value)}
                            aria-label="Filter by company"
                        >
                            <option value="">All companies</option>
                            {GROUPS.map((name) => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>

                    <p className="mt-3 text-xs text-muted-dim">
                        {matches.length} logo{matches.length === 1 ? '' : 's'} · click to add or remove · shown as they will look on the dark screen
                    </p>

                    <ul className="mt-3 grid max-h-[26rem] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                        {matches.map((logo) => {
                            const isSelected = value.includes(logo.id);
                            return (
                                <li key={logo.id}>
                                    <button
                                        type="button"
                                        onClick={() => toggle(logo.id)}
                                        className={`group relative flex h-full w-full flex-col items-center gap-2 rounded-lg border p-3 text-left transition ${
                                            isSelected ? 'border-gold/70 bg-gold/[0.08]' : 'border-line bg-[#0b0b0b] hover:border-gold/35'
                                        }`}
                                        aria-pressed={isSelected}
                                    >
                                        <span className="grid h-20 w-full place-items-center">
                                            <LogoMark logo={logo} loading="lazy" className="max-h-full max-w-full text-[0.6rem]" imgClassName="max-h-14" />
                                        </span>
                                        <span className="w-full truncate text-center text-[0.7rem] text-muted group-hover:text-white">{logo.label}</span>
                                        {isSelected && (
                                            <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-gold text-black">
                                                <Check size={12} />
                                            </span>
                                        )}
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
