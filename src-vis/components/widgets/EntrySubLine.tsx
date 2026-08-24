/**
 * Second line of a list entry: extra datapoints beside the main one.
 *
 * Display only — no toggles, no writing. Each extra datapoint picks its own slot
 * (left / centre / right); all three slots are rendered even when empty, otherwise
 * a missing left slot would drag the centred one out of the middle.
 */
import { useT } from '../../i18n';
import type { ioBrokerState, ElementConditionRule } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type { NumberFormat } from '../../utils/formatValue';
import type { ValueTransformSettings } from '../../utils/valueTransform';
import { entryValueText, type EntryStateMap } from './entryControls';
import type { ElementCondResult, RowCondResult } from '../../utils/rowConditions';
import { partOf } from '../../utils/rowConditions';

/** One extra datapoint rendered in an entry's second line. Display only. */
export interface EntrySubDp extends ValueTransformSettings {
    id: string;
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

function SubDpItem({
    sub,
    val,
    listTransform,
    decimals,
    numFmt,
    cond,
}: {
    sub: EntrySubDp;
    val: ioBrokerState['val'];
    listTransform?: ValueTransformSettings;
    decimals: number;
    numFmt?: NumberFormat;
    cond?: ElementCondResult;
}) {
    const t = useT();
    // Same display pipeline as the main value: list-wide conversion as the default,
    // the extra datapoint's own settings win. Thresholds/controls are not offered here.
    const disp = entryValueText(sub, listTransform, val, sub.decimals ?? decimals, sub.numberFormat ?? numFmt, t);
    if (cond?.hide) return null;
    const fontSize = sub.fontSize ?? DEFAULT_FONT_SIZE;
    // Condition beats the value→text table beats the configured default.
    const iconName = cond?.icon ?? disp.state?.icon ?? sub.icon;
    const Icon = iconName ? getWidgetIcon(iconName, null!) : null;
    const color = cond?.color ?? disp.state?.color ?? sub.color ?? 'var(--text-secondary)';
    // A mapped label or a condition text IS the text — the unit is not appended to
    // it, same rule the time format already follows.
    const raw = cond?.text ?? disp.text;
    const bare = cond?.text !== undefined || disp.isTime || !!disp.state;
    const text = raw != null ? `${raw}${sub.unit && !bare ? ` ${sub.unit}` : ''}` : '–';
    return (
        <span
            className="flex items-center gap-1 min-w-0 truncate"
            style={{
                color,
                fontSize,
                fontWeight: cond?.bold ? 700 : undefined,
                fontStyle: cond?.italic ? 'italic' : undefined,
            }}
            title={sub.label ? `${sub.label} ${text}` : text}
        >
            {Icon && <Icon size={fontSize + 3} className="shrink-0" style={{ color: cond?.iconColor ?? color }} />}
            {sub.label && <span className="truncate opacity-80">{sub.label}</span>}
            <span className="tabular-nums truncate">{text}</span>
        </span>
    );
}

export function EntrySubLine({
    subDps,
    values,
    listTransform,
    decimals,
    numFmt,
    entryId,
    conds,
}: {
    subDps: EntrySubDp[];
    /** Live `id → value` map, as returned by useTemplateValues. */
    values: Record<string, boolean | number | string | null>;
    /** List-wide value conversion / time format; each entry's own settings win. */
    listTransform?: ValueTransformSettings;
    decimals: number;
    numFmt?: NumberFormat;
    /** Owning row — only needed to look up condition results. */
    entryId?: string;
    /** Condition results per sub-datapoint, keyed by subCondKey(). */
    conds?: Map<string, RowCondResult>;
}) {
    const usable = subDps.filter((s) => !!s?.id);
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
                    listTransform={listTransform}
                    decimals={decimals}
                    numFmt={numFmt}
                    cond={res ? partOf(res, 'value') : undefined}
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
