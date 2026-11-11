import type { WidgetConfig } from '../types';

/**
 * The narrow-screen "flow" layouts share one rule set: the phone stacks the tab's
 * widgets in ONE column ordered by `mobileOrder`, the tablet flows them into N
 * columns ordered by `tabletOrder`. Renderer (Dashboard) and editor panel
 * (AdminEditor's OrderPanel) must sort identically, so the rule lives here once.
 */
export type FlowMode = 'mobile' | 'tablet';

/** Grid position as a single sortable number — the order the desktop shows, read
 *  row by row. The fallback for a widget that was never arranged by hand. */
export const gridOrderValue = (w: Pick<WidgetConfig, 'gridPos'>) => w.gridPos.y * 1000 + w.gridPos.x;

/**
 * Sort key of a widget in the given flow. The tablet falls back to the MOBILE
 * order before the grid: a tablet column is a phone-width column, and the
 * collaborator on #413 asked for exactly that — arrange the mobile order once,
 * the tablet follows, and `tabletOrder` only exists to fine-tune on top.
 */
export function flowOrderValue(
    w: Pick<WidgetConfig, 'gridPos' | 'mobileOrder' | 'tabletOrder'>,
    mode: FlowMode,
): number {
    if (mode === 'tablet') return w.tabletOrder ?? w.mobileOrder ?? gridOrderValue(w);
    return w.mobileOrder ?? gridOrderValue(w);
}

export function sortForFlow<T extends Pick<WidgetConfig, 'gridPos' | 'mobileOrder' | 'tabletOrder'>>(
    widgets: readonly T[],
    mode: FlowMode,
): T[] {
    return [...widgets].sort((a, b) => flowOrderValue(a, mode) - flowOrderValue(b, mode));
}

/** Which field a flow mode is arranged by — the editor panel writes this one. */
export const flowOrderField = (mode: FlowMode): 'mobileOrder' | 'tabletOrder' =>
    mode === 'tablet' ? 'tabletOrder' : 'mobileOrder';

/** The fields a column flow is arranged by. The phone can have columns too
 *  (setting mobileCols, #413) and keeps its own pins, so a card placed in the
 *  tablet's third column does not drag the phone layout along. */
export const flowFields = (mode: FlowMode) =>
    mode === 'tablet'
        ? ({
              order: 'tabletOrder',
              col: 'tabletCol',
              wide: 'tabletWide',
              band: 'tabletBandCols',
              widths: 'tabletBandWidths',
          } as const)
        : ({
              order: 'mobileOrder',
              col: 'mobileCol',
              wide: 'mobileWide',
              band: 'mobileBandCols',
              widths: 'mobileBandWidths',
          } as const);

/** Most columns a column block can have, its own count included (#851). */
export const MAX_FLOW_COLS = 4;

/** Widest share one column of a block can get: 3 = three times a plain column (#851). */
export const MAX_FLOW_COL_WEIGHT = 3;

/** Columns the tab's widgets actually use on the desktop grid — the width a widget's
 *  share is measured against. Floor 2 so a lone widget never divides by one column. */
export function tabExtentOf(widgets: readonly Pick<WidgetConfig, 'gridPos'>[]): number {
    return Math.max(2, ...widgets.map((w) => w.gridPos.x + w.gridPos.w));
}

/**
 * Columns a widget spans in an N-column flow: its share of the tab's used width,
 * rounded to whole columns and clamped to [1, cols]. Half of the tab in a 2-column
 * flow is one column, the full width is both; two thirds rounds down to one so
 * "roughly half" widgets still pack side by side.
 */
export function flowSpan(w: Pick<WidgetConfig, 'gridPos'>, tabExtent: number, cols: number): number {
    if (cols <= 1) return 1;
    return Math.min(cols, Math.max(1, Math.round((w.gridPos.w / Math.max(1, tabExtent)) * cols)));
}

/**
 * Is a viewport inside the tablet band? The band exists only when the tablet
 * breakpoint lies above the mobile one; 0 switches it off. It is measured against
 * the VIEWPORT, not the dashboard's own box: the number a user configures is the
 * device width they read off the resolution overlay, and a docked section menu
 * must not shift it — 240 px of menu plus padding turned "768" into "switches at
 * 1024" (#413). The section menu decides its tablet placement by the same rule.
 */
export function tabletBandActive(
    viewportWidth: number,
    opts: { mobileBreakpoint: number; tabletBreakpoint: number },
): boolean {
    return viewportWidth > 0 && opts.tabletBreakpoint > opts.mobileBreakpoint && viewportWidth < opts.tabletBreakpoint;
}

/**
 * Which flow (if any) the dashboard renders. Mobile is decided by the dashboard's
 * container width, as it always was — a docked menu that leaves only phone width
 * gets the phone stack. The tablet band is decided by the viewport, see
 * tabletBandActive. In the editor the tablet band is skipped — the tablet layout
 * is derived, its order is arranged in a side panel, and the editor's preview
 * column is narrower than the window, so a 1024 px breakpoint would otherwise
 * turn most editors into a non-draggable flow.
 */
export function flowModeFor(
    widths: { container: number; viewport: number },
    opts: { mobileBreakpoint: number; tabletBreakpoint: number; editMode?: boolean },
): FlowMode | null {
    if (!(widths.container > 0)) return null;
    if (widths.container < opts.mobileBreakpoint) return 'mobile';
    if (!opts.editMode && tabletBandActive(widths.viewport, opts)) return 'tablet';
    return null;
}

// ── Column stacks ─────────────────────────────────────────────────────────────
// The tablet flow is a stack of BANDS: a column block (N independent columns, each
// stacking its widgets top-down — no gaps under short cards, unlike a row grid) or
// one widget spanning the full width, which ends the block above and starts a new
// one below. The editor panel shows exactly this structure and writes it back with
// three fields per widget: tabletOrder (bands top-down, a block row by row),
// tabletCol (the column a card was put in) and tabletWide (a full-width band).
// A block may have its own column count (#851): `tabletBandCols` on the block's
// first widget starts a new block with that many columns, even right below another.

export type FlowWidget = Pick<
    WidgetConfig,
    | 'id'
    | 'gridPos'
    | 'mobileOrder'
    | 'tabletOrder'
    | 'tabletCol'
    | 'tabletWide'
    | 'tabletBandCols'
    | 'tabletBandWidths'
    | 'mobileCol'
    | 'mobileWide'
    | 'mobileBandCols'
    | 'mobileBandWidths'
>;

/** `start`: the block was begun on purpose (its first widget carries the band field),
 *  so it stays its own block even directly below another one. `widths`: the columns'
 *  shares (2:1 = the left column twice as wide), one per column; absent = all equal. */
export type FlowBand<W> =
    | { kind: 'full'; widget: W }
    | {
          kind: 'columns';
          columns: W[][];
          start?: boolean;
          widths?: number[];
          /** Compact fill (#939): the block uses fewer columns than the flow has. Each column
           *  keeps the width of one of `slots` columns and the block is centred. */
          slots?: number;
      };

/**
 * How a column block deals its unpinned cards (#939).
 * - `count`: the column with the fewest cards (round-robin) — the original rule.
 * - `height`: the shortest column (masonry), measured in px.
 * - `compact`: masonry with as few columns as needed — the smallest column count whose
 *   block is no taller than its tallest card; the block is centred.
 */
export type FlowFill = 'count' | 'height' | 'compact';

export const FLOW_FILLS: readonly FlowFill[] = ['count', 'height', 'compact'];

export function normalizeFlowFill(v: unknown): FlowFill {
    return v === 'height' || v === 'compact' ? v : 'count';
}

export type FlowBandOptions<W> = {
    fill?: FlowFill;
    /** Height of a card's box in px. Without it `height` / `compact` fall back to `count`. */
    heightOf?: (w: W) => number;
    /** Vertical gap between two cards of a column, px. */
    gap?: number;
    /** Compact: how much taller than its tallest card a block may get, px. */
    tolerance?: number;
};

/** Slack the compact fill allows over the tallest card — the number the issue's
 *  own script used (#939). */
export const COMPACT_TOLERANCE = 20;

/** A block's own column count as stored, clamped to [1, MAX_FLOW_COLS]; null when none is set. */
export function bandColsOf(w: FlowWidget, mode: FlowMode): number | null {
    const v = w[flowFields(mode).band];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return Math.min(MAX_FLOW_COLS, Math.max(1, Math.round(v)));
}

/** Column shares as stored for an n-column block, each clamped to [1, MAX_FLOW_COL_WEIGHT];
 *  null when none is set, the length does not match or all are equal (= plain columns). */
export function bandWidthsOf(w: FlowWidget, mode: FlowMode, n: number): number[] | null {
    return cleanWidths(w[flowFields(mode).widths], n);
}

function cleanWidths(v: unknown, n: number): number[] | null {
    if (!Array.isArray(v) || v.length !== n || n < 2) return null;
    const out = v.map((x) =>
        typeof x === 'number' && Number.isFinite(x) ? Math.min(MAX_FLOW_COL_WEIGHT, Math.max(1, Math.round(x))) : 1,
    );
    return out.every((x) => x === out[0]) ? null : out;
}

/** CSS grid columns of a block: equal columns, or the stored shares as fr units. */
export function flowGridTemplate(n: number, widths?: readonly number[] | null): string {
    const w = cleanWidths(widths, n);
    return w ? w.map((x) => `minmax(0, ${x}fr)`).join(' ') : `repeat(${n}, minmax(0, 1fr))`;
}

/** The splits the order panel offers for an n-column block: all equal first, then one
 *  column twice as wide in every position, for two columns also 3:1 / 1:3. */
export function bandWidthPresets(n: number): number[][] {
    if (n < 2) return [];
    const out: number[][] = [Array.from({ length: n }, () => 1)];
    for (let i = 0; i < n; i++) out.push(Array.from({ length: n }, (_, j) => (j === i ? 2 : 1)));
    if (n === 2) out.push([3, 1], [1, 3]);
    return out;
}

/** Does a widget take the whole flow width? An explicit `tabletWide` / `mobileWide` wins;
 *  otherwise a widget that covers the tab's used width on the desktop (rounded to columns) does. */
export function isWideInFlow(w: FlowWidget, tabExtent: number, cols: number, mode: FlowMode = 'tablet'): boolean {
    const wide = w[flowFields(mode).wide];
    if (typeof wide === 'boolean') return wide;
    return cols > 1 && flowSpan(w, tabExtent, cols) === cols;
}

/** Column with the fewest widgets, leftmost on a tie — plain round-robin while nothing is pinned. */
export function emptiestColumn(columns: readonly (readonly unknown[])[]): number {
    let best = 0;
    for (let i = 1; i < columns.length; i++) if (columns[i].length < columns[best].length) best = i;
    return best;
}

/**
 * Build the bands for a tab. One column is a single block in the flow order — the
 * phone stack as it always was. With several columns (tablet, or a phone with
 * mobileCols > 1) the widgets are walked in flow order: a wide one becomes a band,
 * every other one goes into the current block, into its pinned `tabletCol` /
 * `mobileCol` (clamped to the column count, so dropping from 3 to 2 columns folds
 * the third into the last) or, unpinned, into the emptiest column. A widget with
 * `tabletBandCols` / `mobileBandCols` starts a new block with its own column count
 * (and, with `tabletBandWidths` / `mobileBandWidths`, its own column shares);
 * every other block has the configured `cols`.
 */
export function flowBands<W extends FlowWidget>(
    widgets: readonly W[],
    mode: FlowMode,
    cols: number,
    opts: FlowBandOptions<W> = {},
): FlowBand<W>[] {
    const sorted = sortForFlow(widgets, mode);
    if (cols <= 1) {
        return sorted.length ? [{ kind: 'columns', columns: [sorted] }] : [];
    }
    const colField = flowFields(mode).col;
    const tabExtent = tabExtentOf(widgets);
    // Without heights there is nothing to measure by — the count rule it is.
    const fill: FlowFill = opts.heightOf ? normalizeFlowFill(opts.fill) : 'count';
    const gap = opts.gap ?? 0;
    const heightOf = opts.heightOf ?? (() => 0);
    const bands: FlowBand<W>[] = [];
    // The cards of the block being collected; dealt into columns when it ends.
    let pending: { band: Extract<FlowBand<W>, { kind: 'columns' }>; cards: W[]; own: boolean } | null = null;
    const flush = () => {
        if (!pending) return;
        dealBlock(pending.band, pending.cards, {
            fill,
            pinOf: (w) => {
                const pin = w[colField];
                return typeof pin === 'number' && Number.isFinite(pin) ? Math.round(pin) : null;
            },
            heightOf,
            gap,
            // A block begun on purpose (own column count / shares) was arranged by hand:
            // it keeps its columns, compact only fills it by height.
            mayShrink: !pending.own,
            tolerance: opts.tolerance ?? COMPACT_TOLERANCE,
        });
        pending = null;
    };
    for (const w of sorted) {
        if (isWideInFlow(w, tabExtent, cols, mode)) {
            flush();
            bands.push({ kind: 'full', widget: w });
            continue;
        }
        const own = bandColsOf(w, mode);
        if (!pending || own !== null) {
            flush();
            const block = Array.from({ length: own ?? cols }, () => [] as W[]);
            const widths = own !== null ? bandWidthsOf(w, mode, own) : null;
            const band: Extract<FlowBand<W>, { kind: 'columns' }> = own === null
                ? { kind: 'columns', columns: block }
                : widths
                  ? { kind: 'columns', columns: block, start: true, widths }
                  : { kind: 'columns', columns: block, start: true };
            bands.push(band);
            pending = { band, cards: [], own: own !== null };
        }
        pending.cards.push(w);
    }
    flush();
    return bands;
}

/** Sum of a column's card heights plus the gaps between them. */
function stackHeight<W>(col: readonly W[], heightOf: (w: W) => number, gap: number): number {
    let h = 0;
    for (const w of col) h += heightOf(w);
    return h + Math.max(0, col.length - 1) * gap;
}

/** Index of the lowest column, leftmost on a tie. */
function lowestColumn(heights: readonly number[]): number {
    let best = 0;
    for (let i = 1; i < heights.length; i++) if (heights[i] < heights[best] - 0.5) best = i;
    return best;
}

/** Masonry: every card, in the given order, into the lowest of `k` columns. */
function masonry<W>(cards: readonly W[], k: number, heightOf: (w: W) => number, gap: number): W[][] {
    const cols = Array.from({ length: k }, () => [] as W[]);
    const h = Array.from({ length: k }, () => 0);
    for (const w of cards) {
        const c = lowestColumn(h);
        h[c] += (cols[c].length ? gap : 0) + heightOf(w);
        cols[c].push(w);
    }
    return cols;
}

/**
 * Deal a block's cards into its columns.
 * count / height walk the cards in flow order: a pinned card goes into its column, an
 * unpinned one into the emptiest (count) or lowest (height) column.
 * compact (block without pins, not begun on purpose): for k = 1 … N columns, masonry in
 * flow order and masonry tallest-first; the lower of the two wins. The first k whose
 * block stays within the tallest card (+ tolerance) is taken, else N. The columns are
 * then put in reading order (the column holding the earliest card on the left) and each
 * column lists its cards in flow order — so the block still reads row by row (#939).
 */
function dealBlock<W>(
    band: Extract<FlowBand<W>, { kind: 'columns' }>,
    cards: readonly W[],
    o: {
        fill: FlowFill;
        pinOf: (w: W) => number | null;
        heightOf: (w: W) => number;
        gap: number;
        mayShrink: boolean;
        tolerance: number;
    },
): void {
    const block = band.columns;
    const n = block.length;
    const anyPin = cards.some((w) => o.pinOf(w) !== null);
    if (o.fill === 'compact' && o.mayShrink && !anyPin && n > 1 && cards.length > 0) {
        const rank = new Map(cards.map((w, i) => [w, i]));
        const tallestFirst = [...cards].sort((a, b) => o.heightOf(b) - o.heightOf(a) || rank.get(a)! - rank.get(b)!);
        const tallest = Math.max(...cards.map(o.heightOf));
        const blockHeight = (cs: W[][]) => Math.max(...cs.map((c) => stackHeight(c, o.heightOf, o.gap)));
        let chosen: W[][] | null = null;
        for (let k = 1; k <= n; k++) {
            const a = masonry(cards, k, o.heightOf, o.gap);
            const b = masonry(tallestFirst, k, o.heightOf, o.gap);
            const best = blockHeight(b) < blockHeight(a) - 0.5 ? b : a;
            if (k === n || blockHeight(best) <= tallest + o.tolerance) {
                chosen = best;
                break;
            }
        }
        const cols = chosen!
            .filter((c) => c.length > 0)
            .map((c) => [...c].sort((x, y) => rank.get(x)! - rank.get(y)!))
            .sort((x, y) => rank.get(x[0])! - rank.get(y[0])!);
        block.length = 0;
        block.push(...cols);
        if (cols.length < n) band.slots = n;
        return;
    }
    const byHeight = o.fill !== 'count';
    const h = Array.from({ length: n }, () => 0);
    for (const w of cards) {
        const pin = o.pinOf(w);
        const col =
            pin !== null ? Math.min(n - 1, Math.max(0, pin)) : byHeight ? lowestColumn(h) : emptiestColumn(block);
        h[col] += (block[col].length ? o.gap : 0) + o.heightOf(w);
        block[col].push(w);
    }
}

/**
 * The order the panel writes back: bands top-down, a column block row by row (the
 * first card of every column, then the second …). Written to `tabletOrder` (phone: `mobileOrder`), with
 * `tabletCol` for every column card and `tabletWide` for every band, flowBands()
 * rebuilds exactly the structure the user arranged — and a widget added later
 * (no pin) lands in the emptiest column of the block its order falls into.
 * `bandCols` is set on the first widget of a block that was started on purpose or
 * whose column count differs from the configured `cols`, null everywhere else; the
 * same widget carries `bandWidths` when the block's columns are not all equal.
 */
export type LinearEntry<W> = {
    widget: W;
    order: number;
    col: number | null;
    wide: boolean;
    bandCols: number | null;
    bandWidths: number[] | null;
};

export function linearizeBands<W extends FlowWidget>(bands: readonly FlowBand<W>[], cols = 0): LinearEntry<W>[] {
    const out: LinearEntry<W>[] = [];
    let order = 0;
    for (const band of bands) {
        if (band.kind === 'full') {
            out.push({ widget: band.widget, order: order++, col: null, wide: true, bandCols: null, bandWidths: null });
            continue;
        }
        const widths = cleanWidths(band.widths, band.columns.length);
        const marks = !!band.start || !!widths || (cols > 0 && band.columns.length !== cols);
        const rows = Math.max(0, ...band.columns.map((c) => c.length));
        let first = true;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < band.columns.length; c++) {
                const w = band.columns[c][r];
                if (!w) continue;
                const bandCols = first && marks ? band.columns.length : null;
                const bandWidths = first ? widths : null;
                out.push({ widget: w, order: order++, col: c, wide: false, bandCols, bandWidths });
                first = false;
            }
        }
    }
    return out;
}

/** The same cards in `n` columns, dealt row by row (the first card of every column,
 *  then the second …): what a block shows after its column count changed. */
export function redealBlock<W>(columns: readonly (readonly W[])[], n: number): W[][] {
    const out = Array.from({ length: Math.max(1, n) }, () => [] as W[]);
    const rows = Math.max(0, ...columns.map((c) => c.length));
    let i = 0;
    for (let r = 0; r < rows; r++) {
        for (const col of columns) {
            const w = col[r];
            if (w) out[i++ % out.length].push(w);
        }
    }
    return out;
}
