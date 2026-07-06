import { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import ReactGridLayout from 'react-grid-layout/legacy';
import { AlertTriangle } from 'lucide-react';
import { usePopupConfigStore } from '../../../store/popupConfigStore';
import { useEffectiveSettings } from '../../../hooks/useEffectiveSettings';
import { getWidgetMap } from '../widgetMap';
import type { WidgetConfig } from '../../../types';

const DEFAULT_MARGIN = 10;

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

    const roRef = useRef<ResizeObserver | null>(null);
    const [containerWidth, setContainerWidth] = useState(0);

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

    const wm = getWidgetMap();
    // Popup charts inherit the trigger's history adapter instance when they have none.
    const triggerInstance = triggerHistoryInstance(triggerWidget);
    const widgets = view.widgets.map((w) =>
        markAutoHistory(inheritHistoryInstance(substituteWidget(w, subMap), triggerInstance), w),
    );

    const layout = widgets.map((w) => ({
        i: w.id,
        x: w.gridPos.x ?? 0,
        y: w.gridPos.y ?? 9999,
        w: w.gridPos.w ?? 4,
        h: w.gridPos.h ?? 3,
        minH: 1,
    }));

    return (
        <div ref={containerRefCallback} className="p-3" style={{ minWidth: naturalMinWidth }}>
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
                    {widgets.map((w, i) => {
                        const Widget = wm[w.type as keyof typeof wm];
                        // Pre-substitution original — persist edits against it so
                        // {{...}} placeholders in untouched option keys survive.
                        const orig = view.widgets[i];
                        return (
                            <div key={w.id}>
                                {Widget ? (
                                    <Suspense fallback={<div className="h-full w-full" style={{ opacity: 0.3 }} />}>
                                        <Widget
                                            config={w}
                                            editMode={false}
                                            onConfigChange={(next) => {
                                                const patch = mergedOptionsPatch(orig, w, next);
                                                if (patch) updateWidgetInView(view.id, orig.id, { options: patch });
                                            }}
                                        />
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
                    })}
                </ReactGridLayout>
            )}
        </div>
    );
}
