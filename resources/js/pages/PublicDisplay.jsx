import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Maximize2, Minimize2, Play, Radio, Volume2, VolumeX } from 'lucide-react';
import api, { parseError } from '../lib/api';
import { useSoundEngine } from '../lib/useSound';
import { HEARTBEAT_MS, PRESENCE_TIMEOUT_MS, keepIfSame, keepWinnersIfSame, openDisplayChannel, usePresence } from '../lib/displaySync';
import NameRoller from '../components/display/NameRoller';
import Countdown from '../components/display/Countdown';
import WinnerReveal, { WinnerName } from '../components/display/WinnerReveal';
import { winnerName } from '../lib/format';
import GoldParticles from '../components/display/GoldParticles';
import WinnerStrip, { SIDE_LAYOUT_FROM, WinnerSides } from '../components/display/WinnerStrip';
import FinalWinners from '../components/display/FinalWinners';
import FitBox from '../components/display/FitBox';
import SingleScreenHeader from '../components/display/SingleScreenHeader';
import ShowcaseHeader from '../components/display/ShowcaseHeader';
import HashtagMark from '../components/display/HashtagMark';
import PrizeShow from './PrizeShow';
import { useWallSwitch } from '../lib/wallSwitch';
import { DEFAULT_TRANSITION, isTransition } from '../components/display/winnerTransitions';
import MainScreenHeader from '../components/display/MainScreenHeader';
import { useLogoSizes } from '../lib/logoSizes';
import { EventBackdrop, Trophy } from '../components/landing/EventScene';

/** idle → ready → countdown → drawing → reveal → complete */
const PHASES = {
    IDLE: 'idle',
    READY: 'ready',
    COUNTDOWN: 'countdown',
    DRAWING: 'drawing',
    REVEAL: 'reveal',
    COMPLETE: 'complete',
};

/**
 * The main LED screen. Two setups share it:
 *   - three screens (/raffle/{id}/display): just the draw; the winner and
 *     prize sub screens carry the rest.
 *   - one screen    (/raffle/{id}/single):  `single` — the draw together with
 *     the logos, raffle title, prize and the winners so far.
 */
export default function PublicDisplay({ single = false }) {
    const { raffle: raffleId } = useParams();
    // The Control Center can move this window to another raffle.
    useWallSwitch(single ? 'single' : 'display', raffleId);
    // The operator's logo sizing from the Control Center.
    const logoSizes = useLogoSizes(raffleId);
    // ?view opens the screen as a spectator: no draw controls, just the show.
    const [searchParams] = useSearchParams();
    const spectator = searchParams.has('view');

    const [raffle, setRaffle] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [canDraw, setCanDraw] = useState(false);

    const [phase, setPhase] = useState(PHASES.IDLE);
    const [winners, setWinners] = useState([]);
    const [currentWinner, setCurrentWinner] = useState(null);
    const [target, setTarget] = useState(null);
    const [drawError, setDrawError] = useState(null);
    const [soundOn, setSoundOn] = useState(true);
    const [fullscreen, setFullscreen] = useState(false);
    // "All in one draw": after each reveal the next winner is drawn on its own
    // until every slot is filled.
    const [autoRun, setAutoRun] = useState(false);
    // The closing fireworks run for a while on the final screen, then settle.
    const [finale, setFinale] = useState(false);

    const { unlock, play, stop: stopSound } = useSoundEngine(soundOn);
    const lastTickRef = useRef(0);
    const drawInFlightRef = useRef(false);
    // The 3-2-1 countdown opens the raffle once. Every later winner — or any
    // winner after the first, if the screen is reopened mid-raffle — goes
    // straight to the roll.
    const countdownPlayedRef = useRef(false);
    const winnersCountRef = useRef(0);
    winnersCountRef.current = winners.length;
    const phaseRef = useRef(phase);
    phaseRef.current = phase;
    const raffleRef = useRef(raffle);
    raffleRef.current = raffle;

    const settings = raffle?.settings;
    const remaining = raffle ? raffle.winners_count - winners.length : 0;
    const allDrawn = raffle ? remaining <= 0 : false;
    const manyWinners = (raffle?.winners_count ?? 0) > 1;
    // "One drumroll, all revealed": one countdown and one roll, then every
    // remaining winner is revealed together. Chosen in the Control Center,
    // which sends it along with its DRAW command.
    const [togetherChosen, setTogetherChosen] = useState(false);
    const revealTogether = togetherChosen && remaining > 1;
    // Either way one press draws every remaining winner.
    const drawAllMode = (settings?.draw_mode === 'all_at_once' || revealTogether) && manyWinners;

    /* ------------------------------------------------------------------ *
     * Data
     * ------------------------------------------------------------------ */
    const load = useCallback(async () => {
        try {
            const { data } = await api.get(`/raffles/${raffleId}/display`);
            setRaffle((current) => keepIfSame(current, data.data));
            setWinners((current) => keepWinnersIfSame(current, data.data.winners ?? []));
            setLoadError(null);
            return data.data;
        } catch (error) {
            setLoadError(parseError(error, 'This raffle could not be loaded.').message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [raffleId]);

    useEffect(() => { load(); }, [load]);

    // This build has no sign-in, so the display can drive the draw itself
    // unless it was opened with ?view — a projector screen someone else runs.
    useEffect(() => {
        if (spectator) {
            setCanDraw(false);
            return;
        }

        api.get('/me')
            .then(() => setCanDraw(true))
            .catch(() => setCanDraw(false));
    }, [spectator]);

    // Spectator screens poll so a draw run from another machine still animates here.
    useEffect(() => {
        if (canDraw || !raffle || allDrawn) return undefined;

        const timer = setInterval(async () => {
            if (phase !== PHASES.IDLE && phase !== PHASES.READY && phase !== PHASES.COMPLETE) return;

            const fresh = await load();
            if (!fresh) return;

            const latest = fresh.winners?.[fresh.winners.length - 1];
            const arrived = (fresh.winners ?? []).slice(winners.length);

            // Several winners at once can only be a together draw.
            if (arrived.length > 1) {
                setWinners(fresh.winners.slice(0, winners.length));
                beginSequence({ group: arrived }, { skipRequest: true });
            } else if (latest && latest.position > winners.length) {
                setWinners(fresh.winners.slice(0, -1));
                beginSequence(latest, { skipRequest: true });
            }
        }, 3500);

        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canDraw, raffle, allDrawn, phase, winners.length, load]);

    // The screen that runs the draw also watches for changes made elsewhere
    // — a redraw from the admin page, or a new number of winners — while it
    // is between draws, and starts over from the new state. Without this, a
    // screen left open through a redraw would still think every winner was
    // drawn.
    // The Control Center's redraw asks for this straight away (`force`),
    // from whatever phase the screen is in, rather than waiting for the timer.
    const resyncRef = useRef(null);

    useEffect(() => {
        if (!canDraw) return undefined;

        const resync = async ({ force = false } = {}) => {
            const between = [PHASES.IDLE, PHASES.READY, PHASES.COMPLETE].includes(phaseRef.current);
            if ((!between && !force) || drawInFlightRef.current || !raffleRef.current) return;

            let fresh;
            try {
                fresh = (await api.get(`/raffles/${raffleId}/display`)).data.data;
            } catch {
                return;
            }

            // A draw may have started while the request was out.
            if ((!force && ![PHASES.IDLE, PHASES.READY, PHASES.COMPLETE].includes(phaseRef.current)) || drawInFlightRef.current) return;

            const freshWinners = fresh.winners ?? [];
            const unchanged = freshWinners.length === winnersCountRef.current
                && fresh.winners_count === raffleRef.current.winners_count;
            if (unchanged && !force) {
                setRaffle((current) => keepIfSame(current, fresh));
                return;
            }

            stopSound();
            setRaffle(fresh);
            setWinners(freshWinners);
            setCurrentWinner(null);
            setTarget(null);
            setAutoRun(false);
            setDrawError(null);
            if (freshWinners.length === 0) countdownPlayedRef.current = false;

            const nowAllDrawn = freshWinners.length >= fresh.winners_count;
            setPhase((current) => {
                if (current === PHASES.READY && !nowAllDrawn) return PHASES.READY;
                return PHASES.IDLE;
            });
        };

        resyncRef.current = resync;
        const timer = setInterval(resync, 5000);

        return () => {
            clearInterval(timer);
            resyncRef.current = null;
        };
    }, [canDraw, raffleId, stopSound]);

    /* ------------------------------------------------------------------ *
     * Fullscreen
     * ------------------------------------------------------------------ */
    useEffect(() => {
        const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    const toggleFullscreen = useCallback(async () => {
        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                await document.documentElement.requestFullscreen();
            }
        } catch {
            /* The browser may refuse; the layout works either way. */
        }
    }, []);

    /* ------------------------------------------------------------------ *
     * Draw sequence
     * ------------------------------------------------------------------ */
    const startEvent = useCallback(async () => {
        // Audio is a nicety; the draw is not. If unlocking the context fails or
        // stalls — no output device, a browser that refuses — the show goes on.
        try {
            await unlock();
        } catch {
            /* Silent show. */
        }

        setPhase(PHASES.READY);
    }, [unlock]);

    const startRoll = useCallback(() => {
        setPhase(PHASES.DRAWING);
        // The bed swells across the roll, so it needs to know how long that is.
        if (settings?.sound_drawing) {
            play('drawing', { duration: (settings?.roll_duration_ms ?? 6000) / 1000 });
        }
    }, [play, settings]);

    const handleCountdownComplete = useCallback(() => {
        countdownPlayedRef.current = true;
        startRoll();
    }, [startRoll]);

    const beginSequence = useCallback((presetWinner = null, options = {}) => {
        setDrawError(null);
        setTarget(null);
        setCurrentWinner(presetWinner);

        if (countdownPlayedRef.current || winnersCountRef.current > 0) {
            startRoll();
        } else {
            setPhase(PHASES.COUNTDOWN);
        }

        if (presetWinner && options.skipRequest) return;

        // The request goes out while the countdown plays, so the winning ticket is
        // already in hand by the time the roller needs to settle. The server —
        // never this screen — decides the number.
        if (drawInFlightRef.current) return;
        drawInFlightRef.current = true;

        const requestId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

        // Revealing together draws every remaining winner in one request; the
        // group is revealed when the single roll ends.
        const request = options.together
            ? api.post(`/raffles/${raffleId}/draw-all`, { request_id: requestId })
                .then(({ data }) => setCurrentWinner({ group: data.data.winners }))
            : api.post(`/raffles/${raffleId}/draw`, { request_id: requestId })
                .then(({ data }) => setCurrentWinner(data.data));

        request
            .catch((error) => {
                const parsed = parseError(error, 'The draw could not be completed.');
                setDrawError(parsed.message);
                setAutoRun(false);
                setPhase(PHASES.READY);
                stopSound();
                // A group draw can fail part way; show whoever was drawn.
                if (options.together) load();
            })
            .finally(() => { drawInFlightRef.current = false; });
    }, [raffleId, stopSound, startRoll, load]);


    // The group reveal is timed rather than driven by the roller, so its
    // timer reaches the latest handleSettled through a ref.
    const handleSettledRef = useRef(null);

    // Hand the roller its target only once the winning ticket has arrived.
    useEffect(() => {
        // A group has no single ticket to land on: the roll runs its full
        // length, then every winner is revealed at once.
        if (phase === PHASES.DRAWING && currentWinner?.group) {
            const duration = settings?.roll_duration_ms ?? 6000;
            const rollMs = Math.max(600, duration * 0.45) + Math.max(1200, duration * 0.4);
            const timer = setTimeout(() => handleSettledRef.current?.(), rollMs);
            return () => clearTimeout(timer);
        }
        if (phase === PHASES.DRAWING && currentWinner) {
            const minimumSpin = Math.max(600, (settings?.roll_duration_ms ?? 6000) * 0.45);
            const timer = setTimeout(() => setTarget(winnerName(currentWinner)), minimumSpin);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [phase, currentWinner, settings]);

    const handleSettled = useCallback(() => {
        setPhase(PHASES.REVEAL);
        // The drumroll ends on its cymbal crash as the ticket lands; with the
        // roll switched off, anything still sounding is simply released.
        if (settings?.sound_drawing) {
            play('roll-end');
        } else {
            stopSound();
        }
        // The recorded fanfare is saved for the moment the raffle is done:
        // the last winner's reveal. Earlier winners get the reveal hit.
        const revealed = currentWinner?.group ?? (currentWinner ? [currentWinner] : []);
        const lastPosition = revealed.length ? revealed[revealed.length - 1].position : 0;
        const isFinalWinner = Boolean(raffle && lastPosition >= raffle.winners_count);
        if (settings?.sound_winner) play('winner', { final: isFinalWinner });
        if (settings?.sound_celebration) play('celebrate');

        setWinners((current) => {
            const fresh = revealed.filter((winner) => !current.some((known) => known.position === winner.position));
            if (!fresh.length) return current;

            return [...current, ...fresh.map((winner) => ({
                position: winner.position,
                ticket_number: winner.ticket_number,
                name: winner.name,
                drawn_at: winner.drawn_at,
            }))];
        });
    }, [currentWinner, raffle, play, stopSound, settings]);
    handleSettledRef.current = handleSettled;

    // How long each winner stays on screen before the next one is drawn
    // automatically — long enough for the reveal and the applause.
    const AUTO_NEXT_DELAY_MS = 4500;

    useEffect(() => {
        if (!autoRun || phase !== PHASES.REVEAL || !raffle) return undefined;

        const finished = winners.length >= raffle.winners_count;
        const timer = setTimeout(() => {
            stopSound();
            if (finished) {
                setAutoRun(false);
                setTarget(null);
                setCurrentWinner(null);
                setPhase(PHASES.COMPLETE);
            } else {
                beginSequence();
            }
        }, AUTO_NEXT_DELAY_MS);

        return () => clearTimeout(timer);
    }, [autoRun, phase, raffle, winners.length, beginSequence, stopSound]);

    const handleDraw = useCallback((options = {}) => {
        const together = Boolean(options.together) && remaining > 1;
        setTogetherChosen(together);
        if (together) {
            beginSequence(null, { together: true });
            return;
        }
        if (drawAllMode) setAutoRun(true);
        beginSequence();
    }, [remaining, drawAllMode, beginSequence]);

    const handleNext = useCallback(() => {
        const finished = raffle && winners.length >= raffle.winners_count;
        stopSound();
        setTarget(null);
        setCurrentWinner(null);
        setPhase(finished ? PHASES.COMPLETE : PHASES.READY);
    }, [raffle, winners.length, stopSound]);

    const handleRollerTick = useCallback(() => {
        if (!settings?.sound_drawing) return;

        const now = performance.now();
        if (now - lastTickRef.current > 90) {
            lastTickRef.current = now;
            play('tick');
        }
    }, [play, settings]);

    const handleCountdownTick = useCallback((value) => {
        if (!settings?.sound_countdown) return;
        play(value === 1 ? 'countdown-final' : 'countdown');
    }, [play, settings]);

    useEffect(() => {
        if (phase !== PHASES.COMPLETE) return undefined;
        setFinale(true);
        const timer = setTimeout(() => setFinale(false), 15000);
        return () => clearTimeout(timer);
    }, [phase]);

    /* ------------------------------------------------------------------ *
     * Sub screens and the Control Center
     * ------------------------------------------------------------------ */
    // The sub screens only ever hear about a winner once it is revealed here,
    // so they never give the ticket away before the roller lands on it. The
    // Control Center hears the same state, and drives the draw with commands.
    const channelRef = useRef(null);

    // The final list's pages when there are many winners: where they are (for
    // the Control Center) and the Control Center's hand steps.
    const [finalPages, setFinalPages] = useState({ page: 0, pages: 1 });
    const [pageCommand, setPageCommand] = useState(null);

    // The winners-only display: once every winner is out, the screen shows
    // just the logos and the winners, a batch at a time (`perPage`, 0 = all).
    // It comes on by itself showing every winner; the Control Center can
    // switch back to the normal design, choose a smaller batch size and
    // bring up each batch.
    const [showcase, setShowcase] = useState(false);
    const [perPage, setPerPage] = useState(0);
    // How much of the bottom of the wall stays empty once the winners are
    // out (% of the screen height): the low rows of an LED wall are hidden
    // behind the audience's heads. Kept in this browser so a reload keeps it.
    const [bottomSpace, setBottomSpace] = useState(loadBottomSpace);
    // How the winners turn over between batches, chosen in the Control Center.
    const [transition, setTransition] = useState(loadTransition);
    // The Prize Display, shown in this same window on the Control Center's
    // say-so — for a raffle drawn by hand — so the wall never needs a second
    // window or to leave fullscreen. Kept across a reload.
    const [prizeMode, setPrizeMode] = useState(() => loadPrizeMode(raffleId));
    useEffect(() => savePrizeMode(raffleId, prizeMode), [raffleId, prizeMode]);
    const allRevealed = phase === PHASES.COMPLETE
        || (phase === PHASES.IDLE && allDrawn)
        || (phase === PHASES.REVEAL && Boolean(currentWinner?.group));
    const wasRevealedRef = useRef(false);
    useEffect(() => {
        // Each time the draw finishes, the winners go up all together.
        if (allRevealed && !wasRevealedRef.current) {
            setShowcase(true);
            setPerPage(0);
        }
        if (!allRevealed) setShowcase(false);
        wasRevealedRef.current = allRevealed;
    }, [allRevealed]);
    const handlePageChange = useCallback((page, pages) => {
        setFinalPages((current) => (current.page === page && current.pages === pages ? current : { page, pages }));
    }, []);

    const syncState = useMemo(() => ({
        type: 'state',
        screen: 'main',
        layout: single ? 'single' : 'three',
        phase,
        winners,
        // A group reveal has no single newest winner to highlight.
        revealed: phase === PHASES.REVEAL && !currentWinner?.group ? currentWinner : null,
        drawingPosition: winners.length + 1,
        total: raffle?.winners_count ?? 0,
        remaining,
        allDrawn,
        drawAllMode,
        autoRun,
        drawError,
        canDraw,
        finalPages,
        allRevealed,
        showcase,
        perPage,
        bottomSpace,
        transition,
        prizeMode,
    }), [single, phase, winners, currentWinner, raffle, remaining, allDrawn, drawAllMode, autoRun, drawError, canDraw, finalPages, allRevealed, showcase, perPage, bottomSpace, transition, prizeMode]);
    const syncStateRef = useRef(syncState);
    syncStateRef.current = syncState;

    // When a Control Center is open, it runs the draw and this screen shows
    // no buttons at all — nothing for the audience to see but the show.
    const [controlPresent, touchControl] = usePresence(PRESENCE_TIMEOUT_MS);
    const controlled = canDraw && controlPresent;

    const commandRef = useRef(null);
    commandRef.current = (action, message = {}) => {
        if (!canDraw || !raffle) return;

        // Starting or drawing brings the draw back from the Prize Display.
        if (action === 'start' || action === 'draw') setPrizeMode(false);

        if (action === 'prize-mode') setPrizeMode(Boolean(message.on));
        else if (action === 'start' && phase === PHASES.IDLE && !allDrawn) startEvent();
        else if (action === 'draw' && phase === PHASES.READY) handleDraw({ together: message.together });
        else if (action === 'next' && phase === PHASES.REVEAL && !autoRun) handleNext();
        else if (action === 'refresh') resyncRef.current?.({ force: true });
        else if (action === 'page') setPageCommand({ id: Date.now(), dir: message.dir === -1 ? -1 : 1 });
        else if (action === 'showcase') setShowcase(Boolean(message.on) && allRevealed);
        else if (action === 'per-page' && Number.isInteger(message.count) && message.count >= 0) setPerPage(message.count);
        else if (action === 'transition' && isTransition(message.id)) setTransition(saveTransition(message.id));
        else if (action === 'bottom-space' && Number.isFinite(message.value)) setBottomSpace(saveBottomSpace(message.value));
    };

    const postState = useCallback(() => {
        channelRef.current?.post({
            ...syncStateRef.current,
            // Sound can only start once someone has clicked this window at
            // least once; the Control Center warns the operator until then.
            audioReady: navigator.userActivation ? navigator.userActivation.hasBeenActive : true,
        });
    }, []);

    useEffect(() => {
        const channel = openDisplayChannel(raffleId, (message) => {
            // A Control Center driving the other setup is not talking to us:
            // with both main screens open, only the chosen one runs the draw.
            if (message?.setup && message.setup !== (single ? 'single' : 'display')) return;
            // A screen opened mid-show asks where things stand.
            if (message?.type === 'hello') postState();
            else if (message?.type === 'control-presence') {
                touchControl();
                postState();
            }
            else if (message?.type === 'command') commandRef.current?.(message.action, message);
        });
        channelRef.current = channel;
        const heartbeat = setInterval(postState, HEARTBEAT_MS);

        return () => {
            clearInterval(heartbeat);
            channelRef.current = null;
            channel.close();
        };
    }, [raffleId, postState, single]);

    useEffect(() => {
        if (raffle) postState();
    }, [raffle, syncState, postState]);

    /* ------------------------------------------------------------------ *
     * Render
     * ------------------------------------------------------------------ */
    if (prizeMode) return <PrizeShow />;

    if (loading) {
        return (
            <Shell>
                <div className="flex flex-col items-center gap-4">
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-gold/25 border-t-gold" />
                    <p className="text-sm uppercase tracking-[0.3em] text-muted">Loading raffle</p>
                </div>
            </Shell>
        );
    }

    if (loadError) {
        return (
            <Shell>
                <div className="max-w-lg text-center">
                    <p className="font-display text-2xl font-bold text-white">Raffle unavailable</p>
                    <p className="mt-3 text-muted">{loadError}</p>
                </div>
            </Shell>
        );
    }

    const isRolling = phase === PHASES.DRAWING;
    const showReveal = phase === PHASES.REVEAL;
    // Fireworks celebrate every winner the moment it is revealed, and the
    // whole raffle once the last one is in.
    const celebrate = showReveal || (phase === PHASES.COMPLETE && finale);
    // Every winner revealed together in one go.
    const groupReveal = showReveal && Boolean(currentWinner?.group);
    // Once every winner is on the stage, the decorations and side lists make
    // way for the full list.
    const finished = phase === PHASES.COMPLETE || (phase === PHASES.IDLE && allDrawn) || groupReveal;
    const sideWinners = single && winners.length > 0 && !finished && raffle.winners_count >= SIDE_LAYOUT_FROM;
    const showcaseOn = showcase && finished && winners.length > 0;

    return (
        <Shell celebrate={celebrate} palms={!finished}>
            {/* The side winner columns take the trophies' place, and once the
                raffle is done the winners get the whole width. */}
            <AnimatePresence>
                {!sideWinners && !finished && [
                    <Trophy key="trophy-left" side="left" heightClass="h-[min(40vh,22rem)]" />,
                    <Trophy key="trophy-right" side="right" heightClass="h-[min(40vh,22rem)]" />,
                ]}
            </AnimatePresence>

            <GoldParticles active={showReveal && (settings?.show_confetti ?? true)} />

            {/* Controls — hidden from the room's attention, reachable by the operator. */}
            <div className="absolute right-4 top-4 z-30 flex items-center gap-2 opacity-25 transition-opacity duration-300 hover:opacity-100 focus-within:opacity-100">
                <button
                    type="button"
                    onClick={() => setSoundOn((on) => !on)}
                    className="rounded-lg border border-line bg-black/50 p-2.5 text-muted backdrop-blur transition hover:text-gold"
                    aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
                    title={soundOn ? 'Mute sound' : 'Unmute sound'}
                >
                    {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
                <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="rounded-lg border border-line bg-black/50 p-2.5 text-muted backdrop-blur transition hover:text-gold"
                    aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                    {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
            </div>

            {!canDraw && (
                <div className="absolute left-4 top-4 z-30 flex items-center gap-2 rounded-lg border border-line bg-black/50 px-3 py-2 text-[0.65rem] uppercase tracking-[0.2em] text-muted-dim backdrop-blur">
                    <Radio size={13} className="text-gold/60" />
                    Live view
                </div>
            )}

            {showcaseOn ? (
                // Winners-only display: the logos either side of "Congratulations".
                <ShowcaseHeader logos={raffle.logos ?? []} left={raffle.logo_left} right={raffle.logo_right} sizes={logoSizes} />
            ) : single
                ? <SingleScreenHeader raffle={raffle} sizes={logoSizes} />
                : <MainScreenHeader sizes={logoSizes} />}

            {/* Stage: sits just under the header rather than centred in the
                leftover height, so there is no wide gap in the middle. */}
            <div
                className={`relative z-10 flex min-h-0 w-full flex-1 flex-col items-center justify-start pb-4 ${showcaseOn ? 'px-[clamp(0.75rem,2.5vw,3rem)] pt-[clamp(0.5rem,2vh,1.5rem)]' : 'px-[clamp(1rem,4vw,4rem)] pt-[clamp(1rem,4vh,3rem)]'}`}
                // Once the winners are out, everything sits high and the bottom of the wall stays clear.
                style={finished ? { paddingBottom: `${bottomSpace}vh` } : undefined}
            >
                {/* On one screen with many winners, the tickets drawn so far
                    run down both sides of the draw instead of the footer. */}
                {sideWinners && (
                    <WinnerSides
                        winners={winners}
                        totalWinners={raffle.winners_count}
                        currentPosition={showReveal ? currentWinner?.position : null}
                    />
                )}

                {/* Winners-only display: the names in a grid sized to fill the
                    whole stage, each set as large as it fits in full. */}
                {showcaseOn && (
                    <motion.div
                        key="showcase"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="min-h-0 w-full flex-1"
                    >
                        <FinalWinners
                            winners={winners}
                            bare
                            fill
                            transition={transition}
                            autoPage={false}
                            pageSize={perPage}
                            pageCommand={pageCommand}
                            onPageChange={handlePageChange}
                        />
                    </motion.div>
                )}

                {/* Long names shrink the stage to fit rather than push it off the screen. */}
                {!showcaseOn && (
                <FitBox className="w-full flex-1">
                <AnimatePresence mode="wait">
                    {/* The winning tickets are listed on the winner sub screen,
                        so a finished raffle just closes the show here. */}
                    {!showcaseOn && phase === PHASES.IDLE && allDrawn && (
                        <Stage key="finished">
                            {single ? <FinalWinners winners={winners} pageCommand={pageCommand} onPageChange={handlePageChange} /> : <RaffleDone />}
                        </Stage>
                    )}

                    {!showcaseOn && phase === PHASES.IDLE && !allDrawn && (
                        <Stage key="idle">
                            {canDraw && !allDrawn && !controlled ? (
                                <button type="button" onClick={startEvent} className="btn btn-gold mt-8 px-8 py-4 text-base">
                                    <Play size={18} />
                                    START RAFFLE
                                </button>
                            ) : (
                                <p className="mt-8 text-[clamp(0.7rem,1.5vw,1rem)] uppercase tracking-[0.3em] text-muted-dim">
                                    {allDrawn ? 'Thank you' : 'Standing by'}
                                </p>
                            )}
                        </Stage>
                    )}

                    {!showcaseOn && phase === PHASES.READY && (
                        <Stage key="ready">
                            <motion.p
                                animate={{ opacity: [0.55, 1, 0.55] }}
                                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                                className="font-display text-[clamp(1.5rem,6vw,5rem)] font-extrabold uppercase tracking-[0.28em] text-white"
                            >
                                Get Ready
                            </motion.p>

                            <p className="mt-4 text-[clamp(0.65rem,1.4vw,0.95rem)] uppercase tracking-[0.3em] text-muted">
                                {drawAllMode
                                    ? `${remaining} winner${remaining === 1 ? '' : 's'} to draw`
                                    : `Winner ${winners.length + 1} of ${raffle.winners_count}`}
                            </p>

                            {canDraw && !controlled && (
                                <button type="button" onClick={() => handleDraw()} className="btn btn-gold mt-9 px-10 py-4 text-base tracking-[0.15em]">
                                    {!drawAllMode || remaining === 1
                                        ? 'DRAW'
                                        : winners.length === 0
                                            ? `DRAW ALL ${remaining} WINNERS`
                                            : `DRAW REMAINING ${remaining}`}
                                </button>
                            )}

                            {drawError && !controlled && (
                                <p className="mt-5 max-w-lg rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-center text-sm text-red-300">
                                    {drawError}
                                </p>
                            )}
                        </Stage>
                    )}

                    {!showcaseOn && phase === PHASES.COUNTDOWN && (
                        <Stage key="countdown">
                            <Countdown
                                from={settings?.countdown_seconds ?? 3}
                                onTick={handleCountdownTick}
                                onComplete={handleCountdownComplete}
                            />
                        </Stage>
                    )}

                    {!showcaseOn && (phase === PHASES.DRAWING || showReveal) && (
                        <Stage key="drawing">
                            {isRolling && (
                                <motion.p
                                    animate={{ opacity: [0.4, 1, 0.4] }}
                                    transition={{ duration: 1.4, repeat: Infinity }}
                                    className="mb-[clamp(0.5rem,2vh,1.5rem)] font-display text-[clamp(0.8rem,2vw,1.5rem)] font-bold uppercase tracking-[0.4em] text-gold"
                                >
                                    {revealTogether && remaining > 1 ? `Drawing ${remaining} winners…` : 'Drawing…'}
                                </motion.p>
                            )}

                            {groupReveal ? (
                                <FinalWinners winners={winners} pageCommand={pageCommand} onPageChange={handlePageChange} />
                            ) : showReveal ? (
                                <WinnerReveal
                                    position={currentWinner?.position}
                                    totalWinners={raffle.winners_count}
                                >
                                    {/* The roll lands on the name; here it sits in its frame. */}
                                    <WinnerName name={winnerName(currentWinner)} />
                                </WinnerReveal>
                            ) : (
                                /* Names roll past; a raffle without names rolls its tickets instead. */
                                <NameRoller
                                    pool={raffle.sample_names?.length ? raffle.sample_names : raffle.sample_tickets}
                                    target={target}
                                    rolling
                                    settleMs={Math.max(1200, (settings?.roll_duration_ms ?? 6000) * 0.4)}
                                    onSettled={handleSettled}
                                    onTick={handleRollerTick}
                                />
                            )}

                            {showReveal && canDraw && !autoRun && !controlled && (
                                <motion.button
                                    type="button"
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 1.6 }}
                                    onClick={handleNext}
                                    className="btn btn-outline mt-[clamp(1.25rem,4vh,2.5rem)] px-8 py-3"
                                >
                                    {winners.length >= raffle.winners_count ? 'FINISH' : 'NEXT WINNER'}
                                </motion.button>
                            )}
                        </Stage>
                    )}

                    {!showcaseOn && phase === PHASES.COMPLETE && (
                        <Stage key="complete">
                            {single ? <FinalWinners winners={winners} pageCommand={pageCommand} onPageChange={handlePageChange} /> : <RaffleDone />}
                        </Stage>
                    )}
                </AnimatePresence>
                </FitBox>
                )}
            </div>

            {/* Footer. On one screen: the tickets drawn so far (once the raffle
                is done they move to the centre instead). With three screens
                they are on the winner sub screen, so this is just room. */}
            <div className={`relative z-10 w-full px-[clamp(1rem,4vw,4rem)] ${finished ? 'pb-0' : 'pb-[clamp(1.25rem,4vh,3rem)]'}`}>
                {single && winners.length > 0 && !finished && !sideWinners && (
                    <>
                        <div className="gold-rule mx-auto mb-[clamp(0.75rem,2vh,1.5rem)] w-[min(44rem,85vw)]" />
                        {/* Never more than a quarter of the screen, however long the names. */}
                        <FitBox className="max-h-[24vh] w-full" origin="bottom center">
                            <WinnerStrip
                                winners={winners}
                                totalWinners={raffle.winners_count}
                                currentPosition={showReveal ? currentWinner?.position : null}
                            />
                        </FitBox>
                    </>
                )}
            </div>
        </Shell>
    );
}

const TRANSITION_KEY = 'natcon-winner-transition';

function loadTransition() {
    try {
        const stored = window.localStorage.getItem(TRANSITION_KEY);
        return isTransition(stored) ? stored : DEFAULT_TRANSITION;
    } catch {
        return DEFAULT_TRANSITION;
    }
}

function saveTransition(id) {
    try {
        window.localStorage.setItem(TRANSITION_KEY, id);
    } catch {
        /* Storage can be blocked; the choice then lasts until a reload. */
    }
    return id;
}

const BOTTOM_SPACE_KEY = 'natcon-bottom-space';
const DEFAULT_BOTTOM_SPACE = 20;
const clampBottomSpace = (value) => Math.min(50, Math.max(0, Math.round(Number(value))));

const prizeModeKey = (raffleId) => `natcon-prize-mode-${raffleId}`;

function loadPrizeMode(raffleId) {
    try {
        return window.localStorage.getItem(prizeModeKey(raffleId)) === '1';
    } catch {
        return false;
    }
}

function savePrizeMode(raffleId, on) {
    try {
        if (on) window.localStorage.setItem(prizeModeKey(raffleId), '1');
        else window.localStorage.removeItem(prizeModeKey(raffleId));
    } catch {
        /* Storage can be blocked; the choice then lasts until a reload. */
    }
}

function loadBottomSpace() {
    try {
        const stored = window.localStorage.getItem(BOTTOM_SPACE_KEY);
        return stored === null ? DEFAULT_BOTTOM_SPACE : clampBottomSpace(stored);
    } catch {
        return DEFAULT_BOTTOM_SPACE;
    }
}

function saveBottomSpace(value) {
    const next = clampBottomSpace(value);
    try {
        window.localStorage.setItem(BOTTOM_SPACE_KEY, String(next));
    } catch {
        /* Storage can be blocked; the setting then lasts until a reload. */
    }
    return next;
}

function Shell({ children, celebrate = false, palms = true }) {
    return (
        // Exactly one screen tall: the wall never scrolls, whatever is on it.
        <div className="relative flex h-dvh w-full flex-col items-center overflow-hidden bg-ink">
            <EventBackdrop fireworks={{ mode: 'celebration', active: celebrate }} palms={palms} />
            {/* Everything readable sits in its own layer above the fixed backdrop. */}
            <div className="relative z-10 flex h-full w-full flex-col items-center justify-center">
                {children}
                <HashtagMark />
            </div>
        </div>
    );
}

/** The main screen's closing card once every winner is drawn. */
function RaffleDone() {
    return (
        <div className="flex flex-col items-center text-center">
            <motion.p
                initial={{ opacity: 0, y: 14, letterSpacing: '0.34em' }}
                animate={{ opacity: 1, y: 0, letterSpacing: '0.16em' }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                className="lux-foil pl-[0.16em] font-lux text-[clamp(1.8rem,5vw,4.25rem)] font-semibold uppercase leading-none"
            >
                Congratulations!
            </motion.p>
            <p className="mt-[clamp(0.75rem,2vh,1.5rem)] text-[clamp(0.7rem,1.5vw,1.05rem)] font-semibold uppercase tracking-[0.32em] text-muted">
                All winners have been drawn
            </p>
        </div>
    );
}

function Stage({ children }) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex w-full flex-col items-center justify-center"
        >
            {children}
        </motion.div>
    );
}
