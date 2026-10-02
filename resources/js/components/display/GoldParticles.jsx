import { useEffect, useRef } from 'react';

const COLORS = ['#d4af37', '#f5d76e', '#e8c766', '#ffffff'];

/**
 * A restrained gold confetti burst on the winner reveal — canvas based so it
 * stays smooth on a projector, and it cleans itself up when the pieces settle.
 */
export default function GoldParticles({ active, pieces = 130 }) {
    const canvasRef = useRef(null);
    const frameRef = useRef(null);

    useEffect(() => {
        if (!active) return undefined;

        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const context = canvas.getContext('2d');
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        const count = reduceMotion ? Math.round(pieces / 4) : pieces;

        const resize = () => {
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = canvas.offsetWidth * ratio;
            canvas.height = canvas.offsetHeight * ratio;
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
        };

        resize();
        window.addEventListener('resize', resize);

        const width = () => canvas.offsetWidth;
        const height = () => canvas.offsetHeight;

        const particles = Array.from({ length: count }, () => ({
            x: width() * (0.15 + Math.random() * 0.7),
            y: height() * (0.35 + Math.random() * 0.2),
            vx: (Math.random() - 0.5) * 7,
            vy: -6 - Math.random() * 9,
            size: 2 + Math.random() * 5,
            rotation: Math.random() * Math.PI,
            spin: (Math.random() - 0.5) * 0.25,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            life: 1,
            decay: 0.004 + Math.random() * 0.006,
        }));

        const render = () => {
            context.clearRect(0, 0, width(), height());
            let alive = false;

            particles.forEach((particle) => {
                if (particle.life <= 0) return;
                alive = true;

                particle.vy += 0.22;
                particle.vx *= 0.992;
                particle.x += particle.vx;
                particle.y += particle.vy;
                particle.rotation += particle.spin;
                particle.life -= particle.decay;

                context.save();
                context.globalAlpha = Math.max(0, particle.life);
                context.translate(particle.x, particle.y);
                context.rotate(particle.rotation);
                context.fillStyle = particle.color;
                context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 1.8);
                context.restore();
            });

            if (alive) {
                frameRef.current = requestAnimationFrame(render);
            }
        };

        frameRef.current = requestAnimationFrame(render);

        return () => {
            window.removeEventListener('resize', resize);
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
            context.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
        };
    }, [active, pieces]);

    if (!active) return null;

    return (
        <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
        />
    );
}
