import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import StatusChip from '../ui/StatusChip';
import { formatDate } from '../../lib/format';

const COLUMNS = [
    { key: 'ticket_number', label: 'Ticket', sortable: true },
    { key: 'name', label: 'Name', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'phone', label: 'Phone', sortable: false },
    { key: 'category', label: 'Tag', sortable: true },
    { key: 'developers', label: 'Developers', sortable: false },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'created_at', label: 'Added', sortable: true },
];

export default function ParticipantTable({ participants, sort, direction, onSort, onEdit, onDelete }) {
    return (
        <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] text-sm">
                    <thead>
                        <tr className="border-b border-line text-left text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                            {COLUMNS.map((column) => (
                                <th key={column.key} className="px-5 py-3.5 font-semibold">
                                    {column.sortable ? (
                                        <button
                                            type="button"
                                            onClick={() => onSort(column.key)}
                                            className={`flex items-center gap-1.5 transition hover:text-white ${sort === column.key ? 'text-gold' : ''}`}
                                        >
                                            {column.label}
                                            {sort === column.key && (
                                                direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                                            )}
                                        </button>
                                    ) : column.label}
                                </th>
                            ))}
                            <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {participants.map((participant) => (
                            <tr key={participant.id} className="transition hover:bg-white/[0.02]">
                                <td className="tabular px-5 py-3 font-display font-bold text-gold-bright">
                                    {participant.ticket_number}
                                </td>
                                <td className="max-w-[12rem] truncate px-5 py-3 text-white">{participant.name ?? '—'}</td>
                                <td className="max-w-[14rem] truncate px-5 py-3 text-muted">{participant.email ?? '—'}</td>
                                <td className="px-5 py-3 text-muted">{participant.phone ?? '—'}</td>
                                <td className="px-5 py-3">
                                    {participant.category ? (
                                        <span className="chip border-white/10 bg-white/5 text-muted">{participant.category}</span>
                                    ) : <span className="text-muted-dim">—</span>}
                                </td>
                                <td className="max-w-[16rem] truncate px-5 py-3 text-muted" title={participant.developers?.join(', ')}>
                                    {participant.developers?.length ? participant.developers.join(', ') : <span className="text-muted-dim">—</span>}
                                </td>
                                <td className="px-5 py-3"><StatusChip status={participant.status} /></td>
                                <td className="whitespace-nowrap px-5 py-3 text-muted-dim">{formatDate(participant.created_at)}</td>
                                <td className="px-5 py-3">
                                    <div className="flex justify-end gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => onEdit(participant)}
                                            className="rounded-lg border border-line p-1.5 text-muted transition hover:border-gold/35 hover:text-gold"
                                            aria-label={`Edit ticket ${participant.ticket_number}`}
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onDelete(participant)}
                                            className="rounded-lg border border-line p-1.5 text-muted transition hover:border-red-400/40 hover:text-red-300"
                                            aria-label={`Delete ticket ${participant.ticket_number}`}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
