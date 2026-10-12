import type { CustomCell, CustomGridDef, WidgetLayout } from '../../types';
import { GridBuilder } from './gridBuilder';
import type { Opts } from './common';

// Weather: default (= card), compact, minimal. The standard layouts scale their
// fonts with the widget size, which fixed-size text cells cannot follow — the
// widget therefore offers its layout pieces as components drawn with the same
// scale ('title-row', 'current', 'current-line', 'current-big', 'forecast',
// 'warnings'), and the presets stack those.

const piece = (componentKey: string, extra: Partial<CustomCell> = {}): CustomCell => ({
    type: 'component',
    componentKey,
    align: 'left',
    valign: 'top',
    ...extra,
});

export function buildWeatherGrid(layout: WidgetLayout, o: Opts): CustomGridDef | null {
    const showTitle = o.showTitle !== false;
    const showIcon = o.showIcon !== false;
    const showForecast = (o.showForecast as boolean) ?? true;
    const showWarnings = (o.showWarnings as boolean) ?? false;
    switch (layout) {
        case 'default':
        case 'card': {
            // Title row, current conditions, forecast, warnings — stacked from the top.
            const b = new GridBuilder(1);
            if (showTitle || showIcon) b.row('auto', [piece('title-row')]);
            b.row('auto', [piece('current')]);
            if (showForecast) b.row('auto', [piece('forecast')]);
            if (showWarnings) b.row('1fr', [piece('warnings')]);
            return b.build();
        }
        case 'compact': {
            const b = new GridBuilder(1);
            b.row('1fr', [piece('current-line', { valign: 'middle' })]);
            return b.build();
        }
        case 'minimal': {
            // Emoji above the temperature, centred; warnings below when switched on.
            const b = new GridBuilder(1);
            b.row('1fr', [piece('current-big', { align: 'center', valign: 'middle' })]);
            if (showWarnings) b.row('auto', [piece('warnings')]);
            return b.build();
        }
        default:
            return null;
    }
}
