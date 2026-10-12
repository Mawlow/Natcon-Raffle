/*
 * Light mode for weaker screens — a smart TV's own browser, an old laptop.
 * The decorations that cost the most every frame (fireworks, drifting gold
 * dust, sweeping spotlights) are switched off; the draw itself, the names
 * and every reveal are unchanged.
 *
 * It is decided once per device and remembered:
 *   - ?lite=1 in the address turns it on, ?lite=0 turns it off for good;
 *   - otherwise the screen times its own frames for a few seconds after it
 *     opens and turns light mode on by itself if it cannot keep up.
 */
const KEY = 'natcon-lite-mode';
const SLOW_FPS = 40;

function read() {
    try {
        return window.localStorage.getItem(KEY);
    } catch {
        return null;
    }
}

function write(value) {
    try {
        window.localStorage.setItem(KEY, value);
    } catch {
        /* Storage blocked: decided again next time. */
    }
}

function apply(on) {
    document.documentElement.classList.toggle('lite', on);
}

export const isLite = () => document.documentElement.classList.contains('lite');

/** Sets light mode up for this screen: from the address, from memory, or by timing frames. */
export function initLiteMode() {
    const asked = new URLSearchParams(window.location.search).get('lite');
    if (asked !== null) write(asked === '0' ? 'off' : 'on');

    const stored = read();
    if (stored === 'on' || stored === 'auto') return apply(true);
    if (stored === 'off' || stored === 'fast') return apply(false);

    probe();
}

/** Times frames for three seconds while the screen is visible; slow means light. */
function probe() {
    if (document.hidden) {
        // A hidden window draws no frames; time it once it shows.
        document.addEventListener('visibilitychange', () => { if (!document.hidden) probe(); }, { once: true });
        return;
    }

    let frames = 0;
    let start = 0;
    const tick = (now) => {
        if (document.hidden) return probe();
        if (!start) start = now;
        frames += 1;
        if (now - start < 3000) return requestAnimationFrame(tick);
        const fps = (frames * 1000) / (now - start);
        const slow = fps < SLOW_FPS;
        write(slow ? 'auto' : 'fast');
        apply(slow);
    };
    // Let the first screen settle before timing.
    setTimeout(() => requestAnimationFrame(tick), 1500);
}
