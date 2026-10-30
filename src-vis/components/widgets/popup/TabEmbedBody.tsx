import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactGridLayout from 'react-grid-layout/legacy';
import { AlertTriangle } from 'lucide-react';
import { DEFAULT_POPUP_PADDING, usePopupConfigStore } from '../../../store/popupConfigStore';
import { useEffectiveSettings } from '../../../hooks/useEffectiveSettings';
import { useConditionStyle, type ConditionResult } from '../../../hooks/useConditionStyle';
import { widgetSourceCtx } from '../../../utils/conditionSources';
import { PopupAutoHeightContext } from '../../../contexts/PopupAutoHeightContext';
import { ContentAutoHeightBlockedContext } from '../../../hooks/useContentAutoHeight';
import { supportsAutoHeight } from '../../../utils/autoHeight';
import { buildPopupSubMap, popupMainDp, resolvePopupWidget } from '../../../utils/popupPlaceholders';
import { useDpNameVars } from '../../../hooks/useDpNameVars';
import type { WidgetConfig, WidgetCondition } from '../../../types';
import { WidgetFrame } from '../../layout/WidgetFrame';
import { SharedTemplateContext } from '../../../contexts/RenderTransformContext';

const DEFAULT_MARGIN = 10;

// Stable empty reference so useConditionStyle doesn't re-subscribe every render.
const NO_CONDITIONS: WidgetCondition[] = [];

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

// ── Card styling ────────────────────────────────────────────────────────────────

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
    const srcCtx = useMemo(() => widgetSourceCtx(w), [w]);
    const cond = useConditionStyle(conditions, w.id, srcCtx);
    useEffect(() => {
        onResult(w.id, cond);
    }, [w.id, cond, onResult]);
    return null;
}

// ── Per-widget cell ───────────────────────────────────────────────────────────

const NO_REMOVE = () => undefined;

/**
 * Content height of a frame in auto-height mode, where the card is stretched to its
 * grid cell: the bottom of its last in-flow child plus the card's own bottom padding
 * and border. The card's own height would report the stretch instead.
 */
function naturalHeight(frame: HTMLElement): number {
    const top = frame.getBoundingClientRect().top;
    let bottom = top;
    const visit = (el: Element) => {
        for (const c of Array.from(el.children)) {
            const cs = getComputedStyle(c);
            if (cs.display === 'contents') {
                visit(c);
                continue;
            }
            if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') continue;
            bottom = Math.max(bottom, c.getBoundingClientRect().bottom + (parseFloat(cs.marginBottom) || 0));
        }
    };
    visit(frame);
    const fs = getComputedStyle(frame);
    return Math.ceil(bottom - top + (parseFloat(fs.paddingBottom) || 0) + (parseFloat(fs.borderBottomWidth) || 0));
}

/**
 * Renders one popup-view widget in a WidgetFrame, exactly as on a tab: card, own
 * title/icon look, header items, status row, conditions, style overrides and the
 * click action all come from the frame, so a popup can no longer fall behind the
 * tab (and matches the popup editor, which renders the same frame). Reflow-hidden
 * widgets are removed from the grid by the parent (ConditionProbe); everything a
 * condition does in place is the frame's.
 */
function PopupWidgetCell({
    w,
    onConfigChange,
    autoHeight = false,
    onMeasure,
    bare = false,
}: {
    w: WidgetConfig;
    onConfigChange: (next: WidgetConfig) => void;
    /** Edge to edge: no card frame, corners, shadow or inner padding (fullscreen fill tab). */
    bare?: boolean;
    /** True when this cell should render its widget at natural height (auto-height popup). */
    autoHeight?: boolean;
    /** Reports the cell's natural (content-driven) pixel height so the parent can grow the grid row-count. */
    onMeasure?: (id: string, px: number) => void;
}) {
    const cellRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!autoHeight || !onMeasure) return;
        const frame = cellRef.current?.querySelector<HTMLElement>(':scope > .aura-widget');
        if (!frame) return;
        const report = () => onMeasure(w.id, naturalHeight(frame));
        report();
        // The card itself does not shrink below its cell, so watch what is inside it too.
        const ro = new ResizeObserver(report);
        ro.observe(frame);
        for (const c of Array.from(frame.querySelectorAll(':scope > *, :scope > [style*="contents"] > *')))
            ro.observe(c);
        return () => ro.disconnect();
    }, [autoHeight, onMeasure, w.id]);

    return (
        <div
            ref={cellRef}
            className={`box-border ${autoHeight ? 'flex flex-col' : 'h-full'} ${bare ? 'aura-popup-bare' : ''}`}
            style={autoHeight ? { minHeight: '100%' } : undefined}
            data-aura-popup-widget={w.id}
            data-aura-widget-type={w.type}
            data-aura-widget-rows={w.gridPos.h ?? 3}
            data-aura-auto-box={autoHeight ? '1' : '0'}
        >
            <WidgetFrame config={w} editMode={false} onRemove={NO_REMOVE} onConfigChange={onConfigChange} />
        </div>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * The widget that fills the whole view (`fillTab`, #865) — only when it is the view's
 * single widget, like on a dashboard tab. The popup then stretches its body instead of
 * sizing to the grid. In a fullscreen popup a lone widget without a content height
 * fills even without `fillTab` (see fillsFullscreenPopup).
 */
export function popupViewFillWidget(
    view: { widgets: WidgetConfig[] } | undefined,
    fullscreen = false,
): WidgetConfig | null {
    const only = view?.widgets.length === 1 ? view.widgets[0] : undefined;
    if (!only) return null;
    return only.options?.fillTab || (fullscreen && fillsFullscreenPopup(only)) ? only : null;
}

/**
 * A fullscreen popup stretches a lone widget that has no content height of its own
 * (iframe, camera, map, chart …) over the whole screen — at its designed size it would
 * float as a small card in an otherwise empty screen. Widgets that size to their
 * content (lists, device controls) keep their designed size.
 */
export function fillsFullscreenPopup(w: WidgetConfig): boolean {
    return !supportsAutoHeight(w.type, w.layout);
}

interface Props {
    viewId: string;
    triggerWidget?: WidgetConfig;
    /** Explicit main DP for the popup (e.g. set on the click action for widgets
     *  without a datapoint, like the universal widget). Falls back to the trigger
     *  widget's own datapoint. */
    dpOverride?: string;
    /** Inner padding in px, already resolved through action > view > global (issue #621). */
    padding?: number;
    /** The dialog has a size of its own (fullscreen or a set width/height): a fill-tab
     *  widget stretches to it. Otherwise it keeps its designed size. */
    fill?: boolean;
    /** Fullscreen: a fill-tab widget runs edge to edge — no popup padding, no card frame. */
    edgeToEdge?: boolean;
}

export function TabEmbedBody({
    viewId,
    triggerWidget,
    dpOverride,
    padding = DEFAULT_POPUP_PADDING,
    fill = false,
    edgeToEdge = false,
}: Props) {
    const view = usePopupConfigStore((s) => s.views.find((v) => v.id === viewId));
    const updateWidgetInView = usePopupConfigStore((s) => s.updateWidgetInView);
    const settings = useEffectiveSettings();
    const cellSize = settings.gridRowHeight ?? 60;
    const snapX = settings.gridSnapX ?? settings.gridRowHeight ?? 60;
    const MARGIN = settings.gridGap ?? DEFAULT_MARGIN;

    // Auto height: the popup dialog has no explicit pixel height, so content-driven
    // widgets grow the grid to fit their full content instead of scrolling in a fixed cell.
    const autoPopupHeight = !(triggerWidget?.options?.popupHeight as number | undefined);

    // Main DP: explicit override (click action) wins over the trigger widget's own datapoint.
    const mainDp = popupMainDp(triggerWidget, dpOverride);
    // `{{dpname}}`, `{{parentname}}` … (#841) join once the objects are loaded.
    const nameVars = useDpNameVars(mainDp);

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
                cur.disabled === r.disabled &&
                cur.effect === r.effect &&
                JSON.stringify(cur.cssVars) === JSON.stringify(r.cssVars)
            ) {
                return prev;
            }
            return { ...prev, [id]: r };
        });
    }, []);

    // Measured natural height (px) per content-driven widget in auto-height mode; drives
    // each widget's grid row-count so the grid — and the auto-sized dialog — grows to fit.
    const [contentPx, setContentPx] = useState<Record<string, number>>({});
    const onMeasure = useCallback((id: string, px: number) => {
        setContentPx((prev) => (prev[id] === px ? prev : { ...prev, [id]: px }));
    }, []);

    const containerRefCallback = useCallback((el: HTMLDivElement | null) => {
        if (roRef.current) {
            roRef.current.disconnect();
            roRef.current = null;
        }
        if (!el) return;
        // The content width, as the observer reports it below — clientWidth includes the
        // padding, and the grid shrank by it one frame after mounting (a chart sized itself
        // to the first, wider cell and kept that width).
        const cs = getComputedStyle(el);
        setContainerWidth(Math.floor(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)));
        const ro = new ResizeObserver(([entry]) => {
            setContainerWidth(Math.floor(entry.contentRect.width));
        });
        ro.observe(el);
        roRef.current = ro;
    }, []);

    const naturalMinWidth = useMemo(() => {
        if (!view || view.widgets.length === 0) return 280;
        const minX = Math.min(...view.widgets.map((w) => w.gridPos.x ?? 0));
        const maxCol = Math.max(...view.widgets.map((w) => (w.gridPos.x ?? 0) + (w.gridPos.w ?? 4)));
        // Leading empty columns are stripped at render (react-grid-layout compacts only
        // vertically), so the popup width tracks the used span — not the raw max column.
        // The padding is this box's own, so a tighter setting really does buy row width.
        return (maxCol - minX) * (snapX + MARGIN) + MARGIN + 2 * padding;
    }, [view, snapX, MARGIN, padding]);

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

    const subMap = { ...nameVars, ...buildPopupSubMap(triggerWidget, mainDp) };

    const widgets = view.widgets.map((w) => resolvePopupWidget(w, subMap, triggerWidget));

    // Fill tab (#865): the single widget takes the whole body instead of a grid slot.
    // Its designed size stays the floor, so a dialog without a size of its own does
    // not collapse around a widget that has no content height (iframe, slideshow).
    // edgeToEdge is only set when the view fills, so it doubles as the fullscreen flag.
    const fillOrig = popupViewFillWidget(view, edgeToEdge);
    if (fillOrig) {
        const w = widgets[0];
        const rows = w.gridPos.h ?? 3;
        const pad = edgeToEdge ? 0 : padding;
        const designedH = rows * cellSize + (rows - 1) * MARGIN + 2 * pad;
        return (
            <SharedTemplateContext.Provider value="instance">
                <div
                    className={fill ? 'w-full h-full box-border' : 'box-border'}
                    style={{ padding: pad, minWidth: fill ? undefined : naturalMinWidth, minHeight: designedH }}
                    data-aura-popup-fill=""
                >
                    <div style={{ display: 'none' }}>
                        <ConditionProbe w={w} onResult={onCondResult} />
                    </div>
                    <div style={{ height: fill ? '100%' : designedH - 2 * pad }}>
                        <ContentAutoHeightBlockedContext.Provider value={true}>
                            <PopupWidgetCell
                                w={w}
                                bare={edgeToEdge}
                                onConfigChange={(next) => {
                                    const patch = mergedOptionsPatch(fillOrig, w, next);
                                    if (patch) updateWidgetInView(view.id, fillOrig.id, { options: patch });
                                }}
                            />
                        </ContentAutoHeightBlockedContext.Provider>
                    </div>
                </div>
            </SharedTemplateContext.Provider>
        );
    }

    // Reflow-hidden widgets (condition with hideWidget + reflow) drop out of the
    // grid entirely so ReactGridLayout's vertical compaction slides the rest up.
    // In-place hidden widgets stay in the layout (their space is kept) and are only
    // visually hidden by the cell. The probes below keep every widget's condition
    // subscription alive regardless, so a dropped widget can reappear.
    const gridWidgets = widgets.filter((w) => {
        const c = conds[w.id];
        return !(c?.hidden && c?.reflow);
    });

    // Whether a given widget grows to its measured content height (auto dialog + a type
    // with a natural content height, utils/autoHeight). Fill-type widgets (charts,
    // gauges, maps …) have no intrinsic height and keep their designed grid height.
    const isAutoCell = (w: WidgetConfig) => autoPopupHeight && supportsAutoHeight(w.type, w.layout);

    // react-grid-layout compacts only vertically, so a widget placed at x>0 in the editor
    // keeps its empty leading columns at runtime and hugs the right edge. Two-step fix:
    //   1. strip the shared minimum x so the used block starts at column 0, then
    //   2. re-centre that block inside the available columns.
    // Step 2 makes centring robust even when the dialog stays wider than the content
    // (whatever the reason) — the block sits in the middle rather than flush-left/right.
    const contentMinX = Math.min(...view.widgets.map((w) => w.gridPos.x ?? 0));
    const contentMaxX = Math.max(...view.widgets.map((w) => (w.gridPos.x ?? 0) + (w.gridPos.w ?? 4)));
    const spanCols = Math.max(1, contentMaxX - contentMinX);
    const leftPad = Math.max(0, Math.floor((cols - spanCols) / 2));

    const layout = gridWidgets.map((w) => {
        const designedH = w.gridPos.h ?? 3;
        let h = designedH;
        if (isAutoCell(w)) {
            const px = contentPx[w.id];
            if (px && px > 0) {
                // Rows needed so the grid slot (h·cellSize + (h−1)·MARGIN) covers the content.
                const rows = Math.max(1, Math.ceil((px + MARGIN) / (cellSize + MARGIN)));
                // Grow-only: the designed height acts as a floor, never shrinks below it.
                h = Math.max(designedH, rows);
            }
        }
        // Clamped to the current column count ourselves (#862): react-grid-layout clamps
        // its internal copy whenever the layout prop changes, but never widens it again
        // when only `cols` grows. The measured width trails a view change by one frame,
        // so a view that got wider while open stayed squeezed into the old column count.
        // Clamping here makes the prop itself change with `cols` and forces the resync.
        const cw = Math.min(w.gridPos.w ?? 4, cols);
        return {
            i: w.id,
            x: Math.min(Math.max(0, (w.gridPos.x ?? 0) - contentMinX + leftPad), cols - cw),
            y: w.gridPos.y ?? 9999,
            w: cw,
            h,
            minH: 1,
        };
    });

    return (
        <SharedTemplateContext.Provider value="instance">
            <div ref={containerRefCallback} style={{ padding, minWidth: naturalMinWidth }}>
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
                            const cellAuto = isAutoCell(w);
                            return (
                                <div key={w.id}>
                                    {/* Provider tells the widget (e.g. list) to render its full
                                    content without an inner scrollbar in auto-height mode. */}
                                    {/* The widget's own auto-height option is off here: the popup
                                    sizes its cells itself (the dashboard store would be wrong). */}
                                    <PopupAutoHeightContext.Provider value={cellAuto}>
                                        <ContentAutoHeightBlockedContext.Provider value={true}>
                                            <PopupWidgetCell
                                                w={w}
                                                autoHeight={cellAuto}
                                                onMeasure={onMeasure}
                                                onConfigChange={(next) => {
                                                    const patch = mergedOptionsPatch(orig, w, next);
                                                    if (patch) updateWidgetInView(view.id, orig.id, { options: patch });
                                                }}
                                            />
                                        </ContentAutoHeightBlockedContext.Provider>
                                    </PopupAutoHeightContext.Provider>
                                </div>
                            );
                        })}
                    </ReactGridLayout>
                )}
            </div>
        </SharedTemplateContext.Provider>
    );
}
