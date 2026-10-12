import type { CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import { iconCell, iconCol, showIconOf, showTitleOf, titleCell, type Opts } from './common';

// Knob (KnobWidget): default (arc), knob-scale, knob-endless. All three are a title
// row over the dial; which dial the custom layout draws is the option `dialStyle`,
// so the preset hands that over as well.

const DIAL_STYLE: Partial<Record<WidgetLayout, string>> = {
    default: 'bogen',
    'knob-scale': 'skala',
    'knob-endless': 'endless',
};

export function buildKnobGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    if (!DIAL_STYLE[layout]) return null;
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const b = new GridBuilder(showIcon ? [iconCol(o, 18), '1fr'] : ['1fr']);
    // The title row as tall as the icon, like the layouts' flex row: an 'auto' row adds the
    // cells' padding, and every pixel the row takes is one the dial loses.
    if (showTitle || showIcon)
        b.row(`${Math.max(Number(o.iconSize) || 18, 16)}px`, [
            ...(showIcon ? [iconCell()] : []),
            showTitle ? titleCell(o) : null,
        ]);
    b.row('1fr', [{ type: 'component', componentKey: 'dial', align: 'center', valign: 'middle', colSpan: b.colCount }]);
    return b.build();
}

/** Options the custom layout needs besides the grid to draw the dial of `layout`. */
export function knobOptionPatch(layout: WidgetLayout): Opts | null {
    const style = DIAL_STYLE[layout];
    return style ? { dialStyle: style } : null;
}
