import { motion } from 'framer-motion';
import { EVENT, EVENT_LOGO } from '../landing/EventScene';
import StageLogo from './StageLogo';

const NATCON_LOGO = { id: 'natcon', path: EVENT_LOGO, label: EVENT.name };

// The NATCON tile is set this much larger than a company tile.
const EVENT_SCALE = 1.5;

const widthFor = (count) => (count === 1 ? 42 : count === 2 ? 36 : count === 3 ? 28 : count === 4 ? 21 : count <= 6 ? 18 : 14);

/**
 * The NATCON logo together with the raffle's company logos. Every logo sits in
 * an identical tile and is fitted inside it, so a square logo and a long
 * wordmark take up the same space; the more logos, the smaller the tiles.
 *
 * Up to three companies share one row with NATCON, split by a gold hairline.
 * With more, NATCON heads its own row and the companies wrap into balanced
 * rows beneath. `scale` shrinks everything for a screen with less room;
 * `sizes` is the operator's own NATCON and company sizing from the Control
 * Center (see lib/logoSizes).
 */
export default function LogoRow({ logos: companies = [], scale = 1, sizes = { event: 1, company: 1 } }) {
    if (companies.length === 0) {
        return <LogoTile logo={NATCON_LOGO} width={scale * 66 * sizes.event} index={0} />;
    }

    if (companies.length <= 3) {
        // NATCON takes a larger share of the row; the companies give a
        // little of theirs so the row still fits the screen.
        const base = scale * widthFor(companies.length + 1) * 0.8;
        const width = base * sizes.company;
        const gap = scale * 2.5;

        return (
            <div className="flex items-center justify-center" style={{ gap: `${gap}cqw` }}>
                <LogoTile logo={NATCON_LOGO} width={(base / 0.8) * EVENT_SCALE * sizes.event} index={0} />
                <Divider height={(Math.max(base * sizes.event, width) / TILE_RATIO) * 0.8} />
                {companies.map((logo, index) => (
                    <LogoTile key={logo.id} logo={logo} width={width} index={index + 1} />
                ))}
            </div>
        );
    }

    const base = scale * widthFor(companies.length);
    const width = base * sizes.company;
    const gap = scale * 2;

    return (
        <div className="flex flex-col items-center" style={{ gap: `${gap * 0.8}cqw` }}>
            <LogoTile logo={NATCON_LOGO} width={base * 2 * sizes.event} index={0} />
            <Grid logos={companies} width={width} gap={gap} />
        </div>
    );
}

/** Company logos wrapped into even rows rather than a full row and a straggler. */
function Grid({ logos, width, gap }) {
    const count = logos.length;
    const rows = Math.ceil((count * width + (count - 1) * gap) / 92);
    const perRow = Math.ceil(count / rows);
    const rowWidth = perRow * width + (perRow - 1) * gap;

    return (
        <div
            className="flex flex-wrap items-center justify-center"
            style={{ width: `${rowWidth}cqw`, maxWidth: '92cqw', gap: `${gap * 0.6}cqw ${gap}cqw` }}
        >
            {logos.map((logo, index) => (
                <LogoTile key={logo.id} logo={logo} width={width} index={index + 1} />
            ))}
        </div>
    );
}

function Divider({ height }) {
    return (
        <span
            className="w-px shrink-0 bg-gradient-to-b from-transparent via-gold/70 to-transparent"
            style={{ height: `${height}cqw` }}
            aria-hidden="true"
        />
    );
}

const TILE_RATIO = 2.2;

/**
 * One logo in a fixed-size, see-through tile: every logo is fitted into the
 * same space, with nothing drawn behind it.
 */
function LogoTile({ logo, width: wanted, index }) {
    // However large the operator sets it, a tile never runs off the panel.
    const width = Math.min(wanted, 92);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1, delay: Math.min(index * 0.08, 0.8), ease: [0.22, 1, 0.36, 1] }}
            className="grid shrink-0 place-items-center"
            style={{ width: `${width}cqw`, height: `${width / TILE_RATIO}cqw`, padding: `${width * 0.04}cqw` }}
        >
            <StageLogo src={logo.path} alt={logo.label} tone={logo.tone} stageSrc={logo.stage_path} outline={logo.outline} measure={logo.id !== NATCON_LOGO.id} />
        </motion.div>
    );
}
