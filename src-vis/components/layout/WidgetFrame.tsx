import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../../contexts/PortalTargetContext';
import { useT, t, type TranslationKey } from '../../i18n';
import { X, Pencil, Database, Sparkles, EyeOff, ChevronDown, Plus, Trash2, Download, ArrowRightLeft, Copy, Layers2, Minimize2, Smartphone, GripVertical } from 'lucide-react';
import { setDragBridge } from '../../utils/dragBridge';
import { verticalCompact } from '../../utils/gridCompact';
import { exportWidget } from '../../utils/widgetExportImport';
import { copyToClipboard } from '../../utils/clipboard';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { applyDpNameFilter } from '../../utils/dpNameFilter';
import { useDashboardStore, useActiveLayout } from '../../store/dashboardStore';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { cloneGroupDef, useGroupDefsStore } from '../../store/groupDefsStore';
import { useConfigStore } from '../../store/configStore';
import { useActiveLayoutId } from '../../contexts/ActiveLayoutContext';
import { useEffectiveSettings } from '../../hooks/useEffectiveSettings';
import type { WidgetConfig, WidgetCondition, CustomCell, CustomGrid, WidgetType } from '../../types';
import { DEFAULT_CUSTOM_GRID } from '../widgets/CustomGridView';
import { DatapointPicker } from '../config/DatapointPicker';
import { ConditionEditor } from '../config/ConditionEditor';
import { getObjectDirect, subscribeStateDirect, getStateDirect } from '../../hooks/useIoBroker';
import { lookupDatapointEntry, ensureDatapointCache } from '../../hooks/useDatapointList';
import { WIDGET_REGISTRY, WIDGET_GROUPS, WIDGET_BY_TYPE } from '../../widgetRegistry';
import { detectType } from '../../utils/widgetDetection';
import { DP_TEMPLATES, findMainDpForSecondary, autoDetectStatusDps } from '../../utils/dpTemplates';
import { AutoListConfig } from '../config/AutoListConfig';
import { StaticListConfig } from '../config/StaticListConfig';
import { type CameraSlot, type CameraSlotType, type CameraTemplateId, CAMERA_TEMPLATES, SLOT_TYPE_OPTIONS } from '../widgets/CameraWidget';
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
import { ShutterWidget } from '../widgets/ShutterWidget';
import { JsonTableWidget } from '../widgets/JsonTableWidget';
import { WindowContactWidget, WC_PRESETS, WC_PRESET_LABELS } from '../widgets/WindowContactWidget';
import { BinarySensorWidget, BINARY_SENSOR_PRESETS } from '../widgets/BinarySensorWidget';
import { StateImageWidget } from '../widgets/StateImageWidget';
import { EChartsPresetWidget } from '../widgets/EChartsPresetWidget';
import { EChartsPresetConfig } from '../config/EChartsPresetConfig';
import { JsonTableConfig } from '../config/JsonTableConfig';
import { HtmlWidget } from '../widgets/HtmlWidget';
import { HtmlConfig } from '../config/HtmlConfig';
import { DatePickerWidget, FORMAT_LABELS, type DateOutputFormat } from '../widgets/DatePickerWidget';
import { IconPickerModal } from '../config/IconPickerModal';

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
    shutter:       ShutterWidget,
    jsontable:     JsonTableWidget,
    html:          HtmlWidget,
    windowcontact: WindowContactWidget,
    binarysensor:  BinarySensorWidget,
    stateimage:    StateImageWidget,
    echartsPreset: EChartsPresetWidget,
    datepicker:    DatePickerWidget,
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
        <input type="range" min={0.5} max={3} step={0.05}
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

  useEffect(() => {
    if (!dp) { setAdapters([]); return; }
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
  title: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const portalTarget = usePortalTarget();
  const modalRef = useRef<HTMLDivElement>(null);
  // null = use CSS centering; once dragged, holds absolute pixel position
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragOrigin = useRef<{ mx: number; my: number; rx: number; ry: number } | null>(null);

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

  const posStyle: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, transform: 'none' }
    : { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

  return createPortal(
    // pointer-events-none wrapper: clicks pass through to the widget below
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div
        ref={modalRef}
        className={`pointer-events-auto flex flex-col rounded-xl shadow-2xl w-[90vw] ${wide ? 'max-w-5xl' : 'max-w-3xl'} max-h-[85vh]`}
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', boxShadow: '0 8px 40px rgba(0,0,0,0.35)', ...posStyle }}
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

export function WidgetFrame({ config, editMode, onRemove, onConfigChange, onDuplicate }: WidgetFrameProps) {
  const t = useT();
  const [openPanel, setOpenPanel] = useState<'menu' | 'edit' | 'conditions' | 'group-mobile-order' | null>(null);
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

  // GROUP widgets: create a fresh defId + clone children so copies are independent
  function copyConfig(src: WidgetConfig): WidgetConfig {
    if (src.type === 'group' && src.options?.defId) {
      return { ...src, options: { ...src.options, defId: cloneGroupDef(src.options.defId as string) } };
    }
    return src;
  }

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
      setShowGroupTypePicker(false);
      releasePanel(config.id);
    } else {
      claimPanel(config.id, () => setOpenPanel(null));
      setOpenPanel(panel);
    }
  };
  const [pickerTarget, setPickerTarget] = useState<'datapoint' | 'actualDatapoint' | 'localTempDatapoint' | 'shutter_activityDp' | 'shutter_directionDp' | 'shutter_stopDp' | 'gauge_pointer2Dp' | 'gauge_pointer3Dp' | 'windowcontact_batteryDp' | 'wc_lockDp' | 'status_batteryDp' | 'status_unreachDp' | 'camera_wakeUpDp' | 'camera_slot' | 'html_dp' | null>(null);
  const [cameraSlotPickerIdx, setCameraSlotPickerIdx] = useState(0);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconPickerTrueOpen,  setIconPickerTrueOpen]  = useState(false);
  const [iconPickerFalseOpen, setIconPickerFalseOpen] = useState(false);
  const [wcIconPickerState, setWcIconPickerState] = useState<'closed' | 'tilted' | 'open' | null>(null);
  const [selectedCustomCell,   setSelectedCustomCell]   = useState<number | null>(null);
  const [customCellPickerOpen, setCustomCellPickerOpen] = useState(false);
  const [draftIconSize, setDraftIconSize] = useState<number | null>(null);
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

  // ── Group-specific hooks (always called, conditionally used) ───────────────
  const groupDefId = isGroup ? (config.options?.defId as string | undefined) : undefined;
  const groupChildren = useGroupDefsStore((s) => groupDefId ? (s.defs[groupDefId] ?? []) : []);
  const groupCellSize = useConfigStore((s) => s.frontend.gridRowHeight ?? 80);
  const groupGridGap  = useConfigStore((s) => s.frontend.gridGap ?? 10);

  const fitGroupHeight = () => {
    if (!groupDefId || groupChildren.length === 0) return;
    const maxBottom = Math.max(...groupChildren.map((c) => c.gridPos.y + c.gridPos.h));
    const innerH = maxBottom * (groupCellSize + groupGridGap) - groupGridGap;
    const titleBarH = config.title ? 28 : 0;
    const newH = Math.ceil((titleBarH + innerH + 8 + groupGridGap) / (groupCellSize + groupGridGap));
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
    const titleBarH = config.title ? 28 : 0;
    const newH = Math.ceil((titleBarH + innerH + 8 + groupGridGap) / (groupCellSize + groupGridGap));
    onConfigChange({ ...config, gridPos: { ...config.gridPos, h: newH } });
    setShowGroupTypePicker(false);
    openPanelFor(null);
  };
  // ──────────────────────────────────────────────────────────────────────────

  const activeLayoutIdCtx = useActiveLayoutId();
  const effectiveSettings = useEffectiveSettings(activeLayoutIdCtx);
  const widgetPadding = effectiveSettings.widgetPadding ?? 16;
  const isNoPad = isHeader || isGroup || isTransparent || config.type === 'iframe' || config.type === 'echartsPreset';

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
        padding: isNoPad ? undefined : widgetPadding,
        ...cssOverride,
        ...(!editMode && conditionResult.hidden && !conditionResult.reflow
          ? { visibility: 'hidden', pointerEvents: 'none' } : {}),
      }}
      className={`aura-widget aura-widget-${config.id} aura-widget-type-${config.type} relative h-full transition-all overflow-visible ${isHeader ? 'px-2 py-0' : isNoPad ? 'p-0' : ''} ${editMode ? 'ring-2 ring-accent/40 rounded-xl' : ''} ${!editMode && conditionResult.effect === 'pulse' ? 'animate-pulse' : ''} ${!editMode && conditionResult.effect === 'blink' ? 'animate-[blink_1s_step-end_infinite]' : ''}`}
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
        <Widget
          config={config.options?.hideTitle ? { ...config, title: '' } : config}
          editMode={editMode}
          onConfigChange={onConfigChange}
        />
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
                      const types = WIDGET_REGISTRY.filter((m) => m.widgetGroup === g.id && m.type !== 'calendar');
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
                  onClick={() => { fitGroupHeight(); openPanelFor(null); }}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity w-full"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Minimize2 size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                  {t('group.fitHeight')}
                </button>
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
          wide={config.type === 'echart' || config.type === 'autolist' || config.type === 'list' || config.type === 'trash'}
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

            {/* ── Layout & Sichtbare Felder (kombiniert, eingeklappt) ── */}
            {config.type !== 'header' && config.type !== 'iframe' && config.type !== 'jsontable' && config.type !== 'html' && (() => {
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
              ] : config.type === 'chart' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'card',    label: t('wf.edit.layout.card') },
              ] : config.type === 'echartsPreset' ? [
                { value: 'default', label: t('wf.edit.layout.standard') },
              ] : [
                { value: 'default', label: t('wf.edit.layout.standard') },
                { value: 'card',    label: t('wf.edit.layout.card') },
                { value: 'compact', label: t('wf.edit.layout.compact') },
                { value: 'minimal', label: t('wf.edit.layout.minimal') },
                ...(config.type === 'calendar' ? [{ value: 'agenda', label: t('wf.edit.layout.agenda') }] : []),
                ...(config.type === 'autolist' ? [{ value: 'count', label: 'Anzahl' }] : []),
                ...(!['iframe', 'jsontable', 'html', 'trash', 'header', 'fill', 'list', 'autolist', 'datepicker'].includes(config.type) ? [{ value: 'custom', label: 'Custom' }] : []),
                ...(config.type === 'evcc' ? [
                  { value: 'flow',        label: 'Nur Fluss' },
                  { value: 'battery',     label: 'Nur Batterie' },
                  { value: 'production',  label: 'Nur Produktion' },
                  { value: 'consumption', label: 'Nur Verbrauch' },
                  { value: 'loadpoints',  label: 'Nur Ladepunkte' },
                ] : []),
              ];
              const o = config.options ?? {};
              const setO = (patch: Record<string, unknown>) =>
                onConfigChange({ ...config, options: { ...o, ...patch } });
              const visFields: VisField[] = (() => {
                switch (config.type) {
                  case 'switch':        return [{ key: 'showTitle', label: 'Titel' }, { key: 'showLabel', label: 'Status (AN/AUS)' }];
                  case 'value':         return [{ key: 'showTitle', label: 'Titel' }, { key: 'showValue', label: 'Wert' }, { key: 'showUnit', label: 'Einheit' }];
                  case 'dimmer':        return [{ key: 'showTitle', label: 'Titel' }, { key: 'showValue', label: 'Prozentwert' }, { key: 'showSlider', label: 'Schieberegler' }];
                  case 'thermostat':    return [{ key: 'showTitle', label: 'Titel' }, { key: 'showSetpoint', label: 'Solltemperatur' }, { key: 'showActualTemp', label: 'Isttemperatur' }, { key: 'showControls', label: 'Tasten ±' }];
                  case 'shutter':       return [{ key: 'showTitle', label: 'Titel' }, { key: 'showValue', label: 'Position %' }, { key: 'showControls', label: 'Steuerknöpfe' }, { key: 'showSlider', label: 'Schieberegler' }];
                  case 'gauge':         return [{ key: 'showTitle', label: 'Titel' }];
                  case 'clock':         return [{ key: 'showTitle', label: 'Titel' }];
                  case 'weather':       return [{ key: 'showTitle', label: 'Titel' }];
                  case 'windowcontact': return [{ key: 'showTitle', label: 'Titel' }, { key: 'showLabel', label: 'Status-Text' }];
                  case 'binarysensor':  return [{ key: 'showTitle', label: 'Titel' }, { key: 'showLabel', label: 'Status-Text' }];
                  case 'datepicker':   return [{ key: 'showTitle', label: 'Titel' }, { key: 'showCurrentValue', label: 'Gesetzter Wert' }];
                  case 'stateimage':    return [{ key: 'showTitle', label: 'Titel' }, { key: 'showLabel', label: 'Status-Text' }];
                  case 'chart':         return [{ key: 'showTitle', label: 'Titel' }];
                  case 'echart':        return [{ key: 'showTitle', label: 'Titel' }];
                  case 'list':          return [{ key: 'showTitle', label: 'Kopfzeile' }];
                  case 'autolist':      return [{ key: 'showTitle', label: 'Kopfzeile' }];
                  case 'calendar':      return [
                    { key: 'showCalName',  label: 'Kalender-Name' },
                    { key: 'showSummary',  label: 'Terminname' },
                    { key: 'showDate',     label: 'Datum / Uhrzeit' },
                    { key: 'showLocation', label: 'Ort' },
                    { key: 'showMore',     label: '+ weitere Termine' },
                  ];
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

            {/* Icon picker (not for stateimage/windowcontact – icons are per-state) */}
            {config.type !== 'stateimage' && config.type !== 'windowcontact' && (() => {
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
            {!['clock', 'calendar', 'gauge', 'chart', 'echart', 'echartsPreset', 'fill', 'iframe', 'html', 'jsontable', 'image', 'camera', 'list', 'autolist', 'header', 'trash', 'evcc', 'weather', 'group'].includes(config.type) && (() => {
              const o = config.options ?? {};
              const iconSize = (o.iconSize as number) || 36;
              const displayIconSize = draftIconSize ?? iconSize;
              return (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Icon-Größe</label>
                    <span className="text-[11px] tabular-nums" style={{ color: 'var(--text-primary)' }}>{displayIconSize} px</span>
                  </div>
                  <input type="range" min={12} max={128} step={4} value={displayIconSize}
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
                  </>
                );
              })()}

              {config.type === 'calendar' && (
                <CalendarEditPanel config={config} onConfigChange={onConfigChange} />
              )}

              {config.type !== 'list' && config.type !== 'clock' && config.type !== 'calendar' && config.type !== 'header' && config.type !== 'group' && config.type !== 'evcc' && config.type !== 'echart' && config.type !== 'weather' && config.type !== 'camera' && config.type !== 'autolist' && config.type !== 'image' && config.type !== 'iframe' && config.type !== 'trash' && config.type !== 'echartsPreset' && config.type !== 'html' && (
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    {config.type === 'thermostat'     ? 'Soll-Temperatur Datenpunkt' :
                     config.type === 'windowcontact'  ? 'Kontaktstatus Datenpunkt (boolean / 0=zu / 1=kippt / 2=offen)' :
                     config.type === 'binarysensor'   ? 'Sensorwert Datenpunkt (boolean, true = aktiv)' :
                     config.type === 'stateimage'     ? 'Zustand Datenpunkt (boolean, true = erstes Bild)' :
                     config.type === 'shutter'        ? 'Positions-Datenpunkt (0–100 %)' :
                     config.type === 'dimmer'         ? 'Helligkeits-Datenpunkt (0–100 %)' :
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
                        const supportsUnit = ['value', 'chart', 'gauge', 'fill'].includes(config.type);
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
              {config.type === 'value' && (
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>HTML-Template (optional)</label>
                  <input
                    type="text"
                    value={(config.options?.htmlTemplate as string) ?? ''}
                    onChange={(e) => onConfigChange({ ...config, options: { ...config.options, htmlTemplate: e.target.value || undefined } })}
                    placeholder='z.B. <b style="color:var(--accent)">{dp}</b> °C'
                    className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                  />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                    {'{dp}'} wird durch den Wert ersetzt · Beispiel: {'<span style="font-size:2em">{dp}</span> kW'}
                  </p>
                </div>
              )}
              {config.type === 'switch' && (() => {
                const o   = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const momentary = (o.momentary as boolean) ?? false;
                const delay     = (o.momentaryDelay as number) ?? 500;
                return (
                  <>
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
                  </>
                );
              })()}

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

              {/* ── Static List config ── */}
              {config.type === 'list' && (
                <StaticListConfig config={config} onConfigChange={onConfigChange} />
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
                    {(config.layout ?? 'default') === 'default' && (
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                        Balkenbreite/-höhe <span style={{ opacity: 0.6 }}>(% des Widgets)</span>
                      </label>
                      <input type="number" min={20} max={100} value={(o.barSize as number) ?? 80}
                        onChange={(e) => set({ barSize: Number(e.target.value) })}
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

              {config.type === 'shutter' && (() => {
                const o = config.options ?? {};
                const setO = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const sInputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none font-mono';
                const sInputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
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
                return (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Fahrt-Status DP (z.B. WORKING)</label>
                        <button onClick={() => void autoFill()}
                          className="text-[10px] px-2 py-0.5 rounded hover:opacity-80"
                          style={{ background: 'var(--accent)22', color: 'var(--accent)', border: '1px solid var(--accent)44' }}>
                          Auto-Erkennen
                        </button>
                      </div>
                      <div className="flex gap-1">
                        <input type="text" value={(o.activityDp as string) ?? ''}
                          onChange={(e) => setO({ activityDp: e.target.value || undefined })}
                          placeholder="optional"
                          className={`flex-1 ${sInputCls} min-w-0`} style={sInputStyle} />
                        <button onClick={() => setPickerTarget('shutter_activityDp')}
                          className="px-2 rounded-lg hover:opacity-80 shrink-0"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                          <Database size={13} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Richtungs-DP (z.B. DIRECTION)</label>
                      <div className="flex gap-1">
                        <input type="text" value={(o.directionDp as string) ?? ''}
                          onChange={(e) => setO({ directionDp: e.target.value || undefined })}
                          placeholder="optional"
                          className={`flex-1 ${sInputCls} min-w-0`} style={sInputStyle} />
                        <button onClick={() => setPickerTarget('shutter_directionDp')}
                          className="px-2 rounded-lg hover:opacity-80 shrink-0"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                          <Database size={13} />
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Stop-DP (z.B. STOP) – empfohlen</label>
                      <div className="flex gap-1">
                        <input type="text" value={(o.stopDp as string) ?? ''}
                          onChange={(e) => setO({ stopDp: e.target.value || undefined })}
                          placeholder="optional"
                          className={`flex-1 ${sInputCls} min-w-0`} style={sInputStyle} />
                        <button onClick={() => setPickerTarget('shutter_stopDp')}
                          className="px-2 rounded-lg hover:opacity-80 shrink-0"
                          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                          <Database size={13} />
                        </button>
                      </div>
                      {!(o.stopDp as string) && (
                        <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                          Ohne Stop-DP wird die Position vor dem letzten Fahrbefehl als Ziel zurückgesendet.
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Position invertieren (0=offen)</label>
                      <button
                        onClick={() => setO({ invertPosition: !(o.invertPosition ?? false) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (o.invertPosition ?? false) ? 'var(--accent)' : 'var(--app-border)' }}
                      >
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.invertPosition ?? false) ? '18px' : '2px' }} />
                      </button>
                    </div>
                  </>
                );
              })()}

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
                          <input type="file" accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => setO({ [`${st}Base64`]: reader.result as string });
                              reader.readAsDataURL(file);
                            }}
                            className="w-full text-[11px] cursor-pointer"
                            style={{ color: 'var(--text-secondary)' }} />
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
                          {currentBase64 && (
                            <div className="flex items-center gap-2">
                              <img src={currentBase64}
                                style={{ width: 32, height: 32, objectFit: 'contain', border: '1px solid var(--app-border)', borderRadius: 4 }}
                                alt="" />
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
                          {/* File upload */}
                          <input type="file" accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => setO({ [`${prefix}Base64`]: reader.result as string });
                              reader.readAsDataURL(file);
                            }}
                            className="w-full text-[11px] cursor-pointer"
                            style={{ color: 'var(--text-secondary)' }} />
                          {/* Paste base64 string */}
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
                          {currentBase64 && (
                            <div className="flex items-center gap-2">
                              <img src={currentBase64}
                                style={{ width: 32, height: 32, objectFit: 'contain', border: '1px solid var(--app-border)', borderRadius: 4 }}
                                alt="" />
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

                return (
                  <>
                    {renderStateSection('true', 'Wahr (true)')}
                    <div className="h-px" style={{ background: 'var(--app-border)' }} />
                    {renderStateSection('false', 'Falsch (false)')}
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
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Ist-Temperatur Datenpunkt</label>
                        <button onClick={() => void autoFillThermostat()}
                          className="text-[10px] px-2 py-0.5 rounded hover:opacity-80"
                          style={{ background: 'var(--accent)22', color: 'var(--accent)', border: '1px solid var(--accent)44' }}>
                          Auto-Erkennen
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
                          className="text-[10px] px-2 py-0.5 rounded hover:opacity-80"
                          style={{ background: 'var(--accent)22', color: 'var(--accent)', border: '1px solid var(--accent)44' }}>
                          Auto-Erkennen
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
              {!['iframe', 'jsontable', 'html', 'trash', 'header', 'fill', 'camera', 'datepicker'].includes(config.type) && (config.layout ?? 'default') === 'custom' && (() => {
                const CELL_LABELS: Record<string, string> = {
                  empty: '–', title: 'Titel', value: 'Wert', unit: 'Einheit', text: 'Text', dp: 'DP', field: 'Feld', component: 'Aktion',
                };
                const COMPONENT_OPTIONS: Record<string, { key: string; label: string }[]> = {
                  value:         [{ key: 'icon', label: 'Widget-Icon' }, { key: 'battery-icon', label: 'Batterie-Icon' }, { key: 'reach-icon', label: 'Erreichbarkeit-Icon' }, { key: 'status-badges', label: 'Status-Badges (alle)' }],
                  switch:        [{ key: 'icon', label: 'Widget-Icon' }, { key: 'toggle', label: 'Schalter' }, { key: 'battery-icon', label: 'Batterie-Icon' }, { key: 'reach-icon', label: 'Erreichbarkeit-Icon' }, { key: 'status-badges', label: 'Status-Badges (alle)' }],
                  dimmer:        [{ key: 'icon', label: 'Widget-Icon' }, { key: 'slider', label: 'Dimmer-Slider' }, { key: 'battery-icon', label: 'Batterie-Icon' }, { key: 'reach-icon', label: 'Erreichbarkeit-Icon' }, { key: 'status-badges', label: 'Status-Badges (alle)' }],
                  thermostat:    [{ key: 'icon', label: 'Widget-Icon' }, { key: 'btn-plus', label: '+ Temperatur' }, { key: 'btn-minus', label: '− Temperatur' }, { key: 'battery-icon', label: 'Batterie-Icon' }, { key: 'reach-icon', label: 'Erreichbarkeit-Icon' }, { key: 'status-badges', label: 'Status-Badges (alle)' }],
                  shutter:       [{ key: 'icon', label: 'Widget-Icon' }, { key: 'btn-up', label: '▲ Hoch' }, { key: 'btn-stop', label: '■ Stop' }, { key: 'btn-down', label: '▼ Runter' }, { key: 'battery-icon', label: 'Batterie-Icon' }, { key: 'reach-icon', label: 'Erreichbarkeit-Icon' }, { key: 'status-badges', label: 'Status-Badges (alle)' }],
                  windowcontact: [{ key: 'icon', label: 'Status-Icon' }, { key: 'battery-icon', label: 'Batterie-Icon' }, { key: 'reach-icon', label: 'Erreichbarkeit-Icon' }, { key: 'lock-icon', label: 'Schloss-Icon' }, { key: 'status-badges', label: 'Status-Badges (alle)' }],
                  binarysensor:  [{ key: 'icon', label: 'Status-Icon' }, { key: 'battery-icon', label: 'Batterie-Icon' }, { key: 'reach-icon', label: 'Erreichbarkeit-Icon' }, { key: 'status-badges', label: 'Status-Badges (alle)' }],
                  stateimage:    [{ key: 'icon', label: 'Zustands-Icon' }, { key: 'battery-icon', label: 'Batterie-Icon' }, { key: 'reach-icon', label: 'Erreichbarkeit-Icon' }, { key: 'status-badges', label: 'Status-Badges (alle)' }],
                };
                const o   = config.options ?? {};
                const cells: CustomGrid = (o.customGrid as CustomGrid | undefined) ?? DEFAULT_CUSTOM_GRID;
                const setCell = (idx: number, patch: Partial<CustomCell>) => {
                  const next = cells.map((c, i) => i === idx ? { ...c, ...patch } : c);
                  onConfigChange({ ...config, options: { ...o, customGrid: next } });
                };
                const sel = selectedCustomCell;
                const selCell = sel !== null ? cells[sel] : null;
                const inputCls = 'w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none';
                const inputSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                return (
                  <div className="space-y-2" style={{ borderTop: '1px solid var(--app-border)', paddingTop: 10, marginTop: 4 }}>
                    <p className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>Raster-Konfiguration (3×3)</p>

                    {/* 3×3 cell picker */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                      {cells.map((cell, i) => {
                        const active = sel === i;
                        const row = Math.floor(i / 3) + 1;
                        const col = (i % 3) + 1;
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedCustomCell(active ? null : i)}
                            className="rounded text-[10px] transition-colors"
                            style={{
                              background: active ? 'var(--accent)' : 'var(--widget-bg)',
                              color:      active ? '#fff' : 'var(--text-secondary)',
                              border:     `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                              minHeight: 36,
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
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
                      {sel !== null && selCell ? (<>
                        <p className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                          Zeile {Math.floor(sel / 3) + 1}, Spalte {(sel % 3) + 1} · CSS: .aura-custom-cell-{sel}
                        </p>

                        {/* Type */}
                        <div>
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Inhalt</label>
                          <select
                            value={selCell.type}
                            onChange={(e) => setCell(sel, { type: e.target.value as CustomCell['type'] })}
                            className={inputCls} style={inputSty}
                          >
                            <option value="empty">– leer –</option>
                            <option value="title">Titel</option>
                            <option value="value">Hauptwert (DP1)</option>
                            <option value="unit">Einheit (DP1)</option>
                            <option value="text">Freitext</option>
                            <option value="dp">Weiterer Datenpunkt</option>
                            <option value="field">Widget-Feld</option>
                            <option value="image">Bild (URL / Base64)</option>
                            {COMPONENT_OPTIONS[config.type] && (
                              <option value="component">Aktion / Icon</option>
                            )}
                          </select>
                        </div>

                        {/* Free text content */}
                        {selCell.type === 'text' && (
                          <div>
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Text</label>
                            <input
                              type="text"
                              value={selCell.text ?? ''}
                              onChange={(e) => setCell(sel, { text: e.target.value })}
                              className={inputCls} style={inputSty}
                            />
                          </div>
                        )}

                        {/* Image URL / base64 */}
                        {selCell.type === 'image' && (
                          <>
                            <div>
                              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Bild-URL oder Base64</label>
                              <input
                                type="text"
                                value={selCell.imageUrl ?? ''}
                                onChange={(e) => setCell(sel, { imageUrl: e.target.value || undefined })}
                                placeholder="https://… oder data:image/png;base64,…"
                                className={inputCls} style={inputSty}
                              />
                              <p className="text-[10px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                                Tipp: Auch Base64-kodierte Bilder werden unterstützt — z.&nbsp;B. kleine Icons oder Logos ohne externen Server.
                              </p>
                            </div>
                            <div>
                              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Darstellung</label>
                              <div className="flex gap-1">
                                {(['contain', 'cover', 'fill'] as const).map((fit) => {
                                  const active = (selCell.objectFit ?? 'contain') === fit;
                                  return (
                                    <button key={fit} onClick={() => setCell(sel, { objectFit: fit === 'contain' ? undefined : fit })}
                                      className="flex-1 text-[10px] py-1 rounded"
                                      style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                                      {fit === 'contain' ? 'Einpassen' : fit === 'cover' ? 'Ausfüllen' : 'Strecken'}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        )}

                        {/* Widget field key (for 'field' type) */}
                        {selCell.type === 'field' && (() => {
                          const FIELD_OPTIONS: Record<string, { key: string; label: string }[]> = {
                            calendar: [
                              { key: 'summary',  label: 'Terminname' },
                              { key: 'date',     label: 'Datum / Zeit' },
                              { key: 'time',     label: 'Uhrzeit' },
                              { key: 'calname',  label: 'Kalendername' },
                              { key: 'location', label: 'Ort' },
                              { key: 'count',    label: 'Anzahl Termine' },
                            ],
                            clock: [
                              { key: 'time',   label: 'Uhrzeit' },
                              { key: 'date',   label: 'Datum' },
                              { key: 'custom', label: 'Benutzerdefiniert' },
                            ],
                            value: [
                              { key: 'unit',    label: 'Einheit' },
                              { key: 'battery', label: 'Batterie' },
                              { key: 'reach',   label: 'Erreichbarkeit' },
                            ],
                            switch: [
                              { key: 'battery', label: 'Batterie' },
                              { key: 'reach',   label: 'Erreichbarkeit' },
                            ],
                            thermostat: [
                              { key: 'setpoint', label: 'Solltemperatur' },
                              { key: 'actual',   label: 'Isttemperatur' },
                              { key: 'status',   label: 'Heizstatus' },
                              { key: 'battery',  label: 'Batterie' },
                              { key: 'reach',    label: 'Erreichbarkeit' },
                            ],
                            shutter: [
                              { key: 'position', label: 'Position (%)' },
                              { key: 'status',   label: 'Status' },
                              { key: 'moving',   label: 'Fährt' },
                              { key: 'battery',  label: 'Batterie' },
                              { key: 'reach',    label: 'Erreichbarkeit' },
                            ],
                            dimmer: [
                              { key: 'level',   label: 'Helligkeit (%)' },
                              { key: 'status',  label: 'Status' },
                              { key: 'on',      label: 'Ein/Aus' },
                              { key: 'battery', label: 'Batterie' },
                              { key: 'reach',   label: 'Erreichbarkeit' },
                            ],
                            gauge: [
                              { key: 'value',   label: 'Wert' },
                              { key: 'unit',    label: 'Einheit' },
                              { key: 'percent', label: 'Prozent' },
                              { key: 'min',     label: 'Minimum' },
                              { key: 'max',     label: 'Maximum' },
                            ],
                            echart: [
                              { key: 'current', label: 'Aktueller Wert' },
                              { key: 'unit',    label: 'Einheit' },
                            ],
                            windowcontact: [
                              { key: 'label',   label: 'Status-Text' },
                              { key: 'open',    label: 'Geöffnet' },
                              { key: 'tilted',  label: 'Gekippt' },
                              { key: 'closed',  label: 'Geschlossen' },
                              { key: 'lock',    label: 'Schloss' },
                              { key: 'battery', label: 'Batterie' },
                              { key: 'reach',   label: 'Erreichbarkeit' },
                            ],
                            binarysensor: [
                              { key: 'label',    label: 'Status-Text' },
                              { key: 'active',   label: 'Aktiv' },
                              { key: 'labelOn',  label: 'Text aktiv' },
                              { key: 'labelOff', label: 'Text inaktiv' },
                              { key: 'battery',  label: 'Batterie' },
                              { key: 'reach',    label: 'Erreichbarkeit' },
                            ],
                            stateimage: [
                              { key: 'label',   label: 'Status-Text' },
                              { key: 'battery', label: 'Batterie' },
                              { key: 'reach',   label: 'Erreichbarkeit' },
                            ],
                            evcc: [
                              { key: 'pvPower',      label: 'Solar (kW)' },
                              { key: 'homePower',    label: 'Verbrauch (kW)' },
                              { key: 'gridPower',    label: 'Netz (kW)' },
                              { key: 'gridImport',   label: 'Netzbezug' },
                              { key: 'gridExport',   label: 'Netzeinspeisung' },
                              { key: 'batterySoc',   label: 'Batterie (%)' },
                              { key: 'batteryPower', label: 'Batterie-Leistung' },
                            ],
                            image: [
                              { key: 'url', label: 'Bild-URL' },
                              { key: 'dp',  label: 'Datenpunkt-ID' },
                            ],
                            weather: [
                              { key: 'temp',      label: 'Temperatur' },
                              { key: 'feelsLike', label: 'Gefühlte Temp.' },
                              { key: 'humidity',  label: 'Luftfeuchtigkeit' },
                              { key: 'wind',      label: 'Wind' },
                              { key: 'condition', label: 'Wetterlage' },
                              { key: 'emoji',     label: 'Wetter-Emoji' },
                            ],
                          };
                          const options = FIELD_OPTIONS[config.type] ?? [];
                          return (
                            <div>
                              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Widget-Feld</label>
                              {options.length > 0 ? (
                                <select
                                  value={selCell.fieldKey ?? ''}
                                  onChange={(e) => setCell(sel, { fieldKey: e.target.value })}
                                  className={inputCls} style={inputSty}
                                >
                                  <option value="">– Feld wählen –</option>
                                  {options.map(({ key, label }) => (
                                    <option key={key} value={key}>{label}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={selCell.fieldKey ?? ''}
                                  onChange={(e) => setCell(sel, { fieldKey: e.target.value })}
                                  placeholder="z.B. summary"
                                  className={inputCls} style={inputSty}
                                />
                              )}
                            </div>
                          );
                        })()}

                        {/* Component key selector */}
                        {selCell.type === 'component' && (() => {
                          const options = COMPONENT_OPTIONS[config.type] ?? [];
                          return (
                            <div>
                              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Aktion / Icon</label>
                              <select
                                value={selCell.componentKey ?? ''}
                                onChange={(e) => setCell(sel, { componentKey: e.target.value })}
                                className={inputCls} style={inputSty}
                              >
                                <option value="">– wählen –</option>
                                {options.map(({ key, label }) => (
                                  <option key={key} value={key}>{label}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })()}

                        {/* Additional DP selector */}
                        {selCell.type === 'dp' && (
                          <div>
                            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Datenpunkt</label>
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={selCell.dpId ?? ''}
                                onChange={(e) => setCell(sel, { dpId: e.target.value })}
                                placeholder="z.B. hm-rpc.0.ABC.TEMP"
                                className="flex-1 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                                style={inputSty}
                              />
                              <button
                                onClick={() => setCustomCellPickerOpen(true)}
                                className="text-xs px-2 py-1.5 rounded-lg shrink-0"
                                style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
                              >
                                <Database size={12} />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Prefix / Suffix for value or dp */}
                        {(selCell.type === 'value' || selCell.type === 'dp') && (
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Prefix</label>
                              <input
                                type="text"
                                value={selCell.prefix ?? ''}
                                onChange={(e) => setCell(sel, { prefix: e.target.value || undefined })}
                                placeholder="z.B. ~"
                                className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                                style={inputSty}
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Suffix</label>
                              <input
                                type="text"
                                value={selCell.suffix ?? ''}
                                onChange={(e) => setCell(sel, { suffix: e.target.value || undefined })}
                                placeholder="z.B. °C"
                                className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                                style={inputSty}
                              />
                            </div>
                          </div>
                        )}

                        {/* Alignment for component cells */}
                        {selCell.type === 'component' && (
                          <>
                            <div>
                              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Ausrichtung</label>
                              <div className="flex gap-1">
                                {(['left', 'center', 'right'] as const).map((a) => {
                                  const active = (selCell.align ?? 'center') === a;
                                  return (
                                    <button key={a} onClick={() => setCell(sel, { align: a })}
                                      className="flex-1 text-[10px] py-1 rounded"
                                      style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                                      {a === 'left' ? 'Links' : a === 'center' ? 'Mitte' : 'Rechts'}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Vertikale Ausrichtung</label>
                              <div className="flex gap-1">
                                {(['top', 'middle', 'bottom'] as const).map((v) => {
                                  const active = (selCell.valign ?? 'middle') === v;
                                  return (
                                    <button key={v} onClick={() => setCell(sel, { valign: v })}
                                      className="flex-1 text-[10px] py-1 rounded"
                                      style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                                      {v === 'top' ? 'Oben' : v === 'middle' ? 'Mitte' : 'Unten'}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Überlauf</label>
                              <div className="flex gap-1">
                                {([false, true] as const).map((v) => {
                                  const active = (selCell.allowOverflow ?? false) === v;
                                  return (
                                    <button key={String(v)} onClick={() => setCell(sel, { allowOverflow: v || undefined })}
                                      className="flex-1 text-[10px] py-1 rounded"
                                      style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                                      {v ? 'Überlaufen' : 'Abschneiden'}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        )}

                        {selCell.type !== 'empty' && selCell.type !== 'component' && (
                          <>
                            {/* Font size */}
                            <div className="flex items-center gap-2">
                              <label className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>Schriftgröße</label>
                              <input
                                type="number"
                                min={8} max={96} step={1}
                                value={selCell.fontSize ?? ''}
                                onChange={(e) => setCell(sel, { fontSize: e.target.value ? Number(e.target.value) : undefined })}
                                placeholder="auto"
                                className="w-16 text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                                style={inputSty}
                              />
                              <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>px</span>
                            </div>

                            {/* Bold / Italic */}
                            <div className="flex items-center gap-4">
                              {([{ key: 'bold', label: 'Fett' }, { key: 'italic', label: 'Kursiv' }] as const).map(({ key, label }) => {
                                const val = !!(selCell as unknown as Record<string, unknown>)[key];
                                return (
                                  <div key={key} className="flex items-center gap-2">
                                    <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{label}</span>
                                    <button
                                      onClick={() => setCell(sel, { [key]: !val } as Partial<CustomCell>)}
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

                            {/* Color */}
                            <div className="flex items-center gap-2">
                              <label className="text-[11px] shrink-0" style={{ color: 'var(--text-secondary)' }}>Farbe</label>
                              <input
                                type="color"
                                value={selCell.color && selCell.color.startsWith('#') ? selCell.color : '#ffffff'}
                                onChange={(e) => setCell(sel, { color: e.target.value })}
                                className="w-8 h-7 rounded cursor-pointer border-0 p-0"
                                style={{ background: 'none' }}
                              />
                              <button
                                onClick={() => setCell(sel, { color: '' })}
                                className="text-[10px] px-2 py-0.5 rounded"
                                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                              >
                                Theme
                              </button>
                            </div>

                            {/* Horizontal align */}
                            <div>
                              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Ausrichtung</label>
                              <div className="flex gap-1">
                                {(['left', 'center', 'right'] as const).map((a) => {
                                  const active = (selCell.align ?? 'left') === a;
                                  return (
                                    <button key={a} onClick={() => setCell(sel, { align: a })}
                                      className="flex-1 text-[10px] py-1 rounded"
                                      style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                                      {a === 'left' ? 'Links' : a === 'center' ? 'Mitte' : 'Rechts'}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Vertical align */}
                            <div>
                              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Vertikale Ausrichtung</label>
                              <div className="flex gap-1">
                                {(['top', 'middle', 'bottom'] as const).map((v) => {
                                  const active = (selCell.valign ?? 'middle') === v;
                                  return (
                                    <button key={v} onClick={() => setCell(sel, { valign: v })}
                                      className="flex-1 text-[10px] py-1 rounded"
                                      style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                                      {v === 'top' ? 'Oben' : v === 'middle' ? 'Mitte' : 'Unten'}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Text overflow */}
                            <div>
                              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Text-Überlauf</label>
                              <div className="flex gap-1">
                                {([false, true] as const).map((v) => {
                                  const active = (selCell.allowOverflow ?? false) === v;
                                  return (
                                    <button key={String(v)} onClick={() => setCell(sel, { allowOverflow: v || undefined })}
                                      className="flex-1 text-[10px] py-1 rounded"
                                      style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', color: active ? '#fff' : 'var(--text-secondary)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}>
                                      {v ? 'Überlaufen' : 'Abschneiden'}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        )}
                      </>) : (
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.45 }}>
                          Zelle auswählen, um sie zu konfigurieren …
                        </p>
                      )}
                    </div>

                    {/* Reset grid */}
                    <button
                      onClick={() => { onConfigChange({ ...config, options: { ...o, customGrid: undefined } }); setSelectedCustomCell(null); }}
                      className="text-[10px] px-2 py-1 rounded"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                    >
                      Raster zurücksetzen
                    </button>
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
              {(config.type === 'value' || config.type === 'dimmer' || config.type === 'shutter' || config.type === 'thermostat') && (() => {
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
            pickerTarget === 'gauge_pointer2Dp'         ? ((config.options?.pointer2Datapoint as string) ?? '') :
            pickerTarget === 'gauge_pointer3Dp'         ? ((config.options?.pointer3Datapoint as string) ?? '') :
            pickerTarget === 'windowcontact_batteryDp'  ? ((config.options?.batteryDp  as string) ?? '') :
            pickerTarget === 'wc_lockDp'                ? ((config.options?.lockDp      as string) ?? '') :
            pickerTarget === 'status_batteryDp'         ? ((config.options?.batteryDp  as string) ?? '') :
            pickerTarget === 'status_unreachDp'         ? ((config.options?.unreachDp  as string) ?? '') :
            pickerTarget === 'camera_wakeUpDp'          ? ((config.options?.wakeUpDp   as string) ?? '') :
            pickerTarget === 'html_dp'                  ? ((config.options?.htmlDatapoint as string) ?? '') :
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
              const typePatch = detected ? { type: detected.type } : {};
              const effectiveType = detected?.type ?? config.type;
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
                  // → find primary sibling (e.g. SET_TEMPERATURE) and upgrade widget type
                  const upgrade = findMainDpForSecondary(id, entries);
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
            } else if (pickerTarget === 'localTempDatapoint') {
              onConfigChange({ ...config, options: { ...config.options, localTempDatapoint: id } });
            } else if (pickerTarget === 'shutter_activityDp') {
              onConfigChange({ ...config, options: { ...config.options, activityDp: id } });
            } else if (pickerTarget === 'shutter_directionDp') {
              onConfigChange({ ...config, options: { ...config.options, directionDp: id } });
            } else if (pickerTarget === 'shutter_stopDp') {
              onConfigChange({ ...config, options: { ...config.options, stopDp: id } });
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
            } else if (pickerTarget === 'html_dp') {
              onConfigChange({ ...config, options: { ...config.options, htmlDatapoint: id } });
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

      {/* Custom-Grid DP picker */}
      {customCellPickerOpen && selectedCustomCell !== null && (() => {
        const cells: CustomGrid = ((config.options?.customGrid as CustomGrid | undefined) ?? DEFAULT_CUSTOM_GRID);
        const idx = selectedCustomCell;
        return (
          <DatapointPicker
            currentValue={cells[idx]?.dpId ?? ''}
            onSelect={(id) => {
              const next = cells.map((c, i) => i === idx ? { ...c, dpId: id } : c);
              onConfigChange({ ...config, options: { ...config.options, customGrid: next } });
              setCustomCellPickerOpen(false);
            }}
            onClose={() => setCustomCellPickerOpen(false)}
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
