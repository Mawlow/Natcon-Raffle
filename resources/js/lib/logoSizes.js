import { useEffect, useState } from 'react';

/**
 * How big the logos are drawn on the LED screens, set from the Control Center
 * like a volume knob: one size for the NATCON logo, one for the company logos,
 * each a percentage of the screen's own default.
 *
 * The sizes live in this browser's localStorage, one entry per raffle. Every
 * screen is a window of the same browser, and the browser tells the other
 * windows the moment an entry changes, so a slider move shows on the wall at
 * once and survives a screen being reloaded.
 */
export const LOGO_SIZE_MIN = 50;
export const LOGO_SIZE_MAX = 400;
export const DEFAULT_LOGO_SIZES = { event: 100, company: 100 };

const storageKey = (raffleId) => `natcon-logo-sizes-${raffleId}`;

const clamp = (value) => Math.min(LOGO_SIZE_MAX, Math.max(LOGO_SIZE_MIN, Math.round(Number(value) || 100)));

function parse(raw) {
    try {
        const stored = raw ? JSON.parse(raw) : {};
        return { event: clamp(stored.event ?? 100), company: clamp(stored.company ?? 100) };
    } catch {
        return { ...DEFAULT_LOGO_SIZES };
    }
}

export function loadLogoSizes(raffleId) {
    try {
        return parse(window.localStorage.getItem(storageKey(raffleId)));
    } catch {
        return { ...DEFAULT_LOGO_SIZES };
    }
}

export function saveLogoSizes(raffleId, sizes) {
    try {
        window.localStorage.setItem(storageKey(raffleId), JSON.stringify({ event: clamp(sizes.event), company: clamp(sizes.company) }));
    } catch {
        /* Storage can be blocked; the screens then keep their default sizes. */
    }
}

/** The raffle's logo sizes as multipliers ({ event: 1, company: 1 } by default), kept live. */
export function useLogoSizes(raffleId) {
    const [sizes, setSizes] = useState(() => loadLogoSizes(raffleId));

    useEffect(() => {
        setSizes(loadLogoSizes(raffleId));
        const onStorage = (event) => {
            if (event.key === storageKey(raffleId)) setSizes(parse(event.newValue));
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [raffleId]);

    return toScale(sizes);
}

/** Percentages → multipliers. */
export const toScale = (sizes) => ({ event: sizes.event / 100, company: sizes.company / 100 });
