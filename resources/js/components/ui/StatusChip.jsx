import { STATUS_STYLES } from '../../lib/format';

export default function StatusChip({ status, className = '' }) {
    if (!status) return null;

    const tone = STATUS_STYLES[status] ?? 'border-white/15 text-muted bg-white/5';

    return (
        <span className={`chip ${tone} ${className}`}>
            {status === 'LIVE' && (
                <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold-bright" />
                </span>
            )}
            {status.replace(/_/g, ' ')}
        </span>
    );
}
