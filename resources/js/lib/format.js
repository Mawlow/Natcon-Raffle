const CURRENCY_SYMBOLS = { PHP: '₱', USD: '$', EUR: '€', GBP: '£', JPY: '¥', SGD: 'S$', AUD: 'A$' };

export function formatPrizeValue(value, currency = 'PHP') {
    if (value === null || value === undefined || value === '') return null;

    const amount = Number(value);
    if (Number.isNaN(amount)) return null;

    const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
    const rounded = Number.isInteger(amount) ? amount : Number(amount.toFixed(2));

    return `${symbol}${rounded.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatNumber(value) {
    return Number(value ?? 0).toLocaleString();
}

export function formatDateTime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export function formatDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Input value for <input type="datetime-local">. */
export function toLocalInput(value) {
    if (!value) return '';
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const STATUS_STYLES = {
    DRAFT: 'border-white/15 text-muted bg-white/5',
    READY: 'border-sky-400/30 text-sky-300 bg-sky-400/10',
    LIVE: 'border-gold/50 text-gold-bright bg-gold/10',
    COMPLETED: 'border-emerald-400/30 text-emerald-300 bg-emerald-400/10',
    CANCELLED: 'border-red-400/30 text-red-300 bg-red-400/10',
    ACTIVE: 'border-emerald-400/30 text-emerald-300 bg-emerald-400/10',
    WINNER: 'border-gold/50 text-gold-bright bg-gold/10',
    DISQUALIFIED: 'border-red-400/30 text-red-300 bg-red-400/10',
    EXCLUDED: 'border-white/15 text-muted bg-white/5',
    SUCCESS: 'border-emerald-400/30 text-emerald-300 bg-emerald-400/10',
    FAILED: 'border-red-400/30 text-red-300 bg-red-400/10',
    NO_ELIGIBLE_PARTICIPANTS: 'border-amber-400/30 text-amber-300 bg-amber-400/10',
    ALL_WINNERS_DRAWN: 'border-amber-400/30 text-amber-300 bg-amber-400/10',
    INVALID_STATUS: 'border-amber-400/30 text-amber-300 bg-amber-400/10',
    REDRAW: 'border-violet-400/30 text-violet-300 bg-violet-400/10',
};

/** What the screens show for a winner: their name, or the ticket if no name is on file. */
export function winnerName(winner) {
    return winner?.name?.trim() || winner?.ticket_number || '';
}

/**
 * A font size that fits `text` on one line across `width` (in the given unit),
 * never larger than `max`. Display capitals run about 0.68em wide each.
 */
export function fitText(text, width, max, unit = 'cqw') {
    const characters = Math.max(String(text ?? '').length, 4);
    return `min(${(width / (characters * 0.68)).toFixed(2)}${unit}, ${max})`;
}
