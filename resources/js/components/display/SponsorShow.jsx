import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Diamond, EVENT, EVENT_LOGO, EventBackdrop } from '../landing/EventScene';
import HashtagMark from './HashtagMark';
import { SPONSOR_SLIDES, SPONSOR_TIERS, logoScale } from '../../lib/sponsors';

const EASE = [0.22, 1, 0.36, 1];

// The brand logos either side of the NATCON logo atop every slide.
const TOP_LEFT_LOGO = { src: '/images/logos/filipino-homes/filipinohomes-logo-2.png', alt: 'Filipino Homes' };
const TOP_RIGHT_LOGO = { src: '/images/logos/rent-ph/rentph-new-white-logo.png', alt: 'Rent.ph' };

// Each logo's box per tier, in screen units so they hold on any LED wall: the
// co-presenter fills the stage, each tier after it a step smaller.
const CARD = {
    hero: 'h-[28vh] w-[min(52vw,56rem)] p-[2vh]',
    // Five to a row, so a slide of 10 is two rows.
    lg: 'h-[17vh] w-[16.5vw] p-[2vh]',
    md: 'h-[15vh] w-[16.5vw] p-[1.8vh]',
    // Five to a row, so a slide of 10 is two rows.
    sm: 'h-[17vh] w-[16.5vw] p-[1vh]',
};

const GAP = {
    hero: 'gap-0',
    lg: 'gap-[2.2vw]',
    md: 'gap-[1.8vw]',
    sm: 'gap-[2vw]',
};

/**
 * The sponsor show on the main screen: the co-presenter alone, then each
 * tier of sponsors a slide at a time. The stage stays dark, and the logos
 * stand in a pool of warm gold light with dust drifting through it, bright
 * enough that even a logo in black text reads. `slide` is driven by the main
 * screen (and so by the Control Center), which also times the turns;
 * `logoSize` is the size of the logos along the top, as a % of their default.
 */
export default function SponsorShow({ slide, logoSize = 100, children }) {
    const current = SPONSOR_SLIDES[slide] ?? SPONSOR_SLIDES[0];

    // Every logo fetched up front, so no slide turns over onto a blank card.
    useEffect(() => {
        SPONSOR_TIERS.forEach((tier) => tier.logos.forEach((src) => { new Image().src = src; }));
    }, []);

    return (
        <div className="screen-root relative h-dvh w-full overflow-hidden bg-ink">
            <EventBackdrop />

            {/* Raised off the foot of the wall, which the audience's heads hide. */}
            <div className="relative z-10 flex h-full flex-col items-center px-[3vw] pb-[16vh] pt-[3vh]">
                {/* Filipino Homes, NATCON, Rent.ph, sized together from the
                    Control Center: at 100% the NATCON logo is 9% of the
                    screen's height. Three columns, the outer two equal, so the
                    NATCON logo stays dead centre however wide the side logos
                    are, and the side logos sit out at the screen's edges. */}
                <div className="grid w-full shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-[3vw]">
                    <img
                        src={TOP_LEFT_LOGO.src}
                        alt={TOP_LEFT_LOGO.alt}
                        style={{ height: `${(5.5 * logoSize) / 100}vh` }}
                        className="w-auto justify-self-start object-contain"
                    />
                    <img
                        src={EVENT_LOGO}
                        alt={EVENT.name}
                        style={{ height: `${(9 * logoSize) / 100}vh` }}
                        className="w-auto object-contain drop-shadow-[0_6px_24px_rgba(212,175,55,0.25)]"
                    />
                    <img
                        src={TOP_RIGHT_LOGO.src}
                        alt={TOP_RIGHT_LOGO.alt}
                        style={{ height: `${(6.5 * logoSize) / 100}vh` }}
                        className="w-auto justify-self-end object-contain"
                    />
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={slide}
                        className="flex min-h-0 w-full flex-1 flex-col items-center justify-center"
                        initial="hidden"
                        animate="shown"
                        exit="gone"
                    >
                        <TierHeading slide={current} />
                        <LogoWall slide={current} />
                    </motion.div>
                </AnimatePresence>

                <SlideDots slide={slide} />
            </div>

            {/* The hashtag along the foot, as on every other screen. */}
            <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center">
                <HashtagMark />
            </div>

            {children}
        </div>
    );
}

function TierHeading({ slide }) {
    const { tier } = slide;
    return (
        <motion.div
            className="flex flex-col items-center text-center"
            variants={{
                hidden: { opacity: 0, y: 16 },
                shown: { opacity: 1, y: 0, transition: { duration: 0.9, ease: EASE } },
                gone: { opacity: 0, y: -10, transition: { duration: 0.45, ease: 'easeIn' } },
            }}
        >
            <div className="lux-ornament w-[min(34rem,60vw)]" aria-hidden="true">
                <Diamond />
                <span className="font-lux text-[clamp(0.7rem,1.3vw,1.15rem)] whitespace-nowrap font-semibold uppercase tracking-[0.45em] text-gold/85">
                    {tier.kicker}
                </span>
                <Diamond />
            </div>
            <h1 className="lux-foil mt-[1.2vh] pl-[0.12em] font-lux text-[clamp(2rem,5.2vw,4.75rem)] font-semibold uppercase leading-none tracking-[0.12em]">
                {tier.title}
            </h1>
        </motion.div>
    );
}

function LogoWall({ slide }) {
    const size = slide.tier.size;
    const hero = size === 'hero';
    return (
        <div className="relative mt-[6vh]">
            <GoldLight />
            <motion.ul
            className={`relative flex max-w-[92vw] flex-wrap items-center justify-center ${GAP[size]} ${hero ? '' : 'gap-y-[2.6vh]'}`}
            variants={{
                hidden: {},
                shown: { transition: { staggerChildren: hero ? 0 : 0.07, delayChildren: 0.25 } },
                gone: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
            }}
        >
            {slide.logos.map((src) => (
                <motion.li
                    key={src}
                    className={`flex ${CARD[size]} ${hero ? 'drop-shadow-[0_10px_24px_rgba(120,85,10,0.25)]' : 'drop-shadow-[0_4px_10px_rgba(120,85,10,0.18)]'}`}
                    variants={{
                        // Slide and fade only: scaling a logo with its shadow
                        // redraws the shadow every frame on weaker screens.
                        hidden: { opacity: 0, y: 24 },
                        shown: { opacity: 1, y: 0, transition: { duration: hero ? 1.1 : 0.7, ease: EASE } },
                        gone: { opacity: 0, transition: { duration: 0.35, ease: 'easeIn' } },
                    }}
                >
                    {/* Held to its box, however tall the logo. */}
                    <span className="relative size-full">
                        {/* A logo with a lot of empty space round its artwork is drawn larger (see lib/sponsors). */}
                        <img src={src} alt="" className="absolute inset-0 size-full object-contain" style={logoScale(src) !== 1 ? { transform: `scale(${logoScale(src)})` } : undefined} draggable={false} />
                    </span>
                </motion.li>
            ))}
        </motion.ul>
        </div>
    );
}

// Specks of gold dust in the light: [left %, top %, size px, delay s, length s].
const DUST = [
    [4, 70, 3, 0, 6], [9, 22, 2, 1.4, 7], [15, 88, 4, 2.6, 5.5], [21, 8, 2, 0.6, 6.5],
    [28, 60, 3, 3.2, 7], [34, 94, 2, 1.1, 6], [41, 14, 3, 4, 5.8], [47, 78, 2, 2.2, 6.8],
    [53, 4, 4, 0.3, 6.2], [59, 66, 2, 3.6, 7.2], [65, 18, 3, 1.8, 5.6], [71, 90, 2, 0.9, 6.4],
    [77, 40, 3, 2.9, 7], [83, 10, 2, 4.4, 6], [89, 74, 4, 1.5, 5.8], [95, 30, 2, 3, 6.6],
];

/**
 * The pool of gold light behind the logos: brightest under them, so dark
 * lettering reads, and fading out to the dark stage at the edges, with
 * dust drifting up through it.
 */
function GoldLight() {
    return (
        <motion.div
            className="pointer-events-none absolute -inset-x-[8vw] -inset-y-[6.5vh]"
            aria-hidden="true"
            variants={{
                hidden: { opacity: 0 },
                shown: { opacity: 1, transition: { duration: 1.2, ease: EASE } },
                gone: { opacity: 0, transition: { duration: 0.4 } },
            }}
        >
            {/* A wide halo, then the light itself: solid under every logo,
                corners included, feathered out at the edges. Soft gradients
                rather than blur filters, which weaker screens (smart TVs)
                redraw slowly. */}
            <div className="absolute -inset-[9vh] bg-[radial-gradient(closest-side,rgba(212,175,55,0.22),rgba(212,175,55,0.08)_60%,transparent)]" />
            <div className="absolute -inset-[3vh] bg-[radial-gradient(closest-side,#fbf0cf_0%,#f3e0a8_62%,rgba(230,199,119,0.75)_80%,rgba(230,199,119,0)_100%)]" />
            {DUST.map(([left, top, size, delay, length]) => (
                <span
                    key={`${left}-${top}`}
                    className="sparkle-speck absolute rounded-full bg-gold-bright shadow-[0_0_6px_2px_rgba(245,215,110,0.7)]"
                    style={{
                        left: `${left}%`,
                        top: `${top}%`,
                        width: size,
                        height: size,
                        animation: `sparkle-drift ${length}s ease-in-out ${delay}s infinite both`,
                    }}
                />
            ))}
        </motion.div>
    );
}

/** Where the show is: a dot per slide, the current one drawn out in gold. */
function SlideDots({ slide }) {
    return (
        <div className="mt-[2vh] flex shrink-0 items-center gap-2" aria-hidden="true">
            {SPONSOR_SLIDES.map((_, index) => (
                <span
                    key={index}
                    className={`h-1.5 rounded-full transition-all duration-500 ${index === slide ? 'w-8 bg-gold' : 'w-1.5 bg-white/20'}`}
                />
            ))}
        </div>
    );
}
