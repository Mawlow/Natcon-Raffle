import { useRef, useState } from 'react';
import { FileUp, Upload, X } from 'lucide-react';

const MAX_BYTES = 10 * 1024 * 1024;

export default function CsvUploader({ file, onFile, onClear, disabled }) {
    const inputRef = useRef(null);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState(null);

    const accept = (candidate) => {
        setError(null);

        if (!candidate) return;

        if (!/\.(csv|txt)$/i.test(candidate.name)) {
            setError('Please choose a .csv file.');
            return;
        }

        if (candidate.size > MAX_BYTES) {
            setError('The file must be 10 MB or smaller.');
            return;
        }

        onFile(candidate);
    };

    if (file) {
        return (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-gold/25 bg-gold/[0.05] px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="rounded-lg border border-gold/25 bg-gold/10 p-2 text-gold">
                        <FileUp size={17} />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{file.name}</p>
                        <p className="text-xs text-muted-dim">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onClear}
                    disabled={disabled}
                    className="shrink-0 rounded-lg border border-line p-1.5 text-muted transition hover:text-white"
                    aria-label="Remove file"
                >
                    <X size={15} />
                </button>
            </div>
        );
    }

    return (
        <div>
            <div
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    accept(event.dataTransfer.files?.[0]);
                }}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && inputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
                    dragging ? 'border-gold/60 bg-gold/[0.06]' : 'border-line hover:border-gold/35 hover:bg-white/[0.02]'
                }`}
            >
                <span className="mb-4 rounded-2xl border border-gold/20 bg-gold/5 p-3.5 text-gold">
                    <Upload size={22} />
                </span>
                <p className="text-sm font-semibold text-white">Drop a CSV here, or click to browse</p>
                <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted">
                    Any CSV with a ticket number column works — headed "Ticket No.", "Ticket #",
                    "Ticket Number", "Control No." and the like, even below title rows. Ticket Name
                    (shown on the screens), email, phone, Tag and Qualified Developers (separated
                    by |) are picked up if present; other columns are kept as extra details.
                </p>
                <p className="mt-3 text-[0.68rem] text-muted-dim">CSV up to 10 MB</p>

                <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => accept(event.target.files?.[0])}
                />
            </div>

            {error && <p className="mt-2.5 text-xs text-red-300">{error}</p>}
        </div>
    );
}
