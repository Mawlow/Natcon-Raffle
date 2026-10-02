import { motion } from 'framer-motion';
import { fitText, ordinal } from '../../lib/format';

/**
 * The reveal frame around the winner's name. Only the name goes up on the
 * wall — email and phone stay in the admin dashboard.
 */
export default function WinnerReveal({ position, totalWinners, children }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex flex-col items-center"
        >
            <motion.p
                initial={{ opacity: 0, y: -14, letterSpacing: '0.6em' }}
                animate={{ opacity: 1, y: 0, letterSpacing: '0.42em' }}
                transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                className="font-display text-[clamp(0.9rem,2.4vw,1.9rem)] font-extrabold uppercase text-gold"
            >
                Winner
            </motion.p>

            {totalWinners > 1 && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    className="mt-1 text-[clamp(0.7rem,1.4vw,1rem)] font-semibold uppercase tracking-[0.3em] text-muted"
                >
                    {ordinal(position)} of {totalWinners}
                </motion.p>
            )}

            <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="gold-rule my-[clamp(0.75rem,2vh,1.75rem)] w-[min(38rem,80vw)]"
            />

            <div className="relative">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.75, 0.4] }}
                    transition={{ duration: 1.6, ease: 'easeOut' }}
                    // A wide soft gradient instead of a 70px blur filter, which was
                    // recalculated on every frame of the fade.
                    className="pointer-events-none absolute -inset-[30%] -z-10"
                    style={{ background: 'radial-gradient(closest-side, rgba(212,175,55,0.45) 0%, rgba(212,175,55,0.15) 50%, transparent 100%)', willChange: 'opacity' }}
                    aria-hidden="true"
                />

                {children}
            </div>

            <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.8, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="gold-rule mt-[clamp(0.75rem,2vh,1.75rem)] w-[min(38rem,80vw)]"
            />

        </motion.div>
    );
}

/** The winner's name, as large as it fits, landing with a gold glow. */
export function WinnerName({ name }) {
    return (
        <motion.p
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="lux-foil glow-gold max-w-[92vw] text-balance pl-[0.06em] text-center font-lux font-bold uppercase leading-[1.05] tracking-[0.06em]"
            style={{ fontSize: `max(2rem, ${fitText(name, 88, 'min(20vh, 11rem)', 'vw')})` }}
        >
            {name}
        </motion.p>
    );
}
