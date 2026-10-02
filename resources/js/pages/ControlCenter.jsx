import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Gift, Loader2, Monitor, MousePointerClick, Play, RotateCcw, SkipForward, Sparkles, Trophy } from 'lucide-react';
import api, { parseError } from '../lib/api';
import { formatNumber, formatPrizeValue, winnerName } from '../lib/format';
import { HEARTBEAT_MS, PRESENCE_TIMEOUT_MS, keepIfSame, openDisplayChannel, useNow } from '../lib/displaySync';
import StatusChip from '../components/ui/StatusChip';
import CornerLogoPanel from '../components/raffle/CornerLogoPanel';
import PrizeDisplayPanel from '../components/raffle/PrizeDisplayPanel';
import RaffleSwitcher from '../components/raffle/RaffleSwitcher';
import LogoSizePanel from '../components/raffle/LogoSizePanel';
import { RedrawChoice, RedrawCount, validRedrawCount } from '../components/raffle/RedrawOptions';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../context/ToastContext';
import { DEFAULT_TRANSITION, TRANSITIONS } from '../components/display/winnerTransitions';

/**
 * The operator's Control Center for one raffle. It runs on the same computer
 * as the three LED screens (open it on the laptop's own display) and drives
 * the draw from there, so the main screen never has to show a button.
 *
 * It only sends commands — START, DRAW, NEXT — to the main screen, which
 * still asks the server for every winner. Status comes back from the screens
 * over the same channel they already use to stay in step.
 */
// Two setups, driven the same way. The main window keeps one name in both,
// so switching setup reuses it instead of opening a second draw.
const SETUPS = {
    three: {
        label: 'Three screens',
        text: 'Main screen for the draw, plus the 12×7 winner and prize screens.',
        screens: [
            { key: 'main', label: 'Main screen', path: 'display', icon: Monitor, hint: 'The draw itself' },
            { key: 'winner', label: 'Winner screen', path: 'winner', icon: Trophy, hint: '12×7 sub screen' },
            { key: 'prize', label: 'Prize screen', path: 'prize', icon: Gift, hint: '12×7 sub screen' },
        ],
    },
    one: {
        label: 'One screen',
        text: 'A single screen shows everything: logos, title, prize, the draw and the winners.',
        screens: [
            { key: 'main', label: 'Single screen', path: 'single', icon: Monitor, hint: 'Draw, prize and winners' },
        ],
    },
};

const PHASE_LABELS = {
    idle: 'Waiting to start',
    ready: 'Ready to draw',
    countdown: 'Countdown',
    drawing: 'Drawing…',
    reveal: 'Winner revealed',
    complete: 'Raffle complete',
};

export default function ControlCenter() {
    const { raffle: raffleId } = useParams();
    // ?setup=one opens straight into the one-screen setup.
    const [searchParams, setSearchParams] = useSearchParams();
    const setupKey = searchParams.get('setup') === 'one' ? 'one' : 'three';
    const setup = SETUPS[setupKey];
    const SCREENS = setup.screens;
    const chooseSetup = (key) => setSearchParams(key === 'one' ? { setup: 'one' } : {}, { replace: true });

    const [raffle, setRaffle] = useState(null);
    const [loadError, setLoadError] = useState(null);
    // The main screen's last report, and when each screen was last heard from.
    const [main, setMain] = useState(null);
    const [seen, setSeen] = useState({});
    // Blocks double clicks while a command is on its way.
    const [sending, setSending] = useState(false);
    // "One drumroll, all revealed": the next DRAW reveals every remaining
    // winner together after a single countdown and roll.
    const [together, setTogether] = useState(false);
    const togetherRef = useRef(together);
    togetherRef.current = together;
    const channelRef = useRef(null);
    const now = useNow(1000);

    const loadRaffle = useCallback(() => (
        api.get(`/raffles/${raffleId}/display`)
            .then(({ data }) => {
                setRaffle((current) => keepIfSame(current, data.data));
                setLoadError(null);
            })
            .catch((error) => setLoadError(parseError(error, 'This raffle could not be loaded.').message))
    ), [raffleId]);

    // Kept fresh, so a status change or redraw made on the admin page shows here.
    useEffect(() => {
        loadRaffle();
        const timer = setInterval(loadRaffle, 5000);
        return () => clearInterval(timer);
    }, [loadRaffle]);

    // A draft (or cancelled) raffle cannot be drawn; the operator can make it
    // ready right here instead of going back to the admin page.
    const [marking, setMarking] = useState(false);
    const [markError, setMarkError] = useState(null);
    const markReady = useCallback(async (action) => {
        setMarking(true);
        setMarkError(null);
        try {
            await api.post(`/raffles/${raffleId}/transition`, { action });
            await loadRaffle();
        } catch (error) {
            setMarkError(parseError(error, 'The raffle could not be marked ready.').message);
        } finally {
            setMarking(false);
        }
    }, [raffleId, loadRaffle]);

    // Which main screen this setup drives. A main screen of the other setup
    // left open in the same browser ignores these commands and is not
    // listened to, so two windows never run the same draw and fight.
    const singleSetup = setupKey === 'one';
    const singleSetupRef = useRef(singleSetup);
    singleSetupRef.current = singleSetup;
    useEffect(() => {
        setMain(null);
        channelRef.current?.post({ type: 'hello' });
    }, [singleSetup]);

    useEffect(() => {
        const raw = openDisplayChannel(raffleId, (message) => {
            const otherSetup = Boolean(message?.layout) && (message.layout === 'single') !== singleSetupRef.current;
            if (message?.type === 'state' && message.screen === 'main' && !otherSetup) {
                setMain(message);
                setSeen((current) => ({ ...current, main: Date.now() }));
            } else if (message?.type === 'presence') {
                setSeen((current) => ({ ...current, [message.screen]: Date.now() }));
            }
        });
        // Commands and our presence name the setup's main screen.
        const channel = {
            post: (message) => raw.post(message.type === 'command' || message.type === 'control-presence'
                ? { ...message, setup: singleSetupRef.current ? 'single' : 'display' }
                : message),
            close: () => raw.close(),
        };
        channelRef.current = channel;

        // Announce ourselves: the main screen hides its buttons while we are here.
        const announce = () => channel.post({ type: 'control-presence' });
        announce();
        channel.post({ type: 'hello' });
        const timer = setInterval(announce, HEARTBEAT_MS);

        return () => {
            clearInterval(timer);
            channelRef.current = null;
            channel.close();
        };
    }, [raffleId]);

    // Redraw: clears the winners so the raffle can be drawn again, with a
    // new number of winners if wanted. The main screen is told to start over
    // at once instead of noticing on its next check.
    const toast = useToast();
    const [redrawOpen, setRedrawOpen] = useState(false);
    const [redrawChoice, setRedrawChoice] = useState(null);
    const [redrawCount, setRedrawCount] = useState('');
    const [redrawing, setRedrawing] = useState(false);

    const openRedraw = () => {
        setRedrawChoice(null);
        setRedrawCount(String(raffle?.winners_count ?? 1));
        setRedrawOpen(true);
    };

    const redraw = async () => {
        setRedrawing(true);
        try {
            const { data } = await api.post(`/raffles/${raffleId}/redraw`, {
                include_previous_winners: redrawChoice === 'include',
                winners_count: Number(redrawCount),
            });
            await loadRaffle();
            channelRef.current?.post({ type: 'command', action: 'refresh' });
            setTogether(false);
            setRedrawOpen(false);
            const count = data.data.winners_count;
            toast.success(
                `${count} winner${count === 1 ? '' : 's'} to draw from ${formatNumber(data.data.eligible_count)} tickets. The screens have started over.`,
                { title: 'Ready to redraw' },
            );
        } catch (error) {
            toast.error(parseError(error, 'The raffle could not be redrawn.').message);
        } finally {
            setRedrawing(false);
        }
    };

    // Whether Space should bring up the next batch of winners.
    const nextBatchRef = useRef(false);

    const connected = (screen) => now - (seen[screen] ?? 0) < PRESENCE_TIMEOUT_MS;
    const mainConnected = connected('main');

    const send = useCallback((action) => {
        channelRef.current?.post(action === 'draw'
            ? { type: 'command', action, together: togetherRef.current }
            : { type: 'command', action });
        setSending(true);
        setTimeout(() => setSending(false), 900);
    }, []);

    const openScreen = (screen) => {
        // A named window: clicking again brings the same window back rather
        // than opening a second copy.
        window.open(`/raffle/${raffleId}/${screen.path}`, `natcon-${screen.key}-${raffleId}`, 'popup,width=1280,height=760');
    };

    const status = raffle?.status;
    const needsReady = status === 'DRAFT' || status === 'CANCELLED';
    const action = needsReady && main?.phase !== 'reveal' && !(main?.allDrawn)
        ? { label: 'Mark the raffle ready first', icon: CheckCircle2, hint: 'Use Mark as ready above.' }
        : primaryAction(main, mainConnected, together);

    // Space bar = the big button, so the operator can keep their eyes on the wall.
    useEffect(() => {
        const onKey = (event) => {
            if (event.code !== 'Space' || event.repeat || redrawOpen) return;
            if (event.target.closest?.('button, input, textarea, select, a')) return;
            event.preventDefault();
            if (action.command && !sending) send(action.command);
            // With nothing left to draw, Space brings up the next batch of winners.
            else if (!action.command && nextBatchRef.current) channelRef.current?.post({ type: 'command', action: 'page', dir: 1 });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [action.command, sending, send, redrawOpen]);

    // Sends a message to the screens; stable, so the panels using it stay memoised.
    const postCommand = useCallback((message) => channelRef.current?.post(message), []);

    if (loadError) {
        return (
            <Page>
                <div className="panel p-8 text-center">
                    <p className="font-display text-lg font-bold text-white">Raffle unavailable</p>
                    <p className="mt-2 text-sm text-muted">{loadError}</p>
                </div>
            </Page>
        );
    }

    if (!raffle) {
        return (
            <Page>
                <div className="grid place-items-center py-24">
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-gold/25 border-t-gold" />
                </div>
            </Page>
        );
    }

    const total = main?.total || raffle.winners_count;
    const winners = [...(main?.winners ?? raffle.winners ?? [])].sort((a, b) => a.position - b.position);
    const prizeValue = formatPrizeValue(raffle.prize_value, raffle.prize_currency);
    const ActionIcon = action.icon;
    nextBatchRef.current = Boolean(mainConnected && main?.showcase && main?.finalPages?.pages > 1);
    const remainingToDraw = Math.max(0, total - winners.length);
    // No redraw while a winner is being drawn on the wall.
    const midDraw = mainConnected && (main?.phase === 'countdown' || main?.phase === 'drawing');
    const canChooseTogether = remainingToDraw > 1 && !needsReady
        && (!mainConnected || !main || main.phase === 'idle' || main.phase === 'ready');
    const finished = main?.phase === 'complete' || (main?.phase === 'idle' && main?.allDrawn);

    return (
        <Page raffleId={raffleId}>
            {/* Raffle */}
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold/80">Control Center</p>
                    <h1 className="mt-1 truncate font-display text-2xl font-extrabold text-white">{raffle.name}</h1>
                    <p className="mt-1 text-sm text-muted">
                        {raffle.prize_type === 'item'
                            ? `${raffle.prize_name}${prizeValue ? ` · worth ${prizeValue}` : ''}`
                            : `${prizeValue ? `${prizeValue} · ` : ''}${raffle.prize_name}`}
                        {' · '}{formatNumber(raffle.eligible_count)} tickets in play
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">Status</span>
                    <StatusChip status={status} />
                </div>
            </header>

            {/* Any raffle, or a new one, onto the LED wall from here */}
            <div className="mt-5">
                <RaffleSwitcher raffleId={raffleId} raffleName={raffle.name} setupKey={setupKey} onWall={mainConnected} busy={midDraw} onChanged={loadRaffle} />
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_22rem]">
                <div className="space-y-5">
                    {/* Mark as ready — only while the raffle cannot be drawn yet. */}
                    {needsReady && (
                        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gold/40 bg-gold/[0.07] p-5">
                            <div className="min-w-0">
                                <p className="font-display text-base font-bold text-white">
                                    {status === 'DRAFT' ? 'This raffle is still a draft' : 'This raffle is cancelled'}
                                </p>
                                <p className="mt-0.5 text-sm text-muted">
                                    {status === 'DRAFT'
                                        ? 'Mark it as ready so the draw can start.'
                                        : 'Reopen it and mark it as ready so the draw can start.'}
                                </p>
                                {markError && <p className="mt-2 text-sm text-red-300">{markError}</p>}
                            </div>
                            <button
                                type="button"
                                className="btn btn-gold px-6 py-3"
                                disabled={marking}
                                onClick={() => markReady(status === 'DRAFT' ? 'ready' : 'reopen')}
                            >
                                {marking ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                Mark as ready
                            </button>
                        </section>
                    )}

                    {/* The draw */}
                    <section className="panel panel-gold p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">Now</p>
                                <p className="mt-1 font-display text-xl font-bold text-white">
                                    {!mainConnected
                                        ? 'Main screen not open'
                                        : finished ? 'Raffle complete' : PHASE_LABELS[main?.phase] ?? '—'}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">Winners</p>
                                <p className="tabular mt-1 font-display text-xl font-bold text-gold-bright">
                                    {winners.length} / {total}
                                </p>
                            </div>
                        </div>

                        {/* Only before the draw starts, and only with more than one winner left. */}
                        {canChooseTogether && (
                            <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-black/30 px-4 py-3 transition hover:border-gold/30">
                                <input
                                    type="checkbox"
                                    className="peer sr-only"
                                    checked={together}
                                    onChange={(event) => setTogether(event.target.checked)}
                                />
                                <span
                                    className={`relative h-6 w-11 shrink-0 rounded-full border transition peer-focus-visible:ring-2 peer-focus-visible:ring-gold/50 ${
                                        together ? 'border-gold bg-gold/80' : 'border-line bg-white/10'
                                    }`}
                                    aria-hidden="true"
                                >
                                    <span className={`absolute top-0.5 size-[18px] rounded-full bg-white shadow transition-all ${together ? 'left-[22px]' : 'left-0.5'}`} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-white">One drumroll, all revealed</span>
                                    <span className="block text-xs text-muted">
                                        One countdown and one drumroll, then all {remainingToDraw} remaining winners appear together.
                                    </span>
                                </span>
                            </label>
                        )}

                        <button
                            type="button"
                            onClick={() => send(action.command)}
                            disabled={!action.command || sending}
                            className="btn btn-gold mt-6 w-full justify-center py-6 text-lg tracking-[0.15em]"
                        >
                            {ActionIcon && <ActionIcon size={22} className={action.spin ? 'animate-spin' : ''} />}
                            {action.label}
                        </button>
                        <p className="mt-2.5 text-center text-xs text-muted-dim">
                            {action.command ? 'Or press the Space bar.' : action.hint ?? ' '}
                        </p>

                        {/* Once every winner is out: the winners-only display, how many
                            go up at a time, and bringing up each batch. */}
                        {mainConnected && main?.allRevealed && (
                            <WinnersDisplayPanel main={main} post={(message) => channelRef.current?.post(message)} />
                        )}

                        {mainConnected && main?.drawError && (
                            <p className="mt-4 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                {main.drawError}
                            </p>
                        )}

                        {mainConnected && main && main.audioReady === false && !finished && (
                            <p className="mt-4 flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm text-gold-bright">
                                <MousePointerClick size={16} className="mt-0.5 shrink-0" />
                                Click once anywhere on the main screen window before starting — browsers only allow sound after a click there. Its fullscreen button works.
                            </p>
                        )}
                    </section>

                    {/* Winners so far — ticket numbers, as revealed on the wall */}
                    <section className="panel p-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="font-display text-base font-bold text-white">Winners</h2>
                                <p className="mt-0.5 text-xs text-muted">Each winner appears here the moment the main screen reveals them.</p>
                            </div>
                            {winners.length > 0 && (
                                <button
                                    type="button"
                                    className="btn btn-outline px-3 py-1.5 text-xs"
                                    onClick={openRedraw}
                                    disabled={midDraw || redrawing}
                                    title={midDraw ? 'Wait for the current draw to finish' : 'Clear the winners and draw again'}
                                >
                                    <RotateCcw size={13} />
                                    Redraw
                                </button>
                            )}
                        </div>

                        <ol className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                            {Array.from({ length: total }, (_, index) => {
                                const winner = winners.find((item) => item.position === index + 1);
                                const isNewest = winner && main?.phase === 'reveal' && main?.revealed?.position === winner.position;
                                return (
                                    <li
                                        key={index}
                                        className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
                                            isNewest ? 'border-gold/60 bg-gold/10' : winner ? 'border-gold/20 bg-white/[0.03]' : 'border-dashed border-white/10'
                                        }`}
                                    >
                                        <span className={`text-xs font-bold ${winner ? 'text-gold/80' : 'text-muted-dim'}`}>#{index + 1}</span>
                                        <span
                                            className={`ml-2 min-w-0 truncate font-display text-sm font-extrabold ${winner ? 'text-gold-bright' : 'text-white/15'}`}
                                            title={winner ? `${winnerName(winner)} · ticket ${winner.ticket_number}` : undefined}
                                        >
                                            {winner ? winnerName(winner) : '••••'}
                                        </span>
                                    </li>
                                );
                            })}
                        </ol>
                    </section>

                    {/* Turn the open main screen into the Prize Display, for a raffle drawn by hand */}
                    <PrizeDisplayPanel main={main} mainConnected={mainConnected} midDraw={midDraw} post={postCommand} />

                    {/* The Congratulations screen's top-left and top-right logos */}
                    <CornerLogoPanel raffle={raffle} raffleId={raffleId} onSaved={loadRaffle} />

                    {/* Logo sizes, with a live preview of each screen */}
                    <LogoSizePanel raffle={raffle} raffleId={raffleId} screens={SCREENS} />
                </div>

                {/* Screens */}
                <aside className="panel h-fit p-6">
                    <h2 className="font-display text-base font-bold text-white">Setup</h2>
                    <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-line bg-black/40 p-1" role="radiogroup" aria-label="Screen setup">
                        {Object.entries(SETUPS).map(([key, option]) => (
                            <button
                                key={key}
                                type="button"
                                role="radio"
                                aria-checked={key === setupKey}
                                onClick={() => chooseSetup(key)}
                                className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                                    key === setupKey ? 'bg-gold text-black' : 'text-muted hover:text-white'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-muted">{setup.text}</p>

                    {mainConnected && main?.layout && main.layout !== (setupKey === 'one' ? 'single' : 'three') && (
                        <p className="mt-3 flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/[0.06] px-3.5 py-2.5 text-xs text-gold-bright">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            The open main window is still the {main.layout === 'single' ? 'one-screen' : 'three-screen'} version. Click Open below to switch it.
                        </p>
                    )}

                    <h2 className="mt-6 font-display text-base font-bold text-white">Screens</h2>
                    <p className="mt-0.5 text-xs text-muted">
                        {SCREENS.length > 1
                            ? 'Open each one, drag it onto its LED screen, then click its fullscreen button (top-right corner).'
                            : 'Open it, drag it onto the LED screen, then click its fullscreen button (top-right corner).'}
                    </p>

                    <ul className="mt-4 space-y-2.5">
                        {SCREENS.map((screen) => {
                            const isOn = connected(screen.key);
                            const Icon = screen.icon;
                            return (
                                <li key={screen.key} className="flex items-center gap-3 rounded-lg border border-line bg-black/30 px-3.5 py-3">
                                    <Icon size={18} className={isOn ? 'text-gold' : 'text-muted-dim'} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-white">{screen.label}</p>
                                        <p className={`flex items-center gap-1.5 text-xs ${isOn ? 'text-emerald-300' : 'text-muted-dim'}`}>
                                            <span className={`size-1.5 rounded-full ${isOn ? 'bg-emerald-400' : 'bg-white/20'}`} />
                                            {isOn ? 'Connected' : 'Not open'} · {screen.hint}
                                        </p>
                                    </div>
                                    <button type="button" className="btn btn-outline px-3 py-1.5 text-xs" onClick={() => openScreen(screen)}>
                                        <ExternalLink size={13} />
                                        {isOn && !(screen.key === 'main' && main?.layout && main.layout !== (setupKey === 'one' ? 'single' : 'three')) ? 'Show' : 'Open'}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    <button
                        type="button"
                        className="btn btn-ghost mt-3 w-full justify-center"
                        onClick={() => SCREENS.forEach((screen) => { if (!connected(screen.key)) openScreen(screen); })}
                        disabled={SCREENS.every((screen) => connected(screen.key))}
                    >
                        {SCREENS.length > 1 ? 'Open all screens' : 'Open the screen'}
                    </button>

                    {mainConnected && main && !main.canDraw && (
                        <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                            The main screen was opened as a live view and cannot be controlled. Close it and use the Open button above.
                        </p>
                    )}
                </aside>
            </div>

            <ConfirmDialog
                open={redrawOpen}
                title="Redraw this raffle?"
                description={
                    `The ${winners.length} current winner${winners.length === 1 ? '' : 's'} will be cleared and the raffle set back to READY, so it can be drawn again with as many winners as you choose below.\n\n`
                    + 'The screens start over straight away. The original draws stay in the audit log.'
                }
                confirmLabel="Clear winners & redraw"
                tone="gold"
                busy={redrawing}
                confirmDisabled={!redrawChoice || !validRedrawCount(redrawCount)}
                onConfirm={redraw}
                onCancel={() => setRedrawOpen(false)}
            >
                <div className="space-y-5">
                    <RedrawCount value={redrawCount} onChange={setRedrawCount} eligible={(raffle.eligible_count ?? 0) + winners.length} />
                    <RedrawChoice value={redrawChoice} onChange={setRedrawChoice} />
                </div>
            </ConfirmDialog>
        </Page>
    );
}

// How many winners go up on the wall at a time; 0 is all of them.
const BATCH_SIZES = [5, 8, 10, 15, 20, 25, 30, 0];

const BOTTOM_SPACES = [0, 10, 20, 30, 40];

/**
 * How much of the bottom of the wall stays empty once the winners are out, so
 * everything sits up where the audience can see it over the crowd.
 */
function BottomSpace({ value, onChange }) {
    return (
        <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">Keep bottom of wall clear</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
                {BOTTOM_SPACES.map((space) => (
                    <button
                        key={space}
                        type="button"
                        onClick={() => onChange(space)}
                        className={`min-w-11 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                            value === space ? 'border-gold bg-gold/15 text-gold-bright' : 'border-line text-muted hover:border-gold/40 hover:text-white'
                        }`}
                    >
                        {space === 0 ? 'None' : `${space}%`}
                    </button>
                ))}
            </div>
        </>
    );
}

/**
 * Any number of winners at a time, typed in: Enter or "Show" sends it to the
 * wall. A number at or above the total shows them all at once.
 */
function CustomBatchSize({ perPage, total, onApply }) {
    const [value, setValue] = useState('');
    const count = Number(value);
    const valid = value !== '' && Number.isInteger(count) && count >= 1;

    const apply = (event) => {
        event.preventDefault();
        if (!valid) return;
        onApply(count >= total ? 0 : count);
        setValue('');
    };

    const custom = perPage > 0 && !BATCH_SIZES.includes(perPage);

    return (
        <form onSubmit={apply} className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor="custom-batch" className="text-xs text-muted">Or type a number:</label>
            <input
                id="custom-batch"
                type="number"
                inputMode="numeric"
                min={1}
                max={Math.max(total, 1)}
                step={1}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={custom ? String(perPage) : 'e.g. 12'}
                className="input tabular w-24 py-1.5 text-sm"
                aria-label="Winners at a time"
            />
            <button type="submit" disabled={!valid} className="btn btn-gold px-4 py-1.5 text-sm disabled:opacity-40">
                Show
            </button>
            {custom && (
                <span className="text-xs text-gold-bright">Showing {perPage} at a time</span>
            )}
        </form>
    );
}

/**
 * After the draw: switch the main screen between the winners-only display
 * (just the logos and the winners) and its normal design, choose how many
 * winners go up at a time, and bring up each batch in turn.
 */
function WinnersDisplayPanel({ main, post }) {
    const showcase = Boolean(main.showcase);
    const perPage = main.perPage ?? 0;
    const total = main.winners?.length ?? 0;
    const { page = 0, pages = 1 } = main.finalPages ?? {};
    const size = perPage > 0 ? perPage : total;
    const first = page * size + 1;
    const last = Math.min(total, (page + 1) * size);

    return (
        <div className="mt-5 rounded-xl border border-gold/30 bg-gold/[0.04] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">Winners display</p>
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-black/40 p-1" role="radiogroup" aria-label="Main screen design">
                    {[[true, 'Winners only'], [false, 'Normal design']].map(([value, label]) => (
                        <button
                            key={label}
                            type="button"
                            role="radio"
                            aria-checked={showcase === value}
                            onClick={() => post({ type: 'command', action: 'showcase', on: value })}
                            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                                showcase === value ? 'bg-gold text-black' : 'text-muted hover:text-white'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <BottomSpace value={main.bottomSpace ?? 20} onChange={(value) => post({ type: 'command', action: 'bottom-space', value })} />

            {showcase && (
                <>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">Winners at a time</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {BATCH_SIZES.map((count) => (
                            <button
                                key={count}
                                type="button"
                                onClick={() => post({ type: 'command', action: 'per-page', count })}
                                className={`min-w-11 rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                                    perPage === count ? 'border-gold bg-gold/15 text-gold-bright' : 'border-line text-muted hover:border-gold/40 hover:text-white'
                                }`}
                            >
                                {count === 0 ? 'All' : count}
                            </button>
                        ))}
                    </div>

                    <CustomBatchSize perPage={perPage} total={total} onApply={(count) => post({ type: 'command', action: 'per-page', count })} />

                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">Transition</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {TRANSITIONS.map(({ id, label }) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => post({ type: 'command', action: 'transition', id })}
                                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                                    (main.transition ?? DEFAULT_TRANSITION) === id ? 'border-gold bg-gold/15 text-gold-bright' : 'border-line text-muted hover:border-gold/40 hover:text-white'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    {main.transition === undefined ? (
                        // A main screen opened before transitions were added never
                        // reports one back, and quietly ignores the buttons.
                        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                            <AlertTriangle size={14} className="mt-px shrink-0" />
                            The main screen is running an older version and won&apos;t respond to these. Reload that window (Cmd+R or F5) and they will work.
                        </p>
                    ) : (
                        <p className="mt-1.5 text-xs text-muted-dim">Picking one plays it on the wall straight away.</p>
                    )}

                    <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="tabular text-sm text-white">
                            {pages > 1
                                ? <>On the wall: winners <span className="font-bold text-gold-bright">{first}–{last}</span> of {total}</>
                                : `All ${total} winners are on the wall.`}
                        </p>
                        {pages > 1 && (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    className="btn btn-outline px-3 py-2"
                                    onClick={() => post({ type: 'command', action: 'page', dir: -1 })}
                                    aria-label="Previous winners"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-gold px-4 py-2 text-sm"
                                    onClick={() => post({ type: 'command', action: 'page', dir: 1 })}
                                >
                                    {page + 1 >= pages ? 'Back to first' : `Next ${Math.min(size, total - last)}`}
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                    {pages > 1 && <p className="mt-1.5 text-xs text-muted-dim">Space bar brings up the next winners too.</p>}
                </>
            )}
        </div>
    );
}

/** What the big button does right now, given the main screen's last report. */
function primaryAction(main, mainConnected, together = false) {
    if (!mainConnected || !main) return { label: 'Open the main screen', icon: Monitor, hint: 'Use the Screens panel to open it.' };
    if (!main.canDraw) return { label: 'Main screen is a live view', icon: AlertTriangle };

    switch (main.phase) {
        case 'idle':
            return main.allDrawn
                ? { label: 'All winners drawn', icon: Sparkles }
                : { label: 'START RAFFLE', icon: Play, command: 'start' };
        case 'ready': {
            const { remaining, drawAllMode, winners = [] } = main;
            if (together && remaining > 1) return { label: `REVEAL ALL ${remaining} WINNERS`, icon: Sparkles, command: 'draw' };
            const label = !drawAllMode || remaining === 1
                ? 'DRAW'
                : winners.length === 0 ? `DRAW ALL ${remaining} WINNERS` : `DRAW REMAINING ${remaining}`;
            return { label, icon: Sparkles, command: 'draw' };
        }
        case 'countdown':
        case 'drawing':
            return { label: 'Drawing…', icon: Loader2, spin: true, hint: 'The winner is on its way.' };
        case 'reveal':
            if (main.autoRun) return { label: 'Drawing all winners…', icon: Loader2, spin: true, hint: 'The next one starts on its own.' };
            return (main.winners?.length ?? 0) >= main.total
                ? { label: 'FINISH', icon: Trophy, command: 'next' }
                : { label: 'NEXT WINNER', icon: SkipForward, command: 'next' };
        case 'complete':
            return { label: 'Raffle complete', icon: Trophy };
        default:
            return { label: '—' };
    }
}

function Page({ raffleId, children }) {
    return (
        <div className="min-h-screen bg-ink px-5 py-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
                <Link to={raffleId ? `/raffles/${raffleId}` : '/raffles'} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-gold">
                    <ArrowLeft size={15} />
                    Back to raffle
                </Link>
                <div className="mt-4">{children}</div>
            </div>
        </div>
    );
}
