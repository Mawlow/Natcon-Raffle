import { motion } from 'framer-motion';
import { ordinal } from '../../lib/format';

/**
 * The heading over the winners once they are all revealed: "[prize] Winners!"
 * — "₱5,000 CASH PRIZE WINNERS!" — or "… WINNER!" when that prize has a
 * single winner (`count`, which is never shown as a number here),
 * with the prize's words picked out in bright gold that a light passes
 * through now and then — lettering only, no frame. Without a single prize
 * (the winners won different ones) it is just "Winners!". `size` is the
 * heading's font size; a long prize wraps rather than run off the screen.
 * A new prize — the next page of winners — plays the entrance again.
 */
export default function WinnersTitle({ prize, count = null, set = null, size, className = '' }) {
    return (
        <div className="flex flex-col items-center">
        <motion.p
            key={prize ?? ''}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className={`max-w-[94vw] text-balance text-center font-lux font-semibold uppercase leading-[1.1] ${className}`}
            style={{ fontSize: size }}
        >
            {prize && (
                <>
                    <span className="prize-shine font-bold tracking-[0.08em]">{prize}</span>{' '}
                </>
            )}
            <span className="lux-foil pl-[0.12em] tracking-[0.16em]">{count === 1 ? 'Winner!' : 'Winners!'}</span>
        </motion.p>
        {/* Shown a page at a time (a set of winners called up to the stage):
            which set this is — "1ST SET OF 50 WINNERS". */}
        {set > 0 && count > 0 && (
            <motion.p
                key={`set-${set}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="mt-[0.35em] text-center font-lux font-semibold uppercase leading-tight tracking-[0.3em] text-gold/85"
                style={{ fontSize: `calc(${size} * 0.42)` }}
            >
                {ordinal(set)} set of {count} {count === 1 ? 'winner' : 'winners'}
            </motion.p>
        )}
        </div>
    );
}
