/*
 * Days and sets: a raffle file's raffles grouped in the order they are
 * drawn. A raffle's `draw_day` is 1 for Day 1, 2 for Day 2, … or null, and
 * within a day its `draw_set` is 1 for the First Set, 2 for the Second, …
 * or null.
 */
const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

/** "First Set", "Second Set", … "Set 11". */
export const setLabel = (set) => (set >= 1 && set <= ORDINALS.length ? `${ORDINALS[set - 1]} Set` : `Set ${set}`);

/** "Day 1", "Day 2", … */
export const dayLabel = (day) => `Day ${day}`;

// Null sorts last: raffles in no day or set come after the ones that are.
const order = (a, b) => (a === null ? 1 : b === null ? -1 : a - b);

/**
 * The raffles grouped by day and set, in drawing order: [{ day, set, label,
 * raffles }], Day 1's sets first and then the raffles in no day (day: null),
 * each day's sets first and then its raffles in no set (set: null).
 */
export function groupBySet(raffles, noSetLabel = 'Not in a set') {
    const groups = new Map();
    raffles.forEach((raffle) => {
        const day = raffle.draw_day ?? null;
        const set = raffle.draw_set ?? null;
        const key = `${day}/${set}`;
        if (!groups.has(key)) groups.set(key, { day, set, raffles: [] });
        groups.get(key).raffles.push(raffle);
    });

    return [...groups.values()]
        .sort((a, b) => order(a.day, b.day) || order(a.set, b.set))
        .map((group) => ({
            ...group,
            label: [group.day === null ? null : dayLabel(group.day), group.set === null ? noSetLabel : setLabel(group.set)].filter(Boolean).join(' · '),
        }));
}

/** The raffles in drawing order: by day, then set, then as they were made. */
export const inDrawingOrder = (raffles) => groupBySet(raffles).flatMap((group) => group.raffles);
