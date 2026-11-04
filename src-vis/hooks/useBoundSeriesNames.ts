import { useMemo } from 'react';
import { useBoundTexts } from './useBoundTexts';
import type { EChartSeriesConfig } from './useMultiSeriesData';
import type { WidgetConfig } from '../types';

/**
 * The chart's series with bindings in their names resolved (issue #919) — e.g. a forecast
 * series named `{…day1.date;date(DD.MM.)}` labels its bar with the date the forecast is for.
 *
 * As long as no name changes the configured array is handed back as is, so the history hooks
 * downstream see the same identity they always did. A name whose datapoints have not arrived yet
 * reads `Serie n` (the editor's default name) instead of a dash — the comparison bars and the
 * legend are told apart by their names.
 */
export function useBoundSeriesNames(series: EChartSeriesConfig[], config: WidgetConfig): EChartSeriesConfig[] {
    const names = useBoundTexts(
        series.map((s) => s.name),
        config,
        (idx) => `Serie ${idx + 1}`,
    );
    return useMemo(
        () =>
            names.every((n, i) => n === series[i]?.name)
                ? series
                : series.map((s, i) => ({ ...s, name: names[i] ?? '' })),
        [series, names],
    );
}
