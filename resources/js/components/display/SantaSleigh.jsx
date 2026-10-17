/**
 * Santa's sleigh and reindeer flying across the wall, as a gold silhouette
 * with a trail of sparkle behind it — for the CLI standby. It crosses from
 * the left edge to the right over `seconds`, bobbing gently, then comes
 * round again. `top` and `height` place the flight band on the screen.
 */
export default function SantaSleigh({ top = '20%', height = '12vh', seconds = 24 }) {
    return (
        <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 z-[2] overflow-hidden"
            style={{ top, height }}
        >
            <div className="absolute left-0 top-0 h-full [animation:sleigh-fly_var(--s)_linear_infinite]" style={{ '--s': `${seconds}s` }}>
                <div className="h-full [animation:sleigh-bob_2.6s_ease-in-out_infinite]">
                    <svg viewBox="0 0 700 150" className="h-full w-auto" fill="#e4c15c" style={{ filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.55)) drop-shadow(0 6px 10px rgba(0,0,0,0.6))' }}>
                        {/* Sparkle trail behind the sleigh */}
                        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                            <circle key={i} cx={88 - i * 11} cy={95 + (i % 2 ? 6 : -4)} r={3.5 - i * 0.35} opacity={0.9 - i * 0.1} className="[animation:sleigh-twinkle_1.2s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}

                        {/* Two reindeer, mid-leap */}
                        {[330, 490].map((dx) => (
                            <g key={dx} transform={`translate(${dx} 0)`}>
                                {/* body */}
                                <ellipse cx="95" cy="92" rx="44" ry="19" />
                                {/* chest & neck */}
                                <path d="M128 86 C138 70 150 58 160 50 L170 62 C158 72 150 84 142 98 Z" />
                                {/* head */}
                                <path d="M160 46 L190 42 L198 50 L186 60 L170 64 Z" />
                                {/* ear */}
                                <path d="M166 44 L160 32 L172 40 Z" />
                                {/* antlers */}
                                <path d="M178 42 L182 22 L176 10 M182 22 L190 14 M182 24 L194 24" stroke="#e4c15c" strokeWidth="4" fill="none" strokeLinecap="round" />
                                {/* front legs stretched forward */}
                                <path d="M128 102 L150 118 L158 112 L136 96 Z" />
                                <path d="M118 104 L134 128 L142 124 L128 100 Z" />
                                {/* hind legs stretched back */}
                                <path d="M62 100 L30 112 L34 120 L68 108 Z" />
                                <path d="M70 104 L52 130 L60 134 L78 110 Z" />
                                {/* tail */}
                                <path d="M52 84 L40 74 L46 90 Z" />
                            </g>
                        ))}

                        {/* Reins */}
                        <path d="M266 84 C320 62 420 58 496 54 M520 52 C570 44 620 46 654 46" stroke="#e4c15c" strokeWidth="3" fill="none" strokeLinecap="round" />

                        {/* Sleigh: a curved body on runners, with Santa and a sack of gifts */}
                        <g transform="translate(0 0)">
                            {/* runner */}
                            <path d="M150 126 C120 126 100 118 96 110 C96 106 104 106 108 112 C114 120 128 120 150 120 L250 120 C262 120 268 112 266 100 C272 100 274 118 258 126 Z" />
                            {/* body */}
                            <path d="M150 112 L150 82 C150 68 160 60 172 60 L176 60 L176 84 L238 84 L238 70 L252 70 C262 70 264 76 264 84 L264 112 Z" />
                            {/* sack of gifts */}
                            <path d="M236 82 C226 56 200 48 190 54 C186 66 198 80 214 82 Z" />
                            <circle cx="212" cy="60" r="8" />
                            {/* Santa: body, head, hat, arm */}
                            <path d="M178 84 L180 62 C182 50 198 50 200 62 L202 84 Z" />
                            <circle cx="190" cy="44" r="9" />
                            <path d="M181 40 L190 24 L203 36 Z" />
                            <circle cx="203" cy="36" r="3" />
                            <path d="M200 70 L220 60 L224 66 L204 78 Z" />
                        </g>
                    </svg>
                </div>
            </div>
        </div>
    );
}
