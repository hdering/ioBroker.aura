import type { CustomCell, CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import { buildCircleMenuGrid } from './circle';
import {
    FS,
    STATE_COLOR,
    addStatusBadges,
    iconCell,
    iconCol,
    showIconOf,
    showTitleOf,
    titleCell,
    type Opts,
} from './common';

// Thermostat: default, compact, minimal, dial. The setpoint is the custom grid's
// 'value' cell (°C as suffix), the reading the component 'actual-line' ("Ist: 20,5°C")
// and the fields 'actualLine' ("Ist 20,5°C") / 'actualSlash' ("/ 20,5°C"). 'dial' is the whole round scale of the dial layout,
// 'presets' the quick-select row.

const ACTUAL_COLOR = 'var(--aura-actual-color, var(--text-secondary))';

export function buildThermostatGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const showTitle = showTitleOf(o);
    const showIcon = showIconOf(o);
    const showSetpoint = o.showSetpoint !== false;
    const showActual = o.showActualTemp !== false;
    const showControls = o.showControls !== false;
    const presets = (o.presets as number[] | undefined) ?? [18, 20, 22, 24];
    const showPresets = o.showPresets !== false && presets.length > 0;
    const setpoint = (extra: Partial<CustomCell>): CustomCell => ({
        type: 'value',
        suffix: '°C',
        fontSize: FS.xl,
        bold: true,
        color: STATE_COLOR,
        ...extra,
    });
    const btn = (
        key: 'btn-plus' | 'btn-minus' | 'btn-plus-round' | 'btn-minus-round',
        extra: Partial<CustomCell> = {},
    ): CustomCell => ({
        type: 'component',
        componentKey: key,
        align: 'center',
        valign: 'middle',
        allowOverflow: true,
        ...extra,
    });
    const presetRow = (b: GridBuilder, align: CustomCell['align']) => {
        if (showPresets)
            b.row('auto', [
                { type: 'component', componentKey: 'presets', align, valign: 'middle', colSpan: b.colCount },
            ]);
    };

    switch (layout) {
        case 'default': {
            // [icon] [title, greedy] [heating/cooling symbol]
            // [setpoint ……………………………] [+]
            // [Ist: reading ………………] [−]
            // [presets ……………………………………]
            const b = new GridBuilder(showIcon ? [iconCol(o), '1fr', 'auto'] : ['1fr', 'auto']);
            const textSpan = showIcon ? 2 : 1;
            if (showTitle || showIcon) {
                b.row('auto', [
                    ...(showIcon ? [iconCell()] : []),
                    showTitle ? titleCell(o) : null,
                    {
                        type: 'component',
                        componentKey: 'status-icon',
                        align: 'right',
                        valign: 'middle',
                        allowOverflow: true,
                    },
                ]);
            }
            b.row('1fr', [
                showSetpoint ? setpoint({ align: 'left', valign: 'bottom', colSpan: textSpan }) : null,
                showControls ? btn('btn-plus', { valign: 'bottom', fontSize: 32 }) : null,
            ]);
            b.row('1fr', [
                showActual
                    ? {
                          type: 'component',
                          componentKey: 'actual-line',
                          align: 'left',
                          valign: 'top',
                          colSpan: textSpan,
                      }
                    : null,
                showControls ? btn('btn-minus', { valign: 'top', fontSize: 32 }) : null,
            ]);
            presetRow(b, 'left');
            addStatusBadges(b, o);
            return b.build();
        }
        case 'compact': {
            // One line: [icon] [title, greedy] [setpoint] [/ reading] [−] [+]
            const b = new GridBuilder([...(showIcon ? [iconCol(o)] : []), '1fr', 'auto', 'auto', 'auto', 'auto']);
            b.row('1fr', [
                ...(showIcon ? [iconCell()] : []),
                showTitle ? titleCell(o, { fontSize: FS.sm }) : null,
                showSetpoint ? setpoint({ align: 'right', valign: 'middle' }) : null,
                showSetpoint && showActual
                    ? {
                          type: 'field',
                          fieldKey: 'actualSlash',
                          fontSize: FS.xs,
                          color: ACTUAL_COLOR,
                          align: 'left',
                          valign: 'middle',
                      }
                    : null,
                showControls ? btn('btn-minus', { fontSize: 24 }) : null,
                showControls ? btn('btn-plus', { fontSize: 24 }) : null,
            ]);
            addStatusBadges(b, o);
            return b.build();
        }
        // The circle layout (#815): the round button itself (#838).
        case 'circle':
            return buildCircleMenuGrid(o);
        case 'minimal': {
            // Centred stack: icon, setpoint, reading, [−] [+], presets
            const b = new GridBuilder(['1fr', '1fr']);
            b.row('1fr', []);
            if (showIcon) b.row('auto', [iconCell({ align: 'center', colSpan: 2 })]);
            if (showSetpoint) b.row('auto', [setpoint({ align: 'center', valign: 'middle', colSpan: 2 })]);
            if (showActual)
                b.row('auto', [
                    {
                        type: 'field',
                        fieldKey: 'actualLine',
                        fontSize: FS.xs,
                        color: ACTUAL_COLOR,
                        align: 'center',
                        valign: 'middle',
                        colSpan: 2,
                    },
                ]);
            if (showControls)
                b.row('auto', [
                    btn('btn-minus-round', { align: 'right', fontSize: 32 }),
                    btn('btn-plus-round', { align: 'left', fontSize: 32 }),
                ]);
            presetRow(b, 'center');
            b.row('1fr', []);
            addStatusBadges(b, o);
            return b.build();
        }
        case 'dial': {
            // The round scale fills the widget; presets (if any) below it.
            const b = new GridBuilder(1);
            b.row('1fr', [{ type: 'component', componentKey: 'dial', align: 'center', valign: 'middle' }]);
            presetRow(b, 'center');
            addStatusBadges(b, o);
            return b.build();
        }
        default:
            return null;
    }
}
