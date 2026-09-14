import type { WidgetConfig, WidgetLayout, WidgetType } from '../types';
import { isDpOptionKey } from './dpOptionKeys';

// ─────────────────────────────────────────────────────────────────────────────
// "Stil kopieren / Stil einfügen" (issue #654).
//
// A widget's `options` is one flat bag that mixes wiring (datapoints, ids, URLs,
// value mappings) with looks (colours, sizes, alignments, visibility toggles) —
// 749 distinct keys across 55 widget types, with no category anywhere. Copying
// the whole bag would clone the source's content; a hand-kept list of "style"
// keys would rot the moment someone adds an option and forgets the third place
// to register it.
//
// So the split runs on the naming conventions the codebase already follows, and
// it errs on the side of copying too little: a missed option costs the user one
// more click, whereas a wrongly copied one silently repoints a widget at the
// wrong datapoint, URL or value mapping.
//
// A style is only ever pasted onto a widget of the SAME type (the issue asks for
// exactly that), so type-specific keys like `dialThickness` need no guard.
// ─────────────────────────────────────────────────────────────────────────────

/** Snapshot taken by "Stil kopieren"; lives in `store/styleClipboardStore`. */
export interface WidgetStyle {
    /** Source widget type — the style may only be pasted onto this same type. */
    type: WidgetType;
    /** Title of the source widget, for the menu label ("Stil von … einfügen"). */
    sourceLabel: string;
    /** Presentation variant (default / card / compact / …); undefined = default. */
    layout?: WidgetLayout;
    /** The style-carrying options, already filtered by `isStyleOptionKey`. */
    options: Record<string, unknown>;
}

/**
 * Suffixes that mark a value as pure presentation. Checked against the key's
 * tail, so `valueFontSize`, `rowPopupWidth` and `zone1Color` all qualify without
 * anyone registering them.
 */
const STYLE_SUFFIXES = [
    'Color',
    'Bg',
    'Background',
    'Size',
    'Scale',
    'Style',
    'Align',
    'Width',
    'Height',
    'Position',
    'Placement',
    'Corner',
    'Radius',
    'Gap',
    'Thickness',
    'Angle',
    'Padding',
    'Opacity',
    'Side',
    'Direction',
    // State decorations (`trueIcon`, `humidityIcon`, `entryIcon`) — the widget's
    // own `icon` is held back by NEVER_STYLE_KEYS below.
    'Icon',
];

/**
 * Presentation options whose names follow no pattern. Short on purpose — every
 * entry is a judgement call that has to stay defensible, and a forgotten one
 * only means the user re-sets it by hand.
 */
const EXTRA_STYLE_KEYS = new Set([
    // Frame
    'transparent',
    'transparency',
    'styleOverride',
    'colorThresholds',
    // Density / flow
    'compact',
    'compactMode',
    'striped',
    'multiline',
    'wrapText',
    'wrapCols',
    'scrollable',
    'autoShrink',
    'detailed',
    'gap',
    'gridCols',
    'orientation',
    'variant',
    'valign',
    'align',
    // Colours that read the other way round
    'color',
    'colorOn',
    'colorOff',
    // Number / date rendering of a value the widget already has
    'decimals',
    'numberFormat',
    'dateFormat',
    'dateLength',
    'timeOnly',
    'customFormat',
    'valueTimeFormat',
    'valueTimePattern',
    'legendFormat',
]);

/**
 * Keys a pattern would grab although they carry wiring, not looks:
 *
 * - `icon` / `baseIcon` name *what* the widget stands for and belong with the
 *   title, which is never copied either. Fixed-meaning decorations (`trueIcon`,
 *   `humidityIcon`, `entryIcon` …) stay in, they say *how* a state is drawn.
 * - `binSize` / `listBinSize` are the history bucket, i.e. how much data is
 *   fetched; `bufferSize` is the stream buffer.
 * - `invertPosition` flips a shutter datapoint's 0/100 reading — device wiring
 *   that happens to end in "Position".
 */
const NEVER_STYLE_KEYS = new Set(['icon', 'baseIcon', 'binSize', 'listBinSize', 'bufferSize', 'invertPosition']);

/** True when this option key holds presentation rather than content or wiring. */
export function isStyleOptionKey(key: string): boolean {
    if (NEVER_STYLE_KEYS.has(key)) return false;
    // Datapoints and object references are never style, whatever they are called.
    if (isDpOptionKey(key) || /Ids?$/.test(key)) return false;
    // `showTitle`, `echartShowLegend`, `hideScrollbar`, `subDpTemplateHideMissing` …
    if (/show|hide/i.test(key)) return true;
    if (STYLE_SUFFIXES.some((s) => key.endsWith(s))) return true;
    return EXTRA_STYLE_KEYS.has(key);
}

function cloneValue<T>(v: T): T {
    if (v === null || typeof v !== 'object') return v;
    return JSON.parse(JSON.stringify(v)) as T;
}

/** Everything "Stil kopieren" puts on the clipboard. */
export function extractWidgetStyle(config: WidgetConfig): WidgetStyle {
    const options: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config.options ?? {})) {
        if (value === undefined) continue;
        if (!isStyleOptionKey(key)) continue;
        options[key] = cloneValue(value);
    }
    return {
        type: config.type,
        sourceLabel: config.title?.trim() || config.type,
        layout: config.layout,
        options,
    };
}

/** A style fits a widget of the same type only. */
export function canApplyWidgetStyle(config: WidgetConfig, style: WidgetStyle | null): style is WidgetStyle {
    return !!style && style.type === config.type;
}

/**
 * Replace — not merge — the target's presentation with the stored one: style
 * options the source does not have are dropped, so the two widgets really end up
 * looking alike instead of the target keeping a stray colour of its own.
 * Everything outside `isStyleOptionKey` (datapoints, entries, conditions,
 * badges, the custom grid, the title) is left untouched.
 */
export function applyWidgetStyle(config: WidgetConfig, style: WidgetStyle): WidgetConfig {
    const options: Record<string, unknown> = { ...(config.options ?? {}) };
    for (const key of Object.keys(options)) {
        if (isStyleOptionKey(key)) delete options[key];
    }
    for (const [key, value] of Object.entries(style.options)) {
        options[key] = cloneValue(value);
    }
    const next: WidgetConfig = { ...config, options };
    if (style.layout === undefined) delete next.layout;
    else next.layout = style.layout;
    return next;
}

/** How many settings a paste would actually change — shown as feedback, since the editor has no undo. */
export function countStyleChanges(config: WidgetConfig, style: WidgetStyle): number {
    const before = config.options ?? {};
    const after = applyWidgetStyle(config, style).options ?? {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    let changed = 0;
    for (const key of keys) {
        if (!isStyleOptionKey(key)) continue;
        if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) changed++;
    }
    if ((config.layout ?? null) !== (style.layout ?? null)) changed++;
    return changed;
}
