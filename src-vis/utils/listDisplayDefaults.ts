/**
 * The dynamic list's list-wide "Darstellung" (display type + the options of that type).
 *
 * Same reasoning as the row icon (see ListIconPanel): the rows come from a filter and
 * change on every sync, so a per-datapoint display can only ever cover the rows that
 * happen to exist right now. The list therefore carries one display block every
 * discovered row starts with — `options.entryDisplay`, edited in the datapoint dialog's
 * tab "Darstellung".
 *
 * Precedence is all-or-nothing per row, not per field: an entry with its own
 * `displayType` is configured completely on its own (its own switch style, its own
 * state mappings …) and ignores the list-wide block. Only an entry without one inherits
 * it. Mixing the two per field would let a list-wide "Schalter (Icon)" push icon
 * settings into a row switched to "Schieberegler" — nonsense the editor could not show
 * either.
 */
import type { EntryControlConfig } from '../components/widgets/entryControls';

/**
 * Keys the list-wide block never pushes onto an entry: `id` identifies the row, and the
 * value conversion already has a list-level fallback of its own (options.valueFactor …,
 * applied by entryValueText) which this must not shadow.
 */
const NOT_INHERITED = new Set([
    'id',
    'valueTransform',
    'valueFactor',
    'valueOffset',
    'valueTimeFormat',
    'valueTimePattern',
]);

/** True when this entry takes its display from the list-wide block. */
export function listDisplayApplies(entry: EntryControlConfig, listDisplay?: EntryControlConfig): boolean {
    return !!listDisplay?.displayType && !entry.displayType;
}

/**
 * One entry as the widget should render it: its own settings, filled up with the
 * list-wide display block when the entry declares no display of its own.
 */
export function applyListDisplay<T extends EntryControlConfig>(entry: T, listDisplay?: EntryControlConfig): T {
    if (!listDisplayApplies(entry, listDisplay)) return entry;
    const out = { ...entry } as Record<string, unknown>;
    for (const [k, v] of Object.entries(listDisplay as Record<string, unknown>)) {
        if (v === undefined || NOT_INHERITED.has(k)) continue;
        // Only fill gaps — an entry that set the field keeps it (its own row icon size
        // must survive a list-wide switch style, for instance).
        if (out[k] === undefined) out[k] = v;
    }
    return out as T;
}

/** Datapoint ids in a display block that only ever make sense for ONE row. */
export const ROW_SPECIFIC_DP_KEYS = ['shutterUpDp', 'shutterStopDp', 'shutterDownDp', 'statusDp'] as const;

/** Which of those the list-wide block carries — the editor warns about them. */
export function rowSpecificDps(listDisplay?: EntryControlConfig): string[] {
    if (!listDisplay) return [];
    return ROW_SPECIFIC_DP_KEYS.filter((k) => !!(listDisplay as Record<string, unknown>)[k]);
}
