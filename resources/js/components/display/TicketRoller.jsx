import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const CYCLE_MS = 55;

/**
 * The rolling ticket readout.
 *
 * It is purely presentational: it cycles through arbitrary characters until the
 * server hands back a winning ticket, then settles digit by digit onto that
 * value. It never picks a winner and never receives participant information.
 */
export default function TicketRoller({
    length = 6,
    pool = [],
    target = null,
    rolling = false,
    settleMs = 2600,
    onSettled,
    onTick,
    size = 'display',
}) {
    const characters = useMemo(() => {
        const found = new Set();
        pool.forEach((ticket) => String(ticket).split('').forEach((char) => found.add(char)));
        '0123456789'.split('').forEach((char) => found.add(char));

        return Array.from(found);
    }, [pool]);

    const targetString = target === null || target === undefined || target === '' ? null : String(target);

    // Leading zeros are only meaningful on an all-digit ticket: "000042" must
    // keep them, while "#01" must not be padded into "0#01".
    const padded = useMemo(() => {
        if (targetString === null) return null;

        return /^\d+$/.test(targetString)
            ? targetString.padStart(Math.max(length, targetString.length), '0')
            : targetString;
    }, [targetString, length]);

    const width = padded ? padded.length : length;

    // A target with rolling off is a decided value — the reveal frame re-mounts
    // this component around the settled ticket, and replaying the spin there is
    // what made a single draw look like two.
    const isStatic = !rolling && padded !== null;

    const [digits, setDigits] = useState(() => (
        isStatic ? padded.split('') : Array.from({ length: width }, () => '0')
    ));
    const [lockedCount, setLockedCount] = useState(isStatic ? width : 0);

    const frameRef = useRef(null);
    const lastCycleRef = useRef(0);
    const settleStartRef = useRef(null);
    const settledRef = useRef(false);
    const onSettledRef = useRef(onSettled);
    const onTickRef = useRef(onTick);

    useEffect(() => { onSettledRef.current = onSettled; }, [onSettled]);
    useEffect(() => { onTickRef.current = onTick; }, [onTick]);

    // Reset whenever a new draw begins.
    useEffect(() => {
        if (!rolling && padded === null) {
            settledRef.current = false;
            settleStartRef.current = null;
            setLockedCount(0);
            setDigits(Array.from({ length: width }, () => '0'));
        }
    }, [rolling, padded, width]);

    // Show an already-decided ticket outright, with every digit locked.
    useEffect(() => {
        if (!isStatic) return;

        settledRef.current = true;
        setDigits(padded.split(''));
        setLockedCount(width);
    }, [isStatic, padded, width]);

    useEffect(() => {
        if (isStatic) return undefined;
        if (!rolling && padded === null) return undefined;
        if (settledRef.current) return undefined;

        const step = (now) => {
            // Once the winning ticket is known, digits lock left-to-right.
            if (padded && settleStartRef.current === null) {
                settleStartRef.current = now;
            }

            let locked = 0;

            if (padded) {
                const elapsed = now - settleStartRef.current;
                locked = Math.min(width, Math.floor((elapsed / settleMs) * width));
            }

            // The remaining digits spin faster as each one locks in.
            const interval = padded ? Math.max(20, CYCLE_MS - locked * 5) : CYCLE_MS;

            if (now - lastCycleRef.current >= interval) {
                lastCycleRef.current = now;

                // Built to `width` rather than mapped over the previous array:
                // the winning ticket may be shorter than the slots being spun.
                setDigits(Array.from({ length: width }, (_, index) => (
                    padded && index < locked
                        ? padded[index]
                        : characters[Math.floor(Math.random() * characters.length)]
                )));

                onTickRef.current?.();
            }

            if (locked !== lockedCount) setLockedCount(locked);

            if (padded && locked >= width) {
                settledRef.current = true;
                setDigits(padded.split(''));
                onSettledRef.current?.(padded);
                return;
            }

            frameRef.current = requestAnimationFrame(step);
        };

        frameRef.current = requestAnimationFrame(step);

        return () => {
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
        // lockedCount is intentionally excluded: it is a render mirror of a value the loop owns.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rolling, padded, width, settleMs, characters, isStatic]);

    const sizeClasses = {
        display: 'text-[clamp(3.5rem,min(17vw,24vh),16rem)]',
        medium: 'text-[clamp(2rem,8vw,5rem)]',
        small: 'text-[clamp(1.25rem,4vw,2.25rem)]',
    }[size];

    const gapClasses = { display: 'gap-[0.06em]', medium: 'gap-[0.05em]', small: 'gap-[0.04em]' }[size];

    return (
        <div className={`ticket-display flex items-center justify-center ${gapClasses} ${sizeClasses}`} aria-live="polite">
            {digits.map((digit, index) => {
                const isLocked = padded !== null && index < lockedCount;

                return (
                    <motion.span
                        key={index}
                        animate={isLocked
                            ? { scale: [1.18, 1], filter: 'blur(0px)', opacity: 1 }
                            : { scale: 1, filter: rolling ? 'blur(0.6px)' : 'blur(0px)', opacity: rolling ? 0.92 : 1 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                        className={`relative inline-block ${isLocked ? 'gold-text glow-gold' : 'text-white/95'}`}
                        style={{ minWidth: '0.62em', textAlign: 'center' }}
                    >
                        {digit}
                    </motion.span>
                );
            })}
        </div>
    );
}
