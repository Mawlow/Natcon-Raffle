import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumber } from '../../lib/format';

export default function Pagination({ meta, onChange }) {
    if (!meta || meta.last_page <= 1) {
        return meta?.total ? (
            <p className="px-1 py-3 text-xs text-muted-dim">{formatNumber(meta.total)} records</p>
        ) : null;
    }

    const { current_page: page, last_page: last, total } = meta;
    const pages = pageWindow(page, last);

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-1 pt-4">
            <p className="text-xs text-muted-dim">
                Page {formatNumber(page)} of {formatNumber(last)} · {formatNumber(total)} records
            </p>

            <div className="flex items-center gap-1">
                <button
                    type="button"
                    className="btn btn-ghost px-2.5 py-1.5"
                    onClick={() => onChange(page - 1)}
                    disabled={page <= 1}
                    aria-label="Previous page"
                >
                    <ChevronLeft size={15} />
                </button>

                {pages.map((value, index) =>
                    value === '…' ? (
                        <span key={`gap-${index}`} className="px-1.5 text-xs text-muted-dim">…</span>
                    ) : (
                        <button
                            key={value}
                            type="button"
                            onClick={() => onChange(value)}
                            className={`min-w-8 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                                value === page
                                    ? 'border border-gold/45 bg-gold/12 text-gold-bright'
                                    : 'border border-transparent text-muted hover:border-line hover:text-white'
                            }`}
                        >
                            {value}
                        </button>
                    ),
                )}

                <button
                    type="button"
                    className="btn btn-ghost px-2.5 py-1.5"
                    onClick={() => onChange(page + 1)}
                    disabled={page >= last}
                    aria-label="Next page"
                >
                    <ChevronRight size={15} />
                </button>
            </div>
        </div>
    );
}

function pageWindow(page, last) {
    if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);

    const pages = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(last - 1, page + 1);

    if (start > 2) pages.push('…');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < last - 1) pages.push('…');
    pages.push(last);

    return pages;
}
