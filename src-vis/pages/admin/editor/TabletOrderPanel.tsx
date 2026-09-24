import { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GripVertical, Maximize2, Minimize2 } from 'lucide-react';
import { useDashboardStore } from '../../../store/dashboardStore';
import { useT } from '../../../i18n';
import type { WidgetConfig } from '../../../types';
import {
    emptiestColumn,
    flowBands,
    flowFields,
    isWideInFlow,
    linearizeBands,
    tabExtentOf,
    type FlowBand,
    type FlowMode,
} from '../../../utils/flowOrder';

type Band = FlowBand<WidgetConfig>;
type ColumnsBand = Extract<Band, { kind: 'columns' }>;
type Slot = { bi: number; ci: number; idx: number };
const NO_WIDGETS: WidgetConfig[] = [];

const clone = (bands: Band[]): Band[] =>
    bands.map((b) => (b.kind === 'full' ? { ...b } : { kind: 'columns', columns: b.columns.map((c) => [...c]) }));

const emptyBlock = (cols: number): ColumnsBand => ({
    kind: 'columns',
    columns: Array.from({ length: cols }, () => []),
});

/** Drop empty blocks and merge two blocks that touch (the band between them went away). */
function normalize(bands: Band[], cols: number): Band[] {
    const out: Band[] = [];
    for (const b of bands) {
        if (b.kind === 'columns') {
            if (b.columns.every((c) => c.length === 0)) continue;
            const prev = out[out.length - 1];
            if (prev && prev.kind === 'columns') {
                for (let c = 0; c < cols; c++) prev.columns[c].push(...(b.columns[c] ?? []));
                continue;
            }
        }
        out.push(b);
    }
    return out;
}

/** Where a widget sits: ci/idx are -1 for a full-width band. */
function locate(bands: Band[], id: string): Slot | null {
    for (let bi = 0; bi < bands.length; bi++) {
        const b = bands[bi];
        if (b.kind === 'full') {
            if (b.widget.id === id) return { bi, ci: -1, idx: -1 };
            continue;
        }
        for (let ci = 0; ci < b.columns.length; ci++) {
            const idx = b.columns[ci].findIndex((w) => w.id === id);
            if (idx >= 0) return { bi, ci, idx };
        }
    }
    return null;
}

/** Take a widget out of the structure, wherever it is. */
function take(bands: Band[], id: string): WidgetConfig | null {
    const at = locate(bands, id);
    if (!at) return null;
    const b = bands[at.bi];
    if (b.kind === 'full') {
        bands.splice(at.bi, 1);
        return b.widget;
    }
    return b.columns[at.ci].splice(at.idx, 1)[0] ?? null;
}

const iconBtn =
    'w-6 h-5 flex items-center justify-center rounded text-[10px] hover:opacity-80 disabled:opacity-20 disabled:cursor-default';
const iconBtnStyle = {
    background: 'var(--app-surface)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--app-border)',
} as const;

/**
 * Arrange the active tab for the tablet band (#413): the panel shows the configured
 * number of columns and the full-width bands between them — the very structure the
 * frontend renders (utils/flowOrder.flowBands) — and every change is written back as
 * tabletOrder / tabletCol / tabletWide, so what you see here is what the tablet shows.
 * Unassigned widgets start out alternating in the mobile order; the first change pins
 * the whole tab, so nothing jumps around afterwards. With mode 'mobile' the same panel
 * arranges a phone with mobileCols > 1 and writes mobileOrder / mobileCol / mobileWide.
 */
export function TabletOrderPanel({
    layoutId,
    cols,
    mode = 'tablet',
}: {
    layoutId: string;
    cols: number;
    mode?: FlowMode;
}) {
    const fields = flowFields(mode);
    const t = useT();
    const { layouts, updateWidgetInTab } = useDashboardStore();
    const activeTabId = useDashboardStore((s) => {
        const l = s.layouts.find((x) => x.id === layoutId) ?? s.layouts[0];
        const sec = l?.sections.find((x) => x.id === l.activeSectionId) ?? l?.sections[0];
        return sec?.activeTabId ?? '';
    });
    const tab = (() => {
        const l = layouts.find((x) => x.id === layoutId);
        const sec = l?.sections.find((x) => x.id === l.activeSectionId) ?? l?.sections[0];
        return sec?.tabs.find((x) => x.id === activeTabId);
    })();
    // A stable empty array, so the memo below does not rebuild on every render of an empty tab.
    const widgets = tab?.widgets ?? NO_WIDGETS;

    const bands = useMemo(() => flowBands(widgets, mode, cols), [widgets, mode, cols]);

    const [dragId, setDragId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);

    /** Write the arranged structure back — order for all, column for cards, band flag for bands. */
    const commit = (next: Band[]) => {
        if (!tab) return;
        const tabExtent = tabExtentOf(widgets);
        for (const { widget: w, order, col, wide } of linearizeBands(normalize(next, cols))) {
            const patch: Partial<WidgetConfig> = {};
            if (w[fields.order] !== order) patch[fields.order] = order;
            if (wide) {
                if (w[fields.wide] !== true) patch[fields.wide] = true;
            } else {
                if (w[fields.col] !== col) patch[fields.col] = col ?? undefined;
                // A card the desktop width would call wide needs an explicit "no";
                // otherwise the flag can stay away and the desktop rule keeps deciding.
                const autoWide = isWideInFlow({ ...w, [fields.wide]: undefined }, tabExtent, cols, mode);
                const want = autoWide ? false : undefined;
                if (w[fields.wide] !== want) patch[fields.wide] = want;
            }
            if (Object.keys(patch).length) updateWidgetInTab(tab.id, w.id, { ...w, ...patch });
        }
    };

    const moveVertical = (id: string, dir: -1 | 1) => {
        const next = clone(bands);
        const at = locate(next, id);
        if (!at) return;
        const b = next[at.bi];
        if (b.kind === 'full') {
            const j = at.bi + dir;
            if (j < 0 || j >= next.length) return;
            [next[at.bi], next[j]] = [next[j], next[at.bi]];
        } else {
            const col = b.columns[at.ci];
            const j = at.idx + dir;
            if (j < 0 || j >= col.length) return;
            [col[at.idx], col[j]] = [col[j], col[at.idx]];
        }
        commit(next);
    };

    const moveHorizontal = (id: string, dir: -1 | 1) => {
        const next = clone(bands);
        const at = locate(next, id);
        if (!at) return;
        const b = next[at.bi];
        if (b.kind !== 'columns') return;
        const to = at.ci + dir;
        if (to < 0 || to >= cols) return;
        const w = b.columns[at.ci].splice(at.idx, 1)[0];
        const target = b.columns[to];
        target.splice(Math.min(at.idx, target.length), 0, w);
        commit(next);
    };

    const toggleWide = (id: string) => {
        const next = clone(bands);
        const at = locate(next, id);
        if (!at) return;
        const wasBand = next[at.bi].kind === 'full';
        const w = take(next, id);
        if (!w) return;
        if (wasBand) {
            // Back into the columns: the block that now sits where the band was, top of
            // its emptiest column — or a fresh block there, which normalize() merges.
            const below = next[at.bi];
            const target: ColumnsBand = below && below.kind === 'columns' ? below : emptyBlock(cols);
            if (target !== below) next.splice(at.bi, 0, target);
            target.columns[emptiestColumn(target.columns)].unshift(w);
        } else {
            next.splice(at.bi + 1, 0, { kind: 'full', widget: w });
        }
        commit(next);
    };

    /** Drop onto a card (before it) or onto a column's tail (append). */
    const dropInto = (targetCardId: string | null, tailBand: Band | null, tailCol: number) => {
        if (!dragId || dragId === targetCardId) return;
        const next = clone(bands);
        // Resolve the tail target by identity before anything moves — taking a band out
        // shifts every index below it.
        const tailRef = tailBand ? next[bands.indexOf(tailBand)] : null;
        const w = take(next, dragId);
        if (!w) return;
        if (targetCardId) {
            const at = locate(next, targetCardId);
            if (!at) return;
            const b = next[at.bi];
            if (b.kind !== 'columns') return;
            b.columns[at.ci].splice(at.idx, 0, w);
        } else {
            if (!tailRef || tailRef.kind !== 'columns') return;
            tailRef.columns[tailCol].push(w);
        }
        commit(next);
    };

    const endDrag = () => {
        setDragId(null);
        setOverId(null);
    };

    const title = (w: WidgetConfig) => w.title || t(`widget.${w.type}` as never) || w.type;

    const card = (w: WidgetConfig, ctx: { wide: boolean; canUp: boolean; canDown: boolean; ci: number }) => {
        const isDragging = dragId === w.id;
        const isOver = overId === w.id && dragId !== w.id;
        return (
            <div
                key={w.id}
                data-aura-order-card={w.id}
                draggable
                onDragStart={() => setDragId(w.id)}
                onDragOver={(e) => {
                    if (ctx.wide) return;
                    e.preventDefault();
                    setOverId(w.id);
                }}
                onDragLeave={() => setOverId((cur) => (cur === w.id ? null : cur))}
                onDrop={(e) => {
                    e.preventDefault();
                    dropInto(w.id, null, 0);
                    endDrag();
                }}
                onDragEnd={endDrag}
                className="rounded-lg select-none px-2 py-1.5"
                style={{
                    background: isDragging
                        ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                        : isOver
                          ? 'color-mix(in srgb, var(--accent) 6%, var(--app-bg))'
                          : 'var(--app-bg)',
                    border: `1px solid ${isOver ? 'var(--accent)' : 'var(--app-border)'}`,
                    opacity: isDragging ? 0.5 : 1,
                    cursor: 'grab',
                }}
            >
                <div className="flex items-center gap-1.5 min-w-0">
                    <GripVertical size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <span
                        data-aura-order-title
                        className="flex-1 text-xs truncate"
                        style={{ color: 'var(--text-primary)' }}
                        title={title(w)}
                    >
                        {title(w)}
                    </span>
                </div>
                <div className="flex items-center gap-0.5 mt-1">
                    {!ctx.wide && (
                        <button
                            data-aura-order-action="left"
                            className={iconBtn}
                            style={iconBtnStyle}
                            disabled={ctx.ci <= 0}
                            onClick={() => moveHorizontal(w.id, -1)}
                            title={t('editor.tablet.left')}
                        >
                            <ChevronLeft size={11} />
                        </button>
                    )}
                    <button
                        data-aura-order-action="up"
                        className={iconBtn}
                        style={iconBtnStyle}
                        disabled={!ctx.canUp}
                        onClick={() => moveVertical(w.id, -1)}
                        title={t('editor.tablet.up')}
                    >
                        <ChevronUp size={11} />
                    </button>
                    <button
                        data-aura-order-action="down"
                        className={iconBtn}
                        style={iconBtnStyle}
                        disabled={!ctx.canDown}
                        onClick={() => moveVertical(w.id, 1)}
                        title={t('editor.tablet.down')}
                    >
                        <ChevronDown size={11} />
                    </button>
                    {!ctx.wide && (
                        <button
                            data-aura-order-action="right"
                            className={iconBtn}
                            style={iconBtnStyle}
                            disabled={ctx.ci >= cols - 1}
                            onClick={() => moveHorizontal(w.id, 1)}
                            title={t('editor.tablet.right')}
                        >
                            <ChevronRight size={11} />
                        </button>
                    )}
                    <span className="flex-1" />
                    <button
                        data-aura-order-action={ctx.wide ? 'narrow' : 'wide'}
                        className={iconBtn}
                        style={iconBtnStyle}
                        onClick={() => toggleWide(w.id)}
                        title={t(ctx.wide ? 'editor.tablet.narrow' : 'editor.tablet.wide')}
                    >
                        {ctx.wide ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                    </button>
                </div>
            </div>
        );
    };

    // Wide enough for the columns to stay readable: ~140 px per column plus padding.
    const width = Math.max(260, cols * 150 + 24);

    return (
        <div
            data-aura-order-list={mode}
            className="flex flex-col h-full overflow-hidden"
            style={{ borderLeft: '1px solid var(--app-border)', background: 'var(--app-surface)', width }}
        >
            <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--app-border)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t(mode === 'tablet' ? 'editor.tablet.title' : 'editor.mobile.title')}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {cols} {t('editor.tablet.columns')} ·{' '}
                    {t(mode === 'tablet' ? 'editor.tablet.hint' : 'editor.mobile.colsHint')}
                </p>
            </div>

            <div className="aura-scroll flex-1 overflow-y-auto p-3 space-y-2">
                {widgets.length === 0 ? (
                    <p className="text-xs text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                        {t('editor.tab.noWidgets')}
                    </p>
                ) : (
                    bands.map((band, bi) =>
                        band.kind === 'full' ? (
                            <div key={band.widget.id} data-aura-order-band="full">
                                {card(band.widget, {
                                    wide: true,
                                    canUp: bi > 0,
                                    canDown: bi < bands.length - 1,
                                    ci: 0,
                                })}
                            </div>
                        ) : (
                            <div
                                key={`block-${bi}`}
                                data-aura-order-block={bi}
                                className="grid gap-1.5"
                                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                            >
                                {band.columns.map((col, ci) => (
                                    <div
                                        key={ci}
                                        data-aura-order-col={ci}
                                        className="flex flex-col gap-1.5 min-w-0 rounded-lg"
                                        style={{ border: '1px dashed var(--app-border)', padding: 4, minHeight: 40 }}
                                    >
                                        {col.map((w, idx) =>
                                            card(w, { wide: false, canUp: idx > 0, canDown: idx < col.length - 1, ci }),
                                        )}
                                        {/* Tail: drop here to append to this column. */}
                                        <div
                                            data-aura-order-tail={ci}
                                            className="flex-1 rounded"
                                            style={{
                                                minHeight: 14,
                                                background:
                                                    dragId && overId === `tail:${bi}:${ci}`
                                                        ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                                                        : undefined,
                                            }}
                                            onDragOver={(e) => {
                                                if (!dragId) return;
                                                e.preventDefault();
                                                setOverId(`tail:${bi}:${ci}`);
                                            }}
                                            onDragLeave={() =>
                                                setOverId((cur) => (cur === `tail:${bi}:${ci}` ? null : cur))
                                            }
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                dropInto(null, band, ci);
                                                endDrag();
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        ),
                    )
                )}
            </div>
        </div>
    );
}
