import { motion } from 'framer-motion';
import { formatPrizeValue } from '../../lib/format';
import { Diamond, EVENT, EVENT_LOGO } from '../landing/EventScene';
import { vh, vw } from './stageUnits';
import StageLogo from './StageLogo';

/**
 * The masthead of the one-screen setup, where a single screen carries
 * everything the three-screen setup spreads over its sub screens: the NATCON
 * logo with the company logos, the raffle title and the prize. `sizes` is the
 * operator's logo sizing from the Control Center (see lib/logoSizes).
 */
export default function SingleScreenHeader({ raffle, sizes = { event: 1, company: 1 } }) {
    const companies = raffle.logos ?? [];
    const prizeValue = formatPrizeValue(raffle.prize_value, raffle.prize_currency);

    return (
        <div
            className="relative z-10 flex w-full flex-col items-center text-center"
            style={{ paddingInline: `clamp(1rem,${vw(4)},4rem)`, paddingTop: `clamp(1rem,${vh(3)},2.25rem)` }}
        >
            <LogoStrip logos={companies} sizes={sizes} />

            <motion.div
                initial={{ opacity: 0, scaleX: 0.4 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 1.1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="lux-ornament"
                style={{ marginTop: `clamp(0.5rem,${vh(1.6)},1.25rem)`, width: `min(30rem,${vw(78)})` }}
                aria-hidden="true"
            >
                <Diamond />
                <span className="font-lux text-[0.62rem] font-semibold uppercase tracking-[0.5em] text-gold/80 sm:text-xs">
                    Raffle Draw
                </span>
                <Diamond />
            </motion.div>

            <motion.h1
                initial={{ opacity: 0, y: 14, letterSpacing: '0.24em' }}
                animate={{ opacity: 1, y: 0, letterSpacing: '0.1em' }}
                transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="lux-foil text-balance pl-[0.1em] font-lux font-semibold uppercase leading-[1.05]"
                style={{
                    marginTop: `clamp(0.35rem,${vh(1.2)},0.9rem)`,
                    maxWidth: `min(70rem,${vw(92)})`,
                    fontSize: `clamp(2rem,min(${vw(5.8)},${vh(9)}),5.5rem)`,
                }}
            >
                {raffle.name}
            </motion.h1>

            {/* The prize in a glowing gold frame that breathes gently. */}
            <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.9, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="relative"
                style={{ marginTop: `clamp(0.5rem,${vh(1.4)},1rem)` }}
            >
                <motion.span
                    aria-hidden="true"
                    animate={{ opacity: [0.55, 1, 0.55] }}
                    transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="pointer-events-none absolute -inset-3 rounded-full bg-[radial-gradient(closest-side,rgba(212,175,55,0.24),rgba(212,175,55,0.08)_60%,transparent)] [will-change:opacity]"
                />
                <div
                    className="relative flex flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-full border border-gold/50 bg-gradient-to-b from-gold/[0.14] to-black/70 shadow-[0_0_0_1px_rgba(212,175,55,0.12),0_10px_40px_-10px_rgba(212,175,55,0.55),inset_0_1px_0_rgba(255,244,201,0.25)]"
                    style={{ paddingInline: `clamp(1.5rem,${vw(3.6)},3.5rem)`, paddingBlock: `clamp(0.45rem,${vh(1.4)},1rem)` }}
                >
                    {raffle.prize_type === 'item' ? (
                        <>
                            <p className="prize-gradient pl-[0.12em] font-lux font-bold uppercase leading-tight tracking-[0.12em]" style={{ fontSize: `clamp(1.7rem,min(${vw(4)},${vh(6.4)}),3.5rem)` }}>
                                {raffle.prize_name}
                            </p>
                            {prizeValue && (
                                <p className="font-script font-semibold italic leading-tight prize-gradient" style={{ fontSize: `clamp(1.4rem,min(${vw(3)},${vh(5.1)}),2.6rem)` }}>
                                    worth {prizeValue}
                                </p>
                            )}
                        </>
                    ) : (
                        <>
                            {prizeValue && (
                                <>
                                    <p className="prize-gradient pl-[0.14em] font-lux font-bold uppercase leading-tight tracking-[0.14em]" style={{ fontSize: `clamp(1.7rem,min(${vw(4)},${vh(6.4)}),3.5rem)` }}>
                                        {prizeValue}
                                    </p>
                                    <span className="block size-[8px] rotate-45 bg-gold shadow-[0_0_10px_rgba(212,175,55,0.8)]" aria-hidden="true" />
                                </>
                            )}
                            <p className="font-script font-semibold italic leading-tight tracking-[0.03em] prize-gradient" style={{ fontSize: `clamp(1.9rem,min(${vw(4.3)},${vh(7)}),3.7rem)` }}>
                                {raffle.prize_name}
                            </p>
                        </>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

/**
 * NATCON, then a gold hairline, then every company logo — each in the
 * same-size see-through box. The winners-only display after the draw shows
 * this strip on its own.
 */
export function LogoStrip({ logos: companies = [], sizes = { event: 1, company: 1 } }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-wrap items-center justify-center gap-y-2"
            style={{ maxWidth: vw(94), columnGap: `clamp(0.75rem,${vw(2)},2rem)` }}
        >
            <LogoBox src={EVENT_LOGO} alt={EVENT.name} event solo={companies.length === 0} scale={sizes.event} />
            {companies.length > 0 && (
                <span
                    className="w-px shrink-0 bg-gradient-to-b from-transparent via-gold/70 to-transparent"
                    style={{ height: `calc(clamp(3rem,${vh(9)},6rem) * ${Math.max(sizes.event, sizes.company)})` }}
                    aria-hidden="true"
                />
            )}
            {companies.map((logo) => (
                <LogoBox key={logo.id} src={logo.path} alt={logo.label} tone={logo.tone} stageSrc={logo.stage_path} small={companies.length > 4} scale={sizes.company} />
            ))}
        </motion.div>
    );
}

/**
 * One logo in a see-through box. Company logos share one size so each takes
 * the same space; the NATCON logo (`event`) is set larger, and larger still
 * when it stands alone (`solo`). `scale` is the operator's sizing on top.
 */
function LogoBox({ src, alt, tone, stageSrc, event = false, solo = false, small = false, scale = 1 }) {
    const height = event
        ? (solo ? `clamp(8.5rem,${vh(25)},15rem)` : `clamp(6.5rem,${vh(20)},12.5rem)`)
        : small ? `clamp(2.5rem,${vh(7)},4.5rem)` : `clamp(3.25rem,${vh(10)},6.5rem)`;

    return (
        <div className="grid shrink-0 place-items-center" style={{ height: `calc(${height} * ${scale})`, aspectRatio: '2.2 / 1', maxWidth: vw(94) }}>
            <StageLogo src={src} alt={alt} tone={tone} stageSrc={stageSrc} measure={!event} />
        </div>
    );
}
