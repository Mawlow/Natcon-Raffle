import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, MonitorPlay, Tv } from 'lucide-react';
import api, { parseError } from '../lib/api';
import { prizeSlideLine } from '../lib/prizeShowSync';
import DashboardLayout from '../components/layout/DashboardLayout';
import ManualWinners from '../components/prize/ManualWinners';
import LoadingState from '../components/ui/LoadingState';
import { useToast } from '../context/ToastContext';

const openScreen = () => window.open('/prize-show', 'natcon-prize-show', 'popup,width=1280,height=760');

// Kept fresh, so a prize put up from another window shows here.
const REFRESH_MS = 10000;

/**
 * The Main Screen page: the winners of a raffle drawn by hand. The host
 * announces a name, the operator finds the person in the participant list
 * and puts them on the screen, which lists them like a finished raffle's
 * winners under the prize chosen on the Prize Display page.
 */
export default function MainScreenControl() {
    const toast = useToast();
    const [slides, setSlides] = useState(null);

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

    return (
        <DashboardLayout
            title="Main Screen"
            subtitle="For raffles drawn by hand: put each winner the host announces on the screen."
            actions={(
                <button type="button" className="btn btn-gold" onClick={openScreen}>
                    <ExternalLink size={15} />
                    Open the screen
                </button>
            )}
        >
            <section className="panel panel-gold p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${live ? 'border-gold/50 bg-gold/15 text-gold' : 'border-line text-muted-dim'}`}>
                            <Tv size={19} />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted-dim">Prize on the screen now</p>
                            <p className="truncate font-display text-lg font-extrabold text-white">
                                {slides === null ? '…' : live ? prizeSlideLine(live) : 'None yet'}
                            </p>
                            {live?.title && <p className="truncate text-xs text-muted">{live.title}</p>}
                        </div>
                    </div>
                    <Link to="/prize-display" className="btn btn-outline">
                        <MonitorPlay size={15} />
                        {live ? 'Change the prize' : 'Choose a prize'}
                    </Link>
                </div>
            </section>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
                <section className="panel p-6">
                    <h2 className="font-display text-base font-bold text-white">Winners announced on stage</h2>
                    <p className="mt-0.5 text-xs text-muted">
                        When the host calls a name, find the person in the participant list and press Display. The screen
                        lists the winners like a finished raffle, and each new name joins the list. This is the major draw: a winner put up here sits out every other raffle of the event.
                    </p>
                    <div className="mt-5">
                        {slides === null ? (
                            <LoadingState label="Loading the prize" rows={2} />
                        ) : live ? (
                            <ManualWinners slide={live} onChange={load} />
                        ) : (
                            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
                                Choose a prize on the Prize Display page first. The winners go up under it.
                            </p>
                        )}
                    </div>
                </section>

                <aside className="space-y-5">
                    <section className="panel p-6">
                        <h2 className="font-display text-base font-bold text-white">The screen</h2>
                        <p className="mt-1 text-xs text-muted">
                            It is the same screen as the Prize Display. With no winner yet it shows the prize; from the
                            first winner it shows the winners list, and goes back to the prize when the list is cleared.
                        </p>
                        <button type="button" className="btn btn-outline mt-4 w-full" onClick={openScreen}>
                            <ExternalLink size={15} />
                            Open the screen
                        </button>
                        <p className="mt-3 break-all text-center text-xs text-muted-dim">{window.location.origin}/prize-show</p>
                    </section>
                </aside>
            </div>
        </DashboardLayout>
    );
}
