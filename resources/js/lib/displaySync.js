import { useCallback, useEffect, useRef, useState } from 'react';

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
 *   screens → control  { type: 'presence', screen }       every HEARTBEAT_MS, and in reply to control-presence ('winner' | 'prize')
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
        const channel = openDisplayChannel(raffleId, (message) => {
            // Answering the Control Center's own heartbeat keeps this screen
            // showing as connected even if the browser slows its timers.
            if (message?.type === 'hello' || message?.type === 'control-presence') {
                channel.post({ type: 'presence', screen });
            }
        });
        channel.post({ type: 'presence', screen });
        const timer = setInterval(() => channel.post({ type: 'presence', screen }), HEARTBEAT_MS);

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

/** `fresh` unless it lists the same winners as `current`. */
export function keepWinnersIfSame(current, fresh) {
    if (!current || !fresh) return fresh;
    return JSON.stringify(current) === JSON.stringify(fresh) ? current : fresh;
}
