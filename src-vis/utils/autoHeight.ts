import type { WidgetConfig } from '../types';
import { resolveSandboxAttr, type SandboxPreset } from './iframeSandbox';
import { sandboxAllowsScripts } from './htmlBridge';

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

/** The widget publishes its content height to autoHeightStore and the Dashboard sizes
 *  the grid item to it instead of the stored gridPos.h. */
export function usesContentAutoHeight(w?: WidgetConfig): boolean {
    return (
        !!w &&
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
