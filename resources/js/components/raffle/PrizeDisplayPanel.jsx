import { memo, useCallback } from 'react';
import { MonitorPlay, Trophy } from 'lucide-react';
import PrizeManager from '../prize/PrizeManager';

/**
 * The Prize Display inside a raffle's Control Center, for a raffle drawn by
 * hand. It switches the main screen that is already open between the draw
 * and the Prize Display in place — no second window, and it stays
 * fullscreen — and carries all of the Prize Display's controls: add, edit
 * and delete prizes with their logos, pick the one on the screen, and size
 * the logos (see PrizeManager). Pressing START or DRAW brings the draw back.
 */
function PrizeDisplayPanel({ main, mainConnected, midDraw, post }) {
    const prizeMode = Boolean(mainConnected && main?.prizeMode);

    const setMode = useCallback((on) => post({ type: 'command', action: 'prize-mode', on }), [post]);
    // A prize put on the screen from here turns the main screen over to it.
    const onLive = useCallback(() => setMode(true), [setMode]);

    const hint = !mainConnected
        ? 'Open the main screen first: it switches to the prize in place.'
        : midDraw ? 'Wait for the current draw to finish.' : null;

    return (
        <section className="panel p-6">
            <h2 className="font-display text-base font-bold text-white">Prize Display</h2>
            <p className="mt-0.5 text-xs text-muted">
                For a raffle drawn by hand: the open main screen shows only the prize. START or DRAW brings the draw back.
            </p>

            {/* What the main screen shows */}
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-black/40 p-1" role="radiogroup" aria-label="Main screen shows">
                {[[false, 'Raffle draw', Trophy], [true, 'Prize display', MonitorPlay]].map(([value, label, Icon]) => (
                    <button
                        key={label}
                        type="button"
                        role="radio"
                        aria-checked={prizeMode === value}
                        onClick={() => setMode(value)}
                        disabled={!mainConnected || (value && midDraw)}
                        className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition disabled:opacity-40 ${
                            prizeMode === value ? 'bg-gold text-black' : 'text-muted hover:text-white'
                        }`}
                    >
                        <Icon size={15} />
                        {label}
                    </button>
                ))}
            </div>

            <div className="mt-5">
                <PrizeManager
                    variant="panel"
                    onLive={onLive}
                    showDisabled={!mainConnected || midDraw}
                    showHint={hint}
                />
            </div>
        </section>
    );
}

export default memo(PrizeDisplayPanel);
