import { formatNumber } from '../../lib/format';

/*
 * The two choices a redraw needs — how many winners, and whether the cleared
 * winners stay in the pool. Shared by the raffle page and the Control Center.
 */
const REDRAW_OPTIONS = [
    {
        value: 'include',
        title: 'Previous winners can win again',
        text: 'Everyone goes back into the draw, including this draw\'s winners.',
    },
    {
        value: 'exclude',
        title: 'Leave previous winners out',
        text: 'This draw\'s winners are marked EXCLUDED and cannot be picked in the redraw.',
    },
];

export const validRedrawCount = (value) => /^\d+$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 500;

/** How many winners the redraw should have. Starts at the current number; any number from 1 to 500 works. */
export function RedrawCount({ value, onChange, eligible }) {
    const valid = validRedrawCount(value);

    return (
        <div>
            <label className="label" htmlFor="redraw_count">Number of winners for the redraw</label>
            <input
                id="redraw_count"
                type="number"
                min="1"
                max="500"
                className="input w-40"
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
            <p className={`mt-1.5 text-xs ${valid ? 'text-muted-dim' : 'text-red-300'}`}>
                {valid
                    ? `Fewer or more than before — any number works. About ${formatNumber(eligible)} tickets can be drawn.`
                    : 'Enter a number from 1 to 500.'}
            </p>
        </div>
    );
}

/** The other decision a redraw needs: whether the cleared winners stay in the pool. */
export function RedrawChoice({ value, onChange }) {
    return (
        <fieldset>
            <legend className="label">Should the previous winners join the redraw?</legend>
            <div className="space-y-2">
                {REDRAW_OPTIONS.map((option) => {
                    const selected = value === option.value;
                    return (
                        <label
                            key={option.value}
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition focus-within:ring-2 focus-within:ring-gold/50 ${
                                selected ? 'border-gold/60 bg-gold/[0.07]' : 'border-line bg-black/30 hover:border-gold/30'
                            }`}
                        >
                            <input
                                type="radio"
                                name="redraw_choice"
                                value={option.value}
                                checked={selected}
                                onChange={() => onChange(option.value)}
                                className="mt-0.5 h-4 w-4 accent-[#d4af37]"
                            />
                            <span>
                                <span className="block text-sm font-semibold text-white">{option.title}</span>
                                <span className="mt-0.5 block text-xs leading-relaxed text-muted">{option.text}</span>
                            </span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}
