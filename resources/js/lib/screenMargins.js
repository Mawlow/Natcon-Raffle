import { useEffect, useState } from 'react';

/**
 * A safe area for each LED screen, set from the Control Center: how far in
 * from its top, bottom, left and right edges the picture is kept, in % of the
 * screen's height (top, bottom) or width (left, right). The LED operator uses
 * it when a panel's edge is cut off or covered by the stage.
 *
 * The whole picture is shrunk into what is left, keeping its proportions, and
 * centred there, so nothing on any screen overlaps the edges. One setting per
 * physical screen, for every raffle; kept in this browser's localStorage, so
 * every screen window follows a change at once and keeps it across a reload.
 */
export const SCREEN_KEYS = ['main', 'winner', 'prize'];
export const SIDES = ['top', 'bottom', 'left', 'right'];
export const MARGIN_MIN = 0;
export const MARGIN_MAX = 25;
export const NO_MARGINS = { top: 0, bottom: 0, left: 0, right: 0 };

const storageKey = (screen) => `natcon-screen-margins-${screen}`;
const CHANGED_EVENT = 'natcon-screen-margins-changed';

const clamp = (value) => Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, Math.round(Number(value) || 0)));

function parse(raw) {
    try {
        const stored = raw ? JSON.parse(raw) : {};
        return Object.fromEntries(SIDES.map((side) => [side, clamp(stored[side])]));
    } catch {
        return { ...NO_MARGINS };
    }
}

export function loadScreenMargins(screen) {
    try {
        return parse(window.localStorage.getItem(storageKey(screen)));
    } catch {
        return { ...NO_MARGINS };
    }
}

export function saveScreenMargins(screen, margins) {
    try {
        window.localStorage.setItem(storageKey(screen), JSON.stringify(parse(JSON.stringify(margins))));
        // Other windows hear the storage event; this one is told directly.
        window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { screen } }));
    } catch {
        /* Storage can be blocked; the screens then fill the whole wall. */
    }
}

/** The screen's margins, kept live. */
export function useScreenMargins(screen) {
    const [margins, setMargins] = useState(() => loadScreenMargins(screen));

    useEffect(() => {
        setMargins(loadScreenMargins(screen));
        const onStorage = (event) => {
            if (event.key === storageKey(screen)) setMargins(parse(event.newValue));
        };
        const onChanged = (event) => {
            if (event.detail?.screen === screen) setMargins(loadScreenMargins(screen));
        };
        window.addEventListener('storage', onStorage);
        window.addEventListener(CHANGED_EVENT, onChanged);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener(CHANGED_EVENT, onChanged);
        };
    }, [screen]);

    return margins;
}

/**
 * Where the picture goes inside the margins: one scale for both directions,
 * so nothing is stretched, and an offset (in vw, vh) that centres it in the
 * safe area. Null when there are no margins.
 */
export function fitInMargins({ top, bottom, left, right }) {
    if (!top && !bottom && !left && !right) return null;
    const width = 1 - (left + right) / 100;
    const height = 1 - (top + bottom) / 100;
    const scale = Math.max(0.1, Math.min(width, height));
    return {
        scale,
        x: left + ((width - scale) * 100) / 2,
        y: top + ((height - scale) * 100) / 2,
    };
}
