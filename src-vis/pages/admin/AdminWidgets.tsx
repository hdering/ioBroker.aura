import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePortalTarget } from '../../contexts/PortalTargetContext';
import { useT } from '../../i18n';
import {
  ChevronDown, ChevronRight, Copy, Trash2, Pencil,
  Plus, Database, X, Check, Search, RotateCcw,
  ArrowRightLeft, Download, Upload,
} from 'lucide-react';
import { useDashboardStore, useActiveLayout, type Tab } from '../../store/dashboardStore';
import { useGroupStore, type DatapointGroup, type GroupDatapoint } from '../../store/groupStore';
import { useIoBrokerDevices } from '../../hooks/useIoBrokerDevices';
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
  const { groups } = useGroupStore();
  const [pickerTarget, setPickerTarget] = useState<'datapoint' | 'actual' | null>(null);

  const o = config.options ?? {};
  const setO = (patch: Record<string, unknown>) =>
    onChange({ ...config, options: { ...o, ...patch } });

  const isClock    = config.type === 'clock';
  const isCalendar = config.type === 'calendar';
  const isHeader   = config.type === 'header';
  const isList     = config.type === 'list';
  const isThermostat = config.type === 'thermostat';
  const needsDatapoint = !isClock && !isCalendar && !isHeader;

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

          {needsDatapoint && !isList && (
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

          {isList && (
            <div>
              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('editor.manual.group')}</label>
              <select
                value={config.datapoint}
                onChange={(e) => onChange({ ...config, datapoint: e.target.value })}
                className={inputCls}
                style={inputStyle}
              >
                <option value="">{t('editor.manual.selectGroup')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
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
  const { groups } = useGroupStore();
  const widgetDefaults = useConfigStore((s) => s.widgetDefaults);
  const [type, setType] = useState<WidgetType>('value');
  const [layout, setLayout] = useState<WidgetLayout>('default');
  const [title, setTitle] = useState('');
  const [datapoint, setDatapoint] = useState('');
  const [groupId, setGroupId] = useState('');
  const [unit, setUnit] = useState('');
  const [targetTabId, setTargetTabId] = useState(tabs[0]?.id ?? '');
  const [showPicker, setShowPicker] = useState(false);

  const def = WIDGET_REGISTRY.find((w) => w.type === type)!;
  const addMode = WIDGET_BY_TYPE[type].addMode;
  const isCalendar = type === 'calendar';
  const isList = addMode === 'group';
  const noDatapoint = addMode !== 'datapoint';
  const canAdd = addMode === 'datapoint' ? !!datapoint.trim()
               : addMode === 'group'     ? !!groupId
               : addMode === 'wizard-only' ? false
               : true;

  const handleAdd = () => {
    if (!canAdd || !targetTabId) return;
    const selectedGroup = isList ? groups.find((g) => g.id === groupId) : undefined;
    onAdd(targetTabId, {
      id: `${type}-${Date.now()}`,
      type,
      layout,
      title: title || (isList && selectedGroup ? selectedGroup.name : def.label),
      datapoint: noDatapoint ? '' : isList ? groupId : datapoint.trim(),
      gridPos: { x: 0, y: Infinity, ...getEffectiveSize(type, widgetDefaults) },
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
            <select value={type} onChange={(e) => { setType(e.target.value as WidgetType); setDatapoint(''); setGroupId(''); }}
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

        {isList && (
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>{t('editor.manual.group')}</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}
              className={inputCls} style={inputStyle}>
              <option value="">{t('editor.manual.selectGroup')}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
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

// ── Multi-select Datapoint Picker ────────────────────────────────────────────

function MultiDatapointPicker({ onAdd, onClose }: { onAdd: (dps: GroupDatapoint[]) => void; onClose: () => void }) {
  const t = useT();
  const { devices, loading, loaded, load } = useIoBrokerDevices();
  const [search, setSearch] = useState('');
  const [adapter, setAdapter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const adapters = useMemo(() => Array.from(new Set(devices.map((d) => d.adapter))).sort(), [devices]);
  const filtered = useMemo(() => devices.filter((d) => {
    if (adapter && d.adapter !== adapter) return false;
    if (search) { const q = search.toLowerCase(); return d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) || d.states.some((s) => s.id.toLowerCase().includes(q)); }
    return true;
  }), [devices, search, adapter]);

  const toggle = (stateId: string) =>
    setSelected((prev) => { const next = new Set(prev); if (next.has(stateId)) { next.delete(stateId); } else { next.add(stateId); } return next; });

  const toggleDevice = (deviceId: string) => {
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;
    const allSelected = device.states.every((s) => selected.has(s.id));
    setSelected((prev) => {
      const next = new Set(prev);
      device.states.forEach((s) => allSelected ? next.delete(s.id) : next.add(s.id));
      return next;
    });
  };

  const handleAdd = () => {
    const result: GroupDatapoint[] = [];
    for (const device of devices) {
      for (const state of device.states) {
        if (!selected.has(state.id)) continue;
        result.push({
          id: state.id,
          label: `${device.name} – ${state.id.split('.').pop()}`,
          type: state.obj.common.type === 'boolean' ? 'boolean' : state.obj.common.type === 'number' ? 'number' : 'string',
          unit: state.unit,
          writable: state.obj.common.write !== false,
        });
      }
    }
    onAdd(result);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t('endpoints.picker.title')}</h3>
          <button onClick={onClose} style={{ color: 'var(--text-secondary)' }}><X size={18} /></button>
        </div>

        {!loaded ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-4 py-12">
            {loading
              ? <><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} /><p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('common.loading')}</p></>
              : <button onClick={load} className="px-5 py-2 rounded-lg text-white text-sm hover:opacity-80" style={{ background: 'var(--accent)' }}>{t('endpoints.picker.load')}</button>
            }
          </div>
        ) : (
          <>
            <div className="flex gap-2 px-5 py-3" style={{ borderBottom: '1px solid var(--app-border)' }}>
              <div className="flex-1 flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
                <Search size={14} style={{ color: 'var(--text-secondary)' }} />
                <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} className="flex-1 text-sm bg-transparent focus:outline-none" style={{ color: 'var(--text-primary)' }} />
              </div>
              <select value={adapter} onChange={(e) => setAdapter(e.target.value)} className="text-sm rounded-lg px-2 py-1.5" style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
                <option value="">{t('common.all')}</option>
                {adapters.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
              {filtered.map((device) => {
                const deviceSelected = device.states.filter((s) => selected.has(s.id)).length;
                const allChecked = deviceSelected === device.states.length;
                return (
                  <div key={device.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                    <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: 'var(--app-bg)' }}>
                      <input type="checkbox" checked={allChecked} ref={(el) => { if (el) el.indeterminate = deviceSelected > 0 && !allChecked; }}
                        onChange={() => toggleDevice(device.id)}
                        className="w-4 h-4 shrink-0 cursor-pointer" style={{ accentColor: 'var(--accent)' }} />
                      <button className="flex-1 flex items-center gap-2 text-left hover:opacity-80 min-w-0"
                        onClick={() => setExpanded(expanded === device.id ? null : device.id)}>
                        {expanded === device.id ? <ChevronDown size={14} style={{ flexShrink: 0 }} /> : <ChevronRight size={14} style={{ flexShrink: 0 }} />}
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{device.name}</span>
                        <span className="text-xs ml-1 shrink-0" style={{ color: deviceSelected > 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          {deviceSelected > 0 ? `${deviceSelected}/` : ''}{device.states.length} DP
                        </span>
                      </button>
                    </div>
                    {expanded === device.id && device.states.map((state) => (
                      <label key={state.id}
                        className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:opacity-80"
                        style={{ borderTop: '1px solid var(--app-border)', background: selected.has(state.id) ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--app-surface)' }}>
                        <input type="checkbox" checked={selected.has(state.id)} onChange={() => toggle(state.id)}
                          className="w-4 h-4 shrink-0" style={{ accentColor: 'var(--accent)' }} />
                        <span className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{state.id}</span>
                        {state.unit && <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>{state.unit}</span>}
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--app-border)' }}>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {selected.size === 0 ? t('endpoints.picker.none') : t('endpoints.picker.selected', { count: String(selected.size) })}
              </span>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:opacity-80"
                  style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
                  {t('endpoints.picker.cancel')}
                </button>
                <button onClick={handleAdd} disabled={selected.size === 0}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-80 disabled:opacity-30"
                  style={{ background: 'var(--accent)' }}>
                  {t('endpoints.picker.add')} {selected.size > 0 && `(${selected.size})`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Group Editor ──────────────────────────────────────────────────────────────

function GroupEditor({ group }: { group: DatapointGroup }) {
  const { removeDatapoint, updateDatapoint, addDatapoint } = useGroupStore();
  const [showPicker, setShowPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const t = useT();

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t('endpoints.dp.count', { count: group.datapoints.length })}</span>
        <button onClick={() => setShowPicker(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-80"
          style={{ background: 'var(--accent)' }}>
          <Plus size={12} /> {t('endpoints.dp.add')}
        </button>
      </div>

      {group.datapoints.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--text-secondary)' }}>
          {t('endpoints.dp.empty')}
        </p>
      ) : (
        <div className="space-y-1">
          {group.datapoints.map((dp) => (
            <div key={dp.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
              <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: 'var(--app-bg)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{dp.label}</p>
                  <p className="text-[10px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{dp.id}</p>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: 'var(--app-surface)', color: 'var(--text-secondary)' }}>
                  {dp.type === 'boolean' ? (dp.writable ? t('endpoints.dp.typeSwitch') : t('endpoints.dp.typeBool')) : dp.type === 'number' ? `${t('endpoints.dp.typeNum')}${dp.unit ? ` · ${dp.unit}` : ''}` : t('endpoints.dp.typeText')}
                </span>
                <button onClick={() => setEditingId(editingId === dp.id ? null : dp.id)}
                  className="hover:opacity-70 shrink-0"
                  style={{ color: editingId === dp.id ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  <Pencil size={12} />
                </button>
                <button onClick={() => removeDatapoint(group.id, dp.id)} className="hover:opacity-70 shrink-0" style={{ color: 'var(--accent-red)' }}>
                  <Trash2 size={12} />
                </button>
              </div>

              {editingId === dp.id && (
                <div className="px-3 py-3 space-y-2" style={{ background: 'var(--app-surface)', borderTop: '1px solid var(--app-border)' }}>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] w-20 shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('endpoints.dp.label')}</label>
                    <input type="text" defaultValue={dp.label}
                      onBlur={(e) => updateDatapoint(group.id, dp.id, { label: e.target.value || dp.label })}
                      className="flex-1 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" style={inputStyle} />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] w-20 shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('endpoints.dp.type')}</label>
                    <select value={dp.type}
                      onChange={(e) => updateDatapoint(group.id, dp.id, { type: e.target.value as GroupDatapoint['type'] })}
                      className="flex-1 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" style={inputStyle}>
                      <option value="boolean">{t('endpoints.dp.typeBoolean')}</option>
                      <option value="number">{t('endpoints.dp.typeNumber')}</option>
                      <option value="string">{t('endpoints.dp.typeText')}</option>
                    </select>
                  </div>
                  {dp.type === 'number' && (
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] w-20 shrink-0" style={{ color: 'var(--text-secondary)' }}>{t('endpoints.dp.unit')}</label>
                      <input type="text" defaultValue={dp.unit ?? ''}
                        onBlur={(e) => updateDatapoint(group.id, dp.id, { unit: e.target.value || undefined })}
                        placeholder={t('endpoints.dp.unitPh')}
                        className="flex-1 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none" style={inputStyle} />
                    </div>
                  )}
                  {(dp.type === 'boolean' || dp.type === 'number') && (
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] w-20 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {dp.type === 'boolean' ? t('endpoints.dp.asSwitch') : t('endpoints.dp.writable')}
                      </label>
                      <button onClick={() => updateDatapoint(group.id, dp.id, { writable: !dp.writable })}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: dp.writable ? 'var(--accent)' : 'var(--app-border)' }}>
                        <span className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                          style={{ left: dp.writable ? '18px' : '2px' }} />
                      </button>
                      <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {dp.writable ? (dp.type === 'boolean' ? t('endpoints.dp.toggle') : t('endpoints.dp.settable')) : t('endpoints.dp.readOnly')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showPicker && (
        <MultiDatapointPicker
          onAdd={(dps) => dps.forEach((dp) => addDatapoint(group.id, dp))}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}


// ── Default Sizes Dialog ──────────────────────────────────────────────────────

function DefaultSizesDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { widgetDefaults, setWidgetDefault, resetWidgetDefault } = useConfigStore();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="rounded-xl w-full max-w-md shadow-2xl flex flex-col"
        style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--app-border)' }}>
          <div>
            <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>{t('widgets.defaultSizes')}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {t('widgets.defaultSizesHint')}
            </p>
          </div>
          <button onClick={onClose} className="hover:opacity-60 ml-4 shrink-0" style={{ color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto p-4 space-y-2">
          {WIDGET_REGISTRY.map((meta) => {
            const override = widgetDefaults[meta.type];
            const w = override?.w ?? meta.defaultW;
            const h = override?.h ?? meta.defaultH;
            const isOverridden = !!override;
            return (
              <div key={meta.type}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ background: 'var(--app-bg)', border: `1px solid ${isOverridden ? meta.color + '55' : 'var(--app-border)'}` }}
              >
                <span className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                  style={{ background: meta.color + '22', color: meta.color }}>
                  <meta.Icon size={13} />
                </span>
                <span className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {meta.label}
                </span>
                <span className="text-[10px] mr-1 shrink-0" style={{ color: 'var(--text-secondary)' }}>B</span>
                <input
                  type="number" min={1} max={20} value={w}
                  onChange={(e) => setWidgetDefault(meta.type, Number(e.target.value) || 1, h)}
                  className="w-12 text-center text-xs rounded-lg px-1 py-1 focus:outline-none"
                  style={{ background: 'var(--app-surface)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                />
                <span className="text-[10px] mx-1 shrink-0" style={{ color: 'var(--text-secondary)' }}>H</span>
                <input
                  type="number" min={1} max={20} value={h}
                  onChange={(e) => setWidgetDefault(meta.type, w, Number(e.target.value) || 1)}
                  className="w-12 text-center text-xs rounded-lg px-1 py-1 focus:outline-none"
                  style={{ background: 'var(--app-surface)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                />
                <button
                  onClick={() => resetWidgetDefault(meta.type)}
                  disabled={!isOverridden}
                  title={t('widgets.resetDefault')}
                  className="ml-1 hover:opacity-70 disabled:opacity-20 shrink-0"
                  style={{ color: 'var(--accent-red)' }}
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 shrink-0 flex justify-end"
          style={{ borderTop: '1px solid var(--app-border)' }}>
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg hover:opacity-80"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Groups Section ────────────────────────────────────────────────────────────

function GroupsSection() {
  const { groups, addGroup, removeGroup, renameGroup } = useGroupStore();
  const [sectionOpen, setSectionOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const t = useT();

  const handleAdd = () => {
    if (!newName.trim()) return;
    const id = addGroup(newName.trim());
    setNewName('');
    setShowNew(false);
    setExpanded(id);
    setSectionOpen(true);
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
      <button
        onClick={() => setSectionOpen(!sectionOpen)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:opacity-80 transition-opacity"
        style={{ background: 'var(--app-surface)' }}
      >
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: '#06b6d422', color: '#06b6d4' }}>
          <Database size={15} />
        </span>
        <span className="font-semibold text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
          {t('widgets.groupsSection')}
        </span>
        <span className="px-2.5 py-0.5 text-xs font-medium rounded-full"
          style={{ background: '#06b6d422', color: '#06b6d4' }}>
          {groups.length}
        </span>
        <span
          onClick={(e) => { e.stopPropagation(); setShowNew(true); setSectionOpen(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-80"
          style={{ background: 'var(--accent)' }}
          role="button"
        >
          <Plus size={12} /> {t('widgets.newGroup')}
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>
          {sectionOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      {sectionOpen && (
        <div className="p-3 space-y-2" style={{ background: 'var(--app-bg)' }}>
          {showNew && (
            <div className="flex gap-2 mb-1">
              <input autoFocus value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowNew(false); }}
                placeholder={t('widgets.groupPlaceholder')}
                className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={inputStyle}
              />
              <button onClick={handleAdd} disabled={!newName.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-80 disabled:opacity-30"
                style={{ background: 'var(--accent)' }}>
                {t('common.create')}
              </button>
              <button onClick={() => setShowNew(false)} className="hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
                <X size={16} />
              </button>
            </div>
          )}

          {groups.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: 'var(--text-secondary)' }}>
              {t('widgets.noGroupsHint')}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--app-border)' }}>
                <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'var(--app-surface)' }}>
                  <button onClick={() => setExpanded(expanded === group.id ? null : group.id)}
                    style={{ color: 'var(--text-secondary)' }}>
                    {expanded === group.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>

                  {renamingId === group.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input autoFocus value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { renameGroup(group.id, renameValue); setRenamingId(null); }
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        className="flex-1 text-sm rounded-lg px-2.5 py-1 focus:outline-none"
                        style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
                      />
                      <button onClick={() => { renameGroup(group.id, renameValue); setRenamingId(null); }} style={{ color: 'var(--accent-green)' }}><Check size={14} /></button>
                      <button onClick={() => setRenamingId(null)} style={{ color: 'var(--text-secondary)' }}><X size={14} /></button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => setExpanded(expanded === group.id ? null : group.id)}>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{group.name}</p>
                      {group.description && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{group.description}</p>}
                    </div>
                  )}

                  <span className="text-xs px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: 'var(--accent)22', color: 'var(--accent)' }}>
                    {group.datapoints.length} DP
                  </span>
                  <button onClick={() => { setRenamingId(group.id); setRenameValue(group.name); }}
                    className="hover:opacity-70 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => removeGroup(group.id)}
                    className="hover:opacity-70 shrink-0" style={{ color: 'var(--accent-red)' }}>
                    <Trash2 size={13} />
                  </button>
                </div>

                {expanded === group.id && (
                  <div className="px-4 py-3" style={{ background: 'var(--app-bg)', borderTop: '1px solid var(--app-border)' }}>
                    <GroupEditor group={group} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
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
      gridPos: { ...entry.config.gridPos, y: Infinity },
    });
  };

  const handleMove = (entry: WidgetEntry, target: TabTarget) => {
    if (target.tabId === entry.tab.id && target.layoutId === activeLayoutId) return;
    addWidgetToLayoutTab(target.layoutId, target.tabId, {
      ...entry.config,
      gridPos: { ...entry.config.gridPos, y: Infinity },
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

      {/* Groups section */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-3 px-1" style={{ color: 'var(--text-secondary)' }}>
          {t('widgets.groups')}
        </p>
        <GroupsSection />
      </div>

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
