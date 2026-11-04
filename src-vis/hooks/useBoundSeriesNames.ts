import { useMemo } from 'react';
import { useT } from '../i18n';
import { useTemplateStates } from './useTemplateValues';
import { useTemplateSpecials } from './useTemplateSpecials';
import { extractTemplateDpRefs, renderTemplate } from '../utils/htmlTemplate';
import { formatNum } from '../utils/formatValue';
import { useGlobalSettingsStore } from '../store/globalSettingsStore';
import type { EChartSeriesConfig } from './useMultiSeriesData';
import type { WidgetConfig } from '../types';

/**
 * The chart's series with bindings in their names resolved (issue #919) — e.g. a forecast
 * series named `{…day1.date;date(DD.MM.)}` labels its bar with the date the forecast is for.
 *
 * Same binding layer as free HTML and the section title's subtitle (utils/htmlTemplate,
 * docs/widgets/bindings.md). A name without a brace subscribes to nothing, and as long as no
 * name changes the configured array is handed back as is, so the history hooks downstream see
 * the same identity they always did. A name whose datapoints have not arrived yet reads
 * `Serie n` (the editor's default name) instead of a dash — the comparison bars and the legend
 * are told apart by their names.
 */
export function useBoundSeriesNames(series: EChartSeriesConfig[], config: WidgetConfig): EChartSeriesConfig[] {
    const t = useT();
    const { defaultDecimals, numberFormat } = useGlobalSettingsStore();
    const templates = series.map((s) => ((s.name ?? '').includes('{') ? s.name : ''));
    const templatesKey = templates.join('\u0000');
    const refsPerSeries = useMemo(
        () => templatesKey.split('\u0000').map((tpl) => (tpl ? extractTemplateDpRefs(tpl) : [])),
        [templatesKey],
    );
    const allRefs = useMemo(() => [...new Set(refsPerSeries.flat())], [refsPerSeries]);
    const states = useTemplateStates(allRefs);
    const specials = useTemplateSpecials(config);

    const names = useMemo(() => {
        const fmt = (v: unknown): string => {
            if (v === null || v === undefined) return '–';
            return typeof v === 'number' ? formatNum(v, defaultDecimals, numberFormat) : String(v);
        };
        return series.map((s, idx) => {
            const tpl = templates[idx];
            if (!tpl) return s.name;
            if (refsPerSeries[idx]?.some((ref) => !states[ref])) return `Serie ${idx + 1}`;
            return renderTemplate(tpl, {
                vars: Object.fromEntries(Object.entries(specials).map(([k, v]) => [k, String(v)])),
                resolve: (ref) => fmt(states[ref]?.val),
                resolveRaw: (ref, field) => states[ref]?.[field] ?? null,
                rawVars: { ...specials },
                ops: { formatNum: (v, d) => formatNum(v, d, numberFormat), decimals: defaultDecimals, t },
            });
        });
        // `templates` is derived from `series` and covered by it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [series, refsPerSeries, states, specials, defaultDecimals, numberFormat, t]);

    const namesKey = names.join('\u0000');
    return useMemo(
        () =>
            names.every((n, i) => n === series[i]?.name) ? series : series.map((s, i) => ({ ...s, name: names[i] })),
        // Keyed on the rendered text, not on `names`: a state update that leaves every name as it
        // was must not hand out a fresh array.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [series, namesKey],
    );
}
