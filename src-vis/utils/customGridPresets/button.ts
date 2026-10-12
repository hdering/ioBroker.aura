import type { CustomCell, CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import {
    FS,
    SECONDARY,
    contentPosOf,
    gapRow,
    iconCell,
    iconCol,
    showIconOf,
    showTitleOf,
    titleCell,
    type Opts,
} from './common';

// Button (ButtonWidget): default / card (one look), compact, minimal. The label
// (buttonLabel, else the title) is the custom grid's 'value' cell, 'icon' the
// configured icon — the layouts show one only when an icon is set.

const LABEL_COLOR = 'var(--button-text, var(--text-primary))';

export function buildButtonGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const showTitle = showTitleOf(o);
    const withIcon = showIconOf(o) && !!o.icon;
    const label = (extra: Partial<CustomCell>): CustomCell => ({
        type: 'value',
        fontSize: FS.sm,
        // font-medium: the grid only knows bold, which is closer than regular.
        bold: true,
        color: LABEL_COLOR,
        ...extra,
    });

    switch (layout) {
        case 'default':
        case 'card': {
            // Title on top, icon + label positioned in the rest (contentPosition, default centre).
            const { v, h } = contentPosOf(o.contentPosition, 'cc');
            const b = new GridBuilder(1);
            if (showTitle) b.row('16px', [titleCell(o)]);
            if (v !== 'start') b.row('1fr', []);
            if (withIcon) {
                b.row('auto', [iconCell({ align: h })]);
                gapRow(b, 8);
            }
            b.row('auto', [label({ align: h, valign: 'middle', wrap: true })]);
            if (v !== 'end') b.row('1fr', []);
            return b.build();
        }
        case 'compact': {
            // One line: [icon] [label] ……… [›]
            const b = new GridBuilder(['2px', ...(withIcon ? [iconCol(o, 28, 2)] : []), 'auto', '1fr', '2px']);
            b.row('1fr', [
                null,
                ...(withIcon ? [iconCell()] : []),
                label({ valign: 'middle' }),
                { type: 'text', text: '›', fontSize: FS.xs, color: SECONDARY, align: 'right', valign: 'middle' },
            ]);
            return b.build();
        }
        case 'minimal': {
            // Just the icon — or the label when there is none.
            const b = new GridBuilder(1);
            b.row('1fr', [withIcon ? iconCell({ align: 'center' }) : label({ align: 'center', valign: 'middle' })]);
            return b.build();
        }
        default:
            return null;
    }
}
