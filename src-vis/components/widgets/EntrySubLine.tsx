/**
 * Second line of a list entry: extra datapoints beside the main one.
 *
 * Display only — no toggles, no writing. Each extra datapoint picks its own slot
 * (left / centre / right); all three slots are rendered even when empty, otherwise
 * a missing left slot would drag the centred one out of the middle.
 */
import { useT } from '../../i18n';
import type { ioBrokerState } from '../../types';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import type { NumberFormat } from '../../utils/formatValue';
import type { ValueTransformSettings } from '../../utils/valueTransform';
import { entryValueText } from './entryControls';

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
}

const DEFAULT_FONT_SIZE = 9;

function SubDpItem({
    sub,
    val,
    listTransform,
    decimals,
    numFmt,
}: {
    sub: EntrySubDp;
    val: ioBrokerState['val'];
    listTransform?: ValueTransformSettings;
    decimals: number;
    numFmt?: NumberFormat;
}) {
    const t = useT();
    // Same display pipeline as the main value: list-wide conversion as the default,
    // the extra datapoint's own settings win. Thresholds/controls are not offered here.
    const disp = entryValueText(sub, listTransform, val, sub.decimals ?? decimals, sub.numberFormat ?? numFmt, t);
    const fontSize = sub.fontSize ?? DEFAULT_FONT_SIZE;
    const Icon = sub.icon ? getWidgetIcon(sub.icon, null!) : null;
    const text = disp.text != null ? `${disp.text}${sub.unit && !disp.isTime ? ` ${sub.unit}` : ''}` : '–';
    return (
        <span
            className="flex items-center gap-1 min-w-0 truncate"
            style={{ color: sub.color ?? 'var(--text-secondary)', fontSize }}
            title={sub.label ? `${sub.label} ${text}` : text}
        >
            {Icon && <Icon size={fontSize + 3} className="shrink-0" />}
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
}: {
    subDps: EntrySubDp[];
    /** Live `id → value` map, as returned by useTemplateValues. */
    values: Record<string, boolean | number | string | null>;
    /** List-wide value conversion / time format; each entry's own settings win. */
    listTransform?: ValueTransformSettings;
    decimals: number;
    numFmt?: NumberFormat;
}) {
    const usable = subDps.filter((s) => !!s?.id);
    if (usable.length === 0) return null;

    const slots: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right'];
    const justify = { left: 'justify-start', center: 'justify-center', right: 'justify-end' } as const;
    const group = (slot: 'left' | 'center' | 'right') => usable.filter((s) => (s.align ?? 'left') === slot);
    const render = (list: EntrySubDp[]) =>
        list.map((s, i) => (
            <SubDpItem
                key={`${s.id}-${i}`}
                sub={s}
                val={values[s.id] ?? null}
                listTransform={listTransform}
                decimals={decimals}
                numFmt={numFmt}
            />
        ));

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
