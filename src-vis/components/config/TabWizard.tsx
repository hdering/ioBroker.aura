import { useState, useEffect, useMemo } from 'react';
import {
  Wand2, ChevronRight, ChevronLeft, Search,
  Check, X, ListFilter, SlidersHorizontal, LayoutDashboard,
} from 'lucide-react';
import type { WidgetConfig, WidgetType } from '../../types';
import { useDatapointList } from '../../hooks/useDatapointList';
import { useConfigStore } from '../../store/configStore';
import { detectType, cleanTitle } from '../../utils/widgetDetection';
import { generateLayouts } from '../../utils/layoutGenerator';
import { useT } from '../../i18n';
import { isRelevantDp } from '../../utils/dpRelevance';
import { applyDpNameFilter } from '../../utils/dpNameFilter';
import { WIDGET_REGISTRY, WIDGET_BY_TYPE } from '../../widgetRegistry';

// ── types ──────────────────────────────────────────────────────────────────

type Step = 'intro' | 'datapoints' | 'review';

const MAX_DISPLAY = 250;

// ── layout options ─────────────────────────────────────────────────────────

const LAYOUT_OPTIONS = [
  { id: 'compact',  label: 'Kompakt' },
  { id: 'standard', label: 'Standard' },
  { id: 'wide',     label: 'Großzügig' },
];

// ── widget types selectable per DP ─────────────────────────────────────────

const DP_WIDGET_TYPES = WIDGET_REGISTRY.filter((m) => m.addMode === 'datapoint');

// ── props ──────────────────────────────────────────────────────────────────

interface TabWizardProps {
  onAdd: (name: string, widgets: WidgetConfig[]) => void;
  onClose: () => void;
}

// ── component ──────────────────────────────────────────────────────────────

export function TabWizard({ onAdd, onClose }: TabWizardProps) {
  const t = useT();

  const [step, setStep]                         = useState<Step>('intro');
  const [tabName, setTabName]                   = useState('');
  const [selectedLayoutId, setSelectedLayoutId] = useState('standard');

  // DP filter state
  const [search, setSearch]         = useState('');
  const [adapter, setAdapter]       = useState('');
  const [room, setRoom]             = useState('');
  const [func, setFunc]             = useState('');
  const [role, setRole]             = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // per-DP overrides (populated on entering review step)
  const [widgetTypeOverrides, setWidgetTypeOverrides] = useState<Map<string, WidgetType>>(new Map());
  const [titleOverrides, setTitleOverrides]           = useState<Map<string, string>>(new Map());

  const { datapoints, loading: dpLoading, load } = useDatapointList();

  const snapX             = useConfigStore((s) => s.frontend.gridSnapX ?? s.frontend.gridRowHeight ?? 20);
  const gridGap           = useConfigStore((s) => s.frontend.gridGap ?? 10);
  const guidelinesEnabled = useConfigStore((s) => s.frontend.guidelinesEnabled ?? false);
  const guidelinesWidth   = useConfigStore((s) => s.frontend.guidelinesWidth ?? 1280);
  const canvasWidth       = guidelinesEnabled ? guidelinesWidth : 1200;
  const effectiveCols     = Math.max(2, Math.floor((canvasWidth - gridGap) / (snapX + gridGap)));

  useEffect(() => { load(true); }, [load]);

  // ── filter options ─────────────────────────────────────────────────────

  const adapters = useMemo(
    () => Array.from(new Set(datapoints.map((dp) => dp.id.split('.')[0]))).sort(),
    [datapoints],
  );
  const rooms = useMemo(
    () => Array.from(new Set(datapoints.flatMap((dp) => dp.rooms))).sort(),
    [datapoints],
  );
  const funcs = useMemo(
    () => Array.from(new Set(datapoints.flatMap((dp) => dp.funcs))).sort(),
    [datapoints],
  );
  const roles = useMemo(
    () => Array.from(new Set(datapoints.map((dp) => dp.role).filter(Boolean) as string[])).sort(),
    [datapoints],
  );
  const types = useMemo(
    () => Array.from(new Set(datapoints.map((dp) => dp.type).filter(Boolean) as string[])).sort(),
    [datapoints],
  );

  // ── filtered DP list ───────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = datapoints;
    if (adapter)    list = list.filter((dp) => dp.id.startsWith(adapter + '.'));
    if (room)       list = list.filter((dp) => dp.rooms.includes(room));
    if (func)       list = list.filter((dp) => dp.funcs.includes(func));
    if (role)       list = list.filter((dp) => dp.role === role);
    if (typeFilter) list = list.filter((dp) => dp.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((dp) => dp.id.toLowerCase().includes(q) || dp.name.toLowerCase().includes(q));
    }
    return list;
  }, [datapoints, adapter, room, func, role, typeFilter, search]);

  const shown = useMemo(() => filtered.slice(0, MAX_DISPLAY), [filtered]);

  // ── selected DPs in order ──────────────────────────────────────────────

  const selectedDps = useMemo(
    () => datapoints.filter((dp) => checkedIds.has(dp.id)),
    [datapoints, checkedIds],
  );

  // ── step transitions ───────────────────────────────────────────────────

  const enterReview = () => {
    const typeMap = new Map<string, WidgetType>();
    const titleMap = new Map<string, string>();
    selectedDps.forEach((dp) => {
      typeMap.set(dp.id, detectType(dp).type);
      titleMap.set(dp.id, applyDpNameFilter(cleanTitle(dp)));
    });
    setWidgetTypeOverrides(typeMap);
    setTitleOverrides(titleMap);
    setStep('review');
  };

  const goNext = () => {
    if (step === 'intro')       setStep('datapoints');
    else if (step === 'datapoints') enterReview();
  };
  const goBack = () => {
    if (step === 'datapoints') setStep('intro');
    else if (step === 'review')     setStep('datapoints');
  };

  // ── create tab ─────────────────────────────────────────────────────────

  const handleCreate = () => {
    if (selectedDps.length === 0) return;
    const name = tabName.trim() || 'Tab';
    const ts = Date.now();
    const activeWidgets = selectedDps.map((dp) => {
      const widgetType = widgetTypeOverrides.get(dp.id) ?? detectType(dp).type;
      const { unit } = detectType(dp);
      const title = titleOverrides.get(dp.id) || cleanTitle(dp);
      return { datapoint: dp, type: widgetType, title, unit, score: 1 } as const;
    });
    const layouts = generateLayouts(activeWidgets, undefined, { gridCols: effectiveCols });
    const layout = layouts.find((l) => l.id === selectedLayoutId) ?? layouts[0];
    if (!layout) return;
    const widgets = layout.widgets.map((w, i) => ({ ...w, id: `wiz-${ts}-${i}` }));
    onAdd(name, widgets);
  };

  // ── step progress ──────────────────────────────────────────────────────

  const steps: Step[] = ['intro', 'datapoints', 'review'];
  const stepIdx = steps.indexOf(step);
  const isLastStep = stepIdx === steps.length - 1;

  const canNext   = step === 'intro' || (step === 'datapoints' && checkedIds.size > 0);
  const canCreate = selectedDps.length > 0;

  // ── render ─────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden"
        style={{ background: 'linear-gradient(var(--app-surface), var(--app-surface)), var(--app-bg)', border: '1px solid var(--app-border)', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 shrink-0" style={{ borderBottom: '1px solid var(--app-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wand2 size={18} style={{ color: 'var(--accent)' }} />
              <h2 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Tab-Wizard</h2>
            </div>
            <button onClick={onClose} className="hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
              <X size={18} />
            </button>
          </div>
          {/* Progress dots */}
          <div className="flex items-center gap-2">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full transition-colors"
                  style={{ background: i <= stepIdx ? 'var(--accent)' : 'var(--app-border)' }}
                />
                {i < steps.length - 1 && <div className="w-6 h-px" style={{ background: 'var(--app-border)' }} />}
              </div>
            ))}
          </div>
        </div>

        {/* Loading bar */}
        {dpLoading && (
          <div className="h-0.5 shrink-0 overflow-hidden" style={{ background: 'var(--app-border)' }}>
            <div
              className="h-full"
              style={{ background: 'var(--accent)', animation: 'wizard-loading 1.4s ease-in-out infinite' }}
            />
          </div>
        )}
        <style>{`
          @keyframes wizard-loading {
            0%   { transform: translateX(-100%); width: 40%; }
            50%  { transform: translateX(160%);  width: 60%; }
            100% { transform: translateX(300%);  width: 40%; }
          }
        `}</style>

        {/* Content */}
        <div className="aura-scroll flex-1 overflow-y-auto p-6 min-h-0">

          {/* ── STEP: intro ── */}
          {step === 'intro' && (
            <div className="space-y-5">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Der Tab-Wizard erstellt einen neuen Tab und befüllt ihn automatisch mit passenden Widgets.
              </p>
              <div className="space-y-3">
                {[
                  {
                    icon: <ListFilter size={18} />,
                    title: '1. Datenpunkte auswählen',
                    desc: 'Filtere nach Adapter, Raum, Funktion, Rolle oder Typ und wähle die gewünschten Datenpunkte aus.',
                  },
                  {
                    icon: <SlidersHorizontal size={18} />,
                    title: '2. Widget-Typen prüfen',
                    desc: 'Für jeden Datenpunkt wird automatisch ein passender Widget-Typ vorgeschlagen – du kannst ihn anpassen, den Namen bearbeiten oder Datenpunkte entfernen.',
                  },
                  {
                    icon: <LayoutDashboard size={18} />,
                    title: '3. Tab erstellen',
                    desc: 'Wähle das Layout (Kompakt, Standard oder Großzügig), vergib einen Namen und leg den Tab an.',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex gap-4 px-4 py-3 rounded-xl"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                  >
                    <div
                      className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
                    >
                      {item.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>{item.title}</p>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP: datapoints ── */}
          {step === 'datapoints' && (
            <div className="space-y-3">
              {/* Filter bar */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div
                    className="flex items-center gap-2 flex-1 rounded-lg px-3 py-2"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                  >
                    <Search size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t('dp.picker.search')}
                      className="flex-1 text-sm bg-transparent focus:outline-none"
                      style={{ color: 'var(--text-primary)' }}
                    />
                    {search && (
                      <button onClick={() => setSearch('')} style={{ color: 'var(--text-secondary)' }}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  {adapters.length > 0 && (
                    <select
                      value={adapter}
                      onChange={(e) => setAdapter(e.target.value)}
                      className="rounded-lg px-3 py-2 text-sm focus:outline-none"
                      style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                    >
                      <option value="">{t('dp.picker.allAdapters')}</option>
                      {adapters.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  )}
                </div>
                {(rooms.length > 0 || funcs.length > 0 || roles.length > 0 || types.length > 1) && (
                  <div className="flex gap-2 flex-wrap">
                    {rooms.length > 0 && (
                      <select value={room} onChange={(e) => setRoom(e.target.value)}
                        className="rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
                        <option value="">{t('dp.picker.allRooms')}</option>
                        {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                    {funcs.length > 0 && (
                      <select value={func} onChange={(e) => setFunc(e.target.value)}
                        className="rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
                        <option value="">{t('dp.picker.allFuncs')}</option>
                        {funcs.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    )}
                    {roles.length > 0 && (
                      <select value={role} onChange={(e) => setRole(e.target.value)}
                        className="rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
                        <option value="">{t('dp.picker.allRoles')}</option>
                        {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                    {types.length > 1 && (
                      <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                        className="rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                        style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}>
                        <option value="">{t('dp.picker.allTypes')}</option>
                        {types.map((ty) => {
                          const tc = ty === 'boolean' ? '#f59e0b' : ty === 'number' ? '#3b82f6' : ty === 'string' ? '#8b5cf6' : 'var(--text-primary)';
                          return <option key={ty} value={ty} style={{ color: tc }}>{ty}</option>;
                        })}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Count + select controls */}
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-[11px] flex-1" style={{ color: 'var(--text-secondary)' }}>
                  {filtered.length > MAX_DISPLAY
                    ? t('dp.picker.showing', { max: MAX_DISPLAY, count: filtered.length })
                    : t('dp.picker.count', { count: filtered.length })}
                  {checkedIds.size > 0 && (
                    <span className="ml-2 font-medium" style={{ color: 'var(--accent)' }}>
                      · {checkedIds.size} ausgewählt
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCheckedIds((prev) => {
                      const next = new Set(prev);
                      shown.filter((dp) => isRelevantDp(dp.role, dp.type)).forEach((dp) => next.add(dp.id));
                      return next;
                    })}
                    className="text-[10px] hover:opacity-70 px-2 py-0.5 rounded"
                    style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
                  >
                    Relevante
                  </button>
                  <button
                    onClick={() => setCheckedIds((prev) => {
                      const next = new Set(prev);
                      shown.forEach((dp) => next.add(dp.id));
                      return next;
                    })}
                    className="text-[10px] hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Alle
                  </button>
                  <button
                    onClick={() => setCheckedIds(new Set())}
                    className="text-[10px] hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Keine
                  </button>
                </div>
              </div>

              {/* DP list */}
              <div className="aura-scroll space-y-0.5 max-h-80 overflow-y-auto">
                {shown.length === 0 ? (
                  <p className="text-xs text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                    {dpLoading ? t('common.loading') : t('dp.picker.noResults')}
                  </p>
                ) : (
                  shown.map((dp) => {
                    const isChecked = checkedIds.has(dp.id);
                    const relevant  = isRelevantDp(dp.role, dp.type);
                    return (
                      <button
                        key={dp.id}
                        onClick={() => setCheckedIds((prev) => {
                          const next = new Set(prev);
                          isChecked ? next.delete(dp.id) : next.add(dp.id);
                          return next;
                        })}
                        className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 hover:opacity-80 transition-opacity"
                        style={{
                          background: isChecked ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--app-bg)',
                          border: `1px solid ${isChecked ? 'var(--accent)33' : 'var(--app-border)'}`,
                          opacity: relevant ? 1 : 0.55,
                        }}
                      >
                        <div
                          className="w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center"
                          style={{ background: isChecked ? 'var(--accent)' : 'var(--app-border)', flexShrink: 0 }}
                        >
                          {isChecked && <Check size={9} color="#fff" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-xs font-medium truncate"
                            style={{ color: isChecked ? 'var(--accent)' : 'var(--text-primary)' }}
                          >
                            {dp.name || dp.id.split('.').pop() || dp.id}
                          </p>
                          <p className="text-[10px] font-mono truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {dp.id}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {dp.unit && (
                            <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>{dp.unit}</span>
                          )}
                          {dp.role && (
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded hidden sm:inline"
                              style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
                            >
                              {dp.role}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ── STEP: review ── */}
          {step === 'review' && (
            <div className="space-y-2">
              <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                {selectedDps.length} Datenpunkt{selectedDps.length !== 1 ? 'e' : ''} – Widget-Typ prüfen und ggf. ändern.
              </p>
              {selectedDps.map((dp) => {
                const currentType = widgetTypeOverrides.get(dp.id) ?? detectType(dp).type;
                const meta = WIDGET_BY_TYPE[currentType];
                return (
                  <div
                    key={dp.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                  >
                    {/* Widget type color dot */}
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: meta?.color ?? 'var(--app-border)' }}
                    />
                    {/* DP title (editable) + id */}
                    <div className="flex-1 min-w-0">
                      <input
                        value={titleOverrides.get(dp.id) ?? ''}
                        onChange={(e) => setTitleOverrides((prev) => {
                          const next = new Map(prev);
                          next.set(dp.id, e.target.value);
                          return next;
                        })}
                        className="w-full text-xs font-medium rounded px-1.5 py-0.5 focus:outline-none"
                        style={{
                          color: 'var(--text-primary)',
                          background: 'var(--app-surface)',
                          border: '1px solid var(--app-border)',
                        }}
                      />
                      <p className="text-[10px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                        {dp.id}
                      </p>
                    </div>
                    {/* Widget type select */}
                    <select
                      value={currentType}
                      onChange={(e) => setWidgetTypeOverrides((prev) => {
                        const next = new Map(prev);
                        next.set(dp.id, e.target.value as WidgetType);
                        return next;
                      })}
                      className="rounded-lg px-2 py-1 text-xs focus:outline-none shrink-0"
                      style={{ background: 'var(--app-surface)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
                    >
                      {DP_WIDGET_TYPES.map((m) => (
                        <option key={m.type} value={m.type}>{m.label}</option>
                      ))}
                    </select>
                    {/* Remove button */}
                    <button
                      onClick={() => setCheckedIds((prev) => { const next = new Set(prev); next.delete(dp.id); return next; })}
                      className="hover:opacity-70 shrink-0"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 shrink-0 flex items-center gap-3" style={{ borderTop: '1px solid var(--app-border)' }}>
          <button
            onClick={step === 'intro' ? onClose : goBack}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm hover:opacity-80"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
          >
            {step === 'intro'
              ? <><X size={14} /> {t('wizard.tab.cancel')}</>
              : <><ChevronLeft size={14} /> {t('wizard.tab.back')}</>}
          </button>

          {isLastStep && (
            <>
              {/* Layout toggle */}
              <div className="flex gap-1">
                {LAYOUT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSelectedLayoutId(opt.id)}
                    className="px-2.5 py-1.5 text-xs rounded-lg transition-colors"
                    style={{
                      background: selectedLayoutId === opt.id ? 'var(--accent)' : 'var(--app-bg)',
                      color: selectedLayoutId === opt.id ? '#fff' : 'var(--text-secondary)',
                      border: '1px solid var(--app-border)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* Tab name */}
              <input
                value={tabName}
                onChange={(e) => setTabName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) handleCreate(); }}
                placeholder="Tab-Name"
                className="flex-1 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
              />
            </>
          )}

          {!isLastStep ? (
            <button
              onClick={goNext}
              disabled={!canNext}
              className="ml-auto flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-80 disabled:opacity-30"
              style={{ background: 'var(--accent)' }}
            >
              {t('wizard.tab.next')} <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={!canCreate}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-80 disabled:opacity-30"
              style={{ background: 'var(--accent-green)' }}
            >
              <Check size={14} /> {t('wizard.tab.create')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
