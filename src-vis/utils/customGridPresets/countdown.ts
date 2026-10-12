import type { CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import {
    PRIMARY,
    SECONDARY,
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

// Countdown (CountdownWidget): default, compact. 'digits-fill' are the digits that
// size themselves to their cell, 'digits-inline' the compact row's digits, 'progress',
// 'controls' and 'presets' the default layout's rows, 'primary-sm' / 'stop-sm' the
// compact buttons, 'state' the state text ("läuft").

export function buildCountdownGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const isDp = o.source === 'datapoint';
    const showProgress = o.showProgress !== false && !isDp;
    const showControls = o.showControls !== false && !isDp;
    const hasPresets = o.showPresets !== false && !isDp && Array.isArray(o.presets) && o.presets.length > 0;

    switch (layout) {
        case 'default': {
            // [icon] [title ……] [state]
            //        12:34          (fills the rest)
            // [progress ……………………………]
            // [− ▶ ■ +]
            // [presets]
            const b = new GridBuilder([...(showIcon ? [iconCol(o, 18)] : []), '1fr', 'auto']);
            const all = b.colCount;
            if (showTitle || showIcon)
                b.row(titleRowSize(o, 18), [
                    ...(showIcon ? [iconCell()] : []),
                    showTitle ? titleCell(o, { color: PRIMARY }) : null,
                    field('state', { fontSize: 10, color: SECONDARY, align: 'right' }),
                ]);
            b.row('1fr', [comp('digits-fill', { colSpan: all })]);
            if (showProgress) b.row('auto', [comp('progress', { colSpan: all })]);
            if (showControls) b.row('auto', [comp('controls', { colSpan: all, allowOverflow: true })]);
            if (hasPresets) b.row('auto', [comp('presets', { colSpan: all })]);
            return b.build();
        }
        case 'compact': {
            // One line: [icon] [title, greedy] [12:34] [▶] [■]
            const b = new GridBuilder([...(showIcon ? [iconCol(o, 18)] : []), '1fr', 'auto', 'auto', 'auto']);
            b.row('1fr', [
                ...(showIcon ? [iconCell()] : []),
                showTitle ? titleCell(o, { color: PRIMARY }) : null,
                comp('digits-inline', { align: 'right' }),
                showControls ? comp('primary-sm', { allowOverflow: true }) : null,
                showControls ? comp('stop-sm', { allowOverflow: true }) : null,
            ]);
            return b.build();
        }
        default:
            return null;
    }
}
