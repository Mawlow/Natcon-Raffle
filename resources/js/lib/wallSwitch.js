import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

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
        const announce = () => channel.postMessage({ type: 'on-wall', raffleId: String(raffleId) });
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
            if (message?.type !== 'switch-raffle' || (message.setup && message.setup !== SETUP_OF[path])) return;
            if (!message.raffleId || message.raffleId === String(raffleId)) return;
            navigate(`/raffle/${message.raffleId}/${path}${search}`, { replace: true });
        };
        return () => channel.close();
    }, [path, raffleId, navigate, search]);
}

/**
 * The raffle the main screen is showing right now, as its id, or null when
 * no main screen is open.
 */
export function useWallRaffle() {
    const [onWall, setOnWall] = useState(null);

    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return undefined;
        const channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = (event) => {
            if (event.data?.type === 'on-wall') setOnWall({ raffleId: event.data.raffleId, at: Date.now() });
        };
        channel.postMessage({ type: 'who-is-on-wall' });
        // Forget a screen that has gone quiet.
        const timer = setInterval(() => {
            setOnWall((current) => (current && Date.now() - current.at > ON_WALL_TIMEOUT_MS ? null : current));
        }, ON_WALL_MS);
        return () => {
            clearInterval(timer);
            channel.close();
        };
    }, []);

    return onWall?.raffleId ?? null;
}
