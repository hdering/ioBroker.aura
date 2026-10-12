import type { CustomCell, CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import {
    FS,
    PRIMARY,
    SECONDARY,
    addStatusBadges,
    comp,
    field,
    iconCell,
    iconCol,
    showIconOf,
    showTitleOf,
    titleCell,
    titleRowSize,
    type Opts,
} from './common';

// Slider (SliderWidget): default — horizontal (title row with the value, control
// line below) or vertical (value, max, control, min). 'slider-line' is the
// horizontal control line with min/max beside it, 'slider' the bare control (and
// scale), 'actions' the action buttons. The value cell shows value + unit.

export function buildSliderGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    if (layout !== 'default') return null;
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const showValue = o.showValue !== false;
    const showMinMax = !!o.showMinMax && !o.showScale;
    const hasActions = Array.isArray(o.actions) && o.actions.length > 0;
    // text-xl, leading-none: a row as tall as the number, the text may reach out of it.
    const value = (extra: Partial<CustomCell>): CustomCell => ({
        type: 'value',
        fontSize: FS.xl,
        bold: true,
        color: PRIMARY,
        allowOverflow: true,
        ...extra,
    });

    if (o.orientation === 'vertical') {
        // Centred column: value, max, control (greedy), min, actions
        const b = new GridBuilder(1);
        if (showValue) b.row('28px', [value({ align: 'center', valign: 'middle' })]);
        if (showMinMax) b.row('auto', [field('max', { fontSize: FS.xs, color: SECONDARY, align: 'center' })]);
        b.row('1fr', [comp('slider')]);
        if (showMinMax) b.row('auto', [field('min', { fontSize: FS.xs, color: SECONDARY, align: 'center' })]);
        if (hasActions) b.row('auto', [comp('actions')]);
        addStatusBadges(b, o);
        return b.build();
    }

    // [icon] [title, greedy] [value]
    // [min — slider — max ………………]
    // [actions]
    const b = new GridBuilder([...(showIcon ? [iconCol(o)] : []), '1fr', 'auto']);
    if (showTitle || showIcon || showValue)
        b.row(showValue ? '28px' : titleRowSize(o), [
            ...(showIcon ? [iconCell()] : []),
            showTitle ? titleCell(o) : null,
            showValue ? value({ align: 'right', valign: 'middle' }) : null,
        ]);
    // gap-2 below the title row: the fixed row has no padding of its own to count.
    if (b.rowCount) b.row('4px', []);
    b.row('1fr', [comp(showMinMax ? 'slider-line' : 'slider', { colSpan: b.colCount, allowOverflow: true })]);
    if (hasActions) b.row('auto', [comp('actions', { align: 'left', colSpan: b.colCount })]);
    addStatusBadges(b, o);
    return b.build();
}
