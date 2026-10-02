import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import api, { parseError } from '../lib/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import WinnerHistory from '../components/raffle/WinnerHistory';
import LoadingState from '../components/ui/LoadingState';
import Pagination from '../components/ui/Pagination';
import { useToast } from '../context/ToastContext';

export default function Winners() {
    const toast = useToast();

    const [winners, setWinners] = useState([]);
    const [meta, setMeta] = useState(null);
    const [raffles, setRaffles] = useState([]);
    const [raffleId, setRaffleId] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/raffles', { params: { per_page: 100, include_archived: 1 } })
            .then(({ data }) => setRaffles(data.data))
            .catch(() => setRaffles([]));
    }, []);

    const load = useCallback(async () => {
        setLoading(true);

        try {
            const { data } = await api.get('/winners', {
                params: { page, raffle_id: raffleId || undefined, search: search || undefined, per_page: 25 },
            });
            setWinners(data.data);
            setMeta(data.meta);
        } catch (error) {
            toast.error(parseError(error, 'Winners could not be loaded.').message);
        } finally {
            setLoading(false);
        }
    }, [page, raffleId, search, toast]);

    useEffect(() => {
        const timer = setTimeout(load, search ? 350 : 0);
        return () => clearTimeout(timer);
    }, [load, search]);

    useEffect(() => { setPage(1); }, [raffleId, search]);

    return (
        <DashboardLayout
            title="Winner history"
            subtitle="Every winning ticket across all raffles"
        >
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <div className="relative min-w-[14rem] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-dim" size={15} />
                    <input
                        type="search"
                        className="input pl-9"
                        placeholder="Search by ticket number…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>

                <select
                    className="input w-auto min-w-[14rem]"
                    value={raffleId}
                    onChange={(event) => setRaffleId(event.target.value)}
                >
                    <option value="">All raffles</option>
                    {raffles.map((raffle) => (
                        <option key={raffle.id} value={raffle.id}>{raffle.name}</option>
                    ))}
                </select>
            </div>

            {loading ? (
                <LoadingState label="Loading winners" rows={5} />
            ) : (
                <>
                    <WinnerHistory winners={winners} showRaffle />
                    <div className="mt-5">
                        <Pagination meta={meta} onChange={setPage} />
                    </div>
                </>
            )}
        </DashboardLayout>
    );
}
