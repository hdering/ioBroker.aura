import { useEffect, useMemo, useState } from 'react';
import { useIoBroker, getStateFromCache, prefetchStates } from './useIoBroker';
import type { ioBrokerState } from '../types';

// Shape mirrors the Open-Meteo REST response shape used by WeatherWidget.
// Keeping the keys identical lets the render code stay source-agnostic.
export interface AdapterWeatherData {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    cloud_cover?: number;
    precipitation?: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: number[];
    precipitation_sum?: number[];
  };
}

const MAX_DAYS = 7; // adapter exposes day0..day6
const CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'weather_code',
  'wind_speed_10m',
  'cloud_cover',
  'precipitation',
] as const;
const DAILY_FIELDS = [
  'time',
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
  'precipitation_sum',
] as const;

function buildIds(prefix: string): string[] {
  const ids: string[] = [];
  for (const f of CURRENT_FIELDS) ids.push(`${prefix}.weather.current.${f}`);
  for (let i = 0; i < MAX_DAYS; i++) {
    for (const f of DAILY_FIELDS) ids.push(`${prefix}.weather.forecast.day${i}.${f}`);
  }
  return ids;
}

function num(s: ioBrokerState | null | undefined): number | undefined {
  if (!s || s.val === null || s.val === undefined) return undefined;
  const n = typeof s.val === 'number' ? s.val : Number(s.val);
  return Number.isFinite(n) ? n : undefined;
}

function str(s: ioBrokerState | null | undefined): string {
  if (!s || s.val === null || s.val === undefined) return '';
  return String(s.val);
}

function assemble(prefix: string, states: Map<string, ioBrokerState | null>): AdapterWeatherData | null {
  const cur = (f: string) => states.get(`${prefix}.weather.current.${f}`) ?? null;
  const day = (i: number, f: string) => states.get(`${prefix}.weather.forecast.day${i}.${f}`) ?? null;

  const temp = num(cur('temperature_2m'));
  const code = num(cur('weather_code'));
  // Need at least current temperature + weather code to consider the data valid.
  if (temp === undefined || code === undefined) return null;

  const daily: AdapterWeatherData['daily'] = {
    time: [],
    weather_code: [],
    temperature_2m_max: [],
    temperature_2m_min: [],
    precipitation_probability_max: [],
    precipitation_sum: [],
  };
  for (let i = 0; i < MAX_DAYS; i++) {
    const t = str(day(i, 'time'));
    const wc = num(day(i, 'weather_code'));
    const tMax = num(day(i, 'temperature_2m_max'));
    const tMin = num(day(i, 'temperature_2m_min'));
    if (!t || wc === undefined || tMax === undefined || tMin === undefined) break;
    daily.time.push(t);
    daily.weather_code.push(wc);
    daily.temperature_2m_max.push(tMax);
    daily.temperature_2m_min.push(tMin);
    daily.precipitation_probability_max!.push(num(day(i, 'precipitation_probability_max')) ?? 0);
    daily.precipitation_sum!.push(num(day(i, 'precipitation_sum')) ?? 0);
  }

  return {
    current: {
      temperature_2m: temp,
      apparent_temperature: num(cur('apparent_temperature')) ?? temp,
      relative_humidity_2m: num(cur('relative_humidity_2m')) ?? 0,
      weather_code: code,
      wind_speed_10m: num(cur('wind_speed_10m')) ?? 0,
      cloud_cover: num(cur('cloud_cover')),
      precipitation: num(cur('precipitation')),
    },
    daily,
  };
}

/**
 * Subscribes to all open-meteo-weather adapter states under the given location
 * prefix (e.g. "open-meteo-weather.0.Hochspeyer") and returns them assembled
 * into the same shape as the Open-Meteo REST API.
 */
export function useAdapterWeather(prefix: string): {
  data: AdapterWeatherData | null;
  loading: boolean;
  error: boolean;
} {
  const { subscribe, connected } = useIoBroker();
  const ids = useMemo(() => (prefix ? buildIds(prefix) : []), [prefix]);

  const [states, setStates] = useState<Map<string, ioBrokerState | null>>(() => {
    const m = new Map<string, ioBrokerState | null>();
    for (const id of ids) m.set(id, getStateFromCache(id));
    return m;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!prefix || !connected) return;
    let cancelled = false;

    // Warm cache for any IDs not already cached.
    void prefetchStates(ids).then(() => {
      if (cancelled) return;
      setStates((prev) => {
        const m = new Map(prev);
        for (const id of ids) m.set(id, getStateFromCache(id));
        return m;
      });
      setLoading(false);
    });

    const unsubs = ids.map((id) =>
      subscribe(id, (newState) => {
        if (cancelled) return;
        setStates((prev) => {
          const m = new Map(prev);
          m.set(id, newState);
          return m;
        });
      }),
    );

    return () => {
      cancelled = true;
      for (const u of unsubs) u();
    };
  }, [prefix, connected, ids, subscribe]);

  const data = useMemo(() => (prefix ? assemble(prefix, states) : null), [prefix, states]);
  const error = !loading && !data;

  return { data, loading: loading && !data, error };
}

/**
 * Strip a full state ID down to the location prefix.
 * Example: "open-meteo-weather.0.Hochspeyer.weather.current.temperature_2m"
 *       -> "open-meteo-weather.0.Hochspeyer"
 */
export function deriveAdapterPrefix(stateId: string): string {
  if (!stateId) return '';
  const idx = stateId.indexOf('.weather.');
  if (idx < 0) return stateId;
  return stateId.slice(0, idx);
}
