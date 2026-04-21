import { useState, useEffect, useMemo } from 'react';
import {
  Wand2, ChevronRight, ChevronLeft, Layers, Search,
  Check, X, Zap, Battery, Maximize2,
} from 'lucide-react';
import type { WidgetConfig } from '../../types';
import { useDatapointList, type DatapointEntry } from '../../hooks/useDatapointList';
import { useConfigStore } from '../../store/configStore';
import { detectType, cleanTitle } from '../../utils/widgetDetection';
import { generateLayouts } from '../../utils/layoutGenerator';
import { useT } from '../../i18n';
import { isRelevantDp } from '../../utils/dpRelevance';

// ── types ──────────────────────────────────────────────────────────────────

type ThemeKey = 'all' | 'battery' | 'window' | 'power';
type Step = 'theme' | 'datapoints' | 'layout';

const MAX_DISPLAY = 250;

// ── theme matching ─────────────────────────────────────────────────────────

function matchesTheme(dp: DatapointEntry, theme: ThemeKey): boolean {
  if (theme === 'all') return true;
  const role = (dp.role ?? '').toLowerCase();
  const id = dp.id.toLowerCase();
  const name = dp.name.toLowerCase();
  switch (theme) {
    case 'battery':
      return role.includes('bat') || role.includes('lowbat') ||
             id.includes('lowbat') || id.includes('battery') ||
             name.includes('batterie') || name.includes('battery');
    case 'window':
      return role.includes('window') || role.includes('door') ||
             id.includes('fenster') || id.includes('window') || id.includes('door') ||
             name.includes('fenster') || name.includes('window');
    case 'power':
      return role.includes('power') || role.includes('energy') || role.includes('consumption') ||
             dp.unit === 'W' || dp.unit === 'kWh' || dp.unit === 'VA' || dp.unit === 'Wh';
  }
}

// ── layout preview thumbnails ──────────────────────────────────────────────

const LAYOUT_OPTIONS = [
  { id: 'compact',  label: 'Kompakt',    desc: 'Mehr Widgets auf einen Blick – kleinere Kacheln', cols: 4, itemH: 3, count: 8 },
  { id: 'standard', label: 'Standard',   desc: 'Ausgewogene Darstellung mit gut lesbaren Widgets', cols: 2, itemH: 5, count: 4 },
  { id: 'wide',     label: 'Großzügig',  desc: 'Große Kacheln – ideal für Wandtablets',            cols: 1, itemH: 8, count: 2 },
];

// ── props ──────────────────────────────────────────────────────────────────

interface TabWizardProps {
  onAdd: (name: string, widgets: WidgetConfig[]) => void;
  onClose: () => void;
}

// ── component ──────────────────────────────────────────────────────────────

export function TabWizard({ onAdd, onClose }: TabWizardProps) {
  const t = useT();

  const [step, setStep]                     = useState<Step>('theme');
  const [theme, setTheme]                   = useState<ThemeKey>('all');
  const [tabName, setTabName]               = useState('');
  const [selectedLayoutId, setSelectedLayoutId] = useState('standard');

  // DP filter state (used in datapoints step)
  const [search, setSearch]   = useState('');
  const [adapter, setAdapter] = useState('');
  const [room, setRoom]       = useState('');
  const [func, setFunc]       = useState('');
  const [role, setRole]       = useState('');
  const [showAll, setShowAll] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const { datapoints, loading: dpLoading, load } = useDatapointList();

  const snapX             = useConfigStore((s) => s.frontend.gridSnapX ?? s.frontend.gridRowHeight ?? 20);
  const gridGap           = useConfigStore((s) => s.frontend.gridGap ?? 10);
  const guidelinesEnabled = useConfigStore((s) => s.frontend.guidelinesEnabled ?? false);
  const guidelinesWidth   = useConfigStore((s) => s.frontend.guidelinesWidth ?? 1280);
  const canvasWidth       = guidelinesEnabled ? guidelinesWidth : 1200;
  const effectiveCols     = Math.max(2, Math.floor((canvasWidth - gridGap) / (snapX + gridGap)));

  useEffect(() => { load(true); }, [load]);

  // ── filter options (always from full DP list) ──────────────────────────

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

  // ── filtered DP list ───────────────────────────────────────────────────

  const themeFiltered = useMemo(
    () => datapoints.filter((dp) => showAll || matchesTheme(dp, theme)),
    [datapoints, theme, showAll],
  );

  const filtered = useMemo(() => {
    let list = themeFiltered;
    if (adapter) list = list.filter((dp) => dp.id.startsWith(adapter + '.'));
    if (room)    list = list.filter((dp) => dp.rooms.includes(room));
    if (func)    list = list.filter((dp) => dp.funcs.includes(func));
    if (role)    list = list.filter((dp) => dp.role === role);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((dp) => dp.id.toLowerCase().includes(q) || dp.name.toLowerCase().includes(q));
    }
    return list;
  }, [themeFiltered, adapter, room, func, role, search]);

  const shown = useMemo(() => filtered.slice(0, MAX_DISPLAY), [filtered]);

  // ── active widgets (checked DPs → DetectedWidget shape) ──────────────

  const activeWidgets = useMemo(
    () => datapoints
      .filter((dp) => checkedIds.has(dp.id))
      .map((dp) => {
        const { type, unit } = detectType(dp);
        return { datapoint: dp, type, title: cleanTitle(dp), unit, score: 1 } as const;
      }),
    [datapoints, checkedIds],
  );

  // ── step transitions ───────────────────────────────────────────────────

  const initCheckedIds = (dps: DatapointEntry[], selectedTheme: ThemeKey) =>
    new Set(
      dps
        .filter((dp) => matchesTheme(dp, selectedTheme) && isRelevantDp(dp.role, dp.type))
        .map((dp) => dp.id),
    );

  const enterDatapoints = () => {
    setSearch(''); setAdapter(''); setRoom(''); setFunc(''); setRole(''); setShowAll(false);
    setCheckedIds(initCheckedIds(datapoints, theme));
    setStep('datapoints');
  };

  const goNext = () => {
    if (step === 'theme')      enterDatapoints();
    else if (step === 'datapoints') setStep('layout');
  };

  const goBack = () => {
    if (step === 'datapoints') setStep('theme');
    else if (step === 'layout')     setStep('datapoints');
  };

  // If DPs finish loading while on the datapoints step and nothing is checked yet, auto-init
  useEffect(() => {
    if (step === 'datapoints' && !dpLoading && datapoints.length > 0 && checkedIds.size === 0) {
      setCheckedIds(initCheckedIds(datapoints, theme));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpLoading]);

  // ── create tab ─────────────────────────────────────────────────────────

  const handleCreate = () => {
    if (activeWidgets.length === 0) return;
    const themeLabel = THEMES.find((th) => th.key === theme)?.label ?? 'Tab';
    const name = tabName.trim() || themeLabel;
    const ts = Date.now();
    const layouts = generateLayouts(activeWidgets, undefined, { gridCols: effectiveCols });
    const layout = layouts.find((l) => l.id === selectedLayoutId) ?? layouts[0];
    if (!layout) return;
    const widgets = layout.widgets.map((w, i) => ({ ...w, id: `wiz-${ts}-${i}` }));
    onAdd(name, widgets);
  };

  // ── step progress ──────────────────────────────────────────────────────

  const steps: Step[] = ['theme', 'datapoints', 'layout'];
  const stepIdx = steps.indexOf(step);
  const isLastStep = stepIdx === steps.length - 1;

  const canNext =
    step === 'theme' ||
    (step === 'datapoints' && checkedIds.size > 0) ||
    step === 'layout';
  const canCreate = activeWidgets.length > 0;

  // ── theme definitions (translated) ────────────────────────────────────

  const THEMES = useMemo(() => [
    {
      key: 'all' as ThemeKey,
      label: t('wizard.tab.themeAll'),
      hint: t('wizard.tab.themeAllHint'),
      icon: <Layers size={24} />,
    },
    {
      key: 'battery' as ThemeKey,
      label: t('wizard.tab.themeBattery'),
      hint: t('wizard.tab.themeBatteryHint'),
      icon: <Battery size={24} />,
    },
    {
      key: 'window' as ThemeKey,
      label: t('wizard.tab.themeWindow'),
      hint: t('wizard.tab.themeWindowHint'),
      icon: <Maximize2 size={24} />,
    },
    {
      key: 'power' as ThemeKey,
      label: t('wizard.tab.themePower'),
      hint: t('wizard.tab.themePowerHint'),
      icon: <Zap size={24} />,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t]);

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

          {/* ── STEP: theme ── */}
          {step === 'theme' && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {t('wizard.tab.selectTheme')}
              </p>
              <div className="grid grid-cols-2 gap-4">
                {THEMES.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setTheme(opt.key)}
                    className="p-5 rounded-xl text-left transition-all hover:opacity-90"
                    style={{
                      background: theme === opt.key ? 'var(--accent)11' : 'var(--app-bg)',
                      border: `2px solid ${theme === opt.key ? 'var(--accent)' : 'var(--app-border)'}`,
                    }}
                  >
                    <div className="mb-2" style={{ color: theme === opt.key ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      {opt.icon}
                    </div>
                    <p className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{opt.label}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{opt.hint}</p>
                  </button>
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
                {(rooms.length > 0 || funcs.length > 0 || roles.length > 0) && (
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
                {theme !== 'all' && (
                  <button
                    onClick={() => setShowAll((prev) => !prev)}
                    className="text-[10px] hover:opacity-70 px-2 py-0.5 rounded"
                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                  >
                    {showAll ? t('wizard.tab.showThemeOnly') : t('wizard.tab.showAllDp')}
                  </button>
                )}
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

          {/* ── STEP: layout ── */}
          {step === 'layout' && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {t('wizard.tab.selectLayout')} – {activeWidgets.length} {activeWidgets.length !== 1 ? t('wizard.tab.widgets') : t('wizard.tab.widget')} ausgewählt
              </p>
              <div className="grid grid-cols-3 gap-4">
                {LAYOUT_OPTIONS.map((opt) => {
                  const selected = selectedLayoutId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedLayoutId(opt.id)}
                      className="p-4 rounded-xl text-left transition-all hover:opacity-90"
                      style={{
                        background: selected ? 'var(--accent)11' : 'var(--app-bg)',
                        border: `2px solid ${selected ? 'var(--accent)' : 'var(--app-border)'}`,
                      }}
                    >
                      {/* Mini grid preview */}
                      <div
                        className="mb-3 grid gap-0.5"
                        style={{ gridTemplateColumns: `repeat(${opt.cols}, 1fr)` }}
                      >
                        {Array.from({ length: opt.count }).map((_, i) => (
                          <div
                            key={i}
                            className="rounded-sm"
                            style={{
                              height: opt.itemH * 4,
                              background: selected ? 'var(--accent)33' : 'var(--app-border)',
                            }}
                          />
                        ))}
                      </div>
                      <p
                        className="text-xs font-semibold mb-1"
                        style={{ color: selected ? 'var(--accent)' : 'var(--text-primary)' }}
                      >
                        {opt.label}
                      </p>
                      <p className="text-[10px] leading-tight" style={{ color: 'var(--text-secondary)' }}>
                        {opt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 shrink-0 flex items-center gap-3" style={{ borderTop: '1px solid var(--app-border)' }}>
          <button
            onClick={step === 'theme' ? onClose : goBack}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm hover:opacity-80"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
          >
            {step === 'theme'
              ? <><X size={14} /> {t('wizard.tab.cancel')}</>
              : <><ChevronLeft size={14} /> {t('wizard.tab.back')}</>}
          </button>

          {isLastStep && (
            <input
              value={tabName}
              onChange={(e) => setTabName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) handleCreate(); }}
              placeholder={THEMES.find((th) => th.key === theme)?.label ?? 'Tab-Name'}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
              style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
            />
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
