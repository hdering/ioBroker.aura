import type { CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import {
    addStatusBadges,
    comp,
    iconCell,
    iconCol,
    showIconOf,
    showTitleOf,
    titleCell,
    titleRowSize,
    type Opts,
} from './common';

// Raumklima (#838): the default layout as a custom grid. The big reading with the
// primary values is the component 'main-values', the right-hand column (target,
// humidity, pressure …) 'secondary-values', the further values 'metrics', the
// history 'chart' with its range chips 'range-chips' above it.

/** Is any of the further values placed in the grid below the main row? */
function hasGridMetrics(o: Opts): boolean {
    const list = Array.isArray(o.metrics) ? (o.metrics as { slot?: string }[]) : [];
    return list.some((m) => (m.slot ?? 'grid') === 'grid');
}

export function buildClimateGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    if (layout !== 'default') return null;
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const b = new GridBuilder(showIcon ? [iconCol(o), '1fr', 'auto'] : ['1fr', 'auto']);
    const all = b.colCount;
    const textSpan = all - 1;

    if (showTitle || showIcon)
        b.row(titleRowSize(o), [...(showIcon ? [iconCell()] : []), showTitle ? titleCell(o, { colSpan: 2 }) : null]);
    b.row('auto', [
        comp('main-values', { align: 'left', valign: 'bottom', colSpan: textSpan, allowOverflow: true }),
        comp('secondary-values', { align: 'right', valign: 'bottom', allowOverflow: true }),
    ]);
    if (hasGridMetrics(o)) b.row('auto', [comp('metrics', { align: 'left', colSpan: all })]);
    if (o.showComfort === true) b.row('auto', [comp('comfort-badge', { align: 'left', colSpan: all })]);

    const showChart = o.showChart !== false && !!o.historyInstance;
    if (showChart) {
        if (o.lockRange !== true) b.row('auto', [comp('range-chips', { align: 'left', colSpan: all })]);
        b.row('1fr', [comp('chart', { colSpan: all })]);
    } else {
        b.row('1fr', []);
    }
    addStatusBadges(b, o);
    return b.build();
}
