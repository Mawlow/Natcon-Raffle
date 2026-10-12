import { AnimatePresence, motion } from 'framer-motion';
import Fireworks from './Fireworks';
import { ScreenBackdrop } from '../display/ScreenMargins';

/**
 * The convention's stage set, shared by the landing page and the draw
 * display: the event artwork, the Cebu skyline with its bridge, palms,
 * swinging spotlights, gold dust and fireworks, plus the trophies and
 * ornaments laid over it.
 */
export const EVENT = {
    name: 'National Real Estate Convention 2026',
    dates: 'October 18–19, 2026',
    // One day of the convention, for the welcome screen on that day.
    days: {
        18: 'October 18, 2026',
        19: 'October 19, 2026',
    },
    venue: 'JPark Island Resort & Waterpark · Mactan, Cebu',
};

export const EVENT_LOGO = '/images/natcon-logo-2026.png';

const EVENT_BANNER = '/images/natcon-2026.webp';
const TROPHY = '/images/trophy.png';
const SKYLINE = '/images/bg-raffle.png';
const BRIDGE = '/images/bridge.png';
const PALM = '/images/tree.png';

/**
 * The fixed backdrop behind a page. `fireworks` is passed straight to
 * <Fireworks>: { mode: 'ambient' } for a steady show, or
 * { mode: 'celebration', active } to fire only while `active` is on.
 * `palms` off fades the corner palm trees away, to give the stage the room.
 */
export function EventBackdrop({ fireworks = { mode: 'ambient' }, palms = true }) {
    return (
        <ScreenBackdrop>
            <div className="fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
                {/* The convention artwork. It is softened on purpose — the poster
                    carries its own title and dates, and left sharp it fights the
                    headline sitting on top of it. Blurred, it reads as the event's
                    colour and texture. */}
                <motion.img
                    src={EVENT_BANNER}
                    alt=""
                    // A fade only: zooming a full-screen picture in made weaker
                    // screens (smart TVs) stutter as every screen opened.
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.85 }}
                    transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full w-full scale-[1.06] object-cover blur-[2px] sm:blur-0"
                />
                {/* Darkest through the middle band, where the headline sits. */}
                <div
                    className="absolute inset-0"
                    style={{
                        background: 'linear-gradient(to bottom, rgba(5,5,5,0.62) 0%, rgba(5,5,5,0.88) 28%, rgba(5,5,5,0.9) 62%, rgba(5,5,5,0.97) 88%, #050505 100%)',
                    }}
                />
                <div
                    className="absolute inset-0"
                    style={{ background: 'radial-gradient(60% 45% at 50% 38%, rgba(212,175,55,0.10) 0%, transparent 70%)' }}
                />
                {/* The logo repeats the title printed in the artwork, so the band
                    the poster's own title sits in is washed out almost to black —
                    one title on screen, not two. */}
                <div
                    className="absolute inset-x-0 top-0 h-[52vh]"
                    style={{
                        background: 'linear-gradient(to bottom, #050505 0%, rgba(5,5,5,0.98) 26%, rgba(5,5,5,0.88) 42%, rgba(5,5,5,0.5) 70%, transparent 100%)',
                    }}
                />
                {/* Fireworks burst over the city, behind the skyline. */}
                {/* No blend mode: the canvas already adds its light, and blending
                    the whole screen every frame made the wall stutter. */}
                <Fireworks className="absolute inset-0 h-full w-full" {...fireworks} />

                {/* The Cebu skyline rises along the foot of the backdrop, its base
                    faded into the page so it reads as part of the scene. The
                    bridge sits behind the rightmost tower, its left span tucked
                    out of sight. Both share one wrapper so they line up at every
                    width and fade in together. */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 0.45, y: 0 }}
                    transition={{ duration: 2, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute -bottom-[6vh] left-1/2 w-[max(100vw,48rem)] max-w-[90rem] -translate-x-1/2 pt-[16%] [mask-image:linear-gradient(to_bottom,black_75%,transparent_100%)] [filter:drop-shadow(0_0_18px_rgba(212,175,55,0.18))]"
                >
                    {/* The top padding gives the bridge, which towers over the
                        skyline, room inside the mask so its top isn't clipped. */}
                    <div className="relative">
                        <img src={BRIDGE} alt="" className="absolute bottom-[12%] left-[74%] w-[32%]" />
                        <img src={SKYLINE} alt="" className="relative block w-full" />
                    </div>
                </motion.div>

                {/* Palms frame the scene at both lower corners: the right one as
                    drawn, the left one mirrored so the pair lean outward. */}
                <AnimatePresence>
                    {palms && [
                        <motion.img
                            key="palm-right"
                            src={PALM}
                            alt=""
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 0.9, y: 0 }}
                            exit={{ opacity: 0, y: 30, transition: { duration: 0.8 } }}
                            transition={{ duration: 2, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
                            className="absolute -bottom-[3vh] -right-[2vw] h-[min(34vh,19rem)] w-auto origin-bottom rotate-[4deg] [mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)] [filter:drop-shadow(0_0_14px_rgba(212,175,55,0.18))]"
                        />,
                        <motion.img
                            key="palm-left"
                            src={PALM}
                            alt=""
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 0.9, y: 0 }}
                            exit={{ opacity: 0, y: 30, transition: { duration: 0.8 } }}
                            transition={{ duration: 2, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
                            className="absolute -bottom-[3vh] -left-[2vw] h-[min(34vh,19rem)] w-auto origin-bottom -scale-x-100 -rotate-[4deg] [mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)] [filter:drop-shadow(0_0_14px_rgba(212,175,55,0.18))]"
                        />,
                    ]}
                </AnimatePresence>

                {/* Stage lighting fills the top corners beside the logo: a
                    spotlight swinging from each corner, with gold dust drifting up
                    through the light. */}
                <div className="stage-beam -left-[10vw] animate-[beam-sweep-left_14s_ease-in-out_infinite]" />
                <div className="stage-beam -right-[10vw] animate-[beam-sweep-right_14s_ease-in-out_infinite] [animation-delay:-7s]" />
                <GoldDust />

                {/* A soft pool of shadow behind the headline and the stage keeps
                    the skyline from showing through the lettering. */}
                <div
                    className="absolute inset-0"
                    style={{ background: 'radial-gradient(38% 30% at 50% 66%, rgba(5,5,5,0.82) 0%, rgba(5,5,5,0.5) 55%, transparent 100%)' }}
                />
                <div className="vignette absolute inset-0" />
            </div>
        </ScreenBackdrop>
    );
}

// Gold dust for the two top corners. Positions come from a fixed formula,
// not Math.random, so the pattern is the same on every render.
const DUST = Array.from({ length: 24 }, (_, i) => {
    const r = (n) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    const left = i % 2 === 0 ? 2 + r(1) * 28 : 70 + r(1) * 28;
    return {
        left: `${left}%`,
        top: `${6 + r(2) * 44}%`,
        size: 2 + r(3) * 3.5,
        duration: 6 + r(4) * 7,
        delay: -r(5) * 12,
    };
});

function GoldDust() {
    return DUST.map((dot, i) => (
        <span
            key={i}
            className="gold-dust"
            style={{
                left: dot.left,
                top: dot.top,
                width: dot.size,
                height: dot.size,
                animationDuration: `${dot.duration}s`,
                animationDelay: `${dot.delay}s`,
            }}
        />
    ));
}

export function Diamond() {
    return <span className="block size-[7px] shrink-0 rotate-45 border border-gold bg-gold/30 shadow-[0_0_10px_rgba(212,175,55,0.6)]" />;
}

/**
 * A trophy standing in a lower corner on a pool of gold light, gently
 * floating. The right-hand one is mirrored so a pair is balanced. It steps
 * aside on narrow screens, where it would crowd the headline.
 */
export function Trophy({ side, heightClass = 'h-[min(56vh,32rem)]' }) {
    const mirrored = side === 'right';
    const shadow = '[filter:drop-shadow(0_0_30px_rgba(212,175,55,0.25))_drop-shadow(0_24px_30px_rgba(0,0,0,0.7))]';

    return (
        <motion.div
            initial={{ opacity: 0, x: mirrored ? 40 : -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: mirrored ? 40 : -40, transition: { duration: 0.8 } }}
            transition={{ duration: 1.4, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className={`pointer-events-none absolute bottom-[6vh] hidden lg:block ${mirrored ? 'right-[4vw]' : 'left-[4vw]'}`}
            aria-hidden="true"
        >
            <div className="absolute -bottom-6 left-1/2 h-16 w-[120%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(212,175,55,0.35),transparent)] blur-md" />
            <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                className={`relative ${mirrored ? 'rotate-6' : '-rotate-6'} ${shadow}`}
            >
                <img src={TROPHY} alt="" className={`block w-auto ${heightClass} ${mirrored ? '-scale-x-100' : ''}`} />
                {/* Mirroring would print the base's plaque backwards, so the
                    mirrored trophy lays the unflipped base back over its own. */}
                {mirrored && (
                    <img src={TROPHY} alt="" className="absolute inset-0 h-full w-full [clip-path:inset(82%_0_0_0)]" />
                )}
            </motion.div>
        </motion.div>
    );
}
