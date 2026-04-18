import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../../contexts/PortalTargetContext';
import { useT } from '../../i18n';
import {
  ChevronDown, ChevronRight, Copy, Trash2, Pencil,
  Plus, Database, X, Check, RotateCcw,
  ArrowRightLeft, Download, Upload,
} from 'lucide-react';
import { useDashboardStore, useActiveLayout, type Tab } from '../../store/dashboardStore';
import { DatapointPicker } from '../../components/config/DatapointPicker';
import { WidgetPreview } from '../../components/config/WidgetPreview';
import type { WidgetConfig, WidgetType, WidgetLayout } from '../../types';
import { WIDGET_REGISTRY, WIDGET_BY_TYPE, getEffectiveSize } from '../../widgetRegistry';
import { useConfigStore } from '../../store/configStore';
import { exportWidget } from '../../utils/widgetExportImport';
import { ImportWidgetDialog } from '../../components/config/ImportWidgetDialog';

// ── Meta (derived from central registry) ─────────────────────────────────────

const TYPE_META = Object.fromEntries(
  WIDGET_REGISTRY.map(({ type, label, Icon, color }) => [
    type,
    { label, icon: <Icon size={15} />, color },
  ]),
) as Record<WidgetType, { label: string; icon: React.ReactElement; color: string }>;

const TYPE_ORDER: WidgetType[] = WIDGET_REGISTRY.map((m) => m.type);


const inputCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const inputStyle: React.CSSProperties = {
  background: 'var(--app-bg)',
  color: 'var(--text-primary)',
  border: '1px solid var(--app-border)',
};

// ── Shared helpers ────────────────────────────────────────────────────────────

interface WidgetEntry { config: WidgetConfig; tab: Tab }


// ── Inline edit form ──────────────────────────────────────────────────────────

function InlineEditForm({
  config,
  onChange,
  onClose,
}: {
  config: WidgetConfig;
  onChange: (c: WidgetConfig) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [pickerTarget, setPickerTarget] = useState<'datapoint' | 'actual' | null>(null);

  const o = config.options ?? {};
  const setO = (patch: Record<string, unknown>) =>
    onChange({ ...config, options: { ...o, ...patch } });

  const isClock      = config.type === 'clock';
  const isCalendar   = config.type === 'calendar';
  const isHeader     = config.type === 'header';
  const isList       = config.type === 'list';
  const isThermostat = config.type === 'thermostat';
  const needsDatapoint = !isClock && !isCalendar && !isHeader && !isList;

  return (
    <div
      className="mt-2 rounded-xl p-4 space-y-3"
      style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
    >
      <div className="grid grid-cols-2 gap-3">
        {/* Left column */}
        <div className="space-y-3">
          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('editor.tabMgmt.name')}</label>
            <input
              type="text"
              value={config.title}
              onChange={(e) => onChange({ ...config, title: e.target.value })}
              className={inputCls}
              style={inputStyle}
            />
          </div>

          <div>
            <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Layout</label>
            <select
              value={config.layout ?? 'default'}
              onChange={(e) => onChange({ ...config, layout: e.target.value as WidgetLayout })}
              className={inputCls}
              style={inputStyle}
            >
              <option value="default">{t('editor.layouts.standard')}</option>
              <option value="card">{t('editor.layouts.card')}</option>
              <option value="compact">{t('editor.layouts.compact')}</option>
              <option value="minimal">{t('editor.layouts.minimal')}</option>
              {isCalendar && <option value="agenda">{t('editor.layouts.agenda')}</option>}
            </select>
          </div>

          {needsDatapoint && (
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                {t('wf.edit.datapointId')}
              </label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={config.datapoint}
                  onChange={(e) => onChange({ ...config, datapoint: e.target.value })}
                  className="flex-1 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none min-w-0"
                  style={inputStyle}
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
                value={(o.unit as string) ?? ''}
                onChange={(e) => setO({ unit: e.target.value || undefined })}
                placeholder="z.B. °C, %, W"
                className={inputCls}
                style={inputStyle}
              />
            </div>
          )}

          {isHeader && (
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.header.subtitle')}</label>
              <input
                type="text"
                value={(o.subtitle as string) ?? ''}
                onChange={(e) => setO({ subtitle: e.target.value || undefined })}
                placeholder="optional"
                className={inputCls}
                style={inputStyle}
              />
            </div>
          )}
        </div>

        {/* Right column – type-specific */}
        <div className="space-y-3">
          {isThermostat && (
            <>
              <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.thermo.clickable')}</label>
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
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.thermo.actualDp')}</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={(o.actualDatapoint as string) ?? ''}
                    onChange={(e) => setO({ actualDatapoint: e.target.value || undefined })}
                    placeholder="optional"
                    className="flex-1 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none min-w-0"
                    style={inputStyle}
                  />
                  <button
                    onClick={() => setPickerTarget('actual')}
                    className="px-2 rounded-lg hover:opacity-80 shrink-0"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                  >
                    <Database size={13} />
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.thermo.minTemp')}</label>
                  <input type="number" min={0} max={30}
                    value={(o.minTemp as number) ?? 10}
                    onChange={(e) => setO({ minTemp: Number(e.target.value) })}
                    className={inputCls} style={inputStyle} />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.thermo.maxTemp')}</label>
                  <input type="number" min={10} max={40}
                    value={(o.maxTemp as number) ?? 30}
                    onChange={(e) => setO({ maxTemp: Number(e.target.value) })}
                    className={inputCls} style={inputStyle} />
                </div>
              </div>
              <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.thermo.step')}</label>
                <select value={(o.step as number) ?? 0.5} onChange={(e) => setO({ step: Number(e.target.value) })}
                  className={inputCls} style={inputStyle}>
                  <option value={0.5}>0,5 °C</option>
                  <option value={1}>1 °C</option>
                  <option value={0.1}>0,1 °C</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.thermo.presets')}</label>
                <input
                  type="text"
                  value={((o.presets as number[]) ?? [18, 20, 22, 24]).join(', ')}
                  onChange={(e) => {
                    const vals = e.target.value.split(',').map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
                    setO({ presets: vals.length ? vals : undefined });
                  }}
                  placeholder="18, 20, 22, 24"
                  className={inputCls}
                  style={inputStyle}
                />
              </div>
            </>
          )}

          {isClock && (
            <>
              <div>
                <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.clock.display')}</label>
                <select value={(o.display as string) ?? 'time'}
                  onChange={(e) => setO({ display: e.target.value })}
                  className={inputCls} style={inputStyle}>
                  <option value="time">{t('wf.clock.timeOnly')}</option>
                  <option value="datetime">{t('wf.clock.datetime')}</option>
                  <option value="date">{t('wf.clock.dateOnly')}</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{t('wf.clock.showSeconds')}</label>
                <button
                  onClick={() => setO({ showSeconds: !o.showSeconds })}
                  className="relative w-9 h-5 rounded-full transition-colors"
                  style={{ background: o.showSeconds ? 'var(--accent)' : 'var(--app-border)' }}
                >
                  <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                    style={{ left: o.showSeconds ? '18px' : '2px' }} />
                </button>
              </div>
            </>
          )}

          {!isThermostat && !isClock && !isCalendar && !isHeader && !isList && (
            <div className="flex items-center justify-center h-full">
              <WidgetPreview type={config.type} layout={config.layout} title={config.title} />
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1 border-t" style={{ borderColor: 'var(--app-border)' }}>
        <button onClick={onClose}
          className="px-3 py-1.5 text-xs rounded-lg hover:opacity-80"
          style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
          {t('wizard.tab.cancel')}
        </button>
        <button onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-80"
          style={{ background: 'var(--accent)' }}>
          <Check size={12} /> {t('common.ok')}
        </button>
      </div>

      {pickerTarget && (
        <DatapointPicker
          currentValue={pickerTarget === 'datapoint' ? config.datapoint : ((o.actualDatapoint as string) ?? '')}
          onSelect={(id) => {
            if (pickerTarget === 'datapoint') onChange({ ...config, datapoint: id });
            else setO({ actualDatapoint: id });
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}

// ── Widget Row ────────────────────────────────────────────────────────────────

type TabTarget = { layoutId: string; tabId: string };

function WidgetRow({
  entry,
  tabs,
  onUpdate,
  onDelete,
  onCopy,
  onMove,
}: {
  entry: WidgetEntry;
  tabs: Tab[];
  onUpdate: (config: WidgetConfig) => void;
  onDelete: () => void;
  onCopy: (target: TabTarget) => void;
  onMove: (target: TabTarget) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  const [draft, setDraft] = useState<WidgetConfig>(entry.config);
  const copyBtnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);
  const { layouts } = useDashboardStore();
  const portalTarget = usePortalTarget();
  // Default target: first tab of first layout (excluding source)
  const firstTarget = layouts.flatMap((l) => l.tabs.map((t) => ({ layoutId: l.id, tabId: t.id }))).find(
    (x) => !(x.layoutId === entry.tab.id || x.tabId === entry.tab.id),
  ) ?? { layoutId: layouts[0]?.id ?? '', tabId: tabs[0]?.id ?? '' };
  const [copyTarget, setCopyTarget] = useState<TabTarget>(firstTarget);

  useEffect(() => {
    if (!showCopy) return;
    const btn = copyBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    const onClose = (e: MouseEvent) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      if (copyBtnRef.current?.contains(e.target as Node)) return;
      setShowCopy(false);
    };
    window.addEventListener('mousedown', onClose);
    return () => window.removeEventListener('mousedown', onClose);
  }, [showCopy]);

  const handleSave = (c: WidgetConfig) => {
    setDraft(c);
    onUpdate(c);
  };

  const handleEditToggle = () => {
    if (editing) {
      setEditing(false);
    } else {
      setDraft(entry.config);
      setEditing(true);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: editing ? 'color-mix(in srgb, var(--accent) 6%, var(--app-bg))' : 'var(--app-bg)' }}
      >
        {/* Preview */}
        <div className="shrink-0">
          <WidgetPreview type={entry.config.type} layout={entry.config.layout} title={entry.config.title} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
              {entry.config.title || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>{t('widgets.noTitle')}</span>}
            </p>
            <span
              className="px-2 py-0.5 text-[10px] rounded-full shrink-0"
              style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            >
              {entry.tab.name}
            </span>
          </div>
          <p className="text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
            {entry.config.datapoint || '—'}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {entry.config.layout ?? 'default'} · {entry.config.gridPos.w}×{entry.config.gridPos.h}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleEditToggle}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg hover:opacity-80 transition-opacity"
            style={{
              background: editing ? 'var(--accent)' : 'var(--app-surface)',
              color: editing ? '#fff' : 'var(--text-secondary)',
              border: '1px solid var(--app-border)',
            }}
          >
            <Pencil size={12} />
            {editing ? t('widgets.close') : t('widgets.edit')}
          </button>

          {/* Export */}
          <button
            onClick={() => exportWidget(entry.config)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
            style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            title={t('common.export')}
          >
            <Download size={13} />
          </button>

          {/* Copy / Move */}
          <button
            ref={copyBtnRef}
            onClick={(e) => { e.stopPropagation(); setShowCopy((v) => !v); setConfirmDelete(false); }}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
            style={{ background: showCopy ? 'var(--accent)' : 'var(--app-surface)', color: showCopy ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
            title={`${t('common.duplicate')} / ${t('common.move')}`}
          >
            <Copy size={13} />
          </button>
          {showCopy && dropdownPos && createPortal(
            <div
              ref={dropdownRef}
              className="rounded-lg shadow-2xl p-2 space-y-1.5 min-w-[210px]"
              style={{
                position: 'fixed',
                top: dropdownPos.top,
                right: dropdownPos.right,
                zIndex: 9999,
                background: 'var(--app-surface)',
                border: '1px solid var(--app-border)',
              }}
            >
              <p className="text-[11px] font-medium px-1" style={{ color: 'var(--text-secondary)' }}>{t('widgets.copyTarget')}</p>
              <select
                value={`${copyTarget.layoutId}::${copyTarget.tabId}`}
                onChange={(e) => {
                  const [layoutId, tabId] = e.target.value.split('::');
                  setCopyTarget({ layoutId, tabId });
                }}
                className="w-full text-xs rounded px-2 py-1.5 focus:outline-none"
                style={inputStyle}
              >
                {layouts.map((layout) => (
                  <optgroup key={layout.id} label={layout.name}>
                    {layout.tabs.map((t) => (
                      <option key={t.id} value={`${layout.id}::${t.id}`}>{t.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => { onCopy(copyTarget); setShowCopy(false); }}
                  className="flex items-center justify-center gap-1 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-80"
                  style={{ background: 'var(--accent)' }}
                >
                  <Copy size={11} /> {t('common.duplicate')}
                </button>
                <button
                  onClick={() => { onMove(copyTarget); setShowCopy(false); }}
                  className="flex items-center justify-center gap-1 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-80"
                  style={{ background: '#8b5cf6' }}
                >
                  <ArrowRightLeft size={11} /> {t('common.move')}
                </button>
              </div>
            </div>,
            portalTarget,
          )}

          {/* Delete */}
          {confirmDelete ? (
            <>
              <button onClick={onDelete}
                className="px-2 h-7 text-xs text-white rounded-lg hover:opacity-80"
                style={{ background: 'var(--accent-red)' }}>
                {t('common.delete')}
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                <X size={12} />
              </button>
            </>
          ) : (
            <button
              onClick={() => { setConfirmDelete(true); setShowCopy(false); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
              style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
              title={t('common.delete')}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="px-4 pb-4" style={{ background: 'var(--app-bg)' }}>
          <InlineEditForm
            config={draft}
            onChange={handleSave}
            onClose={() => setEditing(false)}
          />
        </div>
      )}
    </div>
  );
}

// ── Type Section ──────────────────────────────────────────────────────────────

function TypeSection({
  type,
  entries,
  tabs,
  onUpdate,
  onDelete,
  onCopy,
  onMove,
  defaultOpen,
}: {
  type: WidgetType;
  entries: WidgetEntry[];
  tabs: Tab[];
  onUpdate: (tabId: string, widgetId: string, config: WidgetConfig) => void;
  onDelete: (tabId: string, widgetId: string) => void;
  onCopy: (entry: WidgetEntry, target: TabTarget) => void;
  onMove: (entry: WidgetEntry, target: TabTarget) => void;
  defaultOpen: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const meta = TYPE_META[type];

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:opacity-80 transition-opacity"
        style={{ background: 'var(--app-surface)' }}
      >
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${meta.color}22`, color: meta.color }}>
          {meta.icon}
        </span>
        <span className="font-semibold text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
          {meta.label}
        </span>
        <span
          className="px-2.5 py-0.5 text-xs font-medium rounded-full"
          style={{ background: `${meta.color}22`, color: meta.color }}
        >
          {entries.length}
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      {open && (
        <div className="p-3 space-y-2" style={{ background: 'var(--app-bg)' }}>
          {entries.map((entry) => (
            <WidgetRow
              key={entry.config.id}
              entry={entry}
              tabs={tabs}
              onUpdate={(config) => onUpdate(entry.tab.id, entry.config.id, config)}
              onDelete={() => onDelete(entry.tab.id, entry.config.id)}
              onCopy={(target) => onCopy(entry, target)}
              onMove={(target) => onMove(entry, target)}
            />
          ))}
          {entries.length === 0 && (
            <p className="text-xs text-center py-4" style={{ color: 'var(--text-secondary)' }}>
              {t('widgets.noneSelected')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── New Widget Dialog ─────────────────────────────────────────────────────────

function NewWidgetDialog({
  tabs,
  onAdd,
  onClose,
}: {
  tabs: Tab[];
  onAdd: (tabId: string, widget: WidgetConfig) => void;
  onClose: () => void;
}) {
  const t = useT();
  const widgetDefaults = useConfigStore((s) => s.widgetDefaults);
  const [type, setType] = useState<WidgetType>('value');
  const [layout, setLayout] = useState<WidgetLayout>('default');
  const [title, setTitle] = useState('');
  const [datapoint, setDatapoint] = useState('');
  const [unit, setUnit] = useState('');
  const [targetTabId, setTargetTabId] = useState(tabs[0]?.id ?? '');
  const [showPicker, setShowPicker] = useState(false);

  const def = WIDGET_REGISTRY.find((w) => w.type === type)!;
  const addMode = WIDGET_BY_TYPE[type].addMode;
  const isCalendar = type === 'calendar';
  const noDatapoint = addMode !== 'datapoint';
  const canAdd = addMode === 'datapoint' ? !!datapoint.trim()
               : addMode === 'wizard-only' ? false
               : true;

  const handleAdd = () => {
    if (!canAdd || !targetTabId) return;
    onAdd(targetTabId, {
      id: `w-${Date.now()}`,
      type,
      layout,
      title: title || def.label,
      datapoint: noDatapoint ? '' : datapoint.trim(),
      gridPos: { x: 0, y: 9999, ...getEffectiveSize(type, widgetDefaults) },
      options: { icon: def.iconName, ...(unit ? { unit } : {}) },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="rounded-xl w-full max-w-md shadow-2xl p-6 space-y-4"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{t('editor.manual.title')}</h2>
          <button onClick={onClose} className="hover:opacity-60" style={{ color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('widgets.targetTab')}</label>
          <select value={targetTabId} onChange={(e) => setTargetTabId(e.target.value)}
            className={inputCls} style={inputStyle}>
            {tabs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('editor.manual.type')}</label>
            <select value={type} onChange={(e) => { setType(e.target.value as WidgetType); setDatapoint(''); }}
              className={inputCls} style={inputStyle}>
              {WIDGET_REGISTRY.map((w) => <option key={w.type} value={w.type}>{w.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('wf.edit.layout')}</label>
            <select value={layout} onChange={(e) => setLayout(e.target.value as WidgetLayout)}
              className={inputCls} style={inputStyle}>
              <option value="default">{t('editor.layouts.standard')}</option>
              <option value="card">{t('editor.layouts.card')}</option>
              <option value="compact">{t('editor.layouts.compact')}</option>
              <option value="minimal">{t('editor.layouts.minimal')}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('editor.tabMgmt.name')}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={def.label}
            className={inputCls} style={inputStyle} />
        </div>

        {addMode === 'datapoint' && (
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('editor.manual.datapointId')}</label>
            <div className="flex gap-1.5">
              <input value={datapoint} onChange={(e) => setDatapoint(e.target.value)}
                placeholder="z.B. hm-rpc.0.ABC123.STATE"
                className="flex-1 text-xs rounded-lg px-2.5 py-2 font-mono focus:outline-none min-w-0"
                style={inputStyle} />
              <button onClick={() => setShowPicker(true)}
                className="px-2 rounded-lg hover:opacity-80 shrink-0"
                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                <Database size={13} />
              </button>
            </div>
          </div>
        )}

        {isCalendar && (
          <p className="text-xs py-2 px-3 rounded-lg" style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
            {t('widgets.calendarHint')}
          </p>
        )}

        {(type === 'value' || type === 'chart') && (
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('editor.manual.unit')}</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)}
              placeholder={t('endpoints.dp.unitPh')}
              className={inputCls} style={inputStyle} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg hover:opacity-80"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
            {t('editor.manual.cancel')}
          </button>
          <button onClick={handleAdd} disabled={!canAdd || isCalendar}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-80 disabled:opacity-30"
            style={{ background: 'var(--accent)' }}>
            {t('editor.manual.add')}
          </button>
        </div>

        {showPicker && (
          <DatapointPicker
            currentValue={datapoint}
            onSelect={(id) => setDatapoint(id)}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    </div>
  );
}
// ── Default Sizes Dialog ──────────────────────────────────────────────────────

function DefaultSizesDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { widgetDefaults, setWidgetDefault, resetWidgetDefault } = useConfigStore();
  const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' } as React.CSSProperties;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="rounded-xl w-full max-w-sm shadow-2xl p-6 space-y-4"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{t('widgets.defaultSizes')}</h2>
          <button onClick={onClose} className="hover:opacity-60" style={{ color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('widgets.defaultSizesHint')}</p>
        <div className="space-y-2 max-h-96 overflow-y-auto aura-scroll">
          {WIDGET_REGISTRY.map((w) => {
            const d = widgetDefaults[w.type] ?? { w: w.defaultW, h: w.defaultH };
            return (
              <div key={w.type} className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
                <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{w.label}</span>
                <input type="number" min={1} max={12} value={d.w}
                  onChange={(e) => setWidgetDefault(w.type, Number(e.target.value), d.h)}
                  className="w-12 text-xs text-center rounded px-1 py-1 focus:outline-none" style={iSty} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>×</span>
                <input type="number" min={1} max={12} value={d.h}
                  onChange={(e) => setWidgetDefault(w.type, d.w, Number(e.target.value))}
                  className="w-12 text-xs text-center rounded px-1 py-1 focus:outline-none" style={iSty} />
                <button onClick={() => resetWidgetDefault(w.type)}
                  className="hover:opacity-70 shrink-0" style={{ color: 'var(--text-secondary)' }}
                  title={t('common.reset')}>
                  <RotateCcw size={11} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AdminWidgets() {
  const t = useT();
  const { addWidgetToTab, updateWidgetInTab, removeWidgetInTab, addWidgetToLayoutTab, removeWidgetFromLayoutTab, activeLayoutId } = useDashboardStore();
  const tabs = useActiveLayout().tabs;
  const [showCreate, setShowCreate] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [search, setSearch] = useState('');

  // Flatten all widgets with their tab
  const allEntries = useMemo<WidgetEntry[]>(() =>
    tabs.flatMap((tab) => tab.widgets.map((config) => ({ config, tab }))),
    [tabs],
  );

  // Apply search filter
  const filteredEntries = useMemo(() => {
    if (!search.trim()) return allEntries;
    const q = search.toLowerCase();
    return allEntries.filter(
      (e) =>
        e.config.title.toLowerCase().includes(q) ||
        e.config.datapoint.toLowerCase().includes(q) ||
        e.tab.name.toLowerCase().includes(q) ||
        e.config.type.toLowerCase().includes(q),
    );
  }, [allEntries, search]);

  // Group by type (preserve TYPE_ORDER)
  const byType = useMemo(() => {
    const map = new Map<WidgetType, WidgetEntry[]>();
    for (const type of TYPE_ORDER) map.set(type, []);
    for (const entry of filteredEntries) {
      map.get(entry.config.type)?.push(entry);
    }
    return map;
  }, [filteredEntries]);

  const activeTypes = TYPE_ORDER.filter((tp) => (byType.get(tp)?.length ?? 0) > 0);

  const handleCopy = (entry: WidgetEntry, target: TabTarget) => {
    addWidgetToLayoutTab(target.layoutId, target.tabId, {
      ...entry.config,
      id: `${entry.config.type}-copy-${Date.now()}`,
      gridPos: { ...entry.config.gridPos, y: 9999 },
    });
  };

  const handleMove = (entry: WidgetEntry, target: TabTarget) => {
    if (target.tabId === entry.tab.id && target.layoutId === activeLayoutId) return;
    addWidgetToLayoutTab(target.layoutId, target.tabId, {
      ...entry.config,
      gridPos: { ...entry.config.gridPos, y: 9999 },
    });
    removeWidgetFromLayoutTab(activeLayoutId, entry.tab.id, entry.config.id);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('widgets.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {t('widgets.subtitle', { widgets: allEntries.length, tabs: tabs.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSizes(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl hover:opacity-80"
            style={{ background: 'var(--app-surface)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
          >
            <RotateCcw size={15} /> {t('widgets.defaultSizes')}
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl hover:opacity-80"
            style={{ background: 'var(--app-surface)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
          >
            <Upload size={15} /> {t('widgets.import')}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-xl hover:opacity-80"
            style={{ background: 'var(--accent)' }}
          >
            <Plus size={15} /> {t('editor.manual.title')}
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('widgets.search')}
        className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none"
        style={inputStyle}
      />

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {TYPE_ORDER.filter((tp) => (byType.get(tp)?.length ?? 0) > 0).map((type) => {
          const meta = TYPE_META[type];
          const count = byType.get(type)?.length ?? 0;
          return (
            <span key={type}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
              style={{ background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}33` }}>
              {meta.icon}
              {meta.label}: {count}
            </span>
          );
        })}
      </div>

      {/* Sections */}
      {allEntries.length === 0 ? (
        <div className="text-center py-16 rounded-xl" style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
          <p className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>{t('widgets.noWidgets')}</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>{t('widgets.noWidgetsHint')}</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm font-medium text-white rounded-xl hover:opacity-80"
            style={{ background: 'var(--accent)' }}
          >
            {t('widgets.createFirst')}
          </button>
        </div>
      ) : filteredEntries.length === 0 ? (
        <p className="text-center py-12 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {t('widgets.noResults', { search })}
        </p>
      ) : (
        <div className="space-y-3">
          {activeTypes.map((type, i) => (
            <TypeSection
              key={type}
              type={type}
              entries={byType.get(type) ?? []}
              tabs={tabs}
              onUpdate={(tabId, widgetId, config) => updateWidgetInTab(tabId, widgetId, config)}
              onDelete={(tabId, widgetId) => removeWidgetInTab(tabId, widgetId)}
              onCopy={handleCopy}
              onMove={handleMove}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <NewWidgetDialog
          tabs={tabs}
          onAdd={(tabId, widget) => addWidgetToTab(tabId, widget)}
          onClose={() => setShowCreate(false)}
        />
      )}

      {showImport && (
        <ImportWidgetDialog
          tabs={tabs}
          onAdd={(widget, tabId) => addWidgetToTab(tabId ?? tabs[0]?.id ?? '', widget)}
          onClose={() => setShowImport(false)}
        />
      )}

      {showSizes && (
        <DefaultSizesDialog onClose={() => setShowSizes(false)} />
      )}
    </div>
  );
}
