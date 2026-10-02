import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/** GET READY → 3 → 2 → 1 → DRAWING… */
export default function Countdown({ from = 3, onTick, onComplete }) {
    const [value, setValue] = useState(from);

    useEffect(() => {
        if (from <= 0) {
            onComplete?.();
            return undefined;
        }

        setValue(from);
        onTick?.(from);

        const timer = setInterval(() => {
            setValue((current) => {
                const next = current - 1;

                if (next <= 0) {
                    clearInterval(timer);
                    onComplete?.();
                    return 0;
                }

                onTick?.(next);
                return next;
            });
        }, 1000);

        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [from]);

    return (
        <div className="relative grid place-items-center" style={{ minHeight: 'clamp(8rem,28vh,20rem)' }}>
            <AnimatePresence mode="wait">
                <motion.div
                    key={value}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 1.9, opacity: 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="ticket-display gold-text glow-gold text-[clamp(6rem,24vw,20rem)]"
                >
                    {value > 0 ? value : ''}
                </motion.div>
            </AnimatePresence>

            <motion.div
                className="pointer-events-none absolute inset-0 grid place-items-center"
                aria-hidden="true"
            >
                <motion.span
                    key={`ring-${value}`}
                    initial={{ scale: 0.6, opacity: 0.5 }}
                    animate={{ scale: 1.6, opacity: 0 }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="block h-[clamp(8rem,22vw,18rem)] w-[clamp(8rem,22vw,18rem)] rounded-full border border-gold/40"
                />
            </motion.div>
        </div>
    );
}
