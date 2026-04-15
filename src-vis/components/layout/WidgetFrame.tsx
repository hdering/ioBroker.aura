import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../../contexts/PortalTargetContext';
import { useT, t } from '../../i18n';
import { X, Pencil, Database, Sparkles, EyeOff, ChevronDown, Plus, Trash2, Download, ArrowRightLeft, Copy } from 'lucide-react';
import { exportWidget } from '../../utils/widgetExportImport';
import { ICON_PICKER_ENTRIES } from '../../utils/widgetIconMap';
import { useDashboardStore, useActiveLayout } from '../../store/dashboardStore';
import type { WidgetConfig, WidgetCondition } from '../../types';
import { DatapointPicker } from '../config/DatapointPicker';
import { ConditionEditor } from '../config/ConditionEditor';
import { getObjectDirect, subscribeStateDirect, getStateDirect } from '../../hooks/useIoBroker';
import { WIDGET_REGISTRY, WIDGET_GROUPS } from '../../widgetRegistry';
import { AutoListConfig } from '../config/AutoListConfig';
import { WidgetPreview } from '../config/WidgetPreview';
import { detectHistoryAdapters, RANGE_LABELS, type ChartTimeRange, type DetectedAdapter } from '../../hooks/useChartHistory';
import { useConditionStyle, notifyHiddenState, cleanupHiddenState } from '../../hooks/useConditionStyle';
import { SwitchWidget } from '../widgets/SwitchWidget';
import { ValueWidget } from '../widgets/ValueWidget';
import { DimmerWidget } from '../widgets/DimmerWidget';
import { ThermostatWidget } from '../widgets/ThermostatWidget';
import { ChartWidget } from '../widgets/ChartWidget';
import { ListWidget } from '../widgets/ListWidget';
import { ClockWidget } from '../widgets/ClockWidget';
import { CalendarWidget, getSources, DEFAULT_CAL_COLORS, type CalendarSource } from '../widgets/CalendarWidget';
import { HeaderWidget } from '../widgets/HeaderWidget';
// GroupWidget imports WidgetFrame (circular) — safe because it only uses WidgetFrame
// inside its render function, never at module-init time.
import { GroupWidget } from '../widgets/GroupWidget';
import { EChartWidget } from '../widgets/EChartWidget';
import { EChartConfig } from '../config/EChartConfig';
import { EvccWidget } from '../widgets/EvccWidget';
import { EvccConfig } from '../widgets/EvccWidget';
import { WeatherWidget } from '../widgets/WeatherWidget';
import { GaugeWidget } from '../widgets/GaugeWidget';
import { CameraWidget } from '../widgets/CameraWidget';
import { ImageWidget } from '../widgets/ImageWidget';
import { IframeWidget } from '../widgets/IframeWidget';
import { FillWidget } from '../widgets/FillWidget';
import { TrashWidget, TrashConfig } from '../widgets/TrashWidget';
import { AutoListWidget } from '../widgets/AutoListWidget';

// Stable empty array – avoids creating a new reference on every render when no conditions are set
const NO_CONDITIONS: WidgetCondition[] = [];

// Defined as a function so it's evaluated lazily, avoiding circular-init issues.
function getWidgetMap() {
  return {
    switch:     SwitchWidget,
    value:      ValueWidget,
    dimmer:     DimmerWidget,
    thermostat: ThermostatWidget,
    chart:      ChartWidget,
    list:       ListWidget,
    clock:      ClockWidget,
    calendar:   CalendarWidget,
    header:     HeaderWidget,
    group:      GroupWidget,
    echart:     EChartWidget,
    evcc:       EvccWidget,
    weather:    WeatherWidget,
    gauge:      GaugeWidget,
    camera:     CameraWidget,
    autolist:   AutoListWidget,
    image:      ImageWidget,
    iframe:     IframeWidget,
    fill:       FillWidget,
    trash:      TrashWidget,
  } as const;
}

// ── CalendarEditPanel ──────────────────────────────────────────────────────

const REFRESH_OPTIONS = [
  { label: '5 Min', value: 5 }, { label: '15 Min', value: 15 }, { label: '30 Min', value: 30 },
  { label: '1 Std', value: 60 }, { label: '6 Std', value: 360 }, { label: '24 Std', value: 1440 },
];
const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

function CalendarEditPanel({ config, onConfigChange }: { config: WidgetConfig; onConfigChange: (c: WidgetConfig) => void }) {
  const t = useT();
  const o = config.options ?? {};
  const sources = getSources(o);
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_CAL_COLORS[sources.length % DEFAULT_CAL_COLORS.length]);

  const setOpts = (patch: Record<string, unknown>) =>
    onConfigChange({ ...config, options: { ...o, ...patch } });

  const updateSource = (id: string, patch: Partial<CalendarSource>) =>
    setOpts({ calendars: sources.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const removeSource = (id: string) =>
    setOpts({ calendars: sources.filter((s) => s.id !== id) });

  const confirmAdd = () => {
    if (!newUrl.trim()) return;
    const next: CalendarSource = {
      id: Date.now().toString(),
      url: newUrl.trim(),
      name: newName.trim() || 'Kalender',
      color: newColor,
      showName: true,
    };
    setOpts({ calendars: [...sources, next] });
    setNewUrl(''); setNewName('');
    setNewColor(DEFAULT_CAL_COLORS[(sources.length + 1) % DEFAULT_CAL_COLORS.length]);
    setAdding(false);
  };

  return (
    <>
      {/* calendar list */}
      <div className="space-y-1.5">
        {sources.map((src) => (
          <div key={src.id} className="rounded-lg p-2 space-y-1.5" style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={src.color}
                onChange={(e) => updateSource(src.id, { color: e.target.value })}
                className="w-5 h-5 rounded cursor-pointer border-0 p-0 shrink-0"
                title={t('wf.cal.changeColor')}
              />
              <input
                type="text"
                value={src.name}
                onChange={(e) => updateSource(src.id, { name: e.target.value })}
                className="flex-1 text-xs rounded px-2 py-1 focus:outline-none min-w-0"
                style={inputStyle}
                placeholder={t('wf.cal.calName')}
              />
              <button
                onClick={() => updateSource(src.id, { showName: !src.showName })}
                className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                style={{ background: src.showName ? src.color : 'var(--app-border)' }}
                title={t('wf.cal.showName')}
              >
                <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                  style={{ left: src.showName ? '14px' : '2px' }} />
              </button>
              <button onClick={() => removeSource(src.id)} className="hover:opacity-70 shrink-0" style={{ color: 'var(--accent-red)' }}>
                <Trash2 size={12} />
              </button>
            </div>
            <p className="text-[9px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{src.url}</p>
          </div>
        ))}
      </div>

      {/* add form */}
      {adding ? (
        <div className="rounded-lg p-2 space-y-1.5" style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder={t('wf.cal.calUrl')}
            autoFocus
            className={inputCls + ' font-mono'}
            style={inputStyle}
          />
          <div className="flex gap-1.5">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 p-0 shrink-0"
            />
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('wf.cal.calName')}
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div className="flex gap-1.5">
            <button onClick={confirmAdd} disabled={!newUrl.trim()}
              className="flex-1 py-1.5 text-xs rounded-lg text-white hover:opacity-80 disabled:opacity-30"
              style={{ background: 'var(--accent)' }}>
              {t('wf.cal.add')}
            </button>
            <button onClick={() => { setAdding(false); setNewUrl(''); setNewName(''); }}
              className="px-3 py-1.5 text-xs rounded-lg hover:opacity-80"
              style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
              ✕
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs rounded-lg hover:opacity-80"
          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px dashed var(--app-border)' }}>
          <Plus size={12} /> {t('wf.cal.addCalendar')}
        </button>
      )}

      {/* separator */}
      <div className="h-px" style={{ background: 'var(--app-border)' }} />

      {/* ── calendar settings ── */}
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.cal.refreshInterval')}</label>
        <select value={(o.refreshInterval as number) ?? 30} onChange={(e) => setOpts({ refreshInterval: Number(e.target.value) })}
          className={inputCls} style={inputStyle}>
          {REFRESH_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.cal.daysAhead')}</label>
        <input type="number" min={1} max={365} value={(o.daysAhead as number) ?? 14}
          onChange={(e) => setOpts({ daysAhead: Number(e.target.value) })} className={inputCls} style={inputStyle} />
      </div>
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.cal.maxEntries')}</label>
        <input type="number" min={1} max={20} value={(o.maxEvents as number) ?? 5}
          onChange={(e) => setOpts({ maxEvents: Number(e.target.value) })} className={inputCls} style={inputStyle} />
      </div>
    </>
  );
}

const STYLE_FIELDS: { key: string; labelKey: string; type: 'color' | 'text' }[] = [
  { key: 'bg', labelKey: 'wf.edit.style.bg', type: 'color' },
  { key: 'accent', labelKey: 'wf.edit.style.accent', type: 'color' },
  { key: 'textPrimary', labelKey: 'wf.edit.style.text', type: 'color' },
  { key: 'textSecondary', labelKey: 'wf.edit.style.textSec', type: 'color' },
  { key: 'radius', labelKey: 'wf.edit.style.radius', type: 'text' },
];

// ── ChartHistoryConfig ────────────────────────────────────────────────────────
const CHART_RANGES: ChartTimeRange[] = ['1h', '6h', '24h', '7d', '30d'];

function ChartHistoryConfig({ config, onConfigChange }: { config: WidgetConfig; onConfigChange: (c: WidgetConfig) => void }) {
  const t = useT();
  const [adapters, setAdapters] = useState<DetectedAdapter[]>([]);
  const [checking, setChecking] = useState(false);
  const dp = config.datapoint;
  const o  = config.options ?? {};
  const set = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });

  useEffect(() => {
    if (!dp) { setAdapters([]); return; }
    setChecking(true);
    getObjectDirect(dp).then((obj) => {
      const custom = obj?.common?.custom;
      setAdapters(custom ? detectHistoryAdapters(custom as Record<string, { enabled?: boolean }>) : []);
      setChecking(false);
    }).catch(() => setChecking(false));
  }, [dp]);

  const selectedInstance = o.historyInstance as string | undefined;
  const selectedRange    = (o.historyRange as ChartTimeRange | undefined) ?? '24h';

  return (
    <>
      <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
      <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('wf.history.title')}</p>

      {/* Adapter-Auswahl */}
      {checking && (
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.history.checking')}</p>
      )}
      {!checking && adapters.length === 0 && (
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {t('wf.history.noAdapter')}
        </p>
      )}
      {!checking && adapters.length > 0 && (
        <div>
          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.history.instance')}</label>
          <select
            value={selectedInstance ?? ''}
            onChange={(e) => set({ historyInstance: e.target.value || undefined })}
            className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
            style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
          >
            <option value="">{t('wf.history.liveData')}</option>
            {adapters.map((a) => (
              <option key={a.instance} value={a.instance}>{a.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Zeitraum */}
      {selectedInstance && (
        <div>
          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.history.timeRange')}</label>
          <div className="flex gap-1 flex-wrap">
            {CHART_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => set({ historyRange: r })}
                className="flex-1 text-[11px] py-1 rounded-md transition-opacity hover:opacity-80"
                style={{
                  background: selectedRange === r ? 'var(--accent)' : 'var(--app-bg)',
                  color:      selectedRange === r ? '#fff' : 'var(--text-secondary)',
                  border:     `1px solid ${selectedRange === r ? 'var(--accent)' : 'var(--app-border)'}`,
                  minWidth: 36,
                }}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Single-panel coordinator ──────────────────────────────────────────────────
// Ensures only one widget has an open dropdown at a time.

const panelOwner: { id: string | null; close: (() => void) | null } = { id: null, close: null };

function claimPanel(widgetId: string, closeFn: () => void) {
  if (panelOwner.id && panelOwner.id !== widgetId) {
    panelOwner.close?.(); // close the previously open widget's panel
  }
  panelOwner.id = widgetId;
  panelOwner.close = closeFn;
}

function releasePanel(widgetId: string) {
  if (panelOwner.id === widgetId) {
    panelOwner.id = null;
    panelOwner.close = null;
  }
}

// ── Centered modal (edit / conditions) ───────────────────────────────────────

function CenteredModal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const portalTarget = usePortalTarget();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`relative flex flex-col rounded-xl shadow-2xl w-[90vw] ${wide ? 'max-w-5xl' : 'max-w-3xl'} max-h-[85vh]`}
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--app-border)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
          <button onClick={onClose} className="hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-secondary)' }}>
            <X size={15} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2.5">
          {children}
        </div>
      </div>
    </div>,
    portalTarget,
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface WidgetFrameProps {
  config: WidgetConfig;
  editMode: boolean;
  onRemove: (id: string) => void;
  onConfigChange: (config: WidgetConfig) => void;
}

// Dropdown als Portal – rendert außerhalb des Grid-Containers
function PortalDropdown({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const portalTarget = usePortalTarget();
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Step 1: position panel offscreen so we can measure it
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.right });
    }
  }, [anchorRef]);

  // Step 2: after render, clamp so panel stays within viewport
  useEffect(() => {
    if (!pos || !panelRef.current || !anchorRef.current) return;
    const panel = panelRef.current.getBoundingClientRect();
    const anchor = anchorRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const GAP = 4;

    // Horizontal: default is right-aligned to anchor (left = anchor.right - panel.width)
    let left = anchor.right - panel.width;
    if (left < GAP) left = GAP;                               // clamp left edge
    if (left + panel.width > vw - GAP) left = vw - GAP - panel.width; // clamp right edge

    // Vertical: default below anchor; if not enough room, open above
    let top = anchor.bottom + GAP;
    if (top + panel.height > vh - GAP) {
      top = anchor.top - panel.height - GAP;
    }
    if (top < GAP) top = GAP;

    setPos({ top, left });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos?.top, pos?.left]);  // run once after initial position is set

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[9999] rounded-lg shadow-2xl"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        visibility: pos ? 'visible' : 'hidden',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    portalTarget,
  );
}

// ── Weather config sub-component (needs local state for geocoding) ──────────
interface WeatherConfigSectionProps {
  o: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
  onOpenPicker: () => void;
}
function WeatherConfigSection({ o, set, onOpenPicker }: WeatherConfigSectionProps) {
  const t = useT();
  const [addressInput, setAddressInput] = useState('');
  const [geocoding,    setGeocoding]    = useState(false);
  const [geoError,     setGeoError]     = useState('');

  const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
  const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

  const geocodeAddress = async () => {
    if (!addressInput.trim()) return;
    setGeocoding(true);
    setGeoError('');
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(addressInput.trim())}&count=1&language=de&format=json`,
      );
      const json = await res.json() as { results?: { latitude: number; longitude: number; name: string; admin1?: string }[] };
      if (json.results?.[0]) {
        const r = json.results[0];
        set({
          latitude:     r.latitude,
          longitude:    r.longitude,
          locationName: r.admin1 ? `${r.name}, ${r.admin1}` : r.name,
        });
        setAddressInput('');
      } else {
        setGeoError(t('wf.weather.notFound'));
      }
    } catch {
      setGeoError(t('wf.weather.searchError'));
    } finally {
      setGeocoding(false);
    }
  };

  const showWeather  = (o.showWeather  as boolean) ?? true;
  const showForecast = (o.showForecast as boolean) ?? true;
  const showToday    = (o.showToday    as boolean) ?? true;
  const showWarnings = (o.showWarnings as boolean) ?? false;

  return (
    <>
      {/* ── Display toggles ── */}
      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.showWeather')}</label>
        <button onClick={() => set({ showWeather: !showWeather })}
          className="relative w-9 h-5 rounded-full transition-colors shrink-0"
          style={{ background: showWeather ? 'var(--accent)' : 'var(--app-border)' }}>
          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
            style={{ left: showWeather ? '18px' : '2px' }} />
        </button>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.showWarnings')}</label>
          <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>{t('wf.weather.warningsHint')}</p>
        </div>
        <button onClick={() => set({ showWarnings: !showWarnings })}
          className="relative w-9 h-5 rounded-full transition-colors shrink-0 ml-2"
          style={{ background: showWarnings ? 'var(--accent)' : 'var(--app-border)' }}>
          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
            style={{ left: showWarnings ? '18px' : '2px' }} />
        </button>
      </div>

      {/* ── Local temperature sensor ── */}
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.localTemp')}</label>
        <div className="flex gap-1.5">
          <input type="text" value={(o.localTempDatapoint as string) ?? ''}
            onChange={(e) => set({ localTempDatapoint: e.target.value || undefined })}
            placeholder={t('wf.weather.localTempPh')} className={iCls + ' flex-1 font-mono'} style={iSty} />
          <button
            onClick={onOpenPicker}
            className="text-xs px-2.5 rounded-lg shrink-0"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
          >…</button>
        </div>
        {(o.localTempDatapoint as string) && (
          <button onClick={() => set({ localTempDatapoint: undefined })}
            className="text-[10px] mt-0.5 hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}>✕ entfernen</button>
        )}
      </div>

      <hr style={{ borderColor: 'var(--app-border)' }} />

      {/* ── Location ── */}
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.locationSearch')}</label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); geocodeAddress(); } }}
            placeholder={t('wf.weather.cityPlaceholder')}
            className={iCls + ' flex-1'}
            style={iSty}
          />
          <button
            onClick={geocodeAddress}
            disabled={geocoding || !addressInput.trim()}
            className="text-xs px-2.5 rounded-lg shrink-0"
            style={{ background: 'var(--accent)', color: '#fff', opacity: (geocoding || !addressInput.trim()) ? 0.5 : 1 }}
          >
            {geocoding ? t('wf.weather.searching') : t('wf.weather.search')}
          </button>
        </div>
        {geoError && <p className="text-[10px] mt-1" style={{ color: '#ef4444' }}>{geoError}</p>}
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.latitude')}</label>
          <input type="number" step={0.0001} value={(o.latitude as number) ?? 48.1}
            onChange={(e) => set({ latitude: Number(e.target.value) })} className={iCls} style={iSty} />
        </div>
        <div className="flex-1">
          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.longitude')}</label>
          <input type="number" step={0.0001} value={(o.longitude as number) ?? 11.6}
            onChange={(e) => set({ longitude: Number(e.target.value) })} className={iCls} style={iSty} />
        </div>
      </div>
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.locationName')}</label>
        <input type="text" value={(o.locationName as string) ?? ''}
          onChange={(e) => set({ locationName: e.target.value || undefined })}
          placeholder={t('wf.weather.locationPh')} className={iCls} style={iSty} />
      </div>
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.refreshMin')}</label>
        <input type="number" min={5} max={1440} value={(o.refreshMinutes as number) ?? 30}
          onChange={(e) => set({ refreshMinutes: Number(e.target.value) })} className={iCls} style={iSty} />
      </div>
      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.showForecast')}</label>
        <button onClick={() => set({ showForecast: !showForecast })}
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{ background: showForecast ? 'var(--accent)' : 'var(--app-border)' }}>
          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
            style={{ left: showForecast ? '18px' : '2px' }} />
        </button>
      </div>
      {showForecast && (
        <>
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.forecastDays')}</label>
            <input type="number" min={1} max={7} value={(o.forecastDays as number) ?? 5}
              onChange={(e) => set({ forecastDays: Number(e.target.value) })} className={iCls} style={iSty} />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.showToday')}</label>
            <button onClick={() => set({ showToday: !showToday })}
              className="relative w-9 h-5 rounded-full transition-colors"
              style={{ background: showToday ? 'var(--accent)' : 'var(--app-border)' }}>
              <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                style={{ left: showToday ? '18px' : '2px' }} />
            </button>
          </div>
        </>
      )}
    </>
  );
}

function formatLastChange(ts: number): string {
  const diffSec = Math.round((Date.now() - ts) / 1000);

  if (diffSec < 10)  return t('lc.lessThan10s');
  if (diffSec < 20)  return t('lc.lessThan20s');
  if (diffSec < 30)  return t('lc.lessThan30s');
  if (diffSec < 45)  return t('lc.halfMinute');
  if (diffSec < 90)  return t('lc.lessThan1Min');

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 45)  return diffMin === 1 ? t('lc.1Min') : t('lc.nMin', { n: diffMin });

  const diffHour = Math.round(diffSec / 3_600);
  if (diffHour < 24) return diffHour === 1 ? t('lc.1Hour') : t('lc.nHours', { n: diffHour });

  const diffDay = Math.round(diffSec / 86_400);
  if (diffDay < 30)  return diffDay === 1 ? t('lc.1Day') : t('lc.nDays', { n: diffDay });

  const diffMonth = Math.round(diffDay / 30);
  if (diffMonth < 12) return diffMonth === 1 ? t('lc.1Month') : t('lc.nMonths', { n: diffMonth });

  const diffYear = Math.round(diffDay / 365);
  return diffYear === 1 ? t('lc.1Year') : t('lc.nYears', { n: diffYear });
}

export function WidgetFrame({ config, editMode, onRemove, onConfigChange }: WidgetFrameProps) {
  const t = useT();
  const [openPanel, setOpenPanel] = useState<'menu' | 'edit' | 'conditions' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const { addWidgetToLayoutTab, removeWidgetFromLayoutTab, layouts, activeLayoutId } = useDashboardStore();
  const { activeTabId } = useActiveLayout();
  // All layout→tab combos except the current tab
  const moveTargets = layouts.flatMap((l) =>
    l.tabs
      .filter((t) => !(l.id === activeLayoutId && t.id === activeTabId))
      .map((t) => ({ layoutId: l.id, layoutName: l.name, tabId: t.id, tabName: t.name })),
  );

  // Stable reference: never create a new [] on every render (would cause infinite effect loop)
  const conditions = (config.options?.conditions as WidgetCondition[] | undefined) ?? NO_CONDITIONS;

  // Evaluate conditions against live ioBroker values
  const conditionResult = useConditionStyle(conditions);

  // Register/release this widget in the panel coordinator
  useEffect(() => {
    return () => {
      releasePanel(config.id);
      cleanupHiddenState(config.id); // ensure registry is clean on unmount
    };
  }, [config.id]);

  // Keep the reflow-hidden registry in sync (only when not in edit mode).
  // useLayoutEffect fires synchronously before paint → no single-frame flicker.
  useLayoutEffect(() => {
    notifyHiddenState(config.id, !editMode && conditionResult.hidden, conditionResult.reflow);
  }, [config.id, editMode, conditionResult.hidden, conditionResult.reflow]);

  const openPanelFor = (panel: typeof openPanel) => {
    if (panel === null) {
      setOpenPanel(null);
      setShowMoveMenu(false);
      setShowCopyMenu(false);
      releasePanel(config.id);
    } else {
      claimPanel(config.id, () => setOpenPanel(null));
      setOpenPanel(panel);
    }
  };
  const [pickerTarget, setPickerTarget] = useState<'datapoint' | 'actualDatapoint' | 'localTempDatapoint' | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const Widget = getWidgetMap()[config.type];
  const currentLayout = config.layout ?? 'default';
  const overrides = config.options?.styleOverride as Record<string, string> | undefined;

  // Last-change timestamp overlay
  const showLastChange = !!(config.options?.showLastChange);
  const lastChangePos  = (config.options?.lastChangePosition as string | undefined) ?? 'left';
  const [lastChangedTs, setLastChangedTs] = useState<number>(0);
  const [, forceRedraw] = useState(0);

  useEffect(() => {
    const id = (config.options?.lastChangeDatapoint as string | undefined) || config.datapoint;
    if (!id) return;

    getStateDirect(id).then((s) => {
      if (s) setLastChangedTs(s.lc > 0 ? s.lc : s.ts);
    });

    return subscribeStateDirect(id, (s) => {
      setLastChangedTs(s.lc > 0 ? s.lc : s.ts);
    });
  }, [config.datapoint, config.options?.lastChangeDatapoint]);

  // Periodically redraw the relative-time string
  useEffect(() => {
    if (!showLastChange || lastChangedTs === 0) return;
    const iv = setInterval(() => forceRedraw((n) => n + 1), 10_000);
    return () => clearInterval(iv);
  }, [showLastChange, lastChangedTs]);

  const cssOverride = Object.fromEntries(
    Object.entries({
      // Static style overrides from options.styleOverride
      '--widget-bg':        overrides?.bg,
      '--widget-border':    overrides?.border,
      '--widget-radius':    overrides?.radius,
      '--text-primary':     overrides?.textPrimary,
      '--text-secondary':   overrides?.textSecondary,
      '--accent':           overrides?.accent,
      // Condition-driven overrides (higher priority, applied on top)
      ...conditionResult.cssVars,
    }).filter(([, v]) => v !== undefined && v !== ''),
  ) as React.CSSProperties;

  // Verhindert Drag bei Klick auf Controls
  const stopDrag = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();

  const isHeader    = config.type === 'header';
  const isGroup     = config.type === 'group';
  const isTransparent = !!(config.options?.transparent);

  return (
    <div
      style={isHeader || isTransparent ? {
        background: 'transparent',
        borderRadius: isTransparent && editMode ? 'var(--widget-radius)' : 0,
        boxShadow: 'none',
        backdropFilter: 'none',
        borderWidth: isTransparent && editMode ? 1 : 0,
        borderStyle: 'dashed',
        borderColor: isTransparent && editMode ? 'var(--app-border)' : 'transparent',
        ...cssOverride,
        // non-reflow hide: keep space but invisible
        ...(!editMode && conditionResult.hidden && !conditionResult.reflow
          ? { visibility: 'hidden', pointerEvents: 'none' } : {}),
      } : {
        background: 'var(--widget-bg)',
        borderRadius: 'var(--widget-radius)',
        boxShadow: 'var(--widget-shadow)',
        backdropFilter: 'var(--widget-backdrop)',
        borderWidth: 'var(--widget-border-width)',
        borderStyle: 'solid',
        borderColor: 'var(--widget-border)',
        ...cssOverride,
        ...(!editMode && conditionResult.hidden && !conditionResult.reflow
          ? { visibility: 'hidden', pointerEvents: 'none' } : {}),
      }}
      className={`relative h-full transition-all overflow-visible ${isHeader ? 'px-2 py-0' : (isGroup || isTransparent || config.type === 'iframe') ? 'p-0' : 'p-4'} ${editMode ? 'ring-2 ring-accent/40 rounded-xl' : ''} ${!editMode && conditionResult.effect === 'pulse' ? 'animate-pulse' : ''} ${!editMode && conditionResult.effect === 'blink' ? 'animate-[blink_1s_step-end_infinite]' : ''}`}
    >
      {editMode && conditionResult.hidden && (
        <div className="nodrag absolute inset-0 z-20 rounded-[inherit] flex items-start justify-end pointer-events-none p-1.5">
          <div className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium opacity-70"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
            <EyeOff size={11} />
            {t('wf.menu.hidden')}
          </div>
        </div>
      )}

      {editMode && (
        <div
          className="nodrag absolute top-1.5 right-1.5 z-10"
          onMouseDown={stopDrag}
          onPointerDown={stopDrag}
        >
          <button
            ref={menuBtnRef}
            onClick={() => { openPanelFor(openPanel === 'menu' ? null : 'menu'); setConfirmDelete(false); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-opacity hover:opacity-80 relative"
            style={{
              background: openPanel ? 'var(--accent)' : 'var(--app-bg)',
              color: openPanel ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--app-border)',
            }}
            title={t('wf.menu.options')}
          >
            <ChevronDown size={13} />
            {conditions.length > 0 && !openPanel && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
            )}
          </button>
        </div>
      )}

      {editMode && currentLayout !== 'default' && (
        <div className="nodrag absolute bottom-1.5 left-2 text-[10px] pointer-events-none opacity-40" style={{ color: 'var(--text-secondary)' }}>
          {currentLayout}
        </div>
      )}

      <Widget
        config={config.options?.hideTitle ? { ...config, title: '' } : config}
        editMode={editMode}
        onConfigChange={onConfigChange}
      />

      {/* Last-change timestamp overlay */}
      {showLastChange && lastChangedTs > 0 && (() => {
        const text = formatLastChange(lastChangedTs);
        const posStyle: React.CSSProperties =
          lastChangePos === 'center'
            ? { position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }
            : lastChangePos === 'right'
              ? { position: 'absolute', bottom: 6, right: 8 }
              : { position: 'absolute', bottom: 6, left: 8 };
        return (
          <div
            className="nodrag pointer-events-none text-[8px] opacity-50 whitespace-nowrap"
            style={{ ...posStyle, color: 'var(--text-secondary)' }}
          >
            {text}
          </div>
        );
      })()}

      {/* Options Menu Dropdown */}
      {openPanel === 'menu' && menuBtnRef.current && (
        <PortalDropdown anchorRef={menuBtnRef as React.RefObject<HTMLElement>} onClose={() => openPanelFor(null)}>
          <div className="p-1 flex flex-col gap-0.5 min-w-[170px]">
            {/* Bearbeiten */}
            <button
              onClick={() => { openPanelFor('edit'); setConfirmDelete(false); }}
              className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
            >
              <Pencil size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              {t('wf.menu.edit')}
            </button>

            {/* Bedingungen */}
            <button
              onClick={() => { openPanelFor('conditions'); setConfirmDelete(false); }}
              className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
            >
              <Sparkles size={13} style={{ color: conditions.length > 0 ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }} />
              {t('wf.menu.conditions')}
              {conditions.length > 0 && (
                <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent)22', color: 'var(--accent)' }}>
                  {conditions.length}
                </span>
              )}
            </button>

            {/* Exportieren */}
            <button
              onClick={() => { exportWidget(config); openPanelFor(null); }}
              className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
            >
              <Download size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              {t('wf.menu.export')}
            </button>

            {/* Kopieren */}
            <button
              onClick={() => {
                if (moveTargets.length === 0) {
                  // No other tabs – duplicate directly on same tab
                  addWidgetToLayoutTab(activeLayoutId, activeTabId, {
                    ...config,
                    id: `${config.type}-${Date.now()}`,
                    gridPos: { ...config.gridPos, y: Infinity },
                  });
                  openPanelFor(null);
                } else {
                  setShowCopyMenu((v) => !v);
                  setShowMoveMenu(false);
                }
              }}
              className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
            >
              <Copy size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              {t('wf.menu.copy')}
              {moveTargets.length > 0 && (
                <ChevronDown size={11} className="ml-auto transition-transform" style={{ color: 'var(--text-secondary)', transform: showCopyMenu ? 'rotate(180deg)' : 'none' }} />
              )}
            </button>
            {showCopyMenu && moveTargets.length > 0 && (
              <div className="mx-1 mb-0.5 rounded-md overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                {/* Same tab: duplicate */}
                <button
                  onClick={() => {
                    addWidgetToLayoutTab(activeLayoutId, activeTabId, {
                      ...config,
                      id: `${config.type}-${Date.now()}`,
                      gridPos: { ...config.gridPos, y: Infinity },
                    });
                    openPanelFor(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80 transition-opacity"
                  style={{ background: 'var(--app-bg)', color: 'var(--accent)', display: 'block', borderBottom: '1px solid var(--app-border)', fontWeight: 500 }}
                >
                  {t('wf.menu.copyHere')}
                </button>
                {/* Other tabs */}
                {layouts.map((layout) => {
                  const targets = moveTargets.filter((m) => m.layoutId === layout.id);
                  if (targets.length === 0) return null;
                  return (
                    <div key={layout.id}>
                      {layouts.length > 1 && (
                        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider"
                          style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--app-border)' }}>
                          {layout.name}
                        </p>
                      )}
                      {targets.map((m) => (
                        <button
                          key={m.tabId}
                          onClick={() => {
                            addWidgetToLayoutTab(m.layoutId, m.tabId, {
                              ...config,
                              id: `${config.type}-${Date.now()}`,
                              gridPos: { ...config.gridPos, y: Infinity },
                            });
                            openPanelFor(null);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80 transition-opacity"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', display: 'block', borderBottom: '1px solid var(--app-border)' }}
                        >
                          {m.tabName}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Verschieben */}
            {moveTargets.length > 0 && (
              <>
                <button
                  onClick={() => setShowMoveMenu((v) => !v)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <ArrowRightLeft size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  {t('wf.menu.move')}
                  <ChevronDown size={11} className="ml-auto transition-transform" style={{ color: 'var(--text-secondary)', transform: showMoveMenu ? 'rotate(180deg)' : 'none' }} />
                </button>
                {showMoveMenu && (
                  <div className="mx-1 mb-0.5 rounded-md overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    {layouts.map((layout) => {
                      const targets = moveTargets.filter((m) => m.layoutId === layout.id);
                      if (targets.length === 0) return null;
                      return (
                        <div key={layout.id}>
                          {layouts.length > 1 && (
                            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider"
                              style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--app-border)' }}>
                              {layout.name}
                            </p>
                          )}
                          {targets.map((m) => (
                            <button
                              key={m.tabId}
                              onClick={() => {
                                addWidgetToLayoutTab(m.layoutId, m.tabId, { ...config, gridPos: { ...config.gridPos, y: Infinity } });
                                removeWidgetFromLayoutTab(activeLayoutId, activeTabId, config.id);
                                openPanelFor(null);
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80 transition-opacity"
                              style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', display: 'block', borderBottom: '1px solid var(--app-border)' }}
                            >
                              {m.tabName}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            <div className="h-px my-0.5 mx-1" style={{ background: 'var(--app-border)' }} />

            {/* Löschen */}
            {confirmDelete ? (
              <div className="flex gap-1 px-1 pb-1">
                <button
                  onClick={() => onRemove(config.id)}
                  className="flex-1 text-xs py-1.5 rounded-md text-white hover:opacity-80"
                  style={{ background: 'var(--accent-red)' }}
                >
                  {t('wf.menu.confirm')}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 text-xs py-1.5 rounded-md hover:opacity-80"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity"
                style={{ color: 'var(--accent-red, #ef4444)' }}
              >
                <X size={13} style={{ flexShrink: 0 }} />
                {t('wf.menu.delete')}
              </button>
            )}
          </div>
        </PortalDropdown>
      )}

      {/* Edit Modal */}
      {openPanel === 'edit' && (
        <CenteredModal
          title={t('wf.edit.title')}
          wide={config.type === 'echart' || config.type === 'autolist' || config.type === 'trash'}
          onClose={() => openPanelFor(null)}
        >
          {/* ─── 1. Name / Titel ──────────────────────────────────────────── */}
          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.name')}</label>
              <input
                type="text"
                value={config.title}
                onChange={(e) => onConfigChange({ ...config, title: e.target.value })}
                className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.hideName')}</label>
              <button
                onClick={() => onConfigChange({ ...config, options: { ...(config.options ?? {}), hideTitle: !(config.options?.hideTitle) } })}
                className="relative w-9 h-5 rounded-full transition-colors"
                style={{ background: config.options?.hideTitle ? 'var(--accent)' : 'var(--app-border)' }}
              >
                <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  style={{ left: config.options?.hideTitle ? '18px' : '2px' }} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.showLastChange')}</label>
              <button
                onClick={() => onConfigChange({ ...config, options: { ...(config.options ?? {}), showLastChange: !showLastChange } })}
                className="relative w-9 h-5 rounded-full transition-colors"
                style={{ background: showLastChange ? 'var(--accent)' : 'var(--app-border)' }}
              >
                <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  style={{ left: showLastChange ? '18px' : '2px' }} />
              </button>
            </div>
            {showLastChange && (
              <div className="flex items-center gap-2">
                <label className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.position')}</label>
                <div className="flex gap-1">
                  {(['left', 'center', 'right'] as const).map((p) => {
                    const labels: Record<string, string> = { left: t('wf.edit.posLeft'), center: t('wf.edit.posCenter'), right: t('wf.edit.posRight') };
                    const active = lastChangePos === p;
                    return (
                      <button key={p}
                        onClick={() => onConfigChange({ ...config, options: { ...(config.options ?? {}), lastChangePosition: p } })}
                        className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                        style={{
                          background: active ? 'var(--accent)' : 'var(--app-bg)',
                          color:      active ? '#fff' : 'var(--text-secondary)',
                          border:     `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                        }}>
                        {labels[p]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {showLastChange && !config.datapoint && (
              <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                  Datenpunkt <span style={{ opacity: 0.6 }}>(für Zeitstempel, da kein Haupt-Datenpunkt)</span>
                </label>
                <input type="text"
                  value={(config.options?.lastChangeDatapoint as string) ?? ''}
                  onChange={(e) => onConfigChange({ ...config, options: { ...(config.options ?? {}), lastChangeDatapoint: e.target.value || undefined } })}
                  placeholder="z.B. evcc.0.status.pvPower"
                  className="w-full text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Transparenz-Modus</label>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Hintergrund, Rahmen und Schatten entfernen</p>
              </div>
              <button
                onClick={() => onConfigChange({ ...config, options: { ...(config.options ?? {}), transparent: !(config.options?.transparent) } })}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{ background: config.options?.transparent ? 'var(--accent)' : 'var(--app-border)' }}
              >
                <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  style={{ left: config.options?.transparent ? '18px' : '2px' }} />
              </button>
            </div>
          </div>

          <div className="h-px" style={{ background: 'var(--app-border)' }} />

          {/* ─── 2. Stil (eingeklappt) ─────────────────────────────────────── */}
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer list-none select-none">
              <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.style')}</span>
              <div className="flex items-center gap-2">
                {overrides && Object.keys(overrides).length > 0 && (
                  <button
                    onClick={(e) => { e.preventDefault(); const { styleOverride: _, ...rest } = config.options ?? {}; onConfigChange({ ...config, options: rest }); }}
                    className="text-[10px] hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {t('wf.edit.styleReset')}
                  </button>
                )}
                <ChevronDown size={13} className="transition-transform group-open:rotate-180" style={{ color: 'var(--text-secondary)' }} />
              </div>
            </summary>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2.5">
              {STYLE_FIELDS.map(({ key, labelKey, type }) => (
                <div key={key}>
                  <label className="text-[10px] block mb-0.5" style={{ color: 'var(--text-secondary)' }}>{t(labelKey as Parameters<typeof t>[0])}</label>
                  {type === 'color' ? (
                    <div className="flex gap-1">
                      <input type="color" value={overrides?.[key] ?? '#3b82f6'}
                        onChange={(e) => onConfigChange({ ...config, options: { ...config.options, styleOverride: { ...overrides, [key]: e.target.value } } })}
                        className="w-6 h-[26px] rounded cursor-pointer border-0 p-0 shrink-0" />
                      <input type="text" value={overrides?.[key] ?? ''}
                        onChange={(e) => { const val = e.target.value; const next = { ...overrides, [key]: val }; if (!val) delete next[key]; onConfigChange({ ...config, options: { ...config.options, styleOverride: Object.keys(next).length ? next : undefined } }); }}
                        placeholder="auto"
                        className="flex-1 text-[10px] rounded px-1.5 py-1 min-w-0 focus:outline-none font-mono"
                        style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
                    </div>
                  ) : (
                    <input type="text" value={overrides?.[key] ?? ''}
                      onChange={(e) => { const val = e.target.value; const next = { ...overrides, [key]: val }; if (!val) delete next[key]; onConfigChange({ ...config, options: { ...config.options, styleOverride: Object.keys(next).length ? next : undefined } }); }}
                      placeholder="auto"
                      className="w-full text-[10px] rounded px-1.5 py-1 focus:outline-none font-mono"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
                  )}
                </div>
              ))}
            </div>
          </details>

          <div className="h-px" style={{ background: 'var(--app-border)' }} />

          {/* ─── 3. Widget-Typ · Layout · Icon ─────────────────────────────── */}
          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.widgetType')}</label>
              <select
                value={config.type}
                onChange={(e) => onConfigChange({ ...config, type: e.target.value as WidgetConfig['type'] })}
                className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
              >
                {WIDGET_GROUPS.map((g) => (
                  <optgroup key={g.id} label={g.label}>
                    {WIDGET_REGISTRY.filter((m) => m.widgetGroup === g.id).map((m) => (
                      <option key={m.type} value={m.type}>{m.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Layout-Auswahl mit Live-Vorschau (non-header) */}
            {config.type !== 'header' && (() => {
              const activeLayout = config.layout ?? 'default';
              const layouts: { value: string; label: string }[] = [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'card',    label: t('wf.edit.layout.card') },
                { value: 'compact', label: t('wf.edit.layout.compact') },
                { value: 'minimal', label: t('wf.edit.layout.minimal') },
                ...(config.type === 'calendar' ? [{ value: 'agenda', label: t('wf.edit.layout.agenda') }] : []),
                ...(config.type === 'evcc' ? [
                  { value: 'flow',        label: 'Nur Fluss' },
                  { value: 'battery',     label: 'Nur Batterie' },
                  { value: 'production',  label: 'Nur Produktion' },
                  { value: 'consumption', label: 'Nur Verbrauch' },
                  { value: 'loadpoints',  label: 'Nur Ladepunkte' },
                ] : []),
              ];
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1 flex-wrap">
                    <label className="text-[11px] shrink-0 mr-0.5" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.layout')}</label>
                    {layouts.map(({ value, label }) => {
                      const active = activeLayout === value;
                      return (
                        <button
                          key={value}
                          onClick={() => onConfigChange({ ...config, layout: value as WidgetConfig['layout'] })}
                          className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                          style={{
                            background: active ? 'var(--accent)' : 'var(--app-bg)',
                            color:      active ? '#fff' : 'var(--text-secondary)',
                            border:     `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <WidgetPreview type={config.type} layout={config.layout} title={config.title} scale={1.1} />
                </div>
              );
            })()}

            {/* Header-spezifische Felder */}
            {config.type === 'header' && (() => {
              const o = config.options ?? {};
              const set = (patch: Record<string, unknown>) =>
                onConfigChange({ ...config, options: { ...o, ...patch } });
              return (
                <>
                  <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.header.subtitle')}</label>
                    <input
                      type="text"
                      value={(o.subtitle as string) ?? ''}
                      onChange={(e) => set({ subtitle: e.target.value || undefined })}
                      placeholder="z.B. Erdgeschoss"
                      className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.header.style')}</label>
                    <select
                      value={config.layout ?? 'default'}
                      onChange={(e) => onConfigChange({ ...config, layout: e.target.value as WidgetConfig['layout'] })}
                      className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                    >
                      <option value="default">{t('wf.edit.header.default')}</option>
                      <option value="compact">{t('wf.edit.header.compact')}</option>
                      <option value="minimal">{t('wf.edit.header.minimal')}</option>
                    </select>
                  </div>
                </>
              );
            })()}

            {/* Icon picker */}
            <div>
              <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.icon')}</label>
              <div className="flex flex-wrap gap-1">
                {ICON_PICKER_ENTRIES.map(([name, Icon]) => {
                  const selected = (config.options?.icon ?? '') === name;
                  return (
                    <button
                      key={name}
                      title={name}
                      onClick={() => onConfigChange({ ...config, options: { ...(config.options ?? {}), icon: name } })}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                      style={{
                        background: selected ? 'var(--accent)' : 'var(--app-bg)',
                        color:      selected ? '#fff' : 'var(--text-secondary)',
                        border:     `1px solid ${selected ? 'var(--accent)' : 'var(--app-border)'}`,
                      }}
                    >
                      <Icon size={13} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="h-px" style={{ background: 'var(--app-border)' }} />

          {/* ─── 4. Widget-spezifische Einstellungen ───────────────────────── */}
          <div className="space-y-2.5">
              {config.type === 'clock' && (() => {
                const o = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const display = (o.display as string) ?? 'time';
                const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
                const inputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                return (
                  <>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.clock.display')}</label>
                      <select value={display} onChange={(e) => set({ display: e.target.value })} className={inputCls} style={inputStyle}>
                        <option value="time">{t('wf.clock.timeOnly')}</option>
                        <option value="datetime">{t('wf.clock.datetime')}</option>
                        <option value="date">{t('wf.clock.dateOnly')}</option>
                      </select>
                    </div>
                    {display !== 'date' && (
                      <div className="flex items-center justify-between">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.clock.showSeconds')}</label>
                        <button
                          onClick={() => set({ showSeconds: !o.showSeconds })}
                          className="relative w-9 h-5 rounded-full transition-colors"
                          style={{ background: o.showSeconds ? 'var(--accent)' : 'var(--app-border)' }}
                        >
                          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                            style={{ left: o.showSeconds ? '18px' : '2px' }} />
                        </button>
                      </div>
                    )}
                    {display !== 'time' && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.clock.dateFormat')}</label>
                        <select value={(o.dateLength as string) ?? 'short'} onChange={(e) => set({ dateLength: e.target.value })} className={inputCls} style={inputStyle}>
                          <option value="short">{t('wf.clock.short')}</option>
                          <option value="long">{t('wf.clock.long')}</option>
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.clock.customFormat')}</label>
                      <input
                        type="text"
                        value={(o.customFormat as string) ?? ''}
                        onChange={(e) => set({ customFormat: e.target.value || undefined })}
                        placeholder="z.B. dd.MM.yyyy HH:mm"
                        className={inputCls + ' font-mono'}
                        style={inputStyle}
                      />
                      <p className="text-[10px] mt-1 leading-tight" style={{ color: 'var(--text-secondary)' }}>
                        Tokens: HH mm ss dd MM yyyy EE EEEE MMMM
                      </p>
                    </div>
                  </>
                );
              })()}

              {config.type === 'calendar' && (
                <CalendarEditPanel config={config} onConfigChange={onConfigChange} />
              )}

              {config.type !== 'list' && config.type !== 'clock' && config.type !== 'calendar' && config.type !== 'header' && config.type !== 'group' && config.type !== 'evcc' && config.type !== 'echart' && config.type !== 'weather' && config.type !== 'camera' && config.type !== 'autolist' && config.type !== 'image' && config.type !== 'iframe' && config.type !== 'trash' && (
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.datapointId')}</label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={config.datapoint}
                      onChange={(e) => onConfigChange({ ...config, datapoint: e.target.value })}
                      className="flex-1 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none min-w-0"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                    />
                    <button
                      onClick={() => setPickerTarget('datapoint')}
                      className="px-2 rounded-lg hover:opacity-80 shrink-0"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                      title={t('wf.edit.fromIoBroker')}
                    >
                      <Database size={13} />
                    </button>
                  </div>
                </div>
              )}
              {(config.type === 'value' || config.type === 'chart') && (
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.unit')}</label>
                  <input
                    type="text"
                    value={(config.options?.unit as string) ?? ''}
                    onChange={(e) => onConfigChange({ ...config, options: { ...config.options, unit: e.target.value || undefined } })}
                    placeholder="z.B. °C, %, W"
                    className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                  />
                </div>
              )}
              {config.type === 'chart' && (
                <ChartHistoryConfig config={config} onConfigChange={onConfigChange} />
              )}
              {config.type === 'echart' && (
                <EChartConfig config={config} onConfigChange={onConfigChange} />
              )}
              {config.type === 'evcc' && (
                <EvccConfig config={config} onConfigChange={onConfigChange} />
              )}

              {/* ── Gauge config ── */}
              {config.type === 'gauge' && (() => {
                const o   = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const min        = (o.minValue   as number)  ?? 0;
                const max        = (o.maxValue   as number)  ?? 100;
                const colorZones = (o.colorZones as boolean) ?? false;
                const range      = max - min;
                const gCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
                const gSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                const dynamicMax = !!(o.dynamicMax);
                const sectionHdr = (label: string) => (
                  <div className="text-[10px] font-semibold uppercase tracking-wider pt-1" style={{ color: 'var(--text-secondary)' }}>{label}</div>
                );
                return (
                  <>
                    {sectionHdr('Skala')}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Min</label>
                        <input type="number" value={min} onChange={(e) => set({ minValue: Number(e.target.value) })} className={gCls} style={gSty} />
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Max</label>
                        <input type="number" value={max} onChange={(e) => set({ maxValue: Number(e.target.value) })} className={gCls} style={gSty} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Einheit</label>
                        <input type="text" value={(o.unit as string) ?? ''} onChange={(e) => set({ unit: e.target.value || undefined })} placeholder="°C, %, W" className={gCls} style={gSty} />
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Dezimalstellen</label>
                        <input type="number" min={0} max={4} value={(o.decimals as number) ?? 1} onChange={(e) => set({ decimals: Number(e.target.value) })} className={gCls} style={gSty} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Bogenbreite</label>
                        <input type="number" min={1} max={30} value={(o.strokeWidth as number) ?? 12} onChange={(e) => set({ strokeWidth: Number(e.target.value) })} className={gCls} style={gSty} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Dynamisches Maximum</label>
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Max auf aktuellen Wert ausweiten</p>
                      </div>
                      <button onClick={() => set({ dynamicMax: !dynamicMax })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: dynamicMax ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: dynamicMax ? '18px' : '2px' }} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Min/Max anzeigen</label>
                      <button onClick={() => set({ showMinMax: !(o.showMinMax ?? true) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (o.showMinMax ?? true) ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.showMinMax ?? true) ? '18px' : '2px' }} />
                      </button>
                    </div>

                    {sectionHdr('Farbzonen')}
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Farbzonen aktiv</label>
                      <button onClick={() => set({ colorZones: !colorZones })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: colorZones ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: colorZones ? '18px' : '2px' }} />
                      </button>
                    </div>
                    {colorZones && (() => {
                      // Build zones with fallback from legacy zone1Max/zone2Max props
                      type CZ = { max: number; color: string };
                      const rawZones = o.zones as CZ[] | undefined;
                      const zones: CZ[] = (rawZones && rawZones.length > 0) ? rawZones : [
                        { max: (o.zone1Max as number) ?? min + range * 0.33, color: (o.zone1Color as string) ?? '#10b981' },
                        { max: (o.zone2Max as number) ?? min + range * 0.66, color: (o.zone2Color as string) ?? '#f59e0b' },
                        { max: max,                                           color: (o.zone3Color as string) ?? '#ef4444' },
                      ];
                      const setZones = (z: CZ[]) => set({ zones: z, zone1Max: undefined, zone2Max: undefined, zone1Color: undefined, zone2Color: undefined, zone3Color: undefined });
                      const updateZone = (i: number, patch: Partial<CZ>) => setZones(zones.map((z, idx) => idx === i ? { ...z, ...patch } : z));
                      const removeZone = (i: number) => { if (zones.length > 1) setZones(zones.filter((_, idx) => idx !== i)); };
                      const addZone = () => {
                        const insertBefore = zones.length - 1;
                        const prevMax = insertBefore > 0 ? zones[insertBefore - 1].max : min;
                        const nextMax = zones[insertBefore].max;
                        const newMax  = Math.round((prevMax + nextMax) / 2);
                        const newZones = [...zones];
                        newZones.splice(insertBefore, 0, { max: newMax, color: '#6366f1' });
                        setZones(newZones);
                      };
                      return (
                        <div className="space-y-2">
                          {zones.map((zone, i) => {
                            const isLast = i === zones.length - 1;
                            return (
                              <div key={i} className="flex items-center gap-2">
                                <button onClick={() => removeZone(i)}
                                  className="text-[11px] w-5 h-5 flex items-center justify-center rounded shrink-0 transition-opacity"
                                  style={{ color: 'var(--text-secondary)', background: 'var(--app-bg)', border: '1px solid var(--app-border)', opacity: zones.length <= 1 ? 0.3 : 1 }}>×</button>
                                <input type="color" value={zone.color}
                                  onChange={(e) => updateZone(i, { color: e.target.value })}
                                  className="w-8 h-7 rounded cursor-pointer shrink-0" style={{ border: '1px solid var(--app-border)', padding: '1px' }} />
                                <div className="flex-1">
                                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    Zone {i + 1} {isLast ? '(Rest)' : 'bis'}
                                  </label>
                                  {isLast ? (
                                    <div className="text-[10px] py-2 px-2.5 rounded-lg" style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                                      bis {max}
                                    </div>
                                  ) : (
                                    <input type="number" value={zone.max}
                                      onChange={(e) => updateZone(i, { max: Number(e.target.value) })}
                                      className={gCls} style={gSty} />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          <button onClick={addZone}
                            className="w-full text-[11px] py-1.5 rounded-lg transition-colors hover:opacity-80"
                            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                            + Zone hinzufügen
                          </button>
                        </div>
                      );
                    })()}

                    {sectionHdr('Zeiger')}
                    {/* Pointer 1 (primary) */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Zeiger 1 – Datenpunkt</label>
                      <div className="text-[10px] py-2 px-2.5 rounded-lg font-mono truncate" style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                        {config.datapoint || '–'}
                      </div>
                    </div>
                    {!colorZones && (
                      <div className="flex items-center gap-2">
                        <input type="color" value={(o.pointer1Color as string) ?? '#6366f1'}
                          onChange={(e) => set({ pointer1Color: e.target.value })}
                          className="w-8 h-7 rounded cursor-pointer shrink-0" style={{ border: '1px solid var(--app-border)', padding: '1px' }} />
                        <div className="flex-1">
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Zeiger 1 – Farbe</label>
                          <input type="text" value={(o.pointer1Label as string) ?? ''} onChange={(e) => set({ pointer1Label: e.target.value || undefined })}
                            placeholder="Bezeichnung (optional)" className={gCls} style={gSty} />
                        </div>
                      </div>
                    )}
                    {/* Pointer 2 */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Zeiger 2 – Datenpunkt</label>
                      <input type="text" value={(o.pointer2Datapoint as string) ?? ''} onChange={(e) => set({ pointer2Datapoint: e.target.value || undefined })}
                        placeholder="Datenpunkt-ID (leer = deaktiviert)" className={gCls + ' font-mono'} style={gSty} />
                    </div>
                    {(o.pointer2Datapoint as string) && (
                      <div className="flex items-center gap-2">
                        <input type="color" value={(o.pointer2Color as string) ?? '#f97316'}
                          onChange={(e) => set({ pointer2Color: e.target.value })}
                          className="w-8 h-7 rounded cursor-pointer shrink-0" style={{ border: '1px solid var(--app-border)', padding: '1px' }} />
                        <div className="flex-1">
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Zeiger 2 – Bezeichnung</label>
                          <input type="text" value={(o.pointer2Label as string) ?? ''} onChange={(e) => set({ pointer2Label: e.target.value || undefined })}
                            placeholder="z.B. Außen" className={gCls} style={gSty} />
                        </div>
                      </div>
                    )}
                    {/* Pointer 3 */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Zeiger 3 – Datenpunkt</label>
                      <input type="text" value={(o.pointer3Datapoint as string) ?? ''} onChange={(e) => set({ pointer3Datapoint: e.target.value || undefined })}
                        placeholder="Datenpunkt-ID (leer = deaktiviert)" className={gCls + ' font-mono'} style={gSty} />
                    </div>
                    {(o.pointer3Datapoint as string) && (
                      <div className="flex items-center gap-2">
                        <input type="color" value={(o.pointer3Color as string) ?? '#8b5cf6'}
                          onChange={(e) => set({ pointer3Color: e.target.value })}
                          className="w-8 h-7 rounded cursor-pointer shrink-0" style={{ border: '1px solid var(--app-border)', padding: '1px' }} />
                        <div className="flex-1">
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Zeiger 3 – Bezeichnung</label>
                          <input type="text" value={(o.pointer3Label as string) ?? ''} onChange={(e) => set({ pointer3Label: e.target.value || undefined })}
                            placeholder="z.B. Keller" className={gCls} style={gSty} />
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* ── Weather config ── */}
              {config.type === 'weather' && (() => {
                const o   = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                return <WeatherConfigSection o={o} set={set} onOpenPicker={() => setPickerTarget('localTempDatapoint')} />;
              })()}

              {/* ── Camera config ── */}
              {config.type === 'camera' && (() => {
                const o   = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const cCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
                const cSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                const fitMode = (o.fitMode as string) ?? 'cover';
                return (
                  <>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Stream-URL</label>
                      <input type="url" value={(o.streamUrl as string) ?? ''} onChange={(e) => set({ streamUrl: e.target.value || undefined })} placeholder="http://…/stream.mjpg" className={cCls + ' font-mono'} style={cSty} />
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Aktualisierung (Sek., 0 = MJPEG)</label>
                      <input type="number" min={0} value={(o.refreshInterval as number) ?? 5} onChange={(e) => set({ refreshInterval: Number(e.target.value) })} className={cCls} style={cSty} />
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Bildanpassung</label>
                      <select value={fitMode} onChange={(e) => set({ fitMode: e.target.value })} className={cCls} style={cSty}>
                        <option value="cover">Cover (ausfüllen)</option>
                        <option value="contain">Contain (einpassen)</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Zeitstempel anzeigen</label>
                      <button onClick={() => set({ showTimestamp: !(o.showTimestamp ?? true) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (o.showTimestamp ?? true) ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.showTimestamp ?? true) ? '18px' : '2px' }} />
                      </button>
                    </div>
                  </>
                );
              })()}
              {/* ── Image config ── */}
              {config.type === 'image' && (() => {
                const o   = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
                const iSty: React.CSSProperties = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                const fit            = (o.fit             as string) ?? 'contain';
                const refreshSeconds = (o.refreshInterval as number) ?? 0;
                const imageUrl       = (o.imageUrl        as string) ?? '';
                const FIT_OPTIONS = [
                  { value: 'none',    label: 'Original' },
                  { value: 'contain', label: 'Einpassen' },
                  { value: 'width',   label: 'Breite' },
                  { value: 'height',  label: 'Höhe' },
                ];
                return (
                  <>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Bild-URL oder base64 <span style={{ opacity: 0.6 }}>(https://… · data:image/… · base64-String)</span>
                      </label>
                      <input type="text" value={imageUrl}
                        onChange={(e) => set({ imageUrl: e.target.value || undefined })}
                        placeholder="https://…/bild.jpg oder base64-String"
                        className={iCls + ' font-mono'} style={iSty} />
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Datenpunkt <span style={{ opacity: 0.6 }}>(base64 oder URL, überschreibt Bild-URL)</span>
                      </label>
                      <div className="flex gap-1">
                        <input type="text"
                          value={(o.imageDatapoint as string) ?? ''}
                          onChange={(e) => set({ imageDatapoint: e.target.value || undefined })}
                          placeholder="z.B. cameras.0.snapshot"
                          className={`flex-1 ${iCls} font-mono min-w-0`} style={iSty} />
                        <button
                          onClick={() => setPickerTarget('datapoint')}
                          className="px-2 rounded-lg hover:opacity-80 shrink-0"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                          title="Aus ioBroker wählen">
                          <Database size={13} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] mb-2 block" style={{ color: 'var(--text-secondary)' }}>Bildgröße</label>
                      <div className="flex gap-1">
                        {FIT_OPTIONS.map(({ value, label }) => (
                          <button key={value} onClick={() => set({ fit: value })}
                            className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
                            style={{
                              background: fit === value ? 'var(--accent)' : 'var(--app-bg)',
                              color: fit === value ? '#fff' : 'var(--text-secondary)',
                              border: `1px solid ${fit === value ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}>{label}</button>
                        ))}
                      </div>
                    </div>
                    {imageUrl && !imageUrl.startsWith('data:') && imageUrl.startsWith('http') && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                          Aktualisierungsintervall <span style={{ opacity: 0.6 }}>(Sek., 0 = kein)</span>
                        </label>
                        <input type="number" min={0} value={refreshSeconds}
                          onChange={(e) => set({ refreshInterval: Number(e.target.value) || undefined })}
                          className={iCls} style={iSty} />
                      </div>
                    )}
                  </>
                );
              })()}
              {/* ── AutoList config ── */}
              {config.type === 'autolist' && (
                <AutoListConfig config={config} onConfigChange={onConfigChange} />
              )}

              {/* ── iFrame config ── */}
              {config.type === 'iframe' && (() => {
                const o   = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono';
                const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                return (
                  <>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>URL</label>
                      <input type="text" value={(o.iframeUrl as string) ?? ''}
                        onChange={(e) => set({ iframeUrl: e.target.value || undefined })}
                        placeholder="https://…"
                        className={iCls} style={iSty} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Aufrechterhalten (kein Reload)</label>
                      <button onClick={() => set({ keepAlive: !(o.keepAlive ?? false) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (o.keepAlive ?? false) ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.keepAlive ?? false) ? '18px' : '2px' }} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Interaktion erlauben</label>
                      <button onClick={() => set({ allowInteraction: !(o.allowInteraction ?? true) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (o.allowInteraction ?? true) ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.allowInteraction ?? true) ? '18px' : '2px' }} />
                      </button>
                    </div>
                    {!(o.keepAlive ?? false) && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Aktualisierungsintervall (Sekunden, 0 = aus)</label>
                        <input type="number" min={0} value={(o.refreshInterval as number) ?? 0}
                          onChange={(e) => set({ refreshInterval: parseInt(e.target.value) || 0 })}
                          className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none" style={iSty} />
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Sandbox aktiv</label>
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Schränkt Berechtigungen des iFrames ein</p>
                      </div>
                      <button onClick={() => set({ sandbox: !(o.sandbox ?? false) })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: (o.sandbox ?? false) ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.sandbox ?? false) ? '18px' : '2px' }} />
                      </button>
                    </div>
                  </>
                );
              })()}

              {/* ── Fill / Tank config ── */}
              {config.type === 'fill' && (() => {
                const o   = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const min        = (o.minValue   as number)  ?? 0;
                const max        = (o.maxValue   as number)  ?? 100;
                const colorZones = (o.colorZones as boolean) ?? false;
                const range      = max - min;
                const fCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
                const fSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                const hdr = (label: string) => (
                  <div className="text-[10px] font-semibold uppercase tracking-wider pt-1" style={{ color: 'var(--text-secondary)' }}>{label}</div>
                );
                return (
                  <>
                    {hdr('Anzeige')}
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Orientierung</label>
                      <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                        {(['vertical', 'horizontal'] as const).map(v => (
                          <button key={v}
                            onClick={() => set({ orientation: v })}
                            className="px-3 py-1 text-[11px] transition-colors"
                            style={{
                              background: (o.orientation ?? 'vertical') === v ? 'var(--accent)' : 'var(--app-bg)',
                              color:      (o.orientation ?? 'vertical') === v ? '#fff' : 'var(--text-secondary)',
                            }}>
                            {v === 'vertical' ? 'Vertikal' : 'Horizontal'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Balkenbreite/-höhe <span style={{ opacity: 0.6 }}>(% des Widgets)</span>
                      </label>
                      <input type="number" min={20} max={100} value={(o.barSize as number) ?? 80}
                        onChange={(e) => set({ barSize: Number(e.target.value) })}
                        className={fCls} style={fSty} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Skala anzeigen</label>
                      <button onClick={() => set({ showTicks: !(o.showTicks ?? true) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (o.showTicks ?? true) ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.showTicks ?? true) ? '18px' : '2px' }} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Wert anzeigen</label>
                      <button onClick={() => set({ showValue: !(o.showValue ?? true) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (o.showValue ?? true) ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.showValue ?? true) ? '18px' : '2px' }} />
                      </button>
                    </div>

                    {hdr('Skala')}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Min</label>
                        <input type="number" value={min} onChange={(e) => set({ minValue: Number(e.target.value) })} className={fCls} style={fSty} />
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Max</label>
                        <input type="number" value={max} onChange={(e) => set({ maxValue: Number(e.target.value) })} className={fCls} style={fSty} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Einheit</label>
                        <input type="text" value={(o.unit as string) ?? ''} onChange={(e) => set({ unit: e.target.value || undefined })} placeholder="%, L, m³" className={fCls} style={fSty} />
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Dezimalstellen</label>
                        <input type="number" min={0} max={4} value={(o.decimals as number) ?? 0} onChange={(e) => set({ decimals: Number(e.target.value) })} className={fCls} style={fSty} />
                      </div>
                    </div>

                    {hdr('Farbzonen')}
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Farbzonen aktiv</label>
                      <button onClick={() => set({ colorZones: !colorZones })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: colorZones ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: colorZones ? '18px' : '2px' }} />
                      </button>
                    </div>
                    {colorZones && (() => {
                      type CZ = { max: number; color: string };
                      const rawZones = o.zones as CZ[] | undefined;
                      const zones: CZ[] = (rawZones && rawZones.length > 0) ? rawZones : [
                        { max: min + range * 0.33, color: '#ef4444' },
                        { max: min + range * 0.66, color: '#f59e0b' },
                        { max: max,                color: '#22c55e' },
                      ];
                      const setZones   = (z: CZ[]) => set({ zones: z });
                      const updateZone = (i: number, patch: Partial<CZ>) => setZones(zones.map((z, idx) => idx === i ? { ...z, ...patch } : z));
                      const removeZone = (i: number) => { if (zones.length > 1) setZones(zones.filter((_, idx) => idx !== i)); };
                      const addZone    = () => {
                        const insertBefore = zones.length - 1;
                        const prevMax  = insertBefore > 0 ? zones[insertBefore - 1].max : min;
                        const nextMax  = zones[insertBefore].max;
                        const newZones = [...zones];
                        newZones.splice(insertBefore, 0, { max: Math.round((prevMax + nextMax) / 2), color: '#6366f1' });
                        setZones(newZones);
                      };
                      return (
                        <div className="space-y-2">
                          {zones.map((zone, i) => {
                            const isLast = i === zones.length - 1;
                            return (
                              <div key={i} className="flex items-center gap-2">
                                <button onClick={() => removeZone(i)}
                                  className="text-[11px] w-5 h-5 flex items-center justify-center rounded shrink-0"
                                  style={{ color: 'var(--text-secondary)', background: 'var(--app-bg)', border: '1px solid var(--app-border)', opacity: zones.length <= 1 ? 0.3 : 1 }}>×</button>
                                <input type="color" value={zone.color}
                                  onChange={(e) => updateZone(i, { color: e.target.value })}
                                  className="w-8 h-7 rounded cursor-pointer shrink-0" style={{ border: '1px solid var(--app-border)', padding: '1px' }} />
                                <div className="flex-1">
                                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                    Zone {i + 1} {isLast ? '(Rest)' : 'bis'}
                                  </label>
                                  {isLast ? (
                                    <div className="text-[10px] py-2 px-2.5 rounded-lg" style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                                      bis {max}
                                    </div>
                                  ) : (
                                    <input type="number" value={zone.max}
                                      onChange={(e) => updateZone(i, { max: Number(e.target.value) })}
                                      className={fCls} style={fSty} />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          <button onClick={addZone}
                            className="w-full text-[11px] py-1.5 rounded-lg transition-colors hover:opacity-80"
                            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                            + Zone hinzufügen
                          </button>
                        </div>
                      );
                    })()}
                  </>
                );
              })()}

              {/* ── Trash / Müllabfuhr config ── */}
              {config.type === 'trash' && (
                <TrashConfig config={config} onConfigChange={onConfigChange} />
              )}

              {config.type === 'thermostat' && (() => {
                const o = config.options ?? {};
                const setO = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const tInputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
                const tInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Anklickbar (Detail-Popup)</label>
                      <button
                        onClick={() => setO({ clickable: !(o.clickable ?? true) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (o.clickable ?? true) ? 'var(--accent)' : 'var(--app-border)' }}
                      >
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.clickable ?? true) ? '18px' : '2px' }} />
                      </button>
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Ist-Temperatur Datenpunkt</label>
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={(o.actualDatapoint as string) ?? ''}
                          onChange={(e) => setO({ actualDatapoint: e.target.value || undefined })}
                          placeholder="optional"
                          className="flex-1 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none min-w-0"
                          style={tInputStyle}
                        />
                        <button
                          onClick={() => setPickerTarget('actualDatapoint')}
                          className="px-2 rounded-lg hover:opacity-80 shrink-0"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                          title="Aus ioBroker wählen"
                        >
                          <Database size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Min °C</label>
                        <input type="number" min={0} max={30} step={1}
                          value={(o.minTemp as number) ?? 10}
                          onChange={(e) => setO({ minTemp: Number(e.target.value) })}
                          className={tInputCls} style={tInputStyle} />
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Max °C</label>
                        <input type="number" min={10} max={40} step={1}
                          value={(o.maxTemp as number) ?? 30}
                          onChange={(e) => setO({ maxTemp: Number(e.target.value) })}
                          className={tInputCls} style={tInputStyle} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Schrittweite</label>
                      <select value={(o.step as number) ?? 0.5} onChange={(e) => setO({ step: Number(e.target.value) })}
                        className={tInputCls} style={tInputStyle}>
                        <option value={0.5}>0,5 °C</option>
                        <option value={1}>1 °C</option>
                        <option value={0.1}>0,1 °C</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Schnellwahl (kommagetrennt)</label>
                      <input
                        type="text"
                        value={((o.presets as number[]) ?? [18, 20, 22, 24]).join(', ')}
                        onChange={(e) => {
                          const vals = e.target.value.split(',').map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
                          setO({ presets: vals.length ? vals : undefined });
                        }}
                        placeholder="18, 20, 22, 24"
                        className={tInputCls}
                        style={tInputStyle}
                      />
                    </div>
                  </>
                );
              })()}
          </div>
        </CenteredModal>
      )}

      {/* Datapoint Picker Modal */}
      {pickerTarget && (
        <DatapointPicker
          currentValue={
            pickerTarget === 'datapoint'         ? config.datapoint :
            pickerTarget === 'localTempDatapoint' ? ((config.options?.localTempDatapoint as string) ?? '') :
            ((config.options?.actualDatapoint as string) ?? '')
          }
          onSelect={(id, unit) => {
            if (pickerTarget === 'datapoint') {
              const supportsUnit = ['value', 'chart', 'gauge', 'fill'].includes(config.type);
              const unitAlreadySet = !!(config.options?.unit as string | undefined);
              const unitPatch = supportsUnit && !unitAlreadySet && unit ? { unit } : {};
              onConfigChange({ ...config, datapoint: id, options: { ...config.options, ...unitPatch } });
            } else if (pickerTarget === 'localTempDatapoint') {
              onConfigChange({ ...config, options: { ...config.options, localTempDatapoint: id } });
            } else {
              onConfigChange({ ...config, options: { ...config.options, actualDatapoint: id } });
            }
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}

      {/* Conditions Modal */}
      {openPanel === 'conditions' && (
        <CenteredModal title="Bedingungen" onClose={() => openPanelFor(null)}>
          <ConditionEditor
            conditions={conditions}
            onChange={(next) =>
              onConfigChange({ ...config, options: { ...config.options, conditions: next } })
            }
          />
        </CenteredModal>
      )}
    </div>
  );
}
