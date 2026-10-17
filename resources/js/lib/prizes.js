import { cashPrizeText } from './format';

/*
 * Prize tiers: a raffle can give out several prizes, each to its own number
 * of winners, drawn top to bottom (`raffle.prizes`). Every winner carries the
 * id of the prize they won (`prize_id`). A raffle without tiers has one prize
 * for everyone, in its own prize_* fields, and these helpers leave it alone.
 */

export const hasPrizes = (raffle) => (raffle?.prizes?.length ?? 0) > 0;

/**
 * Pre-selected winners: the winners were chosen before the event and the
 * draw reveals them in order, each with their own prize. The screens only
 * get the prizes (`staged_prizes`), never who is on the list.
 */
export const hasStagedPrizes = (raffle) => (raffle?.staged_prizes?.length ?? 0) > 0;

const namedPrize = (name) => (name ? { prize_name: name, prize_type: 'item', prize_value: null, prize_currency: null } : null);

const drawnFor = (prize, winners) => winners.filter((winner) => winner.prize_id === prize.id).length;

/** The prize the next winner is drawn for: the first with a place left. */
export function nextPrize(raffle, winners = []) {
    if (!hasPrizes(raffle)) return null;
    return raffle.prizes.find((prize) => drawnFor(prize, winners) < prize.winners_count) ?? null;
}

/**
 * With pre-selected winners, the run of the list the next winner is in: the
 * winners listed one after another with the same prize ({ start, end },
 * end exclusive). Null once the list is done.
 */
function stagedRun(raffle, winners) {
    const staged = raffle.staged_prizes;
    const at = winners.length;
    if (at >= staged.length) return null;
    let start = at;
    while (start > 0 && staged[start - 1] === staged[at]) start -= 1;
    let end = at;
    while (end < staged.length && staged[end] === staged[at]) end += 1;
    return { start, end };
}

/**
 * Which batch the next winner belongs to — their prize tier, or their run
 * of the pre-selected list — so an auto-run can stop at the end of one.
 * Null for a raffle drawn as a single batch.
 */
export function batchKey(raffle, winners = []) {
    if (!raffle) return null;
    if (hasStagedPrizes(raffle)) return stagedRun(raffle, winners)?.start ?? null;
    return nextPrize(raffle, winners)?.id ?? null;
}

/**
 * How many winners the next batch has in all, drawn or not: its prize tier,
 * its run of the pre-selected list, or the whole raffle.
 */
export function batchSize(raffle, winners = []) {
    if (!raffle) return 0;
    if (hasStagedPrizes(raffle)) {
        const run = stagedRun(raffle, winners);
        return run ? run.end - run.start : 0;
    }
    const prize = nextPrize(raffle, winners);
    return prize ? prize.winners_count : raffle.winners_count;
}

/**
 * How many winners the next "draw them all" covers: what is left of the
 * current prize (or run of pre-selected winners), or of the whole raffle.
 */
export function batchRemaining(raffle, winners = []) {
    if (!raffle) return 0;
    if (hasStagedPrizes(raffle)) {
        const run = stagedRun(raffle, winners);
        return run ? run.end - winners.length : 0;
    }
    const prize = nextPrize(raffle, winners);
    if (prize) return prize.winners_count - drawnFor(prize, winners);
    return Math.max(0, raffle.winners_count - winners.length);
}

/**
 * The prize on the screens right now: the one just won while a winner is
 * revealed (and once the raffle is done), otherwise the one about to be
 * drawn. Null for a raffle without tiers.
 */
export function prizeOnStage(raffle, phase, winners = []) {
    const last = winners[winners.length - 1];
    if (hasStagedPrizes(raffle)) {
        const staged = raffle.staged_prizes;
        if (last?.prize_name && (phase === 'reveal' || phase === 'complete')) return namedPrize(last.prize_name);
        return namedPrize(staged[winners.length] ?? staged[staged.length - 1]);
    }
    if (!hasPrizes(raffle)) return null;
    const won = last && raffle.prizes.find((prize) => prize.id === last.prize_id);
    if (won && (phase === 'reveal' || phase === 'complete')) return won;
    return nextPrize(raffle, winners) ?? won ?? raffle.prizes[raffle.prizes.length - 1];
}

/** The photo saved for a prize name, if any (`raffle.prize_images`: name => URL). */
export const prizeImageFor = (raffle, name) => (name && raffle?.prize_images?.[name]) || null;

/**
 * The raffle with its headline prize swapped for the one on stage, and that
 * prize's photo as `prize_image` (null when it has none).
 */
export function withPrizeOnStage(raffle, phase, winners) {
    const prize = prizeOnStage(raffle, phase, winners);
    if (!prize) return { ...raffle, prize_image: prizeImageFor(raffle, raffle.prize_name) };
    return {
        ...raffle,
        prize_name: prize.prize_name,
        prize_type: prize.prize_type,
        prize_value: prize.prize_value,
        prize_currency: prize.prize_currency,
        prize_image: prizeImageFor(raffle, prize.prize_name),
    };
}

/**
 * Every prize name a raffle shows on the screens — its own prize, each prize
 * of its prize list, or each prize of its pre-selected list — for choosing a
 * photo per prize.
 */
export function prizeNames(raffle) {
    if (!raffle) return [];
    if (hasStagedPrizes(raffle)) return [...new Set(raffle.staged_prizes)];
    if (hasPrizes(raffle)) return [...new Set(raffle.prizes.map((prize) => prize.prize_name))];
    return raffle.prize_name ? [raffle.prize_name] : [];
}

/**
 * What a winner won, as one line for the winners list: the tier they were
 * drawn for, or the raffle's own prize when it has no tiers. Cash prizes
 * lead with their amount. Null when no prize is set.
 */
export function winnerPrizeLabel(raffle, winner) {
    if (!raffle) return null;
    if (winner.prize_name) return winner.prize_name;
    const prize = hasPrizes(raffle)
        ? raffle.prizes.find((tier) => tier.id === winner.prize_id)
        : raffle;
    if (!prize) return null;
    if (prize.prize_type !== 'item') return cashPrizeText(prize.prize_value, prize.prize_currency) ?? prize.prize_name ?? null;
    return prize.prize_name || null;
}
