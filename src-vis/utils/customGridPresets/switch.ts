import type { CustomCell, CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import {
    CARD,
    FS,
    PRIMARY,
    STATE_COLOR,
    addStatusBadges,
    iconCell,
    iconCol,
    showIconOf,
    showTitleOf,
    titleCell,
    type Opts,
} from './common';

// Switch (SwitchWidget): default, card, compact. The state label is the custom
// grid's 'value' cell; 'toggle-lg' is the control in the size the standard
// layouts draw it, 'icon-button' the card's whole-card click as a clickable icon.

export function buildSwitchGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const showLabel = o.showLabel !== false;
    const label = (extra: Partial<CustomCell>): CustomCell => ({ type: 'value', color: STATE_COLOR, ...extra });
    const toggle: CustomCell = {
        type: 'component',
        componentKey: 'toggle-lg',
        align: 'right',
        valign: 'middle',
        allowOverflow: true,
    };

    switch (layout) {
        case 'default': {
            // Title row on top; label left and control right at the bottom.
            const b = new GridBuilder(showIcon ? [iconCol(o), '1fr', 'auto'] : ['1fr', 'auto']);
            if (showTitle || showIcon) {
                b.row('auto', [...(showIcon ? [iconCell()] : []), showTitle ? titleCell(o, { colSpan: 2 }) : null]);
            }
            b.row('1fr', [
                showLabel
                    ? label({
                          fontSize: FS.base,
                          bold: true,
                          align: 'left',
                          valign: 'bottom',
                          colSpan: showIcon ? 2 : 1,
                      })
                    : null,
                { ...toggle, valign: 'bottom' },
            ]);
            addStatusBadges(b, o);
            return b.build();
        }
        case 'card': {
            // Centred stack: clickable icon, title, label.
            const b = new GridBuilder(1);
            b.row('1fr', []);
            if (showIcon)
                b.row('auto', [
                    {
                        type: 'component',
                        componentKey: 'icon-button',
                        align: 'center',
                        valign: 'middle',
                        color: CARD.icon,
                    },
                ]);
            if (showTitle)
                b.row('auto', [titleCell(o, { fontSize: FS.sm, bold: true, color: CARD.title, align: 'center' })]);
            if (showLabel)
                b.row('auto', [label({ fontSize: FS.xs, color: CARD.label, align: 'center', valign: 'middle' })]);
            b.row('1fr', []);
            addStatusBadges(b, o);
            return { ...b.build(), bg: CARD.bg, borderColor: CARD.border };
        }
        case 'compact': {
            // One line: [icon] [title, greedy] [control]
            const b = new GridBuilder([...(showIcon ? [iconCol(o)] : []), '1fr', 'auto']);
            b.row('1fr', [
                ...(showIcon ? [iconCell()] : []),
                showTitle ? titleCell(o, { fontSize: FS.sm, color: PRIMARY }) : null,
                toggle,
            ]);
            addStatusBadges(b, o);
            return b.build();
        }
        default:
            return null;
    }
}
