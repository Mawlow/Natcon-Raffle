import { useEffect, useState } from 'react';
import { AUTO_FS_KEY } from './ledDisplays';

const EVENT = 'natcon-refresh-screen';

/**
 * The display screens' refresh button. A real page reload always drops the
 * browser out of fullscreen (and it cannot be switched back on without a
 * click), so while fullscreen the screen is rebuilt in place instead: every
 * page is mounted afresh and loads its data again, and the wall stays
 * fullscreen. Outside fullscreen it is an ordinary reload.
 */
export function refreshScreen() {
    // Where fullscreen comes back by itself after a reload, a real reload is
    // better: it also picks up a new build of the app.
    let autoFullscreen = false;
    try {
        autoFullscreen = window.sessionStorage.getItem(AUTO_FS_KEY) === '1';
    } catch {
        /* Storage can be blocked. */
    }
    if (document.fullscreenElement && !autoFullscreen) window.dispatchEvent(new Event(EVENT));
    else window.location.reload();
}

/** A key that changes on every in-place refresh, for remounting the app. */
export function useRefreshKey() {
    const [key, setKey] = useState(0);
    useEffect(() => {
        const onRefresh = () => setKey((value) => value + 1);
        window.addEventListener(EVENT, onRefresh);
        return () => window.removeEventListener(EVENT, onRefresh);
    }, []);
    return key;
}
