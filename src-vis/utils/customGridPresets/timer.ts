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

// Time switch (TimerWidget): default, compact. 'status-line' is the default layout's
// "2 aktive / 3 Ereignisse", 'event-list' its list with the add button, 'master' /
// 'master-sm' the master switch, 'events-compact' the compact list, 'countShort' "2/3".

export function buildTimerGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const showMaster = o.showMasterSwitch !== false;
    const showEvents = o.showEvents !== false;
    const showAdd = o.showAddButton !== false;

    switch (layout) {
        case 'default': {
            // [icon] [title ……………] [master]
            // [status line ……………………………]
            // [events + add …………………………]
            const b = new GridBuilder([...(showIcon ? [iconCol(o)] : []), '1fr', 'auto']);
            const all = b.colCount;
            b.row(titleRowSize(o), [
                ...(showIcon ? [iconCell()] : []),
                showTitle ? titleCell(o, { color: PRIMARY }) : null,
                showMaster ? comp('master', { align: 'right', allowOverflow: true }) : null,
            ]);
            b.row('auto', [comp('status-line', { align: 'left', colSpan: all })]);
            if (showEvents) b.row('1fr', [comp('event-list', { align: 'left', valign: 'top', colSpan: all })]);
            else {
                b.row('1fr', []);
                if (showAdd) b.row('auto', [comp('add', { colSpan: all })]);
            }
            return b.build();
        }
        case 'compact': {
            // [icon] [title ……] [2/3] [master]
            // [events + add ………………………]
            const b = new GridBuilder([...(showIcon ? [iconCol(o)] : []), '1fr', 'auto', 'auto']);
            const all = b.colCount;
            b.row(titleRowSize(o), [
                ...(showIcon ? [iconCell()] : []),
                showTitle ? titleCell(o, { fontSize: 11, color: PRIMARY }) : null,
                field('countShort', { fontSize: 10, color: SECONDARY, align: 'right' }),
                showMaster ? comp('master-sm', { align: 'right', allowOverflow: true }) : null,
            ]);
            if (showEvents) b.row('1fr', [comp('events-compact', { align: 'left', valign: 'top', colSpan: all })]);
            else b.row('1fr', []);
            return b.build();
        }
        default:
            return null;
    }
}
