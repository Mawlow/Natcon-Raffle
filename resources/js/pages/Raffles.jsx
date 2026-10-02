import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Gift, Plus, Search } from 'lucide-react';
import { deleteRaffleConfirmation } from '../lib/deleteRaffle';
import api, { parseError } from '../lib/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import RaffleCard from '../components/raffle/RaffleCard';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import LoadingState from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import { useToast } from '../context/ToastContext';

const STATUS_TABS = ['ALL', 'DRAFT', 'READY', 'LIVE', 'COMPLETED', 'CANCELLED'];

export default function Raffles() {
    const toast = useToast();
    const navigate = useNavigate();

    const [raffles, setRaffles] = useState([]);
    const [meta, setMeta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('ALL');
    const [search, setSearch] = useState('');
    const [includeArchived, setIncludeArchived] = useState(false);
    const [page, setPage] = useState(1);
    const [confirm, setConfirm] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);

        try {
            const { data } = await api.get('/raffles', {
                params: {
                    page,
                    search: search || undefined,
                    status: status === 'ALL' ? undefined : status,
                    include_archived: includeArchived ? 1 : undefined,
                    per_page: 12,
                },
            });
            setRaffles(data.data);
            setMeta(data.meta);
        } catch (error) {
            toast.error(parseError(error, 'Raffles could not be loaded.').message);
        } finally {
            setLoading(false);
        }
    }, [page, search, status, includeArchived, toast]);

    useEffect(() => {
        const timer = setTimeout(load, search ? 350 : 0);
        return () => clearTimeout(timer);
    }, [load, search]);

    useEffect(() => { setPage(1); }, [status, search, includeArchived]);

    const duplicate = async (raffle) => {
        try {
            const { data } = await api.post(`/raffles/${raffle.id}/duplicate`);
            toast.success(`"${data.data.name}" created as a draft.`);
            navigate(`/raffles/${data.data.id}/edit`);
        } catch (error) {
            toast.error(parseError(error, 'The raffle could not be duplicated.').message);
        }
    };

    const runConfirmed = async () => {
        if (!confirm) return;
        setBusy(true);

        try {
            await confirm.run();
            toast.success(confirm.successMessage);
            setConfirm(null);
            load();
        } catch (error) {
            toast.error(parseError(error, 'The action could not be completed.').message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <DashboardLayout
            title="Raffles"
            subtitle="Create, configure and run your draws"
            actions={
                <Link to="/raffles/new" className="btn btn-gold">
                    <Plus size={16} />
                    <span className="hidden sm:inline">New Raffle</span>
                </Link>
            }
        >
            <div className="mb-6 flex flex-wrap items-center gap-3">
                <div className="relative min-w-[14rem] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim" size={15} />
                    <input
                        type="search"
                        className="input pl-9"
                        placeholder="Search raffles or prizes…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                    {STATUS_TABS.map((tab) => (
                        <button
                            key={tab}
                            type="button"
                            onClick={() => setStatus(tab)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition ${
                                status === tab
                                    ? 'border border-gold/45 bg-gold/12 text-gold-bright'
                                    : 'border border-line text-muted hover:text-white'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                    <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-line bg-black/50 accent-[#d4af37]"
                        checked={includeArchived}
                        onChange={(event) => setIncludeArchived(event.target.checked)}
                    />
                    Show archived
                </label>
            </div>

            {loading && <LoadingState label="Loading raffles" />}

            {!loading && raffles.length === 0 && (
                <EmptyState
                    icon={Gift}
                    title="No raffles yet"
                    description="Create your first raffle, configure the prize and number of winners, then run the draw on the big screen."
                    action={<Link to="/raffles/new" className="btn btn-gold"><Plus size={16} /> Create raffle</Link>}
                />
            )}

            {!loading && raffles.length > 0 && (
                <>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {raffles.map((raffle, index) => (
                            <RaffleCard
                                key={raffle.id}
                                raffle={raffle}
                                delay={index * 0.04}
                                onDuplicate={duplicate}
                                onArchive={(target) => setConfirm({
                                    title: 'Archive this raffle?',
                                    description: `"${target.name}" will be hidden from the active list. Its winners and audit trail are kept.`,
                                    confirmLabel: 'Archive',
                                    successMessage: 'Raffle archived.',
                                    run: () => api.post(`/raffles/${target.id}/archive`),
                                })}
                                onRestore={(target) => setConfirm({
                                    title: 'Restore this raffle?',
                                    description: `"${target.name}" will return to the active list.`,
                                    confirmLabel: 'Restore',
                                    tone: 'gold',
                                    successMessage: 'Raffle restored.',
                                    run: () => api.post(`/raffles/${target.id}/restore`),
                                })}
                                onDelete={(target) => setConfirm({
                                    ...deleteRaffleConfirmation(target),
                                    successMessage: 'Raffle deleted.',
                                    run: () => api.delete(`/raffles/${target.id}`),
                                })}
                            />
                        ))}
                    </div>

                    <div className="mt-6">
                        <Pagination meta={meta} onChange={setPage} />
                    </div>
                </>
            )}

            <ConfirmDialog
                open={Boolean(confirm)}
                title={confirm?.title}
                description={confirm?.description}
                confirmLabel={confirm?.confirmLabel}
                tone={confirm?.tone ?? 'danger'}
                requireText={confirm?.requireText}
                busy={busy}
                onConfirm={runConfirmed}
                onCancel={() => setConfirm(null)}
            />
        </DashboardLayout>
    );
}
