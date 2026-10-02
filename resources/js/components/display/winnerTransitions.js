/**
 * The ways a set of winners can turn over on the winners-only display, chosen
 * from the Control Center. Each one says how a card comes in (`hidden` →
 * `show`) and goes out (`leave`), and in what order the cards move: draw
 * order, a diagonal ripple, from the centre out, or shuffled.
 *
 * The delay between cards shrinks as the set grows, so 5 names and 30 names
 * both finish turning in about a second. Only transforms and opacity are
 * animated — no blur or filters — so the wall stays smooth with many cards.
 */
export const TRANSITIONS = [
    { id: 'flip', label: 'Flip board' },
    { id: 'spin', label: 'Card turn' },
    { id: 'fade', label: 'Fade' },
    { id: 'slide', label: 'Slide' },
    { id: 'zoom', label: 'Zoom pop' },
    { id: 'drop', label: 'Drop in' },
    { id: 'wave', label: 'Wave' },
    { id: 'burst', label: 'Burst' },
    { id: 'shuffle', label: 'Shuffle' },
];

export const DEFAULT_TRANSITION = 'flip';

export const isTransition = (id) => TRANSITIONS.some((transition) => transition.id === id);

const EASE = [0.22, 1, 0.36, 1];
const EASE_IN = [0.55, 0, 0.75, 0.2];
const BACK_OUT = [0.34, 1.56, 0.64, 1];

// Where each card falls in the running order, from 0 up to `steps - 1`.
const ORDERS = {
    draw: ({ index, count }) => ({ step: index, steps: count }),
    diagonal: ({ row, col, rows, columns }) => ({ step: row + col, steps: rows + columns - 1 }),
    centre: ({ row, col, rows, columns }) => {
        const distance = Math.hypot(row - (rows - 1) / 2, col - (columns - 1) / 2);
        const furthest = Math.hypot((rows - 1) / 2, (columns - 1) / 2) || 1;
        return { step: (distance / furthest) * 10, steps: 11 };
    },
    // Fixed per position, so a reload shuffles the same way.
    shuffled: ({ index, count }) => ({ step: ((index * 7919) % 97) / 97 * count, steps: count }),
};

const STYLES = {
    flip: {
        order: 'draw',
        perspective: true,
        hidden: { opacity: 0, rotateX: -80, y: 36, scale: 0.9 },
        show: { opacity: 1, rotateX: 0, y: 0, scale: 1 },
        leave: { opacity: 0, rotateX: 70, y: -24, scale: 0.94 },
    },
    spin: {
        order: 'draw',
        perspective: true,
        hidden: { opacity: 0, rotateY: -110, scale: 0.92 },
        show: { opacity: 1, rotateY: 0, scale: 1 },
        leave: { opacity: 0, rotateY: 90, scale: 0.92 },
    },
    fade: {
        order: 'draw',
        hidden: { opacity: 0, y: 0, scale: 1 },
        show: { opacity: 1, y: 0, scale: 1 },
        leave: { opacity: 0 },
        duration: 0.9,
    },
    slide: {
        order: 'draw',
        hidden: { opacity: 0, x: '60vw' },
        show: { opacity: 1, x: 0 },
        leave: { opacity: 0, x: '-60vw' },
    },
    zoom: {
        order: 'draw',
        hidden: { opacity: 0, scale: 0.3 },
        show: { opacity: 1, scale: 1 },
        leave: { opacity: 0, scale: 1.2 },
        ease: BACK_OUT,
    },
    drop: {
        order: 'draw',
        hidden: { opacity: 0, y: '-70vh', rotate: -6 },
        show: { opacity: 1, y: 0, rotate: 0 },
        leave: { opacity: 0, y: '40vh', rotate: 4 },
        ease: BACK_OUT,
    },
    wave: {
        order: 'diagonal',
        hidden: { opacity: 0, y: 50, scale: 0.85 },
        show: { opacity: 1, y: 0, scale: 1 },
        leave: { opacity: 0, y: -40, scale: 0.9 },
    },
    burst: {
        order: 'centre',
        hidden: { opacity: 0, scale: 0.2 },
        show: { opacity: 1, scale: 1 },
        leave: { opacity: 0, scale: 0.2 },
        ease: BACK_OUT,
    },
    shuffle: {
        order: 'shuffled',
        hidden: { opacity: 0, scale: 0.6, rotate: -8 },
        show: { opacity: 1, scale: 1, rotate: 0 },
        leave: { opacity: 0, scale: 0.6, rotate: 8 },
    },
};

/**
 * The framer-motion variants for one transition. Each card passes its place
 * as `custom`: { index, count, row, col, rows, columns }.
 */
export function cardVariants(id) {
    const style = STYLES[id] ?? STYLES[DEFAULT_TRANSITION];
    const order = ORDERS[style.order];
    const delayIn = (place) => {
        const { step, steps } = order(place);
        return 0.1 + step * Math.min(0.08, 1 / Math.max(steps, 1));
    };
    const delayOut = (place) => {
        const { step, steps } = order(place);
        return step * Math.min(0.03, 0.4 / Math.max(steps, 1));
    };

    return {
        hidden: style.hidden,
        show: (place) => ({
            ...style.show,
            transition: { duration: style.duration ?? 0.75, delay: delayIn(place), ease: style.ease ?? EASE },
        }),
        leave: (place) => ({
            ...style.leave,
            transition: { duration: 0.35, delay: delayOut(place), ease: EASE_IN },
        }),
    };
}

/** Whether a transition turns cards in 3D, and so needs perspective on the grid. */
export const needsPerspective = (id) => Boolean((STYLES[id] ?? STYLES[DEFAULT_TRANSITION]).perspective);
