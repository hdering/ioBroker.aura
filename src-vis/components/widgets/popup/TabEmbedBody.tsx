import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import ReactGridLayout from 'react-grid-layout/legacy';
import { AlertTriangle } from 'lucide-react';
import { usePopupConfigStore } from '../../../store/popupConfigStore';
import { useEffectiveSettings } from '../../../hooks/useEffectiveSettings';
import { useConditionStyle, type ConditionResult } from '../../../hooks/useConditionStyle';
import { getWidgetMap } from '../widgetMap';
import type { WidgetConfig, WidgetCondition } from '../../../types';

const DEFAULT_MARGIN = 10;

// Stable empty reference so useConditionStyle doesn't re-subscribe every render.
const NO_CONDITIONS: WidgetCondition[] = [];

// Default verdict for a widget whose probe hasn't reported yet (visible).
const EMPTY_COND: ConditionResult = { cssVars: {}, effect: null, hidden: false, reflow: false };

// ── {{key}} substitution ──────────────────────────────────────────────────────

function subAll(value: string, map: Record<string, string>): string {
    if (!value) return value;
    return value.replace(/\{\{(\w+)\}\}/g, (_, key) => map[key] ?? `{{${key}}}`);
}

/** Recursively substitute {{key}} in every string within a value, walking nested
 *  arrays and objects. Needed so datapoints buried in option arrays — e.g. the
 *  extended chart's `echartSeries[].datapointId`, camera slots, chips — also resolve. */
function subDeep(value: unknown, map: Record<string, string>): unknown {
    if (typeof value === 'string') return subAll(value, map);
    if (Array.isArray(value)) return value.map((v) => subDeep(v, map));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, subDeep(v, map)]));
    }
    return value;
}

function substituteWidget(w: WidgetConfig, map: Record<string, string>): WidgetConfig {
    if (Object.keys(map).length === 0) return w;
    return {
        ...w,
        datapoint: subAll(w.datapoint, map),
        title: subAll(w.title, map),
        options: w.options ? (subDeep(w.options, map) as WidgetConfig['options']) : w.options,
    };
}

/**
 * Build an `options` patch for persisting an in-popup widget edit (e.g. adding a
 * Zeitschaltuhr event) back to the popup-view definition.
 *
 * The widget renders against a `{{key}}`-substituted config, so we must NOT write
 * the substituted values back — that would bake resolved DPs into the shared view
 * template. Instead we diff the widget's returned options against the substituted
 * base and apply ONLY the changed keys onto the ORIGINAL (pre-substitution) options.
 * Interactive widgets mutate placeholder-free keys (events, enabled, stateBaseId),
 * so untouched keys keep their `{{...}}` placeholders intact.
 *
 * Returns null when nothing changed (avoids a no-op store write).
 */
function mergedOptionsPatch(
    orig: WidgetConfig,
    base: WidgetConfig,
    next: WidgetConfig,
): Record<string, unknown> | null {
    const origOpts = (orig.options ?? {}) as Record<string, unknown>;
    const baseOpts = (base.options ?? {}) as Record<string, unknown>;
    const nextOpts = (next.options ?? {}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...origOpts };
    let changed = false;
    for (const k of Object.keys(nextOpts)) {
        if (nextOpts[k] !== baseOpts[k]) {
            merged[k] = nextOpts[k];
            changed = true;
        }
    }
    for (const k of Object.keys(baseOpts)) {
        if (!(k in nextOpts)) {
            delete merged[k];
            changed = true;
        }
    }
    return changed ? merged : null;
}

// ── History-instance inheritance ────────────────────────────────────────────────

/** History adapter instance configured on the trigger widget — top-level (simple
 *  chart) or on its first series (extended chart). Undefined if none is set. */
function triggerHistoryInstance(w: WidgetConfig | undefined): string | undefined {
    const o = w?.options;
    if (!o) return undefined;
    if (typeof o.historyInstance === 'string' && o.historyInstance) return o.historyInstance;
    const series = o.echartSeries as Array<{ historyInstance?: string }> | undefined;
    return series?.find((s) => s.historyInstance)?.historyInstance;
}

/** Popup chart/echart widgets inherit the trigger's history instance when they don't
 *  carry one themselves — so a popup diagram pulls its history from the same adapter as
 *  the widget that opened it. Explicit per-widget/per-series instances are preserved. */
function inheritHistoryInstance(w: WidgetConfig, inst: string | undefined): WidgetConfig {
    if (!inst) return w;
    if (w.type === 'chart') {
        const own = w.options?.historyInstance;
        if (typeof own === 'string' && own) return w;
        return { ...w, options: { ...w.options, historyInstance: inst } };
    }
    if (w.type === 'echart') {
        const series = w.options?.echartSeries as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(series) || series.length === 0 || !series.some((s) => !s.historyInstance)) return w;
        return {
            ...w,
            options: {
                ...w.options,
                echartSeries: series.map((s) => (s.historyInstance ? s : { ...s, historyInstance: inst })),
            },
        };
    }
    return w;
}

/** Flag popup chart widgets whose history instance could not be determined — a template
 *  datapoint ({{dp}}) was resolved at runtime but the trigger widget (e.g. a value display)
 *  has no instance to inherit. The chart then auto-detects the DP's history adapter and, when
 *  several exist, shows a selection field. `orig` is the pre-substitution widget so the
 *  template check targets exactly the "opened from a value widget" case. */
function markAutoHistory(w: WidgetConfig, orig: WidgetConfig): WidgetConfig {
    if (w.type === 'chart') {
        const isTpl = (orig.datapoint ?? '').includes('{{');
        const inst = w.options?.historyInstance;
        const hasInst = typeof inst === 'string' && inst.length > 0;
        if (isTpl && !hasInst) return { ...w, options: { ...w.options, autoHistoryInstance: true } };
    }
    if (w.type === 'echart') {
        const origSeries = (orig.options?.echartSeries as Array<{ datapointId?: string }> | undefined) ?? [];
        const series = (w.options?.echartSeries as Array<{ historyInstance?: string }> | undefined) ?? [];
        const anyUnresolvedTpl = origSeries.some(
            (s, i) => (s.datapointId ?? '').includes('{{') && !series[i]?.historyInstance,
        );
        if (anyUnresolvedTpl) return { ...w, options: { ...w.options, autoHistoryInstance: true } };
    }
    return w;
}

// ── Card styling ────────────────────────────────────────────────────────────────

/** Widget types that carry their own chrome / fill their box, so the popup card
 *  wrapper must not add padding (mirrors WidgetFrame's isNoPad set). */
const NO_PAD_TYPES = new Set(['header', 'group', 'panels', 'iframe', 'map', 'echartsPreset']);

/**
 * Card background/border/radius for a popup-view widget, mirroring WidgetFrame so
 * embedded widgets look identical to the dashboard. Popup views render bare widgets
 * (no WidgetFrame), so without this every widget would appear transparent regardless
 * of its own `transparent` option. A widget that opts into transparency keeps it.
 */
function cardStyleFor(w: WidgetConfig, widgetPadding: number): CSSProperties {
    const isTransparent = !!w.options?.transparent;
    if (isTransparent) {
        const strength = Math.max(0, Math.min(100, Number(w.options?.transparency ?? 100)));
        return {
            background:
                strength >= 100
                    ? 'transparent'
                    : `color-mix(in srgb, var(--widget-bg) ${100 - strength}%, transparent)`,
        };
    }
    const isButton = w.type === 'button';
    return {
        background: isButton ? 'var(--button-bg, var(--widget-bg))' : 'var(--widget-bg)',
        borderRadius: 'var(--widget-radius)',
        boxShadow: 'var(--widget-shadow)',
        backdropFilter: 'var(--widget-backdrop)',
        borderWidth: 'var(--widget-border-width)',
        borderStyle: 'solid',
        borderColor: isButton ? 'var(--button-border, var(--widget-border))' : 'var(--widget-border)',
        padding: NO_PAD_TYPES.has(w.type) ? undefined : widgetPadding,
    };
}

// ── Condition evaluation ──────────────────────────────────────────────────────

/**
 * Always-mounted, render-free probe that evaluates one widget's visibility
 * conditions and reports the result up. It lives OUTSIDE the grid so its DP
 * subscription survives even when a reflow-hidden widget is pulled out of the
 * layout — otherwise a reflowed widget would unmount, lose its subscription, and
 * never learn its condition turned false again (it could never come back).
 * Conditions are read from the already-substituted config, so `{{dp}}` placeholders
 * inside condition clauses resolve the same way the widget body does.
 */
function ConditionProbe({ w, onResult }: { w: WidgetConfig; onResult: (id: string, r: ConditionResult) => void }) {
    const conditions = (w.options?.conditions as WidgetCondition[] | undefined) ?? NO_CONDITIONS;
    const cond = useConditionStyle(conditions, w.id);
    useEffect(() => {
        onResult(w.id, cond);
    }, [w.id, cond, onResult]);
    return null;
}

// ── Per-widget cell ───────────────────────────────────────────────────────────

/**
 * Renders one popup-view widget bare (no WidgetFrame). The condition verdict is
 * evaluated by ConditionProbe and passed in via `cond`, so this component only
 * applies the visual effect (style vars, pulse/blink, in-place hide). Reflow-hidden
 * widgets are removed from the grid by the parent, so this cell only ever sees the
 * in-place (non-reflow) hide case.
 */
function PopupWidgetCell({
    w,
    cond,
    widgetPadding,
    onConfigChange,
}: {
    w: WidgetConfig;
    cond: ConditionResult;
    widgetPadding: number;
    onConfigChange: (next: WidgetConfig) => void;
}) {
    const wm = getWidgetMap();
    const Widget = wm[w.type as keyof typeof wm];

    const effectClass =
        cond.effect === 'pulse'
            ? 'animate-pulse'
            : cond.effect === 'blink'
              ? 'animate-[blink_1s_step-end_infinite]'
              : '';

    return (
        <div
            className={`h-full box-border overflow-hidden ${effectClass}`}
            style={{
                ...cardStyleFor(w, widgetPadding),
                ...cond.cssVars,
                ...(cond.hidden ? { visibility: 'hidden', pointerEvents: 'none' } : {}),
            }}
        >
            {Widget ? (
                <Suspense fallback={<div className="h-full w-full" style={{ opacity: 0.3 }} />}>
                    <Widget config={w} editMode={false} onConfigChange={onConfigChange} />
                </Suspense>
            ) : (
                <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs h-full"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    <AlertTriangle size={13} />
                    Unbekannter Typ: {w.type}
                </div>
            )}
        </div>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
    viewId: string;
    triggerWidget?: WidgetConfig;
    /** Explicit main DP for the popup (e.g. set on the click action for widgets
     *  without a datapoint, like the universal widget). Falls back to the trigger
     *  widget's own datapoint. */
    dpOverride?: string;
}

export function TabEmbedBody({ viewId, triggerWidget, dpOverride }: Props) {
    const view = usePopupConfigStore((s) => s.views.find((v) => v.id === viewId));
    const updateWidgetInView = usePopupConfigStore((s) => s.updateWidgetInView);
    const settings = useEffectiveSettings();
    const cellSize = settings.gridRowHeight ?? 60;
    const snapX = settings.gridSnapX ?? settings.gridRowHeight ?? 60;
    const MARGIN = settings.gridGap ?? DEFAULT_MARGIN;
    const widgetPadding = settings.widgetPadding ?? 16;

    const roRef = useRef<ResizeObserver | null>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    // Condition verdicts per widget, fed by the always-mounted ConditionProbes.
    // Drives in-place hide (cssVars/effect/visibility on the cell) and reflow
    // (reflow-hidden widgets are dropped from the layout so the grid compacts up).
    const [conds, setConds] = useState<Record<string, ConditionResult>>({});
    const onCondResult = useCallback((id: string, r: ConditionResult) => {
        setConds((prev) => {
            const cur = prev[id];
            if (
                cur &&
                cur.hidden === r.hidden &&
                cur.reflow === r.reflow &&
                cur.effect === r.effect &&
                JSON.stringify(cur.cssVars) === JSON.stringify(r.cssVars)
            ) {
                return prev;
            }
            return { ...prev, [id]: r };
        });
    }, []);

    const containerRefCallback = useCallback((el: HTMLDivElement | null) => {
        if (roRef.current) {
            roRef.current.disconnect();
            roRef.current = null;
        }
        if (!el) return;
        setContainerWidth(el.clientWidth);
        const ro = new ResizeObserver(([entry]) => {
            setContainerWidth(Math.floor(entry.contentRect.width));
        });
        ro.observe(el);
        roRef.current = ro;
    }, []);

    const naturalMinWidth = useMemo(() => {
        if (!view || view.widgets.length === 0) return 280;
        const maxCol = Math.max(...view.widgets.map((w) => (w.gridPos.x ?? 0) + (w.gridPos.w ?? 4)));
        return maxCol * (snapX + MARGIN) + MARGIN + 24;
    }, [view, snapX, MARGIN]);

    const cols = containerWidth > 0 ? Math.max(2, Math.floor((containerWidth - MARGIN) / (snapX + MARGIN))) : 12;

    if (!view || view.widgets.length === 0) {
        return (
            <div
                className="flex flex-col items-center justify-center h-48 gap-2 p-4"
                style={{ color: 'var(--text-secondary)' }}
            >
                <AlertTriangle size={24} style={{ color: 'var(--accent-red, #ef4444)' }} />
                <span className="text-sm">{view ? 'View ist leer' : 'View nicht gefunden'}</span>
                <span className="text-xs opacity-60 font-mono">{viewId}</span>
            </div>
        );
    }

    // Main DP: explicit override (click action) wins over the trigger widget's own datapoint.
    const mainDp = dpOverride || triggerWidget?.datapoint || '';
    const subMap: Record<string, string> = {
        // String options of the trigger widget become {{key}} placeholders…
        ...Object.fromEntries(
            Object.entries(triggerWidget?.options ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string'),
        ),
    };
    // …and the derived DP variables always take precedence.
    if (mainDp) {
        subMap.dp = mainDp;
        const lastDot = mainDp.lastIndexOf('.');
        if (lastDot > 0) {
            subMap.parent = mainDp.slice(0, lastDot); // parent strang, e.g. 0_userdata.0
            subMap.name = mainDp.slice(lastDot + 1); // last segment, e.g. Anzeige
        }
    }

    // Popup charts inherit the trigger's history adapter instance when they have none.
    const triggerInstance = triggerHistoryInstance(triggerWidget);
    const widgets = view.widgets.map((w) =>
        markAutoHistory(inheritHistoryInstance(substituteWidget(w, subMap), triggerInstance), w),
    );

    // Reflow-hidden widgets (condition with hideWidget + reflow) drop out of the
    // grid entirely so ReactGridLayout's vertical compaction slides the rest up.
    // In-place hidden widgets stay in the layout (their space is kept) and are only
    // visually hidden by the cell. The probes below keep every widget's condition
    // subscription alive regardless, so a dropped widget can reappear.
    const gridWidgets = widgets.filter((w) => {
        const c = conds[w.id];
        return !(c?.hidden && c?.reflow);
    });

    const layout = gridWidgets.map((w) => ({
        i: w.id,
        x: w.gridPos.x ?? 0,
        y: w.gridPos.y ?? 9999,
        w: w.gridPos.w ?? 4,
        h: w.gridPos.h ?? 3,
        minH: 1,
    }));

    return (
        <div ref={containerRefCallback} className="p-3" style={{ minWidth: naturalMinWidth }}>
            {/* Render-free condition evaluators for every widget — kept mounted even
                when a widget is reflowed out of the grid. */}
            <div style={{ display: 'none' }}>
                {widgets.map((w) => (
                    <ConditionProbe key={w.id} w={w} onResult={onCondResult} />
                ))}
            </div>
            {containerWidth > 0 && (
                <ReactGridLayout
                    className="layout"
                    layout={layout}
                    cols={cols}
                    rowHeight={cellSize}
                    width={containerWidth}
                    isDraggable={false}
                    isResizable={false}
                    margin={[MARGIN, MARGIN]}
                    containerPadding={[0, 0]}
                >
                    {gridWidgets.map((w) => {
                        // Pre-substitution original — persist edits against it so
                        // {{...}} placeholders in untouched option keys survive.
                        const orig = view.widgets.find((o) => o.id === w.id) ?? w;
                        return (
                            <div key={w.id}>
                                <PopupWidgetCell
                                    w={w}
                                    cond={conds[w.id] ?? EMPTY_COND}
                                    widgetPadding={widgetPadding}
                                    onConfigChange={(next) => {
                                        const patch = mergedOptionsPatch(orig, w, next);
                                        if (patch) updateWidgetInView(view.id, orig.id, { options: patch });
                                    }}
                                />
                            </div>
                        );
                    })}
                </ReactGridLayout>
            )}
        </div>
    );
}
