import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fitText } from '../../lib/format';

// How fast names flash past while the draw is rolling, and how slow the last
// few are once it is winding down onto the winner.
const FAST_MS = 70;
const SLOW_MS = 480;
// How long the winner's name holds in the window, after rolling in, before
// the reveal takes over.
const LAND_HOLD_MS = 1100;

// Each name rolls up from below the window as the last one rolls out the
// top, like a slot-machine reel. `custom` is how long this step lasts.
const REEL = {
    enter: { y: '100%' },
    center: ({ ms, final }) => ({
        y: '0%',
        transition: final
            // The winner rolls in with a little settle, like a reel clunking to a stop.
            ? { type: 'spring', stiffness: 220, damping: 16, mass: 0.9 }
            : { duration: ms / 1000, ease: ms > 200 ? [0.22, 1, 0.36, 1] : 'linear' },
    }),
    exit: ({ ms, final }) => ({
        y: '-100%',
        transition: { duration: final ? 0.45 : ms / 1000, ease: ms > 200 || final ? [0.22, 1, 0.36, 1] : 'linear' },
    }),
};

/**
 * The rolling name readout.
 *
 * Purely presentational, like the ticket roller before it: it flashes
 * through names from `pool` until the server hands back the winner
 * (`target`), then slows down over `settleMs` and lands on that name. It
 * never picks a winner.
 */
export default function NameRoller({
    pool = [],
    target = null,
    rolling = false,
    settleMs = 2600,
    onSettled,
    onTick,
}) {
    const names = useMemo(() => {
        const unique = [...new Set(pool.map((name) => String(name ?? '').trim()).filter(Boolean))];
        return unique.length ? unique : ['• • • •'];
    }, [pool]);

    // The name in the window: a fresh id per step, so each one rolls in anew.
    const [slot, setSlot] = useState(() => ({ id: 0, name: target ?? names[0], ms: FAST_MS, final: false }));
    const [landed, setLanded] = useState(!rolling && target !== null);
    const nextId = useRef(1);
    const show = (name, ms, final = false) => setSlot({ id: nextId.current++, name, ms, final });

    const onSettledRef = useRef(onSettled);
    const onTickRef = useRef(onTick);
    useEffect(() => { onSettledRef.current = onSettled; }, [onSettled]);
    useEffect(() => { onTickRef.current = onTick; }, [onTick]);
    // The loop reads the winner through a ref, so it arriving mid-roll does
    // not restart the roll.
    const targetRef = useRef(target);
    targetRef.current = target;

    // Where the wind-down started, once the winner is known.
    const settleStartRef = useRef(null);
    const settledRef = useRef(false);

    useEffect(() => {
        if (!rolling) {
            if (target !== null) {
                show(target, FAST_MS, true);
                setLanded(true);
            }
            return undefined;
        }

        settledRef.current = false;
        settleStartRef.current = null;
        setLanded(false);

        let timer = null;
        let last = null;

        const pick = () => {
            if (names.length === 1) return names[0];
            let next = last;
            while (next === last) next = names[Math.floor(Math.random() * names.length)];
            return next;
        };

        const step = () => {
            if (settledRef.current) return;

            let interval = FAST_MS;
            if (targetRef.current !== null) {
                if (settleStartRef.current === null) settleStartRef.current = performance.now();
                const progress = (performance.now() - settleStartRef.current) / settleMs;

                if (progress >= 1) {
                    settledRef.current = true;
                    const winner = targetRef.current;
                    show(winner, SLOW_MS, true);
                    setLanded(true);
                    // Let the name roll in and settle before the reveal takes over.
                    timer = setTimeout(() => onSettledRef.current?.(winner), LAND_HOLD_MS);
                    return;
                }

                // Eases out: each name stays a little longer than the last.
                interval = FAST_MS + (SLOW_MS - FAST_MS) * progress * progress;
            }

            last = pick();
            show(last, interval);
            onTickRef.current?.();
            timer = setTimeout(step, interval);
        };

        step();
        return () => clearTimeout(timer);
    }, [rolling, names, settleMs]); // eslint-disable-line react-hooks/exhaustive-deps

    // One size for the whole roll, from the longest name it may show, so the
    // text does not jump about as names flash past.
    const longest = useMemo(
        () => Math.min(28, Math.max(...names.map((name) => name.length), String(target ?? '').length)),
        [names, target],
    );
    const fontSize = `max(1.75rem, ${fitText('x'.repeat(longest), 88, 'min(15vh, 8rem)', 'vw')})`;

    // Motion blur while the reel is spinning fast, sharp as it slows.
    const blur = slot.final ? 0 : slot.ms < 120 ? 1.6 : slot.ms < 250 ? 0.7 : 0;

    return (
        <div className="flex h-[min(22vh,11rem)] w-full items-center justify-center" aria-live="polite">
            {/* The reel window: a little taller than one line, its top and
                bottom faded, so names are seen rolling in and out. */}
            <div className="relative w-full max-w-[94vw]" style={{ fontSize }}>
                <span className="absolute inset-x-[8%] top-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" aria-hidden="true" />
                <span className="absolute inset-x-[8%] bottom-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" aria-hidden="true" />
                <div
                    className="relative overflow-hidden"
                    style={{
                        height: '1.7em',
                        maskImage: 'linear-gradient(to bottom, transparent 0%, black 26%, black 74%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 26%, black 74%, transparent 100%)',
                    }}
                >
                    <AnimatePresence initial={false} custom={slot}>
                        <motion.div
                            key={slot.id}
                            custom={slot}
                            variants={REEL}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            className="absolute inset-0 flex items-center justify-center"
                            style={{ filter: blur ? `blur(${blur}px)` : undefined }}
                        >
                            <motion.span
                                initial={false}
                                animate={landed ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                                transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                                className={`block max-w-full truncate whitespace-nowrap pl-[0.06em] text-center font-lux font-bold uppercase leading-none tracking-[0.06em] ${
                                    landed ? 'lux-foil glow-gold' : 'text-white/90'
                                }`}
                            >
                                {slot.name}
                            </motion.span>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
