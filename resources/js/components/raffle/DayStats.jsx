import { useEffect, useState } from 'react';
import { Download, Trophy, UserCheck, Users, UsersRound } from 'lucide-react';
import api, { parseError } from '../../lib/api';
import { downloadFile } from '../../lib/download';
import { formatNumber } from '../../lib/format';
import { dayLabel } from '../../lib/sets';
import { useToast } from '../../context/ToastContext';
import { InlineSpinner } from '../ui/LoadingState';

/**
 * A day of the event in numbers, at the top of its folder: the wins its
 * raffles have given out, who is still to win (nothing yet, any day), how
 * many have won so far — and the day's rule for who its draws pick from:
 * only the people still to win (the default), or everyone, earlier winners
 * included. Big-prize winners stay out either way. `version`
 * changes whenever the raffles are reloaded, so the numbers follow.
 */
export default function DayStats({ fileId, day, version }) {
    const toast = useToast();
    const [stats, setStats] = useState(null);
    const [saving, setSaving] = useState(false);
    const [downloading, setDownloading] = useState(null);

    // The list behind a card, as a spreadsheet.
    const download = async (list) => {
        setDownloading(list);
        try {
            await downloadFile(`/raffle-files/${fileId}/days/${day}/export?list=${list}`, `day-${day}-${list}.csv`);
        } catch (error) {
            toast.error(parseError(error, 'The list could not be downloaded.').message);
        } finally {
            setDownloading(null);
        }
    };

    useEffect(() => {
        let alive = true;
        api.get(`/raffle-files/${fileId}/days/${day}`)
            .then(({ data }) => { if (alive) setStats(data.data); })
            .catch(() => { /* The folder works without its numbers. */ });
        return () => { alive = false; };
    }, [fileId, day, version]);

    const setRule = async (rule) => {
        if (!stats || stats.rule === rule || saving) return;
        setSaving(true);
        try {
            const { data } = await api.put(`/raffle-files/${fileId}/days/${day}`, { rule });
            setStats(data.data);
            toast.success(data.message, { title: `${dayLabel(day)} draws` });
        } catch (error) {
            toast.error(parseError(error, 'The rule could not be saved.').message);
        } finally {
            setSaving(false);
        }
    };

    const everyone = stats?.rule === 'everyone';
    const cards = stats ? [
        { icon: Trophy, label: 'Wins given out', value: stats.winners, hint: stats.winners_people === stats.winners ? `${formatNumber(stats.winners_people)} ${stats.winners_people === 1 ? 'person' : 'people'}` : `${formatNumber(stats.winners_people)} different people` },
        { icon: UserCheck, label: 'Still to win', value: stats.remaining, hint: everyone ? `Everyone can win ${dayLabel(day)}` : `Who ${dayLabel(day)}'s draws pick from`, gold: !everyone, list: 'remaining' },
        { icon: UsersRound, label: 'Won so far in the event', value: stats.won_people, hint: 'Different people, any day', list: 'won' },
        { icon: Users, label: 'Participants', value: stats.participants, hint: stats.kept_out > 0 ? `${formatNumber(stats.kept_out)} out for the event (big prizes)` : 'In every raffle of the file' },
    ] : [];

    return (
        <section className="panel mb-5 p-4 sm:p-5">
            {stats === null ? (
                <p className="flex items-center gap-2 text-sm text-muted"><InlineSpinner /> Counting {dayLabel(day)}…</p>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {cards.map(({ icon: Icon, label, value, hint, gold, list }) => (
                            <div key={label} className={`relative rounded-xl border p-3 ${gold ? 'border-gold/40 bg-gold/[0.06]' : 'border-line bg-black/20'}`}>
                                <dt className="flex items-center gap-1.5 pr-7 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-dim">
                                    <Icon size={13} className={gold ? 'text-gold' : ''} /> {label}
                                </dt>
                                <dd className={`mt-1 font-display text-2xl font-extrabold tabular ${gold ? 'text-gold-bright' : 'text-white'}`}>{formatNumber(value)}</dd>
                                <dd className="text-xs text-muted">{hint}</dd>
                                {/* The names behind the number, as a spreadsheet. */}
                                {list && (
                                    <button
                                        type="button"
                                        onClick={() => download(list)}
                                        disabled={Boolean(downloading) || value === 0}
                                        className="absolute right-2 top-2 rounded-md border border-line bg-black/40 p-1.5 text-muted transition hover:border-gold/50 hover:text-gold disabled:opacity-40"
                                        aria-label={`Download the ${label.toLowerCase()} list`}
                                        title={`Download the list (CSV)`}
                                    >
                                        {downloading === list ? <InlineSpinner /> : <Download size={13} />}
                                    </button>
                                )}
                            </div>
                        ))}
                    </dl>

                    {/* Who the day's draws pick from. */}
                    <div className="lg:w-72">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-dim">{dayLabel(day)} draws pick from</p>
                        <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-line bg-black/40 p-1" role="radiogroup" aria-label={`Who ${dayLabel(day)}'s draws pick from`}>
                            {[['remaining', 'Still to win'], ['everyone', 'Everyone']].map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    role="radio"
                                    aria-checked={stats.rule === value}
                                    disabled={saving}
                                    onClick={() => setRule(value)}
                                    className={`rounded-md px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${stats.rule === value ? 'bg-gold text-black' : 'text-muted hover:text-white'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <p className="mt-2 text-xs text-muted">
                            {everyone
                                ? `Everyone is in every draw of ${dayLabel(day)}, earlier winners included. Big-prize winners stay out.`
                                : `Only the ${formatNumber(stats.remaining)} who have not won anything in the event yet are drawn. Once they have all won, everyone is back in.`}
                        </p>
                    </div>
                </div>
            )}
        </section>
    );
}
