import { useEffect, useState } from 'react';

// A logo with more than this share of its ink in near-black is put on a plate.
const DARK_SHARE = 0.2;
// Below this brightness (0–1) a pixel counts as dark ink.
const DARK_LUMINANCE = 0.3;

const measured = new Map();

/**
 * Whether a logo is drawn mostly in dark ink, measured from its pixels: the
 * file is drawn small onto a canvas and its opaque pixels are counted. Each
 * file is measured once per page and remembered.
 */
function measureDarkInk(src) {
    if (measured.has(src)) return measured.get(src);

    const result = new Promise((resolve) => {
        const image = new Image();
        image.onload = () => {
            try {
                const size = 96;
                const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight, 1);
                const width = Math.max(1, Math.round(image.naturalWidth * scale));
                const height = Math.max(1, Math.round(image.naturalHeight * scale));
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                context.drawImage(image, 0, 0, width, height);
                const { data } = context.getImageData(0, 0, width, height);

                let ink = 0;
                let dark = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3] < 128) continue;
                    ink += 1;
                    const luminance = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
                    if (luminance < DARK_LUMINANCE) dark += 1;
                }
                resolve(ink > 0 && dark / ink > DARK_SHARE);
            } catch {
                resolve(false);
            }
        };
        image.onerror = () => resolve(false);
        image.src = src;
    });

    measured.set(src, result);
    return result;
}

/**
 * A logo for the LED screens, filling the box it is put in. A logo with its
 * own version for a dark stage (`stageSrc`, the catalogue's `stage_path`:
 * the same artwork with its dark lettering lifted to light) is drawn bare in
 * that version. Otherwise logos drawn in dark ink, which would vanish on the
 * black stage, sit on a soft light plate:
 * any logo the catalogue tags `tone: 'dark'`, and any other whose pixels
 * turn out to be mostly dark. Light logos sit bare, as before. `measure`
 * is off for the NATCON logo, which is known to read on black.
 */
export default function StageLogo({ src, alt, tone, stageSrc, measure = true }) {
    const tagged = tone === 'dark' && !stageSrc;
    const [darkInk, setDarkInk] = useState(false);

    useEffect(() => {
        if (tagged || stageSrc || !measure || !src) return undefined;
        let live = true;
        measureDarkInk(src).then((dark) => {
            if (live) setDarkInk(dark);
        });
        return () => {
            live = false;
        };
    }, [src, tagged, stageSrc, measure]);

    if (stageSrc) {
        return <img src={stageSrc} alt={alt} className="block h-full w-full object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]" />;
    }

    if (tagged || darkInk) {
        return (
            <span
                className="grid h-full w-full place-items-center rounded-[12%/26%] bg-[#f4efe2] shadow-[0_8px_30px_rgba(0,0,0,0.45)] ring-1 ring-gold/40"
                style={{ padding: '8% 7%' }}
            >
                <img src={src} alt={alt} className="block h-full w-full object-contain" />
            </span>
        );
    }

    return <img src={src} alt={alt} className="block h-full w-full object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]" />;
}
