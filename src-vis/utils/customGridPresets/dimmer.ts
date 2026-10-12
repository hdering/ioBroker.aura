import type { CustomCell, CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import {
    FS,
    THRESHOLD_OR_STATE,
    VALUE_COLOR,
    addStatusBadges,
    comp,
    field,
    gapRow,
    iconCell,
    iconCol,
    showIconOf,
    showTitleOf,
    titleCell,
    titleRowSize,
    type Opts,
} from './common';

// Dimmer (DimmerWidget): default, compact, minimal. The level is the field 'level'
// ("42%"), 'control' the on/off control in the configured mode (toggle, icon,
// checkbox), 'state-dot' the lamp dot the default layout shows without one, and
// 'level-slider' / 'level-slider-sm' the slider (or the bar) as the layouts draw it.

export function buildDimmerGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const showValue = o.showValue !== false;
    const showSlider = o.showSlider !== false;
    const showToggle = o.showToggle !== false;
    const level = (extra: Partial<CustomCell>): CustomCell =>
        field('level', { fontSize: FS.xl, bold: true, color: VALUE_COLOR, ...extra });
    const control = (extra: Partial<CustomCell> = {}): CustomCell => comp('control', { allowOverflow: true, ...extra });
    // The thumb is taller than the track — let it reach out of the cell. The bar
    // look is 40px tall but, like the layouts' flex item, gives way in a low widget.
    const bar = !!o.barStyle;
    const slider = (key: string, extra: Partial<CustomCell> = {}): CustomCell =>
        comp(key, bar ? extra : { allowOverflow: true, ...extra });
    const sliderRow = bar ? 'minmax(0, 44px)' : 'auto';

    switch (layout) {
        case 'default': {
            // Title row on top; level + control, then the slider at the bottom.
            const b = new GridBuilder(showIcon ? [iconCol(o), '1fr', 'auto'] : ['1fr', 'auto']);
            const textSpan = showIcon ? 2 : 1;
            if (showTitle || showIcon)
                b.row(titleRowSize(o), [
                    ...(showIcon ? [iconCell()] : []),
                    showTitle ? titleCell(o, { colSpan: 2 }) : null,
                ]);
            b.row('1fr', []);
            if (showValue)
                b.row('auto', [
                    level({ align: 'left', colSpan: textSpan }),
                    showToggle ? control({ align: 'right' }) : comp('state-dot', { align: 'right' }),
                ]);
            else if (showToggle) b.row('auto', [control({ align: 'right', colSpan: b.colCount })]);
            if (showSlider) {
                // space-y-2, and the native slider sits in a line box a little taller than itself.
                if (showValue || showToggle) b.row('2px', []);
                b.row(sliderRow, [slider('level-slider', { colSpan: b.colCount })]);
            }
            addStatusBadges(b, o);
            return b.build();
        }
        case 'compact': {
            // [icon] [title, greedy] [level] [control]
            //        [slider ……………………………………………]
            const b = new GridBuilder([...(showIcon ? [iconCol(o)] : []), '1fr', 'auto', 'auto']);
            b.row('1fr', []);
            b.row('auto', [
                ...(showIcon ? [iconCell()] : []),
                showTitle ? titleCell(o, { fontSize: FS.sm }) : null,
                showValue ? level({ align: 'right' }) : null,
                showToggle ? control({ align: 'right' }) : null,
            ]);
            if (showSlider) {
                // The bar runs the full width, the thin slider starts under the title (ml-6).
                if (bar) b.row(sliderRow, [slider('level-slider-sm', { colSpan: b.colCount })]);
                else
                    b.row('auto', [
                        ...(showIcon ? [null] : []),
                        slider('level-slider-sm', { colSpan: b.colCount - (showIcon ? 1 : 0) }),
                    ]);
            }
            b.row('1fr', []);
            addStatusBadges(b, o);
            return b.build();
        }
        case 'minimal': {
            // Centred stack (gap-3): level, slider, control
            const b = new GridBuilder(1);
            b.row('1fr', []);
            const parts: CustomCell[] = [];
            if (showValue) parts.push(level({ align: 'center', color: THRESHOLD_OR_STATE }));
            if (showSlider) parts.push(slider('level-slider'));
            if (showToggle) parts.push(control());
            parts.forEach((cell, i) => {
                if (i > 0) gapRow(b, 12);
                b.row(cell.componentKey === 'level-slider' ? sliderRow : 'auto', [cell]);
            });
            b.row('1fr', []);
            addStatusBadges(b, o);
            return b.build();
        }
        default:
            return null;
    }
}
