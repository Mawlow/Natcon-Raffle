import { memo, useCallback } from 'react';
import { Sparkles, Trophy } from 'lucide-react';

/**
 * The welcome screen inside a raffle's Control Center: the landing page's
 * hero — logo, "Grand Raffle Draw", dates and venue — on the open main
 * screen before the draw starts. It is on by itself for a raffle with
 * nothing drawn yet, and START or DRAW takes it down, so the operator only
 * needs this to bring it back or take it down early. It also picks which
 * date the screen shows: the convention's two days, or just today's.
 */
function WelcomeScreenPanel({ main, mainConnected, midDraw, post }) {
    const welcome = Boolean(mainConnected && main?.welcome);

    const setMode = useCallback((on) => post({ type: 'command', action: 'welcome', on }), [post]);
    const day = mainConnected ? main?.welcomeDay ?? 'both' : null;
    const setDay = useCallback((value) => post({ type: 'command', action: 'welcome-day', day: value }), [post]);

    return (
        <section className="panel p-6">
            <h2 className="font-display text-base font-bold text-white">Welcome Screen</h2>
            <p className="mt-0.5 text-xs text-muted">
                {!mainConnected
                    ? 'Open the main screen first: it shows the welcome screen in place.'
                    : midDraw
                        ? 'Wait for the current draw to finish.'
                        : 'The landing page on the main screen until the draw starts. START or DRAW takes it down.'}
            </p>

            {/* What the main screen shows */}
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-black/40 p-1" role="radiogroup" aria-label="Main screen shows">
                {[[true, 'Welcome screen', Sparkles], [false, 'Raffle draw', Trophy]].map(([value, label, Icon]) => (
                    <button
                        key={label}
                        type="button"
                        role="radio"
                        aria-checked={welcome === value}
                        onClick={() => setMode(value)}
                        disabled={!mainConnected || (value && midDraw)}
                        className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition disabled:opacity-40 ${
                            welcome === value ? 'bg-gold text-black' : 'text-muted hover:text-white'
                        }`}
                    >
                        <Icon size={15} />
                        {label}
                    </button>
                ))}
            </div>

            {/* The date under the headline */}
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-dim">Date shown</p>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-line bg-black/40 p-1" role="radiogroup" aria-label="Date shown">
                {[['both', 'Oct 18–19'], ['18', 'Oct 18'], ['19', 'Oct 19']].map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={day === value}
                        onClick={() => setDay(value)}
                        disabled={!mainConnected}
                        className={`rounded-md px-3 py-2 text-sm font-semibold transition disabled:opacity-40 ${
                            day === value ? 'bg-gold text-black' : 'text-muted hover:text-white'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </section>
    );
}

export default memo(WelcomeScreenPanel);
