import { memo, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MonitorPlay, Tv } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { prizeSlideLine } from '../../lib/prizeShowSync';
import { useToast } from '../../context/ToastContext';
import ManualWinners from '../prize/ManualWinners';
import { InlineSpinner } from '../ui/LoadingState';

// Kept fresh, so a prize put up from another window shows here.
const REFRESH_MS = 10000;

/**
 * The winners of a raffle drawn by hand, inside the Control Center. The host
 * announces a name, the operator finds the person in the participant list
 * and puts them on the open main screen, which lists them like a finished
 * raffle's winners under the prize chosen in the Prize display tab. Putting
 * a winner up turns the main screen over to that display if it is not
 * already showing it.
 */
function MainScreenWinnersPanel({ main, mainConnected, midDraw, post }) {
    const toast = useToast();
    const [slides, setSlides] = useState(null);
    const prizeMode = Boolean(mainConnected && main?.prizeMode);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get('/prize-slides');
            setSlides(data.data);
        } catch (error) {
            setSlides((current) => {
                if (current === null) toast.error(parseError(error, 'The prizes could not be loaded.').message);
                return current ?? [];
            });
        }
    }, [toast]);

    useEffect(() => {
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => clearInterval(timer);
    }, [load]);

    const live = slides?.find((slide) => slide.is_live) ?? null;
    const show = useCallback(() => post({ type: 'command', action: 'prize-mode', on: true }), [post]);
    // A new winner turns the main screen over to the list, unless a draw is running.
    const onChange = useCallback(async () => {
        await load();
        if (mainConnected && !midDraw && !prizeMode) show();
    }, [load, mainConnected, midDraw, prizeMode, show]);

    return (
        <section className="panel p-6">
            <h2 className="font-display text-base font-bold text-white">Winners announced on stage</h2>
            <p className="mt-0.5 text-xs text-muted">
                For a raffle drawn by hand: find each winner the host calls in the participant list and put them on the
                main screen, which lists them like a finished raffle. This is the major draw: a winner put up here sits out every other raffle of the event.
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-black/30 p-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${live ? 'border-gold/50 bg-gold/15 text-gold' : 'border-line text-muted-dim'}`}>
                        <Tv size={16} />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-dim">Prize for these winners</p>
                        <p className="truncate font-display text-sm font-extrabold text-white">
                            {slides === null ? <InlineSpinner /> : live ? prizeSlideLine(live) : 'None chosen yet'}
                        </p>
                    </div>
                </div>
                {prizeMode || !mainConnected ? (
                    <p className="text-xs text-muted-dim">
                        {!mainConnected ? 'Open the main screen first.' : 'The main screen is showing it.'}
                    </p>
                ) : (
                    <button type="button" className="btn btn-outline px-3 py-1.5 text-xs" onClick={show} disabled={!live || midDraw}>
                        <MonitorPlay size={13} />
                        Show on the main screen
                    </button>
                )}
            </div>

            <div className="mt-4">
                {slides !== null && (live
                    ? <ManualWinners slide={live} onChange={onChange} compact />
                    : (
                        <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
                            Put a prize on the screen above first, or on the{' '}
                            <Link to="/prize-display" className="text-gold underline-offset-2 hover:underline">Prize Display page</Link>. The winners go up under it.
                        </p>
                    ))}
            </div>
        </section>
    );
}

export default memo(MainScreenWinnersPanel);
