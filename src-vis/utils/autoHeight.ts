import type { WidgetConfig } from '../types';
import { resolveSandboxAttr, type SandboxPreset } from './iframeSandbox';
import { sandboxAllowsScripts } from './htmlBridge';
import { isGroupType } from './groupTypes';
import { findDashboardWidget, mirrorTargetWidgetId } from './mirrorSource';
import { useDashboardStore } from '../store/dashboardStore';

/**
 * Widget types that offer "Höhe automatisch an Inhalt anpassen" (option `autoHeight`).
 * Only types whose content length varies with the data — rows, entries, events. Types
 * that scale their content to the box (gauges, charts, buttons, media) have no natural
 * height to follow, so the option is not offered there. `html` reports the height of
 * its sandboxed document from inside the frame (utils/htmlBridge, #884).
 */
export const AUTO_HEIGHT_TYPES: ReadonlySet<string> = new Set([
    'list',
    'autolist',
    'jsontable',
    'statusoverview',
    'calendar',
    'messages',
    'adapterlogs',
    'historytable',
    'scenes',
    'announcements',
    'html',
]);

/** Types whose 'count' layout just centres one number in the box. The status
 *  overview's tally is not among them — it measures and grows like its lists. */
const COUNT_TILE_TYPES: ReadonlySet<string> = new Set(['messages', 'autolist']);

/** Layouts without a content height: the custom layout (CustomGridView is height:100%
 *  and needs a definite box) and the plain count tiles. */
function fixedLayout(type: string, layout: string): boolean {
    return layout === 'custom' || (layout === 'count' && COUNT_TILE_TYPES.has(type));
}

/** Whether the type/layout can size itself to its content. */
export function supportsAutoHeight(type: string, layout?: string): boolean {
    return AUTO_HEIGHT_TYPES.has(type) && !fixedLayout(type, layout ?? 'default');
}

/** The HTML widget's frame measures itself with a script — a sandbox without
 *  `allow-scripts` leaves nothing to report, so the option has no effect there. */
export function htmlCanReportHeight(options?: Record<string, unknown>): boolean {
    const attr = resolveSandboxAttr(
        options?.sandboxPreset as SandboxPreset | undefined,
        options?.sandboxCustom as string | undefined,
        'standard',
    );
    return sandboxAllowsScripts(attr);
}

/**
 * A widget mirror's auto-height (#1041): the mirror shows its source's content, so it
 * can follow that content's height like the source does. Its own `autoHeight` decides:
 * unset = as the source, true/false = on/off for the mirror alone (a mirror may be
 * meant to keep another size). The result is the source's config under the mirror's
 * id and placement — what every auto-height rule reads for the mirror, and what the
 * mirror hands its embedded body.
 */
export function mirrorAutoHeightView(mirror: WidgetConfig, src: WidgetConfig): WidgetConfig {
    const autoHeight = mirrorAutoHeight(mirror.options?.autoHeight, src);
    return { ...src, id: mirror.id, gridPos: mirror.gridPos, options: { ...src.options, autoHeight } };
}

/** The mirror's effective `autoHeight`: its own when set, else the source's. */
export function mirrorAutoHeight(own: unknown, src: WidgetConfig): boolean {
    return typeof own === 'boolean' ? own : src.options?.autoHeight === true;
}

/** The live source of a widget mirror (not a tab mirror, never another mirror). */
export function liveMirrorSource(w: WidgetConfig): WidgetConfig | undefined {
    const tid = mirrorTargetWidgetId(w);
    if (!tid || tid === w.id) return undefined;
    const src = findDashboardWidget(useDashboardStore.getState().layouts, tid);
    return src && src.type !== 'mirror' ? src : undefined;
}

/** The widget publishes its content height to autoHeightStore and the Dashboard sizes
 *  the grid item to it instead of the stored gridPos.h. A widget mirror follows its
 *  source's content (mirrorAutoHeightView). */
export function usesContentAutoHeight(w?: WidgetConfig): boolean {
    if (!w) return false;
    if (w.type === 'mirror') {
        const src = liveMirrorSource(w);
        return !!src && usesContentAutoHeight(mirrorAutoHeightView(w, src));
    }
    return (
        w.options?.autoHeight === true &&
        supportsAutoHeight(w.type, w.layout) &&
        (w.type !== 'html' || htmlCanReportHeight(w.options))
    );
}

/** Whether an auto-height popup cell grows the widget to its content. The HTML widget
 *  only when its own option asks for it: its markup is usually drawn for a fixed box,
 *  and before #884 it always kept its designed height there. */
export function followsPopupAutoHeight(w: WidgetConfig): boolean {
    return w.type === 'html' ? usesContentAutoHeight(w) : supportsAutoHeight(w.type, w.layout);
}

/** Whether a widget stacked into the phone column takes its content height instead
 *  of its stored row count. Groups and media players stack their own content; the
 *  weather's stacking layouts top-align and would leave a tall empty gap (custom grid
 *  needs a definite box, minimal/compact centre). Shared by the tab's mobile stack
 *  and a group's own stack, so a nested group shows its children in full there too
 *  instead of scrolling inside its desktop height (#897). */
export function stacksToContent(w: WidgetConfig): boolean {
    const layout = w.layout ?? 'default';
    return (
        isGroupType(w.type) ||
        w.type === 'mediaplayer' ||
        (w.type === 'weather' && layout !== 'custom' && layout !== 'minimal' && layout !== 'compact') ||
        usesContentAutoHeight(w)
    );
}
