import { useCallback, useEffect, useRef } from 'react';
import { createAudioEngine } from './audioEngine';

/**
 * React wrapper around the audio engine.
 *
 * One engine per mounted display; it is torn down with the component, and
 * every cue is a no-op until `unlock()` has run inside a user gesture.
 */
export function useSoundEngine(enabled = true) {
    const engineRef = useRef(null);

    if (engineRef.current === null) {
        engineRef.current = createAudioEngine();
    }

    const unlock = useCallback(async () => {
        if (!enabled) return false;

        return engineRef.current.unlock();
    }, [enabled]);

    const play = useCallback((name, options) => {
        if (!enabled) return;

        engineRef.current.play(name, options);
    }, [enabled]);

    const stop = useCallback(() => engineRef.current.stop(), []);

    // Muting cuts whatever is already sounding, not just what comes next.
    useEffect(() => {
        if (!enabled) engineRef.current.stopAll();
    }, [enabled]);

    useEffect(() => {
        const engine = engineRef.current;

        return () => engine.close();
    }, []);

    return { unlock, play, stop, isUnlocked: () => engineRef.current.isUnlocked() };
}
