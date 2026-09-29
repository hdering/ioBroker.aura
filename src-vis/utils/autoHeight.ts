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
]);

/** Whether the type/layout can size itself to its content. The custom layout is
 *  excluded — CustomGridView is height:100% and needs a definite box. */
export function supportsAutoHeight(type: string, layout?: string): boolean {
    return AUTO_HEIGHT_TYPES.has(type) && (layout ?? 'default') !== 'custom';
}

/** The widget publishes its content height to autoHeightStore and the Dashboard sizes
 *  the grid item to it instead of the stored gridPos.h. */
export function usesContentAutoHeight(w?: WidgetConfig): boolean {
    return !!w && w.options?.autoHeight === true && supportsAutoHeight(w.type, w.layout);
}
