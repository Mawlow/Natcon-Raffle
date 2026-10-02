import { useEffect, useRef } from 'react';

/**
 * Keeps the Prize Display screen in step with its control page. The screen
 * checks the server every few seconds anyway; when both windows are in the
 * same browser, the control page also tells it the moment the prize changes,
 * so the wall switches at once.
 */
const CHANNEL = 'natcon-prize-show';

export function notifyPrizeShow() {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: 'changed' });
    channel.close();
}

/** Calls `onChange` whenever the control page reports a change. */
export function usePrizeShowChanges(onChange) {
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return undefined;
        const channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = (event) => {
            if (event.data?.type === 'changed') onChangeRef.current?.();
        };
        return () => channel.close();
    }, []);
}

/** The key the Prize Display's logo sizes are stored under (see lib/logoSizes). */
export const PRIZE_SHOW_SIZES_KEY = 'prize-show';
