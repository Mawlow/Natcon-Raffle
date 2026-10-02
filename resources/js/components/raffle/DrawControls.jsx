import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ExternalLink, Gift, Pause, Play, Radio, RefreshCw, RotateCcw, SlidersHorizontal, Sparkles, Trophy, XCircle } from 'lucide-react';
import { InlineSpinner } from '../ui/LoadingState';
import { formatNumber } from '../../lib/format';

/**
 * Lifecycle + draw controls.
 *
 * The DRAW button sends a request and renders whatever ticket the server
 * returns. It has no say in which ticket that is.
 */
export default function DrawControls({ raffle, eligibleCount, busy, onTransition, onDraw, onRedraw, lastWinner }) {
    const [action, setAction] = useState(null);

    const run = async (name, fn) => {
        setAction(name);
        try {
            await fn();
        } finally {
            setAction(null);
        }
    };

    const drawn = raffle.winners_drawn ?? 0;
    const remaining = Math.max(0, raffle.winners_count - drawn);
    const canDraw = ['READY', 'LIVE'].includes(raffle.status) && remaining > 0 && eligibleCount > 0 && !raffle.is_archived;
    const canRedraw = drawn > 0 && !raffle.is_archived && raffle.status !== 'CANCELLED';

    return (
        <section className="panel panel-gold p-6">
            <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="font-display text-base font-bold text-white">Draw control</h2>
                    <p className="mt-0.5 text-xs text-muted">
                        Winners are selected on the server and written to the audit log.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    {/* The Control Center runs the draw and opens the LED
                        screens from one place — for the three-screen wall, or
                        for a single screen that shows everything. */}
                    <a
                        href={`/raffle/${raffle.id}/control`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-gold"
                    >
                        <SlidersHorizontal size={15} />
                        Control Center · 3 screens
                    </a>
                    <a
                        href={`/raffle/${raffle.id}/control?setup=one`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-outline"
                        title="One screen shows everything: logos, title, prize, the draw and the winners"
                    >
                        <SlidersHorizontal size={15} />
                        Control Center · 1 screen
                    </a>
                    <a
                        href={`/raffle/${raffle.id}/display`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-outline"
                    >
                        <ExternalLink size={15} />
                        Open display
                    </a>
                    {/* Same screen without the draw controls, for a projector
                        someone else is driving. */}
                    <a
                        href={`/raffle/${raffle.id}/display?view`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost"
                        title="Opens the display with no draw controls"
                    >
                        <Radio size={15} />
                        Live view
                    </a>
                    {/* The two 12×7 LED sub screens: one shows the winning
                        ticket as the main display reveals it, the other the
                        company logo, raffle title and prize. */}
                    <a
                        href={`/raffle/${raffle.id}/winner`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost"
                        title="Winner sub screen (12×7): the winning ticket"
                    >
                        <Trophy size={15} />
                        Winner screen
                    </a>
                    <a
                        href={`/raffle/${raffle.id}/prize`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost"
                        title="Prize sub screen (12×7): company logo, raffle title and prize"
                    >
                        <Gift size={15} />
                        Prize screen
                    </a>
                </div>
            </header>

            <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Winners drawn" value={`${drawn} / ${raffle.winners_count}`} />
                <Metric label="Remaining slots" value={remaining} />
                <Metric label="Eligible tickets" value={formatNumber(eligibleCount)} accent={eligibleCount === 0} />
            </div>

            {lastWinner && (
                <motion.div
                    key={lastWinner.ticket_number}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-gold/30 bg-gold/[0.07] px-5 py-4"
                >
                    <div>
                        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-gold/70">
                            Winner #{lastWinner.position}
                        </p>
                        <p className="tabular mt-1 font-display text-3xl font-extrabold text-gold-bright glow-gold-soft">
                            {lastWinner.ticket_number}
                        </p>
                    </div>
                    <Sparkles className="text-gold/60" size={26} />
                </motion.div>
            )}

            <div className="mt-6 flex flex-wrap gap-2.5">
                <button
                    type="button"
                    className="btn btn-gold px-8"
                    disabled={!canDraw || busy || action !== null}
                    onClick={() => run('draw', onDraw)}
                >
                    {action === 'draw' ? <InlineSpinner /> : <Sparkles size={16} />}
                    DRAW WINNER
                </button>

                {raffle.status === 'DRAFT' && (
                    <button
                        type="button"
                        className="btn btn-outline"
                        disabled={busy || action !== null}
                        onClick={() => run('ready', () => onTransition('ready'))}
                    >
                        {action === 'ready' ? <InlineSpinner /> : <CheckCircle2 size={15} />}
                        Mark ready
                    </button>
                )}

                {raffle.status === 'READY' && (
                    <button
                        type="button"
                        className="btn btn-outline"
                        disabled={busy || action !== null}
                        onClick={() => run('start', () => onTransition('start'))}
                    >
                        {action === 'start' ? <InlineSpinner /> : <Play size={15} />}
                        Go live
                    </button>
                )}

                {raffle.status === 'LIVE' && (
                    <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy || action !== null}
                        onClick={() => run('pause', () => onTransition('pause'))}
                    >
                        {action === 'pause' ? <InlineSpinner /> : <Pause size={15} />}
                        Pause
                    </button>
                )}

                {['READY', 'LIVE'].includes(raffle.status) && (
                    <>
                        <button
                            type="button"
                            className="btn btn-ghost"
                            disabled={busy || action !== null}
                            onClick={() => run('complete', () => onTransition('complete'))}
                        >
                            {action === 'complete' ? <InlineSpinner /> : <CheckCircle2 size={15} />}
                            Complete
                        </button>

                        <button
                            type="button"
                            className="btn btn-danger"
                            disabled={busy || action !== null}
                            onClick={() => run('cancel', () => onTransition('cancel'))}
                        >
                            {action === 'cancel' ? <InlineSpinner /> : <XCircle size={15} />}
                            Cancel
                        </button>
                    </>
                )}

                {['COMPLETED', 'CANCELLED'].includes(raffle.status) && remaining > 0 && (
                    <button
                        type="button"
                        className="btn btn-outline"
                        disabled={busy || action !== null}
                        onClick={() => run('reopen', () => onTransition('reopen'))}
                    >
                        {action === 'reopen' ? <InlineSpinner /> : <RefreshCw size={15} />}
                        Reopen
                    </button>
                )}

                {canRedraw && onRedraw && (
                    <button
                        type="button"
                        className="btn btn-outline"
                        disabled={busy || action !== null}
                        onClick={onRedraw}
                    >
                        <RotateCcw size={15} />
                        Redraw
                    </button>
                )}
            </div>

            {!canDraw && (
                <p className="mt-4 text-xs leading-relaxed text-muted">
                    {raffle.is_archived
                        ? 'This raffle is archived. Restore it before drawing.'
                        : remaining === 0
                            ? 'Every winner slot for this raffle has been filled. Use Redraw to draw the winners again.'
                            : eligibleCount === 0
                                ? 'No eligible tickets remain. Import participants for this raffle first.'
                                : `Set the raffle to READY or LIVE to enable drawing. Current status: ${raffle.status}.`}
                </p>
            )}
        </section>
    );
}

function Metric({ label, value, accent = false }) {
    return (
        <div className={`rounded-xl border px-4 py-3 ${accent ? 'border-amber-400/25 bg-amber-400/[0.06]' : 'border-line bg-black/30'}`}>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
            <p className="tabular mt-1.5 font-display text-2xl font-extrabold text-white">{value}</p>
        </div>
    );
}
