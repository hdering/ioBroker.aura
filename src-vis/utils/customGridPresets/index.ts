import type { CustomGridDef, WidgetLayout } from '../../types';
import { PRIMARY, SECONDARY, type Opts } from './common';
import { buildValueGrid } from './value';
import { buildStateSensorGrid } from './stateSensor';
import { buildSwitchGrid } from './switch';
import { buildThermostatGrid } from './thermostat';
import { buildWeatherGrid } from './weather';

/**
 * Custom grids that rebuild a widget's fixed layouts (#768).
 *
 * Switching a widget to "Custom" used to start from the generic title/value/unit
 * grid, so whoever wanted the familiar look plus one more row had to rebuild the
 * whole layout by hand. A preset turns the layout the widget had into a custom
 * grid from the same options (visible fields, sizes, alignment) — cells refer to
 * the widget's own fields and components, so the result stays live.
 *
 * Pure functions on purpose: the editor imports them without pulling in widget
 * modules, and tests run them without React.
 */
type PresetBuilder = (layout: WidgetLayout, opts: Opts) => CustomGridDef | null;

const PRESETS: Record<string, PresetBuilder> = {
    value: buildValueGrid,
    binarysensor: (l, o) => buildStateSensorGrid(l, o),
    // The window contact's compact row: heavier title in the primary colour, 12px
    // between icon and title (gap-3) instead of 8.
    windowcontact: (l, o) =>
        buildStateSensorGrid(l, o, { compactTitle: { color: PRIMARY, bold: true }, compactIconGap: 6 }),
    stateimage: (l, o) => buildStateSensorGrid(l, o, { compactTitle: { color: SECONDARY }, iconSize: 48 }),
    switch: buildSwitchGrid,
    thermostat: buildThermostatGrid,
    weather: buildWeatherGrid,
};

/** Widget types (as stored in `config.type`) the registry knows, for tests. */
export const CUSTOM_GRID_PRESET_TYPES = Object.keys(PRESETS);

export interface PresetSource {
    type: string;
    options?: Opts;
}

/** A custom grid that rebuilds `fromLayout` of this widget, or null when there is no preset for it. */
export function buildCustomGridFromLayout(cfg: PresetSource, fromLayout: WidgetLayout): CustomGridDef | null {
    if (fromLayout === 'custom') return null;
    const builder = PRESETS[cfg.type];
    return builder ? builder(fromLayout, cfg.options ?? {}) : null;
}

/** Does `fromLayout` of this widget type have a preset? */
export function hasCustomGridPreset(type: string, fromLayout: WidgetLayout): boolean {
    return buildCustomGridFromLayout({ type, options: {} }, fromLayout) !== null;
}
