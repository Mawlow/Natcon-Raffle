import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import api, { parseError } from '../lib/api';
import { fitText, winnerName } from '../lib/format';
import { openDisplayChannel, useScreenPresence } from '../lib/displaySync';
import { useLogoSizes } from '../lib/logoSizes';
import { useWallSwitch } from '../lib/wallSwitch';
import GoldParticles from '../components/display/GoldParticles';
import LedPanel from '../components/display/LedPanel';
import LogoRow from '../components/display/LogoRow';
import { Diamond } from '../components/landing/EventScene';

/**
 * The winner sub screen of the LED wall — one of the two 12×7 panels beside
 * the main screen (the other shows the prize: see PrizeScreen). No drawing
 * happens here — the draw runs on the main screen only. This screen lists the
 * winning tickets, adding each one the moment the main screen reveals it.
 *
 * Open it in its own browser window on that panel:
 *   /raffle/{id}/winner
 */
const POLL_MS = 3000;

export default function WinnerScreen() {
    const { raffle: raffleId } = useParams();

    // Lets the Control Center show this screen as connected.
    useScreenPresence(raffleId, 'winner');
    // The Control Center can move this window to another raffle.
    useWallSwitch('winner', raffleId);
    // The operator's logo sizing from the Control Center.
    const logoSizes = useLogoSizes(raffleId);

    const [raffle, setRaffle] = useState(null);
    const [loadError, setLoadError] = useState(null);
    // What the main screen last told us: { phase, winners, revealed, drawingPosition }.
    const [live, setLive] = useState(null);

    // Once the main screen is heard on the channel, it is the only source of
    // truth; the server poll is just for side screens on another machine.
    const heardMainRef = useRef(false);
    const pendingRevealRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get(`/raffles/${raffleId}/display`);
            setRaffle(data.data);
            setLoadError(null);
            return data.data;
        } catch (error) {
            setLoadError(parseError(error, 'This raffle could not be loaded.').message);
            return null;
        }
    }, [raffleId]);

    // First load: show whatever has already been drawn.
    useEffect(() => {
        load().then((fresh) => {
            if (!fresh || heardMainRef.current) return;
            setLive({ phase: 'idle', winners: fresh.winners ?? [], revealed: null, drawingPosition: (fresh.winners?.length ?? 0) + 1 });
        });
    }, [load]);

    // Follow the main screen.
    useEffect(() => {
        const channel = openDisplayChannel(raffleId, (message) => {
            if (message?.type !== 'state') return;
            heardMainRef.current = true;
            clearTimeout(pendingRevealRef.current);
            setLive(message);
        });
        channel.post({ type: 'hello' });
        return () => channel.close();
    }, [raffleId]);

    // Fallback for a side screen that is not on the same machine as the main
    // screen. The server records the winner before the main screen finishes
    // rolling, so a new winner is held back for the length of the roll.
    useEffect(() => {
        if (!raffle) return undefined;

        const timer = setInterval(async () => {
            if (heardMainRef.current) return;

            const fresh = await load();
            if (!fresh || heardMainRef.current) return;

            const all = fresh.winners ?? [];
            setLive((current) => {
                const shown = current?.winners?.length ?? 0;
                if (all.length <= shown || current?.phase === 'drawing') return current;

                const latest = all[all.length - 1];
                const settings = fresh.settings ?? {};
                const holdMs = (settings.roll_duration_ms ?? 6000)
                    + (shown === 0 ? (settings.countdown_seconds ?? 3) * 1000 : 0)
                    + 800;

                clearTimeout(pendingRevealRef.current);
                pendingRevealRef.current = setTimeout(() => {
                    setLive({ phase: 'reveal', winners: all, revealed: latest, drawingPosition: all.length + 1 });
                }, holdMs);

                return { phase: 'drawing', winners: all.slice(0, -1), revealed: null, drawingPosition: latest.position };
            });
        }, POLL_MS);

        return () => {
            clearInterval(timer);
            clearTimeout(pendingRevealRef.current);
        };
    }, [raffle, load]);

    // Winners only ever arrive here once the main screen has revealed them.
    const winners = [...(live?.winners ?? [])].sort((a, b) => a.position - b.position);
    // The main screen's count wins: it follows a redraw that changed the
    // number of winners, where this screen's own copy of the raffle would not.
    const total = Math.max(live?.total || raffle?.winners_count || 0, winners.length);
    // The newest ticket is highlighted while the main screen celebrates it.
    const newest = live?.phase === 'reveal' ? live?.revealed?.position ?? null : null;

    return (
        <LedPanel overlay={<GoldParticles active={newest !== null && (raffle?.settings?.show_confetti ?? true)} />}>
            {loadError && !raffle ? (
                <div className="m-auto">
                    <p className="font-display font-bold text-white" style={{ fontSize: '4cqw' }}>Raffle unavailable</p>
                    <p className="mt-[2cqh] text-muted" style={{ fontSize: '2cqw' }}>{loadError}</p>
                </div>
            ) : !raffle ? (
                <span className="m-auto h-8 w-8 animate-spin rounded-full border-2 border-gold/25 border-t-gold" />
            ) : (
                <>
                    {/* The NATCON logo and the company logos at the top centre,
                        smaller than on the prize screen so the tickets keep
                        the room. */}
                    <LogoRow logos={raffle.logos ?? []} scale={0.5} sizes={logoSizes} />
                    <div className="mt-[2cqh]">
                        <WinnerHeader raffle={raffle} />
                    </div>
                    <p
                        className="lux-foil mt-[2cqh] pl-[0.16em] font-lux font-semibold uppercase leading-none tracking-[0.16em]"
                        style={{ fontSize: 'min(5cqw, 9cqh)' }}
                    >
                        {total === 1 ? 'Winner' : 'Winners'}
                    </p>

                    <div className="mt-[2.5cqh] w-full min-h-0 flex-1">
                        <WinnersBoard winners={winners} total={total} newest={newest} />
                    </div>
                </>
            )}
        </LedPanel>
    );
}

/** The raffle's name between two diamonds; the Control Center's preview draws it too. */
export function WinnerHeader({ raffle }) {
    return (
        <div className="lux-ornament w-[50cqw]" aria-hidden="true">
            <Diamond />
            <span className="font-lux font-semibold uppercase tracking-[0.4em] text-gold/80" style={{ fontSize: 'min(1.8cqw, 3.4cqh)' }}>
                {raffle.name}
            </span>
            <Diamond />
        </div>
    );
}

// The shape a slot looks best in (width ÷ height), and the space between slots.
const SLOT_RATIO = 2.4;
const SLOT_GAP_PX = 10;

/** The columns × rows that give each of `count` slots the biggest box in a `width` × `height` area. */
function bestGrid(count, width, height) {
    let best = { cols: 1, rows: count, size: 0 };

    for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        const cellWidth = (width - (cols - 1) * SLOT_GAP_PX) / cols;
        const cellHeight = (height - (rows - 1) * SLOT_GAP_PX) / rows;
        // How big a slot of the ideal shape can be inside that cell.
        const size = Math.min(cellWidth / SLOT_RATIO, cellHeight);
        if (size > best.size) best = { cols, rows, size };
    }

    return best;
}

/**
 * One slot per prize, filled with each winner's name as it is revealed on
 * the main screen. The board measures the room it has and lays the slots out
 * in whatever grid gives each the most space, so 1 winner fills the panel and
 * 20, 30 or hundreds still all fit. Each number is sized to its own slot.
 */
function WinnersBoard({ winners, total, newest }) {
    const byPosition = new Map(winners.map((winner) => [winner.position, winner]));
    const slots = Array.from({ length: total }, (_, index) => index + 1);

    const boardRef = useRef(null);
    const [area, setArea] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const board = boardRef.current;
        if (!board) return undefined;

        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            setArea({ width, height });
        });
        observer.observe(board);
        return () => observer.disconnect();
    }, []);

    const { cols, rows, size } = bestGrid(total, area.width, area.height);
    // Keep one or two slots from stretching into giant boxes.
    const slotHeight = Math.min(size, area.height * 0.7);
    const slotWidth = slotHeight * SLOT_RATIO;

    // Each name is sized to fit its own slot; empty slots keep a ticket-sized placeholder.
    const maxHeight = `${total > 1 ? 40 : 55}cqh`;
    const emptySize = fitText('••••', 80, maxHeight);

    return (
        <div ref={boardRef} className="h-full w-full">
            {area.height > 0 && (
                <ol
                    className="grid h-full w-full content-center justify-center"
                    style={{
                        gridTemplateColumns: `repeat(${cols}, ${slotWidth}px)`,
                        gridTemplateRows: `repeat(${rows}, ${slotHeight}px)`,
                        gap: `${SLOT_GAP_PX}px`,
                    }}
                >
                    {slots.map((position) => {
                        const winner = byPosition.get(position);
                        const isNewest = winner && position === newest;

                        return (
                            <li
                                key={position}
                                className={`relative flex flex-col items-center justify-center overflow-hidden rounded-[8%/18%] border transition-colors duration-700 ${
                                    isNewest
                                        ? 'border-gold bg-gold/15 shadow-[0_0_40px_rgba(212,175,55,0.45)]'
                                        : winner
                                            ? 'border-gold/35 bg-black/45'
                                            : 'border-dashed border-white/10 bg-black/20'
                                }`}
                                // Each slot is its own container, so its text scales with it.
                                style={{ containerType: 'size' }}
                            >
                                <AnimatePresence mode="wait" initial={false}>
                                    {winner ? (
                                        <motion.span
                                            key="ticket"
                                            initial={{ opacity: 0, scale: 0.6 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ type: 'spring', stiffness: 160, damping: 14 }}
                                            className="lux-foil max-w-[92cqw] truncate px-[4cqw] font-lux font-bold uppercase leading-tight tracking-[0.04em]"
                                            style={{ fontSize: fitText(winnerName(winner), 84, maxHeight) }}
                                        >
                                            {winnerName(winner)}
                                        </motion.span>
                                    ) : (
                                        <motion.span
                                            key="empty"
                                            exit={{ opacity: 0 }}
                                            className="ticket-display text-white/10"
                                            style={{ fontSize: emptySize }}
                                        >
                                            ••••
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}
