import type { WidgetConfig } from '../types';

/**
 * Widget types that offer "Höhe automatisch an Inhalt anpassen" (option `autoHeight`).
 * Only types whose content length varies with the data — rows, entries, events. Types
 * that scale their content to the box (gauges, charts, buttons, media) have no natural
 * height to follow, so the option is not offered there.
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

/** The widget publishes its content height to autoHeightStore and the Dashboard sizes
 *  the grid item to it instead of the stored gridPos.h. */
export function usesContentAutoHeight(w?: WidgetConfig): boolean {
    return !!w && w.options?.autoHeight === true && supportsAutoHeight(w.type, w.layout);
}
