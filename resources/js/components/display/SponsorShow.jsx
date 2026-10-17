import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Diamond, EVENT, EVENT_LOGO, EventBackdrop } from '../landing/EventScene';
import HashtagMark from './HashtagMark';
import { SPONSOR_SLIDES, SPONSOR_TIERS, logoStyle } from '../../lib/sponsors';

const EASE = [0.22, 1, 0.36, 1];

// The brand logos either side of the NATCON logo atop every slide.
const TOP_LEFT_LOGO = { src: '/images/logos/filipino-homes/filipinohomes-logo-2.png', alt: 'Filipino Homes' };
const TOP_RIGHT_LOGO = { src: '/images/logos/rent-ph/rentph-new-white-logo.png', alt: 'Rent.ph' };

// Each logo's box, in screen units so they hold on any LED wall: the
// co-presenter fills the stage; every sponsor tier shares one box size,
// five to a row across the 92vw band (5 × 16.8vw + 4 × 2vw gaps).
const CARD = {
    hero: 'h-[28vh] w-[min(52vw,56rem)] p-[2vh]',
    // Five to a row, so a slide of 10 is two rows.
    lg: 'h-[16.5vh] w-[16.8vw] p-[1.4vh]',
    md: 'h-[16.5vh] w-[16.8vw] p-[1.4vh]',
    // Five to a row, so a slide of 10 is two rows.
    sm: 'h-[16.5vh] w-[16.8vw] p-[1.4vh]',
};

/**
 * The sponsor show on the main screen: the co-presenter alone, then each
 * tier of sponsors a slide at a time. The stage stays dark, and the logos
 * stand on one cream plaque in an ornate polished-gold frame, bright enough
 * that even a logo in black text reads. `slide` is driven by the main
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
        /* One fixed band, the same on every slide, wider than the wall so its
           left and right ends run off both sides of the screen: only the top
           and bottom edges of the frame show. The logos are laid out inside
           it, never the other way round. */
        <div className="relative mt-[4vh] flex h-[42vh] w-[112vw] shrink-0 items-center justify-center">
            <Plaque />
            <motion.ul
            /* The co-presenter sits alone; a tier of sponsors is five equal
               boxes to a row spread across the whole wall, and a short last
               row (three left over, say) is centred rather than left-aligned. */
            className={hero ? 'relative flex items-center justify-center' : 'relative flex w-[92vw] flex-wrap items-center justify-center gap-x-[2vw] gap-y-[2.2vh]'}
            variants={{
                hidden: {},
                shown: { transition: { staggerChildren: hero ? 0 : 0.07, delayChildren: 0.25 } },
                gone: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
            }}
        >
            {slide.logos.map((src) => (
                <motion.li
                    key={src}
                    className={`relative flex ${CARD[size]} ${hero ? 'drop-shadow-[0_10px_24px_rgba(120,85,10,0.25)]' : 'drop-shadow-[0_4px_10px_rgba(120,85,10,0.18)]'}`}
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
                        {/* A logo with a lot of empty space round its artwork is drawn larger, and a dark one is outlined in white (see lib/sponsors). */}
                        <img src={src} alt="" className="absolute inset-0 size-full object-contain" style={logoStyle(src)} draggable={false} />
                    </span>
                </motion.li>
            ))}
        </motion.ul>
        </div>
    );
}

// Polished gold, lit from the top left, for the frame's metal.
const GOLD_METAL = 'linear-gradient(135deg, #6e5312 0%, #c9a640 18%, #fff1bf 34%, #d8b449 50%, #8a6a1a 66%, #e9cf7a 84%, #7a5c14 100%)';
const GOLD_RULE = 'linear-gradient(90deg, rgba(184,144,42,0) 0%, #b8902a 20%, #f3dc8e 50%, #b8902a 80%, rgba(184,144,42,0) 100%)';

/** A round gold boss, a dark ring inside its rim and a bright centre. */
function Boss({ size = '2.2vh', style }) {
    return (
        <span aria-hidden="true" className="pointer-events-none absolute rounded-full" style={{ width: size, height: size, background: GOLD_METAL, boxShadow: '0 0.3vh 0.8vh rgba(0,0,0,0.55)', ...style }}>
            <span className="absolute inset-[22%] rounded-full bg-[#1a1407]" />
            <span className="absolute inset-[34%] rounded-full" style={{ background: GOLD_METAL }} />
        </span>
    );
}

/**
 * The plaque the logos stand on: a cream band running right off both sides
 * of the screen, so every logo sits on the same bright ground. Along its
 * top and bottom edges a polished gold band with a dark reveal inside, a
 * hairline rule inset on the panel, and a round medallion set into the
 * middle of each edge with a rule running out either side. All flat colour
 * and hard edges: nothing blurred for a smart TV to redraw.
 */
function Plaque() {
    return (
        <motion.div
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
            variants={{
                hidden: { opacity: 0, scaleY: 0.96 },
                shown: { opacity: 1, scaleY: 1, transition: { duration: 1, ease: EASE } },
                gone: { opacity: 0, transition: { duration: 0.4 } },
            }}
        >
            {/* The gold band, the dark reveal, then the cream panel. */}
            <div className="absolute inset-0" style={{ background: GOLD_METAL, boxShadow: '0 2.5vh 6vh -2vh rgba(0,0,0,0.85)' }} />
            <div className="absolute inset-[0.55vh] bg-[#1a1407]" />
            <div className="absolute inset-[0.85vh] bg-[linear-gradient(180deg,#fdf6e0_0%,#f8ebc7_60%,#f2e0b0_100%)]" style={{ boxShadow: 'inset 0 0 0 1px rgba(143,110,28,0.45), inset 0 0.4vh 0 rgba(255,255,255,0.85)' }} />

            {/* A hairline rule inset along the top and foot of the panel, and a fine second rule under it. */}
            <div className="absolute inset-x-0 top-[2.4vh] h-px bg-[#9c7a22]/70" />
            <div className="absolute inset-x-0 top-[3vh] h-px bg-[#9c7a22]/35" />
            <div className="absolute inset-x-0 bottom-[2.4vh] h-px bg-[#9c7a22]/70" />
            <div className="absolute inset-x-0 bottom-[3vh] h-px bg-[#9c7a22]/35" />

            {/* The medallion set into the top edge, with a rule running out either side. */}
            <span className="absolute left-1/2 top-0 h-[0.3vh] w-[30%] -translate-x-1/2 -translate-y-1/2" style={{ background: GOLD_RULE }} />
            <span className="absolute left-1/2 top-0 size-[5.4vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1a1407]" style={{ boxShadow: '0 0 0 0.35vh #1a1407' }} />
            <Boss size="5.4vh" style={{ left: '50%', top: 0, transform: 'translate(-50%, -50%)' }} />
            {/* Smaller bosses out along the rule. */}
            {['38%', '62%'].map((left) => <Boss key={left} size="2vh" style={{ left, top: 0, transform: 'translate(-50%, -50%)' }} />)}
            {/* And its echo along the foot. */}
            <span className="absolute bottom-0 left-1/2 h-[0.3vh] w-[30%] -translate-x-1/2 translate-y-1/2" style={{ background: GOLD_RULE }} />
            <Boss size="3.4vh" style={{ left: '50%', top: '100%', transform: 'translate(-50%, -50%)' }} />
            {['38%', '62%'].map((left) => <Boss key={left} size="1.6vh" style={{ left, top: '100%', transform: 'translate(-50%, -50%)' }} />)}
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
