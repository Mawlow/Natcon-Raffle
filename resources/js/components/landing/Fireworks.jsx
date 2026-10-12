import { useEffect, useRef } from 'react';
import { isLite } from '../../lib/liteMode';

/**
 * Fireworks over the skyline: rockets climb with a spark trail and burst
 * into shells that droop under gravity, glitter and fade.
 *
 * The canvas stays transparent. Each frame erases a little of the previous
 * one instead of clearing it, which leaves the streaks real fireworks have
 * without painting a background over the scene behind.
 *
 * mode="ambient" keeps a steady, unhurried show going. mode="celebration"
 * launches nothing until `active` turns on, then fires dense volleys for as
 * long as it stays on — the moment a winner is revealed.
 */

// Gold-led palette with a few warm accents, as [hue, saturation, lightness].
const PALETTE = [
    [45, 90, 62],  // gold
    [42, 80, 78],  // champagne
    [48, 100, 88], // pale gold / white-hot
    [30, 95, 60],  // amber
    [8, 85, 62],   // coral red
    [330, 70, 70], // rose
];

const GRAVITY = 0.035;

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export default function Fireworks({ className = '', mode = 'ambient', active = true }) {
    const canvasRef = useRef(null);
    // Read inside the animation loop, so a change of props doesn't restart it
    // and wipe the sparks already in the air.
    const liveRef = useRef({ mode, active });
    liveRef.current = { mode, active };

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
        // Light mode (weaker screens): no fireworks, the heaviest thing per frame.
        if (isLite()) return undefined;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let width = 0;
        let height = 0;
        let frame = 0;
        let nextLaunch = 0;
        let lastFrame = 0;
        let wasActive = false;
        // Frames of fading still owed to the trails left on the canvas.
        let fadeLeft = 0;
        const rockets = [];
        const sparks = [];

        const resize = () => {
            // Sparks are soft streaks, so a sharper canvas buys nothing but
            // pixels to clear every frame.
            const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
            width = canvas.clientWidth;
            height = canvas.clientHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        // Rockets favour the two sides, so bursts frame the headline rather
        // than going off behind it.
        const launch = () => {
            const side = Math.random();
            const x = side < 0.42 ? rand(0.04, 0.34) : side < 0.84 ? rand(0.66, 0.96) : rand(0.38, 0.62);
            const targetY = height * rand(0.1, 0.42);
            const startY = height + 10;
            // Speed chosen so the rocket just reaches its target under gravity.
            const vy = -Math.sqrt(2 * GRAVITY * (startY - targetY));
            rockets.push({ x: width * x, y: startY, vx: rand(-0.6, 0.6), vy, color: pick(PALETTE) });
        };

        const burst = (x, y, color) => {
            const type = pick(['peony', 'peony', 'willow', 'ring', 'crackle']);
            const count = type === 'ring' ? 70 : type === 'willow' ? 110 : 130;
            const power = rand(2.6, 4.2) * Math.min(1, width / 1200 + 0.35);
            const tilt = rand(0, Math.PI);
            const secondary = Math.random() < 0.35 ? pick(PALETTE) : color;

            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2 + rand(-0.04, 0.04);
                let speed;
                let vx;
                let vy;
                if (type === 'ring') {
                    speed = power;
                    // A flattened, tilted circle reads as a ring seen at an angle.
                    const cx = Math.cos(angle) * speed;
                    const cy = Math.sin(angle) * speed * 0.45;
                    vx = cx * Math.cos(tilt) - cy * Math.sin(tilt);
                    vy = cx * Math.sin(tilt) + cy * Math.cos(tilt);
                } else {
                    // Cube-root spread fills the sphere evenly instead of
                    // piling sparks on its rim.
                    speed = power * Math.cbrt(Math.random());
                    vx = Math.cos(angle) * speed;
                    vy = Math.sin(angle) * speed;
                }

                const willow = type === 'willow';
                sparks.push({
                    x,
                    y,
                    px: x,
                    py: y,
                    vx,
                    vy,
                    life: willow ? rand(110, 150) : rand(60, 95),
                    age: 0,
                    drag: willow ? 0.975 : 0.955,
                    gravity: willow ? GRAVITY * 1.25 : GRAVITY,
                    size: willow ? 1.4 : rand(1.2, 2.1),
                    color: willow ? PALETTE[0] : i % 3 === 0 ? secondary : color,
                    crackle: type === 'crackle',
                });
            }

            // The flash of the charge going off.
            sparks.push({ x, y, px: x, py: y, vx: 0, vy: 0, life: 10, age: 0, drag: 1, gravity: 0, size: 26, color: [48, 100, 90], flash: true });
        };

        const step = (time) => {
            frame = requestAnimationFrame(step);

            // The physics advances per frame, so hold it near 60fps; on a
            // 120Hz display it would otherwise run at double speed.
            if (time - lastFrame < 15) return;
            lastFrame = time;

            const { mode: currentMode, active: isActive } = liveRef.current;

            // Nothing in the air and nothing to launch: leave the canvas
            // alone instead of erasing an empty screen every frame.
            const idle = !isActive && rockets.length === 0 && sparks.length === 0;
            if (idle && fadeLeft <= 0) {
                wasActive = false;
                return;
            }
            if (idle) {
                fadeLeft -= 1;
                // The last of the trails, wiped clean rather than left faint.
                if (fadeLeft === 0) ctx.clearRect(0, 0, width, height);
            } else {
                fadeLeft = 40;
            }

            // Fade last frame's pixels to leave trails.
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'lighter';

            const celebrating = currentMode === 'celebration';

            // A celebration opens the instant it is switched on.
            if (isActive && !wasActive) nextLaunch = time;
            wasActive = isActive;

            if (isActive && time >= nextLaunch) {
                if (celebrating) {
                    const volley = Math.random() < 0.5 ? 3 : 2;
                    for (let i = 0; i < volley; i++) setTimeout(launch, i * rand(90, 220));
                    nextLaunch = time + rand(260, 650);
                } else {
                    launch();
                    if (Math.random() < 0.25) setTimeout(launch, rand(150, 450));
                    nextLaunch = time + rand(700, 1900);
                }
            }

            for (let i = rockets.length - 1; i >= 0; i--) {
                const r = rockets[i];
                const px = r.x;
                const py = r.y;
                r.vy += GRAVITY;
                r.x += r.vx;
                r.y += r.vy;

                ctx.strokeStyle = `hsla(40, 90%, 75%, 0.9)`;
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(r.x, r.y);
                ctx.stroke();

                // A few embers shed along the climb.
                if (Math.random() < 0.5) {
                    sparks.push({ x: r.x, y: r.y, px: r.x, py: r.y, vx: rand(-0.3, 0.3), vy: rand(0, 0.6), life: rand(18, 30), age: 0, drag: 0.94, gravity: GRAVITY * 0.5, size: 1, color: [38, 90, 65] });
                }

                if (r.vy >= -0.4) {
                    burst(r.x, r.y, r.color);
                    rockets.splice(i, 1);
                }
            }

            for (let i = sparks.length - 1; i >= 0; i--) {
                const s = sparks[i];
                s.age++;
                if (s.age >= s.life) {
                    sparks.splice(i, 1);
                    continue;
                }

                const fade = 1 - s.age / s.life;
                const [h, sat, light] = s.color;

                if (s.flash) {
                    const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * (1 + s.age / 3));
                    glow.addColorStop(0, `hsla(${h}, ${sat}%, ${light}%, ${0.5 * fade})`);
                    glow.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
                    ctx.fillStyle = glow;
                    ctx.fillRect(s.x - 80, s.y - 80, 160, 160);
                    continue;
                }

                s.px = s.x;
                s.py = s.y;
                s.vx *= s.drag;
                s.vy = s.vy * s.drag + s.gravity;
                s.x += s.vx;
                s.y += s.vy;

                // Glitter: crackle shells, and every shell near its end.
                let alpha = fade;
                if (s.crackle || fade < 0.35) alpha *= Math.random() < 0.5 ? 1 : 0.2;

                ctx.strokeStyle = `hsla(${h}, ${sat}%, ${light + (1 - fade) * 10}%, ${alpha})`;
                ctx.lineWidth = s.size * (0.5 + fade * 0.6);
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(s.px, s.py);
                ctx.lineTo(s.x, s.y);
                ctx.stroke();
            }
        };

        const onVisibility = () => {
            cancelAnimationFrame(frame);
            if (!document.hidden) {
                nextLaunch = 0;
                frame = requestAnimationFrame(step);
            }
        };

        resize();
        window.addEventListener('resize', resize);
        document.addEventListener('visibilitychange', onVisibility);
        frame = requestAnimationFrame(step);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', resize);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);

    return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
