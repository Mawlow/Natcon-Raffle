import { formatNumber } from './format';

/**
 * The confirmation shown before a raffle is deleted outright. Anything with
 * participants or winners must be confirmed by typing DELETE, because the
 * delete takes all of it with the raffle and cannot be undone.
 */
export function deleteRaffleConfirmation(raffle) {
    const participants = raffle.participants_count ?? 0;
    const winners = raffle.winners_drawn ?? 0;
    const predraws = raffle.predraws_count ?? 0;
    const hasData = participants > 0 || winners > 0 || predraws > 0;

    const lost = [
        participants > 0 && `${formatNumber(participants)} participant${participants === 1 ? '' : 's'}`,
        winners > 0 && `${formatNumber(winners)} drawn winner${winners === 1 ? '' : 's'}`,
        predraws > 0 && `the ${formatNumber(predraws)} pre-draw${predraws === 1 ? '' : 's'} made from it, with their winners`,
        'its draw history and settings',
    ].filter(Boolean);

    return {
        title: 'Delete this raffle permanently?',
        description:
            `"${raffle.name}" will be deleted together with ${lost.join(', ')}.\n\n`
            + 'This cannot be undone. To keep its results but hide it, archive it instead.',
        confirmLabel: 'Delete permanently',
        requireText: hasData ? 'DELETE' : null,
    };
}
