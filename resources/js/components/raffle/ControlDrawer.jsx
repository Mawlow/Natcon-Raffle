import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * A wide panel that slides in over the Control Center, so creating or
 * editing a raffle and managing its participants happen without leaving it.
 * Escape or the backdrop closes it.
 */
export default function ControlDrawer({ open, title, subtitle = null, onClose, children }) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => {
            // A dialog opened inside the drawer handles its own Escape.
            if (event.key === 'Escape' && !document.querySelector('.z-\\[150\\], .z-\\[140\\]')) onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="drawer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[100] flex justify-end bg-black/70"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) onClose();
                    }}
                >
                    <motion.div
                        initial={{ x: '6%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '6%', opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="flex h-full w-full max-w-5xl flex-col border-l border-line bg-ink shadow-2xl"
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
                            <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold/80">Control Center</p>
                                <h2 className="mt-1 truncate font-display text-xl font-extrabold text-white">{title}</h2>
                                {subtitle && <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>}
                            </div>
                            <button type="button" className="rounded-lg p-2 text-muted transition hover:bg-white/5 hover:text-white" onClick={onClose} aria-label="Close">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
