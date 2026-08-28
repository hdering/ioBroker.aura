import { useT, t } from '../../../i18n';
import type { EChartSeriesConfig, JsonAxisBounds } from '../../../hooks/useMultiSeriesData';
import type { DetectedAdapter } from '../../../hooks/useChartHistory';

/**
 * Pieces the advanced chart's options panel and its "Datenpunkte verwalten" dialog both need.
 * Extracted when mode and series moved into the dialog, so the field styling and the option
 * lists have one home instead of being duplicated across four files.
 */

export const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
export const inputStyle = {
    background: 'var(--app-bg)',
    color: 'var(--text-primary)',
    border: '1px solid var(--app-border)',
};

export const CHART_TYPES: { id: EChartSeriesConfig['chartType']; label: () => string }[] = [
    { id: 'line', label: () => t('echart.line') },
    { id: 'area', label: () => t('echart.area') },
    { id: 'bar', label: () => t('echart.bar') },
    { id: 'scatter', label: () => t('echart.scatter') },
];

/** Tri-state of a series' value labels: unset follows the widget switch (issue #584). */
export const SERIES_VALUE_MODES: { key: string; value: boolean | undefined }[] = [
    { key: 'auto', value: undefined },
    { key: 'on', value: true },
    { key: 'off', value: false },
];

export interface SeriesAdapterState {
    adapters: DetectedAdapter[];
    checking: boolean;
}

/** What reading the actual datapoint told us about a JSON series' structure. */
export interface JsonProbe {
    /** false while the value is still being fetched. */
    done: boolean;
    /** Datapoint value isn't a JSON array (at the configured path). */
    invalid?: boolean;
    /** Paths that DO hold an array — offered when the configured one found nothing. */
    arrayPaths?: string[];
    /** Object keys found in the first entry — these fill the two dropdowns. */
    keys: string[];
    /** Keys the auto-detection picked. */
    labelKey?: string;
    valueKey?: string;
    /** Y-axis bounds found in the payload — undefined when it carries none (issue #550). */
    bounds?: JsonAxisBounds;
    /** First entry's label/value, shown as a live example. */
    sampleLabel?: string;
    sampleValue?: string;
    entries: number;
    /** Every sampled label parses as a timestamp → the time axis is the right choice. */
    timeLike: boolean;
}

/**
 * Field picker for a JSON series: lists the keys actually present in the datapoint, with the
 * auto-detected one as the default. Falls back to a free-text input while nothing has been read
 * yet (template datapoint, offline, value not an array).
 */
export function JsonKeySelect({
    value,
    detected,
    keys,
    onChange,
}: {
    value?: string;
    detected?: string;
    keys: string[];
    onChange: (v: string | undefined) => void;
}) {
    const tr = useT();
    if (keys.length === 0) {
        return (
            <input
                type="text"
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value || undefined)}
                placeholder={detected ?? tr('echart.jsonKeyAutoShort')}
                className={inputCls}
                style={inputStyle}
            />
        );
    }
    return (
        <select
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={inputCls}
            style={inputStyle}
        >
            <option value="">
                {detected ? tr('echart.jsonKeyAuto', { key: detected }) : tr('echart.jsonKeyAutoShort')}
            </option>
            {keys.map((k) => (
                <option key={k} value={k}>
                    {k}
                </option>
            ))}
        </select>
    );
}
