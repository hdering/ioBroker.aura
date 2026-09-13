/**
 * Timestamp mode for the second line of a list entry.
 *
 * A datapoint in the second line normally prints its value. `source` switches that
 * line to the datapoint's *timestamp* instead — the same information the universal
 * widget shows below a cell, but per extra datapoint and in place of the value:
 *
 *   'value'      → the value (default, nothing changes)
 *   'lastChange' → `lc`, when the value last CHANGED
 *   'lastUpdate' → `ts`, when the adapter last WROTE it (a hanging sensor differs)
 *
 * Pure on purpose: the widgets, the template resolver and the unit test all share
 * these four helpers, and only the type of `EntrySubDp` is imported (type-only, so
 * no React ends up in the test bundle).
 */
import type { EntrySubDp } from '../components/widgets/EntrySubLine';

/** The two timestamps of an ioBroker state, as far as this module cares. */
export interface DpStamp {
    /** Last update, epoch ms. */
    ts?: number;
    /** Last change, epoch ms. */
    lc?: number;
}

/** True when this extra datapoint prints a timestamp instead of its value. */
export function isStampSub(sub?: EntrySubDp | null): boolean {
    return !!sub && !!sub.source && sub.source !== 'value';
}

/**
 * The timestamp to print, or 0 when there is none yet.
 *
 * `lastChange` falls back to `ts`: a state that has never changed since the adapter
 * started carries `lc === 0` on some adapters, and "–" would read as "no datapoint"
 * rather than "not changed yet". Same rule the widget frame already follows.
 */
export function stampTs(sub: EntrySubDp, stamp?: DpStamp | null): number {
    if (!isStampSub(sub) || !stamp) return 0;
    if (sub.source === 'lastUpdate') return stamp.ts || 0;
    return stamp.lc || stamp.ts || 0;
}

/**
 * Output format of a timestamp line. Reuses the entry's own time-display setting
 * (`valueTimeFormat`, see TIME_DISPLAY_PRESETS) so date, time and custom token
 * patterns come for free; unset means the relative text ("vor 5 Min").
 */
export function stampFormat(sub: EntrySubDp): string {
    const f = sub.valueTimeFormat;
    return f && f !== 'none' ? f : 'relative';
}

/**
 * True when at least one of these datapoints prints a relative text — only then
 * does the list need a repeating re-render to keep "vor 5 Min" honest.
 */
export function subDpsNeedTick(subs: (EntrySubDp | null | undefined)[] | undefined): boolean {
    return !!subs?.some((s) => !!s && isStampSub(s) && stampFormat(s) === 'relative');
}
