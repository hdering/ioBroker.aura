import type { CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import { comp, iconCell, iconCol, showIconOf, showTitleOf, titleCell, titleRowSize, type Opts } from './common';

// Calendar (CalendarWidget): default, card, compact, minimal, agenda. The header is
// split into cells (icon, title, 'refresh'); the event bodies are components as the
// layouts draw them — 'events-list', 'events-agenda', 'next-event' (card),
// 'next-row' (compact) and 'count' (minimal). The per-event fields (summary1,
// date1 …) stay available for a grid of one's own.

const BODY: Partial<Record<WidgetLayout, string>> = {
    default: 'events-list',
    agenda: 'events-agenda',
    card: 'next-event',
    minimal: 'count',
};

export function buildCalendarGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    if (layout === 'compact') {
        const b = new GridBuilder(1);
        b.row('1fr', [comp('next-row', { align: 'left' })]);
        return b.build();
    }
    const body = BODY[layout];
    if (!body) return null;
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const scale = Number(o.calFontScale) || 1;
    const minimal = layout === 'minimal';

    // [icon] [title ……………] [⟳]     (minimal: no refresh button, text-xs title)
    // [body …………………………………………]
    const b = new GridBuilder([...(showIcon ? [iconCol(o)] : []), '1fr', 'auto']);
    const all = b.colCount;
    if (showTitle || showIcon || !minimal)
        b.row(titleRowSize(o), [
            ...(showIcon ? [iconCell()] : []),
            showTitle ? titleCell(o, minimal ? {} : { fontSize: Math.round(11 * scale) }) : null,
            minimal ? null : comp('refresh', { align: 'right' }),
        ]);
    // gap below the header (default/agenda 6px, minimal mb-1); the card's body starts right away
    if (layout !== 'card' && b.rowCount) b.row('0px', []);
    // The list rows reach into the widget padding (bleed), as in the layouts.
    const bleed = body === 'events-list' || body === 'events-agenda';
    b.row('1fr', [
        comp(body, { align: 'left', valign: 'top', colSpan: all, ...(bleed ? { allowOverflow: true } : {}) }),
    ]);
    return b.build();
}
