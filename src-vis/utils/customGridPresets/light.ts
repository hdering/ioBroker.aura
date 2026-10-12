import type { CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import {
    addStatusBadges,
    comp,
    gapRow,
    iconCell,
    iconCol,
    showIconOf,
    showTitleOf,
    titleCell,
    titleRowSize,
    type Opts,
} from './common';

// Light (LightWidget): light-all, light-brightness, light-color, light-temperature.
// All four are title, status ("An · 60%"), the main control with its tab pill and
// the swatch row. 'tabs-all' / 'tabs-brightness' / … are main control + pill with
// the tab set of that layout, 'status' the status line, 'palette' the swatches.

const TABS: Partial<Record<WidgetLayout, string>> = {
    'light-all': 'tabs-all',
    'light-brightness': 'tabs-brightness',
    'light-color': 'tabs-color',
    'light-temperature': 'tabs-temperature',
};

export function buildLightGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const tabs = TABS[layout];
    if (!tabs) return null;
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const showState = o.showState !== false;
    const colorMode = (o.colorMode as string | undefined) ?? 'none';
    const presets = o.colorPresets as unknown[] | undefined;
    const showPalette =
        o.showPalette !== false && colorMode !== 'none' && (presets === undefined || presets.length > 0);

    // Stack with gap 8: [icon] [title] / status / main control + pill / swatches
    const b = new GridBuilder(showIcon ? [iconCol(o), '1fr'] : ['1fr']);
    const all = b.colCount;
    if (showTitle || showIcon) {
        b.row(titleRowSize(o), [...(showIcon ? [iconCell()] : []), showTitle ? titleCell(o) : null]);
        b.row('2px', []); // the fixed title row has no padding of its own to count
    }
    if (showState) {
        // As tall as its text-base line — every pixel here is one the main control loses.
        b.row('24px', [comp('status', { colSpan: all })]);
        gapRow(b, 8);
    }
    // The colour wheel sizes itself to the width and may reach past the row, as in the layout.
    b.row('1fr', [comp(tabs, { colSpan: all, allowOverflow: true })]);
    if (showPalette) {
        gapRow(b, 8);
        b.row('auto', [comp('palette', { colSpan: all })]);
    }
    addStatusBadges(b, o);
    return b.build();
}
