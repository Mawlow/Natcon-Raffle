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
// event: the NATCON logo on the main, winner and prize screens;
// company: the company logos there; congrats: the NATCON logo on the
// Congratulations screen; corner: that screen's top-left and top-right logos,
// each sized on its own (cornerLeft, cornerRight) so a tall logo on one side
// can be made smaller without shrinking the other.
// The Congratulations screen is sized on its own, so making it look right
// never changes the prize screen.
// cornerLeftMargin / cornerRightMargin: how far each corner logo sits in
// from its edge of the screen, in % of the screen's width (0 = at the edge).
export const DEFAULT_LOGO_SIZES = { event: 100, company: 100, congrats: 100, corner: 100, cornerLeft: 100, cornerRight: 100, cornerLeftMargin: 0, cornerRightMargin: 0 };
export const LOGO_MARGIN_MIN = 0;
export const LOGO_MARGIN_MAX = 20;

const storageKey = (raffleId) => `natcon-logo-sizes-${raffleId}`;
// The sizes last set for any raffle: a raffle with none of its own — a new
// raffle, a next round, a pre-draw — starts from these, so logos sized once
// keep their size.
const LAST_KEY = 'natcon-logo-sizes-last';

/** Fired in this window when a raffle's sizes are saved. */
export const CHANGED_EVENT = 'natcon-logo-sizes-changed';

const clamp = (value) => Math.min(LOGO_SIZE_MAX, Math.max(LOGO_SIZE_MIN, Math.round(Number(value) || 100)));
const clampMargin = (value) => Math.min(LOGO_MARGIN_MAX, Math.max(LOGO_MARGIN_MIN, Math.round(Number(value) || 0)));

function parse(raw) {
    try {
        const stored = raw ? JSON.parse(raw) : {};
        return {
            event: clamp(stored.event ?? 100),
            company: clamp(stored.company ?? 100),
            congrats: clamp(stored.congrats ?? 100),
            corner: clamp(stored.corner ?? 100),
            // Sizes saved before each side had its own start from the shared one.
            cornerLeft: clamp(stored.cornerLeft ?? stored.corner ?? 100),
            cornerRight: clamp(stored.cornerRight ?? stored.corner ?? 100),
            cornerLeftMargin: clampMargin(stored.cornerLeftMargin),
            cornerRightMargin: clampMargin(stored.cornerRightMargin),
        };
    } catch {
        return { ...DEFAULT_LOGO_SIZES };
    }
}

export function loadLogoSizes(raffleId) {
    try {
        const own = raffleId == null ? null : window.localStorage.getItem(storageKey(raffleId));
        return parse(own ?? window.localStorage.getItem(LAST_KEY));
    } catch {
        return { ...DEFAULT_LOGO_SIZES };
    }
}

export function saveLogoSizes(raffleId, sizes) {
    try {
        const stored = JSON.stringify({
            event: clamp(sizes.event),
            company: clamp(sizes.company),
            congrats: clamp(sizes.congrats ?? 100),
            corner: clamp(sizes.corner ?? 100),
            cornerLeft: clamp(sizes.cornerLeft ?? sizes.corner ?? 100),
            cornerRight: clamp(sizes.cornerRight ?? sizes.corner ?? 100),
            cornerLeftMargin: clampMargin(sizes.cornerLeftMargin),
            cornerRightMargin: clampMargin(sizes.cornerRightMargin),
        });
        window.localStorage.setItem(storageKey(raffleId), stored);
        window.localStorage.setItem(LAST_KEY, stored);
        // Other windows hear the storage event; this one is told directly.
        window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { raffleId: String(raffleId) } }));
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
        const onChanged = (event) => {
            if (event.detail?.raffleId === String(raffleId)) setSizes(loadLogoSizes(raffleId));
        };
        window.addEventListener('storage', onStorage);
        window.addEventListener(CHANGED_EVENT, onChanged);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener(CHANGED_EVENT, onChanged);
        };
    }, [raffleId]);

    return toScale(sizes);
}

/** Percentages → multipliers. */
export const toScale = (sizes) => ({
    event: sizes.event / 100,
    company: sizes.company / 100,
    congrats: (sizes.congrats ?? 100) / 100,
    corner: (sizes.corner ?? 100) / 100,
    cornerLeft: (sizes.cornerLeft ?? sizes.corner ?? 100) / 100,
    cornerRight: (sizes.cornerRight ?? sizes.corner ?? 100) / 100,
    // Margins stay in % of the screen's width.
    cornerLeftMargin: sizes.cornerLeftMargin ?? 0,
    cornerRightMargin: sizes.cornerRightMargin ?? 0,
});
