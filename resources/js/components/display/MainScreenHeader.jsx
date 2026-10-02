import { motion } from 'framer-motion';
import { Diamond, EVENT, EVENT_LOGO } from '../landing/EventScene';
import { vh, vw } from './stageUnits';

/**
 * The masthead of the three-screen main screen: the event logo and the
 * "Raffle Draw" ornament. The raffle's own title, prize and company logos are
 * on the 12×7 sub screens. `sizes.event` is the operator's NATCON logo sizing
 * from the Control Center (see lib/logoSizes).
 */
export default function MainScreenHeader({ sizes = { event: 1, company: 1 } }) {
    const scale = sizes.event;

    return (
        <div
            className="relative z-10 flex w-full flex-col items-center text-center"
            style={{ paddingInline: `clamp(1rem,${vw(4)},4rem)`, paddingTop: `clamp(1rem,${vh(3)},2.25rem)` }}
        >
            <motion.img
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                src={EVENT_LOGO}
                alt={EVENT.name}
                className="max-w-full drop-shadow-[0_10px_40px_rgba(212,175,55,0.25)]"
                style={{
                    width: `calc(min(${vw(48)},${vh(100)}) * ${scale})`,
                    minWidth: `min(calc(30rem * ${scale}),${vw(90)})`,
                }}
            />

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
        </div>
    );
}
