import { useState, useEffect } from 'react';
import { Loader } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { useT } from '../../i18n';

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

export function WeatherWidget({ config }: WidgetProps) {
  const t = useT();
  const opts          = config.options ?? {};
  const lat           = (opts.latitude as number)       ?? 48.1;
  const lon           = (opts.longitude as number)      ?? 11.6;
  const locationName  = (opts.locationName as string)   ?? '';
  const refreshMin    = (opts.refreshMinutes as number) ?? 30;
  const showForecast  = (opts.showForecast as boolean)  ?? true;
  const forecastDays  = (opts.forecastDays as number)   ?? 5;
  const showToday     = (opts.showToday as boolean)     ?? true;
  const layout        = config.layout ?? 'default';

  const [data, setData]       = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchWeather = async () => {
      try {
        // Request enough days: forecastDays future days + today
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
  }, [lat, lon, refreshMin, forecastDays]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader size={24} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-secondary)' }}>
        <span className="text-2xl">🌡️</span>
        <span className="text-xs">{t('weather.noData')}</span>
      </div>
    );
  }

  const cur  = data.current;
  const info = getWeatherInfo(cur.weather_code, t);
  const temp = `${Math.round(cur.temperature_2m)}°C`;
  const feel = `${Math.round(cur.apparent_temperature)}°`;

  // ── MINIMAL ──────────────────────────────────────────────────────────────
  if (layout === 'minimal') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1">
        <span style={{ fontSize: '2.5rem', lineHeight: 1 }}>{info.emoji}</span>
        <span className="text-3xl font-black" style={{ color: 'var(--text-primary)' }}>
          {Math.round(cur.temperature_2m)}°
        </span>
      </div>
    );
  }

  // ── COMPACT ───────────────────────────────────────────────────────────────
  if (layout === 'compact') {
    return (
      <div className="flex items-center gap-2.5 h-full">
        <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{info.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{temp}</span>
            <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{info.desc}</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            💧 {cur.relative_humidity_2m}% · 💨 {Math.round(cur.wind_speed_10m)} km/h
            {locationName ? ` · ${locationName}` : ''}
          </p>
        </div>
      </div>
    );
  }

  // ── Forecast items ────────────────────────────────────────────────────────
  // startIdx: 0 = include today, 1 = skip today
  const startIdx = showToday ? 0 : 1;
  const fcItems: { day: string; info: ReturnType<typeof getWeatherInfo>; max: number; min: number; isToday: boolean }[] = [];
  for (let i = startIdx; i < data.daily.time.length && fcItems.length < forecastDays; i++) {
    fcItems.push({
      day:     i === 0 ? t('weather.today') : dayName(data.daily.time[i], t),
      info:    getWeatherInfo(data.daily.weather_code[i], t),
      max:     Math.round(data.daily.temperature_2m_max[i]),
      min:     Math.round(data.daily.temperature_2m_min[i]),
      isToday: i === 0,
    });
  }

  // Global temperature scale for bar positioning
  const allMins  = fcItems.map((d) => d.min);
  const allMaxs  = fcItems.map((d) => d.max);
  const globalMin = Math.min(...allMins);
  const globalMax = Math.max(...allMaxs);
  const scale     = globalMax - globalMin || 1;

  // ── DEFAULT / CARD ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full gap-2">
      {/* ── Current weather header ── */}
      <div className="flex items-start gap-3 shrink-0">
        <span style={{ fontSize: layout === 'card' ? '2.8rem' : '2.2rem', lineHeight: 1 }}>
          {info.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-bold" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {info.desc}, {temp}
            </span>
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

      {/* ── Forecast with temperature range bars ── */}
      {showForecast && fcItems.length > 0 && (
        <div className="flex flex-col gap-1.5 flex-1 min-h-0 justify-around">
          {fcItems.map((fc) => {
            const leftPct  = ((fc.min - globalMin) / scale) * 100;
            const widthPct = ((fc.max - fc.min)    / scale) * 100;
            return (
              <div key={fc.day} className="flex items-center gap-1.5 min-w-0">
                {/* Day name */}
                <span
                  className="text-xs font-semibold shrink-0 w-7"
                  style={{ color: fc.isToday ? 'var(--accent)' : 'var(--text-secondary)' }}
                >
                  {fc.day}
                </span>

                {/* Min temp */}
                <span
                  className="text-xs shrink-0 w-7 text-right tabular-nums"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {fc.min}°
                </span>

                {/* Temperature range bar */}
                <div className="flex-1 relative h-4 min-w-0">
                  {/* bar track */}
                  <div className="absolute inset-y-0 left-0 right-0 rounded-full opacity-15"
                    style={{ background: 'var(--text-secondary)' }} />
                  {/* colored range bar */}
                  <div
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      left:       `${leftPct}%`,
                      width:      `${Math.max(widthPct, 4)}%`,
                      background: fc.isToday
                        ? 'linear-gradient(to right, var(--accent), var(--accent)cc)'
                        : 'linear-gradient(to right, #06b6d4, #3b82f6)',
                    }}
                  />
                </div>

                {/* Max temp */}
                <span
                  className="text-xs font-semibold shrink-0 w-7 tabular-nums"
                  style={{ color: fc.isToday ? 'var(--accent)' : 'var(--text-primary)' }}
                >
                  {fc.max}°
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
