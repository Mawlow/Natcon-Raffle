import { motion } from 'framer-motion';
import { EVENT, EVENT_LOGO } from '../landing/EventScene';
import { vh, vw } from './stageUnits';
import StageLogo from './StageLogo';
import WinnersTitle from './WinnersTitle';

/**
 * The masthead of the winners-only display: NATCON and the company logos in
 * one row across the top — NATCON, a gold hairline, then the companies — with
 * "[prize] Winners!" beneath them and the winners below that. The more
 * companies, the smaller each one. When the raffle has corner logos
 * (`left` / `right`), those take the top corners with NATCON between them
 * instead. `sizes` is the operator's logo sizing from the Control Center
 * (see lib/logoSizes); this screen's NATCON uses its own `congrats` size.
 */
export default function ShowcaseHeader({ logos: companies = [], left: cornerLeft = null, right: cornerRight = null, sizes = { event: 1, company: 1, congrats: 1, corner: 1 }, prize = null, count = null, set = null }) {
    if (cornerLeft || cornerRight) {
        return <CornerHeader left={cornerLeft} right={cornerRight} sizes={sizes} prize={prize} count={count} set={set} />;
    }

    const event = { id: 'natcon', path: EVENT_LOGO, label: EVENT.name, event: true };
    const companyHeight = companies.length > 4 ? `clamp(2.5rem,${vh(7)},4.5rem)` : `clamp(3rem,${vh(10)},6.5rem)`;

    return (
        <div className="relative z-10 flex w-full flex-col items-center text-center" style={{ paddingTop: `clamp(0.75rem,${vh(2.5)},2rem)` }}>
            <div
                className="flex flex-wrap items-center justify-center"
                style={{ maxWidth: vw(94), gap: `clamp(0.35rem,${vh(1.2)},0.9rem) clamp(0.75rem,${vw(2)},2rem)` }}
            >
                <Logo logo={event} height={`clamp(4rem,${vh(13)},9rem)`} scale={sizes.congrats ?? 1} maxWidth={vw(60)} index={0} />
                {companies.length > 0 && (
                    <span
                        className="w-px shrink-0 bg-gradient-to-b from-transparent via-gold/70 to-transparent"
                        style={{ height: `calc(clamp(3rem,${vh(10)},6.5rem) * ${Math.max(1, Math.min(sizes.congrats ?? 1, sizes.company))})` }}
                        aria-hidden="true"
                    />
                )}
                {companies.map((logo, index) => (
                    <Logo key={logo.id} logo={{ ...logo, event: false }} height={companyHeight} scale={sizes.company} maxWidth={vw(60)} index={index + 1} />
                ))}
            </div>
            <div style={{ marginTop: `clamp(0.25rem,${vh(1)},0.75rem)` }}>
                <WinnersTitle prize={prize} count={count} set={set} size={`clamp(1.3rem,min(${vw(3.6)},${vh(6.8)}),3.6rem)`} />
            </div>
        </div>
    );
}

/**
 * The layout once the raffle has corner logos: one logo top left, NATCON top
 * centre, one logo top right, and "[prize] Winners" on its own row beneath
 * them, across the full width. Keeping the wide heading out of the logos'
 * row leaves each corner most of its half of the screen, so the operator's
 * corner size has room to grow. An empty corner keeps its space so NATCON
 * stays centred.
 */
function CornerHeader({ left, right, sizes, prize, count, set }) {
    return (
        <div
            className="relative z-10 w-full"
            style={{
                paddingInline: `clamp(1rem,${vw(3)},3.5rem)`,
                paddingTop: `clamp(0.75rem,${vh(2.5)},2rem)`,
            }}
        >
            <CornerLogoRow left={left} right={right} sizes={sizes} />
            <div className="flex justify-center" style={{ marginTop: `clamp(0.25rem,${vh(1)},0.75rem)` }}>
                <WinnersTitle prize={prize} count={count} set={set} size={`clamp(1.3rem,min(${vw(3.6)},${vh(6.8)}),3.6rem)`} />
            </div>
        </div>
    );
}

/**
 * One logo top left, NATCON top centre, one logo top right, across the full
 * width, at the Congratulations screen's own sizes. The draw screens use the
 * same row, so the logos sit in the same places from Get Ready to the winners.
 * An empty corner keeps its space so NATCON stays centred.
 */
export function CornerLogoRow({ left, right, sizes = {} }) {
    const event = { id: 'natcon', path: EVENT_LOGO, label: EVENT.name, event: true };
    const corner = `clamp(3.5rem,${vh(12)},8rem)`;
    // Each corner has its own size, so a tall logo on one side can be smaller.
    const leftScale = sizes.cornerLeft ?? sizes.corner ?? 1;
    const rightScale = sizes.cornerRight ?? sizes.corner ?? 1;
    // And its own margin from its edge of the screen, in % of the screen's width.
    const leftMargin = sizes.cornerLeftMargin ?? 0;
    const rightMargin = sizes.cornerRightMargin ?? 0;

    return (
        <div
            className="grid w-full items-center"
            style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', columnGap: `clamp(0.75rem,${vw(2.5)},3rem)` }}
        >
            <div className="flex min-w-0 justify-start" style={{ paddingLeft: vw(leftMargin) }}>
                {left && <CornerLogo logo={left} height={corner} scale={leftScale} index={1} />}
            </div>
            <Logo logo={event} height={`clamp(4rem,${vh(13)},9rem)`} scale={sizes.congrats ?? 1} index={0} />
            <div className="flex min-w-0 justify-end" style={{ paddingRight: vw(rightMargin) }}>
                {right && <CornerLogo logo={right} height={corner} scale={rightScale} index={2} />}
            </div>
        </div>
    );
}

/**
 * A corner logo, sized by its width so a bigger size grows it evenly; once it
 * fills its side of the screen it stops there rather than stretching taller.
 */
function CornerLogo({ logo, height, scale, index }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1, delay: Math.min(index * 0.08, 0.8), ease: [0.22, 1, 0.36, 1] }}
            className="grid min-w-0 place-items-center"
            style={{ width: `calc(${height} * 2.2 * ${scale})`, maxWidth: '100%', aspectRatio: '2.2 / 1' }}
        >
            <StageLogo src={logo.path} alt={logo.label} tone={logo.tone} stageSrc={logo.stage_path} measure />
        </motion.div>
    );
}

function Logo({ logo, height, scale = 1, maxWidth = vw(40), index }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1, delay: Math.min(index * 0.08, 0.8), ease: [0.22, 1, 0.36, 1] }}
            className="grid min-w-0 shrink place-items-center"
            style={{ height: `calc(${height} * ${scale})`, aspectRatio: '2.2 / 1', maxWidth }}
        >
            <StageLogo src={logo.path} alt={logo.label} tone={logo.tone} stageSrc={logo.stage_path} measure={!logo.event} />
        </motion.div>
    );
}
