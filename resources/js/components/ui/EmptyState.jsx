export default function EmptyState({ icon: Icon, title, description, action }) {
    return (
        <div className="panel flex flex-col items-center justify-center px-6 py-16 text-center">
            {Icon && (
                <span className="mb-5 rounded-2xl border border-gold/20 bg-gold/5 p-4 text-gold">
                    <Icon size={26} />
                </span>
            )}
            <h3 className="font-display text-lg font-bold text-white">{title}</h3>
            {description && <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>}
            {action && <div className="mt-6">{action}</div>}
        </div>
    );
}
