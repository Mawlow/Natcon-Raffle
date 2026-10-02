import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
};

const TONES = {
    success: 'border-emerald-400/30 text-emerald-300',
    error: 'border-red-400/35 text-red-300',
    warning: 'border-amber-400/30 text-amber-300',
    info: 'border-gold/30 text-gold-bright',
};

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const dismiss = useCallback((id) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    const push = useCallback((message, type = 'info', options = {}) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setToasts((current) => [...current, { id, message, type, title: options.title }]);

        if (options.duration !== 0) {
            setTimeout(() => dismiss(id), options.duration ?? 5000);
        }

        return id;
    }, [dismiss]);

    const value = useMemo(() => ({
        toast: push,
        success: (message, options) => push(message, 'success', options),
        error: (message, options) => push(message, 'error', options),
        warning: (message, options) => push(message, 'warning', options),
        info: (message, options) => push(message, 'info', options),
        dismiss,
    }), [push, dismiss]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="pointer-events-none fixed bottom-5 right-5 z-[200] flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-2.5">
                <AnimatePresence initial={false}>
                    {toasts.map((toast) => {
                        const Icon = ICONS[toast.type] ?? Info;

                        return (
                            <motion.div
                                key={toast.id}
                                layout
                                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, x: 24, scale: 0.97 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                                className={`panel pointer-events-auto flex items-start gap-3 border px-4 py-3 ${TONES[toast.type] ?? TONES.info}`}
                            >
                                <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0" size={18} />
                                <div className="min-w-0 flex-1">
                                    {toast.title && <p className="text-sm font-semibold text-white">{toast.title}</p>}
                                    <p className="text-sm leading-snug text-white/85 break-words">{toast.message}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => dismiss(toast.id)}
                                    className="shrink-0 rounded p-0.5 text-muted transition hover:text-white"
                                    aria-label="Dismiss notification"
                                >
                                    <X size={15} />
                                </button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);

    if (!context) {
        throw new Error('useToast must be used inside a ToastProvider.');
    }

    return context;
}
