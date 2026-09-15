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
    /** Id of the source widget — its own menu keeps offering "Stil kopieren". */
    sourceId: string;
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
    // The on/off twin of `fullscreenPosition`, which the suffix list already catches
    'fullscreenWidget',
    // Density / flow
    'compact',
    'compactMode',
    'striped',
    'multiline',
    'wrapText',
    'wrapCols',
    'textLines',
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
        sourceId: config.id,
        layout: config.layout,
        options,
    };
}

/**
 * Which options every one of the 55 widget types understands, counted from the
 * shipped schema: `transparent`, `transparency`, `styleOverride` and the
 * fullscreen button are offered by all of them, the title/icon pair by all but a
 * handful. They are what a style may carry across a type boundary — anything
 * else would sit unread in the target's config, show up in its export and backup
 * and be reported as an unknown option by the MCP validator.
 *
 * `layout` never crosses: which variants exist is decided per type ("agenda"
 * only on the calendar), so a foreign one would simply be invalid.
 */
const FRAME_STYLE_KEYS = [
    'transparent',
    'transparency',
    'styleOverride',
    'fullscreenWidget',
    'fullscreenPosition',
    'showTitle',
    'showIcon',
    'iconSize',
];

/**
 * How much of a stored style a widget can take:
 *   'full'  — same type, everything including the layout variant
 *   'frame' — different type, the card look only (FRAME_STYLE_KEYS)
 *   'none'  — nothing copied yet
 */
export type StyleFit = 'full' | 'frame' | 'none';

export function styleFit(config: WidgetConfig, style: WidgetStyle | null): StyleFit {
    if (!style) return 'none';
    return style.type === config.type ? 'full' : 'frame';
}

/**
 * What the single style entry in the widget menu does right now (issue #654).
 *
 * One menu row, not two: with nothing copied it offers "Stil kopieren", and once
 * a style is on the clipboard every OTHER widget offers to paste it. The source
 * widget itself keeps offering "Stil kopieren", because pasting a widget's own
 * style onto itself changes nothing — and because that is where a re-copy after
 * a tweak belongs. To copy from a third widget while the clipboard is armed, the
 * entry carries a discard button.
 */
export type StyleMenuAction = 'copy' | 'paste' | 'pasteFrame';

export function styleMenuAction(config: WidgetConfig, style: WidgetStyle | null): StyleMenuAction {
    if (!style || style.sourceId === config.id) return 'copy';
    return styleFit(config, style) === 'frame' ? 'pasteFrame' : 'paste';
}

/** Keys a paste at this fit level is allowed to touch. */
function fitsKey(key: string, fit: StyleFit): boolean {
    if (!isStyleOptionKey(key)) return false;
    return fit === 'full' ? true : FRAME_STYLE_KEYS.includes(key);
}

/**
 * Replace — not merge — the target's presentation with the stored one: style
 * options the source does not have are dropped, so the two widgets really end up
 * looking alike instead of the target keeping a stray colour of its own.
 * Everything outside `isStyleOptionKey` (datapoints, entries, conditions,
 * badges, the custom grid, the title) is left untouched.
 */
export function applyWidgetStyle(config: WidgetConfig, style: WidgetStyle, fit: StyleFit = 'full'): WidgetConfig {
    if (fit === 'none') return config;
    const options: Record<string, unknown> = { ...(config.options ?? {}) };
    for (const key of Object.keys(options)) {
        if (fitsKey(key, fit)) delete options[key];
    }
    for (const [key, value] of Object.entries(style.options)) {
        if (fitsKey(key, fit)) options[key] = cloneValue(value);
    }
    const next: WidgetConfig = { ...config, options };
    // Across types the target keeps its own layout variant — see FRAME_STYLE_KEYS.
    if (fit === 'full') {
        if (style.layout === undefined) delete next.layout;
        else next.layout = style.layout;
    }
    return next;
}

/** How many settings a paste would actually change — shown as feedback, since the editor has no undo. */
export function countStyleChanges(config: WidgetConfig, style: WidgetStyle, fit: StyleFit = 'full'): number {
    if (fit === 'none') return 0;
    const before = config.options ?? {};
    const after = applyWidgetStyle(config, style, fit).options ?? {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    let changed = 0;
    for (const key of keys) {
        if (!fitsKey(key, fit)) continue;
        if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) changed++;
    }
    if (fit === 'full' && (config.layout ?? null) !== (style.layout ?? null)) changed++;
    return changed;
}
