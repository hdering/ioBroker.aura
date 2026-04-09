import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { LayoutGrid, X, Palette, Pencil, Database, Sparkles, EyeOff, ChevronDown, Plus, Trash2 } from 'lucide-react';
import type { WidgetConfig, WidgetLayout, WidgetCondition } from '../../types';
import { DatapointPicker } from '../config/DatapointPicker';
import { ConditionEditor } from '../config/ConditionEditor';
import { getObjectDirect } from '../../hooks/useIoBroker';
import { WIDGET_REGISTRY } from '../../widgetRegistry';
import { AutoListConfig } from '../config/AutoListConfig';
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
  } as const;
}

const LAYOUTS: { id: WidgetLayout; label: string }[] = [
  { id: 'default', label: 'Standard' },
  { id: 'card', label: 'Karte' },
  { id: 'compact', label: 'Kompakt' },
  { id: 'minimal', label: 'Minimal' },
];
const CALENDAR_LAYOUTS: { id: WidgetLayout; label: string }[] = [
  ...LAYOUTS,
  { id: 'agenda', label: 'Agenda' },
];

// ── CalendarEditPanel ──────────────────────────────────────────────────────

const REFRESH_OPTIONS = [
  { label: '5 Min', value: 5 }, { label: '15 Min', value: 15 }, { label: '30 Min', value: 30 },
  { label: '1 Std', value: 60 }, { label: '6 Std', value: 360 }, { label: '24 Std', value: 1440 },
];
const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

function CalendarEditPanel({ config, onConfigChange }: { config: WidgetConfig; onConfigChange: (c: WidgetConfig) => void }) {
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
                title="Farbe ändern"
              />
              <input
                type="text"
                value={src.name}
                onChange={(e) => updateSource(src.id, { name: e.target.value })}
                className="flex-1 text-xs rounded px-2 py-1 focus:outline-none min-w-0"
                style={inputStyle}
                placeholder="Kalender-Name"
              />
              <button
                onClick={() => updateSource(src.id, { showName: !src.showName })}
                className="relative w-7 h-4 rounded-full transition-colors shrink-0"
                style={{ background: src.showName ? src.color : 'var(--app-border)' }}
                title="Name anzeigen"
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
            placeholder="iCal-URL…"
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
              placeholder="Name (optional)"
              className={inputCls}
              style={inputStyle}
            />
          </div>
          <div className="flex gap-1.5">
            <button onClick={confirmAdd} disabled={!newUrl.trim()}
              className="flex-1 py-1.5 text-xs rounded-lg text-white hover:opacity-80 disabled:opacity-30"
              style={{ background: 'var(--accent)' }}>
              Hinzufügen
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
          <Plus size={12} /> Kalender hinzufügen
        </button>
      )}

      {/* separator */}
      <div className="h-px" style={{ background: 'var(--app-border)' }} />

      {/* global settings */}
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Aktualisierungsintervall</label>
        <select value={(o.refreshInterval as number) ?? 30} onChange={(e) => setOpts({ refreshInterval: Number(e.target.value) })}
          className={inputCls} style={inputStyle}>
          {REFRESH_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Tage im Voraus</label>
        <input type="number" min={1} max={365} value={(o.daysAhead as number) ?? 14}
          onChange={(e) => setOpts({ daysAhead: Number(e.target.value) })} className={inputCls} style={inputStyle} />
      </div>
      <div>
        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Max. Einträge</label>
        <input type="number" min={1} max={20} value={(o.maxEvents as number) ?? 5}
          onChange={(e) => setOpts({ maxEvents: Number(e.target.value) })} className={inputCls} style={inputStyle} />
      </div>
    </>
  );
}

const STYLE_FIELDS: { key: string; label: string; type: 'color' | 'text' }[] = [
  { key: 'bg', label: 'Hintergrund', type: 'color' },
  { key: 'accent', label: 'Akzentfarbe', type: 'color' },
  { key: 'textPrimary', label: 'Text', type: 'color' },
  { key: 'textSecondary', label: 'Text sekundär', type: 'color' },
  { key: 'radius', label: 'Eckenradius', type: 'text' },
];

// ── ChartHistoryConfig ────────────────────────────────────────────────────────
const CHART_RANGES: ChartTimeRange[] = ['1h', '6h', '24h', '7d', '30d'];

function ChartHistoryConfig({ config, onConfigChange }: { config: WidgetConfig; onConfigChange: (c: WidgetConfig) => void }) {
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
      <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>Verlaufsdaten</p>

      {/* Adapter-Auswahl */}
      {checking && (
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Prüfe Adapter…</p>
      )}
      {!checking && adapters.length === 0 && (
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
          Kein History-Adapter aktiv für diesen Datenpunkt.
        </p>
      )}
      {!checking && adapters.length > 0 && (
        <div>
          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Adapter-Instanz</label>
          <select
            value={selectedInstance ?? ''}
            onChange={(e) => set({ historyInstance: e.target.value || undefined })}
            className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
            style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
          >
            <option value="">– Live-Daten (kein Verlauf) –</option>
            {adapters.map((a) => (
              <option key={a.instance} value={a.instance}>{a.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Zeitraum */}
      {selectedInstance && (
        <div>
          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Zeitraum</label>
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
    document.body,
  );
}

export function WidgetFrame({ config, editMode, onRemove, onConfigChange }: WidgetFrameProps) {
  const [openPanel, setOpenPanel] = useState<'menu' | 'layout' | 'style' | 'edit' | 'conditions' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      releasePanel(config.id);
    } else {
      claimPanel(config.id, () => setOpenPanel(null));
      setOpenPanel(panel);
    }
  };
  const [pickerTarget, setPickerTarget] = useState<'datapoint' | 'actualDatapoint' | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const Widget = getWidgetMap()[config.type];
  const currentLayout = config.layout ?? 'default';
  const overrides = config.options?.styleOverride as Record<string, string> | undefined;

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

  const isHeader = config.type === 'header';
  const isGroup  = config.type === 'group';

  return (
    <div
      style={isHeader ? {
        background: 'transparent',
        borderRadius: 0,
        boxShadow: 'none',
        borderWidth: 0,
        ...cssOverride,
        // non-reflow hide: keep space but invisible
        ...(!editMode && conditionResult.hidden && !conditionResult.reflow
          ? { visibility: 'hidden', pointerEvents: 'none' } : {}),
      } : {
        background: 'var(--widget-bg)',
        borderRadius: 'var(--widget-radius)',
        boxShadow: 'var(--widget-shadow)',
        borderWidth: 'var(--widget-border-width)',
        borderStyle: 'solid',
        borderColor: 'var(--widget-border)',
        ...cssOverride,
        ...(!editMode && conditionResult.hidden && !conditionResult.reflow
          ? { visibility: 'hidden', pointerEvents: 'none' } : {}),
      }}
      className={`relative h-full transition-all overflow-visible ${isHeader ? 'px-2 py-0' : isGroup ? 'p-0' : 'p-4'} ${editMode ? 'ring-2 ring-accent/40 rounded-xl' : ''} ${!editMode && conditionResult.effect === 'pulse' ? 'animate-pulse' : ''} ${!editMode && conditionResult.effect === 'blink' ? 'animate-[blink_1s_step-end_infinite]' : ''}`}
    >
      {editMode && conditionResult.hidden && (
        <div className="nodrag absolute inset-0 z-20 rounded-[inherit] flex items-start justify-end pointer-events-none p-1.5">
          <div className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium opacity-70"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
            <EyeOff size={11} />
            Versteckt
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
            title="Widget-Optionen"
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

      <Widget config={config} editMode={editMode} onConfigChange={onConfigChange} />

      {/* Options Menu Dropdown */}
      {openPanel === 'menu' && menuBtnRef.current && (
        <PortalDropdown anchorRef={menuBtnRef as React.RefObject<HTMLElement>} onClose={() => openPanelFor(null)}>
          <div className="p-1 flex flex-col gap-0.5 min-w-[170px]" onMouseLeave={() => openPanelFor(null)}>
            {/* Bearbeiten */}
            <button
              onClick={() => { openPanelFor('edit'); setConfirmDelete(false); }}
              className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
            >
              <Pencil size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              Bearbeiten
            </button>

            {/* Layout */}
            {!isGroup && (
              <button
                onClick={() => { openPanelFor('layout'); setConfirmDelete(false); }}
                className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity"
                style={{ color: 'var(--text-primary)' }}
              >
                <LayoutGrid size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                Layout
                {currentLayout !== 'default' && (
                  <span className="ml-auto text-[11px] capitalize" style={{ color: 'var(--accent)' }}>{currentLayout}</span>
                )}
              </button>
            )}

            {/* Stil */}
            <button
              onClick={() => { openPanelFor('style'); setConfirmDelete(false); }}
              className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
            >
              <Palette size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              Stil
              {overrides && Object.keys(overrides).length > 0 && (
                <span className="ml-auto text-[11px]" style={{ color: 'var(--accent)' }}>angepasst</span>
              )}
            </button>

            {/* Bedingungen */}
            <button
              onClick={() => { openPanelFor('conditions'); setConfirmDelete(false); }}
              className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-md text-left hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
            >
              <Sparkles size={13} style={{ color: conditions.length > 0 ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }} />
              Bedingungen
              {conditions.length > 0 && (
                <span className="ml-auto text-[11px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent)22', color: 'var(--accent)' }}>
                  {conditions.length}
                </span>
              )}
            </button>

            <div className="h-px my-0.5 mx-1" style={{ background: 'var(--app-border)' }} />

            {/* Löschen */}
            {confirmDelete ? (
              <div className="flex gap-1 px-1 pb-1">
                <button
                  onClick={() => onRemove(config.id)}
                  className="flex-1 text-xs py-1.5 rounded-md text-white hover:opacity-80"
                  style={{ background: 'var(--accent-red)' }}
                >
                  Bestätigen
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
                Löschen
              </button>
            )}
          </div>
        </PortalDropdown>
      )}

      {/* Layout Dropdown Portal */}
      {openPanel === 'layout' && menuBtnRef.current && (
        <PortalDropdown anchorRef={menuBtnRef as React.RefObject<HTMLElement>} onClose={() => openPanelFor(null)}>
          <div className="p-1.5 flex flex-col gap-0.5 min-w-[120px]">
            {(config.type === 'calendar' ? CALENDAR_LAYOUTS : LAYOUTS).map((l) => (
              <button key={l.id}
                onClick={() => { onConfigChange({ ...config, layout: l.id }); openPanelFor(null); }}
                className="px-3 py-2 text-sm text-left rounded-md transition-opacity hover:opacity-80 flex items-center justify-between gap-4"
                style={{ background: currentLayout === l.id ? 'var(--accent)22' : 'transparent', color: currentLayout === l.id ? 'var(--accent)' : 'var(--text-primary)' }}
              >
                {l.label}
                {currentLayout === l.id && <span>✓</span>}
              </button>
            ))}
            {/* Position-Picker (nur für Standard-Layout) */}
            {currentLayout === 'default' && (() => {
              const POSITIONS = ['tl','tc','tr','cl','cc','cr','bl','bc','br'] as const;
              const currentContentPos = config.options?.contentPosition as string | undefined;
              const currentTitlePos = config.options?.titlePosition as string | undefined;

              function PositionGrid({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
                return (
                  <div className="grid grid-cols-3 gap-1 px-2 pb-2">
                    {POSITIONS.map((pos) => {
                      const active = value === pos;
                      return (
                        <button key={pos}
                          onClick={(e) => { e.stopPropagation(); onChange(active ? undefined : pos); }}
                          className="w-6 h-6 rounded transition-opacity hover:opacity-80"
                          style={{ background: active ? 'var(--accent)' : 'var(--app-bg)', border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}` }}
                          title={pos}
                        />
                      );
                    })}
                  </div>
                );
              }

              return (
                <>
                  <div className="h-px my-1 mx-1" style={{ background: 'var(--app-border)' }} />
                  <p className="px-3 text-[11px] pb-1" style={{ color: 'var(--text-secondary)' }}>Inhalt-Position</p>
                  <PositionGrid
                    value={currentContentPos}
                    onChange={(v) => onConfigChange({ ...config, options: { ...config.options, contentPosition: v } })}
                  />
                  <div className="h-px my-1 mx-1" style={{ background: 'var(--app-border)' }} />
                  <p className="px-3 text-[11px] pb-1" style={{ color: 'var(--text-secondary)' }}>Titel-Position</p>
                  <PositionGrid
                    value={currentTitlePos}
                    onChange={(v) => onConfigChange({ ...config, options: { ...config.options, titlePosition: v } })}
                  />
                </>
              );
            })()}
          </div>
        </PortalDropdown>
      )}

      {/* Edit Dropdown Portal */}
      {openPanel === 'edit' && menuBtnRef.current && (
        <PortalDropdown anchorRef={menuBtnRef as React.RefObject<HTMLElement>} onClose={() => openPanelFor(null)}>
          <div className={`p-3 ${config.type === 'calendar' ? 'w-80' : config.type === 'thermostat' ? 'w-72' : config.type === 'echart' ? 'w-[560px]' : config.type === 'evcc' ? 'w-80' : config.type === 'autolist' ? 'w-[600px]' : config.type === 'gauge' || config.type === 'weather' || config.type === 'camera' ? 'w-72' : 'w-64'}`} onMouseDown={(e) => e.stopPropagation()}>
            <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Widget bearbeiten</p>
            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Widget-Typ</label>
                <select
                  value={config.type}
                  onChange={(e) => onConfigChange({ ...config, type: e.target.value as WidgetConfig['type'] })}
                  className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                >
                  {WIDGET_REGISTRY.map((m) => (
                    <option key={m.type} value={m.type}>{m.label}</option>
                  ))}
                </select>
              </div>

              {/* Header-spezifische Felder */}
              {config.type === 'header' && (() => {
                const o = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                return (
                  <>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Untertitel (optional)</label>
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
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Stil</label>
                      <select
                        value={config.layout ?? 'default'}
                        onChange={(e) => onConfigChange({ ...config, layout: e.target.value as WidgetConfig['layout'] })}
                        className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                        style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                      >
                        <option value="default">Standard (Akzentlinie + Titel)</option>
                        <option value="compact">Kompakt (Linie links)</option>
                        <option value="minimal">Minimal (Trennlinie + Text)</option>
                      </select>
                    </div>
                  </>
                );
              })()}
              <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Name</label>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) => onConfigChange({ ...config, title: e.target.value })}
                  className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                />
              </div>
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
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Anzeige</label>
                      <select value={display} onChange={(e) => set({ display: e.target.value })} className={inputCls} style={inputStyle}>
                        <option value="time">Nur Uhrzeit</option>
                        <option value="datetime">Uhrzeit + Datum</option>
                        <option value="date">Nur Datum</option>
                      </select>
                    </div>
                    {display !== 'date' && (
                      <div className="flex items-center justify-between">
                        <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Sekunden anzeigen</label>
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
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Datumsformat</label>
                        <select value={(o.dateLength as string) ?? 'short'} onChange={(e) => set({ dateLength: e.target.value })} className={inputCls} style={inputStyle}>
                          <option value="short">Kurz (07.04.2026)</option>
                          <option value="long">Lang (Montag, 7. April 2026)</option>
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Eigenes Format</label>
                      <input
                        type="text"
                        value={(o.customFormat as string) ?? ''}
                        onChange={(e) => set({ customFormat: e.target.value || undefined })}
                        placeholder="z.B. dd.MM.yyyy HH:mm"
                        className={inputCls + ' font-mono'}
                        style={inputStyle}
                      />
                      <p className="text-[10px] mt-1 leading-tight" style={{ color: 'var(--text-secondary)' }}>
                        Tokens: HH mm ss dd MM yyyy EEEE MMMM
                      </p>
                    </div>
                  </>
                );
              })()}

              {config.type === 'calendar' && (
                <CalendarEditPanel config={config} onConfigChange={onConfigChange} />
              )}

              {config.type !== 'list' && config.type !== 'clock' && config.type !== 'calendar' && config.type !== 'header' && config.type !== 'group' && config.type !== 'evcc' && config.type !== 'echart' && config.type !== 'weather' && config.type !== 'camera' && config.type !== 'autolist' && (
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Datenpunkt-ID</label>
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
                      title="Aus ioBroker wählen"
                    >
                      <Database size={13} />
                    </button>
                  </div>
                </div>
              )}
              {(config.type === 'value' || config.type === 'chart') && (
                <div>
                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Einheit</label>
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
                return (
                  <>
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
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Einheit</label>
                      <input type="text" value={(o.unit as string) ?? ''} onChange={(e) => set({ unit: e.target.value || undefined })} placeholder="z.B. °C, %, W" className={gCls} style={gSty} />
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Dezimalstellen</label>
                      <input type="number" min={0} max={4} value={(o.decimals as number) ?? 1} onChange={(e) => set({ decimals: Number(e.target.value) })} className={gCls} style={gSty} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Farbzonen</label>
                      <button onClick={() => set({ colorZones: !colorZones })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: colorZones ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: colorZones ? '18px' : '2px' }} />
                      </button>
                    </div>
                    {colorZones && (
                      <>
                        <div>
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Grün bis</label>
                          <input type="number" value={(o.greenMax as number) ?? min + range * 0.33}
                            onChange={(e) => set({ greenMax: Number(e.target.value) })} className={gCls} style={gSty} />
                        </div>
                        <div>
                          <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Gelb bis</label>
                          <input type="number" value={(o.yellowMax as number) ?? min + range * 0.66}
                            onChange={(e) => set({ yellowMax: Number(e.target.value) })} className={gCls} style={gSty} />
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Min/Max anzeigen</label>
                      <button onClick={() => set({ showMinMax: !(o.showMinMax ?? true) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (o.showMinMax ?? true) ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.showMinMax ?? true) ? '18px' : '2px' }} />
                      </button>
                    </div>
                  </>
                );
              })()}

              {/* ── Weather config ── */}
              {config.type === 'weather' && (() => {
                const o   = config.options ?? {};
                const set = (patch: Record<string, unknown>) =>
                  onConfigChange({ ...config, options: { ...o, ...patch } });
                const wCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
                const wSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };
                return (
                  <>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Breitengrad</label>
                        <input type="number" step={0.01} value={(o.latitude as number) ?? 48.1} onChange={(e) => set({ latitude: Number(e.target.value) })} className={wCls} style={wSty} />
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Längengrad</label>
                        <input type="number" step={0.01} value={(o.longitude as number) ?? 11.6} onChange={(e) => set({ longitude: Number(e.target.value) })} className={wCls} style={wSty} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Standortname</label>
                      <input type="text" value={(o.locationName as string) ?? ''} onChange={(e) => set({ locationName: e.target.value || undefined })} placeholder="z.B. München" className={wCls} style={wSty} />
                    </div>
                    <div>
                      <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Aktualisierung (Min.)</label>
                      <input type="number" min={5} max={1440} value={(o.refreshMinutes as number) ?? 30} onChange={(e) => set({ refreshMinutes: Number(e.target.value) })} className={wCls} style={wSty} />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Vorhersage anzeigen</label>
                      <button onClick={() => set({ showForecast: !(o.showForecast ?? true) })}
                        className="relative w-9 h-5 rounded-full transition-colors"
                        style={{ background: (o.showForecast ?? true) ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: (o.showForecast ?? true) ? '18px' : '2px' }} />
                      </button>
                    </div>
                  </>
                );
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
              {/* ── AutoList config ── */}
              {config.type === 'autolist' && (
                <AutoListConfig config={config} onConfigChange={onConfigChange} />
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
          </div>
        </PortalDropdown>
      )}

      {/* Datapoint Picker Modal */}
      {pickerTarget && (
        <DatapointPicker
          currentValue={pickerTarget === 'datapoint' ? config.datapoint : ((config.options?.actualDatapoint as string) ?? '')}
          onSelect={(id) => {
            if (pickerTarget === 'datapoint') {
              onConfigChange({ ...config, datapoint: id });
            } else {
              onConfigChange({ ...config, options: { ...config.options, actualDatapoint: id } });
            }
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}

      {/* Style Dropdown Portal */}
      {openPanel === 'style' && menuBtnRef.current && (
        <PortalDropdown anchorRef={menuBtnRef as React.RefObject<HTMLElement>} onClose={() => openPanelFor(null)}>
          <div className="p-3 w-72" onMouseDown={(e) => e.stopPropagation()}>
            <p className="text-xs font-semibold mb-2.5" style={{ color: 'var(--text-primary)' }}>Widget-Stil</p>
            <div className="space-y-2">
              {STYLE_FIELDS.map(({ key, label, type }) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="text-xs w-24 shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</label>
                  {type === 'color' ? (
                    <div className="flex gap-1 flex-1">
                      <input type="color" value={overrides?.[key] ?? '#3b82f6'}
                        onChange={(e) => onConfigChange({ ...config, options: { ...config.options, styleOverride: { ...overrides, [key]: e.target.value } } })}
                        className="w-7 h-6 rounded cursor-pointer border-0 p-0 shrink-0" />
                      <input type="text" value={overrides?.[key] ?? ''}
                        onChange={(e) => { const val = e.target.value; const next = { ...overrides, [key]: val }; if (!val) delete next[key]; onConfigChange({ ...config, options: { ...config.options, styleOverride: Object.keys(next).length ? next : undefined } }); }}
                        placeholder="auto"
                        className="flex-1 text-xs rounded px-1.5 py-1 min-w-0 focus:outline-none"
                        style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
                    </div>
                  ) : (
                    <input type="text" value={overrides?.[key] ?? ''}
                      onChange={(e) => { const val = e.target.value; const next = { ...overrides, [key]: val }; if (!val) delete next[key]; onConfigChange({ ...config, options: { ...config.options, styleOverride: Object.keys(next).length ? next : undefined } }); }}
                      placeholder="auto"
                      className="flex-1 text-xs rounded px-1.5 py-1 focus:outline-none"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
                  )}
                </div>
              ))}
            </div>
            {overrides && Object.keys(overrides).length > 0 && (
              <button
                onClick={() => { const { styleOverride: _, ...rest } = config.options ?? {}; onConfigChange({ ...config, options: rest }); }}
                className="w-full mt-3 py-1.5 text-xs rounded-md hover:opacity-80"
                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                Zurücksetzen
              </button>
            )}
          </div>
        </PortalDropdown>
      )}

      {/* Conditions Dropdown Portal */}
      {openPanel === 'conditions' && menuBtnRef.current && (
        <PortalDropdown anchorRef={menuBtnRef as React.RefObject<HTMLElement>} onClose={() => openPanelFor(null)}>
          <ConditionEditor
            conditions={conditions}
            onChange={(next) =>
              onConfigChange({ ...config, options: { ...config.options, conditions: next } })
            }
          />
        </PortalDropdown>
      )}
    </div>
  );
}
