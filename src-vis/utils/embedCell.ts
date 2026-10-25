import type { CustomCell, WidgetConfig } from '../types';

/**
 * The custom grid's 'widget' cell (#838): a chart inside one cell, either with
 * its own settings ('embedded') or as a mirror of a chart widget on the dashboard.
 */

/** Chart types a cell can bring along with its own settings. */
export const EMBED_NEW_TYPES = ['echart'] as const;

/** Widget types a cell can mirror — charts only. */
export const EMBED_MIRROR_TYPES = new Set(['echart', 'chart', 'echartsPreset']);

/**
 * The widget config the embedded chart is drawn with. Its id is derived from the
 * host and the cell, so refresh rules and caches keyed by id stay apart from the
 * host's own. The chart has no title in a cell, so its icon is off unless set.
 */
export function embeddedChartConfig(
    cell: CustomCell,
    host: Pick<WidgetConfig, 'id' | 'gridPos'>,
    index: number,
): WidgetConfig {
    return {
        id: `${host.id}~cell${index}`,
        type: cell.embed?.type ?? 'echart',
        title: '',
        datapoint: '',
        gridPos: host.gridPos,
        options: { showIcon: false, ...cell.embed?.options },
    };
}

/** Every widget of the dashboard a 'widget' cell of `hostId` may mirror. */
export function mirrorableCharts(all: WidgetConfig[], hostId: string): WidgetConfig[] {
    return all.filter((w) => w.id !== hostId && EMBED_MIRROR_TYPES.has(w.type));
}
