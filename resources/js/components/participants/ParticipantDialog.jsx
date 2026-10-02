import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { InlineSpinner } from '../ui/LoadingState';

const BLANK = { ticket_number: '', name: '', email: '', phone: '', category: '', status: 'ACTIVE' };

export default function ParticipantDialog({ open, participant, errors = {}, busy, onSave, onClose }) {
    const [form, setForm] = useState(BLANK);

    useEffect(() => {
        if (!open) return;

        setForm(participant
            ? {
                ticket_number: participant.ticket_number ?? '',
                name: participant.name ?? '',
                email: participant.email ?? '',
                phone: participant.phone ?? '',
                category: participant.category ?? '',
                status: participant.status ?? 'ACTIVE',
            }
            : BLANK);
    }, [open, participant]);

    const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

    const submit = (event) => {
        event.preventDefault();
        onSave({
            ...form,
            name: form.name || null,
            email: form.email || null,
            phone: form.phone || null,
            category: form.category || null,
        });
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
                    onClick={() => !busy && onClose()}
                >
                    <motion.form
                        initial={{ opacity: 0, scale: 0.97, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        onClick={(event) => event.stopPropagation()}
                        onSubmit={submit}
                        className="panel my-auto w-full max-w-lg p-6"
                    >
                        <header className="mb-5 flex items-center justify-between gap-3">
                            <h2 className="font-display text-lg font-bold text-white">
                                {participant ? 'Edit participant' : 'Add participant'}
                            </h2>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={busy}
                                className="rounded-lg p-1 text-muted transition hover:text-white"
                                aria-label="Close"
                            >
                                <X size={17} />
                            </button>
                        </header>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <label className="label" htmlFor="ticket_number">Ticket number</label>
                                <input
                                    id="ticket_number"
                                    className="input tabular"
                                    required
                                    maxLength={64}
                                    value={form.ticket_number}
                                    onChange={(event) => set('ticket_number', event.target.value)}
                                    placeholder="000001"
                                />
                                <p className="mt-1.5 text-xs text-muted-dim">Leading zeros are preserved exactly as typed.</p>
                                {errors.ticket_number && <p className="mt-1.5 text-xs text-red-300">{errors.ticket_number[0]}</p>}
                            </div>

                            <div className="sm:col-span-2">
                                <label className="label" htmlFor="participant_name">Name</label>
                                <input
                                    id="participant_name"
                                    className="input"
                                    maxLength={160}
                                    value={form.name}
                                    onChange={(event) => set('name', event.target.value)}
                                />
                            </div>

                            <div>
                                <label className="label" htmlFor="participant_email">Email</label>
                                <input
                                    id="participant_email"
                                    type="email"
                                    className="input"
                                    value={form.email}
                                    onChange={(event) => set('email', event.target.value)}
                                />
                                {errors.email && <p className="mt-1.5 text-xs text-red-300">{errors.email[0]}</p>}
                            </div>

                            <div>
                                <label className="label" htmlFor="participant_phone">Phone</label>
                                <input
                                    id="participant_phone"
                                    className="input"
                                    maxLength={64}
                                    value={form.phone}
                                    onChange={(event) => set('phone', event.target.value)}
                                />
                            </div>

                            <div>
                                <label className="label" htmlFor="participant_category">Category</label>
                                <input
                                    id="participant_category"
                                    className="input"
                                    maxLength={64}
                                    value={form.category}
                                    onChange={(event) => set('category', event.target.value)}
                                    placeholder="VISITOR"
                                />
                            </div>

                            <div>
                                <label className="label" htmlFor="participant_status">Status</label>
                                <select
                                    id="participant_status"
                                    className="input"
                                    value={form.status}
                                    onChange={(event) => set('status', event.target.value)}
                                >
                                    {['ACTIVE', 'WINNER', 'DISQUALIFIED', 'EXCLUDED'].map((status) => (
                                        <option key={status} value={status}>{status}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="mt-7 flex justify-end gap-2.5">
                            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
                            <button type="submit" className="btn btn-gold" disabled={busy}>
                                {busy && <InlineSpinner />}
                                {participant ? 'Save changes' : 'Add participant'}
                            </button>
                        </div>
                    </motion.form>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
