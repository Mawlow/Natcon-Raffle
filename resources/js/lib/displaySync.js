import { useCallback, useEffect, useRef, useState } from 'react';
import { windowIsFullscreen } from './ledDisplays';

/**
 * Keeps the LED wall's screens in step. The main display announces each phase
 * of the draw; the winner and prize screens listen and follow along, and the
 * Control Center drives the draw by sending the main display commands.
 *
 * Everything runs over a BroadcastChannel, so it is instant and works offline —
 * as long as every screen is a window of the same browser on the same machine.
 * (A winner screen on another machine falls back to polling the server.)
 */
const channelName = (raffleId) => `natcon-raffle-display-${raffleId}`;

export function openDisplayChannel(raffleId, onMessage) {
    if (typeof BroadcastChannel === 'undefined') {
        return { post: () => {}, close: () => {} };
    }

    const channel = new BroadcastChannel(channelName(raffleId));
    if (onMessage) channel.onmessage = (event) => onMessage(event.data);

    return {
        post: (message) => channel.postMessage(message),
        close: () => channel.close(),
    };
}

/*
 * Messages on the channel:
 *   main    → all      { type: 'state', ... }             every change, every HEARTBEAT_MS, and in reply to control-presence
 *   screens → control  { type: 'presence', screen, fullscreen }  every HEARTBEAT_MS, and in reply to control-presence ('winner' | 'prize')
 *   control → screen   { type: 'close-window', screen, layout? }  the screen closes itself, so SHOW can open it anew fullscreen
 *   control → main     { type: 'control-presence' }       every HEARTBEAT_MS
 *   control → main     { type: 'command', action }        'start' | 'draw' | 'next' | 'refresh' | 'page'
 *                      (with 'draw', together: true reveals every remaining winner after one drumroll;
 *                       'refresh' reloads the raffle at once, e.g. after a redraw;
 *                       'page' with dir: 1 | -1 steps the final winners list a page)
 *   anyone  → all      { type: 'hello' }                  "tell me where things stand"
 */
export const HEARTBEAT_MS = 1500;
// A window that has not been heard from for this long counts as closed.
export const PRESENCE_TIMEOUT_MS = 4500;

/** Keep announcing that this screen is open, so the Control Center can show it as connected. */
export function useScreenPresence(raffleId, screen) {
    useEffect(() => {
        let lastPost = 0;
        const post = () => {
            lastPost = Date.now();
            channel.post({ type: 'presence', screen, fullscreen: windowIsFullscreen() });
        };
        const channel = openDisplayChannel(raffleId, (message) => {
            // Answering the Control Center's own heartbeat keeps this screen
            // showing as connected even if the browser slows its timers —
            // but once per beat, however many Control Centers are open.
            if (message?.type === 'hello') post();
            else if (message?.type === 'control-presence' && Date.now() - lastPost >= HEARTBEAT_MS / 3) post();
            // The Control Center is about to open this screen again, fullscreen.
            else if (message?.type === 'close-window' && message.screen === screen) window.close();
        });
        post();
        const timer = setInterval(post, HEARTBEAT_MS);

        return () => {
            clearInterval(timer);
            channel.close();
        };
    }, [raffleId, screen]);
}

/** Re-renders every `ms`, for components that show how long ago something was heard. */
/**
 * Whether something was heard from within the last `timeout` ms. Call the
 * returned `touch()` each time it is heard from. Unlike polling the clock,
 * this re-renders only when the answer changes, not every second.
 */
export function usePresence(timeout) {
    const [present, setPresent] = useState(false);
    const lastRef = useRef(0);

    useEffect(() => {
        const timer = setInterval(() => {
            if (Date.now() - lastRef.current >= timeout) setPresent(false);
        }, 1000);
        return () => clearInterval(timer);
    }, [timeout]);

    const touch = useCallback(() => {
        lastRef.current = Date.now();
        setPresent(true);
    }, []);

    return [present, touch];
}

/**
 * Which screens have been heard from within `timeout` ms, as { [screen]: true }.
 * Call `heard(screen)` each time one speaks. Timestamps live in a ref, so a
 * heartbeat from a screen already shown as connected re-renders nothing — with
 * several Control Centers open, those arrive many times a second.
 */
export function useSeen(timeout) {
    const [present, setPresent] = useState({});
    const seenRef = useRef({});

    useEffect(() => {
        const timer = setInterval(() => {
            const cutoff = Date.now() - timeout;
            setPresent((current) => {
                let next = current;
                for (const screen of Object.keys(current)) {
                    if ((seenRef.current[screen] ?? 0) < cutoff) {
                        if (next === current) next = { ...current };
                        delete next[screen];
                    }
                }
                return next;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [timeout]);

    const heard = useCallback((screen) => {
        seenRef.current[screen] = Date.now();
        setPresent((current) => (current[screen] ? current : { ...current, [screen]: true }));
    }, []);

    const forget = useCallback((screen) => {
        delete seenRef.current[screen];
        setPresent((current) => {
            if (!current[screen]) return current;
            const { [screen]: _gone, ...rest } = current;
            return rest;
        });
    }, []);

    return [present, heard, forget];
}

export function useNow(ms = 1000) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), ms);
        return () => clearInterval(timer);
    }, [ms]);

    return now;
}

// The roller's samples are drawn at random on every request, so they are
// left out when deciding whether the raffle changed.
const withoutSamples = ({ sample_names, sample_tickets, ...rest } = {}) => rest;

/**
 * `fresh` unless it shows the same raffle as `current`, in which case
 * `current` itself — so a screen's regular check with the server re-renders
 * nothing when nothing changed.
 */
export function keepIfSame(current, fresh) {
    if (!current || !fresh) return fresh;
    return JSON.stringify(withoutSamples(current)) === JSON.stringify(withoutSamples(fresh)) ? current : fresh;
}

/**
 * `fresh` unless it says the same as `current` (deep-equal): a main screen
 * reporting the same state again changes nothing, so nothing re-renders.
 */
export function keepIfEqual(current, fresh) {
    if (!current || !fresh) return fresh;
    return JSON.stringify(current) === JSON.stringify(fresh) ? current : fresh;
}

/** `fresh` unless it lists the same winners as `current`. */
export function keepWinnersIfSame(current, fresh) {
    if (!current || !fresh) return fresh;
    return JSON.stringify(current) === JSON.stringify(fresh) ? current : fresh;
}
