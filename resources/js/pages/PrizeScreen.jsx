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
            {/* The NATCON logo and the company logos pinned to the
                top centre; the title and prize fill the space beneath. */}
            <LogoRow logos={raffle.logos ?? []} sizes={sizes} />

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

                {/* Nothing until the prize is set in the Control Center. */}
                {raffle.prize_name && (raffle.prize_type === 'item'
                    ? <ItemPrize name={raffle.prize_name} value={prizeValue} />
                    : <CashPrize name={raffle.prize_name} value={prizeValue} />)}
            </div>
        </>
    );
}

/** A glowing gold frame that breathes gently, around the prize. */
function PrizeFrame({ children, className = '' }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={`relative mt-[4cqh] ${className}`}
        >
            <motion.span
                aria-hidden="true"
                animate={{ opacity: [0.55, 1, 0.55] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                className="pointer-events-none absolute -inset-4 rounded-full bg-[radial-gradient(closest-side,rgba(212,175,55,0.24),rgba(212,175,55,0.08)_60%,transparent)] [will-change:opacity]"
            />
            <div className="relative flex flex-wrap items-center justify-center gap-x-[2cqw] gap-y-[0.5cqh] rounded-full border border-gold/50 bg-gradient-to-b from-gold/[0.14] to-black/50 px-[4cqw] py-[1.5cqh] shadow-[0_0_0_1px_rgba(212,175,55,0.12),0_10px_40px_-10px_rgba(212,175,55,0.55),inset_0_1px_0_rgba(255,244,201,0.25)]">
                {children}
            </div>
        </motion.div>
    );
}

/** Cash: the amount in engraved capitals, the prize name in script. */
/** Cash: the amount and "CASH PRIZE" as one line — "₱1,000 CASH PRIZE". */
function CashPrize({ name, value }) {
    return (
        <PrizeFrame>
            <p className="prize-gradient pl-[0.14em] font-lux font-bold uppercase leading-tight tracking-[0.14em]" style={{ fontSize: 'min(4.25cqw, 8cqh)' }}>
                {value ? `${value} CASH PRIZE` : name}
            </p>
        </PrizeFrame>
    );
}

/** An item such as a brand new car: the item is the headline, its value (if any) beneath. */
function ItemPrize({ name, value }) {
    return (
        <div className="flex flex-col items-center">
            <PrizeFrame>
                <p className="prize-gradient pl-[0.12em] font-lux font-bold uppercase leading-tight tracking-[0.12em]" style={{ fontSize: 'min(4.7cqw, 8.5cqh)' }}>
                    {name}
                </p>
            </PrizeFrame>
            {value && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.9 }}
                    className="mt-[2.5cqh] font-script font-semibold italic prize-gradient"
                    style={{ fontSize: 'min(2.7cqw, 5.1cqh)' }}
                >
                    worth {value}
                </motion.p>
            )}
        </div>
    );
}
