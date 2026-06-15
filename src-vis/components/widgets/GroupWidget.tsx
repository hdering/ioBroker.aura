import { useRef, useState, useEffect, useMemo } from 'react';
import { Layers, Loader } from 'lucide-react';
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

    if (configLayout === 'custom') return <CustomGridView config={config} value="" />;

    const isMobile = !editMode && dashboardIsMobile;

    const cols = !isMobile && width > 0 ? Math.max(2, Math.floor((width - gridGap) / (cellSize + gridGap))) : 4;

    const setChildren = (next: WidgetConfig[]) => useGroupDefsStore.getState().setDef(defId, next);

    const updateChild = (updated: WidgetConfig) =>
        setChildren(children.map((c) => (c.id === updated.id ? updated : c)));

    const computeH = (next: WidgetConfig[]) => {
        if (next.length === 0) return config.gridPos.h;
        const maxBottom = Math.max(...next.map((c) => c.gridPos.y + c.gridPos.h));
        const innerH = maxBottom * (cellSize + gridGap) - gridGap;
        const titleBarH = showTitle && config.title ? 37 : editMode ? 36 : 0;
        // 10 = p-1 top(4) + bottom(4) + widget border 1px each side(2)
        return Math.ceil((titleBarH + innerH + 10 + gridGap) / (cellSize + gridGap));
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
                    w: meta?.defaultW ?? bridge.widget.gridPos.w,
                    h: meta?.defaultH ?? bridge.widget.gridPos.h,
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
    const titleBar =
        (showTitle && config.title) || editMode || showMaster ? (
            <div
                className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 min-w-0"
                style={{
                    color: 'var(--text-secondary)',
                    borderBottom: transparent ? 'none' : '1px solid var(--widget-border)',
                    minHeight: editMode && !(showTitle && config.title) ? '36px' : undefined,
                }}
            >
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
                        className="ml-auto"
                    />
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
            <div className="aura-widget-row relative flex flex-col" {...dragHandlers}>
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
        <div className="aura-widget-row relative flex flex-col h-full" {...dragHandlers}>
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
                className="flex-1 overflow-auto min-h-0 p-1"
                onMouseDown={editMode ? (e) => e.stopPropagation() : undefined}
                onPointerDown={editMode ? (e) => e.stopPropagation() : undefined}
            >
                {width > 0 && (
                    <ReactGridLayout
                        layout={layout}
                        cols={cols}
                        rowHeight={cellSize}
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
