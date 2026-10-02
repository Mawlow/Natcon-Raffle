export default function LoadingState({ label = 'Loading', rows = 3, className = '' }) {
    return (
        <div className={`panel p-8 ${className}`} role="status" aria-live="polite">
            <div className="flex items-center gap-3">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/25 border-t-gold" />
                <p className="text-sm font-medium text-muted">{label}…</p>
            </div>

            <div className="mt-6 space-y-3">
                {Array.from({ length: rows }).map((_, index) => (
                    <div
                        key={index}
                        className="h-3 rounded-full bg-gradient-to-r from-white/5 via-white/10 to-white/5 bg-[length:200%_100%] animate-shimmer"
                        style={{ width: `${100 - index * 12}%` }}
                    />
                ))}
            </div>
        </div>
    );
}

export function InlineSpinner({ className = '' }) {
    return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/25 border-t-current ${className}`} />;
}
