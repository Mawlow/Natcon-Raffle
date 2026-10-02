import { motion, useReducedMotion } from 'framer-motion';

/**
 * Theatre drapes in the two top corners of the landing page.
 *
 * Each panel is a fan of ribbons that taper as they fall, which is what gives
 * the impression of gathered fabric; the gradients run dark at the folds and
 * gold where the light would catch. The two sides sway on different cycles so
 * they never look like one looping animation, and a mask dissolves the bottom
 * edge into the page rather than cutting it off.
 */

const WIDTH = 420;
const HEIGHT = 900;
/** How far the fabric gathers inward by the time it reaches the bottom. */
const TAPER = 0.24;
const RIBBONS = 7;

function ribbonPath(index) {
    const step = WIDTH / RIBBONS;
    const topLeft = index * step;
    const topRight = topLeft + step;
    const bottomLeft = topLeft * TAPER;
    const bottomRight = topRight * TAPER;

    // Each edge bows outward slightly on the way down, like hanging cloth.
    return [
        `M ${topLeft} 0`,
        `H ${topRight}`,
        `C ${topRight + 14} ${HEIGHT * 0.34}, ${bottomRight + 26} ${HEIGHT * 0.66}, ${bottomRight} ${HEIGHT}`,
        `H ${bottomLeft}`,
        `C ${bottomLeft + 26} ${HEIGHT * 0.66}, ${topLeft + 14} ${HEIGHT * 0.34}, ${topLeft} 0`,
        'Z',
    ].join(' ');
}

function Panel({ side }) {
    const reduced = useReducedMotion();
    const isLeft = side === 'left';
    const id = `drape-${side}`;

    const sway = reduced
        ? {}
        : {
            // Deliberately different periods per side — in lockstep it reads as
            // a video loop rather than fabric.
            animate: {
                skewX: isLeft ? [0, 0.9, -0.4, 0] : [0, -0.9, 0.4, 0],
                scaleX: [1, 1.025, 0.995, 1],
                x: isLeft ? [0, 5, -2, 0] : [0, -5, 2, 0],
            },
            transition: {
                duration: isLeft ? 13 : 16,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: isLeft ? 0 : 1.6,
            },
        };

    return (
        <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio={isLeft ? 'xMinYMin slice' : 'xMaxYMin slice'}
            className={`absolute top-0 h-[min(46vh,60rem)] w-[min(30vw,26rem)] opacity-50 sm:h-[min(78vh,60rem)] sm:w-[min(34vw,26rem)] sm:opacity-100 ${isLeft ? 'left-0' : 'right-0 -scale-x-100'}`}
            style={{
                maskImage: 'linear-gradient(to bottom, black 0%, black 42%, transparent 88%)',
                WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 42%, transparent 88%)',
            }}
            aria-hidden="true"
        >
            <defs>
                {/* Folds: gold where the light catches, near-black in the creases. */}
                <linearGradient id={`${id}-lit`} x1="0" y1="0" x2="0.35" y2="1">
                    <stop offset="0%" stopColor="#d4af37" stopOpacity="0.30" />
                    <stop offset="45%" stopColor="#8a6f1f" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#050505" stopOpacity="0" />
                </linearGradient>
                <linearGradient id={`${id}-crease`} x1="0" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stopColor="#1a1305" stopOpacity="0.85" />
                    <stop offset="55%" stopColor="#0b0902" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#050505" stopOpacity="0" />
                </linearGradient>
                {/* The rail shadow across the very top. */}
                <linearGradient id={`${id}-rail`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#050505" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#050505" stopOpacity="0" />
                </linearGradient>
            </defs>

            <motion.g style={{ originX: 0, originY: 0 }} {...sway}>
                {Array.from({ length: RIBBONS }, (_, index) => (
                    <path
                        key={index}
                        d={ribbonPath(index)}
                        fill={`url(#${id}-${index % 2 === 0 ? 'lit' : 'crease'})`}
                    />
                ))}

                {/* Thin highlights along the fold lines. */}
                {Array.from({ length: RIBBONS - 1 }, (_, index) => {
                    const step = WIDTH / RIBBONS;
                    const top = (index + 1) * step;
                    const bottom = top * TAPER;

                    return (
                        <path
                            key={`edge-${index}`}
                            d={`M ${top} 0 C ${top + 14} ${HEIGHT * 0.34}, ${bottom + 26} ${HEIGHT * 0.66}, ${bottom} ${HEIGHT}`}
                            stroke="#d4af37"
                            strokeOpacity={index % 2 === 0 ? 0.16 : 0.07}
                            strokeWidth="1.5"
                            fill="none"
                        />
                    );
                })}

                <rect x="0" y="0" width={WIDTH} height="46" fill={`url(#${id}-rail)`} />
            </motion.g>
        </svg>
    );
}

export default function CurtainDrapes() {
    return (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[min(46vh,60rem)] overflow-hidden sm:h-[min(78vh,60rem)]" aria-hidden="true">
            <Panel side="left" />
            <Panel side="right" />
        </div>
    );
}
