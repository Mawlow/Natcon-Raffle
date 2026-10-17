import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Plus, Search, Trash2, Upload, Users, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import api, { parseError } from '../lib/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import RaffleTabs from '../components/raffle/RaffleTabs';
import ParticipantTable from '../components/participants/ParticipantTable';
import ParticipantDialog from '../components/participants/ParticipantDialog';
import CsvUploader from '../components/participants/CsvUploader';
import CsvPreview from '../components/participants/CsvPreview';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import LoadingState, { InlineSpinner } from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import { useToast } from '../context/ToastContext';
import { formatNumber } from '../lib/format';

/**
 * The participant list of one raffle.
 *
 * Participants are raffle-scoped: the CSV uploaded here creates entrants for
 * this raffle only, and ticket numbers only have to be unique within it.
 */
export default function RaffleParticipants({ raffleId: givenId = null, embedded = false }) {
    // `embedded`: drawn inside a raffle's Control Center rather than as a page.
    const params = useParams();
    const raffleId = givenId ?? params.raffle;
    const toast = useToast();

    const [raffle, setRaffle] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [meta, setMeta] = useState(null);
    const [filters, setFilters] = useState({ statuses: [], categories: [] });
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [category, setCategory] = useState('');
    const [developer, setDeveloper] = useState('');
    const [location, setLocation] = useState('');
    const [sort, setSort] = useState('ticket_number');
    const [direction, setDirection] = useState('asc');
    const [page, setPage] = useState(1);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [dialogErrors, setDialogErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [confirm, setConfirm] = useState(null);
    const [busy, setBusy] = useState(false);

    const [importOpen, setImportOpen] = useState(false);
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [previewing, setPreviewing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [onDuplicate, setOnDuplicate] = useState('skip');

    const base = `/raffles/${raffleId}/participants`;

    useEffect(() => {
        api.get(`/raffles/${raffleId}`)
            .then(({ data }) => setRaffle(data.data))
            .catch((error) => toast.error(parseError(error, 'This raffle could not be loaded.').message));
    }, [raffleId, toast]);

    const load = useCallback(async () => {
        setLoading(true);

        try {
            const { data } = await api.get(base, {
                params: {
                    page,
                    search: search || undefined,
                    status: status || undefined,
                    category: category || undefined,
                    developer: developer || undefined,
                    location: location || undefined,
                    sort,
                    direction,
                    per_page: 25,
                },
            });

            setParticipants(data.data);
            setMeta(data.meta);
            setFilters(data.filters);
        } catch (error) {
            toast.error(parseError(error, 'Participants could not be loaded.').message);
        } finally {
            setLoading(false);
        }
    }, [base, page, search, status, category, developer, location, sort, direction, toast]);

    useEffect(() => {
        const timer = setTimeout(load, search ? 350 : 0);
        return () => clearTimeout(timer);
    }, [load, search]);

    useEffect(() => { setPage(1); }, [search, status, category, developer, location, sort, direction]);

    const refreshRaffle = () => api.get(`/raffles/${raffleId}`)
        .then(({ data }) => setRaffle(data.data))
        .catch(() => {});

    const toggleSort = (key) => {
        if (sort === key) {
            setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
        } else {
            setSort(key);
            setDirection('asc');
        }
    };

    const save = async (payload) => {
        setSaving(true);
        setDialogErrors({});

        try {
            if (editing) {
                await api.put(`${base}/${editing.id}`, payload);
                toast.success('Participant updated.');
            } else {
                await api.post(base, payload);
                toast.success('Participant added.');
            }

            setDialogOpen(false);
            setEditing(null);
            load();
            refreshRaffle();
        } catch (error) {
            const parsed = parseError(error, 'The participant could not be saved.');
            setDialogErrors(parsed.errors);
            if (Object.keys(parsed.errors).length === 0) toast.error(parsed.message);
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        setBusy(true);

        try {
            await api.delete(`${base}/${confirm.participant.id}`);
            toast.success('Participant deleted.');
            setConfirm(null);
            load();
            refreshRaffle();
        } catch (error) {
            toast.error(parseError(error, 'The participant could not be deleted.').message);
        } finally {
            setBusy(false);
        }
    };

    const clearAll = async () => {
        setBusy(true);

        try {
            const { data } = await api.delete(base);
            toast.success(`${formatNumber(data.data.deleted)} participants removed.`);
            setConfirm(null);
            load();
            refreshRaffle();
        } catch (error) {
            toast.error(parseError(error, 'The list could not be cleared.').message);
        } finally {
            setBusy(false);
        }
    };

    const runPreview = async (candidate) => {
        setFile(candidate);
        setPreview(null);
        setPreviewing(true);

        const body = new FormData();
        body.append('file', candidate);

        try {
            const { data } = await api.post(`${base}/import/preview`, body);
            setPreview(data.data);
        } catch (error) {
            toast.error(parseError(error, 'The CSV could not be read.').message);
            setFile(null);
        } finally {
            setPreviewing(false);
        }
    };

    const runImport = async () => {
        setImporting(true);

        const body = new FormData();
        body.append('file', file);
        body.append('on_duplicate', onDuplicate);

        try {
            const { data } = await api.post(`${base}/import`, body);
            toast.success(
                `${data.data.imported_rows} added, ${data.data.updated_rows} updated, ${data.data.skipped_rows} skipped.`,
                { title: 'Import complete' },
            );
            closeImport();
            load();
            refreshRaffle();
        } catch (error) {
            toast.error(parseError(error, 'The import failed.').message);
        } finally {
            setImporting(false);
        }
    };

    const closeImport = () => {
        setImportOpen(false);
        setFile(null);
        setPreview(null);
        setOnDuplicate('skip');
    };

    const exportCsv = () => {
        const params = new URLSearchParams();
        if (search) params.set('search', search);
        if (status) params.set('status', status);
        if (category) params.set('category', category);
        if (developer) params.set('developer', developer);
        if (location) params.set('location', location);

        window.location.assign(`/api${base}/export?${params.toString()}`);
    };

    const filtered = Boolean(search || status || category || developer || location);
    const total = meta?.total ?? 0;

    const actions = (
        <>
            {!embedded && (
                <Link to={`/raffles/${raffleId}`} className="btn btn-ghost">
                    <ArrowLeft size={15} />
                    <span className="hidden sm:inline">Raffle</span>
                </Link>
            )}
            <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={total === 0}>
                <Download size={15} />
                <span className="hidden sm:inline">Export</span>
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setImportOpen(true)}>
                <Upload size={15} />
                <span className="hidden sm:inline">Import CSV</span>
            </button>
            <button
                type="button"
                className="btn btn-gold"
                onClick={() => { setEditing(null); setDialogErrors({}); setDialogOpen(true); }}
            >
                <Plus size={16} />
                <span className="hidden sm:inline">Add</span>
            </button>
        </>
    );

    const body = (
        <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <div className="relative min-w-[16rem] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim" size={15} />
                    <input
                        type="search"
                        className="input pl-9"
                        placeholder="Search ticket, name, email or phone…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>

                <select className="input w-auto min-w-[10rem]" value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="">All statuses</option>
                    {filters.statuses?.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>

                <select className="input w-auto min-w-[10rem]" value={category} onChange={(event) => setCategory(event.target.value)}>
                    <option value="">All tags</option>
                    {filters.categories?.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>

                {filters.developers?.length > 0 && (
                    <select className="input w-auto min-w-[10rem]" value={developer} onChange={(event) => setDeveloper(event.target.value)}>
                        <option value="">All developers</option>
                        {filters.developers.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                )}

                {filters.locations?.length > 0 && (
                    <select className="input w-auto min-w-[10rem]" value={location} onChange={(event) => setLocation(event.target.value)}>
                        <option value="">All locations</option>
                        {filters.locations.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                )}

                {participants.length > 0 && !filtered && (
                    <button
                        type="button"
                        className="btn btn-ghost text-red-300"
                        onClick={() => setConfirm({ kind: 'clear' })}
                    >
                        <Trash2 size={15} />
                        <span className="hidden sm:inline">Clear list</span>
                    </button>
                )}
            </div>

            {loading && <LoadingState label="Loading participants" rows={5} />}

            {!loading && participants.length === 0 && (
                <EmptyState
                    icon={Users}
                    title={filtered ? 'No matching participants' : 'No participants imported yet'}
                    description={
                        filtered
                            ? 'Try clearing the filters or searching for a different ticket number.'
                            : 'Import a CSV of ticket numbers to fill this raffle. The file needs a ticket_number column; name, email, phone, tag, developers and location are optional.'
                    }
                    action={
                        <button type="button" className="btn btn-gold" onClick={() => setImportOpen(true)}>
                            <Upload size={16} /> Import CSV
                        </button>
                    }
                />
            )}

            {!loading && participants.length > 0 && (
                <>
                    <ParticipantTable
                        participants={participants}
                        sort={sort}
                        direction={direction}
                        onSort={toggleSort}
                        onEdit={(participant) => { setEditing(participant); setDialogErrors({}); setDialogOpen(true); }}
                        onDelete={(participant) => setConfirm({ kind: 'one', participant })}
                    />
                    <div className="mt-5">
                        <Pagination meta={meta} onChange={setPage} />
                    </div>
                </>
            )}

            <ParticipantDialog
                open={dialogOpen}
                participant={editing}
                errors={dialogErrors}
                busy={saving}
                onSave={save}
                onClose={() => { setDialogOpen(false); setEditing(null); }}
            />

            <ConfirmDialog
                open={Boolean(confirm)}
                title={confirm?.kind === 'clear' ? 'Clear every participant?' : 'Delete this participant?'}
                description={
                    confirm?.kind === 'clear'
                        ? `All ${formatNumber(total)} participants of this raffle will be removed so you can import a different CSV. This cannot be undone.`
                        : confirm
                            ? `Ticket ${confirm.participant.ticket_number} will be permanently removed. This cannot be undone.`
                            : ''
                }
                confirmLabel={confirm?.kind === 'clear' ? 'Clear list' : 'Delete'}
                busy={busy}
                onConfirm={confirm?.kind === 'clear' ? clearAll : remove}
                onCancel={() => setConfirm(null)}
            />

            {/* Import drawer */}
            <AnimatePresence>
                {importOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[140] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
                        onClick={() => !importing && closeImport()}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 16 }}
                            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
                            onClick={(event) => event.stopPropagation()}
                            className="panel mx-auto my-6 w-full max-w-4xl p-6"
                        >
                            <header className="mb-6 flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="font-display text-lg font-bold text-white">
                                        Import participants
                                    </h2>
                                    <p className="mt-1 text-sm text-muted">
                                        Into <span className="text-white">{raffle?.name}</span>. Review the file before anything is written to the database.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeImport}
                                    disabled={importing}
                                    className="rounded-lg p-1 text-muted transition hover:text-white"
                                    aria-label="Close"
                                >
                                    <X size={18} />
                                </button>
                            </header>

                            <div className="space-y-5">
                                <CsvUploader
                                    file={file}
                                    onFile={runPreview}
                                    onClear={() => { setFile(null); setPreview(null); }}
                                    disabled={importing}
                                />

                                {previewing && (
                                    <p className="flex items-center gap-2.5 text-sm text-muted">
                                        <InlineSpinner /> Validating file…
                                    </p>
                                )}

                                <CsvPreview preview={preview} />

                                {preview && preview.existing_count > 0 && (
                                    <fieldset className="rounded-xl border border-line bg-black/30 p-4">
                                        <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted">
                                            Tickets already in this raffle
                                        </legend>
                                        <div className="flex flex-wrap gap-4">
                                            {[
                                                ['skip', 'Skip them', 'Keep the existing records untouched.'],
                                                ['update', 'Update them', 'Overwrite name, email, phone, tag, developers and location from the file.'],
                                            ].map(([value, label, hint]) => (
                                                <label key={value} className="flex cursor-pointer items-start gap-2.5 text-sm">
                                                    <input
                                                        type="radio"
                                                        name="on_duplicate"
                                                        value={value}
                                                        checked={onDuplicate === value}
                                                        onChange={(event) => setOnDuplicate(event.target.value)}
                                                        className="mt-0.5 accent-[#d4af37]"
                                                    />
                                                    <span>
                                                        <span className="block font-semibold text-white">{label}</span>
                                                        <span className="block text-xs text-muted">{hint}</span>
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </fieldset>
                                )}
                            </div>

                            <div className="mt-7 flex justify-end gap-2.5">
                                <button type="button" className="btn btn-ghost" onClick={closeImport} disabled={importing}>
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-gold px-7"
                                    onClick={runImport}
                                    disabled={!preview || preview.valid_count === 0 || importing}
                                >
                                    {importing && <InlineSpinner />}
                                    {preview ? `Import ${preview.valid_count} rows` : 'Import'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );

    // Inside a Control Center: the list and its tools, without the page around them.
    if (embedded) {
        return (
            <div>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted">{raffle ? `${formatNumber(raffle.participants_count)} imported` : 'Loading…'}</p>
                    <div className="flex flex-wrap gap-2">{actions}</div>
                </div>
                {body}
            </div>
        );
    }

    return (
        <DashboardLayout
            title={raffle?.name ?? 'Participants'}
            subtitle={`Participants of this raffle${raffle ? ` · ${formatNumber(raffle.participants_count)} imported` : ''}`}
            actions={actions}
        >
            <RaffleTabs raffleId={raffleId} />
            {body}
        </DashboardLayout>
    );
}
