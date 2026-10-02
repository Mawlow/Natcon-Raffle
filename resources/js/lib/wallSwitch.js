import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Lets the Control Center put a different raffle on the LED wall without
 * anyone touching the screens. Every screen window listens on one channel
 * shared by all raffles; told to switch, it moves to the new raffle inside
 * the app — no page load — so a screen in fullscreen stays fullscreen.
 *
 * A switch names the setup it is for: the one-screen setup moves the single
 * screen; the three-screen setup moves the main screen and both sub screens.
 */
const CHANNEL = 'natcon-wall';

// Which setup each screen belongs to.
const SETUP_OF = { single: 'single', display: 'display', winner: 'display', prize: 'display' };

export function switchWall(raffleId, setup) {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: 'switch-raffle', raffleId: String(raffleId), setup });
    channel.close();
}

/** Moves this screen (`path`: single, display, winner or prize) when the Control Center switches raffle. */
export function useWallSwitch(path, raffleId) {
    const navigate = useNavigate();
    const { search } = useLocation();

    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return undefined;
        const channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = (event) => {
            const message = event.data;
            if (message?.type !== 'switch-raffle' || message.setup !== SETUP_OF[path]) return;
            if (!message.raffleId || message.raffleId === String(raffleId)) return;
            navigate(`/raffle/${message.raffleId}/${path}${search}`, { replace: true });
        };
        return () => channel.close();
    }, [path, raffleId, navigate, search]);
}
