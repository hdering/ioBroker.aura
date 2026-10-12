import type { CustomCell, CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import {
    FS,
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

// Clock (ClockWidget): default, card, minimal. Time, date and the custom format are
// the fields 'time' / 'date' / 'custom', 'extras' the chips row (week, city, sun).

const ACCENT = 'var(--accent)';

export function buildClockGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const display = (o.display as string | undefined) ?? 'time';
    const custom = typeof o.customFormat === 'string' && o.customFormat !== '';
    const hasExtras = !!(o.showWeek || o.showCity || o.showSunrise || o.showSunset);
    const timePx = Number(o.timeFontSize) || 0;
    const datePx = Number(o.dateFontSize) || 0;
    const customPx = Number(o.customFontSize) || 0;
    // leading-none: a row as tall as the text, the glyphs may reach out of it.
    const big = (key: string, px: number, color: string, extra: Partial<CustomCell> = {}): [string, CustomCell] => [
        `${px}px`,
        field(key, { fontSize: px, bold: true, color, align: 'center', allowOverflow: true, ...extra }),
    ];
    const small = (px: number): CustomCell =>
        field('date', { fontSize: px || FS.sm, color: SECONDARY, align: 'center' });
    const extras = (b: GridBuilder, span: number) => {
        if (hasExtras) b.row('auto', [comp('extras', { colSpan: span })]);
    };
    const row = (b: GridBuilder, [size, cell]: [string, CustomCell], span: number) =>
        b.row(size, [{ ...cell, colSpan: span }]);

    switch (layout) {
        case 'default': {
            // [icon] [title]
            //    time (date) — centred in the rest, chips below
            const b = new GridBuilder(showIcon ? [iconCol(o), '1fr'] : ['1fr']);
            const all = b.colCount;
            if (showTitle || showIcon)
                b.row(titleRowSize(o), [...(showIcon ? [iconCell()] : []), showTitle ? titleCell(o) : null]);
            b.row('1fr', []);
            // The custom format keeps its line height (no leading-none) — an 'auto' row.
            if (custom)
                b.row('auto', [big('custom', customPx || FS.xl, PRIMARY, { allowOverflow: false, colSpan: all })[1]]);
            else {
                if (display !== 'date') row(b, big('time', timePx || FS.xl, PRIMARY), all);
                if (display === 'date') row(b, big('date', datePx || FS.xl, PRIMARY), all);
                else if (display === 'datetime') b.row('auto', [{ ...small(datePx), colSpan: all }]);
            }
            extras(b, all);
            b.row('1fr', []);
            return b.build();
        }
        case 'card':
        case 'minimal': {
            // Centred stack in the accent colour; the card puts icon + title below it.
            const card = layout === 'card';
            // Outer 1fr columns centre the icon + title group of the card.
            const b = new GridBuilder(card && showIcon ? ['1fr', iconCol(o), 'auto', '1fr'] : ['1fr']);
            const all = b.colCount;
            b.row('1fr', []);
            if (custom) row(b, big('custom', customPx || FS.xl, ACCENT), all);
            else if (card) {
                if (display !== 'date') row(b, big('time', timePx || FS.xl, ACCENT), all);
                if (display === 'date') row(b, big('date', datePx || 24, ACCENT), all);
                else if (display === 'datetime') b.row('auto', [{ ...small(datePx), colSpan: all }]);
            } else {
                row(
                    b,
                    big(display === 'date' ? 'date' : 'time', (display === 'date' ? datePx : timePx) || FS.xl, ACCENT),
                    all,
                );
                if (display === 'datetime') b.row('auto', [{ ...small(datePx || FS.xs), colSpan: all }]);
            }
            extras(b, all);
            if (card && (showTitle || showIcon)) {
                b.row('4px', []); // gap-1.5 + mt-1
                b.row(titleRowSize(o), [
                    ...(showIcon ? [null, iconCell({ align: 'right' })] : []),
                    showTitle ? titleCell(o, showIcon ? { align: 'left' } : { align: 'center' }) : null,
                ]);
            }
            b.row('1fr', []);
            return b.build();
        }
        default:
            return null;
    }
}
