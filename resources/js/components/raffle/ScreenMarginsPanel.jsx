import { useEffect, useState } from 'react';
import { MARGIN_MAX, MARGIN_MIN, NO_MARGINS, fitInMargins, loadScreenMargins, saveScreenMargins } from '../../lib/screenMargins';
import { SizeSlider } from './LogoSizePanel';

const SCREENS = [
    { key: 'main', label: 'Main screen', aspect: '16 / 9' },
    { key: 'winner', label: 'Winner screen', aspect: '12 / 7' },
    { key: 'prize', label: 'Prize screen', aspect: '12 / 7' },
];

const SIDE_LABELS = { top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right' };

/**
 * The LED wall's safe area: how far each screen's picture is kept in from
 * its edges, for when the wall's edge is cut off or covered. Changes show on
 * the open screens at once, for every raffle.
 */
export default function ScreenMarginsPanel({ single = false }) {
    const screens = single ? SCREENS.slice(0, 1) : SCREENS;
    const [screen, setScreen] = useState('main');
    const [margins, setMargins] = useState(() => loadScreenMargins(screen));
    useEffect(() => setMargins(loadScreenMargins(screen)), [screen]);

    const change = (next) => {
        setMargins(next);
        saveScreenMargins(screen, next);
    };
    const current = screens.find((item) => item.key === screen) ?? screens[0];
    const fit = fitInMargins(margins);
    const untouched = Object.values(margins).every((value) => value === 0);

    return (
        <section className="panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="font-display text-base font-bold text-white">Screen margins</h2>
                    <p className="mt-0.5 text-xs text-muted">
                        Keeps the content away from an edge of the LED wall that is cut off or covered. The background still fills the wall; only the content shrinks to fit, without stretching.
                    </p>
                </div>
                <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={() => change({ ...NO_MARGINS })} disabled={untouched}>
                    Reset
                </button>
            </div>

            {screens.length > 1 && (
                <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg border border-line bg-black/40 p-1" role="radiogroup" aria-label="Screen">
                    {screens.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            role="radio"
                            aria-checked={screen === item.key}
                            onClick={() => setScreen(item.key)}
                            className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                                screen === item.key ? 'bg-gold text-black' : 'text-muted hover:text-white'
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}

            <div className="mt-5 grid gap-6 md:grid-cols-[1fr_16rem]">
                <div className="grid gap-5 sm:grid-cols-2">
                    {Object.keys(SIDE_LABELS).map((side) => (
                        <SizeSlider
                            key={side}
                            label={SIDE_LABELS[side]}
                            value={margins[side]}
                            onChange={(value) => change({ ...margins, [side]: value })}
                            min={MARGIN_MIN}
                            max={MARGIN_MAX}
                            step={1}
                            noun="margin"
                            less="smaller"
                            more="bigger"
                        />
                    ))}
                </div>

                {/* The screen in miniature: the gold box is where the picture goes. */}
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">{current.label}</p>
                    <div className="relative mt-2 w-full overflow-hidden rounded-md border border-line bg-black" style={{ aspectRatio: current.aspect }}>
                        <div
                            className="absolute rounded-sm border border-dashed border-white/25"
                            style={{ top: `${margins.top}%`, bottom: `${margins.bottom}%`, left: `${margins.left}%`, right: `${margins.right}%` }}
                        />
                        <div
                            className="absolute rounded-sm bg-gold/25 ring-1 ring-gold"
                            style={fit
                                ? { left: `${fit.x}%`, top: `${fit.y}%`, width: `${fit.scale * 100}%`, height: `${fit.scale * 100}%` }
                                : { inset: 0 }}
                        />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-dim">
                        {fit ? `Picture at ${Math.round(fit.scale * 100)}% of full size.` : 'Fills the whole screen.'}
                    </p>
                </div>
            </div>
        </section>
    );
}
