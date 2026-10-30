import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Check, Database, X, Shapes, Search } from 'lucide-react';
import {
    buildHaystack,
    matchesQuery,
    normalizeQuery,
    templateHaystack,
    widgetHaystack,
} from '../../utils/widgetSearch';
import {
    DP_TEMPLATES,
    DP_TEMPLATE_CATEGORIES,
    detectWidgetTypeFromRole,
    findTemplateByRole,
    findMainDpForSecondary,
    autoDetectStatusDps,
} from '../../utils/dpTemplates';
import { DatapointPicker } from './DatapointPicker';
import { PresetInsertDialog } from './PresetInsertDialog';
import type { WidgetConfig, WidgetType, WidgetPreset } from '../../types';
import { WIDGET_REGISTRY, WIDGET_BY_TYPE, getEffectiveSize } from '../../widgetRegistry';
import { useWidgetPresetsStore } from '../../store/widgetPresetsStore';
import { FEATURES } from '../../featureFlags';
import { applyDpNameFilter } from '../../utils/dpNameFilter';
import { useConfigStore } from '../../store/configStore';
import { useT } from '../../i18n';
import { ensureDatapointCache } from '../../hooks/useDatapointList';
import { hasScaleFromDatapoint, scaleOptionsFromDatapoint } from '../../utils/dpScale';

// ── Recently used templates (persisted in localStorage) ──────────────────────
const RECENT_TEMPLATES_KEY = 'aura-recent-templates';
const MAX_RECENT_TEMPLATES = 5;

interface RecentTemplate {
    templateId: string;
    widgetType: WidgetType;
    label: string;
    icon: string;
}

/** Templates that were merged into another one. A stored "recently used" entry
 *  must not keep pointing at an id the list no longer holds. */
const MERGED_TEMPLATE_IDS: Record<string, string> = { 'blind-tilt': 'shutter' };

function getRecentTemplates(): RecentTemplate[] {
    try {
        const stored = JSON.parse(localStorage.getItem(RECENT_TEMPLATES_KEY) ?? '[]') as RecentTemplate[];
        const seen = new Set<string>();
        const out: RecentTemplate[] = [];
        for (const entry of stored) {
            const templateId = MERGED_TEMPLATE_IDS[entry.templateId] ?? entry.templateId;
            if (seen.has(templateId)) continue;
            seen.add(templateId);
            const tpl = DP_TEMPLATES.find((t) => t.id === templateId);
            out.push({ ...entry, templateId, label: tpl?.label ?? entry.label, icon: tpl?.icon ?? entry.icon });
        }
        return out;
    } catch {
        return [];
    }
}
function pushRecentTemplate(entry: RecentTemplate) {
    const prev = getRecentTemplates().filter((t) => t.templateId !== entry.templateId);
    localStorage.setItem(RECENT_TEMPLATES_KEY, JSON.stringify([entry, ...prev].slice(0, MAX_RECENT_TEMPLATES)));
}

/** The "+ Neues Widget" dialog — shared by the dashboard editor and the popup-view editor. */
export function ManualWidgetDialog({
    onAdd,
    onClose,
    datapointDefault = '',
}: {
    onAdd: (w: WidgetConfig) => void;
    onClose: () => void;
    /** Prefilled datapoint, e.g. `{{dp}}` in a popup view. */
    datapointDefault?: string;
}) {
    const t = useT();
    const widgetDefaults = useConfigStore((s) => s.widgetDefaults);

    const [type, setType] = useState<WidgetType>('value');
    const [templateId, setTemplateId] = useState<string>('');
    const [typePicked, setTypePicked] = useState(false);
    const [title, setTitle] = useState('');
    const [datapoint, setDatapoint] = useState(datapointDefault);
    const [unit, setUnit] = useState('');
    const [showPicker, setShowPicker] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [recentTemplates, setRecentTemplates] = useState<RecentTemplate[]>(() => getRecentTemplates());
    const presets = useWidgetPresetsStore((s) => s.presets);
    const [insertPreset, setInsertPreset] = useState<WidgetPreset | null>(null);
    const [query, setQuery] = useState('');
    const searchRef = useRef<HTMLInputElement>(null);
    const q = normalizeQuery(query);
    const searching = q.length > 0;

    // Auto-detect type / template / title / unit when the datapoint ID changes
    useEffect(() => {
        let cancelled = false;
        const dp = datapoint.trim();
        if (!dp)
            return () => {
                cancelled = true;
            };
        void (async () => {
            try {
                const entries = await ensureDatapointCache();
                if (cancelled) return;
                const entry = entries.find((e) => e.id === dp);
                if (!entry) return;
                if (!title && entry.name) setTitle(entry.name);
                if (!unit && entry.unit) setUnit(entry.unit);
                if (!typePicked) {
                    // If the selected DP is a secondary (e.g. ACTUAL_TEMPERATURE),
                    // upgrade to the primary setpoint DP and set the correct widget type.
                    const upgrade = findMainDpForSecondary(dp, entries);
                    if (upgrade) {
                        setDatapoint(upgrade.mainDpId);
                        setType(upgrade.template.widgetType);
                        setTemplateId(upgrade.template.id);
                        setTypePicked(true);
                    } else {
                        const detected = detectWidgetTypeFromRole(entry.role, entry.type);
                        if (detected) {
                            setType(detected);
                            const tpl = findTemplateByRole(entry.role, entry.type);
                            if (tpl) setTemplateId(tpl.id);
                        }
                    }
                }
            } catch {
                /* ignore */
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [datapoint, typePicked]);

    // The caret starts in the search box, and typing anywhere else in the dialog
    // lands there too - focusing during keydown still lets the character through.
    useEffect(() => {
        searchRef.current?.focus();
    }, []);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (showPicker || insertPreset) return; // a dialog on top owns the keyboard
            if (e.key === 'Escape') {
                if (query) setQuery('');
                else onClose();
                searchRef.current?.focus();
                return;
            }
            const el = e.target as HTMLElement | null;
            const tag = el?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
            if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
            searchRef.current?.focus();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [showPicker, insertPreset, query, onClose]);

    // Widget types from WIDGET_REGISTRY not covered by any DP_TEMPLATE
    const coveredWidgetTypes = useMemo(() => new Set(DP_TEMPLATES.map((t) => t.widgetType)), []);
    const furtherWidgets = useMemo(
        () =>
            // Sort by the displayed label (de locale) so new widget types are
            // inserted alphabetically automatically – no manual ordering needed.
            WIDGET_REGISTRY.filter((w) => !w.hidden && !coveredWidgetTypes.has(w.type)).sort((a, b) =>
                a.label.localeCompare(b.label, 'de'),
            ),
        [coveredWidgetTypes],
    );

    // Searchable text per entry - see utils/widgetSearch for what goes in.
    const templateHaystacks = useMemo(() => {
        const catLabels = new Map(DP_TEMPLATE_CATEGORIES.map((c) => [c.id, c.label]));
        const map = new Map<string, string>();
        for (const tpl of DP_TEMPLATES) {
            map.set(tpl.id, templateHaystack(tpl, WIDGET_BY_TYPE[tpl.widgetType], catLabels.get(tpl.category)));
        }
        return map;
    }, []);
    const widgetHaystacks = useMemo(() => {
        const map = new Map<string, string>();
        for (const w of WIDGET_REGISTRY) map.set(w.type, widgetHaystack(w));
        return map;
    }, []);

    // Hits in the order the grid draws them: category by category, each sorted by
    // label, "Weitere Widgets" last. A search looks through every category, so the
    // category filter is only honoured while the search box is empty.
    const activeCategory = searching ? 'all' : categoryFilter;
    const hitsByCategory = useMemo(
        () =>
            DP_TEMPLATE_CATEGORIES.map((cat) => ({
                cat,
                tpls: DP_TEMPLATES.filter(
                    (tpl) =>
                        tpl.category === cat.id && (!searching || matchesQuery(templateHaystacks.get(tpl.id) ?? '', q)),
                ).sort((a, b) => a.label.localeCompare(b.label)),
            })),
        [q, searching, templateHaystacks],
    );
    const furtherHits = useMemo(
        () => furtherWidgets.filter((w) => !searching || matchesQuery(widgetHaystacks.get(w.type) ?? '', q)),
        [furtherWidgets, q, searching, widgetHaystacks],
    );
    const recentHits = useMemo(() => {
        if (!searching) return recentTemplates;
        return recentTemplates.filter((r) =>
            matchesQuery(
                `${templateHaystacks.get(r.templateId) ?? widgetHaystacks.get(r.widgetType) ?? ''} ${buildHaystack([r.label])}`,
                q,
            ),
        );
    }, [recentTemplates, q, searching, templateHaystacks, widgetHaystacks]);
    const presetHits = useMemo(
        () => (searching ? presets.filter((p) => matchesQuery(buildHaystack([p.name]), q)) : presets),
        [presets, q, searching],
    );
    const hitCount = hitsByCategory.reduce((n, g) => n + g.tpls.length, 0) + furtherHits.length;
    const firstHit = (() => {
        const group = hitsByCategory.find((g) => g.tpls.length);
        if (group) return { tplId: group.tpls[0].id, widgetType: group.tpls[0].widgetType };
        const w = furtherHits[0];
        return w ? { tplId: w.type, widgetType: w.type } : null;
    })();

    const selectedTemplate = DP_TEMPLATES.find((tpl) => tpl.id === templateId);
    const selectedFurther = furtherWidgets.find((w) => w.type === type && templateId === w.type);

    // Picking a category ends the search - otherwise the two filters would fight
    // and an empty grid would look like a broken category.
    const pickCategory = (id: string) => {
        setQuery('');
        setCategoryFilter(id);
    };

    const selectTemplate = (tplId: string, widgetType: WidgetType) => {
        setType(widgetType);
        setTemplateId(tplId);
        setTypePicked(true);
    };

    const selectRecent = (recent: RecentTemplate) => {
        setType(recent.widgetType);
        setTemplateId(recent.templateId);
        setTypePicked(true);
    };

    // widgetType/tplId are passed explicitly so a double-click can select and add
    // in one go, without waiting for the state update to land.
    const handleAdd = async (widgetType: WidgetType = type, tplId: string = templateId) => {
        const meta = WIDGET_BY_TYPE[widgetType];
        const addMode = meta.addMode;
        const isCalendar = widgetType === 'calendar';
        const isEchart = widgetType === 'echart';
        const isEvcc = widgetType === 'evcc';
        const isWeather = widgetType === 'weather';
        const isCamera = widgetType === 'camera';
        // Persist to recently used
        const activeTpl = DP_TEMPLATES.find((tpl) => tpl.id === tplId);
        pushRecentTemplate({
            templateId: tplId || widgetType,
            widgetType,
            label: activeTpl?.label ?? meta.shortLabel ?? widgetType,
            icon: activeTpl?.icon ?? '',
        });
        setRecentTemplates(getRecentTemplates());
        const dpId = addMode !== 'datapoint' ? '' : datapoint.trim();

        let finalTitle = title.trim();
        let finalUnit = unit.trim();
        // Scale bounds the chosen datapoint declares in common.min/max — a room
        // setpoint of 10…30 °C beats the placeholder 0…100 the widget would
        // otherwise start on (#665).
        let dpScale: Record<string, number> = {};

        const takesUnitFromDp = ['value', 'chart', 'gauge', 'fill', 'knob', 'slider'].includes(widgetType);
        if (dpId && (!finalTitle || (takesUnitFromDp && !finalUnit) || hasScaleFromDatapoint(widgetType))) {
            try {
                const entries = await ensureDatapointCache();
                const entry = entries.find((e) => e.id === dpId);
                if (entry) {
                    if (!finalTitle && entry.name) finalTitle = entry.name;
                    if (takesUnitFromDp && !finalUnit && entry.unit) finalUnit = entry.unit;
                    dpScale = scaleOptionsFromDatapoint(widgetType, entry);
                }
            } catch {
                /* ignore */
            }
        }

        // Auto-fill secondary DPs using the selected template's sibling patterns
        const activeTemplate =
            DP_TEMPLATES.find((tpl) => tpl.id === tplId && tpl.secondaryDps.length > 0) ??
            DP_TEMPLATES.find((tpl) => tpl.widgetType === widgetType && tpl.secondaryDps.length > 0);
        const secondaryDpOptions: Record<string, unknown> = {};
        if (dpId) {
            try {
                const entries = await ensureDatapointCache();
                if (activeTemplate) {
                    const parts = dpId.split('.');
                    const parent = parts.slice(0, -1).join('.');
                    const parentUp = parts.slice(0, -2).join('.');
                    const sibs = entries.filter((e) => e.id.startsWith(`${parent}.`));
                    const sibsUp = entries.filter((e) => e.id.startsWith(`${parentUp}.`));
                    for (const sdp of activeTemplate.secondaryDps) {
                        const found =
                            sdp.siblingNames
                                .map((n) => sibs.find((e) => e.id === `${parent}.${n}`)?.id)
                                .find(Boolean) ??
                            sdp.siblingNames
                                .map((n) => sibsUp.find((e) => e.id === `${parentUp}.0.${n}`)?.id)
                                .find(Boolean);
                        if (found) secondaryDpOptions[sdp.optionKey] = found;
                    }
                }
                // Fallback: generic battery/unreach detection for all widget types
                const statusDps = autoDetectStatusDps(dpId, entries);
                if (statusDps.batteryDp && !secondaryDpOptions.batteryDp)
                    secondaryDpOptions.batteryDp = statusDps.batteryDp;
                if (statusDps.unreachDp && !secondaryDpOptions.unreachDp)
                    secondaryDpOptions.unreachDp = statusDps.unreachDp;
            } catch {
                /* ignore */
            }
        }

        onAdd({
            id: `w-${Date.now()}`,
            type: widgetType,
            layout: widgetType === 'universal' ? 'custom' : 'default',
            title: finalTitle || activeTpl?.label || meta.label,
            datapoint: dpId,
            gridPos: { x: 0, y: 9999, ...getEffectiveSize(widgetType, widgetDefaults) },
            options: {
                icon: meta.iconName,
                ...(activeTemplate?.defaultOptions ?? {}),
                ...secondaryDpOptions,
                ...(isCalendar
                    ? {
                          // Calendar sources are configured afterwards in the widget editor.
                          calendars: [],
                          refreshInterval: 30,
                          daysAhead: 14,
                          maxEvents: 5,
                      }
                    : isEvcc
                      ? { evccPrefix: 'evcc.0', loadpointCount: 1, showBattery: true }
                      : isEchart
                        ? {
                              echartSeries: datapoint.trim()
                                  ? [
                                        {
                                            id: Math.random().toString(36).slice(2, 9),
                                            name: finalTitle || 'Serie 1',
                                            datapointId: datapoint.trim(),
                                            chartType: 'line',
                                            color: '#3b82f6',
                                            historyRange: '24h',
                                            smooth: true,
                                            yAxisIndex: 0,
                                            lineWidth: 2,
                                        },
                                    ]
                                  : [],
                              echartShowLegend: true,
                          }
                        : isWeather
                          ? {
                                latitude: 48.1,
                                longitude: 11.6,
                                locationName: '',
                                refreshMinutes: 30,
                                showForecast: true,
                            }
                          : isCamera
                            ? { streamUrl: '', refreshInterval: 5, fitMode: 'cover', showTitle: true }
                            : widgetType === 'gauge'
                              ? {
                                    minValue: 0,
                                    maxValue: 100,
                                    unit: finalUnit || '',
                                    decimals: 1,
                                    showMinMax: true,
                                    colorZones: false,
                                }
                              : widgetType === 'knob'
                                ? {
                                      minValue: 0,
                                      maxValue: 100,
                                      step: 1,
                                      unit: finalUnit || '',
                                      decimals: 0,
                                      startAngle: 135,
                                      endAngle: 405,
                                      pointerStyle: 'line',
                                      color: '#6366f1',
                                      strokeWidth: 14,
                                      showValue: true,
                                      showMinMax: false,
                                  }
                                : finalUnit
                                  ? { unit: finalUnit }
                                  : {}),
                // Last, so the datapoint's own range wins over the placeholder
                // defaults above and over a template's generic bounds.
                ...dpScale,
            },
        });
        onClose();
    };

    const inputCls = 'w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none';
    const inputStyle = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div
                className="rounded-xl w-full max-w-5xl shadow-2xl flex flex-col"
                style={{
                    maxHeight: '96vh',
                    background: 'linear-gradient(var(--app-surface), var(--app-surface)), var(--app-bg)',
                    border: '1px solid var(--app-border)',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-6 pt-5 pb-4"
                    style={{ borderBottom: '1px solid var(--app-border)' }}
                >
                    <h2 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                        {t('editor.manual.title')}
                    </h2>
                    <button onClick={onClose} className="hover:opacity-60" style={{ color: 'var(--text-secondary)' }}>
                        <X size={18} />
                    </button>
                </div>

                {/* Search - the caret sits here when the dialog opens */}
                <div className="px-6 pt-4 pb-1">
                    <div
                        className="flex items-center gap-2 rounded-xl px-3"
                        style={{
                            background: 'var(--app-bg)',
                            border: `1px solid ${searching ? 'var(--accent)' : 'var(--app-border)'}`,
                        }}
                    >
                        <Search size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                // Enter only picks the top hit - adding stays on the
                                // button, so the hint below gets read first.
                                if (e.key !== 'Enter' || !firstHit) return;
                                e.preventDefault();
                                selectTemplate(firstHit.tplId, firstHit.widgetType);
                            }}
                            placeholder={t('editor.manual.searchPlaceholder')}
                            className="flex-1 min-w-0 bg-transparent py-2.5 text-sm focus:outline-none"
                            style={{ color: 'var(--text-primary)' }}
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => {
                                    setQuery('');
                                    searchRef.current?.focus();
                                }}
                                className="shrink-0 hover:opacity-60"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <p className="mt-1.5 text-xs" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                        {searching ? t('editor.manual.searchHits', { n: hitCount }) : t('editor.manual.searchHint')}
                    </p>
                </div>

                {/* DP field */}
                <div className="px-6 pt-4 pb-2">
                    <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                        Datenpunkt{' '}
                        <span className="font-normal opacity-60">(optional – Typ wird automatisch erkannt)</span>
                    </label>
                    <div className="flex gap-1.5">
                        <input
                            value={datapoint}
                            onChange={(e) => setDatapoint(e.target.value)}
                            placeholder="z.B. hm-rpc.0.ABC123.LEVEL"
                            className={`flex-1 font-mono min-w-0 ${inputCls}`}
                            style={inputStyle}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPicker(true)}
                            className="px-3 rounded-xl hover:opacity-80 shrink-0"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            <Database size={15} />
                        </button>
                    </div>
                    <p
                        className="mt-1.5 text-xs flex items-center gap-1"
                        style={{
                            color: 'var(--accent)',
                            visibility: templateId && selectedTemplate ? 'visible' : 'hidden',
                        }}
                    >
                        <Check size={11} />
                        Erkannt als: <strong>{selectedTemplate?.label ?? ' '}</strong>
                    </p>
                </div>

                {/* Recently used */}
                {recentHits.length > 0 && (
                    <div className="px-6 pt-3 pb-1">
                        <p
                            className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                            style={{ color: 'var(--text-secondary)', opacity: 0.5 }}
                        >
                            {t('editor.manual.recentlyUsed')}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {recentHits.map((recent) => {
                                const meta = WIDGET_REGISTRY.find((w) => w.type === recent.widgetType);
                                if (!meta) return null;
                                const isActive = templateId === recent.templateId;
                                return (
                                    <button
                                        key={recent.templateId}
                                        type="button"
                                        onClick={() => selectRecent(recent)}
                                        onDoubleClick={() => void handleAdd(recent.widgetType, recent.templateId)}
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium hover:opacity-80 transition-opacity"
                                        style={{
                                            background: isActive ? `${meta.color}22` : 'var(--app-bg)',
                                            color: isActive ? meta.color : 'var(--text-secondary)',
                                            border: `1px solid ${isActive ? meta.color : 'var(--app-border)'}`,
                                        }}
                                    >
                                        {recent.icon ? (
                                            <span style={{ fontSize: 12, lineHeight: 1 }}>{recent.icon}</span>
                                        ) : (
                                            <meta.Icon size={11} />
                                        )}
                                        {recent.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* My presets (Widget-Designer) */}
                {FEATURES.widgetDesigner && presetHits.length > 0 && (
                    <div className="px-6 pt-3 pb-1">
                        <p
                            className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                            style={{ color: 'var(--text-secondary)', opacity: 0.5 }}
                        >
                            {t('preset.mine')}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {presetHits.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => setInsertPreset(preset)}
                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium hover:opacity-80 transition-opacity"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    {preset.icon ? (
                                        <span style={{ fontSize: 12, lineHeight: 1 }}>{preset.icon}</span>
                                    ) : (
                                        <Shapes size={11} />
                                    )}
                                    {preset.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Category filter tabs */}
                <div className="px-6 pt-3 pb-1">
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => pickCategory('all')}
                            className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                            style={{
                                background: activeCategory === 'all' ? 'var(--accent)' : 'var(--app-bg)',
                                color: activeCategory === 'all' ? 'white' : 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            {t('common.all')}
                        </button>
                        {hitsByCategory.map(({ cat, tpls }) => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => pickCategory(cat.id)}
                                className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                                style={{
                                    background: activeCategory === cat.id ? 'var(--accent)' : 'var(--app-bg)',
                                    color: activeCategory === cat.id ? 'white' : 'var(--text-secondary)',
                                    border: '1px solid var(--app-border)',
                                    // Categories without a hit stay visible but step back.
                                    opacity: searching && !tpls.length ? 0.35 : 1,
                                }}
                            >
                                {cat.label}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => pickCategory('further')}
                            className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                            style={{
                                background: activeCategory === 'further' ? 'var(--accent)' : 'var(--app-bg)',
                                color: activeCategory === 'further' ? 'white' : 'var(--text-secondary)',
                                border: '1px solid var(--app-border)',
                                opacity: searching && !furtherHits.length ? 0.35 : 1,
                            }}
                        >
                            Weitere
                        </button>
                    </div>
                </div>

                {/* Template grid */}
                <div className="px-6 pb-2 overflow-y-auto flex-1">
                    <div className="py-2 space-y-3">
                        {/* "Alle"-Ansicht: Kategorien nebeneinander, je eine Spalte mit vertikaler Template-Liste */}
                        {activeCategory === 'all' && (
                            <div className="grid grid-cols-4 gap-x-4 gap-y-4">
                                {hitsByCategory.map(({ cat, tpls: catTpls }) => {
                                    if (!catTpls.length) return null;
                                    return (
                                        <div key={cat.id} className="flex flex-col gap-1">
                                            <p
                                                className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                                                style={{ color: 'var(--text-secondary)', opacity: 0.5 }}
                                            >
                                                {cat.label}
                                            </p>
                                            {catTpls.map((tpl) => {
                                                const active = templateId === tpl.id;
                                                return (
                                                    <button
                                                        key={tpl.id}
                                                        data-widget-type={tpl.widgetType}
                                                        type="button"
                                                        onClick={() => selectTemplate(tpl.id, tpl.widgetType)}
                                                        onDoubleClick={() => void handleAdd(tpl.widgetType, tpl.id)}
                                                        className="flex items-center gap-2 rounded-xl transition-all hover:scale-[1.02] active:scale-95 text-left w-full"
                                                        style={{
                                                            padding: '7px 10px',
                                                            background: active ? 'var(--accent)1a' : 'var(--app-bg)',
                                                            border: `1.5px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                            boxShadow: active ? '0 0 0 3px var(--accent)22' : 'none',
                                                        }}
                                                    >
                                                        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>
                                                            {tpl.icon}
                                                        </span>
                                                        <span
                                                            className="leading-tight font-medium truncate"
                                                            style={{
                                                                fontSize: 12,
                                                                color: active
                                                                    ? 'var(--accent)'
                                                                    : 'var(--text-secondary)',
                                                            }}
                                                        >
                                                            {tpl.label}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Einzelne Kategorie gefiltert */}
                        {activeCategory !== 'all' && activeCategory !== 'further' && (
                            <div className="grid grid-cols-3 gap-2">
                                {(hitsByCategory.find((g) => g.cat.id === activeCategory)?.tpls ?? []).map((tpl) => {
                                    const active = templateId === tpl.id;
                                    return (
                                        <button
                                            key={tpl.id}
                                            data-widget-type={tpl.widgetType}
                                            type="button"
                                            onClick={() => selectTemplate(tpl.id, tpl.widgetType)}
                                            onDoubleClick={() => void handleAdd(tpl.widgetType, tpl.id)}
                                            className="flex items-center gap-2.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95 text-left"
                                            style={{
                                                padding: '8px 12px',
                                                background: active ? 'var(--accent)1a' : 'var(--app-bg)',
                                                border: `1.5px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                boxShadow: active ? '0 0 0 3px var(--accent)22' : 'none',
                                            }}
                                        >
                                            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
                                                {tpl.icon}
                                            </span>
                                            <span
                                                className="leading-tight font-medium truncate"
                                                style={{
                                                    fontSize: 12,
                                                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                                                }}
                                            >
                                                {tpl.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Weitere Widgets */}
                        {(activeCategory === 'all' || activeCategory === 'further') && furtherHits.length > 0 && (
                            <div>
                                <p
                                    className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                                    style={{ color: 'var(--text-secondary)', opacity: 0.5 }}
                                >
                                    Weitere Widgets
                                </p>
                                <div className="grid grid-cols-4 gap-2">
                                    {furtherHits.map((w) => {
                                        const active = templateId === w.type;
                                        return (
                                            <button
                                                key={w.type}
                                                data-widget-type={w.type}
                                                type="button"
                                                title={w.hint}
                                                onClick={() => selectTemplate(w.type, w.type)}
                                                onDoubleClick={() => void handleAdd(w.type, w.type)}
                                                className="flex items-center gap-2.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95 text-left"
                                                style={{
                                                    padding: '8px 12px',
                                                    background: active ? 'var(--accent)1a' : 'var(--app-bg)',
                                                    border: `1.5px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                                                    boxShadow: active ? '0 0 0 3px var(--accent)22' : 'none',
                                                }}
                                            >
                                                <w.Icon
                                                    size={18}
                                                    color={active ? 'var(--accent)' : w.color}
                                                    style={{ flexShrink: 0 }}
                                                />
                                                <span
                                                    className="leading-tight font-medium truncate"
                                                    style={{
                                                        fontSize: 12,
                                                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                                                    }}
                                                >
                                                    {w.label}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {searching && hitCount === 0 && (
                            <p className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                                {t('editor.manual.searchNoHits', { q: query })}
                            </p>
                        )}
                    </div>
                </div>

                {/* Hint for selected further-widget – outside scroll area to prevent layout shift */}
                <div className="px-6 pb-2" style={{ minHeight: '2rem' }}>
                    <p
                        className="text-xs rounded-lg px-3 py-1.5"
                        style={{
                            visibility: (selectedTemplate?.hint ?? selectedFurther?.hint) ? 'visible' : 'hidden',
                            color: 'var(--text-secondary)',
                            background: 'var(--app-bg)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {selectedTemplate?.hint ?? selectedFurther?.hint ?? ' '}
                    </p>
                </div>

                {/* Footer */}
                <div
                    className="flex items-center justify-between px-6 py-4"
                    style={{ borderTop: '1px solid var(--app-border)' }}
                >
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        {t('editor.manual.cancel')}
                    </button>
                    <button
                        onClick={() => void handleAdd()}
                        disabled={!templateId}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold hover:opacity-80 disabled:opacity-30 transition-opacity"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        <Plus size={15} />
                        {t('editor.manual.add')}
                    </button>
                </div>
            </div>

            {showPicker && (
                <DatapointPicker
                    currentValue={datapoint}
                    onSelect={(id, dpUnit, dpName) => {
                        setDatapoint(id);
                        if (!title.trim() && dpName) setTitle(applyDpNameFilter(dpName));
                        if (!unit.trim() && dpUnit) setUnit(dpUnit);
                    }}
                    onClose={() => setShowPicker(false)}
                />
            )}

            {insertPreset && (
                <PresetInsertDialog
                    preset={insertPreset}
                    onInsert={(widget) => {
                        onAdd(widget);
                        setInsertPreset(null);
                        onClose();
                    }}
                    onCancel={() => setInsertPreset(null)}
                />
            )}
        </div>
    );
}
