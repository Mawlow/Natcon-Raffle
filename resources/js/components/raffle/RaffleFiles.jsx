import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, FolderOpen, FolderPlus, Gift, MonitorPlay, Users, X } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { formatNumber } from '../../lib/format';
import { useToast } from '../../context/ToastContext';
import { InlineSpinner } from '../ui/LoadingState';

/**
 * The Raffles page's raffle files: each is an event's raffles with one
 * participant list. A new file needs only a name; it opens on its page,
 * where the participants are uploaded and its raffles made.
 */
export default function RaffleFiles({ files, creating, onCreatingChange }) {
    const navigate = useNavigate();
    const toast = useToast();
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);

    const create = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const { data } = await api.post('/raffle-files', { name });
            toast.success(`"${data.data.name}" created. Upload its participants next.`);
            navigate(`/raffle-files/${data.data.id}`);
        } catch (error) {
            toast.error(parseError(error, 'The raffle file could not be created.').message);
            setSaving(false);
        }
    };

    return (
        <section className="mb-8">

            {creating && (
                <form onSubmit={create} className="panel mb-4 flex flex-wrap items-end gap-3 p-4">
                    <div className="min-w-[14rem] flex-1">
                        <label className="label" htmlFor="raffle-file-name">Raffle file name</label>
                        <input
                            id="raffle-file-name"
                            className="input"
                            placeholder="e.g. NATCON 2026"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            maxLength={160}
                            autoFocus
                            required
                        />
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="btn btn-gold" disabled={saving || !name.trim()}>
                            {saving ? <InlineSpinner /> : <FolderPlus size={15} />} Create file
                        </button>
                        <button type="button" className="btn btn-ghost px-3" onClick={() => onCreatingChange(false)} aria-label="Cancel">
                            <X size={15} />
                        </button>
                    </div>
                </form>
            )}

            {files.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {files.map((file) => (
                        <div key={file.id} className="panel group flex flex-col gap-3 p-4 transition hover:border-gold/35">
                            <Link to={`/raffle-files/${file.id}`} className="flex items-center gap-4">
                                <span className="rounded-xl border border-gold/25 bg-gold/10 p-2.5 text-gold">
                                    <FolderOpen size={20} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-display text-base font-bold text-white group-hover:text-gold-bright">{file.name}</span>
                                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-dim">
                                        <span className="flex items-center gap-1"><Gift size={12} /> {file.raffles_count} raffle{file.raffles_count === 1 ? '' : 's'}</span>
                                        {file.ready_count > 0 && (
                                            <span className="flex items-center gap-1 text-emerald-300/90"><CheckCircle2 size={12} /> {file.ready_count} ready</span>
                                        )}
                                        <span className="flex items-center gap-1">
                                            <Users size={12} />
                                            {file.participants_count ? `${formatNumber(file.participants_count)} participants` : 'No participants yet'}
                                        </span>
                                    </span>
                                </span>
                            </Link>
                            <div className="flex gap-2 border-t border-line pt-3">
                                <Link to={`/raffle-files/${file.id}`} className="btn btn-outline flex-1 justify-center px-3 py-1.5 text-xs">
                                    Open file
                                </Link>
                                {file.next_raffle_id ? (
                                    <Link to={`/raffle/${file.next_raffle_id}/control`} className="btn btn-gold flex-1 justify-center px-3 py-1.5 text-xs">
                                        <MonitorPlay size={14} /> Control Center
                                    </Link>
                                ) : (
                                    <span className="btn btn-ghost flex-1 cursor-default justify-center px-3 py-1.5 text-xs opacity-50" title="Create a raffle in this file first">
                                        <MonitorPlay size={14} /> Control Center
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
