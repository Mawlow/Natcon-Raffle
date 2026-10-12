import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff, Search, X } from 'lucide-react';
import LOGOS from '../../../data/raffle-logos.json';
import { EVENT_LOGO } from '../landing/EventScene';
import { MainScreenPreview, Placeholder, SizeSlider } from './LogoSizePanel';
import ShowcaseHeader from '../display/ShowcaseHeader';
import LogoMark from '../ui/LogoMark';
import { LOGO_MARGIN_MAX, LOGO_MARGIN_MIN } from '../../lib/logoSizes';

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
export default function CornerLogoPicker({ value = {}, onChange, disabled = false, errors = {}, sizes = null, onSizeChange = null, companyIds = [] }) {
    const congrats = sizes?.congrats ?? 100;
    const cornerLeft = sizes?.cornerLeft ?? sizes?.corner ?? 100;
    const cornerRight = sizes?.cornerRight ?? sizes?.corner ?? 100;
    const leftMargin = sizes?.cornerLeftMargin ?? 0;
    const rightMargin = sizes?.cornerRightMargin ?? 0;
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

    // Esc closes the logo sheet (and only the sheet, not a form drawer behind it).
    useEffect(() => {
        if (!picking) return undefined;
        const onKey = (event) => { if (event.key === 'Escape') setPicking(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [picking]);

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
                    <span className="font-lux text-[0.6rem] font-semibold uppercase tracking-[0.2em] text-gold/80">Prize Winners!</span>
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

            {onSizeChange && (
                <div className="mt-4">
                    {/* This screen's sizes only — the prize and winner screens keep theirs. */}
                    <div className="grid gap-4 sm:grid-cols-3">
                        <SizeSlider
                            label="Top-left logo"
                            value={cornerLeft}
                            onChange={(next) => onSizeChange('cornerLeft', next)}
                            disabled={disabled || !value.left}
                            hint={value.left ? null : 'Choose a top-left logo first.'}
                        />
                        <SizeSlider
                            label="NATCON logo"
                            value={congrats}
                            onChange={(next) => onSizeChange('congrats', next)}
                            disabled={disabled}
                        />
                        <SizeSlider
                            label="Top-right logo"
                            value={cornerRight}
                            onChange={(next) => onSizeChange('cornerRight', next)}
                            disabled={disabled || !value.right}
                            hint={value.right ? null : 'Choose a top-right logo first.'}
                        />
                    </div>
                    {/* How far each corner logo sits in from its edge of the screen. */}
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <SizeSlider
                            label="Top-left logo margin"
                            value={leftMargin}
                            onChange={(next) => onSizeChange('cornerLeftMargin', next)}
                            min={LOGO_MARGIN_MIN}
                            max={LOGO_MARGIN_MAX}
                            step={1}
                            noun="margin from the left edge"
                            less="closer to the left edge"
                            more="further from the left edge"
                            disabled={disabled || !value.left}
                            hint={value.left ? 'Space between the logo and the left edge of the screen.' : 'Choose a top-left logo first.'}
                        />
                        <SizeSlider
                            label="Top-right logo margin"
                            value={rightMargin}
                            onChange={(next) => onSizeChange('cornerRightMargin', next)}
                            min={LOGO_MARGIN_MIN}
                            max={LOGO_MARGIN_MAX}
                            step={1}
                            noun="margin from the right edge"
                            less="closer to the right edge"
                            more="further from the right edge"
                            disabled={disabled || !value.right}
                            hint={value.right ? 'Space between the logo and the right edge of the screen.' : 'Choose a top-right logo first.'}
                        />
                    </div>
                    <p className="mt-2 text-xs text-muted-dim">These sizes are for the Congratulations screen only — the prize and winner screens are not changed.</p>

                    {/* The Congratulations screen as it will look on the wall, at these sizes. */}
                    <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">Live preview</p>
                        <div className="pointer-events-none mt-2 select-none overflow-hidden rounded-xl border border-line" aria-hidden="true">
                            <MainScreenPreview>
                                <ShowcaseHeader
                                    left={find(value.left)}
                                    right={find(value.right)}
                                    logos={companyIds.map((id) => LOGOS.find((logo) => logo.id === id)).filter(Boolean)}
                                    sizes={{ event: 1, company: 1, congrats: congrats / 100, cornerLeft: cornerLeft / 100, cornerRight: cornerRight / 100, cornerLeftMargin: leftMargin, cornerRightMargin: rightMargin }}
                                />
                                <div className="relative z-10 flex w-full flex-1 px-16 pb-10 pt-8">
                                    <Placeholder>Winners</Placeholder>
                                </div>
                            </MainScreenPreview>
                        </div>
                    </div>
                </div>
            )}

            {/* The logo list opens as a sheet on the right, beside the preview,
                so changing a logo needs no scrolling down. */}
            {picking && createPortal(
                <div
                    className="fixed inset-y-0 right-0 z-[140] flex w-[min(30rem,100vw)] flex-col border-l border-gold/30 bg-panel shadow-[-20px_0_60px_rgba(0,0,0,0.6)]"
                    role="dialog"
                    aria-label={`Choose the ${SIDES.find((side) => side.key === picking).label.toLowerCase()} logo`}
                >
                    <div className="border-b border-line p-4">
                        <div className="flex items-center gap-2">
                            <p className="mr-auto text-sm font-semibold text-white">
                                Choose the {SIDES.find((side) => side.key === picking).label.toLowerCase()} logo
                            </p>
                            <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => setPicking(null)}>
                                <X size={14} />
                                Close
                            </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <label className="relative min-w-[10rem] flex-1">
                                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim" />
                                <input
                                    type="search"
                                    className="input pl-9"
                                    placeholder="Search logos"
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    aria-label="Search logos"
                                    autoFocus
                                />
                            </label>
                            <select className="input w-auto" value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Filter by company">
                                <option value="">All companies</option>
                                {GROUPS.map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3">
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
                </div>,
                document.body,
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
                    ? (
                        <LogoMark logo={logo} className="max-h-full max-w-full text-[0.6rem]" imgClassName="max-h-14" />
                    )
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
