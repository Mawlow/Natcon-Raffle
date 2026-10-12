import { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { fitInMargins, useScreenMargins } from '../../lib/screenMargins';
import { useFullscreenOnRequest } from '../../lib/ledDisplays';

// Where a screen's backdrop is drawn: a full-size layer under the content.
const BackdropHost = createContext(null);

/**
 * Keeps an LED screen's content inside the margins set for it in the Control
 * Center (see lib/screenMargins), while its background still fills the
 * whole wall. A screen's backdrop (see ScreenBackdrop) is drawn in a layer of
 * its own at full size; everything else — logos, titles, winners — is
 * shrunk into the safe area above it. The same boxes are always rendered, so
 * a change of margins never restarts the screen, even mid-draw.
 */
export default function ScreenMargins({ screen, children }) {
    const fit = fitInMargins(useScreenMargins(screen));
    const [host, setHost] = useState(null);
    // The Control Center's SHOW puts this window fullscreen (see lib/ledDisplays).
    useFullscreenOnRequest();

    return (
        <div className="screen-margins fixed inset-0 overflow-hidden bg-ink">
            <div ref={setHost} className="absolute inset-0 z-0" />
            <div
                className="relative z-[1] overflow-hidden"
                style={{
                    width: '100vw',
                    height: '100vh',
                    ...(fit ? {
                        transformOrigin: '0 0',
                        // A transform also holds the screen's fixed layers inside the safe area.
                        transform: `translate(${fit.x}vw, ${fit.y}vh) scale(${fit.scale})`,
                    } : {}),
                }}
            >
                <BackdropHost.Provider value={host}>{children}</BackdropHost.Provider>
            </div>
        </div>
    );
}

/**
 * A screen's background. On an LED screen it is drawn full size behind the
 * content, outside the margins; anywhere else (the landing page, the Control
 * Center's previews) it stays where it is.
 */
export function ScreenBackdrop({ children }) {
    const host = useContext(BackdropHost);
    return host ? createPortal(children, host) : children;
}
