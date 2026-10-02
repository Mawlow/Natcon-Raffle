import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fitText, winnerName } from '../../lib/format';
import WinnersGrid from './WinnersGrid';

// How many winners share a row, by how many are on screen: few enough per
// row that each name stays large, enough rows that they all fit.
const columnsFor = (count) => (
    count <= 4 ? count
        : count <= 8 ? 4
            : count <= 10 ? 5
                : count <= 12 ? 4
                    : count <= 15 ? 5
                        : count <= 24 ? 6
                            : 8
);

// The tallest a name may be: a single winner fills the stage, and the more
// rows there are, the shorter each one.
const maxFontFor = (count, rows) => (
    count <= 1 ? 'min(15vh, 7rem)'
        : rows <= 1 ? 'min(9vh, 4.5rem)'
            : rows === 2 ? 'min(7vh, 3.5rem)'
                : rows === 3 ? 'min(5.5vh, 2.75rem)'
                    : rows === 4 ? 'min(4.5vh, 2.25rem)'
                        : 'min(3.5vh, 1.75rem)'
);

// More winners than this are shown a page at a time, so the names stay big.
export const PAGE_SIZE = 8;
// How long each page stays up before the next rolls in.
const PAGE_MS = 7000;
// How long the cards on screen take to play their way out before the next
// set comes in (the longest exit in winnerTransitions, with its stagger).
const LEAVE_MS = 800;

// The space the list may use across the screen, now that the trophies and
// palms are gone once the raffle is done.
const LIST_WIDTH_VW = 92;
const GAP_VW = 1;

/**
 * The closing screen of a finished raffle: every winner's name in draw order,
 * laid out in rows across the full width of the screen.
 *
 * Up to `pageSize` winners show together (0 = all of them). With more, they
 * are shown a page at a time: each page rolls up into the next, so every name
 * stays large. With `autoPage` the pages turn every few seconds and loop;
 * without it they wait for the Control Center. `pageCommand` ({ id, dir })
 * steps a page by hand, and `onPageChange(page, pages)` reports where the
 * pages are. `bare` leaves out the "Congratulations" heading, for the
 * winners-only display. `fill` lays the names out in a grid that fills the
 * room it is given (see WinnersGrid) — for the winners-only display, whose
 * header carries the heading. `transition` is how the names turn over when
 * the page or batch size changes (see winnerTransitions).
 */
export default function FinalWinners({
    winners: drawn = [],
    pageSize = PAGE_SIZE,
    autoPage = true,
    bare = false,
    fill = false,
    transition = 'flip',
    pageCommand = null,
    onPageChange,
}) {
    // Kept the same list while the winners are, so a refresh of the screen
    // does not make every name be measured and laid out again.
    const signature = drawn.map((winner) => `${winner.position}:${winner.ticket_number}:${winner.name ?? ''}`).join('|');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const winners = useMemo(() => [...drawn].sort((a, b) => a.position - b.position), [signature]);
    const count = winners.length;
    const perPage = pageSize > 0 ? pageSize : Math.max(count, 1);
    const pages = Math.max(1, Math.ceil(count / perPage));
    const paged = pages > 1;

    const [page, setPage] = useState(0);
    // The batch size the page was chosen for: a new size starts from the
    // first winners at once, so the screen turns over a single time.
    const [pageFor, setPageFor] = useState(perPage);
    const current = pageFor === perPage ? Math.min(page, pages - 1) : 0;

    // Each page holds for PAGE_MS, then the next rolls in; a hand step
    // restarts the wait because it changes the page.
    useEffect(() => {
        if (!paged || !autoPage) return undefined;
        const timer = setTimeout(() => setPage((value) => (Math.min(value, pages - 1) + 1) % pages), PAGE_MS);
        return () => clearTimeout(timer);
    }, [paged, autoPage, pages, current]);

    // A new batch size starts again from the first winners.
    useEffect(() => {
        setPage(0);
        setPageFor(perPage);
    }, [perPage]);

    useEffect(() => {
        if (!pageCommand || !paged) return;
        setPage((value) => (Math.min(value, pages - 1) + pageCommand.dir + pages) % pages);
        // Only a new command should step the page.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageCommand?.id]);

    useEffect(() => {
        onPageChange?.(current, pages);
    }, [current, pages, onPageChange]);

    // Tell the Control Center the pages are gone when this closes.
    useEffect(() => () => onPageChange?.(0, 1), [onPageChange]);

    const shown = useMemo(
        () => (paged ? winners.slice(current * perPage, (current + 1) * perPage) : winners),
        [winners, paged, current, perPage],
    );

    // The turnover for the grid layout. When the page, batch size or
    // transition changes, the cards on screen play their way out first; once
    // they are gone the new set is mounted fresh and plays its way in.
    // Picking a new transition replays the turnover so it can be seen.
    const setKey = `${perPage}-${current}-${transition}`;
    const [onScreen, setOnScreen] = useState({ key: setKey, winners: shown, transition });
    const leaving = onScreen.key !== setKey;
    useEffect(() => {
        if (!leaving) return undefined;
        const timer = setTimeout(() => setOnScreen({ key: setKey, winners: shown, transition }), LEAVE_MS);
        return () => clearTimeout(timer);
        // The set to bring in is read when the timer fires; only a new set restarts it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setKey, leaving]);

    const dots = paged && (
        <div className="mt-[clamp(0.75rem,2.2vh,1.5rem)] flex items-center gap-2" aria-hidden="true">
            {Array.from({ length: pages }, (_, index) => (
                <span
                    key={index}
                    className={`h-1.5 rounded-full transition-all duration-500 ${index === current ? 'w-6 bg-gold' : 'w-1.5 bg-white/25'}`}
                />
            ))}
        </div>
    );

    if (fill) {
        return (
            <div className="flex h-full w-full flex-col items-center">
                {/* A new page or a new batch size turns the whole set over: the
                    cards fold away, then the next ones flip in (see WinnersGrid). */}
                <div className="relative min-h-0 w-full flex-1">
                    <WinnersGrid
                        key={onScreen.key}
                        winners={leaving ? onScreen.winners : shown}
                        transition={onScreen.transition}
                        leaving={leaving}
                    />
                </div>
                {dots}
            </div>
        );
    }
    const layoutCount = paged ? perPage : count;
    const columns = Math.max(columnsFor(layoutCount), 1);
    const maxFont = maxFontFor(layoutCount, Math.ceil(layoutCount / columns));
    // Width of one name, less the card's padding.
    const nameWidth = (LIST_WIDTH_VW / columns) * 0.8;
    const card = layoutCount <= 4
        ? 'px-[clamp(1rem,2vw,2rem)] py-[clamp(0.6rem,1.8vh,1.25rem)]'
        : 'px-[clamp(0.75rem,1.2vw,1.25rem)] py-[clamp(0.5rem,1.4vh,1rem)]';


    return (
        <div className="flex w-full flex-col items-center">
            {!bare && (
                <motion.p
                    initial={{ opacity: 0, y: 14, letterSpacing: '0.34em' }}
                    animate={{ opacity: 1, y: 0, letterSpacing: '0.16em' }}
                    transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                    className="lux-foil pl-[0.16em] font-lux text-[clamp(1.5rem,4.2vw,3.5rem)] font-semibold uppercase leading-none"
                >
                    Congratulations!
                </motion.p>
            )}
            <div className="lux-ornament mt-[clamp(0.75rem,2vh,1.5rem)] w-[min(26rem,70vw)]" aria-hidden="true">
                <span className="block size-[7px] shrink-0 rotate-45 border border-gold bg-gold/30" />
            </div>

            {/* Each page rolls up out of view as the next rolls up into it. Rows
                wrap, so a short last row sits centred under the full ones. */}
            <div className="mt-[clamp(1rem,3vh,2.25rem)] overflow-hidden" style={{ width: `${LIST_WIDTH_VW}vw` }}>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.ol
                        key={paged ? current : 'all'}
                        initial={{ opacity: 0, y: '35%' }}
                        animate={{ opacity: 1, y: '0%' }}
                        exit={{ opacity: 0, y: '-35%' }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className="flex flex-wrap justify-center"
                        style={{ gap: `${GAP_VW}vw` }}
                    >
                        {shown.map((winner, index) => {
                            const name = winnerName(winner);
                            // A name may take two lines, so it is sized from its longest
                            // word or half its length, whichever is wider.
                            const longestWord = Math.max(...name.split(/\s+/).map((word) => word.length));
                            const sizingText = 'x'.repeat(Math.max(longestWord, Math.ceil(name.length / 2)));

                            return (
                                <motion.li
                                    key={`${winner.position}-${winner.ticket_number}`}
                                    initial={{ opacity: 0, y: 24, scale: 0.92 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ duration: 0.7, delay: 0.15 + Math.min(index * 0.07, 0.8), ease: [0.22, 1, 0.36, 1] }}
                                    // Solid rather than blurred glass, each on its own layer: a
                                    // backdrop blur behind every card, over the fireworks, was
                                    // redrawn every frame and made the reveal lag.
                                    className={`flex min-w-0 flex-col items-center justify-center rounded-2xl border border-gold/35 bg-black/65 shadow-gold-sm ${card}`}
                                    style={{ width: `calc((100% - ${(columns - 1) * GAP_VW}vw) / ${columns})`, willChange: 'transform, opacity' }}
                                >
                                    <span
                                        className="lux-foil line-clamp-2 max-w-full text-balance text-center font-lux font-bold uppercase leading-[1.1] tracking-[0.04em]"
                                        style={{ fontSize: fitText(sizingText, nameWidth, maxFont, 'vw') }}
                                        title={name}
                                    >
                                        {name}
                                    </span>
                                </motion.li>
                            );
                        })}
                    </motion.ol>
                </AnimatePresence>
            </div>

            {/* Where the pages are: one dot per page, the current one lit. */}
            {dots}
        </div>
    );
}
