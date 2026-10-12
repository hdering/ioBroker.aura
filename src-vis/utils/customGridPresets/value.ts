import type { CustomCell, CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import {
    FS,
    PRIMARY,
    SECONDARY,
    STATE_COLOR,
    VALUE_COLOR,
    accentBar,
    addStatusBadges,
    iconCell,
    iconCol,
    showIconOf,
    showTitleOf,
    titleCell,
    type Opts,
} from './common';

// Value display (ValueWidget): default, card, compact, minimal.

function valueParts(o: Opts) {
    return {
        showValue: o.showValue !== false,
        showUnit: o.showUnit !== false && !!o.unit,
        valueSize: Number(o.valueFontSize) || FS.xl,
    };
}

export function buildValueGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const { showValue, showUnit, valueSize } = valueParts(o);
    const value = (extra: Partial<CustomCell>): CustomCell => ({ type: 'value', fontSize: valueSize, ...extra });
    const unit = (extra: Partial<CustomCell>): CustomCell => ({ type: 'unit', ...extra });

    switch (layout) {
        case 'default':
        case 'card': {
            const card = layout === 'card';
            // Title row on top, value at the bottom (the standard stack is justify-between).
            // Content columns: [icon] [value overflow] [unit, greedy]. The value spans icon +
            // overflow so the unit sits right behind it while the icon column only holds the
            // icon. The card adds its accent bar plus a spacer column in front.
            const lead = card ? ['8px', '4px'] : [];
            const b = new GridBuilder([...lead, ...(showIcon ? [iconCol(o), 'auto', '1fr'] : ['auto', '1fr'])]);
            const pad: null[] = card ? [null, null] : [];
            if (showTitle || showIcon) {
                b.row('auto', [
                    ...pad,
                    ...(showIcon
                        ? [card ? iconCell({ componentKey: 'icon-card' }) : iconCell({ color: SECONDARY })]
                        : []),
                    showTitle ? titleCell(o, { colSpan: 2 }) : null,
                ]);
            }
            b.row('1fr', [
                ...pad,
                showValue
                    ? value({ align: 'left', valign: 'bottom', color: VALUE_COLOR, colSpan: showIcon ? 2 : 1 })
                    : null,
                showValue && showUnit
                    ? unit(
                          card
                              ? { fontSize: FS.lg, bold: true, color: STATE_COLOR, align: 'left', valign: 'bottom' }
                              : { fontSize: FS.sm, color: SECONDARY, align: 'left', valign: 'bottom' },
                      )
                    : null,
            ]);
            if (card) b.put(0, 0, accentBar(b.rowCount));
            addStatusBadges(b, o);
            return b.build();
        }
        case 'compact': {
            // One line: [icon] [title, greedy] [value] [unit]
            const b = new GridBuilder([...(showIcon ? [iconCol(o)] : []), '1fr', 'auto', 'auto']);
            b.row('1fr', [
                ...(showIcon ? [iconCell({ componentKey: 'icon-compact' })] : []),
                showTitle ? titleCell(o, { fontSize: FS.sm, color: PRIMARY }) : null,
                showValue ? value({ align: 'right', valign: 'middle', color: VALUE_COLOR }) : null,
                showValue && showUnit
                    ? unit({ fontSize: FS.sm, color: SECONDARY, align: 'left', valign: 'middle' })
                    : null,
            ]);
            addStatusBadges(b, o);
            return b.build();
        }
        case 'minimal': {
            // Value (+ unit) above the title, centred as a block. Spacer columns keep
            // the value/unit pair in the middle, spacer rows centre it vertically.
            const b = new GridBuilder(['1fr', 'auto', 'auto', '1fr']);
            b.row('1fr', []);
            if (showValue) {
                b.row('auto', [
                    null,
                    value({ align: 'right', valign: 'bottom', color: STATE_COLOR, colSpan: showUnit ? 1 : 2 }),
                    showUnit
                        ? unit({
                              fontSize: Math.round(valueSize * 0.9),
                              bold: true,
                              color: SECONDARY,
                              align: 'left',
                              valign: 'bottom',
                          })
                        : null,
                ]);
            }
            if (showTitle) b.row('auto', [titleCell(o, { align: 'center', colSpan: 4 })]);
            b.row('1fr', []);
            addStatusBadges(b, o);
            return b.build();
        }
        default:
            return null;
    }
}
