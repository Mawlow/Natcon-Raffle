import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { refreshScreen } from './refreshScreen';

/**
 * Lets the Control Center put a different raffle on the LED wall without
 * anyone touching the screens. Every screen window listens on one channel
 * shared by all raffles; told to switch, it moves to the new raffle inside
 * the app — no page load — so a screen in fullscreen stays fullscreen.
 *
 * A switch names the setup it is for: the one-screen setup moves the single
 * screen; the three-screen setup moves the main screen and both sub screens.
 * Without a setup, every open screen moves.
 */
const CHANNEL = 'natcon-wall';

// Which setup each screen belongs to.
const SETUP_OF = { single: 'single', display: 'display', winner: 'display', prize: 'display' };

export function switchWall(raffleId, setup = null) {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: 'switch-raffle', raffleId: String(raffleId), setup });
    channel.close();
}

/**
 * Refreshes the wall's screens from the Control Center, as each screen's own
 * refresh button would (a fullscreen screen stays fullscreen). With a setup,
 * only that setup's screens; without, every open screen.
 */
export function refreshWall(setup = null) {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: 'refresh-screen', setup });
    channel.close();
}

// How often a main screen says which raffle it shows, and how long that holds.
const ON_WALL_MS = 2000;
const ON_WALL_TIMEOUT_MS = 6000;

/** Moves this screen (`path`: single, display, winner or prize) when the Control Center switches raffle. */
export function useWallSwitch(path, raffleId) {
    const navigate = useNavigate();
    const { search } = useLocation();

    // A main screen says which raffle it is showing, so the Control Center
    // can work on whatever is on the wall (see useWallRaffle).
    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined' || (path !== 'single' && path !== 'display')) return undefined;
        const channel = new BroadcastChannel(CHANNEL);
        const announce = () => channel.postMessage({ type: 'on-wall', raffleId: String(raffleId), setup: SETUP_OF[path] });
        announce();
        const timer = setInterval(announce, ON_WALL_MS);
        channel.onmessage = (event) => {
            if (event.data?.type === 'who-is-on-wall') announce();
        };
        return () => {
            clearInterval(timer);
            channel.close();
        };
    }, [path, raffleId]);

    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return undefined;
        const channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = (event) => {
            const message = event.data;
            if (message?.setup && message.setup !== SETUP_OF[path]) return;
            if (message?.type === 'refresh-screen') {
                refreshScreen();
                return;
            }
            if (message?.type !== 'switch-raffle') return;
            if (!message.raffleId || message.raffleId === String(raffleId)) return;
            navigate(`/raffle/${message.raffleId}/${path}${search}`, { replace: true });
        };
        return () => channel.close();
    }, [path, raffleId, navigate, search]);
}

/**
 * The raffle the main screen is showing right now, as its id, or null when
 * no main screen is open. With several main screens open (a second window
 * left behind, or both setups' screens), the one of this Control Center's
 * own setup wins, then the one showing this raffle — and the answer only
 * changes when a screen comes or goes, so the Logos tab never flips
 * between two windows.
 */
export function useWallRaffle({ raffleId = null, setup = null } = {}) {
    // Every main screen heard from: key → { raffleId, setup, at }.
    const [screens, setScreens] = useState({});

    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return undefined;
        const channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = (event) => {
            if (event.data?.type !== 'on-wall') return;
            const key = `${event.data.setup ?? 'any'}/${event.data.raffleId}`;
            setScreens((current) => {
                const known = current[key];
                // Still the same screen: only its clock moves, nothing re-renders.
                if (known) {
                    known.at = Date.now();
                    return current;
                }
                return { ...current, [key]: { raffleId: event.data.raffleId, setup: event.data.setup ?? null, at: Date.now() } };
            });
        };
        channel.postMessage({ type: 'who-is-on-wall' });
        // Forget a screen that has gone quiet.
        const timer = setInterval(() => {
            setScreens((current) => {
                const cutoff = Date.now() - ON_WALL_TIMEOUT_MS;
                const alive = Object.entries(current).filter(([, screen]) => screen.at >= cutoff);
                return alive.length === Object.keys(current).length ? current : Object.fromEntries(alive);
            });
        }, ON_WALL_MS);
        return () => {
            clearInterval(timer);
            channel.close();
        };
    }, []);

    const list = Object.values(screens);
    if (list.length === 0) return null;
    const ours = setup ? list.filter((screen) => screen.setup === setup) : list;
    const pool = ours.length ? ours : list;
    const same = raffleId !== null ? pool.find((screen) => screen.raffleId === String(raffleId)) : null;
    return (same ?? pool[0]).raffleId;
}
