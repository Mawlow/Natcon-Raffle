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
 * The glowing prize frame alone: the item, or the cash amount. Nothing until
 * the prize is set. `bare` drops the frame for the marquee lettering of the
 * Prize Display (see BarePrize).
 */
export function PrizeLine({ raffle, bare = false }) {
    const prizeValue = formatPrizeValue(raffle.prize_value, raffle.prize_currency);

    if (!raffle.prize_name) return null;

    if (bare) {
        const text = raffle.prize_type === 'item' || !prizeValue ? raffle.prize_name : `${prizeValue} CASH PRIZE`;

        return <BarePrize name={text} value={raffle.prize_type === 'item' ? prizeValue : null} />;
    }

    return raffle.prize_type === 'item'
        ? <ItemPrize name={raffle.prize_name} value={prizeValue} />
        : <CashPrize name={raffle.prize_name} value={prizeValue} />;
}

/**
 * The prize as marquee lettering with no box around it: the name in gold
 * foil with a light passing through the letters, a hairline running out
 * from each side with a small diamond at its end, a glowing rule beneath,
 * and the value (if any) in script under that.
 */
function BarePrize({ name, value }) {
    const ease = [0.22, 1, 0.36, 1];

    return (
        <div className="flex w-full flex-col items-center">
            {/* The event's name above the prize, half the prize's size. */}
            <motion.p
                initial={{ opacity: 0, y: 8, letterSpacing: '0.4em' }}
                animate={{ opacity: 1, y: 0, letterSpacing: '0.28em' }}
                transition={{ duration: 1.1, delay: 0.3, ease }}
                className="prize-shine mb-[0.9cqw] shrink-0 pl-[0.28em] text-center font-lux font-bold uppercase leading-none"
                style={{ fontSize: 'min(2.7cqw, 5cqh)' }}
            >
                NATCON Raffle
            </motion.p>
            <div className="flex w-full items-center justify-center gap-[1.6cqw]">
                <motion.span
                    aria-hidden="true"
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ duration: 1.1, delay: 0.7, ease }}
                    className="flex min-w-0 flex-1 origin-right items-center justify-end gap-[0.6cqw]"
                    style={{ maxWidth: '22cqw' }}
                >
                    <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gold/50 to-gold" />
                    <Diamond />
                </motion.span>

                <motion.p
                    initial={{ opacity: 0, y: 10, letterSpacing: '0.3em' }}
                    animate={{ opacity: 1, y: 0, letterSpacing: '0.16em' }}
                    transition={{ duration: 1.1, delay: 0.5, ease }}
                    className="prize-shine shrink-0 text-balance pl-[0.16em] text-center font-lux font-bold uppercase leading-[1.05]"
                    style={{ fontSize: 'min(5.4cqw, 10cqh)', maxWidth: '72cqw' }}
                >
                    {name}
                </motion.p>

                <motion.span
                    aria-hidden="true"
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ duration: 1.1, delay: 0.7, ease }}
                    className="flex min-w-0 flex-1 origin-left items-center gap-[0.6cqw]"
                    style={{ maxWidth: '22cqw' }}
                >
                    <Diamond />
                    <span className="h-px flex-1 bg-gradient-to-l from-transparent via-gold/50 to-gold" />
                </motion.span>
            </div>

            {/* A glowing rule beneath the lettering, like the floor line under the prize. */}
            <motion.span
                aria-hidden="true"
                initial={{ opacity: 0, scaleX: 0.3 }}
                animate={{ opacity: [0.7, 1, 0.7], scaleX: 1 }}
                transition={{ opacity: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' }, scaleX: { duration: 1.2, delay: 0.8, ease } }}
                className="mt-[1.2cqh] h-px w-[36cqw]"
                style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255,232,160,0.9) 30%, rgba(255,244,210,1) 50%, rgba(255,232,160,0.9) 70%, transparent)',
                    boxShadow: '0 0 10px 2px rgba(255,220,120,0.45), 0 0 28px 6px rgba(212,175,55,0.25)',
                }}
            />

            {value && (
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.8, delay: 1 }}
                    className="prize-gradient mt-[1.2cqh] font-script font-semibold italic"
                    style={{ fontSize: 'min(2.7cqw, 5.1cqh)' }}
                >
                    worth {value}
                </motion.p>
            )}
        </div>
    );
}

/** A glowing gold frame that breathes gently, around the prize. */
function PrizeFrame({ children, className = '' }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className={`relative mt-[1.5cqh] ${className}`}
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
