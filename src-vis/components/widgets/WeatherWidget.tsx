import { useState, useEffect } from 'react';
import { Loader } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useT } from '../../i18n';

// ── Open-Meteo types ──────────────────────────────────────────────────────────
interface WeatherData {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
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
function WarningsPanel({ warnings, loading, t }: { warnings: DwdWarning[]; loading: boolean; t: TFn }) {
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <Loader size={12} className="animate-spin" /> {t('weather.warnings')}
      </div>
    );
  }
  if (warnings.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
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
            <span style={{ fontSize: '0.8rem' }}>{SEVERITY_EMOJI[w.severity] ?? '⚠️'}</span>
            <span className="text-[11px] font-semibold leading-tight" style={{ color: SEVERITY_COLOR[w.severity] ?? '#f59e0b' }}>
              {w.headline || w.event}
            </span>
          </div>
          {w.description && (
            <p className="text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--text-secondary)' }}>
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
  const localTempDp      = (opts.localTempDatapoint as string) ?? '';
  const layout           = config.layout ?? 'default';

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
          `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
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
      <div className="flex flex-col h-full gap-1.5 overflow-auto">
        {locationName && (
          <div className="shrink-0 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {locationName}
          </div>
        )}
        <WarningsPanel warnings={warnings} loading={warningsLoading} t={t} />
      </div>
    );
  }

  // ── Only local sensor + no online weather ─────────────────────────────────
  if (!showWeather && !showWarnings) {
    if (localTemp !== null) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-1">
          <span className="text-4xl font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {Math.round(localTemp)}°
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{t('weather.localSensor')}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-secondary)' }}>
        {t('weather.noData')}
      </div>
    );
  }

  // ── Loading state (online weather) ────────────────────────────────────────
  if (showWeather && loading && !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader size={24} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
      </div>
    );
  }

  if (showWeather && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-secondary)' }}>
        <span className="text-2xl">🌡️</span>
        <span className="text-xs">{t('weather.noData')}</span>
      </div>
    );
  }

  // Effective temperature: local sensor overrides online
  const onlineTemp = data ? Math.round(data.current.temperature_2m) : null;
  const displayTemp = localTemp !== null ? Math.round(localTemp) : onlineTemp ?? 0;
  const tempStr = `${displayTemp}°C`;
  const localLabel = localTemp !== null ? ` ${t('weather.localSensor')}` : '';

  const cur  = data!.current;
  const info = getWeatherInfo(cur.weather_code, t);
  const feel = `${Math.round(cur.apparent_temperature)}°`;

  // ── MINIMAL ──────────────────────────────────────────────────────────────
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col h-full gap-1.5">
        <div className="flex flex-col items-center justify-center flex-1 gap-1">
          <span style={{ fontSize: '2.5rem', lineHeight: 1 }}>{info.emoji}</span>
          <span className="text-3xl font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {displayTemp}°
          </span>
          {localLabel && <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{localLabel}</span>}
        </div>
        {showWarnings && (
          <div className="shrink-0">
            <WarningsPanel warnings={warnings} loading={warningsLoading} t={t} />
          </div>
        )}
      </div>
    );
  }

  // ── COMPACT ───────────────────────────────────────────────────────────────
  if (layout === 'compact') {
    return (
      <div className="flex flex-col h-full gap-1.5">
        <div className="flex items-center gap-2.5 flex-1 min-h-0">
          <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{info.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{tempStr}</span>
              <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{info.desc}</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              💧 {cur.relative_humidity_2m}% · 💨 {Math.round(cur.wind_speed_10m)} km/h
              {locationName ? ` · ${locationName}` : ''}
              {localLabel}
            </p>
          </div>
        </div>
        {showWarnings && (
          <div className="shrink-0">
            <WarningsPanel warnings={warnings} loading={warningsLoading} t={t} />
          </div>
        )}
      </div>
    );
  }

  // ── Forecast items ────────────────────────────────────────────────────────
  const startIdx = showToday ? 0 : 1;
  const fcItems: { day: string; info: ReturnType<typeof getWeatherInfo>; max: number; min: number; isToday: boolean }[] = [];
  for (let i = startIdx; i < data!.daily.time.length && fcItems.length < forecastDays; i++) {
    fcItems.push({
      day:     i === 0 ? t('weather.today') : dayName(data!.daily.time[i], t),
      info:    getWeatherInfo(data!.daily.weather_code[i], t),
      max:     Math.round(data!.daily.temperature_2m_max[i]),
      min:     Math.round(data!.daily.temperature_2m_min[i]),
      isToday: i === 0,
    });
  }

  const allMins   = fcItems.map((d) => d.min);
  const allMaxs   = fcItems.map((d) => d.max);
  const globalMin = Math.min(...allMins);
  const globalMax = Math.max(...allMaxs);
  const scale     = globalMax - globalMin || 1;

  // ── DEFAULT / CARD ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full gap-2 overflow-auto">
      {config.title && !config.options?.hideTitle && (
        <p className="text-xs truncate mb-1" style={{ color: 'var(--text-secondary)' }}>{config.title}</p>
      )}
      {/* ── Current weather header ── */}
      <div className="flex items-start gap-3 shrink-0">
        <span style={{ fontSize: layout === 'card' ? '2.8rem' : '2.2rem', lineHeight: 1 }}>
          {info.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-bold" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {info.desc}, {tempStr}
            </span>
            {localLabel && (
              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{localLabel}</span>
            )}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            💧 {cur.relative_humidity_2m}% {t('weather.humidity')}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {t('weather.feelsLike', { feel, wind: Math.round(cur.wind_speed_10m) })}
            {locationName ? ` · ${locationName}` : ''}
            {error && <span className="ml-1" style={{ color: 'var(--accent-red, #ef4444)' }}>!</span>}
          </div>
        </div>
      </div>

      {/* ── Forecast ── */}
      {showForecast && fcItems.length > 0 && (
        <div className="flex flex-col gap-1.5 shrink-0">
          {fcItems.map((fc) => {
            const leftPct  = ((fc.min - globalMin) / scale) * 100;
            const widthPct = ((fc.max - fc.min)    / scale) * 100;
            return (
              <div key={fc.day} className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold shrink-0 w-7"
                  style={{ color: fc.isToday ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {fc.day}
                </span>
                <span className="text-xs shrink-0 w-7 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                  {fc.min}°
                </span>
                <div className="flex-1 relative h-4 min-w-0">
                  <div className="absolute inset-y-0 left-0 right-0 rounded-full opacity-15"
                    style={{ background: 'var(--text-secondary)' }} />
                  <div className="absolute inset-y-0 rounded-full"
                    style={{
                      left:       `${leftPct}%`,
                      width:      `${Math.max(widthPct, 4)}%`,
                      background: fc.isToday
                        ? 'linear-gradient(to right, var(--accent), color-mix(in srgb, var(--accent) 75%, transparent))'
                        : 'linear-gradient(to right, #06b6d4, #3b82f6)',
                    }}
                  />
                </div>
                <span className="text-xs font-semibold shrink-0 w-7 tabular-nums"
                  style={{ color: fc.isToday ? 'var(--accent)' : 'var(--text-primary)' }}>
                  {fc.max}°
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Weather warnings ── */}
      {showWarnings && (
        <div className="shrink-0">
          <WarningsPanel warnings={warnings} loading={warningsLoading} t={t} />
        </div>
      )}
    </div>
  );
}
