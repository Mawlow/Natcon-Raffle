import { useCallback, useEffect, useState } from 'react';

/**
 * Puts a screen window straight onto its LED display, fullscreen, from one
 * click in the Control Center — no dragging windows across monitors.
 *
 * Chrome's Window Management API lists the monitors plugged into this
 * computer (Chrome asks once for permission), so a screen window opens
 * already on its display. Going fullscreen needs a click in that window; the
 * Control Center's click is lent to it (fullscreen delegation), so the click
 * on SHOW is enough.
 *
 * Which display each screen goes on is chosen in the Control Center and kept
 * in this browser.
 */
const ASSIGN_KEY = 'natcon-led-displays';
const MESSAGE = 'natcon-go-fullscreen';
const READY_FLAG = '__natconScreenReady';

/**
 * Brave hides the real monitors from websites (its fingerprinting
 * protection reports made-up screen sizes), so the LED wall cannot be found
 * until Brave Shields are turned off for this site.
 */
export const isBrave = () => typeof navigator !== 'undefined' && Boolean(navigator.brave);

export const placementSupported = () => typeof window !== 'undefined' && 'getScreenDetails' in window;

let details = null;

/** The monitors on this computer. The first call may ask for permission. */
export async function loadDisplays() {
    if (!placementSupported()) return null;
    details ??= await window.getScreenDetails();
    return details;
}

/** 'granted', 'denied' or 'prompt'. */
export async function placementPermission() {
    try {
        return (await navigator.permissions.query({ name: 'window-management' })).state;
    } catch {
        return 'prompt';
    }
}

/** A display's id: where it sits and how big it is, which stays put between visits. */
export const displayId = (display) => `${display.left},${display.top},${display.width}x${display.height}`;

export function displayName(display, index) {
    const name = display.label || `Display ${index + 1}`;
    const role = display.isPrimary ? ' (this laptop / main)' : display.isInternal ? ' (built-in)' : '';
    return `${name} · ${display.width}×${display.height}${role}`;
}

export function loadAssignments() {
    try {
        return JSON.parse(window.localStorage.getItem(ASSIGN_KEY)) ?? {};
    } catch {
        return {};
    }
}

export function saveAssignments(assignments) {
    try {
        window.localStorage.setItem(ASSIGN_KEY, JSON.stringify(assignments));
    } catch {
        /* Storage can be blocked; the choice then lasts until a reload. */
    }
}

/**
 * The display a screen goes on: the one chosen for it, else the first
 * external monitor (the LED wall), else the first that is not the main one.
 */
export function displayFor(screenKey, screens, assignments = loadAssignments()) {
    if (!screens?.length) return null;
    return screens.find((display) => displayId(display) === assignments[screenKey])
        ?? screens.find((display) => !display.isInternal && !display.isPrimary)
        ?? screens.find((display) => !display.isInternal)
        ?? screens.find((display) => !display.isPrimary)
        ?? null;
}

// A display Chrome lists with no size is one it has lost track of (the
// monitor was plugged in or changed while Chrome was running): unusable
// until Chrome is restarted.
const usable = (display) => display.width > 0 && display.height > 0;
const listed = (found) => [...found.screens].filter(usable);
/** True when Chrome knows of a monitor it cannot place windows on. */
const hasLostDisplay = (found) => found.screens.some((display) => !usable(display));

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const isFullscreen = (win) => {
    try {
        return Boolean(win.document.fullscreenElement);
    } catch {
        return false;
    }
};

/**
 * Opens (or brings back) a screen window on `display`, fullscreen. Call it
 * straight from a click. Resolves to { opened, fullscreen }; fullscreen is
 * false when the browser would not allow it, and the screen's own button
 * (or another click on SHOW) does the rest.
 */
export async function showOnDisplay({ url, name, display }) {
    const features = display
        ? `popup,left=${display.availLeft},top=${display.availTop},width=${display.availWidth},height=${display.availHeight}`
        : 'popup,width=1280,height=760';
    const target = new URL(url, window.location.origin);

    // An empty url finds the window if it is already open, without reloading it.
    const win = window.open('', name, features);
    if (!win) return { opened: false, fullscreen: false };

    let reload = true;
    try {
        reload = win.location.pathname !== target.pathname;
    } catch {
        /* Another site's page: load ours over it. */
    }
    if (reload) {
        win.location.href = target.href;
    } else if (display && !isFullscreen(win)) {
        // Already open: move it onto its display in case it was dragged off.
        try {
            win.moveTo(display.availLeft, display.availTop);
            win.resizeTo(display.availWidth, display.availHeight);
        } catch {
            /* Not every browser lets a page move a window. */
        }
    }
    win.focus();

    // Wait until the screen is listening, then lend it this click.
    for (let waited = 0; waited < 5000; waited += 100) {
        let ready = false;
        try {
            ready = win[READY_FLAG] === true && win.location.pathname === target.pathname;
        } catch {
            /* Still loading. */
        }
        if (ready) break;
        await wait(100);
    }
    if (isFullscreen(win)) return { opened: true, fullscreen: true };

    try {
        win.postMessage({ type: MESSAGE }, { targetOrigin: window.location.origin, delegate: 'fullscreen' });
    } catch {
        // The click has expired or the browser cannot lend it.
        return { opened: true, fullscreen: false };
    }
    for (let waited = 0; waited < 1500; waited += 100) {
        if (isFullscreen(win)) return { opened: true, fullscreen: true };
        await wait(100);
    }
    return { opened: true, fullscreen: isFullscreen(win) };
}

/** On a screen window: go fullscreen when the Control Center asks. */
export function useFullscreenOnRequest() {
    useEffect(() => {
        const onMessage = (event) => {
            if (event.origin !== window.location.origin || event.data?.type !== MESSAGE) return;
            if (document.fullscreenElement) return;
            document.documentElement.requestFullscreen?.().catch(() => {});
        };
        window.addEventListener('message', onMessage);
        window[READY_FLAG] = true;
        return () => {
            window.removeEventListener('message', onMessage);
            window[READY_FLAG] = false;
        };
    }, []);
}

/**
 * For the Control Center: the displays on this computer (null until Chrome
 * has been allowed to list them), kept up to date as monitors are plugged in
 * or out, and which display each screen goes on.
 */
export function useLedDisplays() {
    const supported = placementSupported();
    const [permission, setPermission] = useState('prompt');
    const [displays, setDisplays] = useState(null);
    // Chrome lost track of a monitor: it must be restarted to use it.
    const [stale, setStale] = useState(false);
    const [assignments, setAssignments] = useState(loadAssignments);

    const attach = useCallback((found) => {
        if (!found) return;
        const update = () => {
            setDisplays(listed(found));
            setStale(hasLostDisplay(found));
        };
        update();
        found.addEventListener('screenschange', update);
    }, []);

    useEffect(() => {
        if (!supported) return;
        placementPermission().then((state) => {
            setPermission(state);
            // Allowed before: list them straight away, no prompt.
            if (state === 'granted') loadDisplays().then(attach).catch(() => {});
        });
    }, [supported, attach]);

    /** Lists the displays, asking Chrome's permission the first time: the list, or null if refused. */
    const detect = useCallback(async () => {
        try {
            const found = await loadDisplays();
            attach(found);
            setPermission('granted');
            return listed(found);
        } catch {
            setPermission(await placementPermission());
            return null;
        }
    }, [attach]);

    const assign = useCallback((screenKey, id) => {
        setAssignments((current) => {
            const next = { ...current, [screenKey]: id };
            saveAssignments(next);
            return next;
        });
    }, []);

    return { supported, permission, displays, detect, assignments, assign, stale, brave: isBrave() };
}
