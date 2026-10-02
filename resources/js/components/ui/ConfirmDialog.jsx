import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { InlineSpinner } from './LoadingState';

export default function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'danger',
    busy = false,
    // When set, the confirm button stays disabled until this exact word is
    // typed — for actions that cannot be undone.
    requireText = null,
    // Extra content under the description, e.g. a choice the action needs.
    children = null,
    // Keeps the confirm button disabled until the caller's own condition holds.
    confirmDisabled = false,
    onConfirm,
    onCancel,
}) {
    const [typed, setTyped] = useState('');

    useEffect(() => {
        if (open) setTyped('');
    }, [open]);

    const locked = (Boolean(requireText) && typed.trim() !== requireText) || confirmDisabled;

    useEffect(() => {
        if (!open) return undefined;

        const onKeyDown = (event) => {
            if (event.key === 'Escape' && !busy) onCancel?.();
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open, busy, onCancel]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
                    onClick={() => !busy && onCancel?.()}
                >
                    <motion.div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="confirm-title"
                        initial={{ opacity: 0, scale: 0.96, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 6 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        onClick={(event) => event.stopPropagation()}
                        className="panel w-full max-w-md p-6"
                    >
                        <div className="flex items-start gap-4">
                            <span className={`rounded-xl border p-2.5 ${tone === 'danger' ? 'border-red-400/30 bg-red-500/10 text-red-300' : 'border-gold/25 bg-gold/5 text-gold'}`}>
                                <AlertTriangle size={20} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <h2 id="confirm-title" className="font-display text-lg font-bold text-white">{title}</h2>
                                {description && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{description}</p>}
                            </div>
                        </div>

                        {children && <div className="mt-5">{children}</div>}

                        {requireText && (
                            <div className="mt-5">
                                <label className="label" htmlFor="confirm-text">
                                    Type <span className="font-bold text-white">{requireText}</span> to confirm
                                </label>
                                <input
                                    id="confirm-text"
                                    className="input"
                                    autoComplete="off"
                                    autoFocus
                                    value={typed}
                                    onChange={(event) => setTyped(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' && !locked && !busy) onConfirm?.();
                                    }}
                                    disabled={busy}
                                />
                            </div>
                        )}

                        <div className="mt-7 flex justify-end gap-2.5">
                            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
                                {cancelLabel}
                            </button>
                            <button
                                type="button"
                                className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-gold'}`}
                                onClick={onConfirm}
                                disabled={busy || locked}
                                autoFocus={!requireText}
                            >
                                {busy && <InlineSpinner />}
                                {confirmLabel}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
