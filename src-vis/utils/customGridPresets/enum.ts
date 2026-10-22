import type { CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import {
    FS,
    SECONDARY,
    accentBar,
    addStatusBadges,
    comp,
    contentPosOf,
    iconCell,
    iconCol,
    showIconOf,
    showTitleOf,
    titleCell,
    titleRowSize,
    type Opts,
} from './common';

// Selection (EnumWidget): default, compact, minimal, card. 'label' is the current
// entry as the default and compact layouts show it, 'label-lg' the big one of
// minimal and card, 'select' the dropdown.

export function buildEnumGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const showValue = o.showValue !== false;
    const showSelect = o.showSelect !== false;
    const label = comp('label', { align: 'left' });
    const select = comp('select', { align: 'left', allowOverflow: true });
    // Content row as tall as the dropdown (or the label) — like the layouts' flex row,
    // without the cells' padding on top; the controls may reach into it.
    const selectH = { sm: 30, md: 38, lg: 46 }[(o.selectSize as 'sm' | 'md' | 'lg') ?? 'sm'] ?? 30;

    switch (layout) {
        case 'default':
        case 'card': {
            // [icon] [title ……………………]
            // [label] [dropdown] ………   (card: big label, at the bottom, accent bar in front)
            const card = layout === 'card';
            const lead = card ? ['8px', '4px'] : [];
            const pad: null[] = card ? [null, null] : [];
            const b = new GridBuilder([...lead, ...(showIcon ? [iconCol(o)] : []), 'auto', 'auto', '1fr']);
            const textSpan = b.colCount - lead.length;
            // Title and content: apart (justify-between, the default and always on the card)
            // or packed at the top / middle / bottom (contentPosition).
            const { v } = card ? { v: 'between' } : contentPosOf(o.contentPosition, undefined);
            if (v === 'center' || v === 'end') b.row('1fr', []);
            if (showTitle || showIcon) {
                b.row(titleRowSize(o), [
                    ...pad,
                    ...(showIcon ? [iconCell(card ? {} : { color: SECONDARY })] : []),
                    showTitle ? titleCell(o, { colSpan: textSpan - (showIcon ? 1 : 0) }) : null,
                ]);
                // gap-2 below the title row (the fixed row has no padding of its own to count).
                b.row(v === 'between' ? '1fr' : '2px', []);
            }
            if (showValue || showSelect)
                b.row(`${Math.max(showSelect ? selectH : 0, showValue ? (card ? 28 : 24) : 0)}px`, [
                    ...pad,
                    showValue
                        ? card
                            ? comp('label-lg', { align: 'left', colSpan: showIcon ? 2 : 1 })
                            : { ...label, colSpan: showIcon ? 2 : 1 }
                        : null,
                    showSelect ? select : null,
                ]);
            if (v === 'start' || v === 'center' || (v === 'between' && !(showTitle || showIcon))) b.row('1fr', []);
            if (card) b.put(0, 0, accentBar(b.rowCount));
            addStatusBadges(b, o);
            return b.build();
        }
        case 'compact': {
            // One line: [icon] [title, greedy] [label] [dropdown]
            const b = new GridBuilder([...(showIcon ? [iconCol(o)] : []), '1fr', 'auto', 'auto']);
            b.row('1fr', [
                ...(showIcon ? [iconCell({ color: SECONDARY })] : []),
                showTitle ? titleCell(o, { fontSize: FS.sm }) : null,
                showValue ? comp('label', { align: 'right' }) : null,
                showSelect ? comp('select', { align: 'right', allowOverflow: true }) : null,
            ]);
            addStatusBadges(b, o);
            return b.build();
        }
        // The circle menu (#815) carries the same content as the minimal stack.
        case 'circle':
        case 'minimal': {
            // Centred stack (gap-2): big label, dropdown, title
            const b = new GridBuilder(1);
            b.row('1fr', []);
            if (showValue) b.row('auto', [comp('label-lg')]);
            if (showSelect) b.row('auto', [comp('select', { allowOverflow: true })]);
            if (showTitle) {
                b.row('2px', []);
                b.row('auto', [titleCell(o, { align: 'center' })]);
            }
            b.row('1fr', []);
            addStatusBadges(b, o);
            return b.build();
        }
        default:
            return null;
    }
}
