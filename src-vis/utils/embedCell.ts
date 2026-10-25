import type { WidgetConfig } from '../types';

/**
 * The custom grid's 'widget' cell (#838): a mirror of a chart widget of the
 * dashboard inside one cell.
 */

/** Widget types a cell can mirror — charts only. */
export const EMBED_MIRROR_TYPES = new Set(['echart', 'chart', 'echartsPreset']);

/** Every widget of the dashboard a 'widget' cell of `hostId` may mirror. */
export function mirrorableCharts(all: WidgetConfig[], hostId: string): WidgetConfig[] {
    return all.filter((w) => w.id !== hostId && EMBED_MIRROR_TYPES.has(w.type));
}
