import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { winnerName } from '../../lib/format';
import { cardVariants, needsPerspective } from './winnerTransitions';

// The shape a name card is laid out for (width : height): wide enough for a
// full name on two lines.
const CARD_RATIO = 3;
// Space between cards, as a share of the smaller side of the stage.
const GAP_SHARE = 0.012;
const LINE_HEIGHT = 1.12;
// The name's letter-spacing, in em (matches tracking-[0.04em]).
const TRACKING = 0.04;

/**
 * Picks the columns and rows that give the biggest cards for `count` winners
 * in a `width` × `height` stage: every option from one column to `count`
 * columns is tried, and the one whose card fits the largest CARD_RATIO box
 * wins. 30 winners on a wide screen land on 5 × 6 or 6 × 5.
 */
export function bestGrid(count, width, height) {
    const gap = Math.min(width, height) * GAP_SHARE;
    let best = { columns: 1, rows: 1, cardWidth: width, cardHeight: height, gap, score: -1 };

    for (let columns = 1; columns <= Math.max(count, 1); columns += 1) {
        const rows = Math.ceil(count / columns);
        const cellWidth = (width - gap * (columns - 1)) / columns;
        const cellHeight = (height - gap * (rows - 1)) / rows;
        const score = Math.min(cellWidth / CARD_RATIO, cellHeight);
        if (score > best.score) best = { columns, rows, cellWidth, cellHeight, gap, score };
    }

    // A card never gets taller than its shape needs, nor wider than most of
    // the stage, so a handful of winners don't become giant slabs.
    const cardWidth = Math.min(best.cellWidth, width * 0.8, best.cellHeight * CARD_RATIO * 1.6);
    const cardHeight = Math.min(best.cellHeight, cardWidth / (CARD_RATIO * 0.8));
    return { ...best, cardWidth, cardHeight };
}

let canvas;
/** Width of `text` at 100px in the given CSS font, with the name's tracking. */
function textWidth(text, font) {
    canvas ??= document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `700 100px ${font}`;
    return context.measureText(text).width + text.length * TRACKING * 100;
}

/**
 * The largest size `name` can be set at to fit a `width` × `height` box,
 * whole and uncut: on one line, or split at the word break that leaves the
 * two lines most even — whichever lets it be bigger.
 */
export function fitName(name, width, height, font) {
    const text = name.toUpperCase();
    const one = textWidth(text, font);
    let best = { lines: [text], size: Math.min((width * 100) / one, height / LINE_HEIGHT) };

    const words = text.split(/\s+/).filter(Boolean);
    for (let split = 1; split < words.length; split += 1) {
        const lines = [words.slice(0, split).join(' '), words.slice(split).join(' ')];
        const widest = Math.max(...lines.map((line) => textWidth(line, font)));
        const size = Math.min((width * 100) / widest, height / (2 * LINE_HEIGHT));
        if (size > best.size) best = { lines, size };
    }

    return best;
}

/**
 * The winners laid out in a grid that fills the room it is given: the columns
 * and rows are chosen from the stage's real size so every card is as big as
 * it can be, and each name is measured and set at the largest size that
 * shows it in full — never cut off, never run out of its card. The cards
 * come in with the chosen `transition` when the grid mounts, and play their
 * way out when `leaving` is set (see winnerTransitions).
 */
export default memo(WinnersGrid);

function WinnersGrid({ winners, transition = 'flip', leaving = false }) {
    const boxRef = useRef(null);
    const probeRef = useRef(null);
    const [box, setBox] = useState(null);
    const [font, setFont] = useState(null);
    const [fontsReady, setFontsReady] = useState(0);

    useLayoutEffect(() => {
        const element = boxRef.current;
        if (!element) return undefined;
        const measure = () => {
            const { width, height } = element.getBoundingClientRect();
            setBox((current) => (current && Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1 ? current : { width, height }));
        };
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        measure();
        setFont(getComputedStyle(probeRef.current).fontFamily);
        // Names are measured in the display font, so measure again once it has loaded.
        document.fonts?.ready.then(() => setFontsReady((value) => value + 1));
        return () => observer.disconnect();
    }, []);

    const count = winners.length;
    const variants = useMemo(() => cardVariants(transition), [transition]);
    const grid = box ? bestGrid(count, box.width, box.height) : null;

    const cards = useMemo(() => {
        if (!grid || !font) return [];
        const padX = grid.cardWidth * 0.06;
        const padY = grid.cardHeight * 0.08;
        const nameWidth = grid.cardWidth - padX * 2;
        const nameHeight = grid.cardHeight - padY * 2;
        return winners.map((winner) => ({ winner, name: winnerName(winner), ...fitName(winnerName(winner), nameWidth, nameHeight, font) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [winners, grid?.cardWidth, grid?.cardHeight, font, fontsReady]);

    return (
        <div ref={boxRef} className="relative h-full w-full">
            {/* Only here to read the display font's family off the stylesheet. */}
            <span ref={probeRef} className="pointer-events-none invisible absolute font-lux" aria-hidden="true" />

            {grid && (
                <ol
                    className="absolute inset-x-0 top-0 grid content-start justify-center"
                    style={{
                        perspective: needsPerspective(transition) ? '1200px' : undefined,
                        gridTemplateColumns: `repeat(${grid.columns}, ${grid.cardWidth}px)`,
                        gridAutoRows: `${grid.cardHeight}px`,
                        gap: `${grid.gap}px`,
                    }}
                >
                    {cards.map(({ winner, name, lines, size }, index) => {
                        // A short last row sits centred under the full ones.
                        const lastRowStart = (grid.rows - 1) * grid.columns;
                        const inLastRow = index >= lastRowStart;
                        const missing = grid.rows * grid.columns - count;
                        const shift = inLastRow && missing > 0 ? (missing * (grid.cardWidth + grid.gap)) / 2 : 0;

                        return (
                            <motion.li
                                key={`${winner.position}-${winner.ticket_number}`}
                                custom={{ index, count, row: Math.floor(index / grid.columns), col: index % grid.columns, rows: grid.rows, columns: grid.columns }}
                                variants={variants}
                                initial="hidden"
                                animate={leaving ? 'leave' : 'show'}
                                // Solid rather than blurred glass: a backdrop blur behind every
                                // moving card makes the turnover stutter on the wall.
                                className="flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-2xl border border-gold/35 bg-black/65 text-center shadow-gold-sm"
                                style={{
                                    padding: `${grid.cardHeight * 0.08}px ${grid.cardWidth * 0.06}px`,
                                    position: 'relative',
                                    left: shift || undefined,
                                    // Each card on its own layer: its gold lettering is drawn
                                    // once, not again on every frame of the turnover.
                                    willChange: 'transform, opacity',
                                }}
                                title={name}
                            >
                                <span
                                    className="lux-foil block font-lux font-bold uppercase tracking-[0.04em]"
                                    style={{ fontSize: `${Math.floor(size * 0.97)}px`, lineHeight: LINE_HEIGHT }}
                                >
                                    {lines.map((line, part) => (
                                        <span key={part} className="block whitespace-nowrap">{line}</span>
                                    ))}
                                </span>
                            </motion.li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}
