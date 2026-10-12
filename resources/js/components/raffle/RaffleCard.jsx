import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Archive, Copy, Folder, RotateCcw, Wand2, ExternalLink, FolderInput, MoreVertical, Pencil, Trash2, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import StatusChip from '../ui/StatusChip';
import { formatNumber, formatPrizeValue } from '../../lib/format';
import { setLabel } from '../../lib/sets';

export default function RaffleCard({ raffle, files = null, selectable = false, selected = false, onToggleSelect = null, onDuplicate, onRedraw, onConvert = null, onMoveToFile, onArchive, onRestore, onDelete, delay = 0 }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!menuOpen) return undefined;

        const onClick = (event) => {
            if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
        };

        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [menuOpen]);

    const prize = formatPrizeValue(raffle.prize_value, raffle.prize_currency);
    // A raffle with a prize list shows its first prize and how many more follow.
    const firstPrize = raffle.prizes?.[0];
    const firstValue = firstPrize && formatPrizeValue(firstPrize.prize_value, firstPrize.prize_currency);
    const prizeText = raffle.prize_name
        ? `${prize ? `${prize} · ` : ''}${raffle.prize_name}`
        : firstPrize
            ? `${firstValue ? `${firstValue} · ` : ''}${firstPrize.prize_name}${raffle.prizes.length > 1 ? ` + ${raffle.prizes.length - 1} more` : ''}`
            : 'Prize not set yet';
    const progress = raffle.winners_count > 0 ? (raffle.winners_drawn / raffle.winners_count) * 100 : 0;
    const isLive = raffle.status === 'LIVE';

    return (
        <motion.article
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
            className={`panel group relative flex flex-col p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/35 ${
                isLive ? 'panel-gold' : ''
            } ${raffle.is_archived ? 'opacity-60' : ''} ${selected ? 'ring-2 ring-gold/70' : ''}`}
        >
            {isLive && (
                <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-gold/25 animate-pulse-gold" aria-hidden="true" />
            )}

            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        {selectable && (
                            <input
                                type="checkbox"
                                className="h-4 w-4 cursor-pointer rounded border-line bg-black/50 accent-[#d4af37]"
                                checked={selected}
                                onChange={() => onToggleSelect?.(raffle)}
                                aria-label={`Select ${raffle.name}`}
                            />
                        )}
                        <StatusChip status={raffle.status} />
                        {raffle.draw_set && (
                            <span className="chip border-gold/25 bg-gold/10 text-gold-bright"><Folder size={11} /> {setLabel(raffle.draw_set)}</span>
                        )}
                        {raffle.is_predraw && <span className="chip border-gold/25 bg-gold/10 text-gold-bright">Pre-draw</span>}
                        {raffle.is_archived && <span className="chip border-white/10 bg-white/5 text-muted-dim">Archived</span>}
                        {raffle.allow_repeat_winners && (
                            <span className="chip border-amber-400/25 bg-amber-400/10 text-amber-300">Repeats allowed</span>
                        )}
                    </div>

                    <Link to={`/raffles/${raffle.id}`} className="block">
                        <h3 className="truncate font-display text-lg font-bold text-white transition group-hover:text-gold-bright">
                            {raffle.name}
                        </h3>
                    </Link>
                </div>

                <div className="relative shrink-0" ref={menuRef}>
                    <button
                        type="button"
                        onClick={() => setMenuOpen((open) => !open)}
                        className="rounded-lg border border-line p-1.5 text-muted transition hover:text-white"
                        aria-label="Raffle actions"
                        aria-expanded={menuOpen}
                    >
                        <MoreVertical size={16} />
                    </button>

                    {menuOpen && (
                        <div className="panel absolute right-0 top-9 z-20 w-56 overflow-hidden p-1.5 text-sm">
                            {!raffle.is_archived && (
                                <Link
                                    to={`/raffles/${raffle.id}/edit`}
                                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-muted transition hover:bg-white/5 hover:text-white"
                                >
                                    <Pencil size={14} /> Edit
                                </Link>
                            )}
                            {onDuplicate && (
                                <button
                                    type="button"
                                    onClick={() => { setMenuOpen(false); onDuplicate(raffle); }}
                                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-muted transition hover:bg-white/5 hover:text-white"
                                >
                                    <Copy size={14} /> Duplicate
                                </button>
                            )}
                            <a
                                href={`/raffle/${raffle.id}/display`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-muted transition hover:bg-white/5 hover:text-white"
                            >
                                <ExternalLink size={14} /> Open display
                            </a>

                            {onConvert && !raffle.is_archived && !raffle.is_predraw && raffle.winners_drawn === 0 && (
                                <button
                                    type="button"
                                    onClick={() => { setMenuOpen(false); onConvert(raffle); }}
                                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-muted transition hover:bg-white/5 hover:text-white"
                                >
                                    <Wand2 size={14} /> Change to pre-draw
                                </button>
                            )}

                            {onRedraw && !raffle.is_archived && raffle.winners_drawn > 0 && (
                                <button
                                    type="button"
                                    onClick={() => { setMenuOpen(false); onRedraw(raffle); }}
                                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-muted transition hover:bg-white/5 hover:text-white"
                                >
                                    <RotateCcw size={14} /> Clear winners &amp; redraw
                                </button>
                            )}

                            {onMoveToFile && files?.length > 0 && (
                                <>
                                    <div className="my-1.5 h-px bg-line" />
                                    <p className="px-3 pb-1 pt-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted-dim">
                                        Move to raffle file
                                    </p>
                                    {files.map((file) => (
                                        <button
                                            key={file.id}
                                            type="button"
                                            onClick={() => { setMenuOpen(false); onMoveToFile(raffle, file); }}
                                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-muted transition hover:bg-white/5 hover:text-white"
                                        >
                                            <FolderInput size={14} /> <span className="truncate">{file.name}</span>
                                        </button>
                                    ))}
                                </>
                            )}

                            <div className="my-1.5 h-px bg-line" />

                            {raffle.is_archived ? (
                                <button
                                    type="button"
                                    onClick={() => { setMenuOpen(false); onRestore?.(raffle); }}
                                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-muted transition hover:bg-white/5 hover:text-white"
                                >
                                    <Archive size={14} /> Restore
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => { setMenuOpen(false); onArchive?.(raffle); }}
                                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-muted transition hover:bg-white/5 hover:text-white"
                                >
                                    <Archive size={14} /> Archive
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={() => { setMenuOpen(false); onDelete?.(raffle); }}
                                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-red-300/80 transition hover:bg-red-500/10 hover:text-red-300"
                            >
                                <Trash2 size={14} /> Delete raffle
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-muted">
                {raffle.description || 'No description provided.'}
            </p>

            <div className="mt-4 rounded-xl border border-gold/15 bg-gold/[0.04] px-4 py-3">
                <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-gold/70">Prize</p>
                <p className="mt-1 truncate font-display text-base font-bold text-white">
                    {prizeText}
                </p>
            </div>

            <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-dim">Winners drawn</span>
                    <span className="tabular font-semibold text-white">
                        {raffle.winners_drawn} / {raffle.winners_count}
                    </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.7, delay: delay + 0.15, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full rounded-full bg-gradient-to-r from-gold-deep via-gold to-gold-bright"
                    />
                </div>
            </div>

            <footer className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
                <span className="flex items-center gap-1.5 text-xs text-muted-dim">
                    <Users size={13} />
                    {formatNumber(raffle.participants_count)} participants
                </span>

                <Link to={`/raffles/${raffle.id}`} className="btn btn-outline px-3.5 py-1.5 text-xs">
                    Manage
                </Link>
            </footer>
        </motion.article>
    );
}
