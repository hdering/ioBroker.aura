import { useState, useEffect } from 'react';
import { Loader } from 'lucide-react';
import type { WidgetProps } from '../../types';

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

function getWeatherInfo(code: number): { desc: string; emoji: string } {
  if (code === 0)                  return { desc: 'Sonnig',        emoji: '☀️' };
  if (code === 1)                  return { desc: 'Leicht bewölkt',emoji: '🌤️' };
  if (code === 2)                  return { desc: 'Bewölkt',       emoji: '⛅' };
  if (code === 3)                  return { desc: 'Bedeckt',       emoji: '☁️' };
  if (code === 45 || code === 48)  return { desc: 'Nebel',         emoji: '🌫️' };
  if (code >= 51 && code <= 55)    return { desc: 'Nieselregen',   emoji: '🌦️' };
  if (code >= 61 && code <= 65)    return { desc: 'Regen',         emoji: '🌧️' };
  if (code >= 71 && code <= 75)    return { desc: 'Schnee',        emoji: '❄️' };
  if (code >= 80 && code <= 82)    return { desc: 'Schauer',       emoji: '🌦️' };
  if (code === 95)                 return { desc: 'Gewitter',      emoji: '⛈️' };
  return { desc: 'Unbekannt', emoji: '🌡️' };
}

function dayName(dateStr: string, short = true): string {
  return new Date(dateStr).toLocaleDateString('de-DE', { weekday: short ? 'short' : 'long' });
}

export function WeatherWidget({ config }: WidgetProps) {
  const opts          = config.options ?? {};
  const lat           = (opts.latitude as number)       ?? 48.1;
  const lon           = (opts.longitude as number)      ?? 11.6;
  const locationName  = (opts.locationName as string)   ?? '';
  const refreshMin    = (opts.refreshMinutes as number) ?? 30;
  const showForecast  = (opts.showForecast as boolean)  ?? true;
  const forecastDays  = (opts.forecastDays as number)   ?? 6;
  const layout        = config.layout ?? 'default';

  const [data, setData]       = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchWeather = async () => {
      try {
        const days = Math.min(Math.max(forecastDays + 1, 4), 8);
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
          `&timezone=auto&forecast_days=${days}&wind_speed_unit=kmh`;
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
        <span className="text-xs">Wetterdaten nicht verfügbar</span>
      </div>
    );
  }

  const cur  = data.current;
  const info = getWeatherInfo(cur.weather_code);
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

  // ── Forecast items (skip today = index 0, take up to forecastDays) ────────
  const fcCount = Math.min(forecastDays, data.daily.time.length - 1);
  const fcItems = Array.from({ length: fcCount }, (_, i) => i + 1).map((i) => ({
    day:  dayName(data.daily.time[i]),
    info: getWeatherInfo(data.daily.weather_code[i]),
    max:  Math.round(data.daily.temperature_2m_max[i]),
    min:  Math.round(data.daily.temperature_2m_min[i]),
  }));

  // Global temperature scale for bar positioning
  const allMins = fcItems.map((d) => d.min);
  const allMaxs = fcItems.map((d) => d.max);
  const globalMin = Math.min(...allMins);
  const globalMax = Math.max(...allMaxs);
  const scale = globalMax - globalMin || 1;

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
            💧 {cur.relative_humidity_2m}% Luftfeuchtigkeit
          </div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Gefühlt {feel} · 💨 {Math.round(cur.wind_speed_10m)} km/h
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
                  style={{ color: 'var(--text-secondary)' }}
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
                      background: 'linear-gradient(to right, #06b6d4, #3b82f6)',
                    }}
                  />
                </div>

                {/* Max temp */}
                <span
                  className="text-xs font-semibold shrink-0 w-7 tabular-nums"
                  style={{ color: 'var(--text-primary)' }}
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
