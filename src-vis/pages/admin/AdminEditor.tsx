import { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Edit3, Check, Cpu, PenLine, Database, Wand2, Smartphone, GripVertical, Upload, Settings, X } from 'lucide-react';
import { ImportWidgetDialog } from '../../components/config/ImportWidgetDialog';
import { ICON_PICKER_ENTRIES, WIDGET_ICON_MAP } from '../../utils/widgetIconMap';
import { useDashboardStore } from '../../store/dashboardStore';
import { useGroupStore } from '../../store/groupStore';
import { Dashboard } from '../../components/layout/Dashboard';
import { DeviceWizard } from '../../components/config/DeviceWizard';
import { TabWizard } from '../../components/config/TabWizard';
import { WidgetPreview } from '../../components/config/WidgetPreview';
import { DatapointPicker } from '../../components/config/DatapointPicker';
import type { WidgetConfig, WidgetType, WidgetLayout } from '../../types';
import { WIDGET_REGISTRY, WIDGET_GROUPS, WIDGET_BY_TYPE, getEffectiveSize } from '../../widgetRegistry';
import { useConfigStore } from '../../store/configStore';
import { useT } from '../../i18n';
import { ensureDatapointCache } from '../../hooks/useDatapointList';

// Layout labels are resolved inside components via t() to support i18n
const LAYOUT_IDS: WidgetLayout[] = ['default', 'card', 'compact', 'minimal'];
const CALENDAR_LAYOUT_IDS: WidgetLayout[] = [...LAYOUT_IDS, 'agenda'];

function ManualWidgetDialog({ onAdd, onClose }: { onAdd: (w: WidgetConfig) => void; onClose: () => void }) {
  const t = useT();
  const widgetDefaults = useConfigStore((s) => s.widgetDefaults);
  const LAYOUTS = LAYOUT_IDS.map((id) => ({ id, label: t(`editor.layouts.${id}` as never) }));
  const CALENDAR_LAYOUTS = CALENDAR_LAYOUT_IDS.map((id) => ({ id, label: t(`editor.layouts.${id}` as never) }));
  const [type, setType] = useState<WidgetType>('value');
  const [layout, setLayout] = useState<WidgetLayout>('default');
  const [title, setTitle] = useState('');
  const [datapoint, setDatapoint] = useState('');
  const [groupId, setGroupId] = useState('');
  const [unit, setUnit] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [icalUrl, setIcalUrl] = useState('');
  const [calName, setCalName] = useState('');
  const [calColor, setCalColor] = useState('#3b82f6');
  const { groups } = useGroupStore();

  const def = WIDGET_REGISTRY.find((w) => w.type === type)!;
  const addMode = WIDGET_BY_TYPE[type].addMode;
  const isList = addMode === 'group';
  const isCalendar = type === 'calendar';
  const isEchart = type === 'echart';
  const isEvcc = type === 'evcc';
  const isWeather = type === 'weather';
  const isCamera = type === 'camera';
  const noDatapointNeeded = addMode !== 'datapoint';
  const canAdd = addMode === 'datapoint' ? !!datapoint.trim()
               : addMode === 'group'     ? !!groupId
               : addMode === 'wizard-only' ? !!icalUrl.trim()
               : true;

  const handleAdd = async () => {
    if (!canAdd) return;
    const selectedGroup = isList ? groups.find((g) => g.id === groupId) : undefined;
    const dpId = noDatapointNeeded ? '' : isList ? groupId : datapoint.trim();

    let finalTitle = title.trim();
    let finalUnit = unit.trim();

    if (dpId && (!finalTitle || ((type === 'value' || type === 'chart') && !finalUnit))) {
      try {
        const entries = await ensureDatapointCache();
        const entry = entries.find((e) => e.id === dpId);
        if (entry) {
          if (!finalTitle && entry.name) finalTitle = entry.name;
          if ((type === 'value' || type === 'chart') && !finalUnit && entry.unit) finalUnit = entry.unit;
        }
      } catch { /* ignore */ }
    }

    onAdd({
      id: `w-${Date.now()}`,
      type,
      layout,
      title: finalTitle || (isList && selectedGroup ? selectedGroup.name : def.label),
      datapoint: dpId,
      gridPos: { x: 0, y: 9999, ...getEffectiveSize(type, widgetDefaults) },
      options: {
        icon: def.iconName,
        ...(isCalendar
          ? {
              calendars: [{ id: Date.now().toString(), url: icalUrl.trim(), name: calName.trim() || 'Kalender', color: calColor, showName: true }],
              refreshInterval: 30, daysAhead: 14, maxEvents: 5,
            }
          : isEvcc
            ? { evccPrefix: 'evcc.0', loadpointCount: 1, showBattery: true }
            : isEchart
              ? { echartSeries: [], echartShowLegend: true }
              : isWeather
                ? { latitude: 48.1, longitude: 11.6, locationName: '', refreshMinutes: 30, showForecast: true }
                : isCamera
                  ? { streamUrl: '', refreshInterval: 5, fitMode: 'cover', showTitle: true }
                  : type === 'gauge'
                    ? { minValue: 0, maxValue: 100, unit: '', decimals: 1, showMinMax: true, colorZones: false }
                    : finalUnit ? { unit: finalUnit } : {}),
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="rounded-xl w-full max-w-3xl shadow-2xl p-6"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-lg mb-5" style={{ color: 'var(--text-primary)' }}>{t('editor.manual.title')}</h2>

        <div className="flex gap-5">
          {/* Form */}
          <div className="flex-1 space-y-3.5 min-w-0">
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('editor.manual.type')}</label>
              <select value={type} onChange={(e) => { setType(e.target.value as WidgetType); setGroupId(''); setDatapoint(''); }}
                className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
                {WIDGET_GROUPS.map((g) => (
                  <optgroup key={g.id} label={g.label}>
                    {WIDGET_REGISTRY.filter((w) => w.widgetGroup === g.id).map((w) => (
                      <option key={w.type} value={w.type}>{w.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {isCalendar ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('editor.manual.icalUrl')}</label>
                <input
                  value={icalUrl}
                  onChange={(e) => setIcalUrl(e.target.value)}
                  placeholder="https://calendar.google.com/…"
                  className="w-full rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                />
                <div className="flex gap-2">
                  <input
                    value={calName}
                    onChange={(e) => setCalName(e.target.value)}
                    placeholder={t('editor.manual.calName')}
                    className="flex-1 rounded-xl px-3 py-2.5 text-sm focus:outline-none min-w-0"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                  />
                  <input type="color" value={calColor} onChange={(e) => setCalColor(e.target.value)}
                    className="w-10 h-10 rounded-xl cursor-pointer border-0 p-0.5 shrink-0"
                    style={{ border: '1px solid var(--app-border)' }}
                  />
                </div>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  {t('editor.manual.moreCalendars')}
                </p>
              </div>
            ) : isList ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('editor.manual.group')}</label>
                {groups.length === 0 ? (
                  <p className="text-xs rounded-xl px-3 py-2.5"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                    {t('editor.manual.noGroups')}
                  </p>
                ) : (
                  <select value={groupId} onChange={(e) => setGroupId(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
                    <option value="">{t('editor.manual.selectGroup')}</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name} ({t('endpoints.dp.count', { count: g.datapoints.length })})</option>
                    ))}
                  </select>
                )}
              </div>
            ) : addMode === 'datapoint' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('editor.manual.datapointId')}</label>
                <div className="flex gap-1.5">
                  <input value={datapoint} onChange={(e) => setDatapoint(e.target.value)}
                    placeholder="z.B. hm-rpc.0.ABC123.STATE"
                    className="flex-1 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none min-w-0"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
                  <button
                    type="button"
                    onClick={() => setShowPicker(true)}
                    className="px-3 rounded-xl hover:opacity-80 shrink-0"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                    title={t('wf.edit.fromIoBroker')}
                  >
                    <Database size={15} />
                  </button>
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('editor.manual.titleField')}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder={def.label}
                className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
            </div>

            {(type === 'value' || type === 'chart') && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('editor.manual.unit')}</label>
                <input value={unit} onChange={(e) => setUnit(e.target.value)}
                  placeholder="z.B. °C, %, W"
                  className="w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }} />
              </div>
            )}
          </div>

          {/* Preview + Layout picker */}
          <div className="flex flex-col gap-3 items-center shrink-0">
            <WidgetPreview type={type} layout={layout} title={title} />
            <div className="grid grid-cols-2 gap-1.5">
              {(isCalendar ? CALENDAR_LAYOUTS : LAYOUTS).map((l) => (
                <button key={l.id}
                  onClick={() => setLayout(l.id)}
                  className="flex flex-col items-center gap-1.5 p-1.5 rounded-lg transition-opacity hover:opacity-80"
                  style={{
                    background: layout === l.id ? 'var(--accent)22' : 'var(--app-bg)',
                    border: `1px solid ${layout === l.id ? 'var(--accent)' : 'var(--app-border)'}`,
                  }}>
                  <WidgetPreview type={type} layout={l.id} />
                  <span className="text-[10px]" style={{ color: layout === l.id ? 'var(--accent)' : 'var(--text-secondary)' }}>{l.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-5">
          <button onClick={() => void handleAdd()} disabled={!canAdd}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-80 disabled:opacity-30"
            style={{ background: 'var(--accent)' }}>
            {t('editor.manual.add')}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm hover:opacity-80"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
            {t('editor.manual.cancel')}
          </button>
        </div>
      </div>

      {showPicker && (
        <DatapointPicker
          currentValue={datapoint}
          onSelect={(id, dpUnit, dpName) => {
            setDatapoint(id);
            if (!title.trim() && dpName) setTitle(dpName);
            if ((type === 'value' || type === 'chart') && !unit.trim() && dpUnit) setUnit(dpUnit);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// TYPE_LABELS are now resolved via useT() inside components

function MobileOrderPanel({ layoutId, tabId }: { layoutId: string; tabId: string }) {
  const t = useT();
  const { layouts, updateWidgetInTab } = useDashboardStore();
  const tab = layouts.find((l) => l.id === layoutId)?.tabs.find((t) => t.id === tabId);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const sorted = useMemo(() => {
    const widgets = tab?.widgets ?? [];
    return [...widgets].sort((a, b) => {
      const oa = a.mobileOrder ?? (a.gridPos.y * 1000 + a.gridPos.x);
      const ob = b.mobileOrder ?? (b.gridPos.y * 1000 + b.gridPos.x);
      return oa - ob;
    });
  }, [tab?.widgets]);

  const applyOrder = (reordered: typeof sorted) => {
    if (!tab) return;
    reordered.forEach((w, i) => {
      if (w.mobileOrder !== i) updateWidgetInTab(tab.id, w.id, { ...w, mobileOrder: i });
    });
  };

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setOverIdx(null); return; }
    const reordered = [...sorted];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    applyOrder(reordered);
    setDragIdx(null);
    setOverIdx(null);
  };

  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= sorted.length) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    applyOrder(reordered);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ borderLeft: '1px solid var(--app-border)', background: 'var(--app-surface)', width: 260 }}>
      <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--app-border)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t('editor.mobile.title')}</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          {t('editor.mobile.title')}
        </p>
      </div>

      <div className="aura-scroll flex-1 overflow-y-auto p-3 space-y-1">
        {sorted.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: 'var(--text-secondary)' }}>
            {t('editor.tab.noWidgets')}
          </p>
        ) : sorted.map((w, i) => {
          const isDragging = dragIdx === i;
          const isOver = overIdx === i;
          return (
            <div
              key={w.id}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
              onDragLeave={() => setOverIdx(null)}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg select-none"
              style={{
                background: isDragging ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : isOver ? 'color-mix(in srgb, var(--accent) 6%, var(--app-bg))' : 'var(--app-bg)',
                border: `1px solid ${isOver ? 'var(--accent)' : 'var(--app-border)'}`,
                opacity: isDragging ? 0.5 : 1,
                cursor: 'grab',
              }}
            >
              <GripVertical size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              <span className="text-[11px] font-mono w-4 shrink-0 text-center" style={{ color: 'var(--text-secondary)' }}>{i + 1}</span>
              <span className="flex-1 text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                {w.title || t(`widget.${w.type}` as never) || w.type}
              </span>
              <div className="flex flex-col gap-0.5 shrink-0">
                <button onClick={() => moveItem(i, i - 1)} disabled={i === 0}
                  className="w-5 h-3.5 flex items-center justify-center rounded text-[9px] hover:opacity-80 disabled:opacity-20"
                  style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>▲</button>
                <button onClick={() => moveItem(i, i + 1)} disabled={i === sorted.length - 1}
                  className="w-5 h-3.5 flex items-center justify-center rounded text-[9px] hover:opacity-80 disabled:opacity-20"
                  style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>▼</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AdminEditor() {
  const t = useT();
  const { layouts, activeLayoutId, setActiveLayout, addWidget, addTab, setActiveTab, renameTab, removeTab, setTabSlug, updateTab } = useDashboardStore();
  const activeLayout = layouts.find((l) => l.id === activeLayoutId) ?? layouts[0];
  const tabs = activeLayout.tabs;
  const activeTabId = activeLayout.activeTabId;
  const [showWizard, setShowWizard] = useState(false);
  const [showTabWizard, setShowTabWizard] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showMobileOrder, setShowMobileOrder] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [settingsTabId, setSettingsTabId] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const settingsBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const openTabSettings = (tabId: string) => {
    const btn = settingsBtnRefs.current.get(tabId);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const panelW = 256; // w-64
    const left = Math.min(rect.left, window.innerWidth - panelW - 12);
    setPanelPos({ top: rect.bottom + 6, left: Math.max(8, left) });
    setSettingsTabId((prev) => (prev === tabId ? null : tabId));
  };

  const settingsTab = tabs.find((t) => t.id === settingsTabId);

  return (
    <div className="flex flex-col h-screen">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 shrink-0 flex-wrap"
        style={{ background: 'var(--app-surface)', borderBottom: '1px solid var(--app-border)' }}>
        <h2 className="font-semibold text-sm mr-2 shrink-0" style={{ color: 'var(--text-primary)' }}>{t('admin.nav.editor')}</h2>
        {/* Layout selector */}
        <select
          value={activeLayoutId}
          onChange={(e) => setActiveLayout(e.target.value)}
          className="text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
        >
          {layouts.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <div className="flex-1" />
        <button onClick={() => setShowTabWizard(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-80"
          style={{ background: 'var(--accent)' }}>
          <Wand2 size={15} /> {t('editor.tab.addTab')}
        </button>
        <button onClick={() => setShowManual(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-80"
          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
          <PenLine size={15} /> {t('editor.tab.addManual')}
        </button>
        <button onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-80"
          style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
          <Upload size={15} /> {t('common.export')}
        </button>
        <button onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-80"
          style={{ background: 'var(--accent-green)' }}>
          <Cpu size={15} /> {t('editor.tab.addDevice')}
        </button>
        <button
          onClick={() => setShowMobileOrder(!showMobileOrder)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-80"
          style={{
            background: showMobileOrder ? 'var(--accent)22' : 'var(--app-bg)',
            color: showMobileOrder ? 'var(--accent)' : 'var(--text-secondary)',
            border: `1px solid ${showMobileOrder ? 'var(--accent)' : 'var(--app-border)'}`,
          }}
          title={t('editor.mobile.title')}
        >
          <Smartphone size={15} />
        </button>
      </div>

      {/* Tab-Verwaltung */}
      <div className="flex items-center gap-2 px-6 py-2 shrink-0 flex-wrap"
        style={{ background: 'var(--app-bg)', borderBottom: '1px solid var(--app-border)' }}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div key={tab.id} className="flex items-center gap-1">
              {renamingId === tab.id ? (
                <div className="flex items-center gap-1">
                  <input autoFocus value={renamingValue}
                    onChange={(e) => setRenamingValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { renameTab(tab.id, renamingValue); setRenamingId(null); }
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="text-xs rounded px-2 py-1 w-28 focus:outline-none"
                    style={{ background: 'var(--app-surface)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }} />
                  <button onClick={() => { renameTab(tab.id, renamingValue); setRenamingId(null); }}
                    className="p-1 rounded hover:opacity-70" style={{ color: 'var(--accent-green)' }}>
                    <Check size={13} />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1 rounded-lg px-2 py-1"
                    style={{ background: isActive ? 'var(--accent)22' : 'var(--app-surface)', border: `1px solid ${isActive ? 'var(--accent)' : 'var(--app-border)'}` }}>
                    {/* Tab icon */}
                    {tab.icon && WIDGET_ICON_MAP[tab.icon] && (() => {
                      const TabIcon = WIDGET_ICON_MAP[tab.icon!];
                      return <TabIcon size={11} style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }} />;
                    })()}
                    <button onClick={() => setActiveTab(tab.id)}
                      className="text-xs font-medium" style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      {tab.name}
                    </button>
                    <button
                      ref={(el) => { if (el) settingsBtnRefs.current.set(tab.id, el); else settingsBtnRefs.current.delete(tab.id); }}
                      onClick={() => openTabSettings(tab.id)}
                      className="p-0.5 rounded hover:opacity-70"
                      style={{ color: settingsTabId === tab.id ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      <Settings size={11} />
                    </button>
                    <button onClick={() => { setRenamingId(tab.id); setRenamingValue(tab.name); }}
                      className="p-0.5 rounded hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                      <Edit3 size={11} />
                    </button>
                    {tabs.length > 1 && (
                      <button onClick={() => removeTab(tab.id)}
                        className="p-0.5 rounded hover:opacity-70" style={{ color: 'var(--accent-red)' }}>
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <button onClick={() => addTab(`Tab ${tabs.length + 1}`)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs hover:opacity-80"
          style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
          <Plus size={12} /> {t('tabBar.addTab')}
        </button>
      </div>


      {/* Dashboard-Vorschau mit Edit-Modus */}
      <div className="flex-1 flex overflow-hidden" style={{ background: 'var(--app-bg)' }}>
        <div className="flex-1 flex flex-col overflow-hidden">
          <Dashboard editMode={true} />
        </div>
        {showMobileOrder && (
          <MobileOrderPanel layoutId={activeLayoutId} tabId={activeTabId} />
        )}
      </div>

      {showTabWizard && (
        <TabWizard
          onAdd={(name, widgets) => {
            addTab(name);
            widgets.forEach(addWidget);
            setShowTabWizard(false);
          }}
          onClose={() => setShowTabWizard(false)}
        />
      )}
      {showWizard && (
        <DeviceWizard onAdd={(ws: WidgetConfig[]) => ws.forEach(addWidget)} onClose={() => setShowWizard(false)} />
      )}
      {showManual && (
        <ManualWidgetDialog onAdd={addWidget} onClose={() => setShowManual(false)} />
      )}
      {showImport && (
        <ImportWidgetDialog
          tabs={tabs}
          onAdd={(widget, tabId) => {
            if (tabId && tabId !== activeTabId) {
              useDashboardStore.getState().setActiveTab(tabId);
            }
            addWidget(widget);
          }}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Tab settings portal */}
      {settingsTabId && settingsTab && createPortal(
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => setSettingsTabId(null)} />
          <div
            className="aura-scroll fixed z-[999] rounded-xl shadow-2xl p-3 space-y-3 w-64 overflow-y-auto"
            style={{ top: panelPos.top, left: panelPos.left, maxHeight: `calc(100vh - ${panelPos.top + 12}px)`, background: 'var(--app-surface)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--app-border)' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t('editor.tabMgmt.settings')}</span>
              <button onClick={() => setSettingsTabId(null)} className="w-5 h-5 flex items-center justify-center rounded hover:opacity-70">
                <X size={12} style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>
            {/* Name */}
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('editor.tabMgmt.name')}</label>
              <input
                type="text"
                value={settingsTab.name}
                onChange={(e) => updateTab(settingsTabId, { name: e.target.value })}
                className="w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
              />
            </div>
            {/* URL-Slug */}
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('editor.tabMgmt.slug')}</label>
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-mono shrink-0" style={{ color: 'var(--text-secondary)' }}>/tab/</span>
                <input
                  type="text"
                  value={settingsTab.slug ?? settingsTab.id}
                  onChange={(e) => {
                    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                    if (val) setTabSlug(settingsTabId, val);
                  }}
                  className="flex-1 text-xs font-mono rounded-lg px-2.5 py-2 focus:outline-none"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                />
              </div>
            </div>
            {/* Hide label */}
            <div className="flex items-center justify-between">
              <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('editor.tabMgmt.hideLabel')}</label>
              <button
                onClick={() => updateTab(settingsTabId, { hideLabel: !settingsTab.hideLabel })}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{ background: settingsTab.hideLabel ? 'var(--accent)' : 'var(--app-border)' }}
              >
                <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  style={{ left: settingsTab.hideLabel ? '18px' : '2px' }} />
              </button>
            </div>
            {/* Icon picker */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('editor.tabMgmt.icon')}</label>
                {settingsTab.icon && (
                  <button onClick={() => updateTab(settingsTabId, { icon: undefined })}
                    className="text-[10px] hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                    {t('editor.tabMgmt.remove')}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {ICON_PICKER_ENTRIES.map(([name, Icon]) => {
                  const selected = settingsTab.icon === name;
                  return (
                    <button key={name} title={name}
                      onClick={() => updateTab(settingsTabId, { icon: selected ? undefined : name })}
                      className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                      style={{
                        background: selected ? 'var(--accent)' : 'var(--app-bg)',
                        color:      selected ? '#fff' : 'var(--text-secondary)',
                        border:     `1px solid ${selected ? 'var(--accent)' : 'var(--app-border)'}`,
                      }}>
                      <Icon size={13} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
