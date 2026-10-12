import type { CustomCell, CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import {
    FS,
    PRIMARY,
    STATE_COLOR,
    comp,
    contentPosOf,
    field,
    iconCell,
    iconCol,
    showIconOf,
    showTitleOf,
    titleCell,
    titleRowSize,
    type Opts,
} from './common';

// HTTP request (HttpRequestWidget): default / card (one look), compact, minimal.
// 'button' is the send button, 'button-wide' the same over the full width (default
// layout), 'status' the answer ("200 OK") — empty until something was sent.

export function buildHttpRequestGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const showStatus = o.showStatus !== false;
    const status = (extra: Partial<CustomCell>): CustomCell =>
        field('status', { fontSize: FS.xs, color: STATE_COLOR, ...extra });

    switch (layout) {
        case 'default':
        case 'card': {
            // [icon] [title]
            // [—— send button ——]   (stretched; contentPosition packs and aligns it instead)
            // [status]
            const { v, h } = contentPosOf(o.contentPosition, undefined);
            const b = new GridBuilder(showIcon ? [iconCol(o, 32), '1fr'] : ['1fr']);
            const all = b.colCount;
            if (v === 'center' || v === 'end') b.row('1fr', []);
            if (showTitle || showIcon) {
                // Packed with an alignment, the title row follows it too (items-*).
                b.row(titleRowSize(o, 32), [
                    ...(showIcon ? [iconCell()] : []),
                    showTitle ? titleCell(o, h && v !== 'between' ? { align: h } : {}) : null,
                ]);
                b.row(v === 'between' ? '1fr' : '6px', []);
            }
            b.row('auto', [
                v === 'between'
                    ? comp('button-wide', { colSpan: all, allowOverflow: true })
                    : comp('button', { align: h, colSpan: all, allowOverflow: true }),
            ]);
            if (showStatus) b.row('auto', [status({ align: h ?? 'left', colSpan: all })]);
            if (v === 'start' || v === 'center' || (v === 'between' && !(showTitle || showIcon))) b.row('1fr', []);
            return b.build();
        }
        case 'compact': {
            // One line: [title, greedy] [status] [button]
            const b = new GridBuilder(['1fr', 'auto', 'auto']);
            b.row('1fr', [
                showTitle ? titleCell(o, { fontSize: FS.sm, color: PRIMARY }) : null,
                showStatus ? status({ fontSize: 10, align: 'right' }) : null,
                comp('button', { align: 'right', allowOverflow: true }),
            ]);
            return b.build();
        }
        case 'minimal': {
            // Centred: button, status below
            const b = new GridBuilder(1);
            b.row('1fr', []);
            b.row('auto', [comp('button', { allowOverflow: true })]);
            if (showStatus) b.row('auto', [status({ fontSize: 10, align: 'center' })]);
            b.row('1fr', []);
            return b.build();
        }
        default:
            return null;
    }
}
