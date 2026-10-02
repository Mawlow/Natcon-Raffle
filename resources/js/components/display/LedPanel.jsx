import { useCallback, useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import HashtagMark from './HashtagMark';

/**
 * The frame of a 12×7 LED sub screen. Content is laid out in a 12:7 box and
 * sized with container units (cqw / cqh), so it fills the panel at any pixel
 * resolution; a window of another shape gets black bars, never a stretch.
 */
export default function LedPanel({ children, overlay = null }) {
    const [fullscreen, setFullscreen] = useState(false);

    useEffect(() => {
        const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    const toggleFullscreen = useCallback(async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
        } catch {
            /* The browser may refuse; the layout works either way. */
        }
    }, []);

    return (
        <div className="fixed inset-0 grid place-items-center overflow-hidden bg-ink">
            <div
                className="relative overflow-hidden bg-ink"
                style={{
                    aspectRatio: '12 / 7',
                    width: 'min(100vw, calc(100vh * 12 / 7))',
                    containerType: 'size',
                }}
            >
                <LedBackdrop />

                {overlay}

                {/* Invisible until hovered, so it never shows on the wall. */}
                <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="absolute right-3 top-3 z-30 rounded-lg border border-line bg-black/50 p-2 text-muted opacity-0 backdrop-blur transition hover:text-gold hover:opacity-100 focus:opacity-100"
                    aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                    {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>

                <div className="relative z-10 flex h-full w-full flex-col items-center px-[5cqw] py-[5cqh] text-center">
                    {children}
                    <HashtagMark units="cq" />
                </div>
            </div>
        </div>
    );
}

/** The panel's dimmed event artwork with a soft gold glow; the Control Center's preview uses it too. */
export function LedBackdrop() {
    return (
        <div className="absolute inset-0 z-0" aria-hidden="true">
            <img src="/images/natcon-2026.webp" alt="" className="h-full w-full object-cover opacity-40 blur-[3px]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(5,5,5,0.75),rgba(5,5,5,0.92)_40%,rgba(5,5,5,0.97))]" />
            <div className="absolute inset-0 bg-[radial-gradient(55%_50%_at_50%_55%,rgba(212,175,55,0.14),transparent_70%)]" />
        </div>
    );
}
