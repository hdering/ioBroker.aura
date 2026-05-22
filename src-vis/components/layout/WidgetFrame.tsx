import React, { useState, useRef, useEffect, useLayoutEffect, useSyncExternalStore, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../../contexts/PortalTargetContext';
import { useT, t, type TranslationKey } from '../../i18n';
import { X, Pencil, Database, Sparkles, EyeOff, ChevronDown, Plus, Trash2, Download, ArrowRightLeft, Copy, Layers2, Minimize2, Smartphone, GripVertical, MousePointerClick, FolderOpen } from 'lucide-react';
import { setDragBridge } from '../../utils/dragBridge';
import { verticalCompact } from '../../utils/gridCompact';
import { exportWidget } from '../../utils/widgetExportImport';
import { copyToClipboard } from '../../utils/clipboard';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { applyDpNameFilter } from '../../utils/dpNameFilter';
import { useGlobalSettingsStore } from '../../store/globalSettingsStore';
import { useDashboardStore, useActiveLayout } from '../../store/dashboardStore';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { cloneGroupDef, useGroupDefsStore } from '../../store/groupDefsStore';
import { useConfigStore } from '../../store/configStore';
import { useActiveLayoutId } from '../../contexts/ActiveLayoutContext';
import { useEffectiveSettings } from '../../hooks/useEffectiveSettings';
import type { WidgetConfig, WidgetCondition, CustomCell, CustomGridDef, WidgetType, ClickAction, WidgetLayout } from '../../types';
import { DEFAULT_CUSTOM_GRID, DEFAULT_UNIVERSAL_GRID, normalizeGrid } from '../widgets/CustomGridView';
import { DEFAULT_KNOB_GRID } from '../widgets/KnobWidget';
import { DatapointPicker } from '../config/DatapointPicker';
import { ConditionEditor } from '../config/ConditionEditor';
import { getObjectDirect, subscribeStateDirect, getStateDirect } from '../../hooks/useIoBroker';
import { lookupDatapointEntry, ensureDatapointCache } from '../../hooks/useDatapointList';
import { detectMediaDevices, type DetectedMediaDevice } from '../../utils/mediaDeviceDetectors';
import { WIDGET_REGISTRY, WIDGET_GROUPS, WIDGET_BY_TYPE } from '../../widgetRegistry';
import { detectType } from '../../utils/widgetDetection';
import { DP_TEMPLATES, findMainDpForSecondary, autoDetectStatusDps, autoDetectLightDps } from '../../utils/dpTemplates';
import { AutoListConfig } from '../config/AutoListConfig';
import { StaticListConfig } from '../config/StaticListConfig';
import { EnumConfig } from '../config/EnumConfig';
import { type CameraSlot, type CameraSlotType, type CameraTemplateId, CAMERA_TEMPLATES, SLOT_TYPE_OPTIONS } from '../widgets/CameraWidget';
import { detectHistoryAdapters, RANGE_LABELS, type ChartTimeRange, type DetectedAdapter } from '../../hooks/useChartHistory';
import { useConditionStyle, notifyHiddenState } from '../../hooks/useConditionStyle';
import { SwitchWidget } from '../widgets/SwitchWidget';
import { ValueWidget } from '../widgets/ValueWidget';
import { DimmerWidget } from '../widgets/DimmerWidget';
import { ThermostatWidget } from '../widgets/ThermostatWidget';
// Chart widgets are heavy (recharts ~380 KB, echarts ~1.1 MB) and only used on
// dashboards that actually have chart widgets — lazy-loaded so they don't
// block first paint of the rest of the dashboard.
const ChartWidget        = lazy(() => import('../widgets/ChartWidget').then((m)        => ({ default: m.ChartWidget })));
const ClimateWidget      = lazy(() => import('../widgets/ClimateWidget').then((m)      => ({ default: m.ClimateWidget })));
const EChartWidget       = lazy(() => import('../widgets/EChartWidget').then((m)       => ({ default: m.EChartWidget })));
const EChartsPresetWidget = lazy(() => import('../widgets/EChartsPresetWidget').then((m) => ({ default: m.EChartsPresetWidget })));
import { ListWidget } from '../widgets/ListWidget';
import { ClockWidget } from '../widgets/ClockWidget';
import { CalendarWidget, getSources, DEFAULT_CAL_COLORS, type CalendarSource } from '../widgets/CalendarWidget';
import { HeaderWidget } from '../widgets/HeaderWidget';
// GroupWidget imports WidgetFrame (circular) — safe because it only uses WidgetFrame
// inside its render function, never at module-init time.
import { GroupWidget } from '../widgets/GroupWidget';
import { EChartConfig } from '../config/EChartConfig';
import { EvccWidget } from '../widgets/EvccWidget';
import { EvccConfig } from '../widgets/EvccWidget';
import { WeatherWidget, buildWeatherCustomGrid } from '../widgets/WeatherWidget';
import { GaugeWidget } from '../widgets/GaugeWidget';
import { CameraWidget } from '../widgets/CameraWidget';
import { ImageWidget } from '../widgets/ImageWidget';
import { IframeWidget } from '../widgets/IframeWidget';
import { FillWidget } from '../widgets/FillWidget';
import { TrashWidget, TrashConfig } from '../widgets/TrashWidget';
import { TrashScheduleWidget, TrashScheduleConfig } from '../widgets/TrashScheduleWidget';
import { AutoListWidget } from '../widgets/AutoListWidget';
import { ShutterWidget } from '../widgets/ShutterWidget';
import { JsonTableWidget } from '../widgets/JsonTableWidget';
import { WindowContactWidget, WC_PRESETS, WC_PRESET_LABELS } from '../widgets/WindowContactWidget';
import { BinarySensorWidget, BINARY_SENSOR_PRESETS } from '../widgets/BinarySensorWidget';
import { StateImageWidget } from '../widgets/StateImageWidget';
import { EChartsPresetConfig } from '../config/EChartsPresetConfig';
import { JsonTableConfig } from '../config/JsonTableConfig';
import { HtmlWidget } from '../widgets/HtmlWidget';
import { HtmlConfig } from '../config/HtmlConfig';
import { DatePickerWidget, FORMAT_LABELS, type DateOutputFormat } from '../widgets/DatePickerWidget';
import { CustomCellEditor, CELL_LABELS } from './CustomCellEditor';
import { MediaplayerWidget } from '../widgets/MediaplayerWidget';
import { SliderWidget } from '../widgets/SliderWidget';
import { ChipsWidget } from '../widgets/ChipsWidget';
import { HttpRequestWidget } from '../widgets/HttpRequestWidget';
import { ButtonWidget } from '../widgets/ButtonWidget';
import { UniversalWidget } from '../widgets/UniversalWidget';
import { EnumWidget } from '../widgets/EnumWidget';
import { LightWidget } from '../widgets/LightWidget';
import { CarouselWidget } from '../widgets/CarouselWidget';
import { KnobWidget } from '../widgets/KnobWidget';
import { TimerWidget } from '../widgets/TimerWidget';
import { AdapterStatusWidget } from '../widgets/AdapterStatusWidget';
import { TimerConfig } from '../config/TimerConfig';
import { IconPickerModal } from '../config/IconPickerModal';
import { ClickActionEditor, defaultActionForConfig } from '../config/ClickActionEditor';
import { WidgetClickPopup } from '../widgets/popup/WidgetClickPopup';
import { useNavigationStore } from '../../store/navigationStore';
import { usePopupConfigStore } from '../../store/popupConfigStore';

// Stable empty array – avoids creating a new reference on every render when no conditions are set
const NO_CONDITIONS: WidgetCondition[] = [];

// ── Global custom-cell clipboard (shared across all WidgetFrames) ───────────
let cellClipboardData: CustomCell | null = null;
const cellClipboardListeners = new Set<() => void>();
function subscribeCellClipboard(fn: () => void) {
  cellClipboardListeners.add(fn);
  return () => { cellClipboardListeners.delete(fn); };
}
function getCellClipboardSnapshot() { return cellClipboardData; }
function setCellClipboard(v: CustomCell | null) {
  cellClipboardData = v;
  cellClipboardListeners.forEach(fn => fn());
}
function useCellClipboard() {
  return useSyncExternalStore(subscribeCellClipboard, getCellClipboardSnapshot, getCellClipboardSnapshot);
}

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
    trash:         TrashWidget,
    trashSchedule: TrashScheduleWidget,
    shutter:       ShutterWidget,
    jsontable:     JsonTableWidget,
    html:          HtmlWidget,
    windowcontact: WindowContactWidget,
    binarysensor:  BinarySensorWidget,
    stateimage:    StateImageWidget,
    echartsPreset: EChartsPresetWidget,
    datepicker:    DatePickerWidget,
    mediaplayer:   MediaplayerWidget,
    slider:        SliderWidget,
    chips:         ChipsWidget,
    httpRequest:   HttpRequestWidget,
    button:        ButtonWidget,
    climate:       ClimateWidget,
    universal:     UniversalWidget,
    enum:          EnumWidget,
    light:         LightWidget,
    carousel:      CarouselWidget,
    knob:          KnobWidget,
    timer:         TimerWidget,
    adapterstatus: AdapterStatusWidget,
  } as const;
}

// ── CalendarEditPanel ──────────────────────────────────────────────────────

const REFRESH_OPTIONS = [
  { label: '5 Min', value: 5 }, { label: '15 Min', value: 15 }, { label: '30 Min', value: 30 },
  { label: '1 Std', value: 60 }, { label: '6 Std', value: 360 }, { label: '24 Std', value: 1440 },
];
const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

// ── VisibilityToggles ─────────────────────────────────────────────────────────

type VisField = { key: string; label: string };

// ── CalendarEditPanel ─────────────────────────────────────────────────────────

function CalendarEditPanel({ config, onConfigChange }: { config: WidgetConfig; onConfigChange: (c: WidgetConfig) => void }) {
  const t = useT();
  const o = config.options ?? {};
  const sources = getSources(o);
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_CAL_COLORS[sources.length % DEFAULT_CAL_COLORS.length]);
  const [importantIconPickerOpen, setImportantIconPickerOpen] = useState(false);

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
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Schriftgröße</label>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {Math.round(((o.calFontScale as number) ?? 1) * 100)} %
          </span>
        </div>
        <input type="range" min={0.5} max={6} step={0.05}
          value={(o.calFontScale as number) ?? 1}
          onChange={(e) => setOpts({ calFontScale: Number(e.target.value) })}
          className="w-full h-1"
          style={{ accentColor: 'var(--accent)' }} />
      </div>

      {/* separator */}
      <div className="h-px" style={{ background: 'var(--app-border)' }} />

      {/* ── Wichtige Termine ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Wichtige Termine</p>
          <button
            onClick={() => setOpts({ highlightEnabled: !(o.highlightEnabled !== false) })}
            className="relative w-7 h-4 rounded-full transition-colors shrink-0"
            style={{ background: o.highlightEnabled !== false ? 'var(--accent)' : 'var(--app-border)' }}>
            <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
              style={{ left: o.highlightEnabled !== false ? '14px' : '2px' }} />
          </button>
        </div>
        {o.highlightEnabled !== false && (
          <div className="space-y-2">
            {/* PRIORITY toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>
                iCal PRIORITY 1–4 (Outlook, Thunderbird)
              </span>
              <button
                onClick={() => setOpts({ highlightPriority: !(o.highlightPriority !== false) })}
                className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                style={{ background: o.highlightPriority !== false ? 'var(--accent)' : 'var(--app-border)' }}>
                <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                  style={{ left: o.highlightPriority !== false ? '14px' : '2px' }} />
              </button>
            </div>
            {/* Keywords */}
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                Stichwörter im Titel / Kategorie (kommagetrennt)
              </label>
              <input type="text"
                value={(o.highlightKeywords as string) ?? ''}
                onChange={(e) => setOpts({ highlightKeywords: e.target.value || undefined })}
                placeholder="z.B. ⭐, wichtig, urgent"
                className={inputCls} style={inputStyle} />
            </div>
            {/* Color */}
            <div className="flex items-center gap-2">
              <label className="text-[11px] flex-1" style={{ color: 'var(--text-secondary)' }}>Hervorhebungsfarbe</label>
              <input type="color"
                value={(o.highlightColor as string) || '#f59e0b'}
                onChange={(e) => setOpts({ highlightColor: e.target.value })}
                className="w-8 h-6 rounded cursor-pointer p-0.5"
                style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }} />
            </div>
            {/* importantOnly toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>Nur wichtige Termine anzeigen</span>
              <button
                onClick={() => setOpts({ importantOnly: !o.importantOnly })}
                className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                style={{ background: o.importantOnly ? 'var(--accent)' : 'var(--app-border)' }}>
                <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                  style={{ left: o.importantOnly ? '14px' : '2px' }} />
              </button>
            </div>
            {/* hideImportantIcon toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>Icon ausblenden</span>
              <button
                onClick={() => setOpts({ hideImportantIcon: !o.hideImportantIcon })}
                className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                style={{ background: o.hideImportantIcon ? 'var(--accent)' : 'var(--app-border)' }}>
                <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                  style={{ left: o.hideImportantIcon ? '14px' : '2px' }} />
              </button>
            </div>
            {/* importantIcon picker */}
            {!o.hideImportantIcon && (() => {
              const currentIconName = o.importantIcon as string | undefined;
              const CurrentIcon = currentIconName
                ? (getWidgetIcon(currentIconName, (() => null) as unknown as import('lucide-react').LucideIcon))
                : null;
              return (
                <div>
                  <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Icon für wichtige Termine</label>
                  <button
                    onClick={() => setImportantIconPickerOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors w-full text-left"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
                  >
                    {CurrentIcon
                      ? <CurrentIcon size={14} style={{ flexShrink: 0 }} />
                      : <span style={{ width: 14, height: 14, display: 'inline-block', flexShrink: 0 }} />}
                    <span className="flex-1 truncate" style={{ color: currentIconName ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {currentIconName ?? 'Standard (Stern)'}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>›</span>
                  </button>
                  {importantIconPickerOpen && (
                    <IconPickerModal
                      current={currentIconName ?? ''}
                      onSelect={(name) => setOpts({ importantIcon: name || undefined })}
                      onClose={() => setImportantIconPickerOpen(false)}
                    />
                  )}
                </div>
              );
            })()}
          </div>
        )}
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
const CHART_RANGES: ChartTimeRange[] = ['1h', '6h', '24h', '7d', '30d', 'custom'];

function ChartHistoryConfig({ config, onConfigChange }: { config: WidgetConfig; onConfigChange: (c: WidgetConfig) => void }) {
  const t = useT();
  const [adapters, setAdapters] = useState<DetectedAdapter[]>([]);
  const [checking, setChecking] = useState(false);
  const dp = config.datapoint;
  const o  = config.options ?? {};
  const set = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });

  const isTemplate = !!dp?.startsWith('{{');

  useEffect(() => {
    if (!dp || isTemplate) { setAdapters([]); return; }
    setChecking(true);
    getObjectDirect(dp).then((obj) => {
      const custom = obj?.common?.custom;
      const detected = custom ? detectHistoryAdapters(custom as Record<string, { enabled?: boolean }>) : [];
      setAdapters(detected);
      setChecking(false);
      if (detected.length === 1 && !o.historyInstance) {
        set({ historyInstance: detected[0].instance });
      }
    }).catch(() => setChecking(false));
  }, [dp]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedInstance  = o.historyInstance as string | undefined;
  const selectedRange     = (o.historyRange as ChartTimeRange | undefined) ?? '24h';
  const customVal         = (o.historyRangeCustomValue as number | undefined) ?? 24;
  const customUnit        = (o.historyRangeCustomUnit as 'h' | 'd' | undefined) ?? 'h';

  return (
    <>
      <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
      <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t('wf.history.title')}</p>

      {/* Adapter-Auswahl: Freitext wenn Datenpunkt ein Template-Platzhalter ist */}
      {isTemplate && (
        <div>
          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.history.instance')}</label>
          <input
            type="text"
            placeholder="z.B. history.0"
            value={selectedInstance ?? ''}
            onChange={(e) => set({ historyInstance: e.target.value || undefined })}
            className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
            style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
          />
        </div>
      )}

      {/* Adapter-Auswahl: Auto-Detect wenn konkreter Datenpunkt */}
      {!isTemplate && checking && (
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.history.checking')}</p>
      )}
      {!isTemplate && !checking && adapters.length === 0 && (
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          {t('wf.history.noAdapter')}
        </p>
      )}
      {!isTemplate && !checking && adapters.length > 0 && (
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
          {/* Benutzerdefinierter Zeitraum */}
          {selectedRange === 'custom' && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <input
                type="number"
                min={1}
                max={365}
                value={customVal}
                onChange={(e) => set({ historyRangeCustomValue: Math.max(1, Number(e.target.value) || 1) })}
                className="w-16 text-xs rounded-md px-2 py-1 text-center focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
              />
              {(['h', 'd'] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => set({ historyRangeCustomUnit: u })}
                  className="text-[11px] px-2 py-1 rounded-md transition-opacity hover:opacity-80"
                  style={{
                    background: customUnit === u ? 'var(--accent)' : 'var(--app-bg)',
                    color:      customUnit === u ? '#fff' : 'var(--text-secondary)',
                    border:     `1px solid ${customUnit === u ? 'var(--accent)' : 'var(--app-border)'}`,
                  }}
                >
                  {u === 'h' ? 'Std' : 'Tage'}
                </button>
              ))}
            </div>
          )}
          {/* Zeitraum im Frontend sperren */}
          <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={(o.lockRange as boolean | undefined) ?? false}
              onChange={(e) => set({ lockRange: e.target.checked })}
              className="rounded"
            />
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.history.lockRange')}</span>
          </label>
          {/* Durchschnittslinie */}
          <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={(o.showAverage as boolean | undefined) ?? false}
              onChange={(e) => set({ showAverage: e.target.checked })}
              className="rounded"
            />
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Durchschnittslinie anzeigen</span>
          </label>
          <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={(o.showAverageAsValue as boolean | undefined) ?? false}
              onChange={(e) => set({ showAverageAsValue: e.target.checked })}
              className="rounded"
            />
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Ø als Zahlenwert anzeigen</span>
          </label>
          {/* Y-Achse anzeigen */}
          <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={(o.showYAxis as boolean | undefined) ?? false}
              onChange={(e) => set({ showYAxis: e.target.checked })}
              className="rounded"
            />
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.history.showYAxis')}</span>
          </label>
          {(o.showYAxis as boolean | undefined) && (
            <label className="flex items-center gap-2 mt-1 ml-5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={(o.yAxisCompact as boolean | undefined) ?? true}
                onChange={(e) => set({ yAxisCompact: e.target.checked })}
                className="rounded"
              />
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.history.yAxisCompact')}</span>
            </label>
          )}
          {/* X-Achse anzeigen */}
          <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={(o.showXAxis as boolean | undefined) ?? true}
              onChange={(e) => set({ showXAxis: e.target.checked })}
              className="rounded"
            />
            <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.history.showXAxis')}</span>
          </label>
        </div>
      )}

      {/* ── Farben ── */}
      <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
      <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Farben</p>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Linie / Fläche</span>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={(o.lineColor as string | undefined) ?? '#3b82f6'}
              onChange={(e) => set({ lineColor: e.target.value })}
              className="w-7 h-7 rounded cursor-pointer border-0 p-0"
              style={{ background: 'none' }}
            />
            <button
              onClick={() => set({ lineColor: undefined })}
              className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70"
              style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
            >Reset</button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Durchschnittslinie</span>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={(o.avgColor as string | undefined) ?? (o.lineColor as string | undefined) ?? '#3b82f6'}
              onChange={(e) => set({ avgColor: e.target.value })}
              className="w-7 h-7 rounded cursor-pointer border-0 p-0"
              style={{ background: 'none' }}
            />
            <button
              onClick={() => set({ avgColor: undefined })}
              className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70"
              style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
            >Reset</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── ClimateConfig ─────────────────────────────────────────────────────────────
function ClimateConfig({
  config,
  onConfigChange,
  onPickerOpen,
}: {
  config: WidgetConfig;
  onConfigChange: (c: WidgetConfig) => void;
  onPickerOpen: (target: 'climate_humidityDp' | 'climate_targetDp') => void;
}) {
  const [humidityIconPickerOpen, setHumidityIconPickerOpen] = useState(false);

  const o   = config.options ?? {};
  const set = (patch: Record<string, unknown>) => onConfigChange({ ...config, options: { ...o, ...patch } });
  const { defaultDecimals } = useGlobalSettingsStore();
  const inputCls   = 'flex-1 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none min-w-0';
  const inputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
  const btnStyle   = { background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' };

  const humidityIconName = o.humidityIcon as string | undefined;
  const HumidityIconPreview = humidityIconName
    ? getWidgetIcon(humidityIconName, (() => null) as unknown as import('lucide-react').LucideIcon)
    : null;

  const autoFill = async () => {
    if (!config.datapoint) return;
    const parts = config.datapoint.split('.');
    const parent = parts.slice(0, -1).join('.');
    const entries = await ensureDatapointCache();
    const sibs = entries.filter((e) => e.id.startsWith(parent + '.'));
    const find = (...names: string[]) => names.map((n) => sibs.find((e) => e.id === `${parent}.${n}`)?.id).find(Boolean);
    const patch: Record<string, unknown> = {};
    const hv = find('HUMIDITY', 'humidity', 'Humidity', 'relative_humidity', 'RELATIVE_HUMIDITY');
    if (hv) patch.humidityDatapoint = hv;
    const tv = find('SET_POINT_TEMPERATURE', 'setPointTemperature', 'setpoint', 'SETPOINT', 'TARGET_TEMPERATURE', 'target_temperature', 'DESIRED_TEMPERATURE', 'desired_temperature', 'occupied_heating_setpoint');
    if (tv) patch.targetDatapoint = tv;
    if (Object.keys(patch).length) set(patch);
  };

  return (
    <>
      <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Datenpunkte</p>
        <button onClick={() => void autoFill()}
          className="text-[10px] px-2.5 py-1 rounded-lg transition-colors hover:opacity-80 disabled:opacity-40"
          style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', border: '1px solid var(--accent)44' }}>
          ✨ Auto-Erkennen
        </button>
      </div>

      {/* Soll-Temperatur */}
      <div className="mb-2">
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Soll-Temperatur (optional)</label>
        <div className="flex gap-1">
          <input
            type="text"
            value={(o.targetDatapoint as string) ?? ''}
            onChange={(e) => set({ targetDatapoint: e.target.value || undefined })}
            placeholder="optional"
            className={inputCls}
            style={inputStyle}
          />
          <button
            onClick={() => onPickerOpen('climate_targetDp')}
            className="px-2 rounded-lg hover:opacity-80 shrink-0"
            style={btnStyle}
            title="Aus ioBroker wählen"
          >
            <Database size={13} />
          </button>
        </div>
      </div>

      {/* Luftfeuchtigkeit DP */}
      <div className="mb-2">
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Luftfeuchtigkeit (optional)</label>
        <div className="flex gap-1">
          <input
            type="text"
            value={(o.humidityDatapoint as string) ?? ''}
            onChange={(e) => set({ humidityDatapoint: e.target.value || undefined })}
            placeholder="optional"
            className={inputCls}
            style={inputStyle}
          />
          <button
            onClick={() => onPickerOpen('climate_humidityDp')}
            className="px-2 rounded-lg hover:opacity-80 shrink-0"
            style={btnStyle}
            title="Aus ioBroker wählen"
          >
            <Database size={13} />
          </button>
        </div>
      </div>

      {/* Luftfeuchtigkeits-Icon */}
      <div className="mb-2">
        <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Luftfeuchtigkeits-Icon</label>
        <button
          onClick={() => setHumidityIconPickerOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors w-full text-left"
          style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
        >
          {HumidityIconPreview
            ? <HumidityIconPreview size={14} style={{ flexShrink: 0 }} />
            : <span style={{ width: 14, height: 14, display: 'inline-block', flexShrink: 0 }} />}
          <span className="flex-1 truncate" style={{ color: humidityIconName ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
            {humidityIconName ?? 'Icon auswählen… (Standard: Droplets)'}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>›</span>
        </button>
        {humidityIconPickerOpen && (
          <IconPickerModal
            current={humidityIconName ?? ''}
            onSelect={(name) => { set({ humidityIcon: name || undefined }); setHumidityIconPickerOpen(false); }}
            onClose={() => setHumidityIconPickerOpen(false)}
          />
        )}
      </div>

      {/* Einheiten */}
      <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
      <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Einheiten</p>
      <div className="flex gap-2 mb-2">
        <div className="flex-1">
          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Temperatur</label>
          <input
            type="text"
            value={(o.unit as string) ?? '°C'}
            onChange={(e) => set({ unit: e.target.value || '°C' })}
            className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
            style={inputStyle}
          />
        </div>
        <div className="flex-1">
          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Feuchtigkeit</label>
          <input
            type="text"
            value={(o.humidityUnit as string) ?? '%'}
            onChange={(e) => set({ humidityUnit: e.target.value || '%' })}
            className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
            style={inputStyle}
          />
        </div>
      </div>

      {/* Dezimalstellen */}
      <div className="mb-2">
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Dezimalstellen</label>
        <div className="flex gap-1">
          <input type="number" min={0} max={4}
            disabled={o.decimals === undefined}
            value={(o.decimals as number) ?? defaultDecimals}
            onChange={(e) => set({ decimals: Number(e.target.value) })}
            className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
            style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)', opacity: o.decimals === undefined ? 0.5 : 1 }} />
          <button
            onClick={() => set({ decimals: o.decimals === undefined ? defaultDecimals : undefined })}
            title={o.decimals === undefined ? 'Globale Einstellung aktiv – klicken für eigenen Wert' : 'Auf globale Einstellung zurücksetzen'}
            className="px-1.5 rounded text-[10px] font-bold shrink-0"
            style={{ background: o.decimals === undefined ? 'var(--accent)' : 'var(--app-border)', color: o.decimals === undefined ? '#fff' : 'var(--text-secondary)' }}>
            Global
          </button>
        </div>
      </div>

      {/* Diagrammfarbe */}
      <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Diagrammfarbe</span>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={(o.lineColor as string | undefined) ?? '#06b6d4'}
            onChange={(e) => set({ lineColor: e.target.value })}
            className="w-7 h-7 rounded cursor-pointer border-0 p-0"
            style={{ background: 'none' }}
          />
          <button
            onClick={() => set({ lineColor: undefined })}
            className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-70"
            style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
          >Reset</button>
        </div>
      </div>

      {/* History-Konfiguration */}
      <ChartHistoryConfig config={config} onConfigChange={onConfigChange} />
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
  storageKey,
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  /** When set, modal becomes resizable and width/height are persisted in localStorage. */
  storageKey?: string;
  children: React.ReactNode;
}) {
  const portalTarget = usePortalTarget();
  const modalRef = useRef<HTMLDivElement>(null);
  // null = use CSS centering; once dragged, holds absolute pixel position
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragOrigin = useRef<{ mx: number; my: number; rx: number; ry: number } | null>(null);

  // Persisted size (only used when storageKey is set)
  const [size, setSize] = useState<{ w: number; h: number } | null>(() => {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.w === 'number' && typeof parsed?.h === 'number') {
        return { w: parsed.w, h: parsed.h };
      }
    } catch { /* ignore */ }
    return null;
  });
  const resizeOrigin = useRef<{ mx: number; my: number; w: number; h: number } | null>(null);

  useEffect(() => {
    if (!storageKey || !size) return;
    try { localStorage.setItem(storageKey, JSON.stringify(size)); } catch { /* ignore */ }
  }, [storageKey, size]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = modalRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOrigin.current = { mx: e.clientX, my: e.clientY, rx: rect.left, ry: rect.top };

    const onMove = (ev: MouseEvent) => {
      if (!dragOrigin.current) return;
      setPos({
        x: dragOrigin.current.rx + ev.clientX - dragOrigin.current.mx,
        y: dragOrigin.current.ry + ev.clientY - dragOrigin.current.my,
      });
    };
    const onUp = () => {
      dragOrigin.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onResizeMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !storageKey) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = modalRef.current?.getBoundingClientRect();
    if (!rect) return;
    resizeOrigin.current = { mx: e.clientX, my: e.clientY, w: rect.width, h: rect.height };

    const onMove = (ev: MouseEvent) => {
      if (!resizeOrigin.current) return;
      const maxW = Math.max(320, window.innerWidth - 20);
      const maxH = Math.max(240, window.innerHeight - 20);
      const newW = Math.min(maxW, Math.max(320, resizeOrigin.current.w + ev.clientX - resizeOrigin.current.mx));
      const newH = Math.min(maxH, Math.max(240, resizeOrigin.current.h + ev.clientY - resizeOrigin.current.my));
      setSize({ w: Math.round(newW), h: Math.round(newH) });
    };
    const onUp = () => {
      resizeOrigin.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const posStyle: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, transform: 'none' }
    : { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

  const sizeStyle: React.CSSProperties = storageKey && size
    ? { width: size.w, height: size.h, maxWidth: 'none', maxHeight: 'none' }
    : {};

  const sizeClasses = storageKey && size
    ? ''
    : `w-[90vw] ${wide ? 'max-w-5xl' : 'max-w-3xl'} max-h-[85vh]`;

  return createPortal(
    // pointer-events-none wrapper: clicks pass through to the widget below
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div
        ref={modalRef}
        className={`pointer-events-auto flex flex-col rounded-xl shadow-2xl relative ${sizeClasses}`}
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', boxShadow: '0 8px 40px rgba(0,0,0,0.35)', ...posStyle, ...sizeStyle }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Drag handle = title bar */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0 cursor-move select-none"
          style={{ borderBottom: '1px solid var(--app-border)' }}
          onMouseDown={onHeaderMouseDown}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
          <button
            onClick={onClose}
            onMouseDown={(e) => e.stopPropagation()}
            className="hover:opacity-70 transition-opacity cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={15} />
          </button>
        </div>
        <div className="aura-scroll overflow-y-auto flex-1 p-4 space-y-2.5">
          {children}
        </div>
        {storageKey && (
          <div
            onMouseDown={onResizeMouseDown}
            title="Größe ändern"
            className="absolute bottom-0 right-0 cursor-nwse-resize select-none"
            style={{
              width: 16,
              height: 16,
              background: 'linear-gradient(135deg, transparent 0%, transparent 45%, var(--text-secondary) 45%, var(--text-secondary) 55%, transparent 55%, transparent 70%, var(--text-secondary) 70%, var(--text-secondary) 80%, transparent 80%)',
              opacity: 0.5,
              borderBottomRightRadius: 12,
            }}
          />
        )}
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
  /** When set, widget is inside a group. "Kopieren" duplicates within the group. */
  onDuplicate?: () => void;
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

  // Re-clamp after every render so expanding submenus don't overflow the viewport
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor) return;

    const panelRect = panel.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const GAP = 4;

    let left = anchorRect.right - panelRect.width;
    if (left < GAP) left = GAP;
    if (left + panelRect.width > vw - GAP) left = vw - GAP - panelRect.width;

    let top = anchorRect.bottom + GAP;
    if (top + panelRect.height > vh - GAP) top = anchorRect.top - panelRect.height - GAP;
    if (top < GAP) top = GAP;

    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    panel.style.visibility = 'visible';
  });

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
        top: -9999,
        left: -9999,
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        visibility: 'hidden',
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

  const showWeather    = (o.showWeather    as boolean) ?? true;
  const showForecast   = (o.showForecast   as boolean) ?? true;
  const showToday      = (o.showToday      as boolean) ?? true;
  const showWarnings   = (o.showWarnings   as boolean) ?? false;
  const showRainProb   = (o.showRainProb   as boolean) ?? true;
  const showRainAmount = (o.showRainAmount as boolean) ?? false;
  const showCloudCover = (o.showCloudCover as boolean) ?? false;
  const showCondition      = (o.showCondition      as boolean) ?? true;
  const showHumidityLabel  = (o.showHumidityLabel  as boolean) ?? true;
  const feelsLikeStyle     = (o.feelsLikeStyle     as 'text' | 'icon' | 'hidden') ?? 'text';
  const tempFontSize       = (o.tempFontSize       as number)  ?? 0;
  const fontScale          = (o.fontScale          as number)  ?? 1;
  const forecastRowGap     = (o.forecastRowGap     as number)  ?? 0;
  const forecastWrap       = (o.forecastWrap       as boolean) ?? false;
  const tempThresholds = (o.forecastTempThresholds as [number, string][] | undefined) ?? [];
  const setTempThresholds = (next: [number, string][]) =>
    set({ forecastTempThresholds: next.length ? next : undefined });
  const toHex = (c: string) => { const m = c.match(/#[0-9a-fA-F]{6}/); return m ? m[0] : '#fde047'; };

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

      {/* ── Display & Typography ── */}
      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.showCondition')}</label>
        <button onClick={() => set({ showCondition: !showCondition })}
          className="relative w-9 h-5 rounded-full transition-colors shrink-0"
          style={{ background: showCondition ? 'var(--accent)' : 'var(--app-border)' }}>
          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
            style={{ left: showCondition ? '18px' : '2px' }} />
        </button>
      </div>
      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.showHumidityLabel')}</label>
        <button onClick={() => set({ showHumidityLabel: !showHumidityLabel })}
          className="relative w-9 h-5 rounded-full transition-colors shrink-0"
          style={{ background: showHumidityLabel ? 'var(--accent)' : 'var(--app-border)' }}>
          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
            style={{ left: showHumidityLabel ? '18px' : '2px' }} />
        </button>
      </div>
      <div className="flex items-center justify-between">
        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.showCloudCover')}</label>
        <button onClick={() => set({ showCloudCover: !showCloudCover })}
          className="relative w-9 h-5 rounded-full transition-colors shrink-0"
          style={{ background: showCloudCover ? 'var(--accent)' : 'var(--app-border)' }}>
          <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
            style={{ left: showCloudCover ? '18px' : '2px' }} />
        </button>
      </div>
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.feelsLikeStyle')}</label>
        <select value={feelsLikeStyle}
          onChange={(e) => set({ feelsLikeStyle: e.target.value })}
          className={iCls} style={iSty}>
          <option value="text">{t('wf.weather.feelsLikeStyleText')}</option>
          <option value="icon">{t('wf.weather.feelsLikeStyleIcon')}</option>
          <option value="hidden">{t('wf.weather.feelsLikeStyleHidden')}</option>
        </select>
      </div>
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.tempFontSize')}</label>
        <input type="number" min={0} max={12} step={0.1} value={tempFontSize}
          onChange={(e) => set({ tempFontSize: Number(e.target.value) || undefined })}
          placeholder="0 = auto" className={iCls} style={iSty} />
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>{t('wf.weather.tempFontSizeHint')}</p>
      </div>
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.fontScale')}</label>
        <input type="number" min={0.3} max={8} step={0.05} value={fontScale}
          onChange={(e) => set({ fontScale: Number(e.target.value) || undefined })}
          className={iCls} style={iSty} />
        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>{t('wf.weather.fontScaleHint')}</p>
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
          <div className="flex items-center justify-between">
            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.showRainProb')}</label>
            <button onClick={() => set({ showRainProb: !showRainProb })}
              className="relative w-9 h-5 rounded-full transition-colors"
              style={{ background: showRainProb ? 'var(--accent)' : 'var(--app-border)' }}>
              <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                style={{ left: showRainProb ? '18px' : '2px' }} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.showRainAmount')}</label>
            <button onClick={() => set({ showRainAmount: !showRainAmount })}
              className="relative w-9 h-5 rounded-full transition-colors"
              style={{ background: showRainAmount ? 'var(--accent)' : 'var(--app-border)' }}>
              <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                style={{ left: showRainAmount ? '18px' : '2px' }} />
            </button>
          </div>
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.forecastRowGap')}</label>
            <input type="number" min={0} max={8} step={0.05} value={forecastRowGap}
              onChange={(e) => set({ forecastRowGap: Number(e.target.value) || undefined })}
              placeholder="0 = auto" className={iCls} style={iSty} />
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>{t('wf.weather.forecastRowGapHint')}</p>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.forecastWrap')}</label>
            <button onClick={() => set({ forecastWrap: !forecastWrap })}
              className="relative w-9 h-5 rounded-full transition-colors"
              style={{ background: forecastWrap ? 'var(--accent)' : 'var(--app-border)' }}>
              <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                style={{ left: forecastWrap ? '18px' : '2px' }} />
            </button>
          </div>

          {/* ── Temperatur-Farbschwellen für Forecast-Balken ── */}
          <div style={{ borderTop: '1px solid var(--app-border)', marginTop: 4, paddingTop: 8 }}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.tempThresholds')}</label>
              <div className="flex gap-1">
                <button
                  onClick={() => setTempThresholds([[15, '#fde047'], [25, '#eab308'], [35, '#ef4444']])}
                  className="text-[10px] px-2 py-0.5 rounded hover:opacity-80"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                >{t('wf.weather.tempThresholdsPreset')}</button>
                <button
                  onClick={() => setTempThresholds([...tempThresholds, [25, '#eab308']])}
                  className="text-[10px] px-2 py-0.5 rounded hover:opacity-80"
                  style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
                >+ {t('wf.weather.tempThresholdsAdd')}</button>
              </div>
            </div>
            {tempThresholds.length > 0 && (
              <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                {t('wf.weather.tempThresholdsHint')}
              </p>
            )}
            <div className="space-y-1">
              {tempThresholds.map(([thresh, color], i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <button
                    onClick={() => setTempThresholds(tempThresholds.filter((_, j) => j !== i))}
                    className="text-[11px] w-5 h-5 flex items-center justify-center rounded shrink-0"
                    style={{ color: 'var(--text-secondary)', background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                  >×</button>
                  <input
                    type="color"
                    value={toHex(color)}
                    onChange={(e) => { const n = [...tempThresholds]; n[i] = [thresh, e.target.value]; setTempThresholds(n); }}
                    className="w-8 h-7 rounded cursor-pointer shrink-0"
                    style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                  />
                  <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('wf.weather.tempThresholdsFrom')}</span>
                  <input
                    type="number"
                    value={thresh}
                    onChange={(e) => { const n = [...tempThresholds]; n[i] = [Number(e.target.value), color]; setTempThresholds(n); }}
                    className="flex-1 text-xs rounded-lg px-2 py-1 focus:outline-none"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                  />
                  <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>°C</span>
                </div>
              ))}
            </div>
            {tempThresholds.length === 0 && (
              <p className="text-[10px] italic" style={{ color: 'var(--text-secondary)', opacity: 0.45 }}>{t('wf.weather.tempThresholdsEmpty')}</p>
            )}
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

// ── Camera slot editor row (used in Standard and Custom Grid config) ──────────

interface CameraSlotEditorRowProps {
  slot:      CameraSlot;
  idx:       number;
  label:     string;
  cCls:      string;
  cSty:      React.CSSProperties;
  onChange:  (idx: number, patch: Partial<CameraSlot>) => void;
  onRemove?: () => void;
  onPickDp:  (idx: number) => void;
}

function CameraSlotEditorRow({ slot, idx, label, cCls, cSty, onChange, onRemove, onPickDp }: CameraSlotEditorRowProps) {
  const hasDP     = ['battery', 'temperature', 'armed', 'motion', 'datapoint'].includes(slot.type);
  const hasValue  = ['text', 'manufacturer'].includes(slot.type);
  const hasBool   = ['armed', 'motion'].includes(slot.type);
  const sec: React.CSSProperties = { color: 'var(--text-secondary)' };

  return (
    <div className="flex flex-col gap-1 p-2 rounded-lg" style={{ border: '1px solid var(--app-border)' }}>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-medium opacity-50" style={sec}>{label}</span>
        {onRemove && (
          <button onClick={onRemove} className="text-[10px] opacity-40 hover:opacity-80 leading-none" style={sec}>✕</button>
        )}
      </div>
      <select value={slot.type} className={cCls} style={cSty}
        onChange={(e) => onChange(idx, { type: e.target.value as CameraSlotType, datapoint: undefined, value: undefined })}>
        {SLOT_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
      {slot.type !== 'empty' && (
        <input type="text" value={slot.label ?? ''} placeholder="Label (optional)" className={cCls} style={cSty}
          onChange={(e) => onChange(idx, { label: e.target.value || undefined })} />
      )}
      {hasValue && (
        <input type="text" value={slot.value ?? ''} placeholder="Wert (Freitext)" className={cCls} style={cSty}
          onChange={(e) => onChange(idx, { value: e.target.value || undefined })} />
      )}
      {hasDP && (
        <div className="flex gap-1">
          <input type="text" value={slot.datapoint ?? ''} placeholder="Datenpunkt-ID" className={cCls + ' flex-1 font-mono min-w-0'} style={cSty}
            onChange={(e) => onChange(idx, { datapoint: e.target.value || undefined })} />
          <button type="button" onClick={() => onPickDp(idx)}
            className="px-2 rounded-lg shrink-0" style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>…</button>
        </div>
      )}
      {hasBool && (
        <>
          <input type="text" value={slot.trueLabel ?? ''} placeholder="Text wenn aktiv (z.B. Scharf)" className={cCls} style={cSty}
            onChange={(e) => onChange(idx, { trueLabel: e.target.value || undefined })} />
          <input type="text" value={slot.falseLabel ?? ''} placeholder="Text wenn inaktiv (z.B. Aus)" className={cCls} style={cSty}
            onChange={(e) => onChange(idx, { falseLabel: e.target.value || undefined })} />
        </>
      )}
    </div>
  );
}

function GroupMobileOrderPanel({ defId }: { defId: string }) {
  const children = useGroupDefsStore((s) => s.defs[defId] ?? []);
  const setChildren = (next: WidgetConfig[]) => useGroupDefsStore.getState().setDef(defId, next);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const sorted = [...children].sort((a, b) => {
    const oa = a.mobileOrder ?? (a.gridPos.y * 1000 + a.gridPos.x);
    const ob = b.mobileOrder ?? (b.gridPos.y * 1000 + b.gridPos.x);
    return oa - ob;
  });

  const applyOrder = (reordered: WidgetConfig[]) =>
    setChildren(children.map((c) => {
      const idx = reordered.findIndex((r) => r.id === c.id);
      return idx === -1 ? c : { ...c, mobileOrder: idx };
    }));

  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= sorted.length) return;
    const r = [...sorted]; const [m] = r.splice(from, 1); r.splice(to, 0, m); applyOrder(r);
  };

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setOverIdx(null); return; }
    const r = [...sorted]; const [m] = r.splice(dragIdx, 1); r.splice(targetIdx, 0, m);
    applyOrder(r); setDragIdx(null); setOverIdx(null);
  };

  return (
    <div className="rounded-lg overflow-hidden min-w-[260px]" style={{ border: '1px solid var(--app-border)' }}>
      {sorted.map((child, i) => (
        <div
          key={child.id}
          draggable
          onDragStart={() => setDragIdx(i)}
          onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
          onDragLeave={() => setOverIdx(null)}
          onDrop={() => handleDrop(i)}
          onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
          className="flex items-center gap-1.5 px-2 py-1.5 select-none"
          style={{
            background: dragIdx === i ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : overIdx === i ? 'color-mix(in srgb, var(--accent) 6%, var(--app-bg))' : 'var(--app-bg)',
            borderBottom: '1px solid var(--app-border)',
            borderLeft: overIdx === i ? '2px solid var(--accent)' : '2px solid transparent',
            opacity: dragIdx === i ? 0.5 : 1,
            cursor: 'grab',
          }}
        >
          <GripVertical size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <span className="text-xs font-mono w-4 shrink-0 text-center" style={{ color: 'var(--text-secondary)' }}>{i + 1}</span>
          <span className="flex-1 text-xs truncate" style={{ color: 'var(--text-primary)' }}>
            {child.title || child.type}
          </span>
          <div className="flex flex-col gap-0.5 shrink-0">
            <button onClick={() => moveItem(i, i - 1)} disabled={i === 0}
              className="w-5 h-4 flex items-center justify-center rounded text-[9px] hover:opacity-80 disabled:opacity-20"
              style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>▲</button>
            <button onClick={() => moveItem(i, i + 1)} disabled={i === sorted.length - 1}
              className="w-5 h-4 flex items-center justify-center rounded text-[9px] hover:opacity-80 disabled:opacity-20"
              style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>▼</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── SliderEditPanel ───────────────────────────────────────────────────────────

type SlAction = { id: string; icon: string; label?: string; dp: string; value?: string };

function SliderEditPanel({
  config, onConfigChange, onOpenActionPicker,
}: {
  config: WidgetConfig;
  onConfigChange: (c: WidgetConfig) => void;
  onOpenActionPicker: (idx: number) => void;
}) {
  const o = config.options ?? {};
  const setO = (patch: Record<string, unknown>) =>
    onConfigChange({ ...config, options: { ...o, ...patch } });
  const t = useT();

  const sInputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono';
  const sInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
  const numInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)', width: '72px' };
  const isVertical = (o.orientation as string) === 'vertical';

  const actions = (o.actions as SlAction[] | undefined) ?? [];
  const [actionIconPickerIdx, setActionIconPickerIdx] = useState<number | null>(null);
  const [addingAction, setAddingAction] = useState(false);
  const [newActionIcon, setNewActionIcon] = useState('Play');
  const [newActionLabel, setNewActionLabel] = useState('');

  const addAction = () => {
    const next = [...actions, { id: String(Date.now()), icon: newActionIcon, label: newActionLabel || undefined, dp: '' }];
    setO({ actions: next });
    setAddingAction(false);
    setNewActionIcon('Play');
    setNewActionLabel('');
  };

  const removeAction = (id: string) => setO({ actions: actions.filter((a) => a.id !== id) });

  const updateAction = (id: string, patch: Partial<SlAction>) =>
    setO({ actions: actions.map((a) => a.id === id ? { ...a, ...patch } : a) });

  return (
    <>
      {/* Wertebereich */}
      <details className="group" open>
        <summary className="flex items-center justify-between cursor-pointer list-none select-none mb-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Wertebereich</span>
          <ChevronDown size={12} className="transition-transform group-open:rotate-180" style={{ color: 'var(--text-secondary)' }} />
        </summary>
        <div className="space-y-2">
          <div className="flex gap-2 items-center flex-wrap">
            {(['min', 'max', 'step'] as const).map((k) => (
              <div key={k} className="flex items-center gap-1">
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {t((`sl.range.${k}`) as never)}
                </span>
                <input
                  type="number"
                  value={(o[k] as number) ?? (k === 'max' ? 100 : k === 'step' ? 1 : 0)}
                  onChange={(e) => setO({ [k]: Number(e.target.value) })}
                  className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                  style={numInputStyle}
                />
              </div>
            ))}
          </div>
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
              {t('sl.range.unit' as never)}
            </label>
            <input
              type="text"
              value={(o.unit as string) ?? ''}
              onChange={(e) => setO({ unit: e.target.value || undefined })}
              placeholder="z.B. %, °C, dB"
              className={sInputCls}
              style={sInputStyle}
            />
          </div>
        </div>
      </details>

      {/* Slider-Optik */}
      <details className="group">
        <summary className="flex items-center justify-between cursor-pointer list-none select-none mb-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Slider-Optik</span>
          <ChevronDown size={12} className="transition-transform group-open:rotate-180" style={{ color: 'var(--text-secondary)' }} />
        </summary>
        <div className="space-y-2">
          {/* Orientation */}
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
              {t('sl.style.orientation' as never)}
            </label>
            <div className="flex gap-1">
              {(['horizontal', 'vertical'] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => setO({ orientation: dir })}
                  className="flex-1 text-xs py-1.5 rounded-lg hover:opacity-80"
                  style={{
                    background: (o.orientation ?? 'horizontal') === dir ? 'var(--accent)' : 'var(--app-bg)',
                    color: (o.orientation ?? 'horizontal') === dir ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid var(--app-border)',
                  }}
                >
                  {t((`sl.style.${dir}`) as never)}
                </button>
              ))}
            </div>
            {isVertical && (
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                Tipp: Widget-Größe auf ca. 4 × 8 anpassen für optimale Darstellung.
              </p>
            )}
          </div>
          {/* Bar-Stil */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!o.barStyle}
              onChange={(e) => setO({ barStyle: e.target.checked || undefined })}
              className="rounded"
            />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {t('sl.style.barStyle' as never)}
            </span>
          </label>
          {/* Bar-Breite oder Track-Breite */}
          {o.barStyle ? (
            <div className="flex items-center gap-1">
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {t('sl.style.barSize' as never)}
              </span>
              <input
                type="number"
                min={5}
                max={100}
                value={(o.barSize as number) ?? 100}
                onChange={(e) => setO({ barSize: Number(e.target.value) })}
                className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                style={numInputStyle}
              />
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {t('sl.style.thickness' as never)}
              </span>
              <input
                type="number"
                min={2}
                max={24}
                value={(o.sliderThickness as number) ?? 6}
                onChange={(e) => setO({ sliderThickness: Number(e.target.value) })}
                className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                style={numInputStyle}
              />
            </div>
          )}
          {/* Farbe */}
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
              {t('sl.style.color' as never)}
            </label>
            <div className="flex gap-1 items-center">
              <input
                type="color"
                value={(o.color as string) || '#3b82f6'}
                onChange={(e) => setO({ color: e.target.value })}
                className="w-8 h-7 rounded cursor-pointer border-0 p-0"
                style={{ background: 'none' }}
              />
              <input
                type="text"
                value={(o.color as string) ?? ''}
                onChange={(e) => setO({ color: e.target.value || undefined })}
                placeholder="var(--accent)"
                className="flex-1 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                style={sInputStyle}
              />
            </div>
          </div>
          {/* Commit on release */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!o.commitOnRelease}
              onChange={(e) => setO({ commitOnRelease: e.target.checked || undefined })}
              className="rounded"
            />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {t('sl.style.commitOnRelease' as never)}
            </span>
          </label>
          {/* Read-only / Fortschrittsanzeige */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!o.readOnly}
              onChange={(e) => setO({ readOnly: e.target.checked || undefined })}
              className="rounded"
            />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {t('sl.style.readOnly' as never)}
            </span>
          </label>
        </div>
      </details>

      {/* Aktions-Buttons */}
      <details className="group">
        <summary className="flex items-center justify-between cursor-pointer list-none select-none mb-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
            {t('sl.actions.title' as never)}
          </span>
          <ChevronDown size={12} className="transition-transform group-open:rotate-180" style={{ color: 'var(--text-secondary)' }} />
        </summary>
        <div className="space-y-1.5">
          {actions.map((action, idx) => (
            <div key={action.id} className="rounded-lg p-2 space-y-1.5" style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActionIconPickerIdx(idx)}
                  className="text-[10px] px-1.5 py-1 rounded hover:opacity-80 shrink-0"
                  style={{ background: 'var(--app-surface,var(--app-bg))', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                  title={t('sl.actions.icon' as never)}
                >
                  {action.icon || '?'}
                </button>
                <input
                  type="text"
                  value={action.label ?? ''}
                  onChange={(e) => updateAction(action.id, { label: e.target.value || undefined })}
                  placeholder={t('sl.actions.label' as never)}
                  className="flex-1 text-xs rounded px-2 py-1 focus:outline-none min-w-0"
                  style={sInputStyle}
                />
                <button onClick={() => removeAction(action.id)} className="hover:opacity-70 shrink-0" style={{ color: 'var(--accent-red, #ef4444)' }}>
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="flex gap-1 items-center">
                <input
                  type="text"
                  value={action.dp}
                  onChange={(e) => updateAction(action.id, { dp: e.target.value })}
                  placeholder="DP-ID"
                  className={`flex-1 ${sInputCls} min-w-0`}
                  style={sInputStyle}
                />
                <button
                  onClick={() => onOpenActionPicker(idx)}
                  className="px-2 rounded-lg hover:opacity-80 shrink-0"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                >
                  <Database size={13} />
                </button>
              </div>
              <input
                type="text"
                value={action.value ?? ''}
                onChange={(e) => updateAction(action.id, { value: e.target.value || undefined })}
                placeholder={t('sl.actions.value' as never)}
                className={`w-full ${sInputCls}`}
                style={sInputStyle}
              />
            </div>
          ))}
          {addingAction ? (
            <div className="rounded-lg p-2 space-y-1.5" style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
              <div className="flex gap-1 items-center">
                <button
                  onClick={() => setActionIconPickerIdx(-1)}
                  className="text-[10px] px-1.5 py-1 rounded hover:opacity-80 shrink-0"
                  style={{ background: 'var(--app-surface,var(--app-bg))', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                >
                  {newActionIcon}
                </button>
                <input
                  type="text"
                  value={newActionLabel}
                  onChange={(e) => setNewActionLabel(e.target.value)}
                  placeholder={t('sl.actions.label' as never)}
                  className="flex-1 text-xs rounded px-2 py-1 focus:outline-none min-w-0"
                  style={sInputStyle}
                  autoFocus
                />
              </div>
              <div className="flex gap-1">
                <button
                  onClick={addAction}
                  className="flex-1 text-xs py-1 rounded-lg hover:opacity-80"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {t('common.add')}
                </button>
                <button
                  onClick={() => { setAddingAction(false); setNewActionLabel(''); }}
                  className="flex-1 text-xs py-1 rounded-lg hover:opacity-80"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingAction(true)}
              className="w-full text-[11px] py-1.5 rounded-lg hover:opacity-80 text-center"
              style={{ background: 'var(--app-bg)', color: 'var(--accent)', border: '1px dashed var(--accent)44' }}
            >
              {t('sl.actions.add' as never)}
            </button>
          )}
        </div>
      </details>

      {/* Action icon picker */}
      {actionIconPickerIdx !== null && (
        <IconPickerModal
          current={actionIconPickerIdx === -1 ? newActionIcon : (actions[actionIconPickerIdx]?.icon ?? '')}
          onSelect={(name) => {
            if (actionIconPickerIdx === -1) {
              setNewActionIcon(name || 'Play');
            } else {
              updateAction(actions[actionIconPickerIdx].id, { icon: name || 'Play' });
            }
            setActionIconPickerIdx(null);
          }}
          onClose={() => setActionIconPickerIdx(null)}
        />
      )}
    </>
  );
}

// ── MediaplayerEditPanel ──────────────────────────────────────────────────────

type MpChip = { id: string; label: string; icon?: string; dp: string; value?: string };

function MediaplayerEditPanel({
  config, onConfigChange, onOpenPicker, onOpenChipPicker,
}: {
  config: WidgetConfig;
  onConfigChange: (c: WidgetConfig) => void;
  onOpenPicker: (key: string) => void;
  onOpenChipPicker: (idx: number) => void;
}) {
  const o = config.options ?? {};
  const setO = (patch: Record<string, unknown>) =>
    onConfigChange({ ...config, options: { ...o, ...patch } });
  const t = useT();

  const sInputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono';
  const sInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
  const numInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)', width: '72px' };

  const chips = (o.chips as MpChip[] | undefined) ?? [];
  const [addingChip, setAddingChip] = useState(false);
  const [newChipLabel, setNewChipLabel] = useState('');
  const [newChipValue, setNewChipValue] = useState('');
  const [chipIconPickerIdx, setChipIconPickerIdx] = useState<number | null>(null);
  const [detectedDevices, setDetectedDevices] = useState<DetectedMediaDevice[] | null>(null);
  const [detecting, setDetecting] = useState(false);

  const runDetection = async () => {
    setDetecting(true);
    try {
      const entries = await ensureDatapointCache();
      const devices = detectMediaDevices(entries);

      // Enrich labels: fetch live name + serial for adapters that provide those DPs
      const enriched = await Promise.all(devices.map(async (dev) => {
        if (!dev.nameDp) return dev;
        try {
          const [nameState, serialState] = await Promise.all([
            getStateDirect(dev.nameDp),
            dev.serialDp ? getStateDirect(dev.serialDp) : Promise.resolve(null),
          ]);
          const name   = nameState?.val   ? String(nameState.val)   : null;
          const serial = serialState?.val ? String(serialState.val) : null;
          if (name) {
            const label = `${dev.adapter === 'alexa2' ? 'Alexa' : dev.adapter} — ${name}${serial ? ` (${serial})` : ''}`;
            return { ...dev, label };
          }
        } catch { /* keep fallback label */ }
        return dev;
      }));

      setDetectedDevices(enriched);
    } finally {
      setDetecting(false);
    }
  };

  const applyDevice = (device: DetectedMediaDevice) => {
    setO(device.config as Record<string, unknown>);
    setDetectedDevices(null);
  };

  const dpRow = (labelKey: string, optKey: string) => (
    <div key={optKey}>
      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t(labelKey as never)}</label>
      <div className="flex gap-1">
        <input type="text" value={(o[optKey] as string) ?? ''}
          onChange={(e) => setO({ [optKey]: e.target.value || undefined })}
          placeholder="optional"
          className={`flex-1 ${sInputCls} min-w-0`} style={sInputStyle} />
        <button onClick={() => onOpenPicker(optKey)}
          className="px-2 rounded-lg hover:opacity-80 shrink-0"
          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
          <Database size={13} />
        </button>
      </div>
    </div>
  );

  const confirmAddChip = () => {
    if (!newChipLabel.trim()) return;
    const next: MpChip = { id: Date.now().toString(), label: newChipLabel.trim(), dp: '', value: newChipValue.trim() || undefined };
    setO({ chips: [...chips, next] });
    setNewChipLabel(''); setNewChipValue('');
    setAddingChip(false);
  };

  const updateChip = (id: string, patch: Partial<MpChip>) =>
    setO({ chips: chips.map((c) => c.id === id ? { ...c, ...patch } : c) });

  const removeChip = (id: string) =>
    setO({ chips: chips.filter((c) => c.id !== id) });

  const moveChip = (id: string, dir: -1 | 1) => {
    const idx = chips.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= chips.length) return;
    const arr = [...chips];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    setO({ chips: arr });
  };

  return (
    <>
      {/* Gerät automatisch erkennen */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Gerät erkennen</span>
          <button
            onClick={() => void runDetection()}
            disabled={detecting}
            className="text-[10px] px-2 py-0.5 rounded hover:opacity-80 disabled:opacity-50"
            style={{ background: 'var(--accent)22', color: 'var(--accent)', border: '1px solid var(--accent)44' }}>
            {detecting ? '…' : 'Suchen'}
          </button>
        </div>
        {detectedDevices !== null && (
          detectedDevices.length === 0 ? (
            <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Keine bekannten Geräte gefunden.</p>
          ) : (
            <div className="space-y-1">
              {detectedDevices.map((dev) => (
                <button
                  key={dev.id}
                  onClick={() => applyDevice(dev)}
                  className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg hover:opacity-80 truncate"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                  title={dev.id}
                >
                  <span className="font-medium">{dev.label}</span>
                  <span className="ml-1.5 opacity-50">{dev.adapter}</span>
                </button>
              ))}
            </div>
          )
        )}
      </div>

      {/* Anzeige-DPs */}
      <details className="group" open>
        <summary className="flex items-center justify-between cursor-pointer list-none select-none mb-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{t('mp.displayDps' as never)}</span>
          <ChevronDown size={12} className="transition-transform group-open:rotate-180" style={{ color: 'var(--text-secondary)' }} />
        </summary>
        <div className="space-y-2">
          {dpRow('mp.dp.title',     'titleDp')}
          {dpRow('mp.dp.artist',    'artistDp')}
          {dpRow('mp.dp.album',     'albumDp')}
          {dpRow('mp.dp.cover',     'coverDp')}
          {dpRow('mp.dp.source',    'sourceDp')}
          {dpRow('mp.dp.playState',        'playStateDp')}
          {dpRow('mp.dp.volume',           'volumeDp')}
          {dpRow('mp.dp.mute',             'muteDp')}
          {dpRow('mp.dp.mediaProgress'    as never, 'mediaProgressDp')}
          {dpRow('mp.dp.mediaLength'      as never, 'mediaLengthDp')}
          {dpRow('mp.dp.mediaProgressStr' as never, 'mediaProgressStrDp')}
          {dpRow('mp.dp.mediaLengthStr'   as never, 'mediaLengthStrDp')}
        </div>
      </details>

      {/* Steuerungs-DPs */}
      <details className="group">
        <summary className="flex items-center justify-between cursor-pointer list-none select-none mb-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{t('mp.controlDps' as never)}</span>
          <ChevronDown size={12} className="transition-transform group-open:rotate-180" style={{ color: 'var(--text-secondary)' }} />
        </summary>
        <div className="space-y-2">
          {dpRow('mp.dp.play',    'playDp')}
          {dpRow('mp.dp.pause',   'pauseDp')}
          {dpRow('mp.dp.stop',    'stopDp')}
          {dpRow('mp.dp.next',    'nextDp')}
          {dpRow('mp.dp.prev',    'prevDp')}
          {dpRow('mp.dp.shuffle', 'shuffleDp')}
          {dpRow('mp.dp.repeat',  'repeatDp')}
        </div>
      </details>

      {/* Volume-Bereich */}
      <details className="group">
        <summary className="flex items-center justify-between cursor-pointer list-none select-none mb-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{t('mp.volumeRange' as never)}</span>
          <ChevronDown size={12} className="transition-transform group-open:rotate-180" style={{ color: 'var(--text-secondary)' }} />
        </summary>
        <div className="flex gap-2 items-center flex-wrap">
          {(['min', 'max', 'step'] as const).map((k) => (
            <div key={k} className="flex items-center gap-1">
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {t((`mp.vol.${k}`) as never)}
              </span>
              <input
                type="number"
                value={(o[`volume${k.charAt(0).toUpperCase() + k.slice(1)}`] as number) ?? (k === 'min' ? 0 : k === 'max' ? 100 : 1)}
                onChange={(e) => setO({ [`volume${k.charAt(0).toUpperCase() + k.slice(1)}`]: Number(e.target.value) })}
                className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                style={numInputStyle}
              />
            </div>
          ))}
        </div>
      </details>

      {/* Chips */}
      <details className="group">
        <summary className="flex items-center justify-between cursor-pointer list-none select-none mb-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{t('mp.chips.title' as never)}</span>
          <ChevronDown size={12} className="transition-transform group-open:rotate-180" style={{ color: 'var(--text-secondary)' }} />
        </summary>
        <div className="space-y-1.5">
          {chips.map((chip, idx) => (
            <div key={chip.id} className="rounded-lg p-2 space-y-1.5" style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
              <div className="flex items-center gap-1">
                <div className="flex flex-col shrink-0">
                  <button onClick={() => moveChip(chip.id, -1)} disabled={idx === 0}
                    className="text-[9px] px-1 py-0.5 rounded hover:opacity-80 disabled:opacity-30 leading-none"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                    title="Nach oben">▲</button>
                  <button onClick={() => moveChip(chip.id, 1)} disabled={idx === chips.length - 1}
                    className="text-[9px] px-1 py-0.5 rounded hover:opacity-80 disabled:opacity-30 leading-none mt-0.5"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                    title="Nach unten">▼</button>
                </div>
                <button
                  onClick={() => setChipIconPickerIdx(idx)}
                  className="text-[10px] px-1.5 py-1 rounded hover:opacity-80 shrink-0"
                  style={{ background: 'var(--app-surface,var(--app-bg))', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                  title="Icon wählen">
                  {chip.icon ? chip.icon : '🎵'}
                </button>
                <input type="text" value={chip.label}
                  onChange={(e) => updateChip(chip.id, { label: e.target.value })}
                  placeholder={t('mp.chips.label' as never)}
                  className="flex-1 text-xs rounded px-2 py-1 focus:outline-none min-w-0"
                  style={sInputStyle} />
                <button onClick={() => removeChip(chip.id)} className="hover:opacity-70 shrink-0" style={{ color: 'var(--accent-red, #ef4444)' }}>
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="flex gap-1 items-center">
                <input type="text" value={chip.dp}
                  onChange={(e) => updateChip(chip.id, { dp: e.target.value })}
                  placeholder="DP-ID"
                  className={`flex-1 ${sInputCls} min-w-0`} style={sInputStyle} />
                <button onClick={() => onOpenChipPicker(idx)}
                  className="px-2 rounded-lg hover:opacity-80 shrink-0"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                  <Database size={13} />
                </button>
              </div>
              <input type="text" value={chip.value ?? ''}
                onChange={(e) => updateChip(chip.id, { value: e.target.value || undefined })}
                placeholder={t('mp.chips.value' as never)}
                className={`w-full ${sInputCls}`} style={sInputStyle} />
            </div>
          ))}
          {addingChip ? (
            <div className="rounded-lg p-2 space-y-1.5" style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
              <input type="text" value={newChipLabel}
                onChange={(e) => setNewChipLabel(e.target.value)}
                placeholder={t('mp.chips.label' as never)}
                className={`w-full ${sInputCls}`} style={sInputStyle} autoFocus />
              <input type="text" value={newChipValue}
                onChange={(e) => setNewChipValue(e.target.value)}
                placeholder={t('mp.chips.value' as never)}
                className={`w-full ${sInputCls}`} style={sInputStyle} />
              <div className="flex gap-1">
                <button onClick={confirmAddChip}
                  className="flex-1 text-xs py-1 rounded-lg hover:opacity-80"
                  style={{ background: 'var(--accent)', color: '#fff' }}>
                  {t('common.add')}
                </button>
                <button onClick={() => { setAddingChip(false); setNewChipLabel(''); setNewChipValue(''); }}
                  className="flex-1 text-xs py-1 rounded-lg hover:opacity-80"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingChip(true)}
              className="w-full text-[11px] py-1.5 rounded-lg hover:opacity-80 text-center"
              style={{ background: 'var(--app-bg)', color: 'var(--accent)', border: '1px dashed var(--accent)44' }}>
              {t('mp.chips.add' as never)}
            </button>
          )}
        </div>
      </details>

      {/* Chip icon picker */}
      {chipIconPickerIdx !== null && (
        <IconPickerModal
          current={chips[chipIconPickerIdx]?.icon ?? ''}
          onSelect={(name) => {
            updateChip(chips[chipIconPickerIdx].id, { icon: name || undefined });
            setChipIconPickerIdx(null);
          }}
          onClose={() => setChipIconPickerIdx(null)}
        />
      )}
    </>
  );
}

// ── ChipsEditPanel ────────────────────────────────────────────────────────────

type CwChip = { id: string; label: string; icon?: string; dp: string; value?: string; activeValue?: string };

function ChipsEditPanel({
  config, onConfigChange, onOpenChipPicker, onOpenCheckDpPicker,
}: {
  config: WidgetConfig;
  onConfigChange: (c: WidgetConfig) => void;
  onOpenChipPicker: (idx: number) => void;
  onOpenCheckDpPicker: () => void;
}) {
  const o = config.options ?? {};
  const setO = (patch: Record<string, unknown>) =>
    onConfigChange({ ...config, options: { ...o, ...patch } });
  const tHook = useT();

  const sInputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono';
  const sInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
  const selCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';

  const chips = (o.chips as CwChip[] | undefined) ?? [];
  const [addingChip, setAddingChip] = useState(false);
  const [newChipLabel, setNewChipLabel] = useState('');
  const [chipIconPickerIdx, setChipIconPickerIdx] = useState<number | null>(null);

  const confirmAddChip = () => {
    if (!newChipLabel.trim()) return;
    const next: CwChip = { id: Date.now().toString(), label: newChipLabel.trim(), dp: '' };
    setO({ chips: [...chips, next] });
    setNewChipLabel('');
    setAddingChip(false);
  };

  const updateChip = (id: string, patch: Partial<CwChip>) =>
    setO({ chips: chips.map((c) => c.id === id ? { ...c, ...patch } : c) });

  const removeChip = (id: string) =>
    setO({ chips: chips.filter((c) => c.id !== id) });

  const moveChip = (id: string, dir: -1 | 1) => {
    const idx = chips.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= chips.length) return;
    const arr = [...chips];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    setO({ chips: arr });
  };

  const layout = (o.layout as string) ?? 'row';

  return (
    <>
      {/* Layout */}
      <details className="group" open>
        <summary className="flex items-center justify-between cursor-pointer list-none select-none mb-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{tHook('cw.layout.title' as never)}</span>
          <ChevronDown size={12} className="transition-transform group-open:rotate-180" style={{ color: 'var(--text-secondary)' }} />
        </summary>
        <div className="space-y-2">
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{tHook('cw.layout.mode' as never)}</label>
            <select value={layout} onChange={(e) => setO({ layout: e.target.value })} className={selCls} style={sInputStyle}>
              <option value="row">{tHook('cw.layout.row' as never)}</option>
              <option value="wrap">{tHook('cw.layout.wrap' as never)}</option>
              <option value="column">{tHook('cw.layout.column' as never)}</option>
              <option value="grid">{tHook('cw.layout.grid' as never)}</option>
            </select>
          </div>
          {(layout === 'row' || layout === 'wrap' || layout === 'grid') && (
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{tHook('cw.layout.align' as never)}</label>
              <select value={(o.align as string) ?? 'start'} onChange={(e) => setO({ align: e.target.value })} className={selCls} style={sInputStyle}>
                <option value="start">Start</option>
                <option value="center">Mitte</option>
                <option value="end">Ende</option>
              </select>
            </div>
          )}
          {layout === 'column' && (
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{tHook('cw.layout.align' as never)}</label>
              <select value={(o.align as string) ?? 'start'} onChange={(e) => setO({ align: e.target.value })} className={selCls} style={sInputStyle}>
                <option value="start">Links</option>
                <option value="center">Mitte</option>
                <option value="end">Rechts</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{tHook('cw.layout.valign' as never)}</label>
            <select value={(o.valign as string) ?? 'middle'} onChange={(e) => setO({ valign: e.target.value })} className={selCls} style={sInputStyle}>
              <option value="top">Oben</option>
              <option value="middle">Mitte</option>
              <option value="bottom">Unten</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{tHook('cw.layout.chipSize' as never)}</label>
            <select value={(o.chipSize as string) ?? 'md'} onChange={(e) => setO({ chipSize: e.target.value })} className={selCls} style={sInputStyle}>
              <option value="sm">{tHook('cw.size.sm' as never)}</option>
              <option value="md">{tHook('cw.size.md' as never)}</option>
              <option value="lg">{tHook('cw.size.lg' as never)}</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{tHook('cw.layout.chipStyle' as never)}</label>
            <select value={(o.chipStyle as string) ?? 'outlined'} onChange={(e) => setO({ chipStyle: e.target.value })} className={selCls} style={sInputStyle}>
              <option value="outlined">{tHook('cw.style.outlined' as never)}</option>
              <option value="filled">{tHook('cw.style.filled' as never)}</option>
              <option value="ghost">{tHook('cw.style.ghost' as never)}</option>
            </select>
          </div>
          {layout === 'grid' && (
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{tHook('cw.layout.wrapCols' as never)}</label>
              <input
                type="number" min={1} max={12}
                value={(o.wrapCols as number) ?? 2}
                onChange={(e) => setO({ wrapCols: Number(e.target.value) || 2 })}
                className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                style={{ ...sInputStyle, width: '72px' }}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{tHook('cw.layout.gap' as never)}</label>
            <input
              type="number" min={0} max={96}
              value={(o.gap as number) ?? 6}
              onChange={(e) => setO({ gap: Number(e.target.value) })}
              className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
              style={{ ...sInputStyle, width: '72px' }}
            />
          </div>
        </div>
      </details>

      {/* Aktiv-DP */}
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{tHook('cw.checkDp' as never)}</label>
        <div className="flex gap-1">
          <input
            type="text"
            value={(o.checkDp as string) ?? ''}
            onChange={(e) => setO({ checkDp: e.target.value || undefined })}
            placeholder="optional"
            className={`flex-1 ${sInputCls} min-w-0`}
            style={sInputStyle}
          />
          <button
            onClick={onOpenCheckDpPicker}
            className="px-2 rounded-lg hover:opacity-80 shrink-0"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
            <Database size={13} />
          </button>
        </div>
        <p className="text-[10px] mt-1 leading-snug" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
          Wird gelesen um den aktiven Chip hervorzuheben. Beispiel: ein DP der die aktuelle Szene enthält.
          Ohne Eintrag werden Chips nur als Tasten genutzt (kein Aktiv-Highlight).
        </p>
      </div>

      {/* Chips */}
      <details className="group" open>
        <summary className="flex items-center justify-between cursor-pointer list-none select-none mb-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{tHook('cw.chips.title' as never)}</span>
          <ChevronDown size={12} className="transition-transform group-open:rotate-180" style={{ color: 'var(--text-secondary)' }} />
        </summary>
        <div className="space-y-1.5">
          {chips.map((chip, idx) => (
            <div key={chip.id} className="rounded-lg p-2 space-y-1.5" style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
              <div className="flex items-center gap-1">
                <div className="flex flex-col shrink-0">
                  <button onClick={() => moveChip(chip.id, -1)} disabled={idx === 0}
                    className="text-[9px] px-1 py-0.5 rounded hover:opacity-80 disabled:opacity-30 leading-none"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                    title="Nach oben">▲</button>
                  <button onClick={() => moveChip(chip.id, 1)} disabled={idx === chips.length - 1}
                    className="text-[9px] px-1 py-0.5 rounded hover:opacity-80 disabled:opacity-30 leading-none mt-0.5"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                    title="Nach unten">▼</button>
                </div>
                <button
                  onClick={() => setChipIconPickerIdx(idx)}
                  className="text-[10px] px-1.5 py-1 rounded hover:opacity-80 shrink-0"
                  style={{ background: 'var(--app-surface,var(--app-bg))', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                  title="Icon wählen">
                  {chip.icon ? chip.icon : '🏷'}
                </button>
                <input type="text" value={chip.label}
                  onChange={(e) => updateChip(chip.id, { label: e.target.value })}
                  placeholder={tHook('cw.chips.label' as never)}
                  className="flex-1 text-xs rounded px-2 py-1 focus:outline-none min-w-0"
                  style={sInputStyle} />
                <button onClick={() => removeChip(chip.id)} className="hover:opacity-70 shrink-0" style={{ color: 'var(--accent-red, #ef4444)' }}>
                  <Trash2 size={12} />
                </button>
              </div>
              <div>
                <label className="text-[10px] mb-0.5 block" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Schreib-DP — beim Klick wird der Wert auf diesen DP geschrieben</label>
                <div className="flex gap-1 items-center">
                  <input type="text" value={chip.dp}
                    onChange={(e) => updateChip(chip.id, { dp: e.target.value })}
                    placeholder="z.B. 0_userdata.0.scenes.relaxing"
                    className={`flex-1 ${sInputCls} min-w-0`} style={sInputStyle} />
                  <button onClick={() => onOpenChipPicker(idx)}
                    className="px-2 rounded-lg hover:opacity-80 shrink-0"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                    <Database size={13} />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] mb-0.5 block" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Schreib-Wert — was beim Klick auf den DP geschrieben wird (leer = true)</label>
                <input type="text" value={chip.value ?? ''}
                  onChange={(e) => updateChip(chip.id, { value: e.target.value || undefined })}
                  placeholder="z.B. true, 1, on, relaxing"
                  className={`w-full ${sInputCls}`} style={sInputStyle} />
              </div>
              {(o.checkDp as string) && (
                <div>
                  <label className="text-[10px] mb-0.5 block" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Aktiv-Wert — Chip leuchtet wenn Aktiv-Status DP diesen Wert hat (leer = Schreib-Wert)</label>
                  <input type="text" value={chip.activeValue ?? ''}
                    onChange={(e) => updateChip(chip.id, { activeValue: e.target.value || undefined })}
                    placeholder="z.B. relaxing"
                    className={`w-full ${sInputCls}`} style={sInputStyle} />
                </div>
              )}
            </div>
          ))}
          {addingChip ? (
            <div className="rounded-lg p-2 space-y-1.5" style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
              <input type="text" value={newChipLabel}
                onChange={(e) => setNewChipLabel(e.target.value)}
                placeholder={tHook('cw.chips.label' as never)}
                className={`w-full ${sInputCls}`} style={sInputStyle} autoFocus />
              <div className="flex gap-1">
                <button onClick={confirmAddChip}
                  className="flex-1 text-xs py-1 rounded-lg hover:opacity-80"
                  style={{ background: 'var(--accent)', color: '#fff' }}>
                  {tHook('common.add')}
                </button>
                <button onClick={() => { setAddingChip(false); setNewChipLabel(''); }}
                  className="flex-1 text-xs py-1 rounded-lg hover:opacity-80"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                  {tHook('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAddingChip(true)}
              className="w-full text-[11px] py-1.5 rounded-lg hover:opacity-80 text-center"
              style={{ background: 'var(--app-bg)', color: 'var(--accent)', border: '1px dashed var(--accent)44' }}>
              {tHook('cw.chips.add' as never)}
            </button>
          )}
        </div>
      </details>

      {/* Bestätigung */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox"
            checked={o.showConfirm === true}
            onChange={(e) => setO({ showConfirm: e.target.checked || undefined })}
          />
          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{tHook('cw.confirm.enable' as never)}</span>
        </label>
        {o.showConfirm === true && (
          <input type="text"
            value={(o.confirmText as string) ?? ''}
            onChange={(e) => setO({ confirmText: e.target.value || undefined })}
            placeholder={tHook('cw.confirm.text' as never)}
            className={`w-full ${sInputCls}`} style={sInputStyle} />
        )}
      </div>

      {/* Chip icon picker */}
      {chipIconPickerIdx !== null && (
        <IconPickerModal
          current={chips[chipIconPickerIdx]?.icon ?? ''}
          onSelect={(name) => {
            updateChip(chips[chipIconPickerIdx].id, { icon: name || undefined });
            setChipIconPickerIdx(null);
          }}
          onClose={() => setChipIconPickerIdx(null)}
        />
      )}
    </>
  );
}

export function WidgetFrame({ config, editMode, onRemove, onConfigChange, onDuplicate }: WidgetFrameProps) {
  const t = useT();
  const { defaultDecimals } = useGlobalSettingsStore();
  const [openPanel, setOpenPanel] = useState<'menu' | 'edit' | 'conditions' | 'action' | 'group-mobile-order' | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [showGroupTypePicker, setShowGroupTypePicker] = useState(false);
  const { addWidgetToLayoutTab, removeWidgetFromLayoutTab } = useDashboardStore();
  const activeLayoutId = useDashboardStore((s) => s.activeLayoutId);
  const { activeTabId, tabs: activeTabs } = useActiveLayout();
  // Stable across widget-only mutations: only changes when tabs/layouts are added, removed, or renamed.
  const moveTargets = useStoreWithEqualityFn(
    useDashboardStore,
    (s) => {
      const aid = s.activeLayoutId;
      const atid = s.layouts.find((l) => l.id === aid)?.activeTabId;
      return s.layouts.flatMap((l) =>
        l.tabs
          .filter((t) => !(l.id === aid && t.id === atid))
          .map((t) => ({ layoutId: l.id, layoutName: l.name, tabId: t.id, tabName: t.name })),
      );
    },
    (a, b) =>
      a.length === b.length &&
      a.every((ai, i) =>
        ai.layoutId === b[i].layoutId &&
        ai.tabId === b[i].tabId &&
        ai.layoutName === b[i].layoutName &&
        ai.tabName === b[i].tabName
      ),
  );
  const moveLayoutCount = new Set(moveTargets.map((m) => m.layoutId)).size;

  // Stable reference: never create a new [] on every render (would cause infinite effect loop)
  const conditions = (config.options?.conditions as WidgetCondition[] | undefined) ?? NO_CONDITIONS;

  // GROUP / CAROUSEL widgets: create a fresh defId + clone children so copies are independent
  function copyConfig(src: WidgetConfig): WidgetConfig {
    if ((src.type === 'group' || src.type === 'carousel') && src.options?.defId) {
      return { ...src, options: { ...src.options, defId: cloneGroupDef(src.options.defId as string) } };
    }
    return src;
  }

  // Evaluate conditions against live ioBroker values
  const conditionResult = useConditionStyle(conditions);

  // Register/release this widget in the panel coordinator.
  // NOTE: do NOT clean the reflow-hidden registry here — when a widget moves
  // between the visible grid and the off-screen reflow container it unmounts
  // and remounts in a different parent. The async cleanup would race with the
  // new instance's useLayoutEffect and yank a still-valid entry out of the
  // registry, causing the widget to never settle in either container.
  useEffect(() => {
    return () => {
      releasePanel(config.id);
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
      setShowGroupTypePicker(false);
      releasePanel(config.id);
    } else {
      claimPanel(config.id, () => setOpenPanel(null));
      setOpenPanel(panel);
    }
  };
  const [pickerTarget, setPickerTarget] = useState<'datapoint' | 'actualDatapoint' | 'localTempDatapoint' | 'shutter_activityDp' | 'shutter_directionDp' | 'shutter_stopDp' | 'shutter_openDp' | 'shutter_closeDp' | 'dimmer_switchDp' | 'gauge_pointer2Dp' | 'gauge_pointer3Dp' | 'windowcontact_batteryDp' | 'wc_lockDp' | 'status_batteryDp' | 'status_unreachDp' | 'camera_wakeUpDp' | 'camera_slot' | 'html_dp' | 'mp_dp' | 'mp_chip' | 'sl_action' | 'chips_chip' | 'chips_checkDp' | 'http_response_dp' | 'climate_humidityDp' | 'climate_targetDp' | 'iframe_urlDp' | 'light_switchDp' | 'light_brightnessDp' | 'light_hueDp' | 'light_saturationDp' | 'light_rDp' | 'light_gDp' | 'light_bDp' | 'light_colorDp' | 'light_temperatureDp' | 'light_effectDp' | null>(null);
  const [imageFilePicker, setImageFilePicker] = useState(false);
  const [pendingTypeChange, setPendingTypeChange] = useState<{
    suggestedType: WidgetType;
    currentType: WidgetType;
    onSwitch: () => void;
    onKeep: () => void;
  } | null>(null);
  const [cameraSlotPickerIdx, setCameraSlotPickerIdx] = useState(0);
  const [mpPickerKey, setMpPickerKey] = useState('');
  const [mpChipIdx, setMpChipIdx] = useState(0);
  const [chipsChipIdx, setChipsChipIdx] = useState(0);
  const [slActionIdx, setSlActionIdx] = useState(0);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconPickerTrueOpen,  setIconPickerTrueOpen]  = useState(false);
  const [iconPickerFalseOpen, setIconPickerFalseOpen] = useState(false);
  const [wcIconPickerState,  setWcIconPickerState]  = useState<'closed' | 'tilted' | 'open' | null>(null);
  const [wcImagePickerState, setWcImagePickerState] = useState<'closed' | 'tilted' | 'open' | null>(null);
  const [siImagePickerState, setSiImagePickerState] = useState<'true' | 'false' | null>(null);
  const [selectedCustomCell,   setSelectedCustomCell]   = useState<number | null>(null);
  const [customCellDragIdx,    setCustomCellDragIdx]    = useState<number | null>(null);
  const [customCellDragOver,   setCustomCellDragOver]   = useState<number | null>(null);
  const [customCellOverwrite,  setCustomCellOverwrite]  = useState<
    | { kind: 'drop'; from: number; to: number; mode: 'move' | 'copy' }
    | { kind: 'paste'; to: number; cell: CustomCell }
    | null
  >(null);
  const [customCellContextMenu, setCustomCellContextMenu] = useState<{ idx: number; x: number; y: number } | null>(null);
  const cellClipboard = useCellClipboard();
  const widgetFramePortalTarget = usePortalTarget();
  const [customCellPickerOpen,      setCustomCellPickerOpen]      = useState(false);
  const [customCellImagePickerOpen, setCustomCellImagePickerOpen] = useState(false);
  const [customCellIconPicker, setCustomCellIconPicker] = useState<'iconName' | 'trueIcon' | 'falseIcon' | null>(null);
  const [draftIconSize, setDraftIconSize] = useState<number | null>(null);

  // ── Custom-cell copy/cut/paste helpers (used by context menu + keyboard shortcuts) ──
  const resolveCustomGrid = (): CustomGridDef => {
    const fb = config.type === 'universal' ? DEFAULT_UNIVERSAL_GRID : config.type === 'knob' ? DEFAULT_KNOB_GRID : DEFAULT_CUSTOM_GRID;
    return normalizeGrid(config.options?.customGrid, fb);
  };
  const writeCustomGrid = (g: CustomGridDef) => {
    onConfigChange({ ...config, options: { ...(config.options ?? {}), customGrid: g } });
  };
  const cellCopy = (idx: number) => {
    const g = resolveCustomGrid();
    const c = g.cells[idx];
    if (!c || c.type === 'empty') return;
    setCellClipboard({ ...c });
  };
  const cellCut = (idx: number) => {
    const g = resolveCustomGrid();
    const c = g.cells[idx];
    if (!c || c.type === 'empty') return;
    setCellClipboard({ ...c });
    writeCustomGrid({ ...g, cells: g.cells.map((cc, i) => i === idx ? { type: 'empty' as const } : cc) });
  };
  const cellPaste = (idx: number) => {
    const clip = cellClipboardData;
    if (!clip) return;
    const g = resolveCustomGrid();
    const tgt = g.cells[idx];
    if (tgt && tgt.type !== 'empty') {
      setCustomCellOverwrite({ kind: 'paste', to: idx, cell: { ...clip } });
      return;
    }
    writeCustomGrid({ ...g, cells: g.cells.map((c, i) => i === idx ? { ...clip } : c) });
    setSelectedCustomCell(idx);
  };
  const cellClear = (idx: number) => {
    const g = resolveCustomGrid();
    writeCustomGrid({ ...g, cells: g.cells.map((c, i) => i === idx ? { type: 'empty' as const } : c) });
  };

  // Ctrl+C / Ctrl+X / Ctrl+V on the selected custom cell
  useEffect(() => {
    if (selectedCustomCell === null) return;
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'c') { e.preventDefault(); cellCopy(selectedCustomCell); }
      else if (k === 'x') { e.preventDefault(); cellCut(selectedCustomCell); }
      else if (k === 'v') { e.preventDefault(); cellPaste(selectedCustomCell); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedCustomCell, config, onConfigChange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape + outside-click close the cell context menu
  const cellMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!customCellContextMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCustomCellContextMenu(null); };
    const onDown = (e: MouseEvent) => {
      if (cellMenuRef.current && !cellMenuRef.current.contains(e.target as Node)) {
        setCustomCellContextMenu(null);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('contextmenu', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('contextmenu', onDown, true);
    };
  }, [customCellContextMenu]);

  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const Widget = getWidgetMap()[config.type as keyof ReturnType<typeof getWidgetMap>];
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
      if (s) setLastChangedTs(s.lc > 0 ? s.lc : s.ts);
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

  // ── Click action (3-level resolution) ─────────────────────────────────────
  // Ebene 3: explicit widget-level action (stored in options.clickAction)
  // Ebene 2: admin-configured type default (popupConfigStore) — dynamic
  // Ebene 1: built-in default for known widget types (dimmer, thermostat, …)
  const popupTypeDefaults = usePopupConfigStore((s) => s.typeDefaults);
  const popupTypeDefaultLayouts = usePopupConfigStore((s) => s.typeDefaultLayouts);
  const storedClickAction = config.options?.clickAction as ClickAction | undefined;
  const rawClickAction = storedClickAction ?? { kind: 'none' as const };
  const clickAction: ClickAction = (() => {
    if (storedClickAction === undefined) {
      const viewId = popupTypeDefaults[config.type];
      if (viewId) {
        const allowed = popupTypeDefaultLayouts[config.type];
        const wl = currentLayout as WidgetLayout;
        if (!allowed?.length || allowed.includes(wl)) {
          return { kind: 'popup-view', viewId };
        }
      }
      const builtIn = defaultActionForConfig(config);
      if (builtIn) return builtIn;
    }
    return rawClickAction;
  })();
  const hasClickAction = clickAction.kind !== 'none';

  const handleWidgetClick = (e: React.MouseEvent) => {
    if (editMode || !hasClickAction) return;
    // Portal backdrop clicks bubble through the React tree back here — ignore while popup is open
    if (popupOpen) return;
    // Walk up from target — closest match wins. Interactive controls (button, input, …)
    // suppress the popup so their own onClick can act alone. `data-allow-popup` is an
    // explicit escape hatch to re-enable popup-on-click inside an interactive subtree.
    {
      let el: HTMLElement | null = e.target as HTMLElement;
      const container = e.currentTarget as HTMLElement;
      while (el && el !== container) {
        if (el.matches('[data-allow-popup]')) break;
        if (el.matches('button, input, select, textarea, a, [data-widget-interactive], [data-no-popup]')) return;
        el = el.parentElement;
      }
    }
    e.stopPropagation();
    switch (clickAction.kind) {
      case 'link-external':
        if (clickAction.newTab) window.open(clickAction.url, '_blank', 'noopener');
        else window.location.href = clickAction.url;
        return;
      case 'link-tab': {
        const tab = useDashboardStore.getState().layouts
          .find((l) => l.id === clickAction.layoutId)
          ?.tabs.find((t) => t.id === clickAction.tabId);
        if (tab?.disabled) return;
        useNavigationStore.getState().navigateTo(clickAction.layoutId, clickAction.tabId);
        return;
      }
      case 'link-widget':
        useNavigationStore.getState().navigateTo(clickAction.layoutId, clickAction.tabId);
        return;
      default:
        setPopupOpen(true);
    }
  };

  // Verhindert Drag bei Klick auf Controls
  const stopDrag = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();

  const isHeader    = config.type === 'header';
  const isGroup     = config.type === 'group';
  const isCarousel  = config.type === 'carousel';
  const isTransparent = !!(config.options?.transparent);

  // ── Group-specific hooks (always called, conditionally used) ───────────────
  const groupDefId = isGroup ? (config.options?.defId as string | undefined) : undefined;
  const groupChildren = useGroupDefsStore((s) => groupDefId ? (s.defs[groupDefId] ?? []) : []);
  const groupCellSize = useConfigStore((s) => s.frontend.gridRowHeight ?? 80);
  const groupGridGap  = useConfigStore((s) => s.frontend.gridGap ?? 10);

  const fitGroupHeight = () => {
    if (!groupDefId || groupChildren.length === 0) return;
    const maxBottom = Math.max(...groupChildren.map((c) => c.gridPos.y + c.gridPos.h));
    const innerH = maxBottom * (groupCellSize + groupGridGap) - groupGridGap;
    // In editMode the title bar is always rendered (min-height 36px); +1 for its border-bottom when titled.
    // +10 = 8 (p-1 padding top+bottom) + 2 (widget border-width, 1px each side).
    const titleBarH = config.title ? (isTransparent ? 36 : 37) : 36;
    const newH = Math.ceil((titleBarH + innerH + 10 + groupGridGap) / (groupCellSize + groupGridGap));
    onConfigChange({ ...config, gridPos: { ...config.gridPos, h: newH } });
  };

  const addGroupChild = (type: WidgetType) => {
    if (!groupDefId) return;
    const meta = WIDGET_BY_TYPE[type];
    const maxY = groupChildren.reduce((m, c) => Math.max(m, c.gridPos.y + c.gridPos.h), 0);
    const newChild: WidgetConfig = {
      id: `child-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type, title: 'Widget', datapoint: '',
      gridPos: { x: 0, y: maxY, w: meta?.defaultW ?? 2, h: meta?.defaultH ?? 2 },
      options: { icon: meta?.iconName },
    };
    const next = verticalCompact([...groupChildren, newChild]);
    useGroupDefsStore.getState().setDef(groupDefId, next);
    // auto-fit height using compacted positions
    const maxBottom = Math.max(...next.map((c) => c.gridPos.y + c.gridPos.h));
    const innerH = maxBottom * (groupCellSize + groupGridGap) - groupGridGap;
    const titleBarH = config.title ? (isTransparent ? 36 : 37) : 36;
    const newH = Math.ceil((titleBarH + innerH + 10 + groupGridGap) / (groupCellSize + groupGridGap));
    onConfigChange({ ...config, gridPos: { ...config.gridPos, h: newH } });
    setShowGroupTypePicker(false);
    openPanelFor(null);
  };
  // ──────────────────────────────────────────────────────────────────────────

  const activeLayoutIdCtx = useActiveLayoutId();
  const effectiveSettings = useEffectiveSettings(activeLayoutIdCtx);
  const widgetPadding = effectiveSettings.widgetPadding ?? 16;
  const isNoPad = isHeader || isGroup || isCarousel || isTransparent || config.type === 'iframe' || config.type === 'echartsPreset';

  return (
    <div
      className={`aura-widget aura-widget-${config.id} aura-widget-type-${config.type} relative h-full transition-all overflow-visible ${isHeader ? 'px-2 py-0' : isNoPad ? 'p-0' : ''} ${editMode ? 'ring-2 ring-accent/40 rounded-xl' : ''} ${!editMode && conditionResult.effect === 'pulse' ? 'animate-pulse' : ''} ${!editMode && conditionResult.effect === 'blink' ? 'animate-[blink_1s_step-end_infinite]' : ''}`}
      onClick={handleWidgetClick}
      style={isHeader || isTransparent ? {
        background: 'transparent',
        borderRadius: isTransparent && editMode ? 'var(--widget-radius)' : 0,
        boxShadow: 'none',
        backdropFilter: 'none',
        borderWidth: isTransparent && editMode ? 1 : 0,
        borderStyle: 'dashed',
        borderColor: isTransparent && editMode ? 'var(--app-border)' : 'transparent',
        cursor: !editMode && hasClickAction ? 'pointer' : undefined,
        ...cssOverride,
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
        padding: isNoPad ? undefined : widgetPadding,
        cursor: !editMode && hasClickAction ? 'pointer' : undefined,
        ...cssOverride,
        ...(!editMode && conditionResult.hidden && !conditionResult.reflow
          ? { visibility: 'hidden', pointerEvents: 'none' } : {}),
      }}
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
          className="nodrag absolute top-1.5 right-1.5 z-10 flex items-center gap-1"
          onMouseDown={stopDrag}
          onPointerDown={stopDrag}
        >
          <div
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              setDragBridge({ widget: config, remove: onRemove });
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => setDragBridge(null)}
            className="cursor-grab w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
            title={t(onDuplicate ? 'wf.menu.dragOutOfGroup' : 'wf.menu.dragToGroup')}
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
          >
            <Layers2 size={12} />
          </div>
          {isGroup && (
            <button
              onClick={fitGroupHeight}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
              title={t('group.fitHeight')}
              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            >
              <Minimize2 size={12} />
            </button>
          )}
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

      {Widget ? (
        <Suspense fallback={<div className="h-full w-full" style={{ background: 'var(--app-bg)', opacity: 0.3 }} />}>
          <Widget
            config={config.options?.hideTitle ? { ...config, title: '' } : config}
            editMode={editMode}
            onConfigChange={onConfigChange}
            onLastChange={setLastChangedTs}
          />
        </Suspense>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-1 text-center px-2"
          style={{ color: 'var(--text-secondary)' }}>
          <span className="text-lg">⚠️</span>
          <span className="text-[10px]">Unbekannter Widget-Typ<br /><span className="font-mono opacity-60">{config.type}</span></span>
          <span className="text-[9px] opacity-50">Bitte Seite neu laden</span>
        </div>
      )}

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
            style={{ ...posStyle, color: 'var(--text-secondary)', zIndex: 2 }}
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

            {/* Klick-Aktion */}
            <button
              onClick={() => { openPanelFor('action'); setConfirmDelete(false); }}
              className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
            >
              <MousePointerClick size={13} style={{ color: hasClickAction ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }} />
              {t('wf.menu.clickAction')}
              {hasClickAction && (
                <span className="ml-auto w-2 h-2 rounded-full" style={{ background: 'var(--accent)', flexShrink: 0 }} />
              )}
            </button>

            {/* Gruppe – Widget hinzufügen / Höhe anpassen / Mobile Reihenfolge */}
            {isGroup && editMode && (
              <>
                <div className="my-0.5 mx-1 border-t" style={{ borderColor: 'var(--app-border)' }} />
                <button
                  onClick={() => setShowGroupTypePicker((v) => !v)}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity w-full"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Plus size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  {t('group.addWidget')}
                  <ChevronDown size={11} className="ml-auto transition-transform" style={{ color: 'var(--text-secondary)', transform: showGroupTypePicker ? 'rotate(180deg)' : 'none' }} />
                </button>
                {showGroupTypePicker && (
                  <div className="mx-1 mb-0.5 rounded-md overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    {WIDGET_GROUPS.map((g) => {
                      const types = WIDGET_REGISTRY
                        .filter((m) => m.widgetGroup === g.id && m.type !== 'calendar')
                        .slice()
                        .sort((a, b) => a.label.localeCompare(b.label, 'de'));
                      if (types.length === 0) return null;
                      return (
                        <div key={g.id} className="p-1.5">
                          <div className="text-[9px] uppercase tracking-wider px-0.5 pb-0.5" style={{ color: 'var(--text-secondary)' }}>{g.label}</div>
                          <div className="flex flex-wrap gap-1">
                            {types.map((m) => (
                              <button
                                key={m.type}
                                onClick={() => addGroupChild(m.type as WidgetType)}
                                className="text-[10px] px-2 py-1 rounded-lg hover:opacity-80"
                                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                              >
                                {t(`widget.${m.type}` as TranslationKey)}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button
                  onClick={() => openPanelFor('group-mobile-order')}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity w-full"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Smartphone size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  {t('group.mobileOrder')}
                </button>
                <div className="my-0.5 mx-1 border-t" style={{ borderColor: 'var(--app-border)' }} />
              </>
            )}

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
            {onDuplicate ? (
              <button
                onClick={() => { onDuplicate(); openPanelFor(null); }}
                className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity"
                style={{ color: 'var(--text-primary)' }}
              >
                <Copy size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                {t('wf.menu.duplicateInGroup')}
              </button>
            ) : (
              <button
                onClick={() => {
                  if (moveTargets.length === 0) {
                    // No other tabs – duplicate directly on same tab
                    addWidgetToLayoutTab(activeLayoutId, activeTabId, {
                      ...copyConfig(config),
                      id: `w-${Date.now()}`,
                      gridPos: { ...config.gridPos, y: 9999 },
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
            )}
            {showCopyMenu && moveTargets.length > 0 && (
              <div className="mx-1 mb-0.5 rounded-md overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                {/* Same tab: duplicate */}
                <button
                  onClick={() => {
                    addWidgetToLayoutTab(activeLayoutId, activeTabId, {
                      ...copyConfig(config),
                      id: `w-${Date.now()}`,
                      gridPos: { ...config.gridPos, y: 9999 },
                    });
                    openPanelFor(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80 transition-opacity"
                  style={{ background: 'var(--app-bg)', color: 'var(--accent)', display: 'block', borderBottom: '1px solid var(--app-border)', fontWeight: 500 }}
                >
                  {t('wf.menu.copyHere')}
                </button>
                {/* Other tabs – grouped by layout, derived from moveTargets (no layouts subscription needed) */}
                {[...new Map(moveTargets.map((m) => [m.layoutId, m.layoutName])).entries()].map(([layoutId, layoutName]) => {
                  const targets = moveTargets.filter((m) => m.layoutId === layoutId);
                  return (
                    <div key={layoutId}>
                      {moveLayoutCount > 1 && (
                        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider"
                          style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--app-border)' }}>
                          {layoutName}
                        </p>
                      )}
                      {targets.map((m) => (
                        <button
                          key={m.tabId}
                          onClick={() => {
                            addWidgetToLayoutTab(m.layoutId, m.tabId, {
                              ...copyConfig(config),
                              id: `w-${Date.now()}`,
                              gridPos: { ...config.gridPos, y: 9999 },
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
                    {[...new Map(moveTargets.map((m) => [m.layoutId, m.layoutName])).entries()].map(([layoutId, layoutName]) => {
                      const targets = moveTargets.filter((m) => m.layoutId === layoutId);
                      return (
                        <div key={layoutId}>
                          {moveLayoutCount > 1 && (
                            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider"
                              style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--app-border)' }}>
                              {layoutName}
                            </p>
                          )}
                          {targets.map((m) => (
                            <button
                              key={m.tabId}
                              onClick={() => {
                                addWidgetToLayoutTab(m.layoutId, m.tabId, { ...config, gridPos: { ...config.gridPos, y: 9999 } });
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
          title={<>{t('wf.edit.title')} <span className="relative inline-flex items-center"><span className="text-[10px] font-mono opacity-40 ml-1 font-normal cursor-pointer hover:opacity-70 active:opacity-50 select-none" title="ID kopieren" onClick={() => { copyToClipboard(config.id); setIdCopied(true); setTimeout(() => setIdCopied(false), 1500); }}>({config.id})</span>{idCopied && <span className="absolute left-full ml-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-sans font-normal" style={{ background: 'var(--accent)', color: '#fff', opacity: 1 }}>Kopiert!</span>}</span></>}
          wide={config.type === 'echart' || config.type === 'autolist' || config.type === 'list' || config.type === 'trash' || config.type === 'trashSchedule'}
          storageKey="aura.widget.editModalSize"
          onClose={() => openPanelFor(null)}
        >
          {/* ─── 1. Name / Titel ──────────────────────────────────────────── */}
          {!['shutter', 'switch', 'dimmer', 'slider', 'thermostat', 'value', 'gauge', 'chart', 'climate', 'echart', 'echartsPreset', 'list', 'autolist', 'fill', 'windowcontact', 'binarysensor', 'stateimage', 'chips', 'button', 'httpRequest', 'clock', 'weather', 'calendar', 'evcc', 'camera', 'image', 'trash', 'trashSchedule', 'iframe', 'jsontable', 'datepicker', 'html', 'header', 'group', 'carousel', 'mediaplayer', 'universal', 'enum', 'light', 'knob', 'timer', 'adapterstatus'].includes(config.type) && (<>
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
            <div className="flex items-center gap-2">
              <label className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.titlePosition')}</label>
              <div className="flex gap-1">
                {(['left', 'center', 'right'] as const).map((p) => {
                  const labels: Record<string, string> = { left: t('wf.edit.posLeft'), center: t('wf.edit.posCenter'), right: t('wf.edit.posRight') };
                  const active = ((config.options?.titleAlign as string) ?? 'left') === p;
                  return (
                    <button key={p}
                      onClick={() => onConfigChange({ ...config, options: { ...(config.options ?? {}), titleAlign: p } })}
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
          </>)}

          {!['shutter', 'switch', 'dimmer', 'slider', 'thermostat', 'value', 'gauge', 'chart', 'climate', 'echart', 'echartsPreset', 'list', 'autolist', 'fill', 'windowcontact', 'binarysensor', 'stateimage', 'chips', 'button', 'httpRequest', 'clock', 'weather', 'calendar', 'evcc', 'camera', 'image', 'trash', 'trashSchedule', 'iframe', 'jsontable', 'datepicker', 'html', 'header', 'group', 'carousel', 'mediaplayer', 'universal', 'enum', 'light', 'knob', 'timer', 'adapterstatus'].includes(config.type) && (<>
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
          </>)}

          {/* ─── 3. Widget-Typ · Layout · Icon ─────────────────────────────── */}
          <div className="space-y-2.5">
            {['shutter', 'switch', 'dimmer', 'slider', 'thermostat', 'value', 'gauge', 'chart', 'climate', 'echart', 'echartsPreset', 'list', 'autolist', 'fill', 'windowcontact', 'binarysensor', 'stateimage', 'chips', 'button', 'httpRequest', 'clock', 'weather', 'calendar', 'evcc', 'camera', 'image', 'trash', 'trashSchedule', 'iframe', 'jsontable', 'datepicker', 'html', 'header', 'group', 'carousel', 'mediaplayer', 'universal', 'enum', 'light', 'knob', 'timer', 'adapterstatus'].includes(config.type) && (
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
            )}
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
                    {WIDGET_REGISTRY
                      .filter((m) => m.widgetGroup === g.id)
                      .slice()
                      .sort((a, b) => a.label.localeCompare(b.label, 'de'))
                      .map((m) => (
                        <option key={m.type} value={m.type}>{m.label}</option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* ── Layout & Sichtbare Felder (kombiniert, eingeklappt) ── */}
            {config.type !== 'header' && config.type !== 'iframe' && config.type !== 'jsontable' && config.type !== 'html' && config.type !== 'adapterstatus' && (() => {
              const activeLayout = config.layout ?? 'default';
              const layouts: { value: string; label: string }[] = config.type === 'camera' ? [
                { value: 'minimal', label: 'Minimal' },
                { value: 'default', label: 'Standard' },
                { value: 'custom',  label: 'Custom Grid' },
              ] : config.type === 'fill' ? [
                { value: 'default',  label: 'Tank' },
                { value: 'battery',  label: 'Batterie' },
                { value: 'segments', label: 'LED-Segmente' },
                { value: 'wave',     label: 'Welle' },
              ] : config.type === 'gauge' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
              ] : config.type === 'knob' ? [
                { value: 'default',      label: 'Bogen' },
                { value: 'knob-scale',   label: 'Skala' },
                { value: 'knob-endless', label: 'Endlos (3D)' },
                { value: 'custom',       label: 'Custom' },
              ] : config.type === 'chart' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'card',    label: t('wf.edit.layout.card') },
              ] : config.type === 'climate' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
              ] : config.type === 'echartsPreset' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
              ] : config.type === 'mediaplayer' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'compact', label: t('wf.edit.layout.compact') },
                { value: 'custom',  label: 'Custom' },
              ] : config.type === 'chips' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
              ] : config.type === 'httpRequest' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'compact', label: t('wf.edit.layout.compact') },
                { value: 'minimal', label: t('wf.edit.layout.minimal') },
                { value: 'custom',  label: 'Custom' },
              ] : config.type === 'slider' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'custom',  label: 'Custom' },
              ] : config.type === 'button' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'compact', label: t('wf.edit.layout.compact') },
                { value: 'minimal', label: t('wf.edit.layout.minimal') },
                { value: 'custom',  label: 'Custom' },
              ] : config.type === 'group' || config.type === 'carousel' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
              ] : config.type === 'universal' ? [
                { value: 'custom',  label: 'Custom' },
              ] : config.type === 'enum' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'compact', label: t('wf.edit.layout.compact') },
                { value: 'minimal', label: t('wf.edit.layout.minimal') },
                { value: 'card',    label: t('wf.edit.layout.card') },
                { value: 'custom',  label: 'Custom' },
              ] : config.type === 'shutter' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'compact', label: t('wf.edit.layout.compact') },
                { value: 'minimal', label: t('wf.edit.layout.minimal') },
                { value: 'custom',  label: 'Custom' },
              ] : config.type === 'light' ? [
                { value: 'light-all',         label: 'Standard' },
                { value: 'light-brightness',  label: 'Nur Helligkeit' },
                { value: 'light-color',       label: 'Nur Farbe' },
                { value: 'light-temperature', label: 'Nur Lichtwärme' },
                { value: 'custom',            label: 'Custom' },
              ] : config.type === 'switch' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'card',    label: t('wf.edit.layout.card') },
                { value: 'compact', label: t('wf.edit.layout.compact') },
                { value: 'custom',  label: 'Custom' },
              ] : config.type === 'dimmer' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'compact', label: t('wf.edit.layout.compact') },
                { value: 'minimal', label: t('wf.edit.layout.minimal') },
                { value: 'custom',  label: 'Custom' },
              ] : config.type === 'thermostat' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'compact', label: t('wf.edit.layout.compact') },
                { value: 'minimal', label: t('wf.edit.layout.minimal') },
                { value: 'custom',  label: 'Custom' },
              ] : config.type === 'clock' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'card',    label: t('wf.edit.layout.card') },
                { value: 'minimal', label: t('wf.edit.layout.minimal') },
                { value: 'custom',  label: 'Custom' },
              ] : config.type === 'weather' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'compact', label: t('wf.edit.layout.compact') },
                { value: 'minimal', label: t('wf.edit.layout.minimal') },
                { value: 'custom',  label: 'Custom' },
              ] : config.type === 'trash' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
              ] : config.type === 'trashSchedule' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'list',    label: 'Liste' },
              ] : config.type === 'evcc' ? [
                { value: 'default',     label: t('wf.edit.layout.standard') },
                { value: 'compact',     label: t('wf.edit.layout.compact') },
                { value: 'flow',        label: 'Nur Fluss' },
                { value: 'battery',     label: 'Nur Batterie' },
                { value: 'production',  label: 'Nur Produktion' },
                { value: 'consumption', label: 'Nur Verbrauch' },
                { value: 'loadpoints',  label: 'Nur Ladepunkte' },
                { value: 'custom',      label: 'Custom' },
              ] : config.type === 'timer' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'compact', label: t('wf.edit.layout.compact') },
                { value: 'custom',  label: 'Custom' },
              ] : [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'card',    label: t('wf.edit.layout.card') },
                { value: 'compact', label: t('wf.edit.layout.compact') },
                { value: 'minimal', label: t('wf.edit.layout.minimal') },
                ...(config.type === 'calendar' ? [{ value: 'agenda', label: t('wf.edit.layout.agenda') }] : []),
                ...(config.type === 'autolist' ? [{ value: 'count', label: 'Anzahl' }] : []),
                ...(!['iframe', 'jsontable', 'html', 'trash', 'trashSchedule', 'header', 'fill', 'list', 'autolist', 'datepicker'].includes(config.type) ? [{ value: 'custom', label: 'Custom' }] : []),
              ];
              const o = config.options ?? {};
              const setO = (patch: Record<string, unknown>) =>
                onConfigChange({ ...config, options: { ...o, ...patch } });
              const visFields: VisField[] = (() => {
                switch (config.type) {
                  case 'switch':        return [];
                  case 'value':         return [];
                  case 'dimmer':        return [];
                  case 'thermostat':    return [];
                  case 'shutter':       return [];
                  case 'gauge':         return [];
                  case 'clock':         return [];
                  case 'weather':       return [];
                  case 'windowcontact': return [];
                  case 'binarysensor':  return [];
                  case 'datepicker':   return [];
                  case 'stateimage':    return [];
                  case 'chart':         return [];
                  case 'climate':       return [];
                  case 'echart':        return [];
                  case 'list':          return [];
                  case 'autolist':      return [];
                  case 'fill':          return [];
                  case 'calendar':      return [];
                  case 'trash':         return [];
                  case 'trashSchedule': return [];
                  case 'mediaplayer':    return [];
                  case 'chips':  return [];
                  case 'button': return [];
                  case 'slider':        return [];
                  case 'echartsPreset': return [];
                  case 'enum':          return [];
                  case 'light':         return [];
                  case 'knob':          return [];
                  default: return [];
                }
              })();
              return (
                <details className="group">
                  <summary className="flex items-center justify-between cursor-pointer list-none select-none">
                    {/* Layout buttons in the summary row – always clickable */}
                    <div className="flex items-center gap-1 flex-wrap" onClick={(e) => e.preventDefault()}>
                      <span className="text-[11px] shrink-0 mr-0.5" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.layout')}</span>
                      {layouts.map(({ value, label }) => {
                        const active = activeLayout === value;
                        return (
                          <button
                            key={value}
                            onClick={() => {
                              const nextLayout = value as WidgetConfig['layout'];
                              const next: WidgetConfig = { ...config, layout: nextLayout };
                              // Pre-populate weather custom grid from current settings on first switch.
                              if (nextLayout === 'custom' && config.type === 'weather' && !config.options?.customGrid) {
                                next.options = { ...(config.options ?? {}), customGrid: buildWeatherCustomGrid(config.options ?? {}) };
                              }
                              onConfigChange(next);
                            }}
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
                    {visFields.length > 0 && (
                      <ChevronDown size={13} className="transition-transform group-open:rotate-180 shrink-0 ml-1" style={{ color: 'var(--text-secondary)' }} />
                    )}
                  </summary>
                  {visFields.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Sichtbare Felder</p>
                      {visFields.map(({ key, label }) => {
                        const val = o[key] !== false;
                        return (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{label}</span>
                            <button
                              onClick={() => setO({ [key]: !val })}
                              className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                              style={{ background: val ? 'var(--accent)' : 'var(--app-border)' }}
                            >
                              <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                                style={{ left: val ? '14px' : '2px' }} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </details>
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

            {/* Icon picker (not for stateimage/windowcontact – icons are per-state; not for shutter/switch/dimmer/slider – in Darstellung) */}
            {config.type !== 'stateimage' && config.type !== 'windowcontact' && !['shutter', 'switch', 'dimmer', 'slider', 'thermostat', 'value', 'gauge', 'chart', 'climate', 'echart', 'echartsPreset', 'list', 'autolist', 'fill', 'windowcontact', 'binarysensor', 'stateimage', 'chips', 'button', 'httpRequest', 'clock', 'weather', 'calendar', 'evcc', 'camera', 'image', 'trash', 'trashSchedule', 'iframe', 'jsontable', 'datepicker', 'html', 'header', 'group', 'carousel', 'mediaplayer', 'universal', 'enum', 'light', 'knob', 'timer', 'adapterstatus'].includes(config.type) && (() => {
              const currentIconName = config.options?.icon as string | undefined;
              const CurrentIcon = currentIconName
                ? (getWidgetIcon(currentIconName, (() => null) as unknown as import('lucide-react').LucideIcon))
                : null;
              return (
                <div>
                  <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.icon')}</label>
                  <button
                    onClick={() => setIconPickerOpen(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors w-full text-left"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}
                  >
                    {CurrentIcon
                      ? <CurrentIcon size={14} style={{ flexShrink: 0 }} />
                      : <span style={{ width: 14, height: 14, display: 'inline-block', flexShrink: 0 }} />}
                    <span className="flex-1 truncate" style={{ color: currentIconName ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {currentIconName ?? 'Icon auswählen…'}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>›</span>
                  </button>
                  {iconPickerOpen && (
                    <IconPickerModal
                      current={currentIconName ?? ''}
                      onSelect={(name) => onConfigChange({ ...config, options: { ...(config.options ?? {}), icon: name || undefined } })}
                      onClose={() => setIconPickerOpen(false)}
                    />
                  )}
                </div>
              );
            })()}

            {/* Icon-Größe */}
            {!['clock', 'calendar', 'gauge', 'chart', 'echart', 'echartsPreset', 'fill', 'iframe', 'html', 'jsontable', 'image', 'camera', 'list', 'autolist', 'header', 'trash', 'trashSchedule', 'evcc', 'weather', 'group', 'carousel', 'mediaplayer', 'shutter', 'switch', 'dimmer', 'slider', 'thermostat', 'value', 'climate', 'windowcontact', 'binarysensor', 'stateimage', 'button', 'chips', 'httpRequest', 'datepicker', 'light', 'knob', 'timer', 'adapterstatus'].includes(config.type) && (() => {
              const o = config.options ?? {};
              const iconSize = (o.iconSize as number) || 20;
              const displayIconSize = draftIconSize ?? iconSize;
              return (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Icon-Größe</label>
                    <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-primary)' }}>{displayIconSize} px</span>
                  </div>
                  <input type="range" min={12} max={256} step={4} value={displayIconSize}
                    onChange={(e) => setDraftIconSize(Number(e.target.value))}
                    onPointerUp={(e) => {
                      onConfigChange({ ...config, options: { ...o, iconSize: Number((e.target as HTMLInputElement).value) } });
                      setDraftIconSize(null);
                    }}
                    className="w-full h-1"
                    style={{ accentColor: 'var(--accent)' }} />
                </div>
              );
            })()}
          </div>

          {/* ─── DARSTELLUNG ─────────────────────────────────────────────────── */}
          {['shutter', 'switch', 'dimmer', 'slider', 'thermostat', 'value', 'gauge', 'chart', 'climate', 'echart', 'echartsPreset', 'list', 'autolist', 'fill', 'windowcontact', 'binarysensor', 'stateimage', 'chips', 'button', 'httpRequest', 'clock', 'weather', 'calendar', 'evcc', 'camera', 'image', 'trash', 'trashSchedule', 'iframe', 'jsontable', 'datepicker', 'html', 'header', 'group', 'carousel', 'mediaplayer', 'universal', 'enum', 'light', 'knob', 'timer', 'adapterstatus'].includes(config.type) && (() => {
            const o = config.options ?? {};
            const setO = (patch: Record<string, unknown>) =>
              onConfigChange({ ...config, options: { ...o, ...patch } });
            const titleOn = o.showTitle !== false;
            const iconOn  = o.showIcon !== false;
            const currentIconName = o.icon as string | undefined;
            const CurrentIcon = currentIconName
              ? (getWidgetIcon(currentIconName, (() => null) as unknown as import('lucide-react').LucideIcon))
              : null;
            const displayIconSize = draftIconSize ?? ((o.iconSize as number) || 20);
            return (
              <details className="group">
                <summary className="flex items-center justify-between cursor-pointer list-none select-none">
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Darstellung</span>
                  <ChevronDown size={13} className="transition-transform group-open:rotate-180" style={{ color: 'var(--text-secondary)' }} />
                </summary>
                <div className="mt-2.5 space-y-2.5">
                  {config.type !== 'mediaplayer' && <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>Titel</span>
                    <div className="flex items-center gap-2">
                      {titleOn && (
                        <div className="flex gap-1">
                          {(['left', 'center', 'right'] as const).map((p) => {
                            const lbls: Record<string, string> = { left: t('wf.edit.posLeft'), center: t('wf.edit.posCenter'), right: t('wf.edit.posRight') };
                            const active = ((o.titleAlign as string) ?? 'left') === p;
                            return (
                              <button key={p} onClick={() => setO({ titleAlign: p })}
                                className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                                style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                                {lbls[p]}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <button onClick={() => setO({ showTitle: !titleOn })}
                        className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                        style={{ background: titleOn ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                          style={{ left: titleOn ? '14px' : '2px' }} />
                      </button>
                    </div>
                  </div>}
                  {config.type === 'light' && (() => {
                    const stateOn = o.showState !== false;
                    return (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>Status (An / Aus)</span>
                        <div className="flex items-center gap-2">
                          {stateOn && (
                            <div className="flex gap-1">
                              {(['left', 'center', 'right'] as const).map((p) => {
                                const lbls: Record<string, string> = { left: t('wf.edit.posLeft'), center: t('wf.edit.posCenter'), right: t('wf.edit.posRight') };
                                const active = ((o.statusAlign as string) ?? 'left') === p;
                                return (
                                  <button key={p} onClick={() => setO({ statusAlign: p })}
                                    className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                                    style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                                    {lbls[p]}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          <button onClick={() => setO({ showState: !stateOn })}
                            className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                            style={{ background: stateOn ? 'var(--accent)' : 'var(--app-border)' }}>
                            <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                              style={{ left: stateOn ? '14px' : '2px' }} />
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                  {(config.type === 'shutter'
                    ? [{ key: 'showValue', label: 'Position %' }, { key: 'showControls', label: 'Steuerknöpfe' }, { key: 'showSlider', label: 'Schieberegler' }]
                    : config.type === 'switch'
                    ? [{ key: 'showLabel', label: 'Status (AN/AUS)' }]
                    : config.type === 'dimmer'
                    ? [{ key: 'showValue', label: 'Prozentwert' }, { key: 'showSlider', label: 'Schieberegler' }, { key: 'showToggle', label: 'An/Aus-Schalter' }]
                    : config.type === 'slider'
                    ? [{ key: 'showValue', label: 'Wert' }, { key: 'showUnit', label: 'Einheit' }, { key: 'showMinMax', label: 'Min/Max-Beschriftung' }]
                    : config.type === 'thermostat'
                    ? [{ key: 'showSetpoint', label: 'Solltemperatur' }, { key: 'showActualTemp', label: 'Isttemperatur' }, { key: 'showControls', label: 'Tasten ±' }]
                    : config.type === 'value'
                    ? [{ key: 'showValue', label: 'Wert' }, { key: 'showUnit', label: 'Einheit' }]
                    : config.type === 'enum'
                    ? [{ key: 'showValue', label: 'Aktuelle Auswahl' }, { key: 'showSelect', label: 'Dropdown' }]
                    : config.type === 'gauge'
                    ? []
                    : config.type === 'chart'
                    ? []
                    : config.type === 'climate'
                    ? [{ key: 'showActualTemp', label: 'Ist-Temperatur' }, { key: 'showTargetTemp', label: 'Soll-Temperatur' }, { key: 'showHumidity', label: 'Luftfeuchtigkeit' }, { key: 'showComfort', label: 'Komfortzone' }, { key: 'showChart', label: 'Temperaturverlauf' }]
                    : config.type === 'echart'
                    ? []
                    : config.type === 'echartsPreset'
                    ? []
                    : config.type === 'list'
                    ? []
                    : config.type === 'autolist'
                    ? []
                    : config.type === 'fill'
                    ? []
                    : config.type === 'windowcontact'
                    ? [{ key: 'showLabel', label: 'Status-Text' }]
                    : config.type === 'binarysensor'
                    ? [{ key: 'showLabel', label: 'Status-Text' }]
                    : config.type === 'stateimage'
                    ? [{ key: 'showLabel', label: 'Status-Text' }]
                    : config.type === 'chips'
                    ? []
                    : config.type === 'button'
                    ? []
                    : config.type === 'httpRequest'
                    ? []
                    : config.type === 'clock'
                    ? []
                    : config.type === 'weather'
                    ? []
                    : config.type === 'calendar'
                    ? [{ key: 'showCalName', label: 'Kalender-Name' }, { key: 'showSummary', label: 'Terminname' }, { key: 'showDate', label: 'Datum / Uhrzeit' }, { key: 'showLocation', label: 'Ort' }, { key: 'showMore', label: '+ weitere Termine' }]
                    : config.type === 'evcc'
                    ? []
                    : config.type === 'camera'
                    ? []
                    : config.type === 'image'
                    ? []
                    : config.type === 'trash'
                    ? []
                    : config.type === 'trashSchedule'
                    ? []
                    : config.type === 'iframe'
                    ? []
                    : config.type === 'jsontable'
                    ? []
                    : config.type === 'datepicker'
                    ? [{ key: 'showCurrentValue', label: 'Gesetzter Wert' }]
                    : config.type === 'html'
                    ? []
                    : config.type === 'header'
                    ? [{ key: 'showSubtitle', label: 'Untertitel' }]
                    : config.type === 'group'
                    ? []
                    : config.type === 'carousel'
                    ? []
                    : config.type === 'light'
                    ? [
                        { key: 'showPalette', label: 'Farbpalette (Presets)' },
                      ]
                    : config.type === 'knob'
                    ? [{ key: 'showValue', label: 'Wert' }, { key: 'showMinMax', label: 'Min/Max-Beschriftung' }]
                    : config.type === 'mediaplayer'
                    ? [
                        { key: 'showCover',    label: 'Cover' },
                        { key: 'showSubtitle', label: 'Untertitel (Artist · Album)' },
                        { key: 'showSource',   label: 'Quelle' },
                        { key: 'showShuffle',  label: 'Shuffle' },
                        { key: 'showPrev',     label: 'Vorheriger' },
                        { key: 'showNext',     label: 'Nächster' },
                        { key: 'showRepeat',   label: 'Repeat' },
                        { key: 'showVolume',   label: 'Lautstärke-Slider' },
                        { key: 'showMute',     label: 'Mute' },
                        { key: 'showChips',    label: 'Schnellzugriff-Chips' },
                      ]
                    : [] as { key: string; label: string }[]
                  ).map(({ key, label }) => {
                    const val = o[key] !== false;
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{label}</span>
                        <button onClick={() => setO({ [key]: !val })}
                          className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                          style={{ background: val ? 'var(--accent)' : 'var(--app-border)' }}>
                          <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                            style={{ left: val ? '14px' : '2px' }} />
                        </button>
                      </div>
                    );
                  })}
                  {config.type !== 'stateimage' && (<>
                  <div className="h-px" style={{ background: 'var(--app-border)' }} />
                  <div className="flex items-center justify-between">
                    <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>Icon</span>
                    <button onClick={() => setO({ showIcon: !iconOn })}
                      className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                      style={{ background: iconOn ? 'var(--accent)' : 'var(--app-border)' }}>
                      <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                        style={{ left: iconOn ? '14px' : '2px' }} />
                    </button>
                  </div>
                  {iconOn && (
                    <>
                      {config.type !== 'windowcontact' && (
                        <>
                          <button onClick={() => setIconPickerOpen(true)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors w-full text-left"
                            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}>
                            {CurrentIcon ? <CurrentIcon size={14} style={{ flexShrink: 0 }} /> : <span style={{ width: 14, height: 14, display: 'inline-block', flexShrink: 0 }} />}
                            <span className="flex-1 truncate" style={{ color: currentIconName ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                              {currentIconName ?? 'Icon auswählen…'}
                            </span>
                            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>›</span>
                          </button>
                          {iconPickerOpen && (
                            <IconPickerModal
                              current={currentIconName ?? ''}
                              onSelect={(name) => onConfigChange({ ...config, options: { ...o, icon: name || undefined } })}
                              onClose={() => setIconPickerOpen(false)}
                            />
                          )}
                        </>
                      )}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Icon-Größe</label>
                          <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-primary)' }}>{displayIconSize} px</span>
                        </div>
                        <input type="range" min={12} max={256} step={4} value={displayIconSize}
                          onChange={(e) => setDraftIconSize(Number(e.target.value))}
                          onPointerUp={(e) => {
                            onConfigChange({ ...config, options: { ...o, iconSize: Number((e.target as HTMLInputElement).value) } });
                            setDraftIconSize(null);
                          }}
                          className="w-full h-1"
                          style={{ accentColor: 'var(--accent)' }} />
                      </div>
                    </>
                  )}
                  </>)}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Transparenz-Modus</label>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Hintergrund, Rahmen und Schatten entfernen</p>
                    </div>
                    <button
                      onClick={() => onConfigChange({ ...config, options: { ...o, transparent: !o.transparent } })}
                      className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                      style={{ background: o.transparent ? 'var(--accent)' : 'var(--app-border)' }}>
                      <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                        style={{ left: o.transparent ? '18px' : '2px' }} />
                    </button>
                  </div>
                  <div className="h-px" style={{ background: 'var(--app-border)' }} />
                  <div className="flex items-center justify-between">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.showLastChange')}</label>
                    <button onClick={() => setO({ showLastChange: !showLastChange })}
                      className="relative w-9 h-5 rounded-full transition-colors"
                      style={{ background: showLastChange ? 'var(--accent)' : 'var(--app-border)' }}>
                      <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                        style={{ left: showLastChange ? '18px' : '2px' }} />
                    </button>
                  </div>
                  {showLastChange && (
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.position')}</label>
                      <div className="flex gap-1">
                        {(['left', 'center', 'right'] as const).map((p) => {
                          const lbls: Record<string, string> = { left: t('wf.edit.posLeft'), center: t('wf.edit.posCenter'), right: t('wf.edit.posRight') };
                          const active = lastChangePos === p;
                          return (
                            <button key={p} onClick={() => setO({ lastChangePosition: p })}
                              className="text-[10px] px-2 py-0.5 rounded-full transition-colors"
                              style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                              {lbls[p]}
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
                        value={(o.lastChangeDatapoint as string) ?? ''}
                        onChange={(e) => onConfigChange({ ...config, options: { ...o, lastChangeDatapoint: e.target.value || undefined } })}
                        placeholder="z.B. evcc.0.status.pvPower"
                        className="w-full text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none"
                        style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                      />
                    </div>
                  )}
                </div>
              </details>
            );
          })()}

          {/* ─── ERWEITERT ───────────────────────────────────────────────────── */}
          {['shutter', 'switch', 'dimmer', 'slider', 'thermostat', 'value', 'gauge', 'chart', 'climate', 'echart', 'echartsPreset', 'list', 'autolist', 'fill', 'windowcontact', 'binarysensor', 'stateimage', 'chips', 'button', 'httpRequest', 'clock', 'weather', 'calendar', 'evcc', 'camera', 'image', 'trash', 'trashSchedule', 'iframe', 'jsontable', 'datepicker', 'html', 'header', 'group', 'carousel', 'mediaplayer', 'universal', 'enum', 'light', 'knob', 'timer', 'adapterstatus'].includes(config.type) && (
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none select-none">
                <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Erweitert</span>
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
          )}

          {/* ─── 4. Widget-spezifische Einstellungen ───────────────────────── */}
          <div
            className="space-y-2.5 rounded-lg px-3 py-3"
            style={{
              background: 'color-mix(in srgb, var(--accent) 10%, var(--app-bg))',
              borderLeft: '3px solid var(--accent)',
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
              {WIDGET_BY_TYPE[config.type]?.label ?? config.type}
            </p>
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
                    {(o.customFormat as string)?.trim() ? (
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.clock.customFontSize')}</label>
                        <input
                          type="number"
                          min={0}
                          max={200}
                          value={(o.customFontSize as number) ?? ''}
                          onChange={(e) => set({ customFontSize: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                          placeholder={t('wf.clock.fontSizeAuto')}
                          className={inputCls}
                          style={inputStyle}
                        />
                      </div>
                    ) : (
                      <>
                        {display !== 'date' && (
                          <div>
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.clock.timeFontSize')}</label>
                            <input
                              type="number"
                              min={0}
                              max={200}
                              value={(o.timeFontSize as number) ?? ''}
                              onChange={(e) => set({ timeFontSize: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                              placeholder={t('wf.clock.fontSizeAuto')}
                              className={inputCls}
                              style={inputStyle}
                            />
                          </div>
                        )}
                        {display !== 'time' && (
                          <div>
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.clock.dateFontSize')}</label>
                            <input
                              type="number"
                              min={0}
                              max={200}
                              value={(o.dateFontSize as number) ?? ''}
                              onChange={(e) => set({ dateFontSize: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                              placeholder={t('wf.clock.fontSizeAuto')}
                              className={inputCls}
                              style={inputStyle}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </>
                );
              })()}

              {config.type === 'calendar' && (
                <CalendarEditPanel config={config} onConfigChange={onConfigChange} />
              )}

              {config.type !== 'list' && config.type !== 'clock' && config.type !== 'calendar' && config.type !== 'header' && config.type !== 'group' && config.type !== 'button' && config.type !== 'evcc' && config.type !== 'echart' && config.type !== 'weather' && config.type !== 'camera' && config.type !== 'autolist' && config.type !== 'image' && config.type !== 'iframe' && config.type !== 'trash' && config.type !== 'trashSchedule' && config.type !== 'echartsPreset' && config.type !== 'html' && config.type !== 'mediaplayer' && config.type !== 'chips' && config.type !== 'httpRequest' && config.type !== 'universal' && config.type !== 'timer' && config.type !== 'adapterstatus' && (
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    {config.type === 'thermostat'     ? 'Soll-Temperatur Datenpunkt' :
                     config.type === 'windowcontact'  ? 'Kontaktstatus Datenpunkt (boolean / 0=zu / 1=kippt / 2=offen)' :
                     config.type === 'binarysensor'   ? 'Sensorwert Datenpunkt (boolean, true = aktiv)' :
                     config.type === 'stateimage'     ? 'Zustand Datenpunkt (boolean, true = erstes Bild)' :
                     config.type === 'shutter'        ? 'Positions-Datenpunkt (0–100 %)' :
                     config.type === 'dimmer'         ? 'Helligkeits-Datenpunkt (0–100 %)' :
                     config.type === 'climate'        ? 'Ist-Temperatur Datenpunkt' :
                     t('wf.edit.datapointId')}
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={config.datapoint}
                      onChange={(e) => onConfigChange({ ...config, datapoint: e.target.value })}
                      onBlur={(e) => {
                        const id = e.target.value.trim();
                        if (!id) return;
                        const supportsUnit = ['value', 'chart', 'gauge', 'fill', 'knob'].includes(config.type);
                        const apply = (name: string | undefined, unit: string | undefined) => {
                          let updated: typeof config = { ...config, datapoint: id };
                          if (!updated.title?.trim() && name) updated = { ...updated, title: applyDpNameFilter(name) };
                          if (supportsUnit && !(updated.options?.unit as string | undefined) && unit) {
                            updated = { ...updated, options: { ...updated.options, unit } };
                          }
                          onConfigChange(updated);
                        };
                        // Try synchronous cache first; fall back to full cache load (same path as DatapointPicker)
                        const cached = lookupDatapointEntry(id);
                        if (cached) { apply(cached.name, cached.unit); return; }
                        void ensureDatapointCache().then((entries) => {
                          const entry = entries.find((e) => e.id === id);
                          if (entry) apply(entry.name, entry.unit);
                        });
                      }}
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
              {(config.type === 'value' || config.type === 'chart') && (
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Dezimalstellen</label>
                  <div className="flex gap-1">
                    <input
                      type="number" min={0} max={4}
                      disabled={config.options?.decimals === undefined}
                      value={(config.options?.decimals as number) ?? defaultDecimals}
                      onChange={(e) => onConfigChange({ ...config, options: { ...config.options, decimals: Number(e.target.value) } })}
                      className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)', opacity: config.options?.decimals === undefined ? 0.5 : 1 }}
                    />
                    <button
                      onClick={() => onConfigChange({ ...config, options: { ...config.options, decimals: config.options?.decimals === undefined ? defaultDecimals : undefined } })}
                      title={config.options?.decimals === undefined ? 'Globale Einstellung aktiv – klicken für eigenen Wert' : 'Auf globale Einstellung zurücksetzen'}
                      className="px-1.5 rounded text-[10px] font-bold shrink-0"
                      style={{ background: config.options?.decimals === undefined ? 'var(--accent)' : 'var(--app-border)', color: config.options?.decimals === undefined ? '#fff' : 'var(--text-secondary)' }}
                    >
                      Global
                    </button>
                  </div>
                </div>
              )}
              {config.type === 'value' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>HTML-Template (optional)</label>
                    {((config.options?.htmlTemplate as string) ?? '').length > 0 && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard((config.options?.htmlTemplate as string) ?? '')}
                        className="text-[10px] px-1.5 py-0.5 rounded hover:opacity-80 flex items-center gap-1"
                        style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                        title="In Zwischenablage kopieren"
                      >
                        <Copy size={10} /> Kopieren
                      </button>
                    )}
                  </div>
                  <textarea
                    value={(config.options?.htmlTemplate as string) ?? ''}
                    onChange={(e) => onConfigChange({ ...config, options: { ...config.options, htmlTemplate: e.target.value || undefined } })}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      const el = e.currentTarget as HTMLTextAreaElement;
                      requestAnimationFrame(() => el.select());
                    }}
                    placeholder='z.B. <b style="color:var(--accent)">{dp}</b> °C'
                    rows={3}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono resize-y"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                  />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                    {'{dp}'} wird durch den Wert ersetzt · Beispiel: {'<span style="font-size:2em">{dp}</span> kW'}
                  </p>
                </div>
              )}
              {config.type === 'value' && (
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.value.fontSize')}</label>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={(config.options?.valueFontSize as number) ?? ''}
                    onChange={(e) => onConfigChange({ ...config, options: { ...config.options, valueFontSize: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) } })}
                    placeholder={t('wf.clock.fontSizeAuto')}
                    className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                  />
                </div>
              )}
              {config.type === 'switch' && (() => {
                const o   = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const momentary     = (o.momentary     as boolean) ?? false;
                const delay         = (o.momentaryDelay as number)  ?? 500;
                const confirmAction = (o.confirmAction  as boolean) ?? false;
                const controlMode   = (o.controlMode    as string)  ?? 'toggle';
                const onIconName    = o.onIcon  as string | undefined;
                const offIconName   = o.offIcon as string | undefined;
                const onColor       = (o.onColor  as string) || '#22c55e';
                const offColor      = (o.offColor as string) || '#6b7280';
                const ctrlIconSize  = (o.controlIconSize as number) || 28;
                const OnPreview  = onIconName  ? getWidgetIcon(onIconName,  (() => null) as unknown as import('lucide-react').LucideIcon) : null;
                const OffPreview = offIconName ? getWidgetIcon(offIconName, (() => null) as unknown as import('lucide-react').LucideIcon) : null;
                return (
                  <>
                    <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
                    <div>
                      <label className="text-[11px] font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Bedienelement</label>
                      <div className="flex gap-1">
                        {([['toggle', 'Schiebeschalter'], ['icon', 'Icon']] as const).map(([val, lbl]) => (
                          <button key={val} onClick={() => set({ controlMode: val })}
                            className="flex-1 text-[11px] py-1.5 rounded-lg transition-colors"
                            style={{
                              background: controlMode === val ? 'var(--accent)' : 'var(--app-bg)',
                              color:      controlMode === val ? '#fff'         : 'var(--text-secondary)',
                              border: `1px solid ${controlMode === val ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}>
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                    {controlMode === 'icon' && (
                      <>
                        {(['on', 'off'] as const).map(state => {
                          const isOnState  = state === 'on';
                          const stateLabel = isOnState ? 'AN' : 'AUS';
                          const iconName   = isOnState ? onIconName : offIconName;
                          const color      = isOnState ? onColor    : offColor;
                          const Preview    = isOnState ? OnPreview  : OffPreview;
                          const pickerOpen = isOnState ? iconPickerTrueOpen  : iconPickerFalseOpen;
                          const setOpen    = isOnState ? setIconPickerTrueOpen : setIconPickerFalseOpen;
                          const optIconKey  = isOnState ? 'onIcon'  : 'offIcon';
                          const optColorKey = isOnState ? 'onColor' : 'offColor';
                          return (
                            <div key={state} className="space-y-1.5">
                              <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Icon {stateLabel}</p>
                              <div className="flex gap-1 items-start">
                                <div className="flex-1 min-w-0">
                                  <button
                                    onClick={() => setOpen(true)}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors w-full text-left"
                                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}>
                                    {Preview
                                      ? <Preview size={14} style={{ flexShrink: 0, color }} />
                                      : <span style={{ width: 14, height: 14, display: 'inline-block', flexShrink: 0 }} />}
                                    <span className="flex-1 truncate text-[11px]"
                                      style={{ color: iconName ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                      {iconName ?? 'Icon wählen…'}
                                    </span>
                                  </button>
                                  {pickerOpen && (
                                    <IconPickerModal
                                      current={iconName ?? ''}
                                      onSelect={(name) => { set({ [optIconKey]: name || undefined }); setOpen(false); }}
                                      onClose={() => setOpen(false)}
                                    />
                                  )}
                                </div>
                                <input type="color" value={color}
                                  onChange={(e) => set({ [optColorKey]: e.target.value })}
                                  title={`Farbe ${stateLabel}`}
                                  className="w-8 h-9 rounded cursor-pointer shrink-0 p-0.5"
                                  style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }} />
                              </div>
                            </div>
                          );
                        })}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Icon-Größe</label>
                            <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-primary)' }}>{ctrlIconSize} px</span>
                          </div>
                          <input type="range" min={16} max={192} step={2} value={ctrlIconSize}
                            onChange={(e) => set({ controlIconSize: Number(e.target.value) })}
                            className="w-full h-1"
                            style={{ accentColor: 'var(--accent)' }} />
                        </div>
                      </>
                    )}
                    <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Taster-Modus</label>
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Kurz true, danach automatisch false</p>
                      </div>
                      <button onClick={() => set({ momentary: !momentary })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: momentary ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: momentary ? '18px' : '2px' }} />
                      </button>
                    </div>
                    {momentary && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Impulsdauer (ms)</label>
                        <input
                          type="number" min={50} max={10000} step={50} value={delay}
                          onChange={(e) => set({ momentaryDelay: Math.max(50, Number(e.target.value)) })}
                          className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                        />
                      </div>
                    )}
                    <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Sicherheitsabfrage</label>
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Bestätigung vor dem Schalten</p>
                      </div>
                      <button onClick={() => set({ confirmAction: !confirmAction })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: confirmAction ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: confirmAction ? '18px' : '2px' }} />
                      </button>
                    </div>
                    {confirmAction && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Abfragetext (optional)</label>
                        <input
                          type="text"
                          value={(o.confirmText as string) ?? ''}
                          onChange={(e) => set({ confirmText: e.target.value })}
                          placeholder="Wirklich schalten?"
                          className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                        />
                      </div>
                    )}
                  </>
                );
              })()}

              {config.type === 'chart' && (
                <ChartHistoryConfig config={config} onConfigChange={onConfigChange} />
              )}
              {config.type === 'climate' && (
                <ClimateConfig
                  config={config}
                  onConfigChange={onConfigChange}
                  onPickerOpen={(t) => setPickerTarget(t)}
                />
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
                        <div className="flex gap-1">
                          <input type="number" min={0} max={4}
                            disabled={o.decimals === undefined}
                            value={(o.decimals as number) ?? defaultDecimals}
                            onChange={(e) => set({ decimals: Number(e.target.value) })}
                            className={gCls} style={{ ...gSty, opacity: o.decimals === undefined ? 0.5 : 1 }} />
                          <button
                            onClick={() => set({ decimals: o.decimals === undefined ? defaultDecimals : undefined })}
                            title={o.decimals === undefined ? 'Globale Einstellung aktiv – klicken für eigenen Wert' : 'Auf globale Einstellung zurücksetzen'}
                            className="px-1.5 rounded text-[10px] font-bold shrink-0"
                            style={{ background: o.decimals === undefined ? 'var(--accent)' : 'var(--app-border)', color: o.decimals === undefined ? '#fff' : 'var(--text-secondary)' }}>
                            Global
                          </button>
                        </div>
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
                      // Normalize: always ensure the last zone's max equals the gauge max.
                      // This corrects stale stored values after zones are removed/reordered.
                      const normalizeZones = (z: CZ[]): CZ[] =>
                        z.map((zone, idx) => idx === z.length - 1 ? { ...zone, max } : zone);
                      const setZones = (z: CZ[]) => set({ zones: normalizeZones(z), zone1Max: undefined, zone2Max: undefined, zone1Color: undefined, zone2Color: undefined, zone3Color: undefined });
                      const updateZone = (i: number, patch: Partial<CZ>) => setZones(zones.map((z, idx) => idx === i ? { ...z, ...patch } : z));
                      const removeZone = (i: number) => { if (zones.length > 1) setZones(zones.filter((_, idx) => idx !== i)); };
                      const addZone = () => {
                        const insertBefore = zones.length - 1;
                        const prevMax = insertBefore > 0 ? zones[insertBefore - 1].max : min;
                        // The last zone always extends to max visually, so use max (not zone.max)
                        // as the upper boundary when computing the midpoint for the new zone.
                        const newMax  = Math.round((prevMax + max) / 2);
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
                      <div className="flex gap-1">
                        <input type="text" value={(o.pointer2Datapoint as string) ?? ''} onChange={(e) => set({ pointer2Datapoint: e.target.value || undefined })}
                          placeholder="Datenpunkt-ID (leer = deaktiviert)" className={gCls + ' font-mono flex-1 min-w-0'} style={gSty} />
                        <button type="button" onClick={() => setPickerTarget('gauge_pointer2Dp')}
                          className="px-2 rounded-lg hover:opacity-80 shrink-0"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                          <Database size={13} />
                        </button>
                      </div>
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
                      <div className="flex gap-1">
                        <input type="text" value={(o.pointer3Datapoint as string) ?? ''} onChange={(e) => set({ pointer3Datapoint: e.target.value || undefined })}
                          placeholder="Datenpunkt-ID (leer = deaktiviert)" className={gCls + ' font-mono flex-1 min-w-0'} style={gSty} />
                        <button type="button" onClick={() => setPickerTarget('gauge_pointer3Dp')}
                          className="px-2 rounded-lg hover:opacity-80 shrink-0"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                          <Database size={13} />
                        </button>
                      </div>
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

              {/* ── Knob config ── */}
              {config.type === 'knob' && (() => {
                const o   = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const min          = (o.minValue as number) ?? 0;
                const max          = (o.maxValue as number) ?? 100;
                const step         = (o.step     as number) ?? 1;
                const startAngle   = (o.startAngle as number) ?? 135;
                const endAngle     = (o.endAngle   as number) ?? 405;
                const pointerStyle = (o.pointerStyle as string) ?? 'line';
                const readOnly     = !!o.readOnly;
                const isCustom     = config.layout === 'custom';
                const dialStyle    = (o.dialStyle as string | undefined) ?? 'bogen';
                const resolved     = isCustom
                  ? (dialStyle === 'endless' ? 'knob-endless' : dialStyle === 'skala' ? 'knob-scale' : 'default')
                  : (config.layout ?? 'default');
                const isEndless    = resolved === 'knob-endless';
                const isScale      = resolved === 'knob-scale';
                const showRing       = (o.showRing       as boolean | undefined) ?? true;
                const showBackground = (o.showBackground as boolean | undefined) ?? true;
                const kCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
                const kSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                const sectionHdr = (label: string) => (
                  <div className="text-[10px] font-semibold uppercase tracking-wider pt-1" style={{ color: 'var(--text-secondary)' }}>{label}</div>
                );
                return (
                  <>
                    {sectionHdr('Skala')}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Min</label>
                        <input type="number" value={min} onChange={(e) => set({ minValue: Number(e.target.value) })} className={kCls} style={kSty} />
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Max</label>
                        <input type="number" value={max} onChange={(e) => set({ maxValue: Number(e.target.value) })} className={kCls} style={kSty} />
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Schrittweite</label>
                        <input type="number" min={0} step="any" value={step} onChange={(e) => set({ step: Number(e.target.value) || 1 })} className={kCls} style={kSty} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Einheit</label>
                        <input type="text" value={(o.unit as string) ?? ''} onChange={(e) => set({ unit: e.target.value || undefined })} placeholder="°C, %, W" className={kCls} style={kSty} />
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Dezimalstellen</label>
                        <div className="flex gap-1">
                          <input type="number" min={0} max={4}
                            disabled={o.decimals === undefined}
                            value={(o.decimals as number) ?? defaultDecimals}
                            onChange={(e) => set({ decimals: Number(e.target.value) })}
                            className={kCls} style={{ ...kSty, opacity: o.decimals === undefined ? 0.5 : 1 }} />
                          <button
                            onClick={() => set({ decimals: o.decimals === undefined ? defaultDecimals : undefined })}
                            title={o.decimals === undefined ? 'Globale Einstellung aktiv – klicken für eigenen Wert' : 'Auf globale Einstellung zurücksetzen'}
                            className="px-1.5 rounded text-[10px] font-bold shrink-0"
                            style={{ background: o.decimals === undefined ? 'var(--accent)' : 'var(--app-border)', color: o.decimals === undefined ? '#fff' : 'var(--text-secondary)' }}>
                            Global
                          </button>
                        </div>
                      </div>
                    </div>

                    {sectionHdr('Darstellung')}
                    {isCustom && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Stil des Drehknopfes</label>
                        <select value={dialStyle} onChange={(e) => set({ dialStyle: e.target.value })} className={kCls} style={kSty}>
                          <option value="bogen">Bogen</option>
                          <option value="skala">Skala</option>
                          <option value="endless">Endlos (3D)</option>
                        </select>
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                          Wähle das Aussehen des Knopfes, der im Custom-Raster als Komponente <code>dial</code> erscheint.
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Zeiger-Form</label>
                      <select value={pointerStyle} onChange={(e) => set({ pointerStyle: e.target.value })} className={kCls} style={kSty}>
                        <option value="line">Linie</option>
                        <option value="circle">Punkt</option>
                        <option value="arrow">Pfeil</option>
                      </select>
                    </div>
                    {!isEndless && (
                      <>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Startwinkel (°)</label>
                            <input type="number" value={startAngle} onChange={(e) => set({ startAngle: Number(e.target.value) })} className={kCls} style={kSty} />
                          </div>
                          <div className="flex-1">
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Endwinkel (°)</label>
                            <input type="number" value={endAngle} onChange={(e) => set({ endAngle: Number(e.target.value) })} className={kCls} style={kSty} />
                          </div>
                        </div>
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                          0° = 3 Uhr, 90° = 6 Uhr, 180° = 9 Uhr, 270° = 12 Uhr. Standard 135 → 405 ergibt 270°-Bogen mit Öffnung unten.
                        </p>
                        {!isScale && (
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Bogenbreite</label>
                              <input type="number" min={1} max={40} value={(o.strokeWidth as number) ?? 14} onChange={(e) => set({ strokeWidth: Number(e.target.value) })} className={kCls} style={kSty} />
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <input type="color" value={(o.color as string) ?? (isScale ? '#1da7e0' : '#6366f1')}
                            onChange={(e) => set({ color: e.target.value })}
                            className="w-8 h-7 rounded cursor-pointer shrink-0" style={{ border: '1px solid var(--app-border)', padding: '1px' }} />
                          <div className="flex-1">
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Akzentfarbe (Bogen & Zeiger)</label>
                            <input type="text" value={(o.color as string) ?? (isScale ? '#1da7e0' : '#6366f1')} onChange={(e) => set({ color: e.target.value })}
                              className={kCls + ' font-mono'} style={kSty} />
                          </div>
                        </div>
                      </>
                    )}
                    {(isEndless || isScale) && (
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Anzahl Beschriftungen</label>
                        <input type="number" min={2} max={36}
                          value={(o.labelCount as number) ?? (isScale ? 11 : 10)}
                          onChange={(e) => set({ labelCount: Number(e.target.value) || (isScale ? 11 : 10) })}
                          className={kCls} style={kSty} />
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                          {isScale
                            ? 'Zahlenlabels am Bogen. Standard 11 → 0, 10, …, 100 für Bereich 0–100.'
                            : 'Hauptmarken mit Zahlenlabel um die Scheibe. Standard 10 → Beschriftung in Schritten von (Max−Min)/10.'}
                        </p>
                      </div>
                    )}

                    {!isEndless && (
                      <>
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Rahmen</label>
                            <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Außenring im Stil eines Drehknopfes</p>
                          </div>
                          <button onClick={() => set({ showRing: !showRing })}
                            className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                            style={{ background: showRing ? 'var(--accent)' : 'var(--app-border)' }}>
                            <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                              style={{ left: showRing ? '18px' : '2px' }} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Hintergrund</label>
                            <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Leichte graue Scheibe hinter dem Knob</p>
                          </div>
                          <button onClick={() => set({ showBackground: !showBackground })}
                            className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                            style={{ background: showBackground ? 'var(--accent)' : 'var(--app-border)' }}>
                            <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                              style={{ left: showBackground ? '18px' : '2px' }} />
                          </button>
                        </div>
                      </>
                    )}

                    {sectionHdr('Verhalten')}
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Nur Anzeige (read-only)</label>
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>Drehen deaktivieren – nur Wert anzeigen</p>
                      </div>
                      <button onClick={() => set({ readOnly: !readOnly })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: readOnly ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: readOnly ? '18px' : '2px' }} />
                      </button>
                    </div>
                  </>
                );
              })()}

              {/* ── JSON Table config ── */}
              {config.type === 'jsontable' && (
                <JsonTableConfig
                  datapoint={config.datapoint ?? ''}
                  options={config.options ?? {}}
                  onChange={(patch) => onConfigChange({ ...config, options: { ...(config.options ?? {}), ...patch } })}
                />
              )}

              {/* ── HTML config ── */}
              {config.type === 'html' && (
                <HtmlConfig
                  options={config.options ?? {}}
                  onChange={(patch) => onConfigChange({ ...config, options: { ...(config.options ?? {}), ...patch } })}
                  onOpenPicker={() => setPickerTarget('html_dp')}
                />
              )}

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
                      {(() => {
                        const url = (o.streamUrl as string) ?? '';
                        const mixedContent = url.startsWith('http://') && window.location.protocol === 'https:';
                        if (!mixedContent) return null;
                        return (
                          <p className="text-[10px] mt-1 leading-tight" style={{ color: '#f59e0b' }}>
                            ⚠ Mixed Content: Aura läuft über HTTPS, die Stream-URL ist HTTP. Desktop-Browser erlauben dies oft, mobile WebViews (z.B. Fully Kiosk) blockieren es. Lösung: in Fully Kiosk → Advanced Web Settings → <em>Allow Mixed Content</em> aktivieren, oder go2rtc per HTTPS bereitstellen.
                          </p>
                        );
                      })()}
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
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Wake-Up Datenpunkt <span style={{ opacity: 0.6 }}>(optional, z.B. Eufy)</span>
                      </label>
                      <div className="flex gap-1">
                        <input type="text" value={(o.wakeUpDp as string) ?? ''} onChange={(e) => set({ wakeUpDp: e.target.value || undefined })}
                          placeholder="adapter.0.channel.state" className={cCls + ' flex-1 font-mono min-w-0'} style={cSty} />
                        <button type="button" onClick={() => setPickerTarget('camera_wakeUpDp')}
                          className="px-2 rounded-lg shrink-0"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>…</button>
                      </div>
                    </div>
                    {(o.wakeUpDp as string) && (
                      <>
                        <div>
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Wake-Up Auslöser</label>
                          <select value={(o.wakeUpMode as string) === 'onView' ? 'onView' : 'onClick'} onChange={(e) => set({ wakeUpMode: e.target.value })} className={cCls} style={cSty}>
                            <option value="onClick">Manuell (bei Klick)</option>
                            <option value="onView">Bei Sicht (Viewport)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Wartezeit nach Wake-Up (Sek.)
                          </label>
                          <input type="number" min={1} max={30} value={(o.wakeUpDelay as number) ?? 3}
                            onChange={(e) => set({ wakeUpDelay: Number(e.target.value) })} className={cCls} style={cSty} />
                        </div>
                        <div>
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Stream-Timeout (Sek., 0 = deaktiviert)
                          </label>
                          <input type="number" min={0} value={(o.streamTimeout as number) ?? 60}
                            onChange={(e) => set({ streamTimeout: Number(e.target.value) })}
                            className={cCls} style={cSty} />
                        </div>
                      </>
                    )}

                    {/* ── Standard layout: video ratio + info rows ── */}
                    {(config.layout ?? 'minimal') === 'default' && (() => {
                      const ratio = (o.videoRatio as number) ?? 60;
                      const items: CameraSlot[] = (o.infoItems as CameraSlot[]) ?? [];
                      const updateItem = (idx: number, patch: Partial<CameraSlot>) => {
                        const next = items.map((it, i) => i === idx ? { ...it, ...patch } : it);
                        set({ infoItems: next });
                      };
                      const removeItem = (idx: number) => set({ infoItems: items.filter((_, i) => i !== idx) });
                      const addItem    = () => set({ infoItems: [...items, { type: 'empty' as CameraSlotType }] });
                      return (
                        <>
                          <div>
                            <label className="text-[11px] mb-1 flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
                              <span>Video-Anteil</span><span className="font-mono">{ratio}%</span>
                            </label>
                            <input type="range" min={20} max={85} value={ratio}
                              onChange={(e) => set({ videoRatio: Number(e.target.value) })}
                              className="w-full h-1 rounded" style={{ accentColor: 'var(--accent)' }} />
                          </div>
                          <div>
                            <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Info-Zeilen</label>
                            <div className="flex flex-col gap-1.5">
                              {items.map((item, idx) => (
                                <CameraSlotEditorRow key={idx} slot={item} idx={idx} label={`Zeile ${idx + 1}`}
                                  cCls={cCls} cSty={cSty}
                                  onChange={updateItem}
                                  onRemove={() => removeItem(idx)}
                                  onPickDp={(i) => { setCameraSlotPickerIdx(i); setPickerTarget('camera_slot'); }} />
                              ))}
                              <button onClick={addItem}
                                className="text-xs py-1.5 rounded-lg w-full"
                                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px dashed var(--app-border)' }}>
                                + Zeile hinzufügen
                              </button>
                            </div>
                          </div>
                        </>
                      );
                    })()}

                    {/* ── Custom Grid layout: template + slots ── */}
                    {(config.layout ?? 'minimal') === 'custom' && (() => {
                      const tmplId = (o.cameraTemplate as CameraTemplateId) ?? 'stream-left';
                      const tmpl   = CAMERA_TEMPLATES[tmplId];
                      const slots: CameraSlot[] = (o.customSlots as CameraSlot[]) ?? [];
                      const handleTmplChange = (newId: string) => {
                        const spec    = CAMERA_TEMPLATES[newId as CameraTemplateId];
                        const padded  = Array.from({ length: spec.slotCount }, (_, i) => slots[i] ?? { type: 'empty' as CameraSlotType });
                        set({ cameraTemplate: newId, customSlots: padded });
                      };
                      const updateSlot = (idx: number, patch: Partial<CameraSlot>) => {
                        const next = slots.map((s, i) => i === idx ? { ...s, ...patch } : s);
                        set({ customSlots: next });
                      };
                      const paddedSlots = Array.from({ length: tmpl.slotCount }, (_, i) => slots[i] ?? { type: 'empty' as CameraSlotType });
                      return (
                        <>
                          <div>
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Aufteilung</label>
                            <select value={tmplId} onChange={(e) => handleTmplChange(e.target.value)} className={cCls} style={cSty}>
                              {(Object.entries(CAMERA_TEMPLATES) as [CameraTemplateId, typeof tmpl][]).map(([id, spec]) => (
                                <option key={id} value={id}>{spec.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Slots</label>
                            <div className="flex flex-col gap-1.5">
                              {paddedSlots.map((slot, idx) => (
                                <CameraSlotEditorRow key={idx} slot={slot} idx={idx} label={`Slot ${idx + 1}`}
                                  cCls={cCls} cSty={cSty}
                                  onChange={updateSlot}
                                  onPickDp={(i) => { setCameraSlotPickerIdx(i); setPickerTarget('camera_slot'); }} />
                              ))}
                            </div>
                          </div>
                        </>
                      );
                    })()}
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
                        Bild-URL, base64 oder lokale Datei <span style={{ opacity: 0.6 }}>(https://… · data:image/… · Datei-Picker)</span>
                      </label>
                      <div className="flex gap-1">
                        <input type="text" value={imageUrl}
                          onChange={(e) => set({ imageUrl: e.target.value || undefined })}
                          placeholder="https://…/bild.jpg oder base64-String"
                          className={`flex-1 ${iCls} font-mono min-w-0`} style={iSty} />
                        <button
                          onClick={() => setImageFilePicker(true)}
                          className="px-2 rounded-lg hover:opacity-80 shrink-0"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                          title="Lokale Datei vom Server wählen">
                          <FolderOpen size={13} />
                        </button>
                      </div>
                      {imageUrl.startsWith('aura-file:') && (
                        <p className="text-[10px] mt-1 truncate" style={{ color: 'var(--accent)' }}>
                          {imageUrl.slice('aura-file:'.length).split('/').pop()}
                        </p>
                      )}
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

              {/* ── Static List config ── */}
              {config.type === 'list' && (
                <StaticListConfig config={config} onConfigChange={onConfigChange} />
              )}

              {/* ── Enum / Auswahlfeld config ── */}
              {config.type === 'enum' && (
                <EnumConfig config={config} onConfigChange={onConfigChange} />
              )}

              {/* ── Carousel config ── */}
              {config.type === 'carousel' && (() => {
                const o   = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const loop      = !!o.loop;
                const showDots  = o.showDots   !== false;
                const showArrows = o.showArrows !== false;
                const autoplay  = !!o.autoplay;
                const interval  = (o.autoplayInterval as number) ?? 5;
                const Toggle = ({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) => (
                  <div className="flex items-center justify-between">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{label}</label>
                    <button onClick={onToggle}
                      className="relative w-9 h-5 rounded-full transition-colors"
                      style={{ background: value ? 'var(--accent)' : 'var(--app-border)' }}>
                      <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                        style={{ left: value ? '18px' : '2px' }} />
                    </button>
                  </div>
                );
                return (
                  <>
                    <Toggle label={t('carousel.opt.loop')}       value={loop}       onToggle={() => set({ loop: !loop })} />
                    <Toggle label={t('carousel.opt.showDots')}   value={showDots}   onToggle={() => set({ showDots: !showDots })} />
                    <Toggle label={t('carousel.opt.showArrows')} value={showArrows} onToggle={() => set({ showArrows: !showArrows })} />
                    <Toggle label={t('carousel.opt.autoplay')}   value={autoplay}   onToggle={() => set({ autoplay: !autoplay })} />
                    {autoplay && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                          {t('carousel.opt.interval')} <span style={{ opacity: 0.6 }}>(s)</span>
                        </label>
                        <input type="number" min={1} max={60} step={1} value={interval}
                          onChange={(e) => set({ autoplayInterval: Math.max(1, Number(e.target.value) || 5) })}
                          className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
                      </div>
                    )}
                  </>
                );
              })()}

              {/* ── iFrame config ── */}
              {config.type === 'iframe' && (() => {
                const o   = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono';
                const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                const urlMode = (o.iframeUrlMode as string) ?? 'static';
                return (
                  <>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>URL-Quelle</label>
                      <div className="flex gap-1">
                        {(['static', 'datapoint'] as const).map((m) => (
                          <button key={m}
                            onClick={() => set({ iframeUrlMode: m })}
                            className="flex-1 text-[11px] py-1 rounded-lg transition-colors"
                            style={{
                              background: urlMode === m ? 'var(--accent)' : 'var(--app-bg)',
                              color: urlMode === m ? '#fff' : 'var(--text-secondary)',
                              border: '1px solid var(--app-border)',
                            }}>
                            {m === 'static' ? 'Direkte URL' : 'Datenpunkt'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {urlMode === 'static' && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>URL</label>
                        <input type="text" value={(o.iframeUrl as string) ?? ''}
                          onChange={(e) => set({ iframeUrl: e.target.value || undefined })}
                          placeholder="https://…"
                          className={iCls} style={iSty} />
                      </div>
                    )}
                    {urlMode === 'datapoint' && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>URL-Datenpunkt</label>
                        <div className="flex gap-1">
                          <input type="text" value={(o.iframeUrlDp as string) ?? ''}
                            onChange={(e) => set({ iframeUrlDp: e.target.value || undefined })}
                            placeholder="Datenpunkt-ID"
                            className={iCls + ' font-mono flex-1 min-w-0'} style={iSty} />
                          <button type="button" onClick={() => setPickerTarget('iframe_urlDp')}
                            className="px-2 rounded-lg hover:opacity-80 shrink-0"
                            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                            …
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Proxy nutzen</label>
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Umgeht X-Frame-Options des Zielservers</p>
                      </div>
                      <button onClick={() => set({ useProxy: !(o.useProxy ?? false) })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: (o.useProxy ?? false) ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.useProxy ?? false) ? '18px' : '2px' }} />
                      </button>
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
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Vollbild-Button anzeigen</label>
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>Button erscheint beim Darüberfahren mit der Maus</p>
                      </div>
                      <button onClick={() => set({ fullscreenButton: !(o.fullscreenButton ?? false) })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: (o.fullscreenButton ?? false) ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.fullscreenButton ?? false) ? '18px' : '2px' }} />
                      </button>
                    </div>
                    {(() => {
                      const currentTab = activeTabs.find((t) => t.widgets?.some((w) => w.id === config.id));
                      const otherCount = (currentTab?.widgets?.length ?? 1) - 1;
                      const canEnable  = otherCount === 0;
                      const isEnabled  = !!(o.fillTab ?? false);
                      return (
                        <div className="flex items-start justify-between gap-2">
                          <div style={{ opacity: canEnable || isEnabled ? 1 : 0.5 }}>
                            <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Tab ausfüllen</label>
                            <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                              {canEnable || isEnabled
                                ? 'iFrame füllt den gesamten Tab-Bereich aus'
                                : `Entferne zuerst die anderen ${otherCount} Widget${otherCount === 1 ? '' : 's'} aus diesem Tab`}
                            </p>
                          </div>
                          <button
                            onClick={() => { if (canEnable || isEnabled) set({ fillTab: !isEnabled }); }}
                            disabled={!canEnable && !isEnabled}
                            className="relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{ background: isEnabled ? 'var(--accent)' : 'var(--app-border)' }}>
                            <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                              style={{ left: isEnabled ? '18px' : '2px' }} />
                          </button>
                        </div>
                      );
                    })()}
                  </>
                );
              })()}

              {/* ── eCharts Preset config ── */}
              {config.type === 'echartsPreset' && (
                <EChartsPresetConfig config={config} onConfigChange={onConfigChange} />
              )}

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
                    {(['default', 'battery', 'segments'] as string[]).includes(config.layout ?? 'default') && (
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
                    )}
                    {['default', 'battery', 'segments', 'wave'].includes(config.layout ?? 'default') && (
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Balkenbreite/-höhe <span style={{ opacity: 0.6 }}>(% des Widgets)</span>
                      </label>
                      <input type="number" min={20} max={150}
                        defaultValue={(o.barSize as number) ?? 80}
                        onBlur={(e) => { const v = Math.min(150, Math.max(20, Number(e.target.value) || 80)); set({ barSize: v }); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className={fCls} style={fSty} />
                    </div>
                    )}
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
                        <div className="flex gap-1">
                          <input type="number" min={0} max={4}
                            disabled={o.decimals === undefined}
                            value={(o.decimals as number) ?? defaultDecimals}
                            onChange={(e) => set({ decimals: Number(e.target.value) })}
                            className={fCls} style={{ ...fSty, opacity: o.decimals === undefined ? 0.5 : 1 }} />
                          <button
                            onClick={() => set({ decimals: o.decimals === undefined ? defaultDecimals : undefined })}
                            title={o.decimals === undefined ? 'Globale Einstellung aktiv – klicken für eigenen Wert' : 'Auf globale Einstellung zurücksetzen'}
                            className="px-1.5 rounded text-[10px] font-bold shrink-0"
                            style={{ background: o.decimals === undefined ? 'var(--accent)' : 'var(--app-border)', color: o.decimals === undefined ? '#fff' : 'var(--text-secondary)' }}>
                            Global
                          </button>
                        </div>
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
                      const normalizeZones = (z: CZ[]): CZ[] =>
                        z.map((zone, idx) => idx === z.length - 1 ? { ...zone, max } : zone);
                      const setZones   = (z: CZ[]) => set({ zones: normalizeZones(z) });
                      const updateZone = (i: number, patch: Partial<CZ>) => setZones(zones.map((z, idx) => idx === i ? { ...z, ...patch } : z));
                      const removeZone = (i: number) => { if (zones.length > 1) setZones(zones.filter((_, idx) => idx !== i)); };
                      const addZone    = () => {
                        const insertBefore = zones.length - 1;
                        const prevMax  = insertBefore > 0 ? zones[insertBefore - 1].max : min;
                        const newZones = [...zones];
                        newZones.splice(insertBefore, 0, { max: Math.round((prevMax + max) / 2), color: '#6366f1' });
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

              {/* ── Timer / Zeitschaltuhr config ── */}
              {config.type === 'timer' && (
                <TimerConfig config={config} onConfigChange={onConfigChange} />
              )}

              {/* ── TrashSchedule / Müllabfuhr-Zeitplan config ── */}
              {config.type === 'trashSchedule' && (
                <TrashScheduleConfig config={config} onConfigChange={onConfigChange} />
              )}

              {/* ── Adapter-Status config ── */}
              {config.type === 'adapterstatus' && (() => {
                const o = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const aCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
                const aSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                const filterMode = (o.filterMode as string) ?? 'all';
                const sortBy     = (o.sortBy     as string) ?? 'name';
                const Toggle = ({ label, k, def, hint }: { label: string; k: string; def?: boolean; hint?: string }) => {
                  const val = (o[k] as boolean | undefined) ?? def ?? false;
                  return (
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{label}</label>
                        {hint && <span className="text-[10px] opacity-60" style={{ color: 'var(--text-secondary)' }}>{hint}</span>}
                      </div>
                      <button
                        onClick={() => set({ [k]: !val })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: val ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: val ? '18px' : '2px' }} />
                      </button>
                    </div>
                  );
                };
                return (
                  <>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Standard-Filter</label>
                      <select value={filterMode} onChange={(e) => set({ filterMode: e.target.value })} className={aCls} style={aSty}>
                        <option value="all">Alle anzeigen</option>
                        <option value="enabled">Nur aktivierte</option>
                        <option value="running">Nur laufende</option>
                        <option value="stopped">Nur gestoppte</option>
                        <option value="updates">Nur mit Update</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Sortierung</label>
                      <select value={sortBy} onChange={(e) => set({ sortBy: e.target.value })} className={aCls} style={aSty}>
                        <option value="name">Nach Name</option>
                        <option value="status">Nach Status (laufend zuerst)</option>
                      </select>
                    </div>
                    <Toggle label="Filter-Buttons im Frontend" k="showFilter" def={true} hint="Nutzer können den Filter umschalten" />
                    <Toggle label="Suchfeld anzeigen" k="showSearch" def={true} hint="Erscheint ab > 5 Instanzen" />
                    <Toggle label="Version anzeigen"  k="showVersion" def={true} />
                    <Toggle label="Kompakte Darstellung" k="compact"   def={false} hint="Untertitel/Beschreibung ausblenden" />
                    <div className="h-px my-1" style={{ background: 'var(--app-border)' }} />
                    <Toggle label="Neustart erlauben"        k="allowRestart" def={false} hint="Button zum Neustarten der Instanz" />
                    <Toggle label="Update-Installation erlauben" k="allowUpdate"  def={false} hint="Button zum Installieren verfügbarer Updates (Host-Befehl)" />
                  </>
                );
              })()}

              {config.type === 'light' && (() => {
                const o = config.options ?? {};
                const setO = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const autoFillLight = async () => {
                  if (!config.datapoint) return;
                  const entries = await ensureDatapointCache();
                  const detected = autoDetectLightDps(config.datapoint, entries);
                  const opts: Record<string, unknown> = {};
                  for (const [k, v] of Object.entries(detected)) {
                    if (v !== undefined && v !== '') opts[k] = v;
                  }
                  if (Object.keys(opts).length) setO(opts);
                };
                const lInputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono';
                const lInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                const hint: React.CSSProperties = { color: 'var(--text-secondary)' };
                const colorMode = (o.colorMode as string) ?? 'none';
                const wheelStyle = (o.colorWheelStyle as string) ?? 'disc';
                const presets = (o.colorPresets as string[] | undefined) ?? ['#ff3b30', '#ff9500', '#ffd60a', '#e5e5ea', '#5ac8fa', '#bf5af2', '#ff79c6', '#ff453a'];
                const effects = (o.effects as Array<{ label: string; value: string; color?: string }> | undefined) ?? [];
                const dpRow = (optKey: string, pickerKey: 'light_switchDp' | 'light_brightnessDp' | 'light_hueDp' | 'light_saturationDp' | 'light_rDp' | 'light_gDp' | 'light_bDp' | 'light_colorDp' | 'light_temperatureDp' | 'light_effectDp', placeholder = 'optional') => (
                  <div className="flex gap-1">
                    <input type="text" value={(o[optKey] as string) ?? ''}
                      onChange={(e) => setO({ [optKey]: e.target.value || undefined })}
                      placeholder={placeholder}
                      className={`flex-1 ${lInputCls} min-w-0`} style={lInputStyle} />
                    <button onClick={() => setPickerTarget(pickerKey)}
                      className="px-2 rounded-lg hover:opacity-80 shrink-0"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                      <Database size={13} />
                    </button>
                  </div>
                );
                return (
                  <>
                    {/* Auto-Erkennen */}
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={hint}>Datenpunkte aus Geschwistern füllen</label>
                      <button onClick={() => void autoFillLight()}
                        disabled={!config.datapoint}
                        className="text-[10px] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
                        style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', border: '1px solid var(--accent)44' }}>
                        ✨ Auto-Erkennen
                      </button>
                    </div>

                    {/* Switch DP */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={hint}>Schalt-DP (An/Aus, boolean)</label>
                      {dpRow('switchDp', 'light_switchDp', 'optional')}
                      <p className="text-[10px] mt-1" style={hint}>Ohne Schalt-DP wird LEVEL/Brightness=0 als Aus interpretiert.</p>
                      {!!(o.switchDp as string) && (() => {
                        const raw = o.powerButtonSize;
                        const pxVal = typeof raw === 'number' && Number.isFinite(raw)
                          ? Math.max(40, Math.min(480, Math.round(raw)))
                          : 120;
                        return (
                          <div className="mt-2">
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px]" style={hint}>Schalter-Größe (max.)</label>
                              <span className="text-[10px] font-mono" style={hint}>{pxVal} px</span>
                            </div>
                            <input type="range" min={40} max={480} step={4} value={pxVal}
                              onChange={(e) => setO({ powerButtonSize: Number(e.target.value) })}
                              className="w-full" />
                          </div>
                        );
                      })()}
                    </div>

                    {/* Brightness DP */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={hint}>Helligkeits-DP (Dimmer 0–100)</label>
                      {dpRow('brightnessDp', 'light_brightnessDp', 'z.B. hue.0…level')}
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div>
                          <label className="text-[10px]" style={hint}>Min</label>
                          <input type="number" value={(o.brightnessMin as number) ?? 0}
                            onChange={(e) => setO({ brightnessMin: Number(e.target.value) })}
                            className={lInputCls} style={lInputStyle} />
                        </div>
                        <div>
                          <label className="text-[10px]" style={hint}>Max</label>
                          <input type="number" value={(o.brightnessMax as number) ?? 100}
                            onChange={(e) => setO({ brightnessMax: Number(e.target.value) })}
                            className={lInputCls} style={lInputStyle} />
                        </div>
                      </div>
                      {!!(o.brightnessDp as string) && (() => {
                        const raw = o.brightnessBarSize;
                        const pxVal = typeof raw === 'number' && Number.isFinite(raw)
                          ? Math.max(60, Math.min(800, Math.round(raw)))
                          : 220;
                        return (
                          <div className="mt-2">
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px]" style={hint}>Helligkeits-Balken-Größe (max.)</label>
                              <span className="text-[10px] font-mono" style={hint}>{pxVal} px</span>
                            </div>
                            <input type="range" min={60} max={800} step={4} value={pxVal}
                              onChange={(e) => setO({ brightnessBarSize: Number(e.target.value) })}
                              className="w-full" />
                          </div>
                        );
                      })()}
                    </div>

                    {/* Color mode */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={hint}>Farb-Modus</label>
                      <div className="grid grid-cols-2 gap-1">
                        {([
                          { val: 'none',     label: 'Keine Farbe' },
                          { val: 'hsv',      label: 'HSV (Hue + Sat)' },
                          { val: 'rgb',      label: 'RGB (3 DPs)' },
                          { val: 'hm-color', label: 'HmIP Color (0–200)' },
                        ] as const).map(({ val, label }) => (
                          <button key={val} onClick={() => setO({ colorMode: val })}
                            className="py-1.5 px-2 rounded-lg text-[10px] font-medium transition-colors"
                            style={{
                              background: colorMode === val ? 'var(--accent)' : 'var(--app-bg)',
                              color: colorMode === val ? '#fff' : 'var(--text-secondary)',
                              border: '1px solid var(--app-border)',
                            }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Mode-specific DPs */}
                    {colorMode === 'hsv' && (
                      <>
                        <div>
                          <label className="text-[11px] mb-1 block" style={hint}>Hue-DP (0–360°)</label>
                          {dpRow('hueDp', 'light_hueDp', 'z.B. hue.0…hue')}
                        </div>
                        <div>
                          <label className="text-[11px] mb-1 block" style={hint}>Sättigung-DP</label>
                          {dpRow('saturationDp', 'light_saturationDp', 'z.B. hue.0…sat')}
                          <div className="mt-1">
                            <label className="text-[10px]" style={hint}>Max (Hue: 254, generisch: 100)</label>
                            <input type="number" value={(o.satMax as number) ?? 100}
                              onChange={(e) => setO({ satMax: Number(e.target.value) })}
                              className={lInputCls} style={lInputStyle} />
                          </div>
                        </div>
                      </>
                    )}
                    {colorMode === 'rgb' && (
                      <>
                        <div>
                          <label className="text-[11px] mb-1 block" style={hint}>Rot-DP (0–255)</label>
                          {dpRow('rDp', 'light_rDp')}
                        </div>
                        <div>
                          <label className="text-[11px] mb-1 block" style={hint}>Grün-DP (0–255)</label>
                          {dpRow('gDp', 'light_gDp')}
                        </div>
                        <div>
                          <label className="text-[11px] mb-1 block" style={hint}>Blau-DP (0–255)</label>
                          {dpRow('bDp', 'light_bDp')}
                        </div>
                      </>
                    )}
                    {colorMode === 'hm-color' && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={hint}>HmIP Color-DP (0–200; 200 = Weiß)</label>
                        {dpRow('colorDp', 'light_colorDp', 'z.B. hm-rpc…2.COLOR')}
                        <div className="mt-1">
                          <label className="text-[10px]" style={hint}>Weiß-Wert</label>
                          <input type="number" value={(o.hmWhiteValue as number) ?? 200}
                            onChange={(e) => setO({ hmWhiteValue: Number(e.target.value) })}
                            className={lInputCls} style={lInputStyle} />
                        </div>
                      </div>
                    )}

                    {/* Wheel style — only if color mode active */}
                    {colorMode !== 'none' && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={hint}>Farbrad-Stil</label>
                        <div className="flex gap-1">
                          {([
                            { val: 'disc', label: 'Disc (HSV-Scheibe)' },
                            { val: 'ring', label: 'Ring (nur Hue)' },
                          ] as const).map(({ val, label }) => (
                            <button key={val} onClick={() => setO({ colorWheelStyle: val })}
                              className="flex-1 py-1.5 px-2 rounded-lg text-[10px] font-medium transition-colors"
                              style={{
                                background: wheelStyle === val ? 'var(--accent)' : 'var(--app-bg)',
                                color: wheelStyle === val ? '#fff' : 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                              }}>
                              {label}
                            </button>
                          ))}
                        </div>
                        {(() => {
                          const raw = o.colorWheelSize;
                          const wheelSizePx = typeof raw === 'number' && Number.isFinite(raw)
                            ? Math.max(80, Math.min(800, Math.round(raw)))
                            : 240;
                          return (
                            <div className="mt-2">
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[11px]" style={hint}>Farbrad-Größe (max.)</label>
                                <span className="text-[10px] font-mono" style={hint}>{wheelSizePx} px</span>
                              </div>
                              <input type="range" min={80} max={800} step={4} value={wheelSizePx}
                                onChange={(e) => setO({ colorWheelSize: Number(e.target.value) })}
                                className="w-full" />
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Temperature DP */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={hint}>Lichtwärme-DP (°K)</label>
                      {dpRow('temperatureDp', 'light_temperatureDp', 'optional, z.B. hue.0…ct')}
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div>
                          <label className="text-[10px]" style={hint}>Min (warm)</label>
                          <input type="number" value={(o.ctMin as number) ?? 2000}
                            onChange={(e) => setO({ ctMin: Number(e.target.value) })}
                            className={lInputCls} style={lInputStyle} />
                        </div>
                        <div>
                          <label className="text-[10px]" style={hint}>Max (kalt)</label>
                          <input type="number" value={(o.ctMax as number) ?? 6500}
                            onChange={(e) => setO({ ctMax: Number(e.target.value) })}
                            className={lInputCls} style={lInputStyle} />
                        </div>
                      </div>
                      {(!!(o.temperatureDp as string) || colorMode === 'hm-color') && (() => {
                        const raw = o.ctSliderSize;
                        const pxVal = typeof raw === 'number' && Number.isFinite(raw)
                          ? Math.max(60, Math.min(800, Math.round(raw)))
                          : 220;
                        return (
                          <div className="mt-2">
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[11px]" style={hint}>Lichtwärme-Slider-Größe (max.)</label>
                              <span className="text-[10px] font-mono" style={hint}>{pxVal} px</span>
                            </div>
                            <input type="range" min={60} max={800} step={4} value={pxVal}
                              onChange={(e) => setO({ ctSliderSize: Number(e.target.value) })}
                              className="w-full" />
                          </div>
                        );
                      })()}
                    </div>

                    {/* Effects DP */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={hint}>Effekt-DP (Programm)</label>
                      {dpRow('effectDp', 'light_effectDp', 'optional, z.B. hm-rpc…3.PROGRAM')}
                      {!!(o.effectDp as string) && (
                        <div className="mt-2 space-y-1.5">
                          <p className="text-[10px]" style={hint}>Effekte (Label + Wert):</p>
                          {effects.map((eff, i) => (
                            <div key={i} className="flex gap-1 items-center">
                              <input type="text" value={eff.label}
                                placeholder="Name"
                                onChange={(e) => {
                                  const next = [...effects];
                                  next[i] = { ...next[i], label: e.target.value };
                                  setO({ effects: next });
                                }}
                                className={`${lInputCls} flex-1 min-w-0`} style={lInputStyle} />
                              <input type="text" value={eff.value}
                                placeholder="Wert"
                                onChange={(e) => {
                                  const next = [...effects];
                                  next[i] = { ...next[i], value: e.target.value };
                                  setO({ effects: next });
                                }}
                                className={`${lInputCls}`} style={{ ...lInputStyle, width: 70 }} />
                              <input type="color" value={eff.color || '#888888'}
                                onChange={(e) => {
                                  const next = [...effects];
                                  next[i] = { ...next[i], color: e.target.value };
                                  setO({ effects: next });
                                }}
                                className="w-7 h-7 rounded cursor-pointer shrink-0" style={{ border: '1px solid var(--app-border)', padding: '1px' }} />
                              <button onClick={() => setO({ effects: effects.filter((_, idx) => idx !== i) })}
                                className="text-[11px] w-6 h-7 flex items-center justify-center rounded shrink-0"
                                style={{ color: 'var(--text-secondary)', background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>×</button>
                            </div>
                          ))}
                          <button onClick={() => setO({ effects: [...effects, { label: 'Effekt', value: String(effects.length), color: '#fbbf24' }] })}
                            className="w-full text-[11px] py-1.5 rounded-lg hover:opacity-80"
                            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                            + Effekt hinzufügen
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Color presets */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={hint}>Farbpalette (8 Slots)</label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {Array.from({ length: 8 }).map((_, i) => {
                          const hex = presets[i] ?? '#888888';
                          return (
                            <input key={i} type="color" value={hex}
                              onChange={(e) => {
                                const next = [...presets];
                                while (next.length < 8) next.push('#888888');
                                next[i] = e.target.value;
                                setO({ colorPresets: next });
                              }}
                              className="w-full h-8 rounded cursor-pointer"
                              style={{ border: '1px solid var(--app-border)', padding: '1px' }} />
                          );
                        })}
                      </div>
                      <div className="mt-2">
                        {(() => {
                          const rawPs = o.paletteSize;
                          const paletteSizePx = typeof rawPs === 'number' && Number.isFinite(rawPs)
                            ? Math.max(12, Math.min(96, Math.round(rawPs)))
                            : rawPs === 'sm' ? 22 : rawPs === 'lg' ? 48 : 32;
                          return (
                            <>
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[11px]" style={hint}>Farbpalette-Größe</label>
                                <span className="text-[10px] font-mono" style={hint}>{paletteSizePx} px</span>
                              </div>
                              <input type="range" min={12} max={192} step={1} value={paletteSizePx}
                                onChange={(e) => setO({ paletteSize: Number(e.target.value) })}
                                className="w-full" />
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </>
                );
              })()}

              {config.type === 'dimmer' && (() => {
                const o = config.options ?? {};
                const setO = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const dInputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono';
                const dInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                return (
                  <>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Schalt-DP für An/Aus (z.B. Shelly/KNX)</label>
                      <div className="flex gap-1">
                        <input type="text" value={(o.switchDp as string) ?? ''}
                          onChange={(e) => setO({ switchDp: e.target.value || undefined })}
                          placeholder="optional"
                          className={`flex-1 ${dInputCls} min-w-0`} style={dInputStyle} />
                        <button onClick={() => setPickerTarget('dimmer_switchDp')}
                          className="px-2 rounded-lg hover:opacity-80 shrink-0"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                          <Database size={13} />
                        </button>
                      </div>
                      {!(o.switchDp as string) && (
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                          Ohne Schalt-DP setzt der An/Aus-Schalter den Helligkeitswert auf 0 bzw. 100.
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Erst bei Loslassen senden</label>
                      <button
                        onClick={() => setO({ sendOnRelease: !(o.sendOnRelease !== false) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: o.sendOnRelease !== false ? 'var(--accent)' : 'var(--app-border)' }}
                      >
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: o.sendOnRelease !== false ? '18px' : '2px' }} />
                      </button>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!o.barStyle}
                        onChange={(e) => setO({ barStyle: e.target.checked || undefined })}
                        className="rounded"
                      />
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Bar-Stil</span>
                    </label>
                    {o.barStyle && (
                      <div className="flex items-center gap-1">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Bar-Breite (%)</span>
                        <input
                          type="number"
                          min={5}
                          max={100}
                          value={(o.barSize as number) ?? 100}
                          onChange={(e) => setO({ barSize: Number(e.target.value) })}
                          className="text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)', width: 60 }}
                        />
                      </div>
                    )}
                  </>
                );
              })()}

              {config.type === 'shutter' && (() => {
                const o = config.options ?? {};
                const setO = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const sInputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono';
                const sInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                const hint: React.CSSProperties = { color: 'var(--text-secondary)' };
                const controlMode = (o.controlMode as string) ?? 'position';
                const autoFill = async () => {
                  if (!config.datapoint) return;
                  const parts = config.datapoint.split('.');
                  const parent = parts.slice(0, -1).join('.');
                  const entries = await ensureDatapointCache();
                  const sibs = entries.filter((e) => e.id.startsWith(parent + '.'));
                  const find = (...names: string[]) => names.map((n) => sibs.find((e) => e.id === `${parent}.${n}`)?.id).find(Boolean);
                  const patch: Record<string, unknown> = {};
                  { const v = find('WORKING', 'working', 'ACTIVITY_STATE', 'activity_state', 'PROCESS', 'process', 'state', 'moving', 'activity', 'ACTIVITY'); if (v) patch.activityDp = v; }
                  { const v = find('DIRECTION', 'direction'); if (v) patch.directionDp = v; }
                  { const v = find('STOP', 'stop', 'Pause', 'pause'); if (v) patch.stopDp = v; }
                  if (Object.keys(patch).length) setO(patch);
                };
                const dpRow = (optKey: string, pickerKey: string, placeholder = 'optional') => (
                  <div className="flex gap-1">
                    <input type="text" value={(o[optKey] as string) ?? ''}
                      onChange={(e) => setO({ [optKey]: e.target.value || undefined })}
                      placeholder={placeholder}
                      className={`flex-1 ${sInputCls} min-w-0`} style={sInputStyle} />
                    <button onClick={() => setPickerTarget(pickerKey as Parameters<typeof setPickerTarget>[0])}
                      className="px-2 rounded-lg hover:opacity-80 shrink-0"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                      <Database size={13} />
                    </button>
                  </div>
                );
                return (
                  <>
                    {/* Steuer-Modus */}
                    <div>
                      <label className="text-[11px] block mb-1" style={hint}>Steuer-Modus</label>
                      <div className="flex gap-1 mb-1">
                        {([
                          { label: 'Position (Standard)', val: 'position' },
                          { label: 'Taster (AUF/ZU/STOP)', val: 'taster' },
                        ] as const).map(({ label, val }) => (
                          <button key={val} onClick={() => setO({ controlMode: val })}
                            className="flex-1 py-1 px-2 rounded-lg text-[10px] font-medium transition-colors"
                            style={{
                              background: controlMode === val ? 'var(--accent)' : 'var(--app-bg)',
                              color: controlMode === val ? '#fff' : 'var(--text-secondary)',
                              border: '1px solid var(--app-border)',
                            }}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px]" style={hint}>
                        {controlMode === 'position'
                          ? 'Schreibt 0–100 % direkt auf den Positions-DP (z.B. Homematic, Z-Wave).'
                          : 'Schreibt true auf separate Boolean-Taster-DPs (z.B. Dooya, 433 MHz, Zigbee-Skript).'}
                      </p>
                    </div>

                    {/* AUF-Taster DP – nur im Taster-Modus */}
                    {controlMode === 'taster' && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={hint}>AUF-Taster DP</label>
                        {dpRow('openDp', 'shutter_openDp', 'z.B. 0_userdata.0…auf')}
                        <p className="text-[10px] mt-1" style={hint}>
                          Boolean-DP – ein kurzer true-Impuls öffnet die Jalousie.
                        </p>
                      </div>
                    )}

                    {/* ZU-Taster DP – nur im Taster-Modus */}
                    {controlMode === 'taster' && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={hint}>ZU-Taster DP</label>
                        {dpRow('closeDp', 'shutter_closeDp', 'z.B. 0_userdata.0…zu')}
                        <p className="text-[10px] mt-1" style={hint}>
                          Boolean-DP – ein kurzer true-Impuls schließt die Jalousie.
                        </p>
                      </div>
                    )}

                    {/* Stop-DP */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={hint}>
                        Stop-DP{controlMode === 'position' ? ' – empfohlen' : ''}
                      </label>
                      {dpRow('stopDp', 'shutter_stopDp', 'z.B. …STOP oder …stop')}
                      <p className="text-[10px] mt-1" style={hint}>
                        {controlMode === 'taster'
                          ? 'Boolean-DP – ein true-Impuls stoppt die Fahrt (z.B. …Schlafzimmer.stop).'
                          : (o.stopDp as string)
                            ? 'Boolean-DP – ein true-Impuls stoppt die Fahrt (z.B. Homematic STOP).'
                            : 'Ohne Stop-DP wird die Position vor dem letzten Fahrbefehl als Ziel zurückgesendet.'}
                      </p>
                    </div>

                    {/* Fahrt-Status DP */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px]" style={hint}>Fahrt-Status DP</label>
                        <button onClick={() => void autoFill()}
                          className="text-[10px] px-2.5 py-1 rounded-lg transition-colors hover:opacity-80 disabled:opacity-40"
                          style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', border: '1px solid var(--accent)44' }}>
                          ✨ Auto-Erkennen
                        </button>
                      </div>
                      {dpRow('activityDp', 'shutter_activityDp')}
                      <p className="text-[10px] mt-1" style={hint}>
                        {controlMode === 'position'
                          ? 'Zeigt an ob der Rollladen fährt. HM: WORKING (Boolean), HmIP: ACTIVITY_STATE, Zigbee: moving.'
                          : 'Aktueller Fahrzustand des Skripts (z.B. …aktueller_befehl). Leer lassen wenn nicht vorhanden.'}
                      </p>
                    </div>

                    {/* Bewegungs-Werte – nur Taster-Modus mit befülltem activityDp */}
                    {controlMode === 'taster' && !!(o.activityDp as string) && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={hint}>Bewegungs-Werte (kommagetrennt)</label>
                        <input type="text" value={(o.activityMovingValues as string) ?? ''}
                          onChange={(e) => setO({ activityMovingValues: e.target.value || undefined })}
                          placeholder="z.B. AUF,ZU"
                          className={sInputCls} style={sInputStyle} />
                        <p className="text-[10px] mt-1" style={hint}>
                          Werte des Fahrt-Status-DP die &quot;fährt gerade&quot; bedeuten. Leer = Boolean-Prüfung (true / 1).
                        </p>
                      </div>
                    )}

                    {/* Richtungs-DP – nur Position-Modus */}
                    {controlMode === 'position' && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={hint}>Richtungs-DP (optional)</label>
                        {dpRow('directionDp', 'shutter_directionDp')}
                        <p className="text-[10px] mt-1" style={hint}>
                          Wert 1 = fährt auf, Wert 2 = fährt zu – zeigt Pfeil im Widget (z.B. Homematic DIRECTION).
                        </p>
                      </div>
                    )}

                    {/* Aktor-Konvention – nur Position-Modus */}
                    {controlMode === 'position' && (
                      <div>
                        <label className="text-[11px] block mb-1" style={hint}>Aktor-Konvention</label>
                        <div className="flex gap-1 mb-1">
                          {([
                            { label: 'HM / Standard (0=zu)', val: false },
                            { label: 'HmIP (0=auf)', val: true },
                          ] as const).map(({ label, val }) => (
                            <button key={String(val)} onClick={() => setO({ invertPosition: val })}
                              className="flex-1 py-1 px-2 rounded-lg text-[10px] font-medium transition-colors"
                              style={{
                                background: (o.invertPosition ?? false) === val ? 'var(--accent)' : 'var(--app-bg)',
                                color: (o.invertPosition ?? false) === val ? '#fff' : 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                              }}>
                              {label}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px]" style={hint}>
                          HM Classic / Z-Wave: 0 = geschlossen, 100 = offen. HmIP / manche Zigbee-Adapter: umgekehrt.
                        </p>
                      </div>
                    )}

                    {/* % geschlossen anzeigen */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <label className="text-[11px] block" style={hint}>% geschlossen anzeigen</label>
                        <p className="text-[10px]" style={hint}>Ein: 0 % = ganz offen. Aus: 100 % = ganz offen.</p>
                      </div>
                      <button
                        onClick={() => setO({ showClosedPercent: !(o.showClosedPercent ?? false) })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5"
                        style={{ background: (o.showClosedPercent ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                      >
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.showClosedPercent ?? false) ? '18px' : '2px' }} />
                      </button>
                    </div>

                    {/* Erst bei Loslassen senden */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <label className="text-[11px] block" style={hint}>Erst bei Loslassen senden</label>
                        <p className="text-[10px]" style={hint}>Slider-Wert wird erst beim Loslassen übertragen.</p>
                      </div>
                      <button
                        onClick={() => setO({ sendOnRelease: !(o.sendOnRelease !== false) })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5"
                        style={{ background: o.sendOnRelease !== false ? 'var(--accent)' : 'var(--app-border)' }}
                      >
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: o.sendOnRelease !== false ? '18px' : '2px' }} />
                      </button>
                    </div>
                  </>
                );
              })()}

              {config.type === 'mediaplayer' && (
                <MediaplayerEditPanel
                  config={config}
                  onConfigChange={onConfigChange}
                  onOpenPicker={(key) => { setMpPickerKey(key); setPickerTarget('mp_dp'); }}
                  onOpenChipPicker={(idx) => { setMpChipIdx(idx); setPickerTarget('mp_chip'); }}
                />
              )}

              {config.type === 'chips' && (
                <ChipsEditPanel
                  config={config}
                  onConfigChange={onConfigChange}
                  onOpenChipPicker={(idx) => { setChipsChipIdx(idx); setPickerTarget('chips_chip'); }}
                  onOpenCheckDpPicker={() => setPickerTarget('chips_checkDp')}
                />
              )}

              {config.type === 'slider' && (
                <SliderEditPanel
                  config={config}
                  onConfigChange={onConfigChange}
                  onOpenActionPicker={(idx) => { setSlActionIdx(idx); setPickerTarget('sl_action'); }}
                />
              )}

              {config.type === 'binarysensor' && (() => {
                const o = config.options ?? {};
                const setO = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const sInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                const sensorType = (o.sensorType as string) ?? 'generic';
                const preset = BINARY_SENSOR_PRESETS[sensorType] ?? BINARY_SENSOR_PRESETS.generic;
                return (
                  <>
                    {/* Sensor-Typ Auswahl */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Sensor-Typ</label>
                      <select value={sensorType}
                        onChange={(e) => setO({ sensorType: e.target.value })}
                        className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                        style={sInputStyle}>
                        {Object.keys(BINARY_SENSOR_PRESETS).map((k) => (
                          <option key={k} value={k}>
                            {k === 'motion'    ? 'Bewegungsmelder' :
                             k === 'smoke'     ? 'Rauchmelder' :
                             k === 'doorbell'  ? 'Türklingel' :
                             k === 'vibration' ? 'Erschütterung' :
                             k === 'flood'     ? 'Wassermelder' :
                             k === 'lowbat'    ? 'Batterie-Warnung' :
                             'Generisch'}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Labels */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Label aktiv</label>
                        <input type="text" value={(o.labelOn as string) ?? ''}
                          onChange={(e) => setO({ labelOn: e.target.value || undefined })}
                          placeholder={preset.labelOn}
                          className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
                      </div>
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Label inaktiv</label>
                        <input type="text" value={(o.labelOff as string) ?? ''}
                          onChange={(e) => setO({ labelOff: e.target.value || undefined })}
                          placeholder={preset.labelOff}
                          className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
                      </div>
                    </div>
                  </>
                );
              })()}

              {config.type === 'windowcontact' && (() => {
                const o = config.options ?? {};
                const setO = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const wcInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                const WC_DEFAULTS: Record<string, { color: string; label: string; iconName: string }> = {
                  closed: { color: '#22c55e', label: 'Geschlossen', iconName: 'CheckCircle2' },
                  tilted: { color: '#f59e0b', label: 'Gekippt',      iconName: 'TriangleAlert' },
                  open:   { color: '#ef4444', label: 'Offen',        iconName: 'XCircle' },
                };

                const renderStateSection = (st: 'closed' | 'tilted' | 'open', stateLabel: string) => {
                  const d = WC_DEFAULTS[st];
                  const currentType   = (o[`${st}Type`]   as 'icon' | 'base64') ?? 'icon';
                  const currentIcon   =  o[`${st}Icon`]   as string | undefined;
                  const currentColor  = (o[`${st}Color`]  as string) || d.color;
                  const currentLabel  = (o[`${st}Label`]  as string) ?? d.label;
                  const currentBase64 =  o[`${st}Base64`] as string | undefined;
                  const CurrentIcon   = currentIcon
                    ? getWidgetIcon(currentIcon, (() => null) as unknown as import('lucide-react').LucideIcon)
                    : null;

                  return (
                    <div key={st} className="space-y-2">
                      <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{stateLabel}</p>
                      {/* Type selector */}
                      <div className="flex gap-1">
                        {(['icon', 'base64'] as const).map(btnType => (
                          <button key={btnType} onClick={() => setO({ [`${st}Type`]: btnType })}
                            className="flex-1 text-[10px] py-1 rounded-lg transition-colors"
                            style={{
                              background: currentType === btnType ? 'var(--accent)' : 'var(--app-bg)',
                              color: currentType === btnType ? '#fff' : 'var(--text-secondary)',
                              border: `1px solid ${currentType === btnType ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}>
                            {btnType === 'icon' ? 'Icon' : 'Bild'}
                          </button>
                        ))}
                      </div>
                      {/* Icon + color */}
                      {currentType === 'icon' && (
                        <div className="flex gap-1 items-start">
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() => setWcIconPickerState(st)}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors w-full text-left"
                              style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}>
                              {CurrentIcon
                                ? <CurrentIcon size={14} style={{ flexShrink: 0, color: currentColor }} />
                                : <span style={{ width: 14, height: 14, display: 'inline-block', flexShrink: 0 }} />}
                              <span className="flex-1 truncate text-[11px]"
                                style={{ color: currentIcon ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                {currentIcon ?? `Standard (${d.iconName})`}
                              </span>
                            </button>
                            {wcIconPickerState === st && (
                              <IconPickerModal
                                current={currentIcon ?? ''}
                                onSelect={(name) => { setO({ [`${st}Icon`]: name || undefined }); setWcIconPickerState(null); }}
                                onClose={() => setWcIconPickerState(null)}
                              />
                            )}
                          </div>
                          <input type="color" value={currentColor}
                            onChange={(e) => setO({ [`${st}Color`]: e.target.value })}
                            title="Farbe"
                            className="w-8 h-9 rounded cursor-pointer shrink-0 p-0.5"
                            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }} />
                        </div>
                      )}
                      {/* Base64 image */}
                      {currentType === 'base64' && (
                        <div className="space-y-1.5">
                          <div className="flex gap-1">
                            <input type="file" accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () => setO({ [`${st}Base64`]: reader.result as string });
                                reader.readAsDataURL(file);
                              }}
                              className="flex-1 text-[11px] cursor-pointer"
                              style={{ color: 'var(--text-secondary)' }} />
                            <button
                              onClick={() => setWcImagePickerState(st)}
                              className="px-2 rounded-lg hover:opacity-80 shrink-0"
                              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                              title="Lokale Datei vom Server wählen">
                              <FolderOpen size={13} />
                            </button>
                          </div>
                          {(currentBase64 ?? '').startsWith('aura-file:') ? (
                            <p className="text-[10px] truncate" style={{ color: 'var(--accent)' }}>
                              {(currentBase64 as string).slice('aura-file:'.length).split('/').pop()}
                            </p>
                          ) : (
                            <textarea
                              rows={2}
                              value={currentBase64 ?? ''}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                setO({ [`${st}Base64`]: v || undefined });
                              }}
                              placeholder="oder data:image/… einfügen"
                              className="w-full text-[10px] rounded-lg px-2.5 py-1.5 focus:outline-none resize-none font-mono"
                              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }} />
                          )}
                          {currentBase64 && (
                            <div className="flex items-center gap-2">
                              {!currentBase64.startsWith('aura-file:') && (
                                <img src={currentBase64}
                                  style={{ width: 32, height: 32, objectFit: 'contain', border: '1px solid var(--app-border)', borderRadius: 4 }}
                                  alt="" />
                              )}
                              <button onClick={() => setO({ [`${st}Base64`]: undefined })}
                                className="text-[10px] hover:opacity-70"
                                style={{ color: 'var(--accent-red, #ef4444)' }}>
                                Entfernen
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Label */}
                      <input type="text" value={currentLabel}
                        onChange={(e) => setO({ [`${st}Label`]: e.target.value })}
                        placeholder={d.label}
                        className="w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                        style={wcInputStyle} />
                    </div>
                  );
                };

                const currentPreset = (o.statePreset as string) ?? 'hmip';

                return (
                  <>
                    {/* Preset / value mapping */}
                    <div className="space-y-2">
                      <div>
                        <label className="text-[11px] block mb-1" style={{ color: 'var(--text-secondary)' }}>Wertemapping</label>
                        <select
                          value={currentPreset}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (next !== 'custom') {
                              setO({ statePreset: next, stateValuesClosed: undefined, stateValuesTilted: undefined, stateValuesOpen: undefined });
                            } else {
                              const cur = WC_PRESETS[currentPreset] ?? WC_PRESETS.hmip;
                              setO({ statePreset: 'custom', stateValuesClosed: cur.closed, stateValuesTilted: cur.tilted, stateValuesOpen: cur.open });
                            }
                          }}
                          className="w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                          style={wcInputStyle}>
                          {Object.entries(WC_PRESET_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>{lbl}</option>
                          ))}
                        </select>
                      </div>
                      {currentPreset === 'custom' && (
                        <>
                          {(['closed', 'tilted', 'open'] as const).map(st => (
                            <div key={st}>
                              <label className="text-[11px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
                                Werte &bdquo;{WC_DEFAULTS[st].label}&ldquo; (kommagetrennt)
                              </label>
                              <input type="text"
                                value={(o[`stateValues${st.charAt(0).toUpperCase() + st.slice(1)}`] as string) ?? WC_PRESETS.hmip[st]}
                                onChange={(e) => setO({ [`stateValues${st.charAt(0).toUpperCase() + st.slice(1)}`]: e.target.value })}
                                placeholder={WC_PRESETS.hmip[st] || '–'}
                                className="w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none font-mono"
                                style={wcInputStyle} />
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                    <div className="h-px" style={{ background: 'var(--app-border)' }} />

                    {/* State appearance */}
                    {renderStateSection('closed', 'Geschlossen')}
                    <div className="h-px" style={{ background: 'var(--app-border)' }} />
                    {renderStateSection('tilted', 'Gekippt')}
                    <div className="h-px" style={{ background: 'var(--app-border)' }} />
                    {renderStateSection('open', 'Offen')}
                    <div className="h-px" style={{ background: 'var(--app-border)' }} />

                    {/* Lock DP */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Schloss (optional)</p>
                      <div>
                        <label className="text-[11px] block mb-1" style={{ color: 'var(--text-secondary)' }}>Datenpunkt</label>
                        <div className="flex gap-1">
                          <input type="text" value={(o.lockDp as string) ?? ''}
                            onChange={(e) => setO({ lockDp: e.target.value || undefined })}
                            placeholder="optional"
                            className="flex-1 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none font-mono min-w-0"
                            style={wcInputStyle} />
                          <button onClick={() => setPickerTarget('wc_lockDp')}
                            className="px-2 rounded-lg hover:opacity-80 shrink-0"
                            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                            <Database size={13} />
                          </button>
                        </div>
                      </div>
                      {(o.lockDp as string) && (
                        <div>
                          <label className="text-[11px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
                            Wert &bdquo;Abgeschlossen&ldquo; (kommagetrennt)
                          </label>
                          <input type="text"
                            value={(o.lockLockedValues as string) ?? 'true,1'}
                            onChange={(e) => setO({ lockLockedValues: e.target.value })}
                            placeholder="true,1"
                            className="w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none font-mono"
                            style={wcInputStyle} />
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}

              {config.type === 'stateimage' && (() => {
                const o = config.options ?? {};
                const setO = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const siInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

                const renderStateSection = (prefix: 'true' | 'false', stateLabel: string) => {
                  const currentType = (o[`${prefix}Type`] as 'icon' | 'base64') ?? 'icon';
                  const currentIcon = o[`${prefix}Icon`] as string | undefined;
                  const currentColor = (o[`${prefix}Color`] as string) || (prefix === 'true' ? '#22c55e' : '#6b7280');
                  const currentLabel = (o[`${prefix}Label`] as string) ?? (prefix === 'true' ? 'Offen' : 'Geschlossen');
                  const currentBase64 = o[`${prefix}Base64`] as string | undefined;
                  const CurrentIcon = currentIcon
                    ? getWidgetIcon(currentIcon, (() => null) as unknown as import('lucide-react').LucideIcon)
                    : null;
                  const isOpen = prefix === 'true' ? iconPickerTrueOpen : iconPickerFalseOpen;
                  const setOpen = prefix === 'true' ? setIconPickerTrueOpen : setIconPickerFalseOpen;

                  return (
                    <div key={prefix} className="space-y-2">
                      <p className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{stateLabel}</p>
                      {/* Type selector */}
                      <div className="flex gap-1">
                        {(['icon', 'base64'] as const).map(btnType => (
                          <button key={btnType} onClick={() => setO({ [`${prefix}Type`]: btnType })}
                            className="flex-1 text-[10px] py-1 rounded-lg transition-colors"
                            style={{
                              background: currentType === btnType ? 'var(--accent)' : 'var(--app-bg)',
                              color: currentType === btnType ? '#fff' : 'var(--text-secondary)',
                              border: `1px solid ${currentType === btnType ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}>
                            {btnType === 'icon' ? 'Icon' : 'Bild'}
                          </button>
                        ))}
                      </div>
                      {/* Icon + color */}
                      {currentType === 'icon' && (
                        <div className="flex gap-1 items-start">
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() => setOpen(true)}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors w-full text-left"
                              style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)', color: 'var(--text-primary)' }}>
                              {CurrentIcon
                                ? <CurrentIcon size={14} style={{ flexShrink: 0, color: currentColor }} />
                                : <span style={{ width: 14, height: 14, display: 'inline-block', flexShrink: 0 }} />}
                              <span className="flex-1 truncate text-[11px]"
                                style={{ color: currentIcon ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                {currentIcon ?? 'Icon wählen…'}
                              </span>
                            </button>
                            {isOpen && (
                              <IconPickerModal
                                current={currentIcon ?? ''}
                                onSelect={(name) => { setO({ [`${prefix}Icon`]: name || undefined }); setOpen(false); }}
                                onClose={() => setOpen(false)}
                              />
                            )}
                          </div>
                          <input type="color" value={currentColor}
                            onChange={(e) => setO({ [`${prefix}Color`]: e.target.value })}
                            title="Farbe"
                            className="w-8 h-9 rounded cursor-pointer shrink-0 p-0.5"
                            style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }} />
                        </div>
                      )}
                      {/* Base64 image */}
                      {currentType === 'base64' && (
                        <div className="space-y-1.5">
                          <div className="flex gap-1">
                            <input type="file" accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () => setO({ [`${prefix}Base64`]: reader.result as string });
                                reader.readAsDataURL(file);
                              }}
                              className="flex-1 text-[11px] cursor-pointer"
                              style={{ color: 'var(--text-secondary)' }} />
                            <button
                              onClick={() => setSiImagePickerState(prefix)}
                              className="px-2 rounded-lg hover:opacity-80 shrink-0"
                              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                              title="Lokale Datei vom Server wählen">
                              <FolderOpen size={13} />
                            </button>
                          </div>
                          {(currentBase64 ?? '').startsWith('aura-file:') ? (
                            <p className="text-[10px] truncate" style={{ color: 'var(--accent)' }}>
                              {(currentBase64 as string).slice('aura-file:'.length).split('/').pop()}
                            </p>
                          ) : (
                            <textarea
                              rows={2}
                              value={currentBase64 ?? ''}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                setO({ [`${prefix}Base64`]: v || undefined });
                              }}
                              placeholder="oder data:image/… einfügen"
                              className="w-full text-[10px] rounded-lg px-2.5 py-1.5 focus:outline-none resize-none font-mono"
                              style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }} />
                          )}
                          {currentBase64 && (
                            <div className="flex items-center gap-2">
                              {!currentBase64.startsWith('aura-file:') && (
                                <img src={currentBase64}
                                  style={{ width: 32, height: 32, objectFit: 'contain', border: '1px solid var(--app-border)', borderRadius: 4 }}
                                  alt="" />
                              )}
                              <button onClick={() => setO({ [`${prefix}Base64`]: undefined })}
                                className="text-[10px] hover:opacity-70"
                                style={{ color: 'var(--accent-red, #ef4444)' }}>
                                Entfernen
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Label */}
                      <input type="text" value={currentLabel}
                        onChange={(e) => setO({ [`${prefix}Label`]: e.target.value })}
                        placeholder={prefix === 'true' ? 'Offen' : 'Geschlossen'}
                        className="w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                        style={siInputStyle} />
                    </div>
                  );
                };

                const siIconOn = o.showIcon !== false;
                const siDisplayIconSize = draftIconSize ?? ((o.iconSize as number) || 20);

                return (
                  <>
                    {renderStateSection('true', 'Wahr (true)')}
                    <div className="h-px" style={{ background: 'var(--app-border)' }} />
                    {renderStateSection('false', 'Falsch (false)')}
                    <div className="h-px" style={{ background: 'var(--app-border)' }} />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>Icon anzeigen</span>
                      <button onClick={() => setO({ showIcon: !siIconOn })}
                        className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                        style={{ background: siIconOn ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                          style={{ left: siIconOn ? '14px' : '2px' }} />
                      </button>
                    </div>
                    {siIconOn && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Icon-Größe</label>
                          <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-primary)' }}>{siDisplayIconSize} px</span>
                        </div>
                        <input type="range" min={12} max={256} step={4} value={siDisplayIconSize}
                          onChange={(e) => setDraftIconSize(Number(e.target.value))}
                          onPointerUp={(e) => {
                            onConfigChange({ ...config, options: { ...o, iconSize: Number((e.target as HTMLInputElement).value) } });
                            setDraftIconSize(null);
                          }}
                          className="w-full h-1"
                          style={{ accentColor: 'var(--accent)' }} />
                      </div>
                    )}
                  </>
                );
              })()}

              {config.type === 'thermostat' && (() => {
                const o = config.options ?? {};
                const setO = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const tInputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
                const tInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                const autoFillThermostat = async () => {
                  if (!config.datapoint) return;
                  const parts = config.datapoint.split('.');
                  const parent = parts.slice(0, -1).join('.');
                  const entries = await ensureDatapointCache();
                  const sibs = entries.filter((e) => e.id.startsWith(parent + '.'));
                  const find = (...names: string[]) => names.map((n) => sibs.find((e) => e.id === `${parent}.${n}`)?.id).find(Boolean);
                  const patch: Record<string, unknown> = {};
                  { const v = find('ACTUAL_TEMPERATURE', 'ACTUAL_TEMP', 'ACTUAL', 'actual', 'local_temperature', 'localTemperature', 'temperatureC', 'temperature_c', 'TEMPERATURE', 'temperature', 'TEMP', 'temp', 'MEASURED_TEMPERATURE');
                    if (v) patch.actualDatapoint = v; }
                  if (Object.keys(patch).length) setO(patch);
                };
                return (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Ist-Temperatur Datenpunkt</label>
                        <button onClick={() => void autoFillThermostat()}
                          className="text-[10px] px-2.5 py-1 rounded-lg transition-colors hover:opacity-80 disabled:opacity-40"
                          style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', border: '1px solid var(--accent)44' }}>
                          ✨ Auto-Erkennen
                        </button>
                      </div>
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
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Dezimalstellen</label>
                      <div className="flex gap-1">
                        <input type="number" min={0} max={4}
                          disabled={o.decimals === undefined}
                          value={(o.decimals as number) ?? defaultDecimals}
                          onChange={(e) => setO({ decimals: Number(e.target.value) })}
                          className={tInputCls}
                          style={{ ...tInputStyle, opacity: o.decimals === undefined ? 0.5 : 1 }} />
                        <button
                          onClick={() => setO({ decimals: o.decimals === undefined ? defaultDecimals : undefined })}
                          title={o.decimals === undefined ? 'Globale Einstellung aktiv – klicken für eigenen Wert' : 'Auf globale Einstellung zurücksetzen'}
                          className="px-1.5 rounded text-[10px] font-bold shrink-0"
                          style={{ background: o.decimals === undefined ? 'var(--accent)' : 'var(--app-border)', color: o.decimals === undefined ? '#fff' : 'var(--text-secondary)' }}>
                          Global
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* ── HTTP-Aktion Widget ─────────────────────────────────────── */}
              {config.type === 'httpRequest' && (() => {
                const o = config.options ?? {};
                const setO = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const method = (o.method as string) || 'GET';
                return (
                  <>
                    {/* Method */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Methode</label>
                      <div className="flex gap-1">
                        {(['GET', 'POST'] as const).map((m) => (
                          <button key={m} onClick={() => setO({ method: m })}
                            className="flex-1 text-[11px] py-1 rounded-lg transition-colors"
                            style={{
                              background: method === m ? 'var(--accent)' : 'var(--app-bg)',
                              color:      method === m ? '#fff' : 'var(--text-secondary)',
                              border:     `1px solid ${method === m ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* URL */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>URL</label>
                      <input type="text" value={(o.url as string) || ''}
                        onChange={(e) => setO({ url: e.target.value })}
                        className={inputCls}
                        style={inputStyle}
                        placeholder="http://192.168.1.x/api/…" />
                    </div>

                    {/* POST body */}
                    {method === 'POST' && (
                      <>
                        <div>
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Content-Type</label>
                          <input type="text" value={(o.contentType as string) || 'application/json'}
                            onChange={(e) => setO({ contentType: e.target.value })}
                            className={inputCls}
                            style={inputStyle}
                            placeholder="application/json" />
                        </div>
                        <div>
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Body (optional)</label>
                          <textarea rows={3} value={(o.body as string) || ''}
                            onChange={(e) => setO({ body: e.target.value })}
                            className={inputCls}
                            style={inputStyle}
                            placeholder={'{"key": "value"}'} />
                        </div>
                      </>
                    )}

                    {/* Response → DP */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Antwort-Datenpunkt (optional)</label>
                      <div className="flex gap-1">
                        <input type="text" value={(o.responseDatapoint as string) || ''}
                          onChange={(e) => setO({ responseDatapoint: e.target.value })}
                          className={`${inputCls} flex-1`}
                          style={inputStyle}
                          placeholder="0_userdata.0.http.response" />
                        <button onClick={() => setPickerTarget('http_response_dp')}
                          className="px-2 rounded-lg text-xs hover:opacity-80 shrink-0"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                          <Database size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Button label */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Button-Beschriftung (leer = Widget-Titel)</label>
                      <input type="text" value={(o.buttonLabel as string) || ''}
                        onChange={(e) => setO({ buttonLabel: e.target.value })}
                        className={inputCls}
                        style={inputStyle}
                        placeholder={config.title || 'Senden'} />
                    </div>

                    {/* Button color */}
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] flex-1" style={{ color: 'var(--text-secondary)' }}>Button-Farbe</label>
                      <input type="color"
                        value={(o.buttonColor as string) || '#0ea5e9'}
                        onChange={(e) => setO({ buttonColor: e.target.value })}
                        className="w-8 h-7 rounded cursor-pointer p-0.5"
                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }} />
                    </div>

                    {/* Show status */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Letzten Status anzeigen</span>
                      <button onClick={() => setO({ showStatus: !(o.showStatus ?? true) })}
                        className="relative w-8 h-4 rounded-full transition-colors"
                        style={{ background: (o.showStatus ?? true) ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.showStatus ?? true) ? '18px' : '2px' }} />
                      </button>
                    </div>

                    {/* Confirm action */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Bestätigung anfordern</span>
                      <button onClick={() => setO({ confirmAction: !o.confirmAction })}
                        className="relative w-8 h-4 rounded-full transition-colors"
                        style={{ background: o.confirmAction ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                          style={{ left: o.confirmAction ? '18px' : '2px' }} />
                      </button>
                    </div>
                    {o.confirmAction && (
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Bestätigungs-Text (optional)</label>
                        <input type="text" value={(o.confirmText as string) || ''}
                          onChange={(e) => setO({ confirmText: e.target.value })}
                          className={inputCls}
                          style={inputStyle}
                          placeholder="Wirklich senden?" />
                      </div>
                    )}
                  </>
                );
              })()}

              {config.type === 'button' && (() => {
                const o = config.options ?? {};
                const setO = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                return (
                  <>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Button-Beschriftung (leer = Widget-Titel)</label>
                      <input type="text" value={(o.buttonLabel as string) || ''}
                        onChange={(e) => setO({ buttonLabel: e.target.value })}
                        className={inputCls} style={inputStyle}
                        placeholder={config.title || 'Button'} />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] flex-1" style={{ color: 'var(--text-secondary)' }}>Farbe</label>
                      <input type="color"
                        value={(o.buttonColor as string) || '#6366f1'}
                        onChange={(e) => setO({ buttonColor: e.target.value })}
                        className="w-8 h-7 rounded cursor-pointer p-0.5"
                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }} />
                    </div>
                  </>
                );
              })()}

              {/* ── Status-Datenpunkte (gemeinsam für alle Sensor-/Aktor-Typen) ── */}
              {['switch', 'dimmer', 'thermostat', 'shutter', 'windowcontact', 'binarysensor', 'stateimage'].includes(config.type) && (() => {
                const o = config.options ?? {};
                const setO = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const stInputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono';
                const stInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                const showBadges = (o.showStatusBadges as boolean) !== false;
                const alertOnly  = (o.statusBadgesAlertOnly as boolean) === true;
                const autoFillStatus = async () => {
                  if (!config.datapoint) return;
                  const parts = config.datapoint.split('.');
                  const parent = parts.slice(0, -1).join('.');
                  const parentUp = parts.slice(0, -2).join('.');
                  const entries = await ensureDatapointCache();
                  const sibs   = entries.filter((e) => e.id.startsWith(parent + '.'));
                  const sibsUp = entries.filter((e) => e.id.startsWith(parentUp + '.'));
                  const find   = (...names: string[]) => names.map((n) => sibs.find((e) => e.id === `${parent}.${n}`)?.id).find(Boolean);
                  const findUp = (...names: string[]) => names.map((n) =>
                    sibsUp.find((e) => e.id === `${parentUp}.0.${n}` || e.id === `${parentUp}.${n}`)?.id
                  ).find(Boolean);
                  const patch: Record<string, unknown> = {};
                  { const v = find('LOWBAT', 'LOW_BAT', 'lowBat', 'low_bat', 'battery_low', 'batteryLow')
                           ?? findUp('LOWBAT', 'LOW_BAT');
                    if (v) patch.batteryDp = v; }
                  { const v = find('UNREACH', 'unreach', 'UNREACHABLE', 'unreachable', 'offline')
                           ?? findUp('UNREACH', 'UNREACHABLE');
                    if (v) patch.unreachDp = v; }
                  if (Object.keys(patch).length) setO(patch);
                };
                return (
                  <div style={{ borderTop: '1px solid var(--app-border)', marginTop: 4, paddingTop: 8 }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                        Status-Datenpunkte
                      </p>
                      <div className="flex items-center gap-2">
                        <button onClick={() => void autoFillStatus()}
                          className="text-[10px] px-2.5 py-1 rounded-lg transition-colors hover:opacity-80 disabled:opacity-40"
                          style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', border: '1px solid var(--accent)44' }}>
                          ✨ Auto-Erkennen
                        </button>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Anzeigen</span>
                          <button
                            onClick={() => setO({ showStatusBadges: !showBadges })}
                            className="relative w-8 h-4 rounded-full transition-colors"
                            style={{ background: showBadges ? 'var(--accent)' : 'var(--app-border)' }}>
                            <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                              style={{ left: showBadges ? '17px' : '2px' }} />
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Nur bei Alarm</span>
                          <button
                            onClick={() => setO({ statusBadgesAlertOnly: !alertOnly })}
                            className="relative w-8 h-4 rounded-full transition-colors"
                            style={{ background: alertOnly ? 'var(--accent)' : 'var(--app-border)' }}>
                            <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                              style={{ left: alertOnly ? '17px' : '2px' }} />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {/* Battery DP */}
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Batterie-DP (z.B. LOWBAT)</label>
                        <div className="flex gap-1">
                          <input type="text" value={(o.batteryDp as string) ?? ''}
                            onChange={(e) => setO({ batteryDp: e.target.value || undefined })}
                            placeholder="optional"
                            className={`flex-1 ${stInputCls} min-w-0`} style={stInputStyle} />
                          <button onClick={() => setPickerTarget('status_batteryDp')}
                            className="px-2 rounded-lg hover:opacity-80 shrink-0"
                            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                            <Database size={13} />
                          </button>
                        </div>
                      </div>
                      {/* Battery config (shown only when batteryDp is set) */}
                      {(o.batteryDp as string) && (() => {
                        const battMode = (o.batteryMode as 'boolean' | 'percent') ?? 'boolean';
                        return (
                          <div className="space-y-1.5 pl-2" style={{ borderLeft: '2px solid var(--app-border)' }}>
                            <div className="flex gap-1">
                              {(['boolean', 'percent'] as const).map(mode => (
                                <button key={mode} onClick={() => setO({ batteryMode: mode })}
                                  className="flex-1 text-[10px] py-1 rounded-lg transition-colors"
                                  style={{
                                    background: battMode === mode ? 'var(--accent)' : 'var(--app-bg)',
                                    color: battMode === mode ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${battMode === mode ? 'var(--accent)' : 'var(--app-border)'}`,
                                  }}>
                                  {mode === 'boolean' ? 'Boolean' : 'Prozent (%)'}
                                </button>
                              ))}
                            </div>
                            {battMode === 'boolean' && (
                              <div className="flex items-center justify-between">
                                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Invertiert (true=OK)</label>
                                <button
                                  onClick={() => setO({ batteryInvert: !o.batteryInvert })}
                                  className="relative w-8 h-4 rounded-full transition-colors"
                                  style={{ background: o.batteryInvert ? 'var(--accent)' : 'var(--app-border)' }}>
                                  <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                                    style={{ left: o.batteryInvert ? '17px' : '2px' }} />
                                </button>
                              </div>
                            )}
                            {battMode === 'percent' && (
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Schwellwert &bdquo;Niedrig&ldquo;</label>
                                  <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-primary)' }}>
                                    {(o.batteryLowThreshold as number) ?? 20}%
                                  </span>
                                </div>
                                <input type="range" min={1} max={50} step={1}
                                  value={(o.batteryLowThreshold as number) ?? 20}
                                  onChange={(e) => setO({ batteryLowThreshold: Number(e.target.value) })}
                                  className="w-full h-1"
                                  style={{ accentColor: 'var(--accent)' }} />
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {/* Reach DP */}
                      <div>
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Erreichbarkeits-DP (z.B. UNREACH)</label>
                        <div className="flex gap-1">
                          <input type="text" value={(o.unreachDp as string) ?? ''}
                            onChange={(e) => setO({ unreachDp: e.target.value || undefined })}
                            placeholder="optional"
                            className={`flex-1 ${stInputCls} min-w-0`} style={stInputStyle} />
                          <button onClick={() => setPickerTarget('status_unreachDp')}
                            className="px-2 rounded-lg hover:opacity-80 shrink-0"
                            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                            <Database size={13} />
                          </button>
                        </div>
                      </div>
                      {/* Reach config (shown only when unreachDp is set) */}
                      {(o.unreachDp as string) && (() => {
                        const reachMode = (o.reachMode as 'unreachable' | 'available') ?? 'unreachable';
                        return (
                          <div className="space-y-1.5 pl-2" style={{ borderLeft: '2px solid var(--app-border)' }}>
                            <div className="flex gap-1">
                              {(['unreachable', 'available'] as const).map(mode => (
                                <button key={mode} onClick={() => setO({ reachMode: mode })}
                                  className="flex-1 text-[10px] py-1 rounded-lg transition-colors"
                                  style={{
                                    background: reachMode === mode ? 'var(--accent)' : 'var(--app-bg)',
                                    color: reachMode === mode ? '#fff' : 'var(--text-secondary)',
                                    border: `1px solid ${reachMode === mode ? 'var(--accent)' : 'var(--app-border)'}`,
                                  }}>
                                  {mode === 'unreachable' ? 'Unreachable-DP' : 'Available-DP'}
                                </button>
                              ))}
                            </div>
                            <div>
                              <label className="text-[11px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
                                Werte für &bdquo;{reachMode === 'unreachable' ? 'nicht erreichbar' : 'erreichbar'}&ldquo; (kommagetrennt)
                              </label>
                              <input type="text"
                                value={(o.reachTrueValues as string) ?? 'true,1'}
                                onChange={(e) => setO({ reachTrueValues: e.target.value })}
                                placeholder="true,1"
                                className={`w-full ${stInputCls} font-mono`} style={stInputStyle} />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}

              {/* ── Custom-Grid editor (all widgets except excluded) ── */}
              {!['iframe', 'jsontable', 'html', 'trash', 'trashSchedule', 'header', 'fill', 'camera', 'datepicker'].includes(config.type) && ((config.layout ?? 'default') === 'custom' || config.type === 'universal') && (() => {
                const isUniversal = config.type === 'universal';
                const o   = config.options ?? {};
                const fallbackGrid = isUniversal ? DEFAULT_UNIVERSAL_GRID : config.type === 'knob' ? DEFAULT_KNOB_GRID : DEFAULT_CUSTOM_GRID;
                const grid = normalizeGrid(o.customGrid, fallbackGrid);
                const { cols, rows, cells } = grid;
                const writeGrid = (next: CustomGridDef) =>
                  onConfigChange({ ...config, options: { ...o, customGrid: next } });
                const setCell = (idx: number, patch: Partial<CustomCell>) => {
                  writeGrid({ ...grid, cells: cells.map((c, i) => i === idx ? { ...c, ...patch } : c) });
                };
                const setDims = (nextCols: number, nextRows: number) => {
                  const c = Math.max(1, Math.min(20, nextCols));
                  const r = Math.max(1, Math.min(20, nextRows));
                  const need = c * r;
                  const nextCells: CustomCell[] = [];
                  for (let row = 0; row < r; row++) {
                    for (let col = 0; col < c; col++) {
                      const oldIdx = row < rows && col < cols ? row * cols + col : -1;
                      nextCells.push(oldIdx >= 0 && cells[oldIdx] ? cells[oldIdx] : { type: 'empty' });
                    }
                  }
                  const resize = (arr: string[] | undefined, newLen: number): string[] | undefined => {
                    if (!arr) return undefined;
                    const out = arr.slice(0, newLen);
                    while (out.length < newLen) out.push('1fr');
                    return out;
                  };
                  writeGrid({
                    cols: c, rows: r, cells: nextCells,
                    colSizes: resize(grid.colSizes, c),
                    rowSizes: resize(grid.rowSizes, r),
                  });
                  if (selectedCustomCell !== null && selectedCustomCell >= need) setSelectedCustomCell(null);
                };
                const sel = selectedCustomCell;
                const selCell = sel !== null ? cells[sel] : null;
                const inputCls = 'w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none';
                const inputSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                return (
                  <div style={{ borderTop: '1px solid var(--app-border)', paddingTop: 10, marginTop: 4 }}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
                      Widget-Einstellungen
                    </p>
                    <div className="space-y-2 rounded-lg p-2.5" style={{ border: '1px solid var(--app-border)', background: 'var(--app-bg)' }}>
                    <p className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Raster-Konfiguration ({cols}×{rows})
                    </p>

                    {/* Dynamic size controls (Spalten × Zeilen) */}
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Spalten</label>
                        <input
                          type="number" min={1} max={20} step={1}
                          value={cols}
                          onChange={(e) => setDims(Number(e.target.value) || 1, rows)}
                          className={inputCls} style={inputSty}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Zeilen</label>
                        <input
                          type="number" min={1} max={20} step={1}
                          value={rows}
                          onChange={(e) => setDims(cols, Number(e.target.value) || 1)}
                          className={inputCls} style={inputSty}
                        />
                      </div>
                    </div>

                    {/* Cell picker — dynamic grid (drag&drop move, Ctrl+drag copy, right-click menu) */}
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4 }}>
                      {cells.map((cell, i) => {
                        const active = sel === i;
                        const row = Math.floor(i / cols) + 1;
                        const col = (i % cols) + 1;
                        const isDragging = customCellDragIdx === i;
                        const isDragOver  = customCellDragOver === i && customCellDragIdx !== null && customCellDragIdx !== i;
                        const canDrag = cell.type !== 'empty';
                        const borderColor = isDragOver ? 'var(--accent)' : active ? 'var(--accent)' : 'var(--app-border)';
                        const performDropMove = (from: number, to: number) => {
                          const src = cells[from];
                          if (!src) return;
                          const nextCells = cells.map((c, idx) => {
                            if (idx === to)   return src;
                            if (idx === from) return { type: 'empty' as const };
                            return c;
                          });
                          writeGrid({ ...grid, cells: nextCells });
                          if (selectedCustomCell === from) setSelectedCustomCell(to);
                          else if (selectedCustomCell === to) setSelectedCustomCell(null);
                        };
                        const performDropCopy = (from: number, to: number) => {
                          const src = cells[from];
                          if (!src) return;
                          const nextCells = cells.map((c, idx) => (idx === to ? { ...src } : c));
                          writeGrid({ ...grid, cells: nextCells });
                        };
                        return (
                          <button
                            key={i}
                            draggable={canDrag}
                            onDragStart={(e) => {
                              if (!canDrag) { e.preventDefault(); return; }
                              setCustomCellDragIdx(i);
                              e.dataTransfer.effectAllowed = 'copyMove';
                              try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* noop */ }
                            }}
                            onDragOver={(e) => {
                              if (customCellDragIdx === null || customCellDragIdx === i) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = (e.ctrlKey || e.metaKey) ? 'copy' : 'move';
                              if (customCellDragOver !== i) setCustomCellDragOver(i);
                            }}
                            onDragLeave={() => { if (customCellDragOver === i) setCustomCellDragOver(null); }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const from = customCellDragIdx;
                              setCustomCellDragIdx(null);
                              setCustomCellDragOver(null);
                              if (from === null || from === i) return;
                              const mode: 'move' | 'copy' = (e.ctrlKey || e.metaKey) ? 'copy' : 'move';
                              const targetCell = cells[i];
                              if (targetCell && targetCell.type !== 'empty') {
                                setCustomCellOverwrite({ kind: 'drop', from, to: i, mode });
                                return;
                              }
                              if (mode === 'copy') performDropCopy(from, i);
                              else                 performDropMove(from, i);
                            }}
                            onDragEnd={() => { setCustomCellDragIdx(null); setCustomCellDragOver(null); }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setSelectedCustomCell(i);
                              setCustomCellContextMenu({ idx: i, x: e.clientX, y: e.clientY });
                            }}
                            onClick={() => setSelectedCustomCell(active ? null : i)}
                            className="rounded text-[10px] transition-colors"
                            style={{
                              background: active ? 'var(--accent)' : 'var(--widget-bg)',
                              color:      active ? '#fff' : 'var(--text-secondary)',
                              border:     `${isDragOver ? 2 : 1}px solid ${borderColor}`,
                              minHeight: 36,
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                              opacity: isDragging ? 0.4 : 1,
                              cursor: canDrag ? 'grab' : 'pointer',
                            }}
                          >
                            <span>{CELL_LABELS[cell.type] ?? cell.type}</span>
                            <span style={{ fontSize: 9, opacity: 0.6 }}>{row}/{col}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Per-cell editor */}
                    <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--app-border)', minHeight: 48 }}>
                      {sel !== null && selCell ? (
                        <CustomCellEditor
                          cell={selCell}
                          index={sel}
                          cols={cols}
                          rows={rows}
                          widgetType={config.type}
                          isUniversal={isUniversal}
                          defaultDecimals={defaultDecimals}
                          onChange={(patch) => setCell(sel, patch)}
                          onOpenIconPicker={setCustomCellIconPicker}
                          onOpenDpPicker={() => setCustomCellPickerOpen(true)}
                          onOpenImagePicker={() => setCustomCellImagePickerOpen(true)}
                        />
                      ) : (
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.45 }}>
                          Zelle auswählen, um sie zu konfigurieren …
                        </p>
                      )}
                    </div>

                    {/* Reset grid */}
                    <button
                      onClick={() => {
                        const nextGrid: CustomGridDef | undefined = config.type === 'weather'
                          ? buildWeatherCustomGrid(o)
                          : undefined;
                        onConfigChange({ ...config, options: { ...o, customGrid: nextGrid } });
                        setSelectedCustomCell(null);
                      }}
                      className="text-[10px] px-2 py-1 rounded"
                      style={{ background: 'var(--widget-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                    >
                      Raster zurücksetzen
                    </button>
                    </div>
                  </div>
                );
              })()}

              {/* ── Datumswähler ── */}
              {config.type === 'datepicker' && (() => {
                const o = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const fmt = (o.outputFormat as DateOutputFormat) ?? 'timestamp_ms';
                const inputCls2 = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
                const inputSty2 = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                return (
                  <>
                    {/* Nur Uhrzeit */}
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Nur Uhrzeit (kein Datum)</label>
                      <button
                        onClick={() => set({ timeOnly: !o.timeOnly, showTime: !o.timeOnly ? true : o.showTime })}
                        className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                        style={{ background: o.timeOnly ? 'var(--accent)' : 'var(--app-border)' }}
                      >
                        <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                          style={{ left: o.timeOnly ? '14px' : '2px' }} />
                      </button>
                    </div>
                    {/* Uhrzeit anzeigen — nur wenn nicht timeOnly */}
                    {!o.timeOnly && <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Uhrzeit-Eingabe anzeigen</label>
                      <button
                        onClick={() => set({ showTime: !o.showTime })}
                        className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                        style={{ background: o.showTime ? 'var(--accent)' : 'var(--app-border)' }}
                      >
                        <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform"
                          style={{ left: o.showTime ? '14px' : '2px' }} />
                      </button>
                    </div>}
                    {/* Ausgabeformat */}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Ausgabeformat</label>
                      <select value={fmt} onChange={(e) => set({ outputFormat: e.target.value })}
                        className={inputCls2} style={inputSty2}>
                        {(Object.entries(FORMAT_LABELS) as [DateOutputFormat, string][]).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </>
                );
              })()}

              {/* ── Farbschwellen ── */}
              {(config.type === 'value' || config.type === 'dimmer' || config.type === 'shutter' || config.type === 'thermostat' || config.type === 'list' || config.type === 'autolist') && (() => {
                type CT = [number, string];
                const thresholds = (config.options?.colorThresholds as CT[]) ?? [];
                const setThresholds = (next: CT[]) =>
                  onConfigChange({ ...config, options: { ...config.options, colorThresholds: next.length ? next : undefined } });
                const toHex = (c: string) => { const m = c.match(/#[0-9a-fA-F]{6}/); return m ? m[0] : '#22c55e'; };
                return (
                  <div style={{ borderTop: '1px solid var(--app-border)', marginTop: 4, paddingTop: 8 }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Farbschwellen</label>
                      <button
                        onClick={() => setThresholds([...thresholds, [100, '#22c55e']])}
                        className="text-[10px] px-2 py-0.5 rounded hover:opacity-80"
                        style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
                      >
                        + Hinzufügen
                      </button>
                    </div>
                    {thresholds.length > 0 && (
                      <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-secondary)', opacity: 0.65 }}>
                        Wert &lt; Schwelle → Farbe · aufsteigend sortieren
                      </p>
                    )}
                    <div className="space-y-1">
                      {thresholds.map(([thresh, color], i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <button
                            onClick={() => setThresholds(thresholds.filter((_, j) => j !== i))}
                            className="text-[11px] w-5 h-5 flex items-center justify-center rounded shrink-0"
                            style={{ color: 'var(--text-secondary)', background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                          >×</button>
                          <input
                            type="color"
                            value={toHex(color)}
                            onChange={(e) => { const n = [...thresholds]; n[i] = [thresh, e.target.value]; setThresholds(n); }}
                            className="w-8 h-7 rounded cursor-pointer shrink-0"
                            style={{ border: '1px solid var(--app-border)', padding: '1px' }}
                          />
                          <span className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>Wert &lt;</span>
                          <input
                            type="number"
                            value={thresh}
                            onChange={(e) => { const n = [...thresholds]; n[i] = [Number(e.target.value), color]; setThresholds(n); }}
                            className="flex-1 text-xs rounded-lg px-2 py-1 focus:outline-none"
                            style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                          />
                        </div>
                      ))}
                    </div>
                    {thresholds.length === 0 && (
                      <p className="text-[10px] italic" style={{ color: 'var(--text-secondary)', opacity: 0.45 }}>Keine Farbschwellen konfiguriert</p>
                    )}
                  </div>
                );
              })()}
          </div>

        </CenteredModal>
      )}

      {/* Datapoint Picker Modal */}
      {pickerTarget && (
        <DatapointPicker
          allowedTypes={pickerTarget === 'datapoint' && config.type === 'stateimage' ? ['boolean'] : undefined}
          currentValue={
            pickerTarget === 'datapoint'           ? config.datapoint :
            pickerTarget === 'localTempDatapoint'  ? ((config.options?.localTempDatapoint as string) ?? '') :
            pickerTarget === 'shutter_activityDp'  ? ((config.options?.activityDp as string) ?? '') :
            pickerTarget === 'shutter_directionDp' ? ((config.options?.directionDp as string) ?? '') :
            pickerTarget === 'shutter_stopDp'      ? ((config.options?.stopDp as string) ?? '') :
            pickerTarget === 'shutter_openDp'      ? ((config.options?.openDp as string) ?? '') :
            pickerTarget === 'shutter_closeDp'     ? ((config.options?.closeDp as string) ?? '') :
            pickerTarget === 'dimmer_switchDp'     ? ((config.options?.switchDp as string) ?? '') :
            pickerTarget === 'light_switchDp'      ? ((config.options?.switchDp      as string) ?? '') :
            pickerTarget === 'light_brightnessDp'  ? ((config.options?.brightnessDp  as string) ?? '') :
            pickerTarget === 'light_hueDp'         ? ((config.options?.hueDp         as string) ?? '') :
            pickerTarget === 'light_saturationDp'  ? ((config.options?.saturationDp  as string) ?? '') :
            pickerTarget === 'light_rDp'           ? ((config.options?.rDp           as string) ?? '') :
            pickerTarget === 'light_gDp'           ? ((config.options?.gDp           as string) ?? '') :
            pickerTarget === 'light_bDp'           ? ((config.options?.bDp           as string) ?? '') :
            pickerTarget === 'light_colorDp'       ? ((config.options?.colorDp       as string) ?? '') :
            pickerTarget === 'light_temperatureDp' ? ((config.options?.temperatureDp as string) ?? '') :
            pickerTarget === 'light_effectDp'      ? ((config.options?.effectDp      as string) ?? '') :
            pickerTarget === 'gauge_pointer2Dp'         ? ((config.options?.pointer2Datapoint as string) ?? '') :
            pickerTarget === 'gauge_pointer3Dp'         ? ((config.options?.pointer3Datapoint as string) ?? '') :
            pickerTarget === 'windowcontact_batteryDp'  ? ((config.options?.batteryDp  as string) ?? '') :
            pickerTarget === 'wc_lockDp'                ? ((config.options?.lockDp      as string) ?? '') :
            pickerTarget === 'status_batteryDp'         ? ((config.options?.batteryDp  as string) ?? '') :
            pickerTarget === 'status_unreachDp'         ? ((config.options?.unreachDp  as string) ?? '') :
            pickerTarget === 'camera_wakeUpDp'          ? ((config.options?.wakeUpDp   as string) ?? '') :
            pickerTarget === 'html_dp'                  ? ((config.options?.htmlDatapoint as string) ?? '') :
            pickerTarget === 'mp_dp'   ? ((config.options?.[mpPickerKey] as string) ?? '') :
            pickerTarget === 'mp_chip' ? (() => { const chips = (config.options?.chips as Array<{ dp: string }>) ?? []; return chips[mpChipIdx]?.dp ?? ''; })() :
            pickerTarget === 'chips_chip' ? (() => { const chips = (config.options?.chips as Array<{ dp: string }>) ?? []; return chips[chipsChipIdx]?.dp ?? ''; })() :
            pickerTarget === 'chips_checkDp' ? ((config.options?.checkDp as string) ?? '') :
            pickerTarget === 'http_response_dp' ? ((config.options?.responseDatapoint as string) ?? '') :
            pickerTarget === 'iframe_urlDp'     ? ((config.options?.iframeUrlDp as string) ?? '') :
            pickerTarget === 'sl_action' ? (() => { const acts = (config.options?.actions as Array<{ dp: string }>) ?? []; return acts[slActionIdx]?.dp ?? ''; })() :
            pickerTarget === 'camera_slot' ? (() => {
              const key = (config.layout ?? 'minimal') === 'default' ? 'infoItems' : 'customSlots';
              const arr = (config.options?.[key] as CameraSlot[]) ?? [];
              return arr[cameraSlotPickerIdx]?.datapoint ?? '';
            })() :
            ((config.options?.actualDatapoint as string) ?? '')
          }
          onSelect={(id, unit, name, role, dpType) => {
            if (pickerTarget === 'datapoint') {
              const detected = (role || dpType) ? detectType({ id, name: name ?? id, role, type: dpType, unit, rooms: [], funcs: [], logging: [] }) : null;
              // Auto-detection should only run for brand-new widgets (no DP yet).
              // Once a DP exists, changing it must never switch the widget type
              // (would otherwise silently turn a Switch into a Value, etc.).
              const hasExistingDp = !!(config.datapoint && config.datapoint.trim());
              // 'light' is its own special case: never auto-downgrade to dimmer/value
              // when the user picks e.g. hue.0…level on an explicitly-chosen light widget.
              const canAutoSwitch = !hasExistingDp && config.type !== 'light';

              const applyDp = (allowTypeChange: boolean) => {
                const typePatch: { type?: WidgetType } = (allowTypeChange && detected) ? { type: detected.type } : {};
                const effectiveType = (typePatch.type ?? config.type) as WidgetType;
                const supportsUnit = ['value', 'chart', 'gauge', 'fill'].includes(effectiveType);
                const unitAlreadySet = !!(config.options?.unit as string | undefined);
                const resolvedUnit = unit || detected?.unit;
                const unitPatch = supportsUnit && !unitAlreadySet && resolvedUnit ? { unit: resolvedUnit } : {};
                const titlePatch = !config.title?.trim() && name ? { title: name } : {};
                const updatedConfig = { ...config, ...typePatch, ...titlePatch, datapoint: id, options: { ...config.options, ...unitPatch } };
                onConfigChange(updatedConfig);
                // Auto-fill secondary DPs (actualDatapoint, batteryDp, unreachDp …)
                const activeTemplate = DP_TEMPLATES.find((tpl) => tpl.widgetType === effectiveType && tpl.secondaryDps.length > 0);
                void ensureDatapointCache().then((entries) => {
                  if (effectiveType === 'light') {
                    // Light: cross-channel + color-mode detection (HmIP & Hue style)
                    const detected = autoDetectLightDps(id, entries);
                    const opts: Record<string, unknown> = {};
                    for (const [k, v] of Object.entries(detected)) {
                      if (v !== undefined && v !== '') opts[k] = v;
                    }
                    if (Object.keys(opts).length > 0)
                      onConfigChange({ ...updatedConfig, options: { ...updatedConfig.options, ...opts } });
                    return;
                  }
                  if (activeTemplate) {
                    // Normal path: selected DP is primary → discover secondary siblings
                    const parts = id.split('.');
                    const parent = parts.slice(0, -1).join('.');
                    const parentUp = parts.slice(0, -2).join('.');
                    const sibs   = entries.filter((e) => e.id.startsWith(parent + '.'));
                    const sibsUp = entries.filter((e) => e.id.startsWith(parentUp + '.'));
                    const secondaryDpOptions: Record<string, unknown> = {};
                    for (const sdp of activeTemplate.secondaryDps) {
                      const found = sdp.siblingNames.map((n) => sibs.find((e) => e.id === `${parent}.${n}`)?.id).find(Boolean)
                        ?? sdp.siblingNames.map((n) => sibsUp.find((e) => e.id === `${parentUp}.0.${n}`)?.id).find(Boolean);
                      if (found) secondaryDpOptions[sdp.optionKey] = found;
                    }
                    // Generic fallback for any battery/unreach not found via template
                    const statusDps = autoDetectStatusDps(id, entries);
                    if (statusDps.batteryDp  && !secondaryDpOptions.batteryDp)  secondaryDpOptions.batteryDp  = statusDps.batteryDp;
                    if (statusDps.unreachDp  && !secondaryDpOptions.unreachDp)  secondaryDpOptions.unreachDp  = statusDps.unreachDp;
                    if (Object.keys(secondaryDpOptions).length > 0)
                      onConfigChange({ ...updatedConfig, options: { ...updatedConfig.options, ...secondaryDpOptions } });
                  } else {
                    // Reverse path: selected DP might be secondary (e.g. ACTUAL_TEMPERATURE)
                    // → find primary sibling (e.g. SET_TEMPERATURE) and upgrade widget type.
                    // Reverse-upgrade also counts as a type change → gated by allowTypeChange.
                    const upgrade = allowTypeChange ? findMainDpForSecondary(id, entries) : null;
                    const mainId = upgrade ? upgrade.mainDpId : id;
                    const parts = mainId.split('.');
                    const parent = parts.slice(0, -1).join('.');
                    const parentUp = parts.slice(0, -2).join('.');
                    const sibs   = entries.filter((e) => e.id.startsWith(parent + '.'));
                    const sibsUp = entries.filter((e) => e.id.startsWith(parentUp + '.'));
                    const statusDps = autoDetectStatusDps(mainId, entries);
                    if (!upgrade) {
                      // No template and no upgrade: only fill battery/unreach if found
                      if (statusDps.batteryDp || statusDps.unreachDp)
                        onConfigChange({ ...updatedConfig, options: { ...updatedConfig.options, ...statusDps } });
                      return;
                    }
                    const upgradeOptions: Record<string, unknown> = { [upgrade.selectedOptionKey]: id };
                    for (const sdp of upgrade.template.secondaryDps) {
                      if (sdp.optionKey === upgrade.selectedOptionKey) continue;
                      const found = sdp.siblingNames.map((n) => sibs.find((e) => e.id === `${parent}.${n}`)?.id).find(Boolean)
                        ?? sdp.siblingNames.map((n) => sibsUp.find((e) => e.id === `${parentUp}.0.${n}`)?.id).find(Boolean);
                      if (found) upgradeOptions[sdp.optionKey] = found;
                    }
                    if (statusDps.batteryDp  && !upgradeOptions.batteryDp)  upgradeOptions.batteryDp  = statusDps.batteryDp;
                    if (statusDps.unreachDp  && !upgradeOptions.unreachDp)  upgradeOptions.unreachDp  = statusDps.unreachDp;
                    onConfigChange({
                      ...updatedConfig,
                      type: upgrade.template.widgetType,
                      datapoint: upgrade.mainDpId,
                      options: { ...updatedConfig.options, ...upgradeOptions },
                    });
                  }
                }).catch(() => { /* ignore */ });
              };

              // If the picked DP suggests a different widget type on a new widget,
              // ask the user before silently switching.
              if (canAutoSwitch && detected && detected.type !== config.type) {
                setPendingTypeChange({
                  suggestedType: detected.type,
                  currentType: config.type,
                  onSwitch: () => { setPendingTypeChange(null); applyDp(true); },
                  onKeep:   () => { setPendingTypeChange(null); applyDp(false); },
                });
              } else {
                applyDp(canAutoSwitch);
              }
            } else if (pickerTarget === 'localTempDatapoint') {
              onConfigChange({ ...config, options: { ...config.options, localTempDatapoint: id } });
            } else if (pickerTarget === 'shutter_activityDp') {
              onConfigChange({ ...config, options: { ...config.options, activityDp: id } });
            } else if (pickerTarget === 'shutter_directionDp') {
              onConfigChange({ ...config, options: { ...config.options, directionDp: id } });
            } else if (pickerTarget === 'shutter_stopDp') {
              onConfigChange({ ...config, options: { ...config.options, stopDp: id } });
            } else if (pickerTarget === 'shutter_openDp') {
              onConfigChange({ ...config, options: { ...config.options, openDp: id } });
            } else if (pickerTarget === 'shutter_closeDp') {
              onConfigChange({ ...config, options: { ...config.options, closeDp: id } });
            } else if (pickerTarget === 'dimmer_switchDp') {
              onConfigChange({ ...config, options: { ...config.options, switchDp: id } });
            } else if (pickerTarget === 'light_switchDp') {
              onConfigChange({ ...config, options: { ...config.options, switchDp: id } });
            } else if (pickerTarget === 'light_brightnessDp') {
              onConfigChange({ ...config, options: { ...config.options, brightnessDp: id } });
            } else if (pickerTarget === 'light_hueDp') {
              onConfigChange({ ...config, options: { ...config.options, hueDp: id } });
            } else if (pickerTarget === 'light_saturationDp') {
              onConfigChange({ ...config, options: { ...config.options, saturationDp: id } });
            } else if (pickerTarget === 'light_rDp') {
              onConfigChange({ ...config, options: { ...config.options, rDp: id } });
            } else if (pickerTarget === 'light_gDp') {
              onConfigChange({ ...config, options: { ...config.options, gDp: id } });
            } else if (pickerTarget === 'light_bDp') {
              onConfigChange({ ...config, options: { ...config.options, bDp: id } });
            } else if (pickerTarget === 'light_colorDp') {
              onConfigChange({ ...config, options: { ...config.options, colorDp: id } });
            } else if (pickerTarget === 'light_temperatureDp') {
              onConfigChange({ ...config, options: { ...config.options, temperatureDp: id } });
            } else if (pickerTarget === 'light_effectDp') {
              onConfigChange({ ...config, options: { ...config.options, effectDp: id } });
            } else if (pickerTarget === 'gauge_pointer2Dp') {
              onConfigChange({ ...config, options: { ...config.options, pointer2Datapoint: id } });
            } else if (pickerTarget === 'gauge_pointer3Dp') {
              onConfigChange({ ...config, options: { ...config.options, pointer3Datapoint: id } });
            } else if (pickerTarget === 'wc_lockDp') {
              onConfigChange({ ...config, options: { ...config.options, lockDp: id } });
            } else if (pickerTarget === 'windowcontact_batteryDp' || pickerTarget === 'status_batteryDp') {
              onConfigChange({ ...config, options: { ...config.options, batteryDp: id } });
            } else if (pickerTarget === 'status_unreachDp') {
              onConfigChange({ ...config, options: { ...config.options, unreachDp: id } });
            } else if (pickerTarget === 'camera_wakeUpDp') {
              onConfigChange({ ...config, options: { ...config.options, wakeUpDp: id } });
            } else if (pickerTarget === 'climate_humidityDp') {
              onConfigChange({ ...config, options: { ...config.options, humidityDatapoint: id } });
            } else if (pickerTarget === 'climate_targetDp') {
              onConfigChange({ ...config, options: { ...config.options, targetDatapoint: id } });
            } else if (pickerTarget === 'iframe_urlDp') {
              onConfigChange({ ...config, options: { ...config.options, iframeUrlDp: id } });
            } else if (pickerTarget === 'http_response_dp') {
              onConfigChange({ ...config, options: { ...config.options, responseDatapoint: id } });
            } else if (pickerTarget === 'html_dp') {
              onConfigChange({ ...config, options: { ...config.options, htmlDatapoint: id } });
            } else if (pickerTarget === 'mp_dp') {
              onConfigChange({ ...config, options: { ...config.options, [mpPickerKey]: id } });
            } else if (pickerTarget === 'mp_chip') {
              const chips = [...((config.options?.chips as Array<Record<string, unknown>>) ?? [])];
              chips[mpChipIdx] = { ...chips[mpChipIdx], dp: id };
              onConfigChange({ ...config, options: { ...config.options, chips } });
            } else if (pickerTarget === 'chips_chip') {
              const chips = [...((config.options?.chips as Array<Record<string, unknown>>) ?? [])];
              chips[chipsChipIdx] = { ...chips[chipsChipIdx], dp: id };
              onConfigChange({ ...config, options: { ...config.options, chips } });
            } else if (pickerTarget === 'chips_checkDp') {
              onConfigChange({ ...config, options: { ...config.options, checkDp: id } });
            } else if (pickerTarget === 'sl_action') {
              const acts = [...((config.options?.actions as Array<Record<string, unknown>>) ?? [])];
              acts[slActionIdx] = { ...acts[slActionIdx], dp: id };
              onConfigChange({ ...config, options: { ...config.options, actions: acts } });
            } else if (pickerTarget === 'camera_slot') {
              const key = (config.layout ?? 'minimal') === 'default' ? 'infoItems' : 'customSlots';
              const arr = [...((config.options?.[key] as CameraSlot[]) ?? [])];
              arr[cameraSlotPickerIdx] = { ...arr[cameraSlotPickerIdx], datapoint: id };
              onConfigChange({ ...config, options: { ...config.options, [key]: arr } });
            } else {
              onConfigChange({ ...config, options: { ...config.options, actualDatapoint: id } });
            }
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}

      {/* DP-vs-widget-type mismatch confirmation */}
      {pendingTypeChange && (() => {
        const suggestedLabel = WIDGET_BY_TYPE[pendingTypeChange.suggestedType]?.label ?? pendingTypeChange.suggestedType;
        const currentLabel   = WIDGET_BY_TYPE[pendingTypeChange.currentType]?.label   ?? pendingTypeChange.currentType;
        return (
          <CenteredModal title={t('wf.dpTypeMismatch.title')} onClose={pendingTypeChange.onKeep}>
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {t('wf.dpTypeMismatch.message', { suggested: suggestedLabel, current: currentLabel })}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={pendingTypeChange.onKeep}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                >
                  {t('wf.dpTypeMismatch.keep', { current: currentLabel })}
                </button>
                <button
                  onClick={pendingTypeChange.onSwitch}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
                >
                  {t('wf.dpTypeMismatch.switch', { suggested: suggestedLabel })}
                </button>
              </div>
            </div>
          </CenteredModal>
        );
      })()}

      {/* Image file picker */}
      {imageFilePicker && (
        <DatapointPicker
          modes={['files']}
          defaultMode="files"
          acceptMime={['image/*']}
          currentValue={(config.options?.imageUrl as string) ?? ''}
          onPickResult={(r) => {
            if (r.kind === 'file') {
              onConfigChange({ ...config, options: { ...(config.options ?? {}), imageUrl: `aura-file:${r.path}` } });
            }
          }}
          onClose={() => setImageFilePicker(false)}
        />
      )}

      {/* StateImage image file picker */}
      {siImagePickerState !== null && (
        <DatapointPicker
          modes={['files']}
          defaultMode="files"
          acceptMime={['image/*']}
          currentValue={(config.options?.[`${siImagePickerState}Base64`] as string) ?? ''}
          onPickResult={(r) => {
            if (r.kind === 'file') {
              onConfigChange({ ...config, options: { ...(config.options ?? {}), [`${siImagePickerState}Base64`]: `aura-file:${r.path}` } });
            }
            setSiImagePickerState(null);
          }}
          onClose={() => setSiImagePickerState(null)}
        />
      )}

      {/* Custom-Grid cell context menu (right-click on a cell) */}
      {customCellContextMenu && (() => {
        const g = resolveCustomGrid();
        const idx = customCellContextMenu.idx;
        const cell = g.cells[idx];
        const hasContent = !!(cell && cell.type !== 'empty');
        const hasClip = !!cellClipboard;
        const MENU_W = 200;
        const MENU_H = 180;
        const left = Math.min(customCellContextMenu.x, window.innerWidth - MENU_W - 8);
        const top  = Math.min(customCellContextMenu.y, window.innerHeight - MENU_H - 8);
        const itemBase: React.CSSProperties = {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', fontSize: 12, cursor: 'pointer',
          color: 'var(--text-primary)', background: 'transparent', border: 'none', width: '100%', textAlign: 'left',
        };
        const itemDisabled: React.CSSProperties = { ...itemBase, color: 'var(--text-secondary)', opacity: 0.4, cursor: 'not-allowed' };
        const close = () => setCustomCellContextMenu(null);
        const onItem = (fn: () => void, enabled: boolean) => () => { if (enabled) { fn(); close(); } };
        return createPortal(
          <div
            ref={cellMenuRef}
            className="fixed z-[9999] rounded-lg shadow-2xl py-1"
            style={{
              background: 'var(--app-surface)',
              border: '1px solid var(--app-border)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              left, top, minWidth: MENU_W,
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
              <button
                style={hasContent ? itemBase : itemDisabled}
                onClick={onItem(() => cellCopy(idx), hasContent)}
                onMouseEnter={(e) => { if (hasContent) e.currentTarget.style.background = 'var(--app-bg)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span>Kopieren</span><span style={{ opacity: 0.55, fontSize: 10 }}>Strg+C</span>
              </button>
              <button
                style={hasContent ? itemBase : itemDisabled}
                onClick={onItem(() => cellCut(idx), hasContent)}
                onMouseEnter={(e) => { if (hasContent) e.currentTarget.style.background = 'var(--app-bg)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span>Ausschneiden</span><span style={{ opacity: 0.55, fontSize: 10 }}>Strg+X</span>
              </button>
              <button
                style={hasClip ? itemBase : itemDisabled}
                onClick={onItem(() => cellPaste(idx), hasClip)}
                onMouseEnter={(e) => { if (hasClip) e.currentTarget.style.background = 'var(--app-bg)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span>Einfügen</span><span style={{ opacity: 0.55, fontSize: 10 }}>Strg+V</span>
              </button>
              <div style={{ height: 1, background: 'var(--app-border)', margin: '4px 6px' }} />
              <button
                style={hasContent ? itemBase : itemDisabled}
                onClick={onItem(() => cellClear(idx), hasContent)}
                onMouseEnter={(e) => { if (hasContent) e.currentTarget.style.background = 'var(--app-bg)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span>Leeren</span>
              </button>
          </div>,
          widgetFramePortalTarget,
        );
      })()}

      {/* Custom-Grid overwrite confirmation (drag&drop or paste onto occupied cell) */}
      {customCellOverwrite && (() => {
        const fb = config.type === 'universal' ? DEFAULT_UNIVERSAL_GRID : config.type === 'knob' ? DEFAULT_KNOB_GRID : DEFAULT_CUSTOM_GRID;
        const grid = normalizeGrid(config.options?.customGrid, fb);
        const gCols = grid.cols;
        const op = customCellOverwrite;
        const to = op.to;
        const targetCell = grid.cells[to];
        const toLabel   = `${Math.floor(to / gCols) + 1}/${(to % gCols) + 1}`;
        const targetTypeLabel = (targetCell && CELL_LABELS[targetCell.type]) ?? targetCell?.type ?? '';
        const fromLabel = op.kind === 'drop' ? `${Math.floor(op.from / gCols) + 1}/${(op.from % gCols) + 1}` : null;
        const sourceCell: CustomCell | undefined = op.kind === 'drop' ? grid.cells[op.from] : op.cell;
        const actionLabel = op.kind === 'paste' ? 'Einfügen' : op.mode === 'copy' ? 'Kopieren' : 'Verschieben';
        const onCancel = () => setCustomCellOverwrite(null);
        const onConfirm = () => {
          if (!sourceCell) { setCustomCellOverwrite(null); return; }
          const nextCells = grid.cells.map((c, idx) => {
            if (idx === to) return op.kind === 'drop' ? sourceCell : { ...sourceCell };
            if (op.kind === 'drop' && op.mode === 'move' && idx === op.from) return { type: 'empty' as const };
            return c;
          });
          onConfigChange({ ...config, options: { ...(config.options ?? {}), customGrid: { ...grid, cells: nextCells } } });
          if (op.kind === 'drop' && op.mode === 'move') {
            if (selectedCustomCell === op.from) setSelectedCustomCell(to);
            else if (selectedCustomCell === to) setSelectedCustomCell(null);
          } else {
            setSelectedCustomCell(to);
          }
          setCustomCellOverwrite(null);
        };
        return (
          <CenteredModal title="Zelle überschreiben?" onClose={onCancel}>
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                Zielzelle <strong>{toLabel}</strong> enthält bereits &bdquo;{targetTypeLabel}&ldquo;.
                {fromLabel
                  ? <> Soll der Inhalt von <strong>{fromLabel}</strong> ({actionLabel.toLowerCase()}) diese Zelle überschreiben?</>
                  : <> Inhalt aus der Zwischenablage einfügen und überschreiben?</>}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={onCancel}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                >
                  Abbrechen
                </button>
                <button
                  onClick={onConfirm}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
                >
                  Überschreiben
                </button>
              </div>
            </div>
          </CenteredModal>
        );
      })()}

      {/* Custom-Grid image file picker */}
      {customCellImagePickerOpen && selectedCustomCell !== null && (() => {
        const fb = config.type === 'universal' ? DEFAULT_UNIVERSAL_GRID : config.type === 'knob' ? DEFAULT_KNOB_GRID : DEFAULT_CUSTOM_GRID;
        const grid = normalizeGrid(config.options?.customGrid, fb);
        const idx = selectedCustomCell;
        return (
          <DatapointPicker
            modes={['files']}
            defaultMode="files"
            acceptMime={['image/*']}
            currentValue={grid.cells[idx]?.imageUrl ?? ''}
            onPickResult={(r) => {
              if (r.kind === 'file') {
                const next: CustomGridDef = { ...grid, cells: grid.cells.map((c, i) => i === idx ? { ...c, imageUrl: `aura-file:${r.path}` } : c) };
                onConfigChange({ ...config, options: { ...config.options, customGrid: next } });
              }
              setCustomCellImagePickerOpen(false);
            }}
            onClose={() => setCustomCellImagePickerOpen(false)}
          />
        );
      })()}

      {/* WindowContact image file picker */}
      {wcImagePickerState !== null && (
        <DatapointPicker
          modes={['files']}
          defaultMode="files"
          acceptMime={['image/*']}
          currentValue={(config.options?.[`${wcImagePickerState}Base64`] as string) ?? ''}
          onPickResult={(r) => {
            if (r.kind === 'file') {
              onConfigChange({ ...config, options: { ...(config.options ?? {}), [`${wcImagePickerState}Base64`]: `aura-file:${r.path}` } });
            }
            setWcImagePickerState(null);
          }}
          onClose={() => setWcImagePickerState(null)}
        />
      )}

      {/* Custom-Grid DP picker */}
      {customCellPickerOpen && selectedCustomCell !== null && (() => {
        const fb = config.type === 'universal' ? DEFAULT_UNIVERSAL_GRID : config.type === 'knob' ? DEFAULT_KNOB_GRID : DEFAULT_CUSTOM_GRID;
        const grid = normalizeGrid(config.options?.customGrid, fb);
        const idx = selectedCustomCell;
        return (
          <DatapointPicker
            currentValue={grid.cells[idx]?.dpId ?? ''}
            onSelect={(id) => {
              const next: CustomGridDef = { ...grid, cells: grid.cells.map((c, i) => i === idx ? { ...c, dpId: id } : c) };
              onConfigChange({ ...config, options: { ...config.options, customGrid: next } });
              setCustomCellPickerOpen(false);
            }}
            onClose={() => setCustomCellPickerOpen(false)}
          />
        );
      })()}

      {/* Custom-Grid icon picker (icon / state-icon / switch-icon-mode cells) */}
      {customCellIconPicker !== null && selectedCustomCell !== null && (() => {
        const fb = config.type === 'universal' ? DEFAULT_UNIVERSAL_GRID : config.type === 'knob' ? DEFAULT_KNOB_GRID : DEFAULT_CUSTOM_GRID;
        const grid = normalizeGrid(config.options?.customGrid, fb);
        const idx = selectedCustomCell;
        const slot = customCellIconPicker;
        const current = (grid.cells[idx]?.[slot] as string | undefined) ?? '';
        return (
          <IconPickerModal
            current={current}
            onSelect={(name) => {
              const next: CustomGridDef = {
                ...grid,
                cells: grid.cells.map((c, i) => i === idx ? { ...c, [slot]: name || undefined } : c),
              };
              onConfigChange({ ...config, options: { ...config.options, customGrid: next } });
              setCustomCellIconPicker(null);
            }}
            onClose={() => setCustomCellIconPicker(null)}
          />
        );
      })()}

      {/* Conditions Modal */}
      {openPanel === 'group-mobile-order' && groupDefId && (
        <CenteredModal title={t('group.mobileOrder')} onClose={() => openPanelFor(null)}>
          <GroupMobileOrderPanel defId={groupDefId} />
        </CenteredModal>
      )}

      {openPanel === 'conditions' && (
        <CenteredModal title="Bedingungen" onClose={() => openPanelFor(null)} wide>
          <ConditionEditor
            conditions={conditions}
            onChange={(next) =>
              onConfigChange({ ...config, options: { ...config.options, conditions: next } })
            }
          />
        </CenteredModal>
      )}

      {/* Click-Action Settings Modal */}
      {openPanel === 'action' && (
        <CenteredModal title={t('wf.menu.clickAction')} onClose={() => openPanelFor(null)}>
          <ClickActionEditor config={config} onConfigChange={(c) => { onConfigChange(c); }} />
        </CenteredModal>
      )}

      {/* Runtime popup */}
      {popupOpen && hasClickAction && (
        <WidgetClickPopup
          widget={config}
          action={clickAction}
          onClose={() => setPopupOpen(false)}
          allWidgets={useDashboardStore.getState().layouts.flatMap((l) => l.tabs.flatMap((t) => t.widgets))}
        />
      )}
    </div>
  );
}
