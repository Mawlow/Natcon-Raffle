import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Maximize2, Minimize2, RotateCw } from 'lucide-react';
import { refreshScreen } from '../lib/refreshScreen';
import api from '../lib/api';
import { keepIfSame } from '../lib/displaySync';
import { useLogoSizes } from '../lib/logoSizes';
import { PRIZE_SHOW_SIZES_KEY, prizeSlideLine, usePrizeShowChanges } from '../lib/prizeShowSync';
import { Diamond, EVENT, EVENT_LOGO, EventBackdrop } from '../components/landing/EventScene';
import FinalWinners from '../components/display/FinalWinners';
import FitBox from '../components/display/FitBox';
import ShowcaseHeader from '../components/display/ShowcaseHeader';
import HashtagMark from '../components/display/HashtagMark';
import { PrizeLine } from './PrizeScreen';
import PrizeStage from '../components/display/PrizeStage';
import SingleScreenHeader from '../components/display/SingleScreenHeader';

// How often the screen checks for a new prize when the control page is on
// another machine. On the same machine the change shows at once.
const REFRESH_MS = 3000;
// How long the fireworks fire when a new prize goes up.
const CELEBRATE_MS = 2600;

/**
 * The Prize Display: a screen for raffles drawn by hand on stage. It shows
 * nothing but the prize picked on its control page (/prize-display) — laid
 * out like a raffle's single screen: the logos (one in each top corner,
 * either side of NATCON, when set), the title, then the prize's photo and
 * the prize — and switches the moment another is put live. With nothing
 * live it rests on the NATCON logo.
 *
 * Once the operator puts up the winners the host announces (see
 * ManualWinners), the screen lists them like a finished raffle's winners —
 * "[prize] Winners!" under the logos, every name in a grid that fills the
 * wall — and each new name joins the list.
 *
 * Open it in its own window on the LED wall:
 *   /prize-show
 */
export default function PrizeShow() {
    const sizes = useLogoSizes(PRIZE_SHOW_SIZES_KEY);
    const [slide, setSlide] = useState(undefined);
    const [celebrate, setCelebrate] = useState(false);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get('/prize-show');
            setSlide((current) => (data.data === null ? null : keepIfSame(current ?? null, data.data)));
        } catch {
            /* Keep showing the last prize until the server answers again. */
        }
    }, []);

    useEffect(() => {
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => clearInterval(timer);
    }, [load]);
    usePrizeShowChanges(load);

    // The winners announced so far, each carrying the prize so the heading
    // names it once and the cards leave it out.
    const winners = useMemo(() => (slide?.winners ?? []).map((winner) => ({
        position: winner.position,
        ticket_number: winner.ticket_number ?? '',
        name: winner.name,
        prize: prizeSlideLine(slide),
    })), [slide]);
    const listing = winners.length > 0;

    // A short burst of fireworks each time a new prize, or a new winner, goes up.
    const key = slide ? `${slide.id}-${slide.updated_at}` : 'standby';
    const firstKey = useRef(null);
    useEffect(() => {
        if (slide === undefined) return undefined;
        if (firstKey.current === null) {
            firstKey.current = key;
            return undefined;
        }
        if (!slide) return undefined;
        setCelebrate(true);
        const timer = setTimeout(() => setCelebrate(false), CELEBRATE_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return (
        // Double-click anywhere to go fullscreen, or back.
        <div className="screen-root fixed inset-0 overflow-hidden bg-ink" style={{ containerType: 'size' }} onDoubleClick={toggleFullscreen}>
            <EventBackdrop fireworks={{ mode: 'celebration', active: celebrate }} />
            <FullscreenButton />

            <div className={`relative z-10 flex h-full w-full flex-col items-center text-center ${slide ? 'pb-[4cqh]' : 'px-[5cqw] py-[4cqh]'}`}>
                <AnimatePresence mode="wait">
                    {slide !== undefined && (
                        <motion.div
                            key={slide ? `${slide.id}-${listing ? 'winners' : 'prize'}` : 'standby'}
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.02 }}
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                            className="flex min-h-0 w-full flex-1 flex-col items-center"
                        >
                            {slide && listing ? (
                                <>
                                    {/* The winners-only layout of a finished raffle: the logos
                                        either side of "[prize] Winners!", then every name. */}
                                    <ShowcaseHeader logos={slide.logos ?? []} left={slide.logo_left} right={slide.logo_right} sizes={sizes} prize={prizeSlideLine(slide)} count={winners.length} />
                                    {slide.image ? (
                                        /* A prize with a photo (a car) keeps it on the wall: the
                                           photo on the left, the winners' names on the right. */
                                        <div className="grid min-h-0 w-full flex-1 grid-cols-2 items-center gap-[2cqw] px-[clamp(0.75rem,2.5vw,3rem)] pt-[clamp(0.5rem,2vh,1.5rem)]">
                                            {/* Nudged down so the prize sits level with the names beside it. */}
                                            <div className="flex h-full min-h-0 w-full translate-y-[10cqh] items-center justify-center">
                                                <PrizeStage src={slide.image} alt={slide.prize_name} fill scale={sizes.prize ?? 1} spin={Boolean(slide.spin)} />
                                            </div>
                                            <div className="flex h-full min-h-0 w-full items-center justify-center">
                                                {/* Centred level with the photo; a long list shrinks to the room. */}
                                                <FitBox className="max-h-full w-full" origin="center center">
                                                    <StageNames winners={winners} />
                                                </FitBox>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="min-h-0 w-full flex-1 px-[clamp(0.75rem,2.5vw,3rem)] pt-[clamp(0.5rem,2vh,1.5rem)]">
                                            {/* One page however many there are, so a new name joins the list instead of turning it over. */}
                                            <FinalWinners winners={winners} bare fill pageSize={1000} transition="flip" />
                                        </div>
                                    )}
                                </>
                            ) : slide ? (
                                <>
                                    {/* The top of the screen exactly as on a raffle's single screen. */}
                                    <SingleScreenHeader raffle={{ logos: slide.logos, logo_left: slide.logo_left, logo_right: slide.logo_right, prize_name: null }} sizes={sizes} title={false} />
                                    {/* The prize's name sits under the title, centred, and its
                                        photo fills whatever room is left beneath, so it is as
                                        big as the wall allows. With no photo the name sits
                                        high, just under the logos, not alone mid-screen. */}
                                    <div className={`flex min-h-0 w-full flex-1 flex-col items-center px-[5cqw] ${slide.image ? 'justify-center' : 'justify-start pt-[6cqh]'}`}>
                                        <FitBox className="w-full shrink-0" origin="bottom center">
                                            <PrizeLine bare raffle={{ prize_name: slide.prize_name, prize_type: slide.prize_type, prize_value: slide.prize_value, prize_currency: slide.prize_currency }} />
                                        </FitBox>
                                        {slide.image && (
                                            <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                                                <PrizeStage src={slide.image} alt={slide.prize_name} fill scale={sizes.prize ?? 1} spin={Boolean(slide.spin)} />
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <Standby />
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
                <HashtagMark units="cq" />
            </div>
        </div>
    );
}

/**
 * The winners' names beside the prize's photo: each in gold foil lettering
 * with a light passing through it, no card, no number and no ticket: just
 * the name. Usually one person wins a prize like a car, so the name stands
 * on its own; more stack up and shrink to fit.
 */
function StageNames({ winners }) {
    const ease = [0.22, 1, 0.36, 1];

    return (
        <div className="flex w-full flex-col items-center justify-center gap-[4cqh]">
            {winners.map((winner, index) => (
                <motion.div
                    key={`${winner.position}-${winner.name}`}
                    initial={{ opacity: 0, y: 16, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 1, delay: 0.3 + index * 0.15, ease }}
                    className="flex flex-col items-center"
                >
                    <p
                        className="prize-shine text-balance pl-[0.08em] text-center font-lux font-bold uppercase leading-[1.05] tracking-[0.08em]"
                        style={{ fontSize: 'min(5.2cqw, 11cqh)', maxWidth: '46cqw' }}
                    >
                        {winner.name}
                    </p>
                </motion.div>
            ))}
        </div>
    );
}

/** Between prizes: the NATCON logo on its own. */
function Standby() {
    return (
        <div className="flex w-full flex-1 flex-col items-center justify-center">
            <motion.img
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                src={EVENT_LOGO}
                alt={EVENT.name}
                className="max-w-full drop-shadow-[0_10px_40px_rgba(212,175,55,0.25)]"
                style={{ width: 'min(52cqw, 95cqh)' }}
            />
            <div className="lux-ornament mt-[3cqh] w-[40cqw]" aria-hidden="true">
                <Diamond />
                <span className="font-lux font-semibold uppercase tracking-[0.5em] text-gold/80" style={{ fontSize: 'min(1.4cqw, 2.6cqh)' }}>
                    Raffle Draw
                </span>
                <Diamond />
            </div>
        </div>
    );
}

/** Fullscreen on or off, from anywhere on the page. */
async function toggleFullscreen() {
    try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
    } catch {
        /* The browser may refuse; the layout works either way. */
    }
}

/**
 * The fullscreen button, top right: faint until hovered, like the draw
 * screen's own controls, so it is easy to find but barely shows on the wall.
 */
function FullscreenButton() {
    const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));

    useEffect(() => {
        const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    return (
        <div className="absolute right-4 top-4 z-30 flex items-center gap-2 opacity-25 transition-opacity duration-300 hover:opacity-100 focus-within:opacity-100">
            <button
                type="button"
                onClick={refreshScreen}
                className="rounded-lg border border-line bg-black/50 p-2.5 text-muted backdrop-blur transition hover:text-gold"
                aria-label="Refresh"
                title="Refresh"
            >
                <RotateCw size={18} />
            </button>
            <button
                type="button"
                onClick={toggleFullscreen}
                className="rounded-lg border border-line bg-black/50 p-2.5 text-muted backdrop-blur transition hover:text-gold"
                aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
                {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
        </div>
    );
}
