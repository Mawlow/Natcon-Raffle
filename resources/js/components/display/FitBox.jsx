import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Shrinks its content to fit the room it is given, so long winner names (or
 * a long list of them) scale down on the wall instead of running off the
 * screen. Content that already fits is left at full size.
 *
 * The box needs a height to fit into: a flex-1 slot, or a max-height.
 */
export default function FitBox({ children, className = '', origin = 'top center' }) {
    const outerRef = useRef(null);
    const innerRef = useRef(null);
    const [scale, setScale] = useState(1);

    useLayoutEffect(() => {
        const outer = outerRef.current;
        const inner = innerRef.current;
        if (!outer || !inner) return undefined;

        // A transform does not change layout size, so the content is always
        // measured at its natural size and the scale never feeds back on itself.
        const measure = () => {
            const height = inner.scrollHeight;
            const width = inner.scrollWidth;
            if (!height || !width) return;
            const next = Math.min(1, outer.clientHeight / height, outer.clientWidth / width);
            setScale((current) => (Math.abs(current - next) > 0.005 ? next : current));
        };

        const observer = new ResizeObserver(measure);
        observer.observe(outer);
        observer.observe(inner);
        // New names arriving change the content without resizing the box itself.
        const mutations = new MutationObserver(measure);
        mutations.observe(inner, { childList: true, subtree: true, characterData: true });
        measure();

        return () => {
            observer.disconnect();
            mutations.disconnect();
        };
    }, []);

    return (
        <div ref={outerRef} className={`relative min-h-0 min-w-0 overflow-hidden ${className}`}>
            <div
                ref={innerRef}
                className="flex w-full flex-col items-center"
                style={{ transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: origin, transition: 'transform 300ms ease-out' }}
            >
                {children}
            </div>
        </div>
    );
}
