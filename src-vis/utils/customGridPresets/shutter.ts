import type { CustomCell, CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import {
    FS,
    SECONDARY,
    addStatusBadges,
    comp,
    field,
    gapRow,
    hasStatusBadges,
    iconCell,
    iconCol,
    showIconOf,
    showTitleOf,
    titleCell,
    titleRowSize,
    type Opts,
} from './common';

// Shutter (ShutterWidget): default, compact, minimal. Position and status text are
// the fields 'position' / 'status', 'movingArrow' the ▲/▼ while driving. 'viz' is
// the blind graphic with its slat column, 'btn-col' / 'btn-row' the up/stop/down
// buttons as the default and compact layouts stack them, 'btn-*-min' the minimal
// layout's buttons, 'tilt-aside' / 'tilt-aside-flat' / 'tilt-row' the slat controls.

const MOVING = 'var(--aura-moving-color, var(--text-secondary))';
const LIVE_VALUE = 'var(--aura-threshold-color, var(--aura-moving-color, var(--text-primary)))';
const VALUE = 'var(--aura-value-color, var(--text-primary))';

/** Slat control configured (a tilt DP and not switched off)? */
function tiltOf(o: Opts) {
    const active = !!o.tiltDp && o.tiltPlacement !== 'off';
    const placement = (o.tiltPlacement as string | undefined) ?? 'inline';
    const control = (o.tiltControl as string | undefined) ?? 'slider-v';
    return {
        active,
        // Default layout: buttons / popover button next to the slider, horizontal slider below it.
        bottom: active && (placement === 'popup' || (placement === 'inline' && control === 'buttons')),
        row: active && placement === 'inline' && control === 'slider-h',
    };
}

export function buildShutterGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const showValue = o.showValue !== false;
    const showControls = o.showControls !== false;
    const showSlider = o.showSlider !== false;
    const valueSize = Number(o.valueSize) || FS.xl;
    const hasPresets = Array.isArray(o.positionPresets) && o.positionPresets.length > 0;
    const tilt = tiltOf(o);
    const position = (extra: Partial<CustomCell>): CustomCell =>
        field('position', { fontSize: valueSize, bold: true, color: VALUE, ...extra });

    switch (layout) {
        case 'default': {
            // [icon] [title ……………………………………] [▲]
            // [graphic ……………………………………………] [▲]
            // [status ……………………………… 42%]   [■]
            // [slider ……………………………………………] [▼]
            // [presets ……………………………………………]
            // The default layout shows an icon only when one is configured.
            const withIcon = showIcon && !!o.icon;
            const b = new GridBuilder([...(withIcon ? [iconCol(o)] : []), '1fr', 'auto', 'auto']);
            const textCols = b.colCount - 1;
            if (showTitle || withIcon)
                b.row(titleRowSize(withIcon ? o : { showIcon: false }), [
                    ...(withIcon ? [iconCell()] : []),
                    showTitle ? titleCell(o, { colSpan: 2 }) : null,
                    field('movingArrow', { fontSize: 10, color: 'var(--accent-yellow)', align: 'right' }),
                ]);
            // gap-2 under the title row (the 16px title line has no padding of its own to count)
            if (showTitle || withIcon) b.row('2px', []);
            const first = b.rowCount;
            b.row('1fr', [comp('viz', { colSpan: textCols })]);
            if (showValue || showSlider || tilt.bottom || tilt.row || hasPresets) {
                gapRow(b, 8);
                if (showValue)
                    b.row('auto', [
                        field('status', {
                            fontSize: 11,
                            color: MOVING,
                            align: 'left',
                            valign: 'bottom',
                            colSpan: textCols - 1,
                        }),
                        position({ align: 'right', valign: 'bottom' }),
                    ]);
                // The layout's slider row is a line box, a little taller than the slider.
                if (showSlider || tilt.bottom)
                    b.row(tilt.bottom ? 'auto' : '21px', [
                        showSlider
                            ? comp('slider', { allowOverflow: true, colSpan: tilt.bottom ? textCols - 1 : textCols })
                            : null,
                        tilt.bottom ? comp('tilt-aside', { align: 'right', allowOverflow: true }) : null,
                    ]);
                if (tilt.row) b.row('auto', [comp('tilt-row', { allowOverflow: true, colSpan: textCols })]);
                if (hasPresets) {
                    gapRow(b, 8);
                    b.row('auto', [comp('presets', { align: 'left', colSpan: textCols })]);
                }
            }
            if (showControls) {
                // The button column runs from the graphic down; the badges keep the bottom-right slot.
                const span = b.rowCount - first - (hasStatusBadges(o) ? 1 : 0);
                b.put(first, b.colCount - 1, comp('btn-col', { valign: 'top', rowSpan: Math.max(1, span) }));
            }
            addStatusBadges(b, o);
            return b.build();
        }
        case 'compact': {
            // One line: [icon] [title, greedy] [42%] [slats %] [▲ ■ ▼]
            const showTiltValue = tilt.active && o.showTiltValue === true;
            const b = new GridBuilder([...(showIcon ? [iconCol(o)] : []), '1fr', 'auto', 'auto', 'auto']);
            b.row('1fr', [
                ...(showIcon ? [iconCell()] : []),
                showTitle ? titleCell(o, { fontSize: FS.sm }) : null,
                showValue ? position({ align: 'right', color: LIVE_VALUE }) : null,
                showTiltValue
                    ? field('tilt', {
                          fontSize: Math.max(9, Math.round(valueSize * 0.6)),
                          color: SECONDARY,
                          align: 'right',
                      })
                    : null,
                showControls
                    ? comp('btn-row', { align: 'right', allowOverflow: true })
                    : tilt.active
                      ? comp('tilt-aside-flat', { align: 'right', allowOverflow: true })
                      : null,
            ]);
            addStatusBadges(b, o);
            return b.build();
        }
        case 'minimal': {
            // Centred stack (gap-1.5): ▲, 42%, ■, ▼, slat control
            const b = new GridBuilder(1);
            b.row('1fr', []);
            if (showControls) b.row('auto', [comp('btn-up-min')]);
            if (showValue) {
                // A row as tall as the number (leading-none), the text may reach out of it.
                b.row(`${valueSize}px`, [position({ align: 'center', valign: 'middle', allowOverflow: true })]);
                b.row('auto', [field('movingArrow', { fontSize: 10, color: 'var(--accent-yellow)', align: 'center' })]);
            }
            if (showControls) {
                b.row('auto', [comp('btn-stop-min')]);
                b.row('auto', [comp('btn-down-min')]);
            }
            if (tilt.active) b.row('auto', [comp('tilt-aside-flat')]);
            b.row('1fr', []);
            addStatusBadges(b, o);
            return b.build();
        }
        default:
            return null;
    }
}
