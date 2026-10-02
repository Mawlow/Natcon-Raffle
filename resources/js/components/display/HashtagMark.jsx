import { motion } from 'framer-motion';

export const HASHTAG_IMAGE = '/images/lrnatcon-2026.png';

/**
 * The #LRNATCON2026 hashtag along the bottom of every display — centred, or
 * in the bottom-left corner with `align="left"`. It sits
 * in the layout rather than over it, so the content above makes room for it
 * and it never covers a name. `units` is 'vw' on the full-window screens and
 * 'cq' inside a 12×7 LED panel, which is sized with container units.
 *
 * It rises in with the screen, then floats gently while a band of gold light
 * sweeps across the lettering every few seconds. The sweep is masked to the
 * logo's own shape, and everything moves by transform and opacity only, so
 * it costs the wall nothing (see .hashtag-* in app.css).
 */
export default function HashtagMark({ units = 'vw', align = 'center' }) {
    const width = units === 'cq' ? 'min(40cqw, 62cqh)' : 'clamp(13rem, min(32vw, 52vh), 40rem)';
    const gap = units === 'cq' ? '1.5cqh' : 'clamp(0.35rem, 1vh, 0.75rem)';

    return (
        <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1.2, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className={`relative z-10 shrink-0 ${align === 'left' ? 'self-start' : ''}`}
            style={{
                width,
                marginTop: gap,
                marginBottom: units === 'cq' ? 0 : gap,
                marginLeft: align === 'left' ? (units === 'cq' ? '3cqw' : 'clamp(1rem, 3vw, 3.5rem)') : undefined,
            }}
        >
            <div className="hashtag-float relative">
                {/* A soft pool of gold light under the logo, breathing slowly. */}
                <span className="hashtag-glow pointer-events-none absolute inset-x-[8%] -inset-y-[35%] -z-10 rounded-[50%]" aria-hidden="true" />

                <img src={HASHTAG_IMAGE} alt="#LRNATCON2026" className="block h-auto w-full drop-shadow-[0_4px_18px_rgba(0,0,0,0.6)]" />

                {/* The light sweep, cut to the shape of the lettering. */}
                <span
                    className="pointer-events-none absolute inset-0 overflow-hidden"
                    style={{
                        WebkitMaskImage: `url(${HASHTAG_IMAGE})`,
                        maskImage: `url(${HASHTAG_IMAGE})`,
                        WebkitMaskSize: '100% 100%',
                        maskSize: '100% 100%',
                    }}
                    aria-hidden="true"
                >
                    <span className="hashtag-sheen absolute inset-y-0 left-0 w-[35%]" />
                </span>
            </div>
        </motion.div>
    );
}
