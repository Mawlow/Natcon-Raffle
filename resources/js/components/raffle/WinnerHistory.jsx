import { Trophy } from 'lucide-react';
import StatusChip from '../ui/StatusChip';
import EmptyState from '../ui/EmptyState';
import { formatDateTime } from '../../lib/format';

/**
 * Admin-side winner list. Unlike the public display this may show the
 * participant behind a winning ticket, because it is behind authentication.
 */
export default function WinnerHistory({ winners = [], showRaffle = false, showParticipant = true, emptyHint }) {
    if (winners.length === 0) {
        return (
            <EmptyState
                icon={Trophy}
                title="No winners yet"
                description={emptyHint ?? 'Winners appear here as soon as the first draw is completed.'}
            />
        );
    }

    return (
        <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[42rem] text-sm">
                    <thead>
                        <tr className="border-b border-line text-left text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                            <th className="px-5 py-3.5 font-semibold">#</th>
                            <th className="px-5 py-3.5 font-semibold">Ticket</th>
                            {showRaffle && <th className="px-5 py-3.5 font-semibold">Raffle</th>}
                            {showRaffle && <th className="px-5 py-3.5 font-semibold">Prize</th>}
                            {showParticipant && <th className="px-5 py-3.5 font-semibold">Participant</th>}
                            <th className="px-5 py-3.5 font-semibold">Day</th>
                            <th className="px-5 py-3.5 font-semibold">Drawn at</th>
                            <th className="px-5 py-3.5 font-semibold">Event</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {winners.map((winner) => (
                            <tr key={winner.id} className="transition hover:bg-white/[0.02]">
                                <td className="px-5 py-3.5">
                                    <span className="chip border-gold/30 bg-gold/10 text-gold-bright">{winner.position}</span>
                                </td>
                                <td className="tabular px-5 py-3.5 font-display text-lg font-extrabold text-gold-bright">
                                    {winner.ticket_number}
                                </td>
                                {showRaffle && (
                                    <td className="max-w-[14rem] truncate px-5 py-3.5 text-white">{winner.raffle?.name ?? '—'}</td>
                                )}
                                {showRaffle && (
                                    <td className="max-w-[12rem] truncate px-5 py-3.5 text-muted">{winner.raffle?.prize_name ?? '—'}</td>
                                )}
                                {showParticipant && (
                                    <td className="px-5 py-3.5">
                                        {winner.participant ? (
                                            <div className="min-w-0">
                                                <p className="truncate text-white">{winner.participant.name ?? '—'}</p>
                                                {winner.participant.email && (
                                                    <p className="truncate text-xs text-muted-dim">{winner.participant.email}</p>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-muted-dim">—</span>
                                        )}
                                    </td>
                                )}
                                <td className="whitespace-nowrap px-5 py-3.5">
                                    {winner.event_day
                                        ? <span className="chip border-gold/30 bg-gold/10 text-gold-bright">{winner.event_day}</span>
                                        : <span className="text-muted-dim">—</span>}
                                </td>
                                <td className="whitespace-nowrap px-5 py-3.5 text-muted">{formatDateTime(winner.drawn_at)}</td>
                                <td className="px-5 py-3.5">
                                    <code className="rounded bg-black/40 px-2 py-1 text-[0.68rem] text-muted-dim">
                                        {winner.draw_event?.event_uuid?.slice(0, 8) ?? '—'}
                                    </code>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
