import { motion } from 'framer-motion';
import { DISPLAY_TITLE, cashPrizeText, formatPrizeValue } from '../../lib/format';
import { Diamond, EVENT, EVENT_LOGO } from '../landing/EventScene';
import { vh, vw } from './stageUnits';
import StageLogo from './StageLogo';
import { CornerLogoRow } from './ShowcaseHeader';

/**
 * The masthead of the one-screen setup, where a single screen carries
 * everything the three-screen setup spreads over its sub screens: the NATCON
 * logo with the company logos, the raffle title and the prize. `sizes` is the
 * operator's logo sizing from the Control Center (see lib/logoSizes).
 */
export default function SingleScreenHeader({ raffle, sizes = { event: 1, company: 1 }, title = true }) {
    const companies = raffle.logos ?? [];
    // With corner logos, the top is laid out as on the winners page — one
    // logo top left, NATCON in the middle, one top right — from Get Ready on.
    const corners = Boolean(raffle.logo_left || raffle.logo_right);
    const prizeValue = formatPrizeValue(raffle.prize_value, raffle.prize_currency);

    return (
        <div
            className="relative z-10 flex w-full flex-col items-center text-center"
            style={corners
                ? { paddingInline: `clamp(1rem,${vw(3)},3.5rem)`, paddingTop: `clamp(0.75rem,${vh(2.5)},2rem)` }
                : { paddingInline: `clamp(1rem,${vw(4)},4rem)`, paddingTop: `clamp(1rem,${vh(3)},2.25rem)` }}
        >
            {corners ? (
                <>
                    <CornerLogoRow left={raffle.logo_left} right={raffle.logo_right} sizes={sizes} />
                    {/* Any other company logos, in a row of their own beneath. */}
                    {companies.length > 0 && <CompanyRow logos={companies} sizes={sizes} />}
                </>
            ) : (
                <LogoStrip logos={companies} sizes={sizes} />
            )}

            {/* The "Raffle Draw" ornament and the title; the Prize Display leaves them out. */}
            {title && <motion.div
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
            </motion.div>}

            {title && <motion.h1
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
                {DISPLAY_TITLE}
            </motion.h1>}

            {/* The prize — once it is set — as ivory plate lettering between
                gold chevrons over a twin rule, the same marquee as the Prize
                Display, with its photo beside it when one is saved. */}
            {raffle.prize_name && (
                <div
                    className="relative flex items-center justify-center"
                    style={{ marginTop: `clamp(0.5rem,${vh(1.4)},1rem)`, columnGap: `clamp(0.9rem,${vw(2.2)},2.2rem)` }}
                >
                    {raffle.prize_image && <PrizePhoto src={raffle.prize_image} alt={raffle.prize_name} />}
                    <PrizeMarquee
                        name={raffle.prize_type === 'item' ? raffle.prize_name : (cashPrizeText(raffle.prize_value, raffle.prize_currency) ?? raffle.prize_name)}
                        value={raffle.prize_type === 'item' ? prizeValue : null}
                    />
                </div>
            )}
        </div>
    );
}

/**
 * The prize as marquee lettering on the one-screen setup: ivory plate
 * lettering edged in gold between a pair of gold chevrons, a soft pool of
 * light behind, a twin rule with a diamond clasp beneath and the value (if
 * any) in script. The Prize Display's BarePrize, sized in stage units.
 */
export function PrizeMarquee({ name, value }) {
    const ease = [0.22, 1, 0.36, 1];

    return (
        <div className="relative flex min-w-0 flex-col items-center">
            <div className="relative flex items-center justify-center" style={{ columnGap: `clamp(0.5rem,${vw(1.2)},1.2rem)` }}>
                <motion.span
                    aria-hidden="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.5, 0.85, 0.5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
                    className="pointer-events-none absolute left-1/2 top-1/2 h-[200%] w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-[radial-gradient(closest-side,rgba(212,175,55,0.22),rgba(212,175,55,0.06)_55%,transparent)] [will-change:opacity]"
                />
                <Chevrons side="left" delay={0.75} ease={ease} />
                <motion.p
                    initial={{ opacity: 0, scale: 0.86, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 1.2, delay: 0.5, ease }}
                    className="prize-ivory relative text-balance pl-[0.06em] text-center font-lux font-black uppercase leading-[1.02] tracking-[0.05em]"
                    style={{ fontSize: `clamp(1.9rem,min(${vw(4.6)},${vh(7.4)}),4rem)`, maxWidth: `min(60rem,${vw(68)})` }}
                >
                    {name}
                </motion.p>
                <Chevrons side="right" delay={0.75} ease={ease} />
            </div>

            <motion.div
                aria-hidden="true"
                initial={{ opacity: 0, scaleX: 0.3 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 1.2, delay: 0.9, ease }}
                className="relative flex w-full flex-col items-center"
                style={{ marginTop: `clamp(0.35rem,${vh(1)},0.7rem)`, rowGap: `clamp(0.15rem,${vh(0.4)},0.3rem)`, maxWidth: `min(34rem,${vw(40)})` }}
            >
                <span className="h-px w-full bg-gradient-to-r from-transparent via-gold/70 to-transparent" />
                <span
                    className="rounded-full"
                    style={{
                        height: `clamp(2px,${vh(0.3)},4px)`,
                        width: '42%',
                        background: 'linear-gradient(90deg, transparent, rgba(245,215,110,0.9) 25%, rgba(255,250,235,1) 50%, rgba(245,215,110,0.9) 75%, transparent)',
                        boxShadow: '0 0 12px 2px rgba(255,225,140,0.5), 0 0 30px 6px rgba(212,175,55,0.25)',
                    }}
                />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-gold-bright bg-black shadow-[0_0_12px_rgba(255,232,160,0.8)]" style={{ width: `clamp(7px,${vw(0.7)},11px)`, height: `clamp(7px,${vw(0.7)},11px)` }}>
                    <span className="absolute inset-[22%] bg-gold-bright" />
                </span>
            </motion.div>

            {value && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 1.1 }}
                    className="prize-gradient font-script font-semibold italic leading-tight"
                    style={{ marginTop: `clamp(0.3rem,${vh(0.9)},0.6rem)`, fontSize: `clamp(1.3rem,min(${vw(2.8)},${vh(4.8)}),2.4rem)` }}
                >
                    worth {value}
                </motion.p>
            )}
        </div>
    );
}

/** A pair of gold chevrons bracketing the prize, the outer one fainter. */
function Chevrons({ side, delay, ease }) {
    const left = side === 'left';
    const marks = left ? ['‹', '‹'] : ['›', '›'];

    return (
        <motion.span
            aria-hidden="true"
            initial={{ opacity: 0, x: left ? '0.6em' : '-0.6em' }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay, ease }}
            className="flex shrink-0 select-none items-center font-script font-medium leading-none text-gold"
            style={{ fontSize: `clamp(1.6rem,min(${vw(3.8)},${vh(6.2)}),3.4rem)`, gap: '0.05em', filter: 'drop-shadow(0 0 10px rgba(212,175,55,0.6))' }}
        >
            <span className={left ? 'opacity-45' : ''}>{marks[0]}</span>
            <span className={left ? '' : 'opacity-45'}>{marks[1]}</span>
        </motion.span>
    );
}

/**
 * The prize's photo in a gold-edged tile with a soft glow, kept whole
 * (never cropped) and sized to the screen, so a car is seen in full.
 */
export function PrizePhoto({ src, alt }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative shrink-0 overflow-hidden rounded-[1.6rem] border border-gold/60 bg-black/60 shadow-[0_0_0_1px_rgba(212,175,55,0.25),0_14px_40px_-12px_rgba(0,0,0,0.9),0_0_30px_-6px_rgba(212,175,55,0.45)]"
            style={{ height: `clamp(5rem,${vh(21)},13rem)`, aspectRatio: '16 / 10' }}
        >
            <img src={src} alt={alt} className="block h-full w-full object-contain" style={{ padding: `clamp(0.2rem,${vh(0.6)},0.45rem)` }} />
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[1.6rem] bg-[linear-gradient(180deg,rgba(255,244,201,0.12),transparent_40%,transparent_75%,rgba(212,175,55,0.1))]" />
        </motion.div>
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
                <LogoBox key={logo.id} src={logo.path} alt={logo.label} tone={logo.tone} stageSrc={logo.stage_path} outline={logo.outline} small={companies.length > 4} scale={sizes.company} />
            ))}
        </motion.div>
    );
}

/** The company logos alone, beneath the corner logos. */
export function CompanyRow({ logos, sizes }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="mt-[clamp(0.25rem,1vh,0.75rem)] flex flex-wrap items-center justify-center gap-y-2"
            style={{ maxWidth: vw(94), columnGap: `clamp(0.75rem,${vw(2)},2rem)` }}
        >
            {logos.map((logo) => (
                <LogoBox key={logo.id} src={logo.path} alt={logo.label} tone={logo.tone} stageSrc={logo.stage_path} outline={logo.outline} small scale={sizes.company} />
            ))}
        </motion.div>
    );
}

/**
 * One logo in a see-through box. Company logos share one size so each takes
 * the same space; the NATCON logo (`event`) is set larger, and larger still
 * when it stands alone (`solo`). `scale` is the operator's sizing on top.
 */
function LogoBox({ src, alt, tone, stageSrc, outline = false, event = false, solo = false, small = false, scale = 1 }) {
    const height = event
        ? (solo ? `clamp(8.5rem,${vh(25)},15rem)` : `clamp(6.5rem,${vh(20)},12.5rem)`)
        : small ? `clamp(2.5rem,${vh(7)},4.5rem)` : `clamp(3.25rem,${vh(10)},6.5rem)`;

    return (
        <div className="grid shrink-0 place-items-center" style={{ height: `calc(${height} * ${scale})`, aspectRatio: '2.2 / 1', maxWidth: vw(94) }}>
            <StageLogo src={src} alt={alt} tone={tone} stageSrc={stageSrc} outline={outline} measure={!event} />
        </div>
    );
}
