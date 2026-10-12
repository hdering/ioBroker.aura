import type { CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import { FS, comp, iconCell, iconCol, showIconOf, showTitleOf, titleCell, titleRowSize, type Opts } from './common';

// Text input (InputWidget): default, compact. 'input-row' is the field with its unit
// and — per the submit mode — the send button, as the layouts draw it; a multi-line
// field gets its send button as 'submit-auto' in a row of its own.

export function buildInputGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const multiline = !!o.multiline;

    switch (layout) {
        case 'default': {
            // [icon] [title]
            // [field ………………………… unit] [send]
            const b = new GridBuilder(showIcon ? [iconCol(o), '1fr'] : ['1fr']);
            const all = b.colCount;
            if (showTitle || showIcon) {
                b.row(titleRowSize(o), [...(showIcon ? [iconCell()] : []), showTitle ? titleCell(o) : null]);
                // gap-1.5 (the fixed title row has no padding of its own to count)
                b.row('0px', []);
            }
            b.row(multiline ? '1fr' : 'auto', [
                comp('input-row', { colSpan: all, valign: multiline ? 'top' : 'middle', allowOverflow: true }),
            ]);
            if (multiline) b.row('auto', [comp('submit-auto', { align: 'right', colSpan: all })]);
            else b.row('1fr', []);
            return b.build();
        }
        case 'compact': {
            // One line: [icon] [title, at most half] [field … unit] [send]
            const b = new GridBuilder([...(showIcon ? [iconCol(o)] : []), 'fit-content(50%)', '1fr']);
            b.row('1fr', [
                ...(showIcon ? [iconCell()] : []),
                showTitle ? titleCell(o, { fontSize: FS.sm }) : null,
                comp('input-row', { allowOverflow: true }),
            ]);
            return b.build();
        }
        default:
            return null;
    }
}
