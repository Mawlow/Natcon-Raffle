/*
 * Sets: a raffle file's raffles grouped in the order they are drawn. A
 * raffle's `draw_set` is 1 for the First Set, 2 for the Second, … or null.
 */
const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

/** "First Set", "Second Set", … "Set 11". */
export const setLabel = (set) => (set >= 1 && set <= ORDINALS.length ? `${ORDINALS[set - 1]} Set` : `Set ${set}`);

/**
 * The raffles grouped by set, in drawing order: [{ set, label, raffles }],
 * the sets first and then the raffles in no set (set: null).
 */
export function groupBySet(raffles, noSetLabel = 'Not in a set') {
    const groups = new Map();
    raffles.forEach((raffle) => {
        const key = raffle.draw_set ?? null;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(raffle);
    });

    return [...groups.entries()]
        .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
        .map(([set, list]) => ({ set, label: set === null ? noSetLabel : setLabel(set), raffles: list }));
}

/** The raffles in drawing order: by set, then as they were made. */
export const inDrawingOrder = (raffles) => groupBySet(raffles).flatMap((group) => group.raffles);
