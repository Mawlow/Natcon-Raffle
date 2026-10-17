import { memo, useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Presentation, Trophy } from 'lucide-react';
import { DEFAULT_SPONSOR_LOGO_SIZE, SPONSOR_INTERVALS, SPONSOR_LOGO_SIZE_MAX, SPONSOR_LOGO_SIZE_MIN, SPONSOR_SLIDES, SPONSOR_TIERS, clampSponsorLogoSize, logoStyle } from '../../lib/sponsors';
import { SizeSlider } from './LogoSizePanel';

/**
 * The sponsor show inside a raffle's Control Center: every sponsor's logo
 * on the open main screen, tier by tier — the co-presenter first, then the
 * major sponsors, minor sponsors and star benefactors. The operator puts it
 * up between draws, lets it play or steps through it by hand, and can jump
 * straight to any slide. START or DRAW takes it down.
 */
function SponsorShowPanel({ main, mainConnected, midDraw, post }) {
    const on = Boolean(mainConnected && main?.sponsors);
    // A main screen opened before the sponsor show never reports it.
    const supported = !mainConnected || main?.sponsorSlide !== undefined;
    const slide = main?.sponsorSlide ?? 0;
    const playing = main?.sponsorPlaying ?? true;
    const seconds = main?.sponsorInterval;
    const current = SPONSOR_SLIDES[slide] ?? SPONSOR_SLIDES[0];

    const command = useCallback((action, extra = {}) => post({ type: 'command', action, ...extra }), [post]);

    // The NATCON logo's size: moves at once under the operator's hand, and
    // follows what the main screen reports otherwise.
    const reportedSize = main?.sponsorLogoSize ?? DEFAULT_SPONSOR_LOGO_SIZE;
    const [logoSize, setLogoSize] = useState(reportedSize);
    useEffect(() => setLogoSize(reportedSize), [reportedSize]);
    const changeLogoSize = (value) => {
        const size = clampSponsorLogoSize(value);
        setLogoSize(size);
        command('sponsor-logo-size', { value: size });
    };

    return (
        <section className="panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="font-display text-base font-bold text-white">Sponsor Show</h2>
                    <p className="mt-0.5 text-xs text-muted">
                        {!mainConnected
                            ? 'Open the main screen first: it shows the sponsors in place.'
                            : midDraw
                                ? 'Wait for the current draw to finish.'
                                : `${SPONSOR_TIERS.reduce((sum, tier) => sum + tier.logos.length, 0)} sponsor logos across ${SPONSOR_SLIDES.length} slides. START or DRAW takes it down.`}
                    </p>
                </div>
                {on && (
                    <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.15em] text-emerald-300">
                        <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                        On the wall
                    </span>
                )}
            </div>

            {/* What the main screen shows */}
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-black/40 p-1" role="radiogroup" aria-label="Main screen shows">
                {[[true, 'Sponsors', Presentation], [false, 'Raffle draw', Trophy]].map(([value, label, Icon]) => (
                    <button
                        key={label}
                        type="button"
                        role="radio"
                        aria-checked={on === value}
                        onClick={() => command('sponsors', { on: value })}
                        disabled={!mainConnected || !supported || (value && midDraw)}
                        className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition disabled:opacity-40 ${
                            on === value ? 'bg-gold text-black' : 'text-muted hover:text-white'
                        }`}
                    >
                        <Icon size={15} />
                        {label}
                    </button>
                ))}
            </div>

            {!supported && (
                <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    The main screen is running an older version. Reload that window (Cmd+R or F5) to use the sponsor show.
                </p>
            )}

            {on && (
                <>
                    {/* Now showing, with the hand controls */}
                    <div className="mt-4 rounded-xl border border-gold/30 bg-gold/[0.04] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">
                                    Slide {slide + 1} of {SPONSOR_SLIDES.length}
                                </p>
                                <p className="mt-0.5 truncate font-display text-base font-bold text-gold-bright">
                                    {current.tier.title}
                                    {current.pages > 1 && <span className="text-muted"> · {current.page + 1}/{current.pages}</span>}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button type="button" className="btn btn-outline px-3 py-2" onClick={() => command('sponsor-step', { dir: -1 })} aria-label="Previous slide">
                                    <ChevronLeft size={16} />
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-outline px-3 py-2"
                                    onClick={() => command('sponsor-play', { on: !playing })}
                                    aria-label={playing ? 'Pause' : 'Play'}
                                    title={playing ? 'Pause on this slide' : 'Play'}
                                >
                                    {playing ? <Pause size={16} /> : <Play size={16} />}
                                </button>
                                <button type="button" className="btn btn-gold px-4 py-2 text-sm" onClick={() => command('sponsor-step', { dir: 1 })}>
                                    Next
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>

                        {/* The slide on the wall, in miniature */}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {current.logos.map((src) => (
                                <span key={src} className="relative h-10 w-16 overflow-hidden rounded-md bg-[#f4e6bd] ring-1 ring-gold/50">
                                    <img src={src} alt="" className="absolute inset-1 size-[calc(100%-0.5rem)] object-contain" style={logoStyle(src)} />
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Straight to any slide */}
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">Jump to</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {SPONSOR_SLIDES.map(({ tier, page, pages }, index) => (
                            <button
                                key={`${tier.key}-${page}`}
                                type="button"
                                onClick={() => command('sponsor-slide', { index })}
                                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                                    slide === index ? 'border-gold bg-gold/15 text-gold-bright' : 'border-line text-muted hover:border-gold/40 hover:text-white'
                                }`}
                            >
                                {tier.title}{pages > 1 ? ` ${page + 1}` : ''}
                            </button>
                        ))}
                    </div>

                    {/* How long each slide stays up while playing */}
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">Each slide</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {SPONSOR_INTERVALS.map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => command('sponsor-interval', { seconds: value })}
                                className={`min-w-11 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                                    seconds === value ? 'border-gold bg-gold/15 text-gold-bright' : 'border-line text-muted hover:border-gold/40 hover:text-white'
                                }`}
                            >
                                {value}s
                            </button>
                        ))}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-dim">
                        {playing ? 'Plays on its own and loops back to the co-presentor.' : 'Paused: the wall stays on this slide.'}
                    </p>

                    {/* The Filipino Homes, NATCON and Rent.ph logos atop every slide */}
                    <div className="mt-5 flex items-end gap-3">
                        <div className="min-w-0 flex-1">
                            <SizeSlider
                                label="Top logos size"
                                value={logoSize}
                                onChange={changeLogoSize}
                                min={SPONSOR_LOGO_SIZE_MIN}
                                max={SPONSOR_LOGO_SIZE_MAX}
                            />
                        </div>
                        <button
                            type="button"
                            className="btn btn-ghost px-3 py-1.5 text-xs"
                            onClick={() => changeLogoSize(DEFAULT_SPONSOR_LOGO_SIZE)}
                            disabled={logoSize === DEFAULT_SPONSOR_LOGO_SIZE}
                        >
                            Reset
                        </button>
                    </div>
                </>
            )}
        </section>
    );
}

export default memo(SponsorShowPanel);
