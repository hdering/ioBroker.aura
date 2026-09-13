/**
 * Second line of a list entry: extra datapoints beside the main one.
 *
 * Display only — no toggles, no writing. Each extra datapoint picks its own slot
 * (left / centre / right); all three slots are rendered even when empty, otherwise
 * a missing left slot would drag the centred one out of the middle.
 */
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import type { ioBrokerState, ElementConditionRule } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type { NumberFormat } from '../../utils/formatValue';
import type { ValueTransformSettings } from '../../utils/valueTransform';
import { entryValueText, type EntryStateMap } from './entryControls';
import type { ElementCondResult, RowCondResult } from '../../utils/rowConditions';
import { condAnimation, elementOf } from '../../utils/rowConditions';
import { isStampSub, stampFormat, stampTs, type DpStamp } from '../../utils/subDpStamp';
import { formatTimeDisplay, TIME_DASH } from '../../utils/timeDisplay';

/** One extra datapoint rendered in an entry's second line. Display only. */
export interface EntrySubDp extends ValueTransformSettings {
    /** Datapoint to read. Empty together with a timestamp `source` means the entry's
     *  own datapoint — the common case, and one fewer id to type per row. */
    id: string;
    /**
     * What this slot prints: the value (default), or when the datapoint last
     * changed / was last written. See utils/subDpStamp — the timestamp goes through
     * the same `valueTimeFormat` presets, defaulting to the relative text.
     */
    source?: 'value' | 'lastChange' | 'lastUpdate';
    /** Slot in the second line. Default 'left'. */
    align?: 'left' | 'center' | 'right';
    /** Free-text prefix in front of the value. Empty = value only. */
    label?: string;
    /** Iconify id / lucide name shown before the label. */
    icon?: string;
    unit?: string;
    decimals?: number;
    numberFormat?: NumberFormat;
    /** Font size in px. Default 9. */
    fontSize?: number;
    /** Text colour. Default --text-secondary. */
    color?: string;
    /** Value→text table, e.g. true → "ONLINE". Same shape as the "states" display. */
    states?: EntryStateMap[];
    /** Conditional formatting for this datapoint (issue #572). */
    conditions?: ElementConditionRule[];
}

const DEFAULT_FONT_SIZE = 9;

/** Key under which a sub-datapoint's condition result is looked up. Deliberately
 *  without an index: the dynamic list filters the array before rendering it, so an
 *  index would not survive the trip. Two identical datapoints in one row therefore
 *  share a result — a degenerate configuration to begin with. */
export function subCondKey(entryId: string, subId: string): string {
    return `${entryId}#${subId}`;
}

/**
 * Re-renders the caller every 30 s while `active`, so relative timestamps keep up
 * without a timer per row: the list widget owns this one hook, its re-render pulls
 * every second line with it.
 */
export function useRelativeTick(active: boolean): void {
    const [, setTick] = useState(0);
    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => setTick((n) => n + 1), 30_000);
        return () => clearInterval(id);
    }, [active]);
}

function SubDpItem({
    sub,
    val,
    stamp,
    listTransform,
    decimals,
    numFmt,
    cond,
}: {
    sub: EntrySubDp;
    val: ioBrokerState['val'];
    /** Timestamps of the datapoint behind this slot — only read in timestamp mode. */
    stamp?: DpStamp | null;
    listTransform?: ValueTransformSettings;
    decimals: number;
    numFmt?: NumberFormat;
    cond?: ElementCondResult;
}) {
    const t = useT();
    // Timestamp mode bypasses the value pipeline entirely: a factor on a unix epoch
    // is nonsense, and a list-wide time format must not reach it either — the slot's
    // own valueTimeFormat is the only thing that shapes it (utils/subDpStamp).
    const stampMode = isStampSub(sub);
    const ts = stampMode ? stampTs(sub, stamp) : 0;
    const stampText = stampMode
        ? ts > 0
            ? (formatTimeDisplay(ts, stampFormat(sub), t) ?? TIME_DASH)
            : TIME_DASH
        : null;
    // Same display pipeline as the main value: list-wide conversion as the default,
    // the extra datapoint's own settings win. Thresholds/controls are not offered here.
    const disp = stampMode
        ? null
        : entryValueText(sub, listTransform, val, sub.decimals ?? decimals, sub.numberFormat ?? numFmt, t);
    if (cond?.hide) return null;
    // A rule may resize the text; the icon still follows it unless the rule sizes
    // the icon separately.
    const fontSize = cond?.fontSize ?? sub.fontSize ?? DEFAULT_FONT_SIZE;
    // Condition beats the value→text table beats the configured default.
    const iconName = cond?.icon ?? disp?.state?.icon ?? sub.icon;
    const Icon = iconName ? getWidgetIcon(iconName, null!) : null;
    const color = cond?.color ?? disp?.state?.color ?? sub.color ?? 'var(--text-secondary)';
    // A mapped label or a condition text IS the text — the unit is not appended to
    // it, same rule the time format already follows.
    const raw = cond?.text ?? (stampMode ? stampText : disp?.text);
    const bare = cond?.text !== undefined || stampMode || !!disp?.isTime || !!disp?.state;
    const text = raw != null ? `${raw}${sub.unit && !bare ? ` ${sub.unit}` : ''}` : '–';
    // "vor 5 Min" hides the actual moment — the tooltip keeps it.
    const exact = stampMode && ts > 0 ? new Date(ts).toLocaleString() : '';
    const title = `${sub.label ? `${sub.label} ` : ''}${text}${exact ? ` (${exact})` : ''}`;
    return (
        <span
            className="flex items-center gap-1 min-w-0 truncate"
            style={{
                color,
                fontSize,
                fontWeight: cond?.bold ? 700 : undefined,
                fontStyle: cond?.italic ? 'italic' : undefined,
                animation: condAnimation(cond),
            }}
            title={title}
        >
            {Icon && (
                <Icon
                    size={cond?.iconSize ?? fontSize + 3}
                    className="shrink-0"
                    style={{ color: cond?.iconColor ?? color }}
                />
            )}
            {sub.label && <span className="truncate opacity-80">{sub.label}</span>}
            <span className="tabular-nums truncate">{text}</span>
        </span>
    );
}

export function EntrySubLine({
    subDps,
    values,
    stamps,
    mainStamp,
    listTransform,
    decimals,
    numFmt,
    entryId,
    conds,
}: {
    subDps: EntrySubDp[];
    /** Live `id → value` map, as returned by useTemplateValues. */
    values: Record<string, boolean | number | string | null>;
    /** Live `id → {ts, lc}` map for the same refs — only read in timestamp mode. */
    stamps?: Record<string, DpStamp>;
    /** Timestamps of the ROW's own datapoint, for slots that left the id empty. */
    mainStamp?: DpStamp | null;
    /** List-wide value conversion / time format; each entry's own settings win. */
    listTransform?: ValueTransformSettings;
    decimals: number;
    numFmt?: NumberFormat;
    /** Owning row — only needed to look up condition results. */
    entryId?: string;
    /** Condition results per sub-datapoint, keyed by subCondKey(). */
    conds?: Map<string, RowCondResult>;
}) {
    // An empty id is normally an unfinished row and prints nothing — except in
    // timestamp mode, where it deliberately means "this row's own datapoint".
    const usable = subDps.filter((s) => !!s?.id || isStampSub(s));
    if (usable.length === 0) return null;

    const slots: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right'];
    const justify = { left: 'justify-start', center: 'justify-center', right: 'justify-end' } as const;
    const group = (slot: 'left' | 'center' | 'right') => usable.filter((s) => (s.align ?? 'left') === slot);
    const render = (list: EntrySubDp[]) =>
        list.map((s, i) => {
            const res = entryId && conds ? conds.get(subCondKey(entryId, s.id)) : undefined;
            return (
                <SubDpItem
                    key={`${s.id}-${i}`}
                    sub={s}
                    val={values[s.id] ?? null}
                    stamp={s.id ? stamps?.[s.id] : mainStamp}
                    listTransform={listTransform}
                    decimals={decimals}
                    numFmt={numFmt}
                    cond={elementOf(res)}
                />
            );
        });

    // A single slot in use gets the whole row: the three-column grid below would cap
    // it at half the width and truncate values that fit perfectly well — which is
    // exactly what happens in the narrow compact / card cells.
    const used = slots.filter((slot) => group(slot).length > 0);
    if (used.length === 1) {
        return (
            <div
                className={`aura-entry-subline flex items-center gap-2 w-full min-w-0 leading-tight ${justify[used[0]]}`}
            >
                {render(group(used[0]))}
            </div>
        );
    }

    // minmax(0, 1fr) on the outer columns: plain 1fr never shrinks below its content,
    // so a long value would push the row wider instead of truncating. `auto` in the
    // middle keeps the centred group centred whatever the sides hold.
    return (
        <div
            className="aura-entry-subline grid items-center gap-2 w-full leading-tight"
            style={{ gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)' }}
        >
            {slots.map((slot) => (
                <span key={slot} className={`flex items-center gap-2 min-w-0 ${justify[slot]}`}>
                    {render(group(slot))}
                </span>
            ))}
        </div>
    );
}
