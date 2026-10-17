import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import api, { parseError } from '../lib/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import RaffleForm from '../components/raffle/RaffleForm';
import LoadingState from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import { saveLogoSizes } from '../lib/logoSizes';
import { useToast } from '../context/ToastContext';
import { formatNumber } from '../lib/format';

export default function RaffleEditor() {
    const { raffle: raffleId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    // Opened from a Control Center's "New raffle": go back there afterwards.
    const [searchParams] = useSearchParams();
    const fromControl = searchParams.get('from') === 'control';
    const controlSetup = searchParams.get('setup') === 'three' ? '?setup=three' : '';
    // Made inside a raffle file: it starts with the file's participants.
    const fileId = searchParams.get('file');
    // Made inside one of the file's days: it goes in that day.
    const day = Number(searchParams.get('day')) || null;
    const [raffleFile, setRaffleFile] = useState(null);

    const editing = Boolean(raffleId);
    const [raffle, setRaffle] = useState(null);
    const [loading, setLoading] = useState(editing);
    const [loadError, setLoadError] = useState(null);
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!fileId || editing) return;
        api.get(`/raffle-files/${fileId}`)
            .then(({ data }) => setRaffleFile(data.data))
            .catch(() => {});
    }, [fileId, editing]);

    useEffect(() => {
        if (!editing) return;

        api.get(`/raffles/${raffleId}`)
            .then(({ data }) => setRaffle(data.data))
            .catch((error) => setLoadError(parseError(error, 'This raffle could not be loaded.').message))
            .finally(() => setLoading(false));
    }, [editing, raffleId]);

    const submit = async (payload) => {
        setSubmitting(true);
        setErrors({});

        try {
            const { data } = editing
                ? await api.put(`/raffles/${raffleId}`, payload)
                : await api.post('/raffles', fileId ? { ...payload, raffle_file_id: Number(fileId), ...(day ? { draw_day: day } : {}) } : payload);
            saveLogoSizes(data.data.id, payload.logo_sizes);

            if (editing) {
                toast.success('Raffle updated.');
                navigate(`/raffles/${raffleId}`);
            } else if (fileId) {
                // Back to the file: its participants are already in, so the next raffle can be made.
                toast.success(data.data.status === 'READY'
                    ? `"${data.data.name}" is ready to draw with ${formatNumber(data.data.participants_count)} participants.`
                    : `"${data.data.name}" saved. Upload the file's participants to make it ready to draw.`);
                navigate(`/raffle-files/${fileId}${day ? `?day=${day}` : ''}`);
            } else if (fromControl) {
                // Straight into the new raffle's Control Center, ready to put on the wall.
                toast.success('Raffle created. Import its participants, then show it on the LED wall.');
                navigate(`/raffle/${data.data.id}/control${controlSetup}`);
            } else {
                // A new raffle has no entrants yet — the CSV import is the next step.
                toast.success('Raffle created. Import its participants next.');
                navigate(`/raffles/${data.data.id}/participants`);
            }
        } catch (error) {
            const parsed = parseError(error, 'The raffle could not be saved.');
            setErrors(parsed.errors);
            toast.error(parsed.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <DashboardLayout
            title={editing ? 'Edit raffle' : 'New raffle'}
            subtitle={editing
                ? raffle?.name
                : fileId
                    ? `In ${raffleFile?.name ?? 'the raffle file'} — prizes, logos and who can win, saved ready to draw`
                    : 'Name, logos and how the draw runs — the winners and prize are set in the Control Center'}
            actions={
                <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
                    <ArrowLeft size={15} /> Back
                </button>
            }
        >
            {loading && <LoadingState label="Loading raffle" />}

            {loadError && !loading && <EmptyState title="Raffle not found" description={loadError} />}

            {!loading && !loadError && (
                <div className="mx-auto max-w-3xl">
                    <RaffleForm
                        raffle={raffle}
                        raffleFile={raffleFile}
                        errors={errors}
                        submitting={submitting}
                        onSubmit={submit}
                        onCancel={() => navigate(editing ? `/raffles/${raffleId}` : fileId ? `/raffle-files/${fileId}` : '/raffles')}
                    />
                </div>
            )}
        </DashboardLayout>
    );
}
