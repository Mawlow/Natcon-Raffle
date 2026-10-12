import { useCallback, useEffect, useState } from 'react';
import { Building2, Layers, Loader2, Tag, Users } from 'lucide-react';
import api from '../../lib/api';
import { formatNumber } from '../../lib/format';

/*
 * Choosing who can win: everyone, only some tags, only some developers, or
 * both — participants with one of the chosen tags AND one of the chosen
 * developers. Used by the raffle-wide "Who can win" panel and by each prize
 * in the prize list. `value` is null (everyone), { type: 'tag'|'developer',
 * values }, or { type: 'both', tags, developers }.
 */
const TAGS = { key: 'tags', noun: 'tag', title: 'Tags', empty: 'No tags were imported. Add a "Tag" column to the participants CSV.' };
const DEVELOPERS = { key: 'developers', noun: 'developer', title: 'Developers', empty: 'No developers were imported. Add a "Qualified Developers" column to the participants CSV, with developers separated by |.' };

const MODES = [
    { key: 'all', label: 'Everyone', icon: Users, lists: [] },
    { key: 'tag', label: 'By tag', icon: Tag, lists: [TAGS] },
    { key: 'developer', label: 'By developer', icon: Building2, lists: [DEVELOPERS] },
    { key: 'both', label: 'Tag + developer', icon: Layers, lists: [TAGS, DEVELOPERS] },
];

/** The tags and developers picked in `value`, whatever its type. */
export function poolPicks(value) {
    return {
        tags: value?.type === 'tag' ? value.values : value?.type === 'both' ? value.tags ?? [] : [],
        developers: value?.type === 'developer' ? value.values : value?.type === 'both' ? value.developers ?? [] : [],
    };
}

/** The pool for a mode and its picks: null when nothing is picked. */
function poolFor(mode, { tags, developers }) {
    if (mode === 'tag') return tags.length ? { type: 'tag', values: tags } : null;
    if (mode === 'developer') return developers.length ? { type: 'developer', values: developers } : null;
    if (mode === 'both') return tags.length || developers.length ? { type: 'both', tags, developers } : null;
    return null;
}

/** "Everyone", "Tag: ELITE", "Tag: ELITE + Developer: Filinvest". */
export function poolSummary(value) {
    const { tags, developers } = poolPicks(value);
    const part = (noun, list) => (list.length ? `${noun}${list.length === 1 ? '' : 's'}: ${list.join(', ')}` : null);
    return [part('Tag', tags), part('Developer', developers)].filter(Boolean).join(' + ') || 'Everyone';
}

/** The raffle's tags and developers with their ticket counts; `reloadKey` refreshes them. */
export function usePoolGroups(raffleId, reloadKey) {
    const [groups, setGroups] = useState(null);

    const reload = useCallback(() => (
        api.get(`/raffles/${raffleId}/participants/groups`)
            .then(({ data }) => setGroups(data.data))
            .catch(() => setGroups({ tags: [], developers: [] }))
    ), [raffleId]);

    useEffect(() => { reload(); }, [reload, reloadKey]);

    return [groups, reload];
}

export default function PoolPicker({ value, onChange, groups, disabled }) {
    // The tab can differ from the value: picking "By developer" shows the
    // list, but everyone stays in until a developer is chosen.
    const [mode, setMode] = useState(value?.type ?? 'all');
    // "Tag + developer" with only one list picked is saved as that list
    // alone; the tab stays on "Tag + developer" so the other list can follow.
    useEffect(() => {
        if (value) setMode((current) => (current === 'both' && value.type !== 'all' ? current : value.type));
    }, [value?.type]); // eslint-disable-line react-hooks/exhaustive-deps

    const picks = poolPicks(value);

    // Switching keeps what still applies — tags picked by tag stay picked
    // under "Tag + developer" — and drops what the new mode hides.
    const chooseMode = (key) => {
        setMode(key);
        const next = poolFor(key, picks);
        if (JSON.stringify(next) !== JSON.stringify(value ?? null)) onChange(next);
    };

    const toggle = (list, item) => {
        const current = picks[list];
        const updated = current.includes(item) ? current.filter((other) => other !== item) : [...current, item];
        onChange(poolFor(mode, { ...picks, [list]: updated }));
    };

    const current = MODES.find((item) => item.key === mode) ?? MODES[0];

    return (
        <div>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-black/40 p-1 sm:grid-cols-4" role="radiogroup" aria-label="Who can win">
                {MODES.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={key === mode}
                        disabled={disabled}
                        onClick={() => chooseMode(key)}
                        className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-semibold transition disabled:opacity-60 ${
                            key === mode ? 'bg-gold text-black' : 'text-muted hover:text-white'
                        }`}
                    >
                        <Icon size={14} className="shrink-0" />
                        <span className="truncate">{label}</span>
                    </button>
                ))}
            </div>

            {mode === 'both' && (
                <p className="mt-4 text-xs text-muted-dim">
                    Only participants with one of the chosen tags <strong className="text-white/80">and</strong> one of the chosen developers can win.
                </p>
            )}

            {current.lists.map((list) => (
                <PickList
                    key={list.key}
                    list={list}
                    options={groups?.[list.key]}
                    selected={picks[list.key]}
                    showTitle={current.lists.length > 1}
                    disabled={disabled}
                    onToggle={(item) => toggle(list.key, item)}
                />
            ))}
        </div>
    );
}

function PickList({ list, options, selected, showTitle, disabled, onToggle }) {
    if (!options) {
        return <p className="mt-4 flex items-center gap-2 text-sm text-muted"><Loader2 size={14} className="animate-spin" /> Loading…</p>;
    }
    if (options.length === 0) return <p className="mt-4 text-sm text-muted">{list.empty}</p>;

    return (
        <div className="mt-4">
            {showTitle && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{list.title}</p>}
            <p className={`${showTitle ? 'mt-1' : ''} text-xs text-muted-dim`}>
                {selected.length
                    ? `Only participants with ${selected.length === 1 ? 'this' : 'any of these'} ${list.noun}${selected.length === 1 ? '' : 's'} can win.`
                    : showTitle ? `Pick one or more ${list.noun}s.` : 'Pick one or more. Until then, everyone can win.'}
                {' '}Numbers show tickets still in play / total.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
                {options.map((option) => {
                    const on = selected.includes(option.value);
                    return (
                        <button
                            key={option.value}
                            type="button"
                            aria-pressed={on}
                            disabled={disabled}
                            onClick={() => onToggle(option.value)}
                            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60 ${
                                on ? 'border-gold bg-gold/15 text-gold-bright' : 'border-line bg-black/30 text-white/80 hover:border-gold/40'
                            }`}
                        >
                            {option.value}
                            <span className={`tabular text-xs font-medium ${on ? 'text-gold/80' : 'text-muted-dim'}`}>
                                {formatNumber(option.eligible)}/{formatNumber(option.total)}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
