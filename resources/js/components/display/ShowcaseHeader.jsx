import { motion } from 'framer-motion';
import { EVENT, EVENT_LOGO } from '../landing/EventScene';
import { vh, vw } from './stageUnits';
import StageLogo from './StageLogo';

/**
 * The masthead of the winners-only display: NATCON and the company logos in
 * one row across the top — NATCON, a gold hairline, then the companies — with
 * "Congratulations" beneath them and the winners below that. The more
 * companies, the smaller each one. When the raffle has corner logos
 * (`left` / `right`), those take the top corners with NATCON between them
 * instead. `sizes` is the operator's logo sizing from the Control Center
 * (see lib/logoSizes).
 */
export default function ShowcaseHeader({ logos: companies = [], left: cornerLeft = null, right: cornerRight = null, sizes = { event: 1, company: 1 } }) {
    if (cornerLeft || cornerRight) {
        return <CornerHeader left={cornerLeft} right={cornerRight} sizes={sizes} />;
    }

    const event = { id: 'natcon', path: EVENT_LOGO, label: EVENT.name, event: true };
    const companyHeight = companies.length > 4 ? `clamp(2.5rem,${vh(7)},4.5rem)` : `clamp(3rem,${vh(10)},6.5rem)`;

    return (
        <div className="relative z-10 flex w-full flex-col items-center text-center" style={{ paddingTop: `clamp(0.75rem,${vh(2.5)},2rem)` }}>
            <div
                className="flex flex-wrap items-center justify-center"
                style={{ maxWidth: vw(94), gap: `clamp(0.35rem,${vh(1.2)},0.9rem) clamp(0.75rem,${vw(2)},2rem)` }}
            >
                <Logo logo={event} height={`clamp(4rem,${vh(13)},9rem)`} scale={sizes.event} maxWidth={vw(60)} index={0} />
                {companies.length > 0 && (
                    <span
                        className="w-px shrink-0 bg-gradient-to-b from-transparent via-gold/70 to-transparent"
                        style={{ height: `calc(clamp(3rem,${vh(10)},6.5rem) * ${Math.max(1, Math.min(sizes.event, sizes.company))})` }}
                        aria-hidden="true"
                    />
                )}
                {companies.map((logo, index) => (
                    <Logo key={logo.id} logo={{ ...logo, event: false }} height={companyHeight} scale={sizes.company} maxWidth={vw(60)} index={index + 1} />
                ))}
            </div>
            <div style={{ marginTop: `clamp(0.25rem,${vh(1)},0.75rem)` }}>
                <Heading />
            </div>
        </div>
    );
}

/**
 * The layout once the raffle has corner logos: one logo top left, NATCON top
 * centre, one logo top right, and "Congratulations" beneath NATCON. An empty
 * corner keeps its space so NATCON stays centred.
 */
function CornerHeader({ left, right, sizes }) {
    const event = { id: 'natcon', path: EVENT_LOGO, label: EVENT.name, event: true };
    const corner = `clamp(3.5rem,${vh(12)},8rem)`;

    return (
        <div
            className="relative z-10 grid w-full items-start"
            style={{
                gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)',
                columnGap: `clamp(0.75rem,${vw(2.5)},3rem)`,
                paddingInline: `clamp(1rem,${vw(3)},3.5rem)`,
                paddingTop: `clamp(0.75rem,${vh(2.5)},2rem)`,
            }}
        >
            <div className="flex min-w-0 justify-start">
                {left && <Logo logo={left} height={corner} scale={sizes.company} maxWidth="100%" index={1} />}
            </div>
            <div className="flex flex-col items-center text-center">
                <Logo logo={event} height={`clamp(4rem,${vh(13)},9rem)`} scale={sizes.event} index={0} />
                <div style={{ marginTop: `clamp(0.25rem,${vh(1)},0.75rem)` }}>
                    <Heading />
                </div>
            </div>
            <div className="flex min-w-0 justify-end">
                {right && <Logo logo={right} height={corner} scale={sizes.company} maxWidth="100%" index={2} />}
            </div>
        </div>
    );
}

function Heading() {
    return (
        <div className="flex flex-col items-center text-center">
            <motion.p
                initial={{ opacity: 0, y: 14, letterSpacing: '0.34em' }}
                animate={{ opacity: 1, y: 0, letterSpacing: '0.16em' }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                className="lux-foil whitespace-nowrap pl-[0.16em] font-lux font-semibold uppercase leading-none"
                style={{ fontSize: `clamp(1.4rem,min(${vw(4)},${vh(7.5)}),4rem)` }}
            >
                Congratulations!
            </motion.p>
        </div>
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
