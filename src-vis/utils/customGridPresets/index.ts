import type { CustomGridDef, WidgetLayout } from '../../types';
import { PRIMARY, SECONDARY, type Opts } from './common';
import { buildValueGrid } from './value';
import { buildStateSensorGrid } from './stateSensor';
import { buildSwitchGrid } from './switch';
import { buildThermostatGrid } from './thermostat';
import { buildWeatherGrid } from './weather';
import { buildKnobGrid, knobOptionPatch } from './knob';
import { buildDimmerGrid } from './dimmer';
import { buildShutterGrid } from './shutter';
import { buildSliderGrid } from './slider';
import { buildEnumGrid } from './enum';
import { buildButtonGrid } from './button';
import { buildHttpRequestGrid } from './httpRequest';
import { buildInputGrid } from './input';
import { buildClockGrid } from './clock';
import { buildTimerGrid } from './timer';
import { buildCountdownGrid } from './countdown';
import { buildMediaplayerGrid } from './mediaplayer';
import { buildLightGrid } from './light';
import { buildCalendarGrid } from './calendar';
import { buildEvccGrid } from './evcc';

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
    knob: buildKnobGrid,
    dimmer: buildDimmerGrid,
    shutter: buildShutterGrid,
    slider: buildSliderGrid,
    enum: buildEnumGrid,
    button: buildButtonGrid,
    httpRequest: buildHttpRequestGrid,
    input: buildInputGrid,
    clock: buildClockGrid,
    timer: buildTimerGrid,
    countdown: buildCountdownGrid,
    mediaplayer: buildMediaplayerGrid,
    light: buildLightGrid,
    calendar: buildCalendarGrid,
    evcc: buildEvccGrid,
};

/**
 * Options a preset needs besides the grid — e.g. which dial the knob's custom
 * layout draws. Written together with the grid.
 */
const OPTION_PATCHES: Record<string, (layout: WidgetLayout, opts: Opts) => Opts | null> = {
    knob: knobOptionPatch,
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

/** Options besides `customGrid` the preset of `fromLayout` sets, or null. */
export function customGridOptionPatch(cfg: PresetSource, fromLayout: WidgetLayout): Opts | null {
    if (fromLayout === 'custom') return null;
    return OPTION_PATCHES[cfg.type]?.(fromLayout, cfg.options ?? {}) ?? null;
}

/**
 * The widget's options after starting the custom layout from `fromLayout`: the
 * preset grid plus whatever else the preset needs. No preset (or '__blank') =
 * no grid, the custom layout falls back to its default grid.
 */
export function customOptionsFromLayout(cfg: PresetSource, fromLayout: WidgetLayout | '__blank'): Opts {
    const o = cfg.options ?? {};
    if (fromLayout === '__blank') return { ...o, customGrid: undefined };
    const grid = buildCustomGridFromLayout(cfg, fromLayout) ?? undefined;
    return { ...o, ...(grid ? customGridOptionPatch(cfg, fromLayout) : null), customGrid: grid };
}

/** Does `fromLayout` of this widget type have a preset? */
export function hasCustomGridPreset(type: string, fromLayout: WidgetLayout): boolean {
    return buildCustomGridFromLayout({ type, options: {} }, fromLayout) !== null;
}
