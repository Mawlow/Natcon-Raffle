/**
 * Christmas dressing for the CLI standby: a string of twinkling fairy
 * lights sagging along the top of the wall, snow drifting down over the
 * whole screen, and a sprig of holly in each bottom corner. All CSS
 * animations on a few dozen elements, so it costs the screen nothing.
 */

// The bulbs' colours, round and round along the wire.
const BULBS = ['#ff4d4d', '#ffd54a', '#4ade80', '#60a5fa', '#f472b6'];

// A fixed scatter of snowflakes (the same every time, so nothing jumps).
const seeded = (n) => {
    let x = 1234567 + n * 7919;
    return () => {
        x = (x * 48271) % 2147483647;
        return x / 2147483647;
    };
};
const FLAKES = Array.from({ length: 44 }, (_, i) => {
    const rand = seeded(i);
    return {
        left: `${rand() * 100}%`,
        size: `${0.35 + rand() * 0.6}vw`,
        duration: `${9 + rand() * 9}s`,
        delay: `${-rand() * 18}s`,
        drift: `${(rand() - 0.5) * 8}vw`,
        opacity: 0.35 + rand() * 0.5,
    };
});

export default function ChristmasDecor() {
    return (
        <>
            {/* Fairy lights along the top edge */}
            <svg
                aria-hidden="true"
                viewBox="0 0 1000 40"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-x-0 top-0 z-[2] w-full"
                style={{ height: '4.5vh' }}
            >
                <path d="M0 4 Q125 34 250 10 T500 10 T750 10 T1000 10" fill="none" stroke="#5a4a1e" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            </svg>
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[2]" style={{ height: '4.5vh' }}>
                {Array.from({ length: 26 }, (_, i) => {
                    // Follow the wire's sag: a cosine wave between its high and low points.
                    const t = (i + 0.5) / 26;
                    const sag = 0.5 - 0.5 * Math.cos(t * Math.PI * 8);
                    return (
                        <span
                            key={i}
                            className="absolute rounded-full [animation:xmas-twinkle_var(--d)_ease-in-out_infinite]"
                            style={{
                                left: `${t * 100}%`,
                                top: `${18 + sag * 55}%`,
                                width: '0.75vw',
                                height: '0.75vw',
                                marginLeft: '-0.375vw',
                                background: BULBS[i % BULBS.length],
                                boxShadow: `0 0 0.6vw 0.15vw ${BULBS[i % BULBS.length]}aa`,
                                '--d': `${1.4 + (i % 5) * 0.35}s`,
                                animationDelay: `${(i % 7) * 0.23}s`,
                            }}
                        />
                    );
                })}
            </div>

            {/* Snow */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
                {FLAKES.map((flake, i) => (
                    <span
                        key={i}
                        className="absolute top-0 rounded-full bg-white [animation:xmas-snow_var(--d)_linear_infinite]"
                        style={{
                            left: flake.left,
                            width: flake.size,
                            height: flake.size,
                            opacity: flake.opacity,
                            filter: 'blur(0.5px)',
                            boxShadow: '0 0 6px rgba(255,255,255,0.6)',
                            '--d': flake.duration,
                            '--drift': flake.drift,
                            animationDelay: flake.delay,
                        }}
                    />
                ))}
            </div>

            {/* Holly in the bottom corners */}
            <Holly className="left-[1.5vw]" />
            <Holly className="right-[1.5vw] -scale-x-100" />
        </>
    );
}

function Holly({ className }) {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 120 90"
            className={`pointer-events-none absolute bottom-[1.5vh] z-[2] ${className}`}
            style={{ width: '7vw', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }}
        >
            {/* Two leaves and a cluster of berries */}
            <path d="M12 70 C20 50 34 36 58 34 C52 44 54 52 48 58 C56 58 62 62 66 70 C54 72 44 68 36 72 C30 64 22 62 12 70 Z" fill="#2f8f4e" stroke="#1d6b36" strokeWidth="2" strokeLinejoin="round" />
            <path d="M58 34 C70 24 88 22 104 30 C96 36 94 44 98 52 C88 50 80 54 74 62 C70 52 64 46 58 48 C62 42 60 38 58 34 Z" fill="#3aa35c" stroke="#1d6b36" strokeWidth="2" strokeLinejoin="round" />
            <path d="M36 50 L50 56 M74 40 L90 42" stroke="#1d6b36" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="58" cy="60" r="7" fill="#e3342f" />
            <circle cx="68" cy="50" r="6" fill="#e3342f" />
            <circle cx="50" cy="44" r="5.5" fill="#e3342f" />
            <circle cx="56" cy="57" r="2" fill="#fff" opacity="0.7" />
            <circle cx="66" cy="47" r="1.6" fill="#fff" opacity="0.7" />
            <circle cx="48" cy="42" r="1.4" fill="#fff" opacity="0.7" />
        </svg>
    );
}
