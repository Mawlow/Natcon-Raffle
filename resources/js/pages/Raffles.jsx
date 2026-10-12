import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, FolderOpen, FolderPlus } from 'lucide-react';
import api, { parseError } from '../lib/api';
import DashboardLayout from '../components/layout/DashboardLayout';
import RaffleCard from '../components/raffle/RaffleCard';
import RaffleFiles from '../components/raffle/RaffleFiles';
import RedrawDialog from '../components/raffle/RedrawDialog';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import LoadingState from '../components/ui/LoadingState';
import EmptyState from '../components/ui/EmptyState';
import { deleteRaffleConfirmation } from '../lib/deleteRaffle';
import { useToast } from '../context/ToastContext';

/**
 * The Raffles page: the raffle files. Each file is an event — its
 * participants, its raffles ready to draw and its pre-draws — and opens on
 * its own page. Raffles made before files existed are listed beneath, to
 * open or move into a file.
 */
export default function Raffles() {
    const toast = useToast();

    const [files, setFiles] = useState(null);
    const [unfiled, setUnfiled] = useState([]);
    const [showUnfiled, setShowUnfiled] = useState(false);
    const [creatingFile, setCreatingFile] = useState(false);
    const [confirm, setConfirm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [redrawing, setRedrawing] = useState(null);

    const load = useCallback(async () => {
        try {
            const [fileList, raffleList] = await Promise.all([
                api.get('/raffle-files'),
                // Pre-draws too: one whose raffle was deleted is only listed here.
                api.get('/raffles', { params: { unfiled: 1, include_predraws: 1, per_page: 100 } }),
            ]);
            setFiles(fileList.data.data);
            setUnfiled(raffleList.data.data);
        } catch (error) {
            toast.error(parseError(error, 'The raffle files could not be loaded.').message);
            setFiles((current) => current ?? []);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const moveToFile = async (raffle, file) => {
        try {
            await api.post(`/raffles/${raffle.id}/file`, { raffle_file_id: file.id });
            toast.success(`"${raffle.name}" moved to ${file.name}.`);
            load();
        } catch (error) {
            toast.error(parseError(error, 'The raffle could not be moved.').message);
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
            title="Raffle files"
            subtitle="Each file is an event: its participants, raffles ready to draw and pre-draws"
            actions={
                <button type="button" className="btn btn-gold" onClick={() => setCreatingFile(true)}>
                    <FolderPlus size={16} />
                    <span className="hidden sm:inline">New Raffle File</span>
                </button>
            }
        >
            {files === null && <LoadingState label="Loading raffle files" />}

            {files !== null && (
                <>
                    <RaffleFiles files={files} creating={creatingFile} onCreatingChange={setCreatingFile} />

                    {files.length === 0 && !creatingFile && (
                        <EmptyState
                            icon={FolderOpen}
                            title="No raffle files yet"
                            description="Create a raffle file for your event, e.g. NATCON 2026. Upload its participants once, then make its raffles and pre-draws inside it."
                            action={(
                                <button type="button" className="btn btn-gold" onClick={() => setCreatingFile(true)}>
                                    <FolderPlus size={16} /> New Raffle File
                                </button>
                            )}
                        />
                    )}

                    {unfiled.length > 0 && (
                        <section className="mt-10">
                            <button
                                type="button"
                                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted transition hover:text-white"
                                onClick={() => setShowUnfiled((open) => !open)}
                                aria-expanded={showUnfiled}
                            >
                                Raffles not in a file ({unfiled.length})
                                <ChevronDown size={14} className={`transition ${showUnfiled ? 'rotate-180' : ''}`} />
                            </button>

                            {showUnfiled && (
                                <>
                                    <p className="mb-4 mt-1.5 text-xs text-muted-dim">
                                        Made before raffle files. Open one from its menu, or move it into a file — it keeps its own participants and winners.
                                    </p>
                                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {unfiled.map((raffle, index) => (
                                            <RaffleCard
                                                key={raffle.id}
                                                raffle={raffle}
                                                delay={index * 0.04}
                                                files={files}
                                                onMoveToFile={moveToFile}
                                                onRedraw={setRedrawing}
                                                onArchive={(target) => setConfirm({
                                                    title: 'Archive this raffle?',
                                                    description: `"${target.name}" will be hidden from the active list. Its winners and audit trail are kept.`,
                                                    confirmLabel: 'Archive',
                                                    successMessage: 'Raffle archived.',
                                                    run: () => api.post(`/raffles/${target.id}/archive`),
                                                })}
                                                onDelete={(target) => setConfirm({
                                                    ...deleteRaffleConfirmation(target),
                                                    successMessage: 'Raffle deleted.',
                                                    run: () => api.delete(`/raffles/${target.id}`),
                                                })}
                                            />
                                        ))}
                                    </div>
                                </>
                            )}
                        </section>
                    )}
                </>
            )}

            <RedrawDialog raffle={redrawing} onClose={() => setRedrawing(null)} onDone={load} />

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
