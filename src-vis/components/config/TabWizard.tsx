import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Wand2, ChevronRight, ChevronLeft, Home, Layers, Search,
  Check, X, Lightbulb, Thermometer, Zap, Wind,
  ShieldCheck, BlindsIcon as Blinds, Power,
} from 'lucide-react';
import type { WidgetConfig, WidgetType } from '../../types';
import { useDatapointList } from '../../hooks/useDatapointList';
import { useConfigStore } from '../../store/configStore';
import { detectWidgets, detectHomepage, type HomepageCategory } from '../../utils/widgetDetection';
import { generateLayouts } from '../../utils/layoutGenerator';
import { WIDGET_BY_TYPE } from '../../widgetRegistry';
import { useT } from '../../i18n';
import { isRelevantDp } from '../../utils/dpRelevance';

// ── type colors (used in datapoint list badges) ────────────────────────────

const TYPE_COLOR = Object.fromEntries(
  Object.entries(WIDGET_BY_TYPE).map(([t, m]) => [t, m.color]),
) as Record<WidgetType, string>;

const GROUP_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#a78bfa',
];

// ── topic suggestions ──────────────────────────────────────────────────────

const SUGGESTION_KEYS = [
  { key: 'wizard.tab.topicLight'    as const, icon: <Lightbulb size={14} /> },
  { key: 'wizard.tab.topicHeating'  as const, icon: <Thermometer size={14} /> },
  { key: 'wizard.tab.topicEnergy'   as const, icon: <Zap size={14} /> },
  { key: 'wizard.tab.topicClimate'  as const, icon: <Wind size={14} /> },
  { key: 'wizard.tab.topicBlinds'   as const, icon: <Blinds size={14} /> },
  { key: 'wizard.tab.topicSockets'  as const, icon: <Power size={14} /> },
  { key: 'wizard.tab.topicSecurity' as const, icon: <ShieldCheck size={14} /> },
];

// ── type label ─────────────────────────────────────────────────────────────

// Derived from central registry
const TYPE_LABEL = Object.fromEntries(
  Object.entries(WIDGET_BY_TYPE).map(([t, m]) => [t, m.shortLabel]),
) as Record<WidgetType, string>;

// ── main wizard ────────────────────────────────────────────────────────────

type Mode = 'topic' | 'homepage';
type Step = 'mode' | 'topic-input' | 'datapoints' | 'grouping' | 'homepage-review';
type GroupStyle = 'header' | 'autolist' | 'list';

interface TabWizardProps {
  onAdd: (name: string, widgets: WidgetConfig[]) => void;
  onClose: () => void;
}

export function TabWizard({ onAdd, onClose }: TabWizardProps) {
  const t = useT();
  const SUGGESTIONS = useMemo(
    () => SUGGESTION_KEYS.map((s) => ({ label: t(s.key), icon: s.icon })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );
  const [step, setStep] = useState<Step>('mode');
  const [mode, setMode] = useState<Mode>('topic');
  const [topic, setTopic] = useState('');
  const [tabName, setTabName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Grouping: 'none' | 'room' | 'func' + visual style
  const [groupBy, setGroupBy] = useState<'none' | 'room' | 'func'>('none');
  const [groupStyle, setGroupStyle] = useState<GroupStyle>('header');

  const { datapoints, loading: dpLoading, load } = useDatapointList();
  const maxDatapoints = useConfigStore((s) => s.frontend.wizardMaxDatapoints ?? 500);

  // Compute effective grid column count from canvas width + snap setting
  const snapX            = useConfigStore((s) => s.frontend.gridSnapX ?? s.frontend.gridRowHeight ?? 20);
  const gridGap          = useConfigStore((s) => s.frontend.gridGap ?? 10);
  const guidelinesEnabled = useConfigStore((s) => s.frontend.guidelinesEnabled ?? false);
  const guidelinesWidth   = useConfigStore((s) => s.frontend.guidelinesWidth ?? 1280);
  const canvasWidth = guidelinesEnabled ? guidelinesWidth : 1200;
  const effectiveCols = Math.max(2, Math.floor((canvasWidth - gridGap) / (snapX + gridGap)));

  useEffect(() => { load(true); }, [load]);

  // ── detected widgets (async to avoid blocking the main thread) ───────────

  const [topicWidgets, setTopicWidgets] = useState<ReturnType<typeof detectWidgets>>([]);
  const [detecting, setDetecting] = useState(false);
  const detectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!topic || datapoints.length === 0) { setTopicWidgets([]); return; }
    setDetecting(true);
    if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    detectTimerRef.current = setTimeout(() => {
      setTopicWidgets(detectWidgets(datapoints, topic, maxDatapoints));
      setDetecting(false);
    }, 0);
    return () => { if (detectTimerRef.current) clearTimeout(detectTimerRef.current); };
  }, [datapoints, topic, maxDatapoints]);

  const { sections: homeSections, allWidgets: homeWidgets } = useMemo(
    () => (mode === 'homepage' ? detectHomepage(datapoints) : { sections: [], allWidgets: [] }),
    [mode, datapoints],
  );

  useEffect(() => {
    const list = mode === 'homepage' ? homeWidgets : topicWidgets;
    setHidden(new Set());
    setSelected(new Set(
      list
        .filter((w) => isRelevantDp(w.datapoint.role, w.datapoint.type))
        .map((w) => w.datapoint.id),
    ));
  }, [topicWidgets, homeWidgets, mode]);

  const visibleWidgets = useMemo(
    () => topicWidgets.filter((w) => !hidden.has(w.datapoint.id)),
    [topicWidgets, hidden],
  );

  const filteredWidgets = useMemo(() => {
    if (!search) return visibleWidgets;
    const s = search.toLowerCase();
    return visibleWidgets.filter(
      (w) => w.datapoint.name.toLowerCase().includes(s) || w.datapoint.id.toLowerCase().includes(s),
    );
  }, [visibleWidgets, search]);

  const sourceWidgets = mode === 'homepage' ? homeWidgets : topicWidgets;
  const activeWidgets = sourceWidgets.filter((w) => selected.has(w.datapoint.id));

  // ── grouping ──────────────────────────────────────────────────────────────

  const hasRooms = useMemo(() => activeWidgets.some((w) => w.datapoint.rooms.length > 0), [activeWidgets]);
  const hasFuncs = useMemo(() => activeWidgets.some((w) => w.datapoint.funcs.length > 0), [activeWidgets]);
  const canGroup  = hasRooms || hasFuncs;

  // Reset groupBy if the chosen dimension disappears
  useEffect(() => {
    if (groupBy === 'room' && !hasRooms) setGroupBy('none');
    if (groupBy === 'func' && !hasFuncs) setGroupBy('none');
  }, [hasRooms, hasFuncs, groupBy]);

  const groupKeyOf = (w: typeof activeWidgets[number]) => {
    if (groupBy === 'room') return w.datapoint.rooms[0] ?? t('wizard.tab.noData');
    if (groupBy === 'func') return w.datapoint.funcs[0] ?? t('wizard.tab.noData');
    return '';
  };

  const detectedGroups = useMemo(() => {
    if (groupBy === 'none') return new Map<string, typeof activeWidgets>();
    const groups = new Map<string, typeof activeWidgets>();
    for (const w of activeWidgets) {
      const key = groupKeyOf(w);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(w);
    }
    return groups;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWidgets, groupBy]);

  // Build an id→group lookup for the layout generator
  const idToGroup = useMemo(() => {
    const map = new Map<string, string>();
    detectedGroups.forEach((ws, label) => ws.forEach((w) => map.set(w.datapoint.id, label)));
    return map;
  }, [detectedGroups]);

  const groupMapper = useMemo(
    () => groupBy !== 'none' && detectedGroups.size >= 2
      ? (id: string) => idToGroup.get(id) ?? t('wizard.tab.noData')
      : undefined,
    [groupBy, detectedGroups.size, idToGroup, t],
  );

  // ── navigation ────────────────────────────────────────────────────────────

  const goNext = () => {
    if (step === 'mode') {
      setStep(mode === 'homepage' ? 'homepage-review' : 'topic-input');
    } else if (step === 'topic-input') {
      setStep('datapoints');
    } else if (step === 'datapoints' && canGroup) {
      setStep('grouping');
    }
  };

  const goBack = () => {
    if (step === 'grouping') {
      setStep('datapoints');
    } else if (step === 'datapoints') {
      setStep('topic-input');
    } else if (step === 'topic-input') {
      setStep('mode');
    } else if (step === 'homepage-review') {
      setStep('mode');
    }
  };

  const handleCreate = () => {
    if (activeWidgets.length === 0) return;
    const name = tabName.trim() || (mode === 'homepage' ? t('wizard.tab.homeDefault') : topic);
    const ts = Date.now();
    const layouts = generateLayouts(activeWidgets, groupMapper, {
      gridCols: effectiveCols,
      groupStyle: groupBy !== 'none' ? groupStyle : 'header',
      detectedGroups,
    });
    const layout = layouts.find((l) => l.id === 'standard') ?? layouts[0];
    if (!layout) return;
    const widgets = layout.widgets.map((w, i) => ({ ...w, id: `wiz-${ts}-${i}` }));
    onAdd(name, widgets);
  };

  // ── step progress ─────────────────────────────────────────────────────────

  const steps: Step[] = mode === 'homepage'
    ? ['mode', 'homepage-review']
    : canGroup
      ? ['mode', 'topic-input', 'datapoints', 'grouping']
      : ['mode', 'topic-input', 'datapoints'];
  const stepIdx = steps.indexOf(step);
  const isLastStep = stepIdx === steps.length - 1;

  const canNext =
    step === 'mode' ||
    (step === 'topic-input' && topic.trim().length > 0 && (dpLoading || detecting || topicWidgets.length > 0)) ||
    ((step === 'datapoints' || step === 'homepage-review') && activeWidgets.length > 0);
  const canCreate = activeWidgets.length > 0;

  // ── render ────────────────────────────────────────────────────────────────

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
                {i < steps.length - 1 && (
                  <div className="w-6 h-px" style={{ background: 'var(--app-border)' }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Loading bar */}
        {(dpLoading || detecting) && (
          <div className="h-0.5 shrink-0 overflow-hidden" style={{ background: 'var(--app-border)' }}>
            <div
              className="h-full"
              style={{
                background: 'var(--accent)',
                animation: 'wizard-loading 1.4s ease-in-out infinite',
              }}
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

          {/* ── STEP: mode ── */}
          {step === 'mode' && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {t('wizard.tab.selectMethod')}
              </p>
              <div className="grid grid-cols-2 gap-4">
                {([
                  {
                    key: 'topic' as Mode,
                    icon: <Layers size={28} style={{ color: 'var(--accent)', marginBottom: 8 }} />,
                    label: t('wizard.tab.byTopic'),
                    desc: t('wizard.tab.byTopicHint'),
                  },
                  {
                    key: 'homepage' as Mode,
                    icon: <Home size={28} style={{ color: 'var(--accent-green)', marginBottom: 8 }} />,
                    label: t('wizard.tab.home'),
                    desc: t('wizard.tab.homeHint'),
                  },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setMode(opt.key)}
                    className="p-5 rounded-xl text-left transition-all hover:opacity-90"
                    style={{
                      background: mode === opt.key ? 'var(--accent)11' : 'var(--app-bg)',
                      border: `2px solid ${mode === opt.key ? 'var(--accent)' : 'var(--app-border)'}`,
                    }}
                  >
                    {opt.icon}
                    <p className="font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>{opt.label}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP: topic-input ── */}
          {step === 'topic-input' && (
            <div className="space-y-5">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {t('wizard.tab.whatToShow')}
              </p>
              <input
                autoFocus
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canNext) goNext(); }}
                placeholder={t('wizard.tab.topicPh')}
                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none"
                style={{ background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' }}
              />
              <div>
                <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>{t('wizard.tab.suggestions')}</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => setTopic(s.label)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
                      style={{
                        background: topic === s.label ? 'var(--accent)' : 'var(--app-bg)',
                        color: topic === s.label ? '#fff' : 'var(--text-secondary)',
                        border: `1px solid ${topic === s.label ? 'var(--accent)' : 'var(--app-border)'}`,
                      }}
                    >
                      {s.icon} {s.label}
                    </button>
                  ))}
                </div>
              </div>
              {topic && (
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {(dpLoading || detecting)
                    ? t('wizard.tab.loadingDp')
                    : topicWidgets.length > 0
                      ? t('wizard.tab.foundDp', { count: topicWidgets.length })
                      : t('wizard.tab.noDp')}
                </p>
              )}
            </div>
          )}

          {/* ── STEP: datapoints ── */}
          {step === 'datapoints' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {visibleWidgets.length} {t('wizard.tab.selected').replace(/\d+ /, '')}
                  {hidden.size > 0 && (
                    <button
                      onClick={() => setHidden(new Set())}
                      className="ml-2 text-[10px] hover:opacity-70"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      ({hidden.size} ausgeblendet – zurücksetzen)
                    </button>
                  )}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs mr-1" style={{ color: 'var(--text-secondary)' }}>
                    {activeWidgets.length} {t('wizard.tab.selected')}
                  </span>
                  <button
                    onClick={() => setSelected(new Set(
                      visibleWidgets
                        .filter((w) => isRelevantDp(w.datapoint.role, w.datapoint.type))
                        .map((w) => w.datapoint.id),
                    ))}
                    className="text-[11px] px-2 py-0.5 rounded hover:opacity-80"
                    style={{ color: 'var(--accent)', border: '1px solid var(--accent)' }}
                  >
                    Relevante
                  </button>
                  <button
                    onClick={() => setSelected(new Set(visibleWidgets.map((w) => w.datapoint.id)))}
                    className="text-[11px] px-2 py-0.5 rounded hover:opacity-80"
                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                  >
                    Alle
                  </button>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-[11px] px-2 py-0.5 rounded hover:opacity-80"
                    style={{ color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
                  >
                    Keine
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}>
                <Search size={13} style={{ color: 'var(--text-secondary)' }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('wizard.tab.filter')}
                  className="flex-1 text-xs bg-transparent focus:outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
                {search && <button onClick={() => setSearch('')}><X size={11} style={{ color: 'var(--text-secondary)' }} /></button>}
              </div>

              <div className="aura-scroll space-y-1 max-h-72 overflow-y-auto">
                {filteredWidgets.map((w) => {
                  const on = selected.has(w.datapoint.id);
                  const relevant = isRelevantDp(w.datapoint.role, w.datapoint.type);
                  return (
                    <div
                      key={w.datapoint.id}
                      className="flex items-center gap-1 rounded-lg overflow-hidden"
                      style={{
                        background: on ? 'var(--accent)11' : 'var(--app-bg)',
                        border: `1px solid ${on ? 'var(--accent)33' : 'var(--app-border)'}`,
                        opacity: relevant ? 1 : 0.55,
                      }}
                    >
                      <button
                        onClick={() => {
                          const next = new Set(selected);
                          if (on) next.delete(w.datapoint.id); else next.add(w.datapoint.id);
                          setSelected(next);
                        }}
                        className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left hover:opacity-90 min-w-0"
                      >
                        <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                          style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}>
                          {on && <Check size={10} color="#fff" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{w.title}</p>
                          <p className="text-[10px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{w.datapoint.id}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] px-1.5 py-0.5 rounded"
                            style={{ background: TYPE_COLOR[w.type] + '22', color: TYPE_COLOR[w.type] }}>
                            {TYPE_LABEL[w.type]}
                          </span>
                          {w.unit && <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>{w.unit}</span>}
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setHidden((prev) => new Set([...prev, w.datapoint.id]));
                          setSelected((prev) => { const next = new Set(prev); next.delete(w.datapoint.id); return next; });
                        }}
                        className="px-2 py-2.5 shrink-0 hover:opacity-70"
                        style={{ color: 'var(--text-secondary)' }}
                        title="Ausblenden"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
                {filteredWidgets.length === 0 && (
                  <p className="text-xs text-center py-6" style={{ color: 'var(--text-secondary)' }}>{t('wizard.tab.noResults')}</p>
                )}
              </div>
            </div>
          )}

          {/* ── STEP: grouping ── */}
          {step === 'grouping' && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {t('wizard.tab.grouping', { count: activeWidgets.length })}
              </p>

              {/* GroupBy selector */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'none' as const, label: t('wizard.tab.groupNone'), desc: t('wizard.tab.groupNoneHint'), disabled: false },
                  { key: 'room', label: t('wizard.tab.groupRoom'), desc: t('wizard.tab.groupRoomHint'), disabled: !hasRooms },
                  { key: 'func', label: t('wizard.tab.groupFunc'), desc: t('wizard.tab.groupFuncHint'), disabled: !hasFuncs },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    disabled={opt.disabled}
                    onClick={() => setGroupBy(opt.key)}
                    className="p-3 rounded-xl text-left transition-all hover:opacity-90 disabled:opacity-30"
                    style={{
                      background: groupBy === opt.key ? 'var(--accent)11' : 'var(--app-bg)',
                      border: `2px solid ${groupBy === opt.key ? 'var(--accent)' : 'var(--app-border)'}`,
                    }}
                  >
                    <p className="text-xs font-semibold mb-0.5"
                      style={{ color: groupBy === opt.key ? 'var(--accent)' : 'var(--text-primary)' }}>
                      {opt.label}
                    </p>
                    <p className="text-[10px] leading-tight" style={{ color: 'var(--text-secondary)' }}>
                      {opt.disabled ? t('wizard.tab.noData') : opt.desc}
                    </p>
                  </button>
                ))}
              </div>

              {/* Group style selector */}
              {groupBy !== 'none' && (
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Darstellung der Gruppen</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { key: 'header' as GroupStyle, label: 'Einzelwidgets', desc: 'Abschnittstitel + je ein Widget pro Datenpunkt' },
                      { key: 'list'   as GroupStyle, label: 'Statische Liste', desc: 'Pro Gruppe eine konfigurierte Liste' },
                      { key: 'autolist' as GroupStyle, label: 'Dynamische Liste', desc: 'Pro Gruppe eine automatische Liste' },
                    ]).map((opt) => (
                      <button key={opt.key} onClick={() => setGroupStyle(opt.key)}
                        className="p-3 rounded-xl text-left transition-all hover:opacity-90"
                        style={{
                          background: groupStyle === opt.key ? 'var(--accent)11' : 'var(--app-bg)',
                          border: `2px solid ${groupStyle === opt.key ? 'var(--accent)' : 'var(--app-border)'}`,
                        }}>
                        <p className="text-xs font-semibold mb-0.5"
                          style={{ color: groupStyle === opt.key ? 'var(--accent)' : 'var(--text-primary)' }}>
                          {opt.label}
                        </p>
                        <p className="text-[10px] leading-tight" style={{ color: 'var(--text-secondary)' }}>{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview of groups */}
              {groupBy !== 'none' && detectedGroups.size > 0 && (
                <div className="aura-scroll space-y-2 max-h-48 overflow-y-auto">
                  {Array.from(detectedGroups.entries()).map(([label, widgets], gi) => (
                    <div key={label} className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid var(--app-border)' }}>
                      <div className="flex items-center gap-3 px-4 py-2.5"
                        style={{ background: 'var(--app-bg)', borderBottom: '1px solid var(--app-border)' }}>
                        <div className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: GROUP_COLORS[gi % GROUP_COLORS.length] }} />
                        <p className="flex-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
                        <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                          {widgets.length} {widgets.length !== 1 ? t('wizard.tab.widgets') : t('wizard.tab.widget')}
                        </span>
                      </div>
                      <div className="px-4 py-2 flex flex-wrap gap-1.5" style={{ background: 'var(--app-surface)' }}>
                        {widgets.map((w) => (
                          <span key={w.datapoint.id} className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ background: TYPE_COLOR[w.type] + '22', color: TYPE_COLOR[w.type] }}>
                            {w.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── STEP: homepage-review ── */}
          {step === 'homepage-review' && (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {dpLoading
                  ? t('wizard.tab.readingDp')
                  : t('wizard.tab.foundHomeDp', { count: homeWidgets.length })}
              </p>
              <div className="aura-scroll space-y-3 max-h-72 overflow-y-auto">
                {(homeSections as HomepageCategory[]).map((sec) => (
                  <div key={sec.label}>
                    <p className="text-[11px] font-semibold mb-1 px-1" style={{ color: 'var(--text-secondary)' }}>{sec.label}</p>
                    <div className="space-y-1">
                      {sec.widgets.map((w) => {
                        const on = selected.has(w.datapoint.id);
                        return (
                          <button
                            key={w.datapoint.id}
                            onClick={() => {
                              const next = new Set(selected);
                              if (on) next.delete(w.datapoint.id); else next.add(w.datapoint.id);
                              setSelected(next);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:opacity-90"
                            style={{
                              background: on ? 'var(--accent)11' : 'var(--app-bg)',
                              border: `1px solid ${on ? 'var(--accent)33' : 'var(--app-border)'}`,
                            }}
                          >
                            <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                              style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}>
                              {on && <Check size={10} color="#fff" />}
                            </div>
                            <p className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{w.title}</p>
                            <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                              style={{ background: TYPE_COLOR[w.type] + '22', color: TYPE_COLOR[w.type] }}>
                              {TYPE_LABEL[w.type]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {!dpLoading && homeSections.length === 0 && (
                  <p className="text-xs text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                    {t('wizard.tab.noHomeDp')}
                  </p>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 shrink-0 flex items-center gap-3"
          style={{ borderTop: '1px solid var(--app-border)' }}>
          <button
            onClick={step === 'mode' ? onClose : goBack}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm hover:opacity-80"
            style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)', border: '1px solid var(--app-border)' }}
          >
            {step === 'mode' ? <><X size={14} /> {t('wizard.tab.cancel')}</> : <><ChevronLeft size={14} /> {t('wizard.tab.back')}</>}
          </button>

          {isLastStep && (
            <input
              value={tabName}
              onChange={(e) => setTabName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) handleCreate(); }}
              placeholder={mode === 'homepage' ? t('wizard.tab.homeDefault') : topic}
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
