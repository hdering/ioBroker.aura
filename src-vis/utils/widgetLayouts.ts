import type { TranslationKey } from '../i18n/de';
import type { WidgetLayout } from '../types';

/**
 * Which layouts a widget type offers — the ONE list the editor's picker, the
 * popup type defaults and the generated AI schema all read.
 *
 * It used to be two lists: this file (read by the MCP schema generator) and a
 * nested ternary inside WidgetFrame's edit dialog (what the user actually sees).
 * They drifted, in both directions and unnoticed:
 *
 *   - The editor offered `framed` for the section title and `light-all` &
 *     friends for the light — neither was in the schema, so aura_validate
 *     refused to write a configuration the editor produces every day.
 *   - The schema offered `card` for the shutter, `minimal` for the switch,
 *     `compact` for the clock … none of which the widget reads. A model could
 *     write them, the write succeeded, and the dashboard looked unchanged.
 *
 * So: one map, checked against the widgets themselves. A value listed here must
 * be one the widget component (or WidgetFrame, for `framed`) actually branches
 * on; anything else is a style the user can pick and never gets.
 */
const LAYOUTS: Record<string, WidgetLayout[]> = {
    // Section title: `framed` is drawn by WidgetFrame (isBareHeader), the rest
    // by HeaderWidget. `card` is deliberately absent — it rendered exactly like
    // `default`.
    header: ['default', 'compact', 'minimal', 'framed'],
    universal: ['custom'],
    input: ['default', 'compact', 'custom'],
    knob: ['default', 'knob-scale', 'knob-endless', 'custom'],
    camera: ['minimal', 'default', 'custom'],
    fill: ['default', 'battery', 'bar', 'segments', 'wave'],
    trashSchedule: ['default', 'list', 'compact'],
    statusoverview: ['default', 'compact', 'card', 'minimal', 'count'],
    messages: ['default', 'count'],
    chart: ['default', 'card'],
    // Both draw their own canvas — `card`/`compact`/`minimal` were never read.
    echart: ['default', 'custom'],
    image: ['default', 'custom'],
    mediaplayer: ['default', 'compact', 'custom'],
    httpRequest: ['default', 'compact', 'minimal', 'custom'],
    button: ['default', 'compact', 'minimal', 'custom'],
    slider: ['default', 'custom'],
    thermostat: ['default', 'compact', 'minimal', 'dial', 'custom'],
    enum: ['default', 'compact', 'minimal', 'card', 'custom'],
    evcc: ['default', 'compact', 'flow', 'battery', 'production', 'consumption', 'loadpoints', 'custom'],
    light: ['light-all', 'light-brightness', 'light-color', 'light-temperature', 'custom'],
    switch: ['default', 'card', 'compact', 'custom'],
    dimmer: ['default', 'compact', 'minimal', 'custom'],
    shutter: ['default', 'compact', 'minimal', 'custom'],
    clock: ['default', 'card', 'minimal', 'custom'],
    weather: ['default', 'compact', 'minimal', 'custom'],
    timer: ['default', 'compact', 'custom'],
    countdown: ['default', 'compact', 'custom'],
    // One layout, no choice: the widget ignores `layout` entirely.
    gauge: ['default'],
    climate: ['default'],
    aircontrol: ['default'],
    echartsPreset: ['default'],
    chips: ['default'],
    group: ['default'],
    carousel: ['default'],
    panels: ['default'],
    trash: ['default'],
    adapterstatus: ['default'],
    scriptstatus: ['default'],
    adapterlogs: ['default'],
    loadtimes: ['default'],
    alarm: ['default'],
    map: ['default'],
    energiebilanz: ['default'],
    iframe: ['default'],
    jsontable: ['default'],
    html: ['default'],
    mirror: ['default'],
    menu: ['default'],
};

/** Types whose base list ends without a "Custom" entry. */
const NO_CUSTOM = new Set(['list', 'autolist', 'datepicker']);

export function getAvailableLayouts(widgetType: string): WidgetLayout[] {
    const own = LAYOUTS[widgetType];
    if (own) {
        return own;
    }
    const base: WidgetLayout[] = ['default', 'card', 'compact', 'minimal'];
    if (widgetType === 'calendar') base.push('agenda');
    if (widgetType === 'autolist') base.push('count');
    if (!NO_CUSTOM.has(widgetType)) base.push('custom');
    return base;
}

/** Layouts whose label comes from the translation table. */
const LABEL_KEYS = {
    default: 'wf.edit.layout.standard',
    card: 'wf.edit.layout.card',
    compact: 'wf.edit.layout.compact',
    minimal: 'wf.edit.layout.minimal',
    agenda: 'wf.edit.layout.agenda',
    dial: 'wf.edit.layout.dial',
} as const;

/** Layouts that are named the same in every language. */
const LABEL_TEXT: Partial<Record<WidgetLayout, string>> = {
    custom: 'Custom',
    count: 'Anzahl',
    list: 'Liste',
    flow: 'Nur Fluss',
    battery: 'Nur Batterie',
    production: 'Nur Produktion',
    consumption: 'Nur Verbrauch',
    loadpoints: 'Nur Ladepunkte',
    'knob-scale': 'Skala',
    'knob-endless': 'Endlos (3D)',
    'light-all': 'Standard',
    'light-brightness': 'Nur Helligkeit',
    'light-color': 'Nur Farbe',
    'light-temperature': 'Nur Lichtwärme',
    segments: 'LED-Segmente',
    wave: 'Welle',
};

/** The same layout means something else per widget, so the label does too. */
const LABEL_PER_TYPE: Record<string, Partial<Record<WidgetLayout, string>>> = {
    camera: { custom: 'Custom Grid' },
    fill: { default: 'Tank', battery: 'Batterie', bar: 'Balken' },
    knob: { default: 'Bogen' },
    trashSchedule: { compact: 'Kompakt' },
};

const HEADER_LABEL_KEYS = {
    default: 'wf.edit.header.default',
    compact: 'wf.edit.header.compact',
    minimal: 'wf.edit.header.minimal',
    framed: 'wf.edit.header.framed',
} as const;

export type LayoutOption = { value: WidgetLayout; label: string };

/**
 * The picker entries for a widget type: the layouts from `getAvailableLayouts`
 * with the label the editor shows for each.
 *
 * `t` is passed in rather than imported so this module stays free of the store —
 * the schema generator bundles it on its own (tools/schema/gen-widget-schema.mjs).
 */
export function getLayoutOptions(
    widgetType: string,
    t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): LayoutOption[] {
    const perType = LABEL_PER_TYPE[widgetType] ?? {};
    return getAvailableLayouts(widgetType).map((value) => ({
        value,
        label:
            perType[value] ??
            (widgetType === 'header' && value in HEADER_LABEL_KEYS
                ? t(HEADER_LABEL_KEYS[value as keyof typeof HEADER_LABEL_KEYS])
                : undefined) ??
            LABEL_TEXT[value] ??
            (value in LABEL_KEYS ? t(LABEL_KEYS[value as keyof typeof LABEL_KEYS]) : value),
    }));
}

/**
 * What the widget renders when `layout` is not set.
 *
 * The FIRST entry of the list, not the literal `default`: the camera falls back
 * to `minimal`, the light to `light-all`, the universal widget to `custom`. The
 * picker used to mark "Standard" as active on all three while the widget drew
 * something else.
 */
export function defaultLayoutFor(widgetType: string): WidgetLayout {
    return getAvailableLayouts(widgetType)[0] ?? 'default';
}

/**
 * Is this a layout the type does not know?
 *
 * A stored layout nobody reads falls back to the default rendering without a
 * word — the user picks a style, gets none, and blames whatever else they
 * touched. The editor says so instead of staying quiet.
 */
export function isUnknownLayout(widgetType: string, layout: string | undefined): boolean {
    return !!layout && !getAvailableLayouts(widgetType).includes(layout as WidgetLayout);
}
