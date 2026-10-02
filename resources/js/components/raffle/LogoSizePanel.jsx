import { memo, useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { DEFAULT_LOGO_SIZES, LOGO_SIZE_MAX, LOGO_SIZE_MIN, loadLogoSizes, saveLogoSizes, toScale } from '../../lib/logoSizes';
import { LedBackdrop } from '../display/LedPanel';
import LogoRow from '../display/LogoRow';
import MainScreenHeader from '../display/MainScreenHeader';
import SingleScreenHeader from '../display/SingleScreenHeader';
import { PrizeBody } from '../../pages/PrizeScreen';
import { WinnerHeader } from '../../pages/WinnerScreen';

const STEP = 5;

/**
 * Logo sizing for the Control Center: a volume-style slider for the NATCON
 * logo and one for the company logos, with a live preview of each screen in
 * the current setup. Every move is saved at once, and the open screens follow
 * it straight away (see lib/logoSizes).
 */
// Memoised: the Control Center re-renders every second for its connection
// lights, and redrawing these screen previews each time made it lag.
export default memo(LogoSizePanel);

function LogoSizePanel({ raffle, raffleId, screens }) {
    const [sizes, setSizes] = useState(() => loadLogoSizes(raffleId));
    const [previewKey, setPreviewKey] = useState(screens[0].key);
    const scale = toScale(sizes);
    const hasCompanies = (raffle.logos ?? []).length > 0;

    // Switching setup swaps the screens; fall back to the first one.
    const preview = screens.find((screen) => screen.key === previewKey) ?? screens[0];
    useEffect(() => {
        if (!screens.some((screen) => screen.key === previewKey)) setPreviewKey(screens[0].key);
    }, [screens, previewKey]);

    const change = (key, value) => {
        const next = { ...sizes, [key]: Math.min(LOGO_SIZE_MAX, Math.max(LOGO_SIZE_MIN, value)) };
        setSizes(next);
        saveLogoSizes(raffleId, next);
    };

    const reset = () => {
        setSizes({ ...DEFAULT_LOGO_SIZES });
        saveLogoSizes(raffleId, DEFAULT_LOGO_SIZES);
    };

    const isDefault = sizes.event === DEFAULT_LOGO_SIZES.event && sizes.company === DEFAULT_LOGO_SIZES.company;

    return (
        <section className="panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="font-display text-base font-bold text-white">Logo size</h2>
                    <p className="mt-0.5 text-xs text-muted">Changes show on the open screens straight away.</p>
                </div>
                <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={reset} disabled={isDefault}>
                    <RotateCcw size={13} />
                    Reset
                </button>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <SizeSlider label="NATCON logo" value={sizes.event} onChange={(value) => change('event', value)} />
                <SizeSlider
                    label="Company logos"
                    value={sizes.company}
                    onChange={(value) => change('company', value)}
                    disabled={!hasCompanies}
                    hint={hasCompanies ? null : 'This raffle has no company logos.'}
                />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">Live preview</p>
                {screens.length > 1 && (
                    <div className="flex gap-1 rounded-lg border border-line bg-black/40 p-1" role="tablist" aria-label="Preview screen">
                        {screens.map((screen) => (
                            <button
                                key={screen.key}
                                type="button"
                                role="tab"
                                aria-selected={screen.key === preview.key}
                                onClick={() => setPreviewKey(screen.key)}
                                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                    screen.key === preview.key ? 'bg-gold text-black' : 'text-muted hover:text-white'
                                }`}
                            >
                                {screen.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="pointer-events-none mt-3 select-none overflow-hidden rounded-xl border border-line" aria-hidden="true">
                {preview.key === 'winner' ? (
                    <SubScreenPreview>
                        <LogoRow logos={raffle.logos ?? []} scale={0.5} sizes={scale} />
                        <div className="mt-[2cqh]">
                            <WinnerHeader raffle={raffle} />
                        </div>
                        <p className="lux-foil mt-[2cqh] pl-[0.16em] font-lux font-semibold uppercase leading-none tracking-[0.16em]" style={{ fontSize: 'min(5cqw, 9cqh)' }}>
                            {raffle.winners_count === 1 ? 'Winner' : 'Winners'}
                        </p>
                        <Placeholder className="mt-[2.5cqh]">Winners</Placeholder>
                    </SubScreenPreview>
                ) : preview.key === 'prize' ? (
                    <SubScreenPreview>
                        <PrizeBody raffle={raffle} sizes={scale} />
                    </SubScreenPreview>
                ) : (
                    <MainScreenPreview>
                        {preview.path === 'single'
                            ? <SingleScreenHeader raffle={raffle} sizes={scale} />
                            : <MainScreenHeader sizes={scale} />}
                        <div className="relative z-10 flex w-full flex-1 px-16 pb-10 pt-8">
                            <Placeholder>The draw</Placeholder>
                        </div>
                    </MainScreenPreview>
                )}
            </div>
            {/* The three-screen main screen shows only the NATCON logo. */}
            {preview.path === 'display' && hasCompanies && (
                <p className="mt-2 text-xs text-muted-dim">The main screen shows only the NATCON logo; company logos are on the sub screens.</p>
            )}
        </section>
    );
}

/** One size, set like a volume: − and + buttons either side of a slider, and the percentage. */
export function SizeSlider({ label, value, onChange, disabled = false, hint = null }) {
    return (
        <div className={disabled ? 'opacity-50' : ''}>
            <div className="flex items-baseline justify-between">
                <label className="text-sm font-semibold text-white">{label}</label>
                <span className="tabular font-display text-sm font-bold text-gold-bright">{value}%</span>
            </div>
            <div className="mt-2 flex items-center gap-2.5">
                <button
                    type="button"
                    className="rounded-md border border-line p-1.5 text-muted transition hover:text-gold disabled:opacity-30"
                    onClick={() => onChange(value - STEP)}
                    disabled={disabled || value <= LOGO_SIZE_MIN}
                    aria-label={`Make the ${label} smaller`}
                >
                    <Minus size={14} />
                </button>
                <input
                    type="range"
                    min={LOGO_SIZE_MIN}
                    max={LOGO_SIZE_MAX}
                    step={STEP}
                    value={value}
                    disabled={disabled}
                    onChange={(event) => onChange(Number(event.target.value))}
                    className="h-1.5 w-full cursor-pointer accent-gold disabled:cursor-not-allowed"
                    aria-label={`${label} size`}
                />
                <button
                    type="button"
                    className="rounded-md border border-line p-1.5 text-muted transition hover:text-gold disabled:opacity-30"
                    onClick={() => onChange(value + STEP)}
                    disabled={disabled || value >= LOGO_SIZE_MAX}
                    aria-label={`Make the ${label} bigger`}
                >
                    <Plus size={14} />
                </button>
            </div>
            {hint && <p className="mt-1.5 text-xs text-muted-dim">{hint}</p>}
        </div>
    );
}

/** A 12×7 sub screen in miniature, laid out with the same container units as the real panel. */
function SubScreenPreview({ children }) {
    return (
        <div className="relative w-full overflow-hidden bg-ink" style={{ aspectRatio: '12 / 7', containerType: 'size' }}>
            <LedBackdrop />
            <div className="relative z-10 flex h-full w-full flex-col items-center px-[5cqw] py-[5cqh] text-center">
                {children}
            </div>
        </div>
    );
}

// The main screen is drawn at full 1920×1080 and shrunk to fit, so its
// rem-sized parts keep their true proportions.
const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

function MainScreenPreview({ children }) {
    const frameRef = useRef(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const frame = frameRef.current;
        if (!frame) return undefined;
        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        observer.observe(frame);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={frameRef} className="relative w-full overflow-hidden bg-ink" style={{ aspectRatio: `${STAGE_WIDTH} / ${STAGE_HEIGHT}` }}>
            {width > 0 && (
                <div
                    className="absolute left-0 top-0 flex flex-col"
                    style={{
                        width: STAGE_WIDTH,
                        height: STAGE_HEIGHT,
                        transform: `scale(${width / STAGE_WIDTH})`,
                        transformOrigin: 'top left',
                        containerType: 'size',
                        '--stage-vw': `${STAGE_WIDTH / 100}px`,
                        '--stage-vh': `${STAGE_HEIGHT / 100}px`,
                    }}
                >
                    <LedBackdrop />
                    {children}
                </div>
            )}
        </div>
    );
}

/** Stands in for the part of a screen that is not about the logos. */
function Placeholder({ children, className = '' }) {
    return (
        <div className={`grid min-h-0 w-full flex-1 place-items-center rounded-[1.5cqw] border-2 border-dashed border-white/10 text-white/20 ${className}`}>
            <span className="font-display font-bold uppercase tracking-[0.3em]" style={{ fontSize: 'max(0.7rem, 2cqw)' }}>{children}</span>
        </div>
    );
}
