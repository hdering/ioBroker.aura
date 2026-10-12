import type { CustomCell, CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import { comp, gapRow, showIconOf, showTitleOf, type Opts } from './common';

// evcc (EvccWidget): default, compact, flow, battery, production, consumption,
// loadpoints. Its layouts scale with the widget width, so the preset stacks the
// layout's pieces as components that keep that scaling — 'header', 'flow-row',
// 'flow-diagram', 'compact-row', 'battery-view' / 'production-view' /
// 'consumption-view', 'loadpoints' / 'loadpoints-compact' and 'tariff'. The power
// fields (pvPower, gridPower …) stay available for a grid of one's own.

const VIEW: Partial<Record<WidgetLayout, string>> = {
    battery: 'battery-view',
    production: 'production-view',
    consumption: 'consumption-view',
};

export function buildEvccGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const header = showTitleOf(o) || showIconOf(o);
    const showLoadpoints = o.showLoadpoints !== false;
    const left = (key: string, extra: Partial<CustomCell> = {}): CustomCell =>
        comp(key, { align: 'left', valign: 'top', ...extra });
    const b = new GridBuilder(1);
    /** Rows stacked with the layout's gap; the rest of the height stays free at the bottom. */
    const stack = (keys: string[], gap: number) => {
        keys.forEach((key, i) => {
            if (i > 0) gapRow(b, gap);
            // The diagram's labels reach past its box, as in the layout.
            b.row('auto', [left(key, key === 'flow-diagram' ? { allowOverflow: true } : {})]);
        });
        b.row('1fr', []);
    };

    switch (layout) {
        case 'default':
            stack([...(header ? ['header'] : []), 'flow-row', ...(showLoadpoints ? ['loadpoints'] : []), 'tariff'], 8);
            return b.build();
        case 'flow':
            stack([...(header ? ['header'] : []), 'flow-diagram', ...(showLoadpoints ? ['loadpoints'] : [])], 8);
            return b.build();
        case 'loadpoints':
            stack([...(header ? ['header'] : []), 'loadpoints'], 8);
            return b.build();
        case 'compact':
            // Centred block: header, the one-line flow, compact loadpoint cards.
            b.row('1fr', []);
            if (header) b.row('auto', [left('header')]);
            b.row('auto', [left('compact-row')]);
            if (showLoadpoints) b.row('auto', [left('loadpoints-compact')]);
            b.row('1fr', []);
            return b.build();
        default: {
            const view = VIEW[layout];
            if (!view) return null;
            if (header) b.row('auto', [left('header')]);
            b.row('1fr', [left(view)]);
            return b.build();
        }
    }
}
