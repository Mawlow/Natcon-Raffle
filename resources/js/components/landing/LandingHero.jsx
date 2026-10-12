import { motion } from 'framer-motion';
import { Diamond, EVENT, EVENT_LOGO, Trophy } from './EventScene';

/**
 * The landing page's hero: the convention logo, the "Grand Raffle Draw"
 * headline, the dates and the venue, between a pair of trophies. Shared by
 * the landing page and the main screen's welcome screen, which shows it on
 * the wall before the draw starts. `children` go under the venue (the
 * landing page's Start Raffle button); the wall has none. `bottomClass`
 * sets the room under the headline: the wall raises it. `dates` replaces
 * the convention's dates, e.g. with just the day of the show, and
 * `dateClass` their size: the wall sets them larger.
 */
export default function LandingHero({ children, bottomClass = 'pb-[7vh]', dates = EVENT.dates, dateClass = 'text-[0.95rem] sm:text-[1.25rem]' }) {
    return (
        // The convention logo carries the event's name, so it heads the
        // page at the top centre and there is no separate text masthead.
        // The rest of the hero sits in the lower half.
        <section className={`relative flex h-dvh flex-col items-center justify-between gap-10 px-6 ${bottomClass} pt-[clamp(1.25rem,4vh,2.5rem)] text-center`}>
            {/* Decoration: a pair of trophies stands in the lower corners of
                the hero, mirrored so the pair is balanced, on pools of gold
                light, gently floating. They step aside on narrow screens,
                where they would crowd the headline. */}
            <Trophy side="left" />
            <Trophy side="right" />

            <motion.img
                src={EVENT_LOGO}
                alt={EVENT.name}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1.1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                className="w-[min(60rem,94vw)] drop-shadow-[0_10px_40px_rgba(212,175,55,0.25)]"
            />

            <div className="flex flex-col items-center">
                {/* Headline: engraved-serif "RAFFLE" in polished gold, with
                    "Draw" set in a script italic beneath it, framed by
                    diamond-tipped hairlines. */}
                <motion.div
                    initial={{ opacity: 0, scaleX: 0.4 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ duration: 1.1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className="lux-ornament w-[min(30rem,78vw)]"
                    aria-hidden="true"
                >
                    <Diamond />
                    <span className="font-lux text-[0.62rem] font-semibold uppercase tracking-[0.5em] text-gold/80 sm:text-xs">
                        Grand
                    </span>
                    <Diamond />
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, y: 18, letterSpacing: '0.34em' }}
                    animate={{ opacity: 1, y: 0, letterSpacing: '0.14em' }}
                    transition={{ duration: 1.3, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-4 flex flex-col items-center leading-none"
                >
                    <span className="lux-foil pl-[0.14em] font-lux text-[clamp(3rem,10vw,7rem)] font-semibold uppercase">
                        Raffle
                    </span>
                    <motion.span
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1, delay: 0.85, ease: [0.22, 1, 0.36, 1] }}
                        className="lux-foil -mt-[0.18em] font-script text-[clamp(2.4rem,7vw,5rem)] font-semibold italic tracking-[0.02em]"
                    >
                        Draw
                    </motion.span>
                </motion.h1>

                <motion.div
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ duration: 1, delay: 0.7 }}
                    className="lux-ornament mt-5 w-[min(22rem,64vw)]"
                    aria-hidden="true"
                >
                    <Diamond />
                </motion.div>

                {/* Date and venue: engraved capitals for the date, the
                    headline's script italic for the place. */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.9, delay: 1, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-5 flex max-w-xl flex-col items-center"
                >
                    <p className={`font-lux font-semibold uppercase tracking-[0.32em] text-gold-bright/90 [text-shadow:0_0_18px_rgba(212,175,55,0.35)] ${dateClass}`}>
                        {dates}
                    </p>
                    <span className="my-3 block size-[6px] rotate-45 bg-gold/70" aria-hidden="true" />
                    <p className="font-script text-xl font-medium italic tracking-[0.03em] text-[#e9dcb6]/85 sm:text-[1.65rem]">
                        {EVENT.venue}
                    </p>
                </motion.div>

                {children && (
                    <motion.div
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.9 }}
                        className="mt-8 flex flex-wrap items-center justify-center gap-3"
                    >
                        {children}
                    </motion.div>
                )}
            </div>
        </section>
    );
}
