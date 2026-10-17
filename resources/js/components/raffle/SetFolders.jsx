import { useEffect } from 'react';
import { ArrowLeft, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { setLabel } from '../../lib/sets';

/**
 * Raffles in folders — set folders (First Set, Second Set, …) or, with
 * `field="draw_day"`, day folders (Day 1, Day 2, …) — the same way on every
 * tab of a raffle file. Closed, the folders are shown as cards with the
 * raffles in no folder beneath them; open, one folder's raffles with a way
 * back. `children(visible)` renders the raffles to show (so a day's folder
 * can hold the set folders); `summary(inFolder)` gives a folder card's
 * second line; `action` is shown beside an open folder's name.
 */
export default function SetFolders({ items, openSet, onOpen, summary, field = 'draw_set', label = setLabel, backLabel = 'All folders', action = null, noneLabel = 'Not in a folder', emptyLabel = 'Nothing in this folder.', children }) {
    const usedSets = [...new Set(items.map((item) => item[field]).filter(Boolean))].sort((a, b) => a - b);
    const folders = usedSets.map((set) => ({ set, items: items.filter((item) => item[field] === set) }));
    const visible = items.filter((item) => (item[field] ?? null) === openSet);

    // The open folder emptied (its raffles moved out): back to the folders.
    const gone = Boolean(openSet) && !usedSets.includes(openSet);
    useEffect(() => {
        if (gone) onOpen(null);
    }, [gone, onOpen]);

    return (
        <div className="space-y-6">
            {openSet ? (
                <div className="flex flex-wrap items-center gap-3">
                    <button type="button" className="btn btn-ghost px-3" onClick={() => onOpen(null)}>
                        <ArrowLeft size={15} /> {backLabel}
                    </button>
                    <h4 className="flex items-center gap-2 font-display text-lg font-bold text-gold-bright">
                        <FolderOpen size={18} /> {label(openSet)}
                        <span className="text-sm font-normal text-muted-dim">({visible.length})</span>
                    </h4>
                    {action && <span className="ml-auto">{action(visible)}</span>}
                </div>
            ) : folders.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {folders.map((folder) => (
                        <button
                            key={folder.set}
                            type="button"
                            onClick={() => onOpen(folder.set)}
                            className="panel group flex items-center gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:border-gold/35"
                        >
                            <span className="rounded-xl border border-gold/25 bg-gold/10 p-2.5 text-gold">
                                <Folder size={20} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block font-display text-base font-bold text-white group-hover:text-gold-bright">{label(folder.set)}</span>
                                <span className="text-xs text-muted-dim">{summary(folder.items)}</span>
                            </span>
                            <ChevronRight size={16} className="text-muted-dim group-hover:text-gold" />
                        </button>
                    ))}
                </div>
            )}

            {visible.length > 0 ? (
                <div>
                    {!openSet && folders.length > 0 && (
                        <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                            {noneLabel} ({visible.length})
                        </h4>
                    )}
                    {children(visible)}
                </div>
            ) : openSet && (
                <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{emptyLabel}</p>
            )}
        </div>
    );
}
