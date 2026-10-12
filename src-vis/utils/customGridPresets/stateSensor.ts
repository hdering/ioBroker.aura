import type { CustomCell, CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import {
    CARD,
    FS,
    SECONDARY,
    STATE_COLOR,
    addStatusBadges,
    iconCell,
    iconCol,
    showIconOf,
    showTitleOf,
    titleCell,
    type Opts,
} from './common';

// Binary sensor, window contact and state image share one set of layouts: an icon,
// the title and a state label in the state's colour (the custom grid's 'value'
// cell carries that label).

export interface StateSensorStyle {
    /** Title colour in the compact layout (window contact: primary + medium weight). */
    compactTitle: { color: string; bold?: boolean };
    /** Icon size when the option is unset (the state image draws 48 px). */
    iconSize?: number;
    /** Extra px between icon and title in the compact row. */
    compactIconGap?: number;
}

const DEFAULT_STYLE: StateSensorStyle = { compactTitle: { color: SECONDARY } };

export function buildStateSensorGrid(
    layout: WidgetLayout,
    o: Opts,
    style: StateSensorStyle = DEFAULT_STYLE,
): CustomGridDef | null {
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const showLabel = o.showLabel !== false;
    const label = (extra: Partial<CustomCell>): CustomCell => ({ type: 'value', color: STATE_COLOR, ...extra });

    switch (layout) {
        case 'default': {
            // Title row on top, label at the bottom.
            const b = new GridBuilder(showIcon ? [iconCol(o, style.iconSize), '1fr'] : ['1fr']);
            if (showTitle || showIcon) {
                b.row('auto', [...(showIcon ? [iconCell()] : []), showTitle ? titleCell(o) : null]);
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
            ]);
            addStatusBadges(b, o);
            return b.build();
        }
        case 'card':
        case 'minimal': {
            // Centred stack. Card: icon, title (bold), small label. Minimal: icon, big
            // label, small title. The standard layouts centre the shrink-wrapped title in
            // the stack, so titleAlign has no visible effect there — always centre.
            const card = layout === 'card';
            const b = new GridBuilder(1);
            b.row('1fr', []);
            if (showIcon) b.row('auto', [iconCell({ align: 'center', ...(card ? { color: CARD.icon } : null) })]);
            const titleRow = () => {
                if (showTitle)
                    b.row('auto', [
                        card
                            ? titleCell(o, { fontSize: FS.sm, bold: true, color: CARD.title, align: 'center' })
                            : titleCell(o, { align: 'center' }),
                    ]);
            };
            if (card) {
                titleRow();
                if (showLabel)
                    b.row('auto', [label({ fontSize: FS.xs, color: CARD.label, align: 'center', valign: 'middle' })]);
            } else {
                if (showLabel)
                    b.row('auto', [label({ fontSize: FS.xl, bold: true, align: 'center', valign: 'middle' })]);
                titleRow();
            }
            b.row('1fr', []);
            addStatusBadges(b, o);
            return card ? { ...b.build(), bg: CARD.bg, borderColor: CARD.border } : b.build();
        }
        case 'compact': {
            // One line: [icon] [title, greedy] [label as a tinted pill]
            const iconTrack = iconCol(o, style.iconSize, style.compactIconGap);
            const b = new GridBuilder([...(showIcon ? [iconTrack] : []), '1fr', 'auto']);
            b.row('1fr', [
                ...(showIcon ? [iconCell()] : []),
                showTitle
                    ? titleCell(o, { fontSize: FS.sm, color: style.compactTitle.color, bold: style.compactTitle.bold })
                    : null,
                showLabel
                    ? label({
                          fontSize: FS.xs,
                          bold: true,
                          align: 'right',
                          valign: 'middle',
                          bg: 'color-mix(in srgb, var(--aura-state-color, var(--accent)) 13%, transparent)',
                          bgMode: 'content',
                      })
                    : null,
            ]);
            addStatusBadges(b, o);
            return b.build();
        }
        default:
            return null;
    }
}
