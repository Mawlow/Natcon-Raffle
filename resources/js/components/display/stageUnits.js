/**
 * Viewport units for the main screen's header, written so the Control
 * Center's preview can stand in for the real screen: on the wall they are
 * plain vw / vh, and the preview sets --stage-vw / --stage-vh to the size of
 * the screen it is drawing, so the header lays out exactly as it will there.
 */
export const vw = (n) => `calc(var(--stage-vw, 1vw) * ${n})`;
export const vh = (n) => `calc(var(--stage-vh, 1vh) * ${n})`;
