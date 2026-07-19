import { useRef, useState, useEffect, useMemo } from 'react';
import { Layers, Loader, ChevronDown } from 'lucide-react';
import ReactGridLayout from 'react-grid-layout/legacy';
import type { WidgetProps, WidgetConfig, WidgetType, ioBrokerState } from '../../types';
import { useConfigStore } from '../../store/configStore';
import { useIoBroker } from '../../hooks/useIoBroker';
import {
    groupChildDpIds,
    groupChildTarget,
    groupChildDimmerIds,
    groupChildShutterTargets,
    groupChildPulseIds,
    type GroupActionConfigOpts,
    type GroupActionType,
    type GroupTarget,
} from '../../utils/groupTargets';
import { GroupActionControl } from './GroupActionControl';
import { WIDGET_BY_TYPE } from '../../widgetRegistry';
// WidgetFrame is imported here — circular dep is safe because GroupWidget only
// uses WidgetFrame inside its render function, never at module-init time.
import { WidgetFrame } from '../layout/WidgetFrame';
import { useT } from '../../i18n';
import { CustomGridView } from './CustomGridView';
import { getDragBridge, setDragBridge } from '../../utils/dragBridge';
import { useDashboardMobile } from '../../contexts/DashboardMobileContext';
import { useGroupDefsStore, newGroupDefId } from '../../store/groupDefsStore';
import { useGroupCollapseStore } from '../../store/groupCollapseStore';
import { verticalCompact } from '../../utils/gridCompact';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useReflowHiddenIds } from '../../hooks/useConditionStyle';

function mobileSort(children: WidgetConfig[]): WidgetConfig[] {
    return [...children].sort((a, b) => {
        const oa = a.mobileOrder ?? a.gridPos.y * 1000 + a.gridPos.x;
        const ob = b.mobileOrder ?? b.gridPos.y * 1000 + b.gridPos.x;
        return oa - ob;
    });
}

/** Empty-state line for a group: a spinner while children are still loading
 *  from ioBroker, otherwise the plain "no widgets" hint. */
function GroupEmptyState({ loading }: { loading: boolean }) {
    const t = useT();
    return (
        <div className="flex items-center justify-center gap-1.5 py-6" style={{ color: 'var(--text-secondary)' }}>
            {loading ? (
                <>
                    <Loader size={14} className="animate-spin" />
                    <span className="text-xs">{t('common.loading')}</span>
                </>
            ) : (
                <span className="text-xs">{t('group.noWidgets')}</span>
            )}
        </div>
    );
}

export function GroupWidget({ config, editMode, onConfigChange }: WidgetProps) {
    const t = useT();
    const configLayout = config.layout ?? 'default';

    // ── defId initialisation ───────────────────────────────────────────────────
    // Stable temp defId used between mount and the first onConfigChange round-trip
    const tempDefIdRef = useRef<string | null>(null);
    const defId =
        (config.options?.defId as string | undefined) ??
        (() => {
            if (!tempDefIdRef.current) tempDefIdRef.current = newGroupDefId();
            return tempDefIdRef.current;
        })();

    // Persist the defId to aura-dashboard on first render if it wasn't saved yet
    useEffect(() => {
        if (!config.options?.defId) {
            onConfigChange({ ...config, options: { ...config.options, defId } });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const children = useGroupDefsStore((s) => s.defs[defId] ?? []);
    // Group children hydrate from ioBroker after boot (can take a few seconds).
    // Until then an empty `children` means "still loading", not "genuinely empty"
    // — show a spinner instead of the "no widgets" text in that window.
    const defsHydrated = useGroupDefsStore((s) => s.hydrated);
    const isLoading = children.length === 0 && !defsHydrated;
    // Children whose conditions resolved to hidden+reflow are kept out of the
    // inner grid (mirroring Dashboard's tab-level behaviour) so others slide up.
    // They still need to be rendered somewhere so their conditions keep being
    // evaluated — see the off-screen container at the bottom of this component.
    const reflowHiddenIds = useReflowHiddenIds();
    const reflowHiddenChildren = !editMode ? children.filter((c) => reflowHiddenIds.has(c.id)) : [];
    const gridChildren = !editMode ? verticalCompact(children.filter((c) => !reflowHiddenIds.has(c.id))) : children;
    const transparent = !!config.options?.transparent;
    const showTitle = config.options?.showTitle !== false;

    // ── Collapse ────────────────────────────────────────────────────────────────
    // A group with `defaultCollapsed` set is collapsible in the live dashboard:
    // its header stays, the body folds away, and the outer box shrinks to the
    // header (see Dashboard height computation). In the editor children must stay
    // reachable, so collapse never applies there.
    const defaultCollapsed = !!config.options?.defaultCollapsed;
    const collapsible = defaultCollapsed && !editMode;
    const initCollapse = useGroupCollapseStore((s) => s.init);
    const toggleCollapse = useGroupCollapseStore((s) => s.toggle);
    const collapsed = useGroupCollapseStore((s) => s.collapsed[config.id] ?? defaultCollapsed);
    useEffect(() => {
        if (defaultCollapsed) initCollapse(config.id, true);
    }, [config.id, defaultCollapsed, initCollapse]);
    const isCollapsed = collapsible && collapsed;
    const showIcon = config.options?.showIcon !== false;
    const iconSize = (config.options?.iconSize as number | undefined) || 20;
    const WidgetIcon = getWidgetIcon(config.options?.icon as string | undefined, Layers);
    const cellSize = useConfigStore((s) => s.frontend.gridRowHeight ?? 80);
    const gridGap = useConfigStore((s) => s.frontend.gridGap ?? 10);
    const dashboardIsMobile = useDashboardMobile();
    const [isDragOver, setIsDragOver] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // ── Group action control (switch / dimmer / shutter / momentary) ────────────
    const groupSwitchEnabled = !!config.options?.groupSwitch;
    const gaCfg = (config.options ?? {}) as GroupActionConfigOpts;
    const groupActionType = (gaCfg.groupActionType ?? 'switch') as GroupActionType;
    const { groupDimmerOnValue, groupIncludeNumbers, groupNumberOnValue, groupNumberOffValue, groupExcludeIds } = gaCfg;
    const groupExcludeSet = useMemo(() => new Set(groupExcludeIds ?? []), [groupExcludeIds]);
    const { subscribe, getState, setState } = useIoBroker();
    const [childStates, setChildStates] = useState<Record<string, ioBrokerState['val']>>({});
    // Live child state is only needed for the on/off switch aggregate.
    const childDpIds =
        groupSwitchEnabled && groupActionType === 'switch'
            ? groupChildDpIds(
                  children.filter((c) => !groupExcludeSet.has(c.id)),
                  gaCfg,
              )
            : [];
    const childDpKey = childDpIds.join(',');
    useEffect(() => {
        if (childDpIds.length === 0) return;
        childDpIds.forEach((id) => getState(id).then((s) => setChildStates((p) => ({ ...p, [id]: s?.val ?? null }))));
        const unsubs = childDpIds.map((id) =>
            subscribe(id, (s) => setChildStates((p) => ({ ...p, [id]: s?.val ?? null }))),
        );
        return () => unsubs.forEach((u) => u());
    }, [childDpKey]); // eslint-disable-line react-hooks/exhaustive-deps
    const groupSwitchTargets = useMemo<GroupTarget[]>(() => {
        if (!groupSwitchEnabled || groupActionType !== 'switch') return [];
        const cfg: GroupActionConfigOpts = {
            groupDimmerOnValue,
            groupIncludeNumbers,
            groupNumberOnValue,
            groupNumberOffValue,
        };
        return children
            .filter((c) => !groupExcludeSet.has(c.id))
            .map((c) => groupChildTarget(c, (id) => childStates[id] ?? null, cfg))
            .filter((x): x is GroupTarget => x !== null);
    }, [
        groupSwitchEnabled,
        groupActionType,
        children,
        childStates,
        groupDimmerOnValue,
        groupIncludeNumbers,
        groupNumberOnValue,
        groupNumberOffValue,
        groupExcludeSet,
    ]);
    const groupDimmerIds = useMemo(
        () => (groupSwitchEnabled ? groupChildDimmerIds(children, groupExcludeSet) : []),
        [groupSwitchEnabled, children, groupExcludeSet],
    );
    const groupShutterTargets = useMemo(
        () => (groupSwitchEnabled ? groupChildShutterTargets(children, groupExcludeSet) : []),
        [groupSwitchEnabled, children, groupExcludeSet],
    );
    const groupPulseIds = useMemo(
        () => (groupSwitchEnabled ? groupChildPulseIds(children, groupExcludeSet) : []),
        [groupSwitchEnabled, children, groupExcludeSet],
    );
    const hasAction =
        groupActionType === 'switch'
            ? groupSwitchTargets.length > 0
            : groupActionType === 'dimmer'
              ? groupDimmerIds.length > 0
              : groupActionType === 'shutter'
                ? groupShutterTargets.length > 0
                : groupPulseIds.length > 0;
    // Frontend: only when there is something to control. Editor: always (the
    // control shows a placeholder when there are no controllable DPs yet).
    const showMaster = groupSwitchEnabled && (editMode || hasAction);

    // Whether the header row carries any visible content. When it doesn't
    // (title + icon off, no master switch, not collapsible) the bar exists only
    // in the editor — as a drag handle for the outer grid and as clearance so
    // the group's config buttons don't collide with the first child's — so it
    // must not wear a divider that makes it look like a real header.
    const hasHeaderContent = (showTitle && !!config.title) || showIcon || showMaster || collapsible;

    if (configLayout === 'custom') return <CustomGridView config={config} value="" />;

    // Mobile layout: 'stack' (default) drops children into a single column;
    // 'keep' preserves the desktop side-by-side grid, scaled down to fit the
    // phone width (so a compact 2D arrangement doesn't blow up vertically).
    const mobileLayout = (config.options?.mobileLayout as string | undefined) ?? 'stack';
    const keepGrid = !editMode && dashboardIsMobile && mobileLayout === 'keep';
    const isMobile = !editMode && dashboardIsMobile && !keepGrid;

    // Column span the children were designed for — used by keepGrid so the grid
    // isn't clamped/reflowed on a narrow phone, just uniformly scaled.
    const designCols = Math.max(2, ...gridChildren.map((c) => c.gridPos.x + c.gridPos.w));
    const cols = keepGrid
        ? designCols
        : !isMobile && width > 0
          ? Math.max(2, Math.floor((width - gridGap) / (cellSize + gridGap)))
          : 4;
    // keepGrid uses square cells (rowHeight = colWidth) so width AND height scale
    // together, faithfully reproducing the desktop arrangement at phone size.
    const rowHeight = keepGrid && width > 0 ? Math.max(8, Math.floor((width - gridGap * (cols - 1)) / cols)) : cellSize;

    const setChildren = (next: WidgetConfig[]) => useGroupDefsStore.getState().setDef(defId, next);

    const updateChild = (updated: WidgetConfig) =>
        setChildren(children.map((c) => (c.id === updated.id ? updated : c)));

    const computeH = (next: WidgetConfig[]) => {
        if (next.length === 0) return config.gridPos.h;
        const maxBottom = Math.max(...next.map((c) => c.gridPos.y + c.gridPos.h));
        const innerH = maxBottom * (cellSize + gridGap) - gridGap;
        // A header-less group (title + icon off, no master, not collapsible)
        // renders no bar in either mode, so it must not reserve header height —
        // otherwise the editor keeps an empty strip and the frontend a bottom gap.
        const titleBarH = hasHeaderContent ? (showTitle && config.title ? 37 : 36) : 0;
        // 10 = p-1 top(4) + bottom(4) + widget border 1px each side(2). A header-less
        // group uses py-0 and fits its children exactly, so it adds no vertical chrome
        // — otherwise the ceil() would bump it a whole row and leave a gap below.
        const chrome = hasHeaderContent ? 10 : 0;
        return Math.ceil((titleBarH + innerH + chrome + gridGap) / (cellSize + gridGap));
    };

    const fitHeightToChildren = (next: WidgetConfig[]) => {
        const newH = computeH(next);
        if (newH > config.gridPos.h) {
            onConfigChange({ ...config, gridPos: { ...config.gridPos, h: newH } });
        }
    };

    const shrinkToFit = (next: WidgetConfig[]) => {
        const newH = computeH(next);
        if (newH !== config.gridPos.h) {
            onConfigChange({ ...config, gridPos: { ...config.gridPos, h: newH } });
        }
    };

    const duplicateChild = (child: WidgetConfig) => {
        const maxY = children.reduce((m, c) => Math.max(m, c.gridPos.y + c.gridPos.h), 0);
        const next = verticalCompact([
            ...children,
            {
                ...child,
                id: `child-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                gridPos: { ...child.gridPos, x: 0, y: maxY },
            },
        ]);
        setChildren(next);
        fitHeightToChildren(next);
    };

    const handleGroupDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const bridge = getDragBridge();
        if (!bridge) return;
        const meta = WIDGET_BY_TYPE[bridge.widget.type as WidgetType];
        const maxY = children.reduce((m, c) => Math.max(m, c.gridPos.y + c.gridPos.h), 0);
        const next = verticalCompact([
            ...children,
            {
                ...bridge.widget,
                id: `child-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                gridPos: {
                    x: 0,
                    y: maxY,
                    // Keep the widget's current size when dropped into a group;
                    // fall back to the type default only if the source has no size.
                    w: bridge.widget.gridPos.w ?? meta?.defaultW ?? 2,
                    h: bridge.widget.gridPos.h ?? meta?.defaultH ?? 2,
                },
            },
        ]);
        setChildren(next);
        fitHeightToChildren(next);
        bridge.remove(bridge.widget.id);
        setDragBridge(null);
    };

    // ── Mobile order helpers ───────────────────────────────────────────────────
    const sorted = mobileSort(gridChildren);

    // ── Shared remove + configChange handlers ──────────────────────────────────
    const onRemove = (id: string) => {
        const next = verticalCompact(children.filter((c) => c.id !== id));
        setChildren(next);
        shrinkToFit(next);
    };

    // Off-screen render of condition-hidden+reflow children so their
    // useConditionStyle subscriptions stay alive and can bring them back.
    const offScreenHidden =
        reflowHiddenChildren.length > 0 ? (
            <div
                style={{
                    position: 'fixed',
                    top: -9999,
                    left: -9999,
                    width: 1,
                    height: 1,
                    overflow: 'hidden',
                    pointerEvents: 'none',
                    opacity: 0,
                }}
            >
                {reflowHiddenChildren.map((c) => (
                    <WidgetFrame
                        key={c.id}
                        config={c}
                        editMode={false}
                        onRemove={onRemove}
                        onConfigChange={updateChild}
                        inGroup
                    />
                ))}
            </div>
        ) : null;

    // ── Title bar (always shown in editMode as outer-grid drag handle) ─────────
    const titleAlign = (config.options?.titleAlign as string | undefined) ?? 'left';
    const titleBar = hasHeaderContent ? (
        <div
            className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 min-w-0"
            style={{
                color: 'var(--text-secondary)',
                // When collapsed the body is gone, so drop the header's divider.
                // Same when the bar is just an empty editor drag strip (no
                // header content) — a divider would read as a real header.
                borderBottom:
                    transparent || isCollapsed || !hasHeaderContent ? 'none' : '1px solid var(--widget-border)',
                minHeight: editMode && !(showTitle && config.title) ? '36px' : undefined,
                cursor: collapsible ? 'pointer' : undefined,
            }}
            onClick={
                collapsible
                    ? (e) => {
                          // Don't let the toggle bubble to a widget-level click action
                          // (e.g. "open view") on the group frame.
                          e.stopPropagation();
                          toggleCollapse(config.id);
                      }
                    : undefined
            }
        >
            {collapsible && (
                <ChevronDown
                    size={16}
                    className="transition-transform shrink-0"
                    style={{
                        color: 'var(--text-secondary)',
                        transform: isCollapsed ? 'rotate(-90deg)' : undefined,
                    }}
                />
            )}
            {showIcon && <WidgetIcon size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
            {showTitle && config.title && (
                <span
                    className="text-xs font-semibold truncate flex-1 min-w-0"
                    style={{ textAlign: titleAlign as React.CSSProperties['textAlign'] }}
                >
                    {config.title}
                </span>
            )}
            {showMaster && (
                // Wrapper stops master-control clicks from bubbling to the header's
                // collapse toggle when the group is collapsible.
                <div className="ml-auto flex min-w-0" onClick={collapsible ? (e) => e.stopPropagation() : undefined}>
                    <GroupActionControl
                        type={groupActionType}
                        cfg={gaCfg}
                        setState={setState}
                        switchTargets={groupSwitchTargets}
                        dimmerIds={groupDimmerIds}
                        shutterTargets={groupShutterTargets}
                        pulseIds={groupPulseIds}
                        editing={editMode}
                        placeholderHint={t('group.masterPlaceholder')}
                        placeholderLabel={t('group.masterPlaceholderShort')}
                    />
                </div>
            )}
        </div>
    ) : null;

    const dragHandlers = editMode
        ? {
              onDragOver: (e: React.DragEvent) => {
                  if (getDragBridge()) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setIsDragOver(true);
                  }
              },
              onDragEnter: (e: React.DragEvent) => {
                  if (getDragBridge()) {
                      e.preventDefault();
                      setIsDragOver(true);
                  }
              },
              onDragLeave: (e: React.DragEvent) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
              },
              onDrop: handleGroupDrop,
          }
        : {};

    // ── Mobile layout ──────────────────────────────────────────────────────────
    if (isMobile) {
        return (
            // h-full so a group nested in a fixed-height container (e.g. a panels
            // slide) fills it and scrolls internally instead of overflowing. At the
            // top level the mobile-stack wrapper is auto-height, so h-full resolves
            // to content height and the page still scrolls as before.
            <div
                className={`aura-widget-row relative flex flex-col h-full min-h-0 ${isCollapsed ? 'justify-center' : ''}`}
                {...dragHandlers}
            >
                {isDragOver && (
                    <div
                        className="nodrag pointer-events-none absolute inset-0 z-20 rounded-[inherit] border-2 border-dashed flex items-center justify-center"
                        style={{
                            borderColor: 'var(--accent)',
                            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                        }}
                    >
                        <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                            {t('group.dropHere')}
                        </p>
                    </div>
                )}
                {titleBar}

                {!isCollapsed && (
                    <div
                        className="aura-scroll flex-1 overflow-auto min-h-0 p-1"
                        style={{ scrollbarGutter: 'stable both-edges' }}
                    >
                        <div className="flex flex-col gap-1.5">
                            {sorted.map((child) => (
                                <div
                                    key={child.id}
                                    style={{ height: child.gridPos.h * cellSize + (child.gridPos.h - 1) * gridGap }}
                                >
                                    <WidgetFrame
                                        config={child}
                                        editMode={false}
                                        onRemove={onRemove}
                                        onConfigChange={updateChild}
                                        onDuplicate={() => duplicateChild(child)}
                                        inGroup
                                    />
                                </div>
                            ))}
                        </div>
                        {children.length === 0 && <GroupEmptyState loading={isLoading} />}
                    </div>
                )}
                {offScreenHidden}
            </div>
        );
    }

    // ── Desktop grid layout ────────────────────────────────────────────────────
    const layout = gridChildren.map((c) => {
        const x = Math.min(c.gridPos.x, cols - 1);
        const w = Math.min(c.gridPos.w, cols - x);
        return { i: c.id, x, y: c.gridPos.y, w, h: c.gridPos.h };
    });

    return (
        <div
            className={`aura-widget-row relative flex flex-col h-full ${isCollapsed ? 'justify-center' : ''}`}
            {...dragHandlers}
        >
            {isDragOver && (
                <div
                    className="nodrag pointer-events-none absolute inset-0 z-20 rounded-[inherit] border-2 border-dashed flex items-center justify-center"
                    style={{
                        borderColor: 'var(--accent)',
                        background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                    }}
                >
                    <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                        {t('group.dropHere')}
                    </p>
                </div>
            )}
            {titleBar}

            {/* Inner scrollable grid area – stop propagation so outer RGL doesn't
          intercept drags meant for the inner grid */}
            <div
                ref={containerRef}
                // Header-less: drop the vertical inset (py-0) and don't scroll in the
                // live view. The group fits its children exactly (see the height math),
                // so any py or overflow chrome would push the box a whole grid row taller
                // and leave the asymmetric gap below the last widget. Horizontal inset
                // (px-1) stays for a small side margin.
                className={`flex-1 min-h-0 ${hasHeaderContent ? 'overflow-auto p-1' : `px-1 py-0 ${editMode ? 'overflow-auto' : 'overflow-hidden'}`}`}
                style={isCollapsed ? { display: 'none' } : undefined}
                onMouseDown={editMode ? (e) => e.stopPropagation() : undefined}
                onPointerDown={editMode ? (e) => e.stopPropagation() : undefined}
            >
                {width > 0 && (
                    <ReactGridLayout
                        layout={layout}
                        cols={cols}
                        rowHeight={rowHeight}
                        width={width}
                        isDraggable={editMode}
                        isResizable={editMode}
                        compactType={editMode ? 'vertical' : null}
                        draggableCancel=".nodrag"
                        onDragStop={(newLayout) => {
                            if (!editMode) return;
                            let changed = false;
                            const updated = children.map((c) => {
                                const pos = newLayout.find((l) => l.i === c.id);
                                if (!pos) return c;
                                if (
                                    pos.x === c.gridPos.x &&
                                    pos.y === c.gridPos.y &&
                                    pos.w === c.gridPos.w &&
                                    pos.h === c.gridPos.h
                                )
                                    return c;
                                changed = true;
                                return { ...c, gridPos: { x: pos.x, y: pos.y, w: pos.w, h: pos.h } };
                            });
                            if (changed) {
                                setChildren(updated);
                                shrinkToFit(updated);
                            }
                        }}
                        onResizeStop={(newLayout) => {
                            if (!editMode) return;
                            let changed = false;
                            const updated = children.map((c) => {
                                const pos = newLayout.find((l) => l.i === c.id);
                                if (!pos) return c;
                                if (
                                    pos.x === c.gridPos.x &&
                                    pos.y === c.gridPos.y &&
                                    pos.w === c.gridPos.w &&
                                    pos.h === c.gridPos.h
                                )
                                    return c;
                                changed = true;
                                return { ...c, gridPos: { x: pos.x, y: pos.y, w: pos.w, h: pos.h } };
                            });
                            if (changed) {
                                setChildren(updated);
                                shrinkToFit(updated);
                            }
                        }}
                        margin={[gridGap, gridGap]}
                        containerPadding={[0, 0]}
                    >
                        {gridChildren.map((child) => (
                            <div key={child.id}>
                                <WidgetFrame
                                    config={child}
                                    editMode={editMode}
                                    onRemove={onRemove}
                                    onConfigChange={updateChild}
                                    onDuplicate={() => duplicateChild(child)}
                                    inGroup
                                />
                            </div>
                        ))}
                    </ReactGridLayout>
                )}

                {children.length === 0 && !editMode && <GroupEmptyState loading={isLoading} />}
            </div>
            {offScreenHidden}
        </div>
    );
}
