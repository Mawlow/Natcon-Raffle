import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Maximize2, Minimize2, RotateCw } from 'lucide-react';
import { refreshScreen } from '../lib/refreshScreen';
import api from '../lib/api';
import { keepIfSame } from '../lib/displaySync';
import { useLogoSizes } from '../lib/logoSizes';
import { PRIZE_SHOW_SIZES_KEY, usePrizeShowChanges } from '../lib/prizeShowSync';
import { Diamond, EVENT, EVENT_LOGO, EventBackdrop } from '../components/landing/EventScene';
import FitBox from '../components/display/FitBox';
import HashtagMark from '../components/display/HashtagMark';
import { PrizeBody } from './PrizeScreen';

// How often the screen checks for a new prize when the control page is on
// another machine. On the same machine the change shows at once.
const REFRESH_MS = 3000;
// How long the fireworks fire when a new prize goes up.
const CELEBRATE_MS = 2600;

/**
 * The Prize Display: a screen for raffles drawn by hand on stage. It shows
 * nothing but the prize picked on its control page (/prize-display) — the
 * company logos, the title and the prize — and switches the moment another is
 * put live. With nothing live it rests on the NATCON logo.
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

    // A short burst of fireworks each time a new prize goes up.
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
        <div className="fixed inset-0 overflow-hidden bg-ink" style={{ containerType: 'size' }} onDoubleClick={toggleFullscreen}>
            <EventBackdrop fireworks={{ mode: 'celebration', active: celebrate }} />
            <FullscreenButton />

            <div className="relative z-10 flex h-full w-full flex-col items-center px-[5cqw] py-[4cqh] text-center">
                <AnimatePresence mode="wait">
                    {slide !== undefined && (
                        <motion.div
                            key={key}
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.02 }}
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                            className="flex min-h-0 w-full flex-1 flex-col items-center"
                        >
                            {slide ? (
                                // Sits at the top of the screen. A long title or a wall of
                                // another shape scales the prize down to fit, never under
                                // the hashtag.
                                <FitBox className="w-full flex-1" origin="top center">
                                <PrizeBody
                                    raffle={{
                                        name: slide.title,
                                        prize_name: slide.prize_name,
                                        prize_type: slide.prize_type,
                                        prize_value: slide.prize_value,
                                        prize_currency: slide.prize_currency,
                                        logos: slide.logos,
                                    }}
                                    sizes={sizes}
                                />
                                </FitBox>
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
