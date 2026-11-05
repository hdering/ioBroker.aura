import { useEffect, useMemo, useState } from 'react';
import { getStateFromCache, useIoBroker } from './useIoBroker';
import {
    resolveJsonSeriesEntries,
    type EChartSeriesConfig,
    type JsonFannedSeries,
    type JsonSeriesEntry,
} from './useMultiSeriesData';

/** What a line takes from its payload entry — the points stay with the data hook. */
type EntryMeta = Omit<JsonSeriesEntry, 'data'>;

const NO_ENTRIES: EntryMeta[] = [];

/** Stable string hash (FNV-1a) — picks a name's palette slot. */
function hashName(name: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < name.length; i++) {
        h ^= name.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/**
 * Palette colour per entry without a `color` of its own. Taken from the name, not the position:
 * by position a new entry at the top would repaint every line below it. Two names landing on the
 * same slot move on to the next free one, so the lines stay apart as long as the palette lasts.
 */
function paletteColors(entries: EntryMeta[], palette: string[]): (string | undefined)[] {
    const taken = new Set<number>();
    return entries.map((e) => {
        if (e.color) return e.color;
        let slot = hashName(e.name) % palette.length;
        for (let i = 0; i < palette.length && taken.has(slot); i++) slot = (slot + 1) % palette.length;
        taken.add(slot);
        return palette[slot];
    });
}

/**
 * Fans every multi-series JSON template (`jsonMultiSeries`, issue #926) out into one ordinary JSON
 * series per entry of its payload, so the number of lines follows the datapoint. Downstream every
 * line is a plain JSON series — legend, tooltip, stacking, current values and colours need no
 * special case; each one reads its points by entry name (`jsonSeriesEntry`).
 *
 * Only the entries' names and styles are tracked here, so a payload whose values change but whose
 * series stay the same hands back the same array and the chart keeps its identity.
 */
export function useJsonSeriesFanOut(
    series: EChartSeriesConfig[],
    jsonMode: boolean,
    palette: string[],
): EChartSeriesConfig[] {
    const { subscribe, getState, connected } = useIoBroker();
    const templates = series.filter(
        (s) =>
            s.jsonMultiSeries && !!s.datapointId && !s.datapointId.includes('{{') && (jsonMode || s.source === 'json'),
    );
    const key = templates.map((s) => [s.id, s.datapointId, s.jsonPath ?? ''].join('\u0001')).join('\u0000');
    const [entries, setEntries] = useState<Record<string, EntryMeta[]>>({});

    useEffect(() => {
        if (!templates.length) return;
        const apply = (s: EChartSeriesConfig, val: unknown) => {
            const next = resolveJsonSeriesEntries(val, s.jsonPath).map(({ data: _data, ...meta }) => meta);
            setEntries((prev) =>
                JSON.stringify(prev[s.id]) === JSON.stringify(next) ? prev : { ...prev, [s.id]: next },
            );
        };
        for (const s of templates) {
            const cached = getStateFromCache(s.datapointId);
            if (cached) apply(s, cached.val);
        }
        if (!connected) return;
        const unsubs = templates.map((s) => {
            if (!getStateFromCache(s.datapointId)) {
                getState(s.datapointId)
                    .then((state) => apply(s, state?.val))
                    .catch(() => undefined);
            }
            return subscribe(s.datapointId, (state) => apply(s, state.val));
        });
        return () => unsubs.forEach((u) => u());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, connected]);

    return useMemo(() => {
        if (!series.some((s) => templates.includes(s))) return series;
        return series.flatMap((s): EChartSeriesConfig[] => {
            if (!templates.includes(s)) return [s];
            const list = entries[s.id] ?? NO_ENTRIES;
            const colors = paletteColors(list, palette);
            return list.map(
                (e, idx): JsonFannedSeries => ({
                    ...s,
                    id: `${s.id}~${e.name}`,
                    name: e.name,
                    color: colors[idx],
                    chartType: e.chartType ?? s.chartType,
                    yAxisIndex: e.yAxisIndex ?? s.yAxisIndex,
                    jsonMultiSeries: undefined,
                    jsonSeriesEntry: e.name,
                    lineType: e.lineStyle,
                }),
            );
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [series, entries, key, palette]);
}
