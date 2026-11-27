import type { WidgetConfig } from '../types';
import type { DashboardLayout } from '../store/dashboardStore';

/** A tab-level widget anywhere in the dashboard (every layout/section/tab) — where a mirror's source lives. */
export function findDashboardWidget(layouts: DashboardLayout[], id: string): WidgetConfig | undefined {
    for (const l of layouts)
        for (const sec of l.sections)
            for (const tb of sec.tabs) {
                const found = tb.widgets.find((w) => w.id === id);
                if (found) return found;
            }
    return undefined;
}

/** True for a "Spiegel" that shows a whole tab (`sourceKind: 'tab'`). */
export function isTabMirror(w: WidgetConfig | undefined): boolean {
    return w?.type === 'mirror' && w.options?.sourceKind === 'tab';
}

/**
 * Id of the widget a "Spiegel" shows — undefined for every other type and for a
 * tab mirror, which may still carry a `targetWidgetId` from before the switch.
 */
export function mirrorTargetWidgetId(w: WidgetConfig | undefined): string | undefined {
    if (w?.type !== 'mirror' || isTabMirror(w)) return undefined;
    return (w.options?.targetWidgetId as string | undefined) || undefined;
}

/** A widget mirror with "Größe wie Quelle" (`sizeFromSource`): it always takes its source's w × h. */
export function mirrorFollowsSourceSize(w: WidgetConfig | undefined): boolean {
    return !!mirrorTargetWidgetId(w) && w?.options?.sizeFromSource === true;
}

// One derived object per (mirror, source size) — a fresh object on every render would
// defeat WidgetFrame's memo.
const sizedCache = new WeakMap<WidgetConfig, { w: number; h: number; out: WidgetConfig }>();

/**
 * The mirror as the grid places it: with `sizeFromSource` its own position and the
 * source's width/height, so resizing the original resizes the mirror too. Everything
 * else (and every other widget) comes back unchanged, same object.
 */
export function withSourceSize(w: WidgetConfig, byId: ReadonlyMap<string, WidgetConfig>): WidgetConfig {
    if (!mirrorFollowsSourceSize(w)) return w;
    const src = byId.get(mirrorTargetWidgetId(w) ?? '');
    if (!src || src.type === 'mirror') return w;
    const { w: sw, h: sh } = src.gridPos;
    if (w.gridPos.w === sw && w.gridPos.h === sh) return w;
    const hit = sizedCache.get(w);
    if (hit && hit.w === sw && hit.h === sh) return hit.out;
    const out = { ...w, gridPos: { ...w.gridPos, w: sw, h: sh } };
    sizedCache.set(w, { w: sw, h: sh, out });
    return out;
}

/**
 * Header options a widget mirror may set for itself (#1042): title/symbol on and off,
 * their look and place, and the header items. Unset, each follows the source.
 */
export const MIRROR_HEAD_KEYS = [
    'showTitle',
    'showIcon',
    'icon',
    'iconSize',
    'iconColor',
    'titleColor',
    'titleSize',
    'titleAlign',
    'iconPlace',
    'titleRow',
    'headerItems',
] as const;

/** The mirror's own header options — only the keys it actually set. */
export function mirrorHeadOverrides(mirror: WidgetConfig | undefined): Record<string, unknown> {
    const o = mirror?.options ?? {};
    const out: Record<string, unknown> = {};
    for (const k of MIRROR_HEAD_KEYS) if (o[k] !== undefined) out[k] = o[k];
    return out;
}

/** The source as the mirror shows it: its options with the mirror's own header options on top. */
export function withMirrorHead(source: WidgetConfig, mirror: WidgetConfig | undefined): WidgetConfig {
    const own = mirrorHeadOverrides(mirror);
    if (!Object.keys(own).length) return source;
    return { ...source, options: { ...source.options, ...own } };
}

/**
 * Options the mirrored body wrote back, before they go to the source: the header
 * options the mirror laid on top come off again, the source keeps its own.
 */
export function stripMirrorHead(
    written: WidgetConfig['options'],
    source: WidgetConfig,
    mirror: WidgetConfig | undefined,
): WidgetConfig['options'] {
    const next = { ...written };
    for (const k of Object.keys(mirrorHeadOverrides(mirror))) {
        if (source.options && k in source.options) next[k] = source.options[k];
        else delete next[k];
    }
    return next;
}
