/**
 * A company logo from the catalogue. Logos drawn in dark ink would vanish on
 * the black stage, so those sit on a soft light plate; light logos sit bare.
 */
export default function LogoMark({ logo, className = '', imgClassName = '', loading }) {
    if (!logo) return null;

    const plated = logo.tone === 'dark';

    return (
        <span
            className={`inline-flex items-center justify-center ${
                plated ? 'rounded-xl bg-[#f4efe2] px-[0.9em] py-[0.5em] shadow-[0_8px_30px_rgba(0,0,0,0.45)] ring-1 ring-gold/40' : ''
            } ${className}`}
        >
            <img src={logo.path} alt={logo.label} loading={loading} className={`block h-auto w-auto max-w-full object-contain ${imgClassName || 'max-h-full'}`} />
        </span>
    );
}
