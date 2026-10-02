import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { winnerName } from '../../lib/format';

// From this many winners, the single screen lists them down both sides of
// the stage instead of along the bottom.
export const SIDE_LAYOUT_FROM = 6;

// Tallest a side column gets before the tickets spill into another column.
const MAX_ROWS = 8;

/** Previously drawn winners, by name, shown along the bottom of the display. */
export default function WinnerStrip({ winners = [], totalWinners = 0, currentPosition = null }) {
    if (!winners.length) return null;

    return (
        <div className="flex flex-wrap items-center justify-center gap-[clamp(0.625rem,1.2vw,1.25rem)]">
            <AnimatePresence initial={false}>
                {winners.map((winner) => (
                    <WinnerChip key={`${winner.position}-${winner.ticket_number}`} winner={winner} current={winner.position === currentPosition} />
                ))}
            </AnimatePresence>

            {totalWinners > winners.length &&
                Array.from({ length: totalWinners - winners.length }).map((_, index) => (
                    <PendingChip key={`pending-${index}`} position={winners.length + index + 1} />
                ))}
        </div>
    );
}

/**
 * The same winners split down the left and right of the stage: the first half
 * of the positions on the left, the rest on the right. The more winners, the
 * smaller the names, so a long list still fits beside the draw.
 */
// Memoised: the draw re-renders the screen many times a second, and with
// dozens of winners re-rendering every chip each time made it lag.
export const WinnerSides = memo(function WinnerSides({ winners = [], totalWinners = 0, currentPosition = null }) {
    if (!winners.length) return null;

    const slots = Array.from({ length: Math.max(totalWinners, winners.length) }, (_, index) => winners[index] ?? { position: index + 1 });
    const half = Math.ceil(slots.length / 2);

    const columns = Math.min(3, Math.ceil(half / MAX_ROWS));
    const rows = Math.ceil(half / columns);
    const fontSize = `clamp(0.85rem, min(${(2.4 / columns).toFixed(2)}vw, ${(52 / (rows * 2.1)).toFixed(2)}vh), 2.5rem)`;

    return (
        <>
            <Side slots={slots.slice(0, half)} rows={rows} fontSize={fontSize} currentPosition={currentPosition} className="left-[clamp(1rem,3vw,3rem)]" />
            <Side slots={slots.slice(half)} rows={rows} fontSize={fontSize} currentPosition={currentPosition} className="right-[clamp(1rem,3vw,3rem)]" />
        </>
    );
});

function Side({ slots, rows, fontSize, currentPosition, className }) {
    return (
        <div className={`pointer-events-none absolute inset-y-0 z-10 flex items-center ${className}`}>
            <div
                className="grid grid-flow-col gap-x-[0.5em] gap-y-[0.35em]"
                style={{ fontSize, gridTemplateRows: `repeat(${rows}, auto)` }}
            >
                <AnimatePresence initial={false}>
                    {slots.map((slot) => (slot.ticket_number
                        ? <WinnerChip key={`${slot.position}-${slot.ticket_number}`} winner={slot} current={slot.position === currentPosition} scaled />
                        : <PendingChip key={`pending-${slot.position}`} position={slot.position} scaled />))}
                </AnimatePresence>
            </div>
        </div>
    );
}

// Along the bottom the chips size themselves to the screen; down the sides
// (`scaled`) they size from the column's font size so a long list can shrink.
const CHIP = {
    strip: {
        box: 'gap-[clamp(0.625rem,1vw,1rem)] rounded-2xl px-[clamp(0.9rem,1.6vw,1.75rem)] py-[clamp(0.5rem,1.2vh,1rem)]',
        label: 'text-[clamp(0.75rem,min(1.1vw,1.9vh),1.1rem)]',
        number: 'text-[clamp(1.25rem,min(2.4vw,4.2vh),2.5rem)]',
    },
    scaled: {
        box: 'gap-[0.4em] rounded-[0.5em] px-[0.6em] py-[0.25em]',
        label: 'text-[0.5em]',
        // Down the sides a long name is cut short rather than run into the draw.
        number: 'text-[1em] max-w-[11em] truncate',
    },
};

function WinnerChip({ winner, current, scaled = false }) {
    const chip = scaled ? CHIP.scaled : CHIP.strip;

    return (
        // No layout animation: each chip keeps its slot, and measuring every
        // chip on every update lagged the draw with many winners.
        <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            // Solid, not blurred glass: many blurred chips over the fireworks lag the wall.
            className={`flex items-center border ${chip.box} ${
                current ? 'border-gold/60 bg-[#2a2208]/85 shadow-gold-sm' : 'border-gold/20 bg-black/55'
            }`}
        >
            <span className={`${chip.label} font-bold uppercase tracking-[0.16em] text-gold/70`}>
                #{winner.position}
            </span>
            <span className={`font-display ${chip.number} font-extrabold uppercase text-gold-bright`}>
                {winnerName(winner)}
            </span>
        </motion.div>
    );
}

function PendingChip({ position, scaled = false }) {
    const chip = scaled ? CHIP.scaled : CHIP.strip;

    return (
        <div className={`flex items-center border border-dashed border-white/10 ${chip.box}`}>
            <span className={`${chip.label} font-bold uppercase tracking-[0.16em] text-muted-dim`}>
                #{position}
            </span>
            <span className={`tabular font-display ${chip.number} font-extrabold text-white/15`}>
                {'•'.repeat(4)}
            </span>
        </div>
    );
}
