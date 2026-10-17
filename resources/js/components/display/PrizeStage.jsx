import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { vh, vw } from './stageUnits';

/**
 * The prize's photo staged like a poster render: no box around it — the
 * picture floats large over a glowing gold floor, light rays turn slowly
 * behind it, a soft reflection lies beneath, and it bobs gently. A cut-out
 * picture (transparent background: a car, a phone) floats bare, as if it
 * stood on the stage. A photo with its own background sits in a glossy,
 * slightly tilted card instead, so its edges still look deliberate.
 */
/**
 * With `spin`, the prize turns round and round on a turntable: the photo
 * (and its reflection) revolves about the vertical axis in perspective.
 */
// How thick a spinning prize is, and how many slices make up its body.
// 3cqh is about a phone's depth next to its height on the wall.
const SLAB_DEPTH = '3cqh';
const SLAB_LAYERS = 16;

export default function PrizeStage({ src: file, alt, height = `min(${vh(46)}, ${vw(58)})`, fill = false, scale = 1, spin = false }) {
    const { cutOut, shown: src, ratio } = useCutOut(file);
    const card = cutOut === false;

    return (
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className={`relative ${fill ? 'h-full w-full' : 'mt-[1cqh] overflow-hidden'}`}
            style={fill ? undefined : { height, width: `min(${vw(94)}, ${vh(150)})` }}
        >
            {/* The operator's size: grown from the floor line. */}
            <div className="relative h-full w-full" style={{ transform: scale === 1 ? undefined : `scale(${scale})`, transformOrigin: '50% 78%' }}>

                {/* Abstract set dressing, deepest layer: angled dark-glass panels with gold
                    hairlines, drifting slowly, and soft gold bokeh floating up behind. */}
                {PANELS.map((panel, index) => (
                    <span
                        key={`panel-${index}`}
                        aria-hidden="true"
                        className="pointer-events-none absolute [animation:prize-drift_var(--d)_ease-in-out_infinite]"
                        style={{
                            left: panel.left,
                            top: panel.top,
                            width: panel.width,
                            height: panel.height,
                            '--d': `${panel.duration}s`,
                            animationDelay: `${panel.delay}s`,
                            transform: `skewX(${panel.skew}deg)`,
                            background: 'linear-gradient(180deg, rgba(255,226,150,0.10), rgba(0,0,0,0.0) 55%, rgba(212,175,55,0.08))',
                            borderLeft: '1px solid rgba(255,226,150,0.45)',
                            borderRight: '1px solid rgba(212,175,55,0.18)',
                            boxShadow: 'inset 1px 0 0 rgba(255,244,210,0.25), 0 0 40px -10px rgba(212,175,55,0.35)',
                            // No backdrop blur: drifting panels would re-blur the whole backdrop every frame.
                            opacity: panel.opacity,
                        }}
                    />
                ))}
                {BOKEH.map((dot, index) => (
                    <span
                        key={`bokeh-${index}`}
                        aria-hidden="true"
                        className="pointer-events-none absolute rounded-full [animation:prize-bokeh_var(--d)_ease-in-out_infinite]"
                        style={{
                            left: dot.x,
                            top: dot.y,
                            width: dot.size,
                            height: dot.size,
                            '--d': `${dot.duration}s`,
                            animationDelay: `${dot.delay}s`,
                            background: 'radial-gradient(circle, rgba(255,232,170,0.55), rgba(212,175,55,0.18) 55%, transparent 72%)',
                            filter: 'blur(2px)',
                            opacity: 0,
                        }}
                    />
                ))}

                {/* Gold rings on the floor around the prize, a dais seen in perspective. */}
                {[
                    { width: '70%', height: '16%', opacity: 0.55 },
                    { width: '88%', height: '22%', opacity: 0.3 },
                    { width: '104%', height: '28%', opacity: 0.16 },
                ].map((ring, index) => (
                    <span
                        key={`ring-${index}`}
                        aria-hidden="true"
                        className="pointer-events-none absolute left-1/2 top-[78%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
                        style={{
                            width: ring.width,
                            height: ring.height,
                            opacity: ring.opacity,
                            border: '1px solid rgba(255,226,150,0.7)',
                            boxShadow: '0 0 12px rgba(212,175,55,0.35), inset 0 0 12px rgba(212,175,55,0.2)',
                            maskImage: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.35) 40%, black 100%)',
                            WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.35) 40%, black 100%)',
                        }}
                    />
                ))}

                {/* The floor: a dark glossy plane with a glowing gold horizon the prize stands on. */}
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-[-6%] top-[78%] h-[60%]"
                    style={{ background: 'linear-gradient(180deg, rgba(212,175,55,0.22), rgba(80,60,20,0.18) 18%, rgba(0,0,0,0.0) 70%)', maskImage: 'radial-gradient(60% 100% at 50% 0%, black 30%, transparent 100%)', WebkitMaskImage: 'radial-gradient(60% 100% at 50% 0%, black 30%, transparent 100%)' }}
                />
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-[78%] h-px w-[70%] -translate-x-1/2"
                    style={{ background: 'linear-gradient(90deg, transparent, rgba(255,232,160,0.9) 30%, rgba(255,244,210,1) 50%, rgba(255,232,160,0.9) 70%, transparent)', boxShadow: '0 0 14px 3px rgba(255,220,120,0.55), 0 0 40px 8px rgba(212,175,55,0.35)' }}
                />
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-[78%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] [animation:prize-floor_4.5s_ease-in-out_infinite]"
                    style={{ width: '56%', height: '14%', background: 'radial-gradient(ellipse at center, rgba(255,232,160,0.7), rgba(212,175,55,0.25) 45%, transparent 72%)', filter: 'blur(8px)' }}
                />

                {/* The spotlight from above: a soft cone of warm light down onto the prize. */}
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 [animation:prize-spot_5s_ease-in-out_infinite]"
                    style={{
                        background: 'conic-gradient(from 158deg at 50% -12%, transparent 0deg, rgba(255,236,170,0.02) 6deg, rgba(255,236,170,0.2) 22deg, rgba(255,236,170,0.02) 38deg, transparent 44deg)',
                        maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.7) 60%, transparent 92%)',
                        WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.7) 60%, transparent 92%)',
                        filter: 'blur(5px)',
                    }}
                />
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ width: '78%', height: '96%', background: 'radial-gradient(closest-side, rgba(255,226,150,0.32), rgba(212,175,55,0.14) 40%, rgba(212,175,55,0.04) 65%, transparent 72%)' }}
                />

                {/* A faint fan of rays turning very slowly behind the prize. */}
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 [animation:prize-rays_90s_linear_infinite]"
                    style={{
                        width: '85%',
                        aspectRatio: '1',
                        background: 'repeating-conic-gradient(from 0deg, rgba(255,226,150,0.0) 0deg, rgba(255,226,150,0.14) 9deg, rgba(255,226,150,0.0) 18deg, rgba(255,226,150,0.0) 30deg)',
                        maskImage: 'radial-gradient(closest-side, black 10%, rgba(0,0,0,0.5) 40%, transparent 70%)',
                        WebkitMaskImage: 'radial-gradient(closest-side, black 10%, rgba(0,0,0,0.5) 40%, transparent 70%)',
                        filter: 'blur(2px)',
                    }}
                />
                {/* Sparks drifting around the prize. */}
                {SPARKS.map((spark, index) => (
                    <span
                        key={index}
                        aria-hidden="true"
                        className="pointer-events-none absolute rounded-full bg-[#ffe9a8] [animation:prize-spark_var(--d)_ease-in-out_infinite]"
                        style={{ left: spark.x, top: spark.y, width: spark.size, height: spark.size, '--d': `${spark.duration}s`, animationDelay: `${spark.delay}s`, boxShadow: '0 0 10px 2px rgba(255,226,150,0.8)', opacity: 0 }}
                    />
                ))}

                {/* The prize, standing on the floor line, and its mirror image in the floor. */}
                <div className="absolute inset-x-0 top-0 flex h-[78%] items-end justify-center" style={spin ? { perspective: '1600px' } : undefined}>
                  <div className={`flex h-full max-w-full items-end justify-center ${spin ? '[animation:prize-spin_9s_linear_infinite]' : ''}`} style={spin ? { transformStyle: 'preserve-3d', backfaceVisibility: 'visible' } : undefined}>
                    {card ? (
                        <div
                            className="relative h-full overflow-hidden rounded-[2.2cqh] border border-gold/50 bg-black/40 [animation:prize-float-card_6s_ease-in-out_infinite]"
                            style={{ aspectRatio: '16 / 10', boxShadow: '0 40px 70px -24px rgba(0,0,0,0.95), 0 0 70px -8px rgba(212,175,55,0.55), 0 0 0 1px rgba(255,244,201,0.25), inset 0 1px 0 rgba(255,244,201,0.45)' }}
                        >
                            <img src={src} alt={alt} className="block h-full w-full object-cover" />
                            <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.28)_0%,rgba(255,255,255,0.06)_28%,transparent_42%,transparent_70%,rgba(212,175,55,0.18)_100%)]" />
                            <span
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0 mix-blend-screen [animation:prize-sheen_5.5s_ease-in-out_infinite]"
                                style={{ background: 'linear-gradient(112deg, transparent 38%, rgba(255,246,214,0.4) 47%, rgba(255,255,255,0.7) 50%, rgba(255,246,214,0.4) 53%, transparent 62%)', backgroundSize: '260% 100%' }}
                            />
                            <Glitter />
                        </div>
                    ) : (
                        <div
                            className="relative h-full max-w-full [animation:prize-float_6s_ease-in-out_infinite]"
                            style={{ aspectRatio: ratio ? `${ratio}` : undefined, opacity: cutOut === null ? 0 : 1, transformStyle: spin ? 'preserve-3d' : undefined }}
                        >
                            {/* Turning, the prize needs a body: darker copies of the photo stacked
                                behind the front face give it the thickness of a phone, so seen
                                side-on it is a slab with an edge, not a sheet of paper. */}
                            {spin && Array.from({ length: SLAB_LAYERS }, (_, index) => (
                                <img
                                    key={index}
                                    src={src}
                                    alt=""
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-0 block h-full w-full object-contain"
                                    style={{
                                        transform: `translateZ(calc(${SLAB_DEPTH} / 2 - ${SLAB_DEPTH} * ${(index + 1) / SLAB_LAYERS}))`,
                                        filter: `brightness(${index === SLAB_LAYERS - 1 ? 0.7 : 0.45}) saturate(0.8)`,
                                    }}
                                />
                            ))}
                            <img
                                src={src}
                                alt={alt}
                                className="relative block h-full w-full object-contain"
                                style={{
                                    transform: spin ? `translateZ(calc(${SLAB_DEPTH} / 2))` : undefined,
                                    filter: 'drop-shadow(0 0 2px rgba(255,236,180,0.55)) drop-shadow(0 0 22px rgba(255,214,120,0.35)) drop-shadow(0 28px 26px rgba(0,0,0,0.8))',
                                }}
                            />
                            {/* A highlight sweeping across the prize's own shape every few seconds. */}
                            <span
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0 mix-blend-screen [animation:prize-sheen_5.5s_ease-in-out_infinite]"
                                style={{
                                    translate: spin ? `0 0 calc(${SLAB_DEPTH} / 2 + 1px)` : undefined,
                                    background: 'linear-gradient(112deg, transparent 38%, rgba(255,246,214,0.55) 47%, rgba(255,255,255,0.9) 50%, rgba(255,246,214,0.55) 53%, transparent 62%)',
                                    backgroundSize: '260% 100%',
                                    maskImage: `url(${src})`,
                                    WebkitMaskImage: `url(${src})`,
                                    maskSize: 'contain',
                                    WebkitMaskSize: 'contain',
                                    maskPosition: 'center',
                                    WebkitMaskPosition: 'center',
                                    maskRepeat: 'no-repeat',
                                    WebkitMaskRepeat: 'no-repeat',
                                }}
                            />
                            <Glitter />
                        </div>
                    )}
                  </div>
                </div>
                {cutOut !== null && (
                    <div
                        className="pointer-events-none absolute inset-x-0 top-[78%] flex h-[22%] items-start justify-center overflow-hidden"
                        aria-hidden="true"
                        style={{
                            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.45) 50%, transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9), rgba(0,0,0,0.45) 50%, transparent 100%)',
                            perspective: spin ? '1600px' : undefined,
                        }}
                    >
                      <div className={`flex h-full max-w-full items-start justify-center ${spin ? '[animation:prize-spin_9s_linear_infinite]' : ''}`} style={spin ? { transformStyle: 'preserve-3d', backfaceVisibility: 'visible' } : undefined}>
                        <img
                            src={src}
                            alt=""
                            className={`block h-[355%] max-w-full object-contain object-bottom ${card ? 'rounded-[2.2cqh] object-cover' : ''}`}
                            style={{
                                aspectRatio: card ? '16 / 10' : undefined,
                                // Mirrored about its top edge, so the underside meets the floor line and the rest hangs beneath.
                                transform: 'translateY(95%) scaleY(-0.95) scaleX(1.02)',
                                transformOrigin: 'top center',
                                opacity: 0.6,
                                filter: 'blur(0.8px) brightness(0.9)',
                            }}
                        />
                      </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

/** Small four-point stars twinkling on the prize, each on its own rhythm. */
function Glitter() {
    return GLITTER.map((star, index) => (
        <span
            key={index}
            aria-hidden="true"
            className="pointer-events-none absolute [animation:prize-glitter_var(--d)_ease-in-out_infinite]"
            style={{
                left: star.x,
                top: star.y,
                width: star.size,
                height: star.size,
                marginLeft: `calc(${star.size} / -2)`,
                marginTop: `calc(${star.size} / -2)`,
                '--d': `${star.duration}s`,
                animationDelay: `${star.delay}s`,
                background: 'radial-gradient(circle, #fff 0%, rgba(255,246,214,0.95) 20%, rgba(255,226,150,0.0) 60%)',
                clipPath: 'polygon(50% 0%, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0% 50%, 42% 42%)',
                opacity: 0,
            }}
        />
    ));
}

// Where the glitter sits on the prize, in % of its picture, and how it twinkles.
const GLITTER = [
    { x: '22%', y: '30%', size: '3.2cqh', duration: 2.8, delay: 0 },
    { x: '63%', y: '22%', size: '4cqh', duration: 3.4, delay: 0.9 },
    { x: '80%', y: '48%', size: '2.6cqh', duration: 2.6, delay: 1.7 },
    { x: '40%', y: '58%', size: '2.2cqh', duration: 3.1, delay: 2.3 },
    { x: '12%', y: '62%', size: '2.4cqh', duration: 3.6, delay: 1.2 },
    { x: '52%', y: '36%', size: '2.8cqh', duration: 2.4, delay: 2.9 },
    { x: '72%', y: '70%', size: '2cqh', duration: 3.3, delay: 0.5 },
];

// The angled glass panels behind the prize, in % of the stage.
const PANELS = [
    { left: '4%', top: '-10%', width: '14%', height: '120%', skew: -18, opacity: 0.7, duration: 14, delay: 0 },
    { left: '20%', top: '-10%', width: '7%', height: '120%', skew: -18, opacity: 0.45, duration: 17, delay: 2 },
    { left: '72%', top: '-10%', width: '12%', height: '120%', skew: 18, opacity: 0.6, duration: 15, delay: 1 },
    { left: '87%', top: '-10%', width: '6%', height: '120%', skew: 18, opacity: 0.4, duration: 19, delay: 3 },
];

// Soft bokeh floating up behind the prize, in % of the stage.
const BOKEH = [
    { x: '8%', y: '70%', size: '4cqh', duration: 12, delay: 0 },
    { x: '18%', y: '40%', size: '2.5cqh', duration: 10, delay: 3 },
    { x: '27%', y: '80%', size: '3cqh', duration: 14, delay: 6 },
    { x: '70%', y: '75%', size: '3.5cqh', duration: 11, delay: 1.5 },
    { x: '82%', y: '45%', size: '2.5cqh', duration: 13, delay: 4.5 },
    { x: '90%', y: '80%', size: '4.5cqh', duration: 15, delay: 7 },
    { x: '48%', y: '85%', size: '2cqh', duration: 12, delay: 2.5 },
];

// Where the sparks sit, in % of the stage, and how they twinkle.
const SPARKS = [
    { x: '14%', y: '30%', size: '0.6cqh', duration: 3.2, delay: 0 },
    { x: '22%', y: '62%', size: '0.4cqh', duration: 4.1, delay: 1.1 },
    { x: '31%', y: '18%', size: '0.5cqh', duration: 3.7, delay: 2.2 },
    { x: '68%', y: '22%', size: '0.55cqh', duration: 3.4, delay: 0.6 },
    { x: '78%', y: '56%', size: '0.4cqh', duration: 4.4, delay: 1.8 },
    { x: '86%', y: '34%', size: '0.6cqh', duration: 3.9, delay: 2.9 },
    { x: '50%', y: '8%', size: '0.45cqh', duration: 4.8, delay: 1.4 },
    { x: '40%', y: '78%', size: '0.35cqh', duration: 3.1, delay: 2.5 },
    { x: '60%', y: '72%', size: '0.35cqh', duration: 3.6, delay: 0.3 },
];

/**
 * Looks at a picture once it loads: whether its background is see-through
 * (its corners are checked), and — for a cut-out — the picture trimmed to
 * what is actually drawn, so a car saved with wide empty margins still
 * fills the stage. `cutOut` is null until known; a picture that cannot be
 * read counts as a photo with a background and is shown as it is.
 */
function useCutOut(src) {
    const [state, setState] = useState({ cutOut: null, shown: src, ratio: null });

    useEffect(() => {
        let live = true;
        setState({ cutOut: null, shown: src, ratio: null });
        if (!src) return undefined;
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            if (!live) return;
            try {
                const w = image.naturalWidth;
                const h = image.naturalHeight;
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                context.drawImage(image, 0, 0);
                const data = context.getImageData(0, 0, w, h).data;
                const alphaAt = (x, y) => data[(y * w + x) * 4 + 3];
                const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1]];
                const cutOut = corners.filter(([x, y]) => alphaAt(x, y) < 40).length >= 4;
                if (!cutOut) {
                    setState({ cutOut: false, shown: src, ratio: w / h });
                    return;
                }
                // The drawn part's bounding box, sampled on a coarse grid for speed.
                const step = Math.max(1, Math.floor(Math.min(w, h) / 400));
                let top = h, bottom = -1, left = w, right = -1;
                for (let y = 0; y < h; y += step) {
                    for (let x = 0; x < w; x += step) {
                        if (alphaAt(x, y) > 24) {
                            if (y < top) top = y;
                            if (y > bottom) bottom = y;
                            if (x < left) left = x;
                            if (x > right) right = x;
                        }
                    }
                }
                if (bottom < 0) {
                    setState({ cutOut: true, shown: src, ratio: w / h });
                    return;
                }
                const pad = Math.round(Math.max(w, h) * 0.02);
                left = Math.max(0, left - pad); top = Math.max(0, top - pad);
                right = Math.min(w - 1, right + pad); bottom = Math.min(h - 1, bottom + pad);
                const cw = right - left + 1;
                const ch = bottom - top + 1;
                // Already tight: the file is used as it is.
                if (cw > w * 0.92 && ch > h * 0.92) {
                    setState({ cutOut: true, shown: src, ratio: w / h });
                    return;
                }
                const trimmed = document.createElement('canvas');
                trimmed.width = cw;
                trimmed.height = ch;
                trimmed.getContext('2d').drawImage(image, left, top, cw, ch, 0, 0, cw, ch);
                setState({ cutOut: true, shown: trimmed.toDataURL('image/png'), ratio: cw / ch });
            } catch {
                setState({ cutOut: false, shown: src, ratio: null });
            }
        };
        image.onerror = () => { if (live) setState({ cutOut: false, shown: src, ratio: null }); };
        image.src = src;
        return () => { live = false; };
    }, [src]);

    return state;
}
