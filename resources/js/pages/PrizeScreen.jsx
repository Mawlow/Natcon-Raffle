import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import api, { parseError } from '../lib/api';
import { DISPLAY_TITLE, formatPrizeValue } from '../lib/format';
import { openDisplayChannel, useScreenPresence } from '../lib/displaySync';
import { withPrizeOnStage } from '../lib/prizes';
import { useLogoSizes } from '../lib/logoSizes';
import { useWallSwitch } from '../lib/wallSwitch';
import LedPanel from '../components/display/LedPanel';
import LogoRow from '../components/display/LogoRow';
import { CornerLogoRow } from '../components/display/ShowcaseHeader';
import { CompanyRow } from '../components/display/SingleScreenHeader';
import PrizeStage from '../components/display/PrizeStage';
import { Diamond } from '../components/landing/EventScene';

/**
 * The prize sub screen of the LED wall — one of the two 12×7 panels beside
 * the main screen (the other shows the winner: see WinnerScreen). It carries
 * the raffle's own branding: the sponsoring companies' logos, the raffle title
 * and the prize — cash or an item such as a brand new car.
 *
 * Open it in its own browser window on that panel:
 *   /raffle/{id}/prize
 */
const REFRESH_MS = 15000;

export default function PrizeScreen() {
    const { raffle: raffleId } = useParams();
    // Lets the Control Center show this screen as connected.
    useScreenPresence(raffleId, 'prize');
    // The Control Center can move this window to another raffle.
    useWallSwitch('prize', raffleId);
    // The operator's logo sizing from the Control Center.
    const logoSizes = useLogoSizes(raffleId);

    const [raffle, setRaffle] = useState(null);
    const [loadError, setLoadError] = useState(null);
    // The main screen's draw, so a raffle with several prizes shows the one
    // being drawn — and, while a winner is revealed, the one they won.
    const [live, setLive] = useState(null);

    useEffect(() => {
        const channel = openDisplayChannel(raffleId, (message) => {
            if (message?.type === 'state' && message.screen === 'main') setLive({ phase: message.phase, winners: message.winners ?? [] });
        });
        channel.post({ type: 'hello' });
        return () => channel.close();
    }, [raffleId]);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get(`/raffles/${raffleId}/display`);
            setRaffle(data.data);
            setLoadError(null);
        } catch (error) {
            setLoadError(parseError(error, 'This raffle could not be loaded.').message);
        }
    }, [raffleId]);

    // Reloads now and then, so a last-minute edit to the raffle shows up
    // without anyone touching the panel.
    useEffect(() => {
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => clearInterval(timer);
    }, [load]);

    return (
        <LedPanel>
            {loadError && !raffle ? (
                <div className="m-auto">
                    <p className="font-display font-bold text-white" style={{ fontSize: '4cqw' }}>Raffle unavailable</p>
                    <p className="mt-[2cqh] text-muted" style={{ fontSize: '2cqw' }}>{loadError}</p>
                </div>
            ) : !raffle ? (
                <span className="m-auto h-8 w-8 animate-spin rounded-full border-2 border-gold/25 border-t-gold" />
            ) : (
                <PrizeBody raffle={live ? withPrizeOnStage(raffle, live.phase, live.winners) : raffle} sizes={logoSizes} />
            )}
        </LedPanel>
    );
}

/**
 * Everything on the prize screen: the logos, the raffle title and the prize.
 * The Control Center's logo-size preview draws it too.
 */
export function PrizeBody({ raffle, sizes }) {
    const prizeValue = formatPrizeValue(raffle.prize_value, raffle.prize_currency);

    return (
        <>
            {/* The NATCON logo and the company logos pinned to the top
                centre — or, with corner logos, one top left and one top right
                either side of NATCON and the company logos beneath; the title
                and prize fill the space below. */}
            {raffle.logo_left || raffle.logo_right ? (
                <div className="flex w-full flex-col items-center">
                    <CornerLogoRow left={raffle.logo_left} right={raffle.logo_right} sizes={sizes} />
                    {raffle.logos?.length > 0 && <CompanyRow logos={raffle.logos} sizes={sizes} />}
                </div>
            ) : (
                <LogoRow logos={raffle.logos ?? []} sizes={sizes} />
            )}

            <div className="flex w-full flex-1 flex-col items-center justify-center">
                <motion.div
                    initial={{ opacity: 0, scaleX: 0.4 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ duration: 1.1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="lux-ornament w-[50cqw]"
                    aria-hidden="true"
                >
                    <Diamond />
                    <span className="font-lux font-semibold uppercase tracking-[0.5em] text-gold/80" style={{ fontSize: 'min(1.6cqw, 3cqh)' }}>
                        Raffle Draw
                    </span>
                    <Diamond />
                </motion.div>

                {/* The Prize Display may leave the title out. */}
                {raffle.name && (
                    <motion.h1
                        initial={{ opacity: 0, y: 14, letterSpacing: '0.24em' }}
                        animate={{ opacity: 1, y: 0, letterSpacing: '0.1em' }}
                        transition={{ duration: 1.2, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="lux-foil mt-[2cqh] max-w-[88cqw] text-balance pl-[0.1em] font-lux font-semibold uppercase leading-[1.05]"
                        style={{ fontSize: 'min(5.1cqw, 9.4cqh)' }}
                    >
                        {DISPLAY_TITLE}
                    </motion.h1>
                )}

                <PrizeWithPhoto raffle={raffle} />
            </div>
        </>
    );
}

/**
 * The prize itself: its photo — the brand new car — staged large like a
 * poster render when one is saved (see PrizeStage), and the glowing prize
 * frame beneath. Nothing until the prize is set.
 */
export function PrizeWithPhoto({ raffle }) {
    return (
        <>
            {raffle.prize_name && raffle.prize_image && <PrizeStage src={raffle.prize_image} alt={raffle.prize_name} />}
            <PrizeLine raffle={raffle} />
        </>
    );
}

/**
 * The prize lettering alone: the item, or the cash amount, as ivory plate
 * lettering between gold chevrons (see BarePrize). Nothing until the prize
 * is set. `bare` is the Prize Display, which has no title of its own, so the
 * event's name is lettered small above the prize there.
 */
export function PrizeLine({ raffle, bare = false }) {
    const prizeValue = formatPrizeValue(raffle.prize_value, raffle.prize_currency);

    if (!raffle.prize_name) return null;

    const text = raffle.prize_type === 'item' || !prizeValue ? raffle.prize_name : `${prizeValue} CASH PRIZE`;

    return <BarePrize name={text} value={raffle.prize_type === 'item' ? prizeValue : null} eyebrow={bare} />;
}

/**
 * The prize as marquee lettering with no box around it. The event's name
 * sits small above in gold foil; the prize itself is set apart from it as
 * ivory plate lettering edged in gold, held between a pair of gold chevron
 * brackets, over a twin rule with a diamond clasp, and the value (if any)
 * in script under that.
 */
function BarePrize({ name, value, eyebrow = true }) {
    const ease = [0.22, 1, 0.36, 1];

    return (
        <div className={`flex w-full flex-col items-center ${eyebrow ? '' : 'mt-[1.5cqh]'}`}>
            {/* The event's name above the prize, half the prize's size. */}
            {eyebrow && <motion.p
                initial={{ opacity: 0, y: 8, letterSpacing: '0.4em' }}
                animate={{ opacity: 1, y: 0, letterSpacing: '0.28em' }}
                transition={{ duration: 1.1, delay: 0.3, ease }}
                className="prize-shine mb-[1.1cqw] shrink-0 pl-[0.28em] text-center font-lux font-bold uppercase leading-none"
                style={{ fontSize: 'min(2.4cqw, 4.5cqh)' }}
            >
                NATCON Raffle
            </motion.p>}

            <div className="relative flex w-full items-center justify-center gap-[1.4cqw]">
                {/* A soft pool of gold light behind the lettering. */}
                <motion.span
                    aria-hidden="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.5, 0.85, 0.5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
                    className="pointer-events-none absolute left-1/2 top-1/2 h-[180%] w-[70cqw] -translate-x-1/2 -translate-y-1/2 rounded-[100%] bg-[radial-gradient(closest-side,rgba(212,175,55,0.22),rgba(212,175,55,0.06)_55%,transparent)] [will-change:opacity]"
                />

                <Chevrons side="left" delay={0.75} ease={ease} />

                <motion.p
                    initial={{ opacity: 0, scale: 0.86, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 1.2, delay: 0.5, ease }}
                    className="prize-ivory relative shrink-0 text-balance pl-[0.06em] text-center font-lux font-black uppercase leading-[1.02] tracking-[0.05em]"
                    style={{ fontSize: 'min(6cqw, 11cqh)', maxWidth: '70cqw' }}
                >
                    {name}
                </motion.p>

                <Chevrons side="right" delay={0.75} ease={ease} />
            </div>

            {/* A twin rule beneath: a fine gold hairline, a short bright bar
                and a diamond clasp at the centre. */}
            <motion.div
                aria-hidden="true"
                initial={{ opacity: 0, scaleX: 0.3 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 1.2, delay: 0.9, ease }}
                className="relative mt-[1.6cqh] flex w-[44cqw] flex-col items-center gap-[0.5cqh]"
            >
                <span className="h-px w-full bg-gradient-to-r from-transparent via-gold/70 to-transparent" />
                <span
                    className="h-[0.35cqh] w-[18cqw] rounded-full"
                    style={{
                        background: 'linear-gradient(90deg, transparent, rgba(245,215,110,0.9) 25%, rgba(255,250,235,1) 50%, rgba(245,215,110,0.9) 75%, transparent)',
                        boxShadow: '0 0 12px 2px rgba(255,225,140,0.5), 0 0 30px 6px rgba(212,175,55,0.25)',
                    }}
                />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-gold-bright bg-black shadow-[0_0_12px_rgba(255,232,160,0.8)]" style={{ width: '0.9cqw', height: '0.9cqw' }}>
                    <span className="absolute inset-[22%] bg-gold-bright" />
                </span>
            </motion.div>

            {value && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 1.1 }}
                    className="prize-gradient mt-[1.4cqh] font-script font-semibold italic"
                    style={{ fontSize: 'min(2.7cqw, 5.1cqh)' }}
                >
                    worth {value}
                </motion.p>
            )}
        </div>
    );
}

/**
 * A pair of gold chevrons bracketing the prize name, the outer one fainter,
 * sliding in from its side. Mirrored for the right-hand pair.
 */
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
            style={{ fontSize: 'min(5cqw, 9cqh)', gap: '0.05em', filter: 'drop-shadow(0 0 10px rgba(212,175,55,0.6))' }}
        >
            <span className={left ? 'opacity-45' : ''}>{marks[0]}</span>
            <span className={left ? '' : 'opacity-45'}>{marks[1]}</span>
        </motion.span>
    );
}

