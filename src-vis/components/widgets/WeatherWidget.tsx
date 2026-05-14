import { useState, useEffect, useRef } from 'react';
import { Cloud, Loader } from 'lucide-react';
import type { WidgetProps, CustomGrid } from '../../types';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useT } from '../../i18n';
import { CustomGridView } from './CustomGridView';
import { getWidgetIcon } from '../../utils/widgetIconMap';

// ── Default 3×3 grid used when layout='custom' has no overrides ──────────────
export const DEFAULT_WEATHER_GRID: CustomGrid = [
  { type: 'title', align: 'left', valign: 'top', colSpan: 3 },
  { type: 'empty' },
  { type: 'empty' },
  { type: 'component', componentKey: 'weather-icon', align: 'center', valign: 'middle' },
  { type: 'value', fontSize: 32, bold: true, align: 'left', valign: 'middle', colSpan: 2 },
  { type: 'empty' },
  { type: 'component', componentKey: 'forecast', align: 'left', valign: 'middle', colSpan: 3 },
  { type: 'empty' },
  { type: 'empty' },
];

// ── Open-Meteo types ──────────────────────────────────────────────────────────
interface WeatherData {
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

// ── Brightsky (DWD) warning type ──────────────────────────────────────────────
interface DwdWarning {
  id: number;
  headline: string;
  description: string | null;
  severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme';
  event: string;
  onset: string;
  expires: string | null;
}

type TFn = (key: Parameters<ReturnType<typeof useT>>[0], vars?: Record<string, string | number>) => string;

function getWeatherInfo(code: number, t: TFn): { desc: string; emoji: string } {
  if (code === 0)                  return { desc: t('weather.sunny'),        emoji: '☀️' };
  if (code === 1)                  return { desc: t('weather.partlyCloudy'), emoji: '🌤️' };
  if (code === 2)                  return { desc: t('weather.cloudy'),       emoji: '⛅' };
  if (code === 3)                  return { desc: t('weather.overcast'),     emoji: '☁️' };
  if (code === 45 || code === 48)  return { desc: t('weather.fog'),          emoji: '🌫️' };
  if (code >= 51 && code <= 55)    return { desc: t('weather.drizzle'),      emoji: '🌦️' };
  if (code >= 61 && code <= 65)    return { desc: t('weather.rain'),         emoji: '🌧️' };
  if (code >= 71 && code <= 75)    return { desc: t('weather.snow'),         emoji: '❄️' };
  if (code >= 80 && code <= 82)    return { desc: t('weather.showers'),      emoji: '🌦️' };
  if (code === 95)                 return { desc: t('weather.thunderstorm'), emoji: '⛈️' };
  return { desc: t('weather.unknown'), emoji: '🌡️' };
}

function dayName(dateStr: string, t: TFn): string {
  const day = new Date(dateStr).getDay();
  return t(`cal.day.${day}` as Parameters<TFn>[0]);
}

// "ab X°C → Farbe" semantics. Returns the color of the highest threshold whose
// `from` is <= temp; undefined if no threshold matches (caller falls back to default).
function getTempBarColor(temp: number, thresholds?: [number, string][]): string | undefined {
  if (!thresholds?.length) return undefined;
  const sorted = [...thresholds].sort((a, b) => a[0] - b[0]);
  let chosen: string | undefined;
  for (const [from, c] of sorted) {
    if (temp >= from) chosen = c;
    else break;
  }
  return chosen;
}

const SEVERITY_COLOR: Record<string, string> = {
  Minor:    '#f59e0b',
  Moderate: '#f97316',
  Severe:   '#ef4444',
  Extreme:  '#7c3aed',
};

const SEVERITY_EMOJI: Record<string, string> = {
  Minor:    '⚠️',
  Moderate: '🔶',
  Severe:   '🔴',
  Extreme:  '🟣',
};

// ── Warnings panel ────────────────────────────────────────────────────────────
function WarningsPanel({ warnings, loading, t, scale = 1 }: { warnings: DwdWarning[]; loading: boolean; t: TFn; scale?: number }) {
  const fs = (rem: number) => `${rem * scale}rem`;
  if (loading) {
    return (
      <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)', fontSize: fs(0.75) }}>
        <Loader size={12 * scale} className="animate-spin" /> {t('weather.warnings')}
      </div>
    );
  }
  if (warnings.length === 0) {
    return (
      <div className="flex items-center gap-1.5" style={{ color: 'var(--text-secondary)', fontSize: fs(0.75) }}>
        <span>✅</span> {t('weather.noWarnings')}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {warnings.map((w) => (
        <div
          key={w.id}
          className="rounded-lg px-2 py-1.5"
          style={{
            background: `${SEVERITY_COLOR[w.severity] ?? '#f59e0b'}18`,
            border: `1px solid ${SEVERITY_COLOR[w.severity] ?? '#f59e0b'}55`,
          }}
        >
          <div className="flex items-center gap-1 flex-wrap">
            <span style={{ fontSize: fs(0.8) }}>{SEVERITY_EMOJI[w.severity] ?? '⚠️'}</span>
            <span className="font-semibold leading-tight" style={{ color: SEVERITY_COLOR[w.severity] ?? '#f59e0b', fontSize: fs(0.7) }}>
              {w.headline || w.event}
            </span>
          </div>
          {w.description && (
            <p className="mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)', fontSize: fs(0.625) }}>
              {w.description.length > 120 ? w.description.slice(0, 120) + '…' : w.description}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────
export function WeatherWidget({ config }: WidgetProps) {
  const t = useT();
  const opts             = config.options ?? {};
  const lat              = (opts.latitude       as number)  ?? 48.1;
  const lon              = (opts.longitude      as number)  ?? 11.6;
  const locationName     = (opts.locationName   as string)  ?? '';
  const refreshMin       = (opts.refreshMinutes as number)  ?? 30;
  const showForecast     = (opts.showForecast   as boolean) ?? true;
  const forecastDays     = (opts.forecastDays   as number)  ?? 5;
  const showToday        = (opts.showToday      as boolean) ?? true;
  const showWeather      = (opts.showWeather    as boolean) ?? true;
  const showWarnings     = (opts.showWarnings   as boolean) ?? false;
  const showRainProb     = (opts.showRainProb    as boolean) ?? true;
  const showRainAmount   = (opts.showRainAmount  as boolean) ?? false;
  const showCloudCover   = (opts.showCloudCover  as boolean) ?? false;
  const tempThresholds   = (opts.forecastTempThresholds as [number, string][] | undefined);
  const localTempDp      = (opts.localTempDatapoint as string) ?? '';
  const layout           = config.layout ?? 'default';
  const showTitle        = opts.showTitle !== false;
  const showIcon         = opts.showIcon  !== false;
  const iconSize         = (opts.iconSize as number) || 20;
  const titleAlign       = (opts.titleAlign as string) ?? 'left';
  const WidgetIcon       = getWidgetIcon(opts.icon as string | undefined, Cloud);
  // ── Display/typography customization ─────────────────────────────────────
  const showCondition      = (opts.showCondition       as boolean) ?? true;
  const showHumidityLabel  = (opts.showHumidityLabel   as boolean) ?? true;
  const feelsLikeStyle     = (opts.feelsLikeStyle      as 'text' | 'icon' | 'hidden') ?? 'text';
  const tempFontSize       = (opts.tempFontSize        as number)  || 0;   // 0 = auto (matches condition text)
  const fontScale          = (opts.fontScale           as number)  || 1;   // multiplier on auto scale
  const forecastRowGap     = (opts.forecastRowGap      as number)  || 0;   // rem; 0 = default (0.375)
  const forecastWrap       = (opts.forecastWrap        as boolean) ?? false;

  // ── Responsive sizing: scale font/icon/bar with widget dimensions ────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 260, h: 200 });
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout]);
  // Scale from the limiting dimension so content never overflows the widget.
  // Height baseline includes header (~64px) + per-row (~22px) for shown
  // forecast rows + optional title row (~22px). Width baseline ~260px.
  const titleRowH    = (showTitle || showIcon) ? 22 : 0;
  const headerH      = showWeather ? 64 : 0;
  const fcRows       = (showWeather && showForecast) ? forecastDays : 0;
  const baseContentH = Math.max(60, titleRowH + headerH + fcRows * 22 + 8);
  const scaleW = size.w / 260;
  const scaleH = size.h / baseContentH;
  const scaleAuto = Math.max(0.55, Math.min(2.4, Math.min(scaleW, scaleH)));
  const scale  = scaleAuto * fontScale;
  const fs = (rem: number) => `${rem * scale}rem`;

  // ── Local temperature sensor ──────────────────────────────────────────────
  const { value: localTempRaw } = useDatapoint(localTempDp);
  const localTemp = localTempDp && localTempRaw !== undefined && localTempRaw !== null
    ? Number(localTempRaw)
    : null;

  // ── Online weather ────────────────────────────────────────────────────────
  const [data, setData]       = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    if (!showWeather) { setLoading(false); return; }
    let cancelled = false;
    const fetchWeather = async () => {
      try {
        const apiForecastDays = Math.min(forecastDays + 1, 8);
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature,cloud_cover,precipitation` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum` +
          `&timezone=auto&forecast_days=${apiForecastDays}&wind_speed_unit=kmh`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP error');
        const json = await res.json() as WeatherData;
        if (!cancelled) { setData(json); setError(false); setLoading(false); }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    };
    setLoading(true);
    fetchWeather();
    const id = setInterval(fetchWeather, refreshMin * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [lat, lon, refreshMin, forecastDays, showWeather]);

  // ── DWD warnings (Brightsky) ──────────────────────────────────────────────
  const [warnings, setWarnings]           = useState<DwdWarning[]>([]);
  const [warningsLoading, setWarnLoading] = useState(false);

  useEffect(() => {
    if (!showWarnings) { setWarnings([]); return; }
    let cancelled = false;
    const fetchWarnings = async () => {
      setWarnLoading(true);
      try {
        const res = await fetch(
          `https://api.brightsky.dev/alerts?lat=${lat}&lon=${lon}`,
        );
        if (!res.ok) throw new Error('HTTP error');
        const json = await res.json() as { alerts?: DwdWarning[] };
        if (!cancelled) {
          setWarnings(json.alerts ?? []);
          setWarnLoading(false);
        }
      } catch {
        if (!cancelled) { setWarnings([]); setWarnLoading(false); }
      }
    };
    fetchWarnings();
    const id = setInterval(fetchWarnings, refreshMin * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [lat, lon, refreshMin, showWarnings]);

  // ── Warnings-only mode ────────────────────────────────────────────────────
  if (!showWeather && showWarnings) {
    return (
      <div ref={containerRef} className="aura-scroll flex flex-col h-full gap-1.5 overflow-auto">
        {locationName && (
          <div className="shrink-0 font-semibold" style={{ color: 'var(--text-secondary)', fontSize: fs(0.75) }}>
            {locationName}
          </div>
        )}
        <WarningsPanel warnings={warnings} loading={warningsLoading} t={t} scale={scale} />
      </div>
    );
  }

  // ── Only local sensor + no online weather ─────────────────────────────────
  if (!showWeather && !showWarnings) {
    if (localTemp !== null) {
      return (
        <div ref={containerRef} className="flex flex-col items-center justify-center h-full gap-1">
          <span className="font-black tabular-nums" style={{ color: 'var(--text-primary)', fontSize: fs(2.25) }}>
            {Math.round(localTemp)}°
          </span>
        </div>
      );
    }
    return (
      <div ref={containerRef} className="flex items-center justify-center h-full" style={{ color: 'var(--text-secondary)', fontSize: fs(0.75) }}>
        {t('weather.noData')}
      </div>
    );
  }

  // ── Loading state (online weather) ────────────────────────────────────────
  if (showWeather && loading && !data) {
    return (
      <div ref={containerRef} className="flex items-center justify-center h-full">
        <Loader size={24 * scale} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
      </div>
    );
  }

  if (showWeather && !data) {
    return (
      <div ref={containerRef} className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-secondary)' }}>
        <span style={{ fontSize: fs(1.5) }}>🌡️</span>
        <span style={{ fontSize: fs(0.75) }}>{t('weather.noData')}</span>
      </div>
    );
  }

  // Effective temperature: local sensor overrides online
  const onlineTemp = data ? Math.round(data.current.temperature_2m) : null;
  const displayTemp = localTemp !== null ? Math.round(localTemp) : onlineTemp ?? 0;
  const tempStr = `${displayTemp}°C`;

  const cur  = data!.current;
  const info = getWeatherInfo(cur.weather_code, t);
  const feel = `${Math.round(cur.apparent_temperature)}°`;

  // ── Forecast items (computed early so custom layout can render them) ─────
  const startIdx = showToday ? 0 : 1;
  const fcItems: {
    day: string;
    info: ReturnType<typeof getWeatherInfo>;
    max: number;
    min: number;
    isToday: boolean;
    rainProb?: number;
    rainSum?: number;
  }[] = [];
  for (let i = startIdx; i < data!.daily.time.length && fcItems.length < forecastDays; i++) {
    fcItems.push({
      day:      i === 0 ? t('weather.today') : dayName(data!.daily.time[i], t),
      info:     getWeatherInfo(data!.daily.weather_code[i], t),
      max:      Math.round(data!.daily.temperature_2m_max[i]),
      min:      Math.round(data!.daily.temperature_2m_min[i]),
      isToday:  i === 0,
      rainProb: data!.daily.precipitation_probability_max?.[i],
      rainSum:  data!.daily.precipitation_sum?.[i],
    });
  }
  const allMins   = fcItems.map((d) => d.min);
  const allMaxs   = fcItems.map((d) => d.max);
  const globalMin = Math.min(...allMins);
  const globalMax = Math.max(...allMaxs);
  const scaleRange = globalMax - globalMin || 1;

  const forecastRowGapStyle = forecastRowGap > 0 ? `${forecastRowGap}rem` : '0.375rem';
  const forecastRows = (showForecast && fcItems.length > 0) ? (
    <div className="flex flex-col w-full" style={{ rowGap: forecastRowGapStyle }}>
      {fcItems.map((fc) => {
        const leftPct  = ((fc.min - globalMin) / scaleRange) * 100;
        const widthPct = ((fc.max - fc.min)    / scaleRange) * 100;
        const minCol = getTempBarColor(fc.min, tempThresholds);
        const maxCol = getTempBarColor(fc.max, tempThresholds);
        const haveThreshold = minCol || maxCol;
        const barBg = haveThreshold
          ? `linear-gradient(to right, ${minCol ?? maxCol}, ${maxCol ?? minCol})`
          : fc.isToday
            ? 'linear-gradient(to right, var(--accent), color-mix(in srgb, var(--accent) 75%, transparent))'
            : 'linear-gradient(to right, #06b6d4, #3b82f6)';
        const showRainCol = showRainProb || showRainAmount;
        const rainEl = showRainCol ? (
          <span className="shrink-0 tabular-nums text-right" style={{ color: 'var(--text-secondary)', fontSize: fs(0.7), minWidth: `${2.6 * scale}rem` }}>
            {showRainProb && fc.rainProb !== undefined && fc.rainProb !== null && (
              <span>💧{fc.rainProb}%</span>
            )}
            {showRainAmount && fc.rainSum !== undefined && fc.rainSum !== null && fc.rainSum > 0 && (
              <span>{showRainProb ? ' ' : ''}{fc.rainSum.toFixed(1)}mm</span>
            )}
          </span>
        ) : null;
        if (forecastWrap) {
          return (
            <div key={fc.day} className="flex flex-col min-w-0" style={{ gap: '0.15rem' }}>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold" style={{ color: fc.isToday ? 'var(--accent)' : 'var(--text-secondary)', fontSize: fs(0.8) }}>
                  {fc.day}
                </span>
                <span style={{ fontSize: fs(0.9), lineHeight: 1 }}>{fc.info.emoji}</span>
                {rainEl}
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="shrink-0 text-right tabular-nums" style={{ color: 'var(--text-secondary)', fontSize: fs(0.75), width: `${1.75 * scale}rem` }}>
                  {fc.min}°
                </span>
                <div className="flex-1 relative min-w-0" style={{ height: `${1 * scale}rem` }}>
                  <div className="absolute inset-y-0 left-0 right-0 rounded-full opacity-15"
                    style={{ background: 'var(--text-secondary)' }} />
                  <div className="absolute inset-y-0 rounded-full"
                    style={{
                      left:       `${leftPct}%`,
                      width:      `${Math.max(widthPct, 4)}%`,
                      background: barBg,
                    }}
                  />
                </div>
                <span className="font-semibold shrink-0 tabular-nums" style={{ color: fc.isToday ? 'var(--accent)' : 'var(--text-primary)', fontSize: fs(0.75), width: `${1.75 * scale}rem` }}>
                  {fc.max}°
                </span>
              </div>
            </div>
          );
        }
        return (
          <div key={fc.day} className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold shrink-0" style={{ color: fc.isToday ? 'var(--accent)' : 'var(--text-secondary)', fontSize: fs(0.75), width: `${1.75 * scale}rem` }}>
              {fc.day}
            </span>
            <span style={{ fontSize: fs(0.9), lineHeight: 1, flexShrink: 0 }}>{fc.info.emoji}</span>
            <span className="shrink-0 text-right tabular-nums" style={{ color: 'var(--text-secondary)', fontSize: fs(0.75), width: `${1.75 * scale}rem` }}>
              {fc.min}°
            </span>
            <div className="flex-1 relative min-w-0" style={{ height: `${1 * scale}rem` }}>
              <div className="absolute inset-y-0 left-0 right-0 rounded-full opacity-15"
                style={{ background: 'var(--text-secondary)' }} />
              <div className="absolute inset-y-0 rounded-full"
                style={{
                  left:       `${leftPct}%`,
                  width:      `${Math.max(widthPct, 4)}%`,
                  background: barBg,
                }}
              />
            </div>
            <span className="font-semibold shrink-0 tabular-nums" style={{ color: fc.isToday ? 'var(--accent)' : 'var(--text-primary)', fontSize: fs(0.75), width: `${1.75 * scale}rem` }}>
              {fc.max}°
            </span>
            {rainEl}
          </div>
        );
      })}
    </div>
  ) : null;

  // ── Tomorrow (next-day) values for custom layout ─────────────────────────
  const tomorrowIdx = 1;
  const hasTomorrow = data!.daily.time.length > tomorrowIdx;
  const tomorrowInfo  = hasTomorrow ? getWeatherInfo(data!.daily.weather_code[tomorrowIdx], t) : null;
  const tomorrowMax   = hasTomorrow ? Math.round(data!.daily.temperature_2m_max[tomorrowIdx]) : null;
  const tomorrowMin   = hasTomorrow ? Math.round(data!.daily.temperature_2m_min[tomorrowIdx]) : null;
  const tomorrowDay   = hasTomorrow ? dayName(data!.daily.time[tomorrowIdx], t) : '';
  const tomorrowRainP = hasTomorrow ? data!.daily.precipitation_probability_max?.[tomorrowIdx] : undefined;
  const tomorrowRainS = hasTomorrow ? data!.daily.precipitation_sum?.[tomorrowIdx] : undefined;

  if (layout === 'custom') {
    const customGrid = (opts.customGrid as CustomGrid | undefined) ?? DEFAULT_WEATHER_GRID;
    const cellEmoji = <span style={{ fontSize: '2.4em', lineHeight: 1 }}>{info.emoji}</span>;
    const cellEmojiTomorrow = tomorrowInfo ? <span style={{ fontSize: '2.4em', lineHeight: 1 }}>{tomorrowInfo.emoji}</span> : null;
    const cellWidgetIcon = <WidgetIcon size={Math.max(16, iconSize * scale)} style={{ color: 'var(--text-secondary)' }} />;
    const cellWarnings = showWarnings ? <WarningsPanel warnings={warnings} loading={warningsLoading} t={t} scale={scale} /> : null;

    // ── Per-day fields & components (absolute API index 0..6) ──────────────
    const perDayFields: Record<string, string> = {};
    const perDayComponents: Record<string, React.ReactNode> = {};
    const maxDays = Math.min(data!.daily.time.length, 7);
    for (let i = 0; i < maxDays; i++) {
      const di   = getWeatherInfo(data!.daily.weather_code[i], t);
      const tMax = Math.round(data!.daily.temperature_2m_max[i]);
      const tMin = Math.round(data!.daily.temperature_2m_min[i]);
      const dn   = i === 0 ? t('weather.today') : dayName(data!.daily.time[i], t);
      const rp   = data!.daily.precipitation_probability_max?.[i];
      const rs   = data!.daily.precipitation_sum?.[i];
      perDayFields[`day${i}`]        = dn;
      perDayFields[`emoji${i}`]      = di.emoji;
      perDayFields[`condition${i}`]  = di.desc;
      perDayFields[`tempMax${i}`]    = `${tMax}°`;
      perDayFields[`tempMin${i}`]    = `${tMin}°`;
      perDayFields[`tempRange${i}`]  = `${tMin}° / ${tMax}°`;
      perDayFields[`rainProb${i}`]   = rp !== undefined && rp !== null ? `${rp}%` : '';
      perDayFields[`rainSum${i}`]    = rs !== undefined && rs !== null && rs > 0 ? `${rs.toFixed(1)} mm` : '';
      perDayComponents[`weather-icon-day-${i}`] = (
        <span style={{ fontSize: '2.4em', lineHeight: 1 }}>{di.emoji}</span>
      );
    }

    return (
      <CustomGridView
        config={{ ...config, options: { ...opts, customGrid } }}
        value={displayTemp ? `${displayTemp}°C` : ''}
        extraFields={{
          temp:               `${displayTemp}°C`,
          tempValue:          `${displayTemp}`,
          feelsLike:          feel + 'C',
          feelsLikeValue:     feel,
          humidity:           `${cur.relative_humidity_2m}%`,
          humidityValue:      `${cur.relative_humidity_2m}`,
          wind:               `${Math.round(cur.wind_speed_10m)} km/h`,
          windValue:          `${Math.round(cur.wind_speed_10m)}`,
          condition:          info.desc,
          emoji:              info.emoji,
          cloudCover:         cur.cloud_cover !== undefined ? `${Math.round(cur.cloud_cover)}%` : '',
          cloudCoverValue:    cur.cloud_cover !== undefined ? `${Math.round(cur.cloud_cover)}` : '',
          rainNow:            cur.precipitation !== undefined ? `${cur.precipitation.toFixed(1)} mm` : '',
          rainNowValue:       cur.precipitation !== undefined ? cur.precipitation.toFixed(1) : '',
          location:           locationName,
          // Backwards-compatible tomorrow shortcuts (= day1)
          dayTomorrow:        tomorrowDay,
          emojiTomorrow:      tomorrowInfo?.emoji ?? '',
          conditionTomorrow:  tomorrowInfo?.desc  ?? '',
          tempMaxTomorrow:    tomorrowMax !== null ? `${tomorrowMax}°` : '',
          tempMinTomorrow:    tomorrowMin !== null ? `${tomorrowMin}°` : '',
          tempRangeTomorrow:  (tomorrowMin !== null && tomorrowMax !== null) ? `${tomorrowMin}° / ${tomorrowMax}°` : '',
          rainProbTomorrow:   tomorrowRainP !== undefined && tomorrowRainP !== null ? `${tomorrowRainP}%` : '',
          rainSumTomorrow:    tomorrowRainS !== undefined && tomorrowRainS !== null ? `${tomorrowRainS.toFixed(1)} mm` : '',
          ...perDayFields,
        }}
        extraComponents={{
          'icon':                  cellWidgetIcon,
          'weather-icon':          cellEmoji,
          'weather-icon-tomorrow': cellEmojiTomorrow,
          'forecast':              forecastRows,
          'warnings':              cellWarnings,
          ...perDayComponents,
        }}
      />
    );
  }

  // ── MINIMAL ──────────────────────────────────────────────────────────────
  if (layout === 'minimal') {
    return (
      <div ref={containerRef} className="flex flex-col h-full gap-1.5">
        <div className="flex flex-col items-center justify-center flex-1 gap-1">
          <span style={{ fontSize: fs(2.5), lineHeight: 1 }}>{info.emoji}</span>
          <span className="font-black tabular-nums" style={{ color: 'var(--text-primary)', fontSize: fs(1.875) }}>
            {displayTemp}°
          </span>
        </div>
        {showWarnings && (
          <div className="shrink-0">
            <WarningsPanel warnings={warnings} loading={warningsLoading} t={t} scale={scale} />
          </div>
        )}
      </div>
    );
  }

  // ── COMPACT ───────────────────────────────────────────────────────────────
  if (layout === 'compact') {
    return (
      <div ref={containerRef} className="flex items-center gap-2 h-full">
        <span style={{ fontSize: fs(1.4), lineHeight: 1, flexShrink: 0 }}>{info.emoji}</span>
        <span className="font-bold tabular-nums shrink-0" style={{ color: 'var(--text-primary)', fontSize: fs(1.25) }}>{tempStr}</span>
        <span className="flex-1 truncate min-w-0" style={{ color: 'var(--text-secondary)', fontSize: fs(0.75) }}>
          {info.desc}{locationName ? ` · ${locationName}` : ''}
        </span>
      </div>
    );
  }

  // ── DEFAULT / CARD ────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="aura-scroll flex flex-col h-full gap-2 overflow-auto">
      {(showTitle || showIcon) && (
        <div className="flex items-center gap-1 shrink-0 mb-1 min-w-0">
          {showIcon && <WidgetIcon size={iconSize * scale} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
          {showTitle && <p className="truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'], fontSize: fs(0.75) }}>{config.title}</p>}
        </div>
      )}
      {/* ── Current weather header ── */}
      <div className="flex items-start gap-3 shrink-0">
        <span style={{ fontSize: fs(2.2), lineHeight: 1 }}>
          {info.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            {showCondition && (
              <span className="font-bold" style={{ color: 'var(--text-secondary)', fontSize: fs(0.85) }}>
                {info.desc}
              </span>
            )}
            <span className="font-bold tabular-nums" style={{ color: showCondition ? 'var(--text-secondary)' : 'var(--text-primary)', fontSize: fs(tempFontSize > 0 ? tempFontSize : 0.85) }}>
              {showCondition ? `, ${tempStr}` : tempStr}
            </span>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: fs(0.75) }}>
            💧 {cur.relative_humidity_2m}%{showHumidityLabel ? ` ${t('weather.humidity')}` : ''}
            {showCloudCover && cur.cloud_cover !== undefined && (
              <span> · ☁️ {Math.round(cur.cloud_cover)}%</span>
            )}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: fs(0.75) }}>
            {feelsLikeStyle === 'text' && (
              <span>{t('weather.feelsLike', { feel, wind: Math.round(cur.wind_speed_10m) })}</span>
            )}
            {feelsLikeStyle === 'icon' && (
              <span>🌡️ {feel} · 💨 {Math.round(cur.wind_speed_10m)} km/h</span>
            )}
            {feelsLikeStyle === 'hidden' && (
              <span>{feel} · 💨 {Math.round(cur.wind_speed_10m)} km/h</span>
            )}
            {locationName ? ` · ${locationName}` : ''}
            {error && <span className="ml-1" style={{ color: 'var(--accent-red, #ef4444)' }}>!</span>}
          </div>
        </div>
      </div>

      {/* ── Forecast ── */}
      {forecastRows && <div className="shrink-0">{forecastRows}</div>}

      {/* ── Weather warnings ── */}
      {showWarnings && (
        <div className="shrink-0">
          <WarningsPanel warnings={warnings} loading={warningsLoading} t={t} scale={scale} />
        </div>
      )}
    </div>
  );
}
