import type { CustomCell, CustomGridDef } from '../types';

// Insert / delete a whole row or column of a custom grid (#717). Cells are stored
// row-major, so shifting one line means rebuilding the cell array; spans that
// cross the edited line grow or shrink with it, the track-size arrays follow.

const EMPTY: CustomCell = { type: 'empty' };

function spliceSizes(sizes: string[] | undefined, at: number, remove: number, insert?: string): string[] | undefined {
    if (!sizes) return undefined;
    const out = [...sizes];
    if (insert !== undefined) out.splice(at, remove, insert);
    else out.splice(at, remove);
    return out;
}

/** New span of a cell starting at `start` when a line is inserted before index `at`. */
function spanOnInsert(start: number, span: number | undefined, at: number): number | undefined {
    if (!span || span <= 1) return span;
    return start < at && at < start + span ? span + 1 : span;
}

/** New span of a cell starting at `start` when line `at` is removed. */
function spanOnDelete(start: number, span: number | undefined, at: number): number | undefined {
    if (!span || span <= 1) return span;
    return start < at && at < start + span ? span - 1 : span;
}

/** Insert an empty row before row index `at` (0..rows). */
export function insertGridRow(grid: CustomGridDef, at: number): CustomGridDef {
    const { cols, rows, cells } = grid;
    const pos = Math.max(0, Math.min(rows, at));
    const next: CustomCell[] = [];
    for (let r = 0; r <= rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (r === pos) {
                next.push({ ...EMPTY });
                continue;
            }
            const srcRow = r < pos ? r : r - 1;
            const cell = cells[srcRow * cols + c] ?? EMPTY;
            const rowSpan = spanOnInsert(srcRow, cell.rowSpan, pos);
            next.push(rowSpan === cell.rowSpan ? cell : { ...cell, rowSpan });
        }
    }
    return {
        ...grid,
        rows: rows + 1,
        cells: next,
        rowSizes: spliceSizes(grid.rowSizes, pos, 0, '1fr'),
    };
}

/** Insert an empty column before column index `at` (0..cols). */
export function insertGridCol(grid: CustomGridDef, at: number): CustomGridDef {
    const { cols, rows, cells } = grid;
    const pos = Math.max(0, Math.min(cols, at));
    const next: CustomCell[] = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c <= cols; c++) {
            if (c === pos) {
                next.push({ ...EMPTY });
                continue;
            }
            const srcCol = c < pos ? c : c - 1;
            const cell = cells[r * cols + srcCol] ?? EMPTY;
            const colSpan = spanOnInsert(srcCol, cell.colSpan, pos);
            next.push(colSpan === cell.colSpan ? cell : { ...cell, colSpan });
        }
    }
    return {
        ...grid,
        cols: cols + 1,
        cells: next,
        colSizes: spliceSizes(grid.colSizes, pos, 0, '1fr'),
    };
}

/** Remove row `at` together with its cells. */
export function deleteGridRow(grid: CustomGridDef, at: number): CustomGridDef {
    const { cols, rows, cells } = grid;
    if (rows <= 1 || at < 0 || at >= rows) return grid;
    const next: CustomCell[] = [];
    for (let r = 0; r < rows; r++) {
        if (r === at) continue;
        for (let c = 0; c < cols; c++) {
            const cell = cells[r * cols + c] ?? EMPTY;
            const rowSpan = spanOnDelete(r, cell.rowSpan, at);
            next.push(rowSpan === cell.rowSpan ? cell : { ...cell, rowSpan });
        }
    }
    return {
        ...grid,
        rows: rows - 1,
        cells: next,
        rowSizes: spliceSizes(grid.rowSizes, at, 1),
    };
}

/** Remove column `at` together with its cells. */
export function deleteGridCol(grid: CustomGridDef, at: number): CustomGridDef {
    const { cols, rows, cells } = grid;
    if (cols <= 1 || at < 0 || at >= cols) return grid;
    const next: CustomCell[] = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (c === at) continue;
            const cell = cells[r * cols + c] ?? EMPTY;
            const colSpan = spanOnDelete(c, cell.colSpan, at);
            next.push(colSpan === cell.colSpan ? cell : { ...cell, colSpan });
        }
    }
    return {
        ...grid,
        cols: cols - 1,
        cells: next,
        colSizes: spliceSizes(grid.colSizes, at, 1),
    };
}

/** True when a row / column holds at least one non-empty cell (delete then asks first). */
export function gridLineHasContent(grid: CustomGridDef, axis: 'row' | 'col', at: number): boolean {
    const { cols, rows, cells } = grid;
    if (axis === 'row') {
        for (let c = 0; c < cols; c++) if ((cells[at * cols + c]?.type ?? 'empty') !== 'empty') return true;
    } else {
        for (let r = 0; r < rows; r++) if ((cells[r * cols + at]?.type ?? 'empty') !== 'empty') return true;
    }
    return false;
}

// ── Status symbols in a custom grid (#1019) ──────────────────────────────────
// The grid has no overlay: the status row shows only where a cell holds it.

/** Component keys that show (part of) the status row in a custom grid. */
export function isStatusCellKey(key: string | undefined): boolean {
    if (!key) return false;
    return (
        key === 'status-badges' ||
        key === 'battery-icon' ||
        key === 'reach-icon' ||
        key === 'window-icon' ||
        key.startsWith('status-item:')
    );
}

/** Does any cell of the grid show a status symbol? */
export function gridHasStatusCell(grid: CustomGridDef): boolean {
    return grid.cells.some((c) => c.type === 'component' && isStatusCellKey(c.componentKey));
}

/** Indices of the cells that lie under another cell's row/column span. */
function coveredCells(grid: CustomGridDef): Set<number> {
    const { cols, rows, cells } = grid;
    const out = new Set<number>();
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            if (out.has(idx)) continue;
            const cell = cells[idx];
            if (!cell || cell.type === 'empty') continue;
            const rs = Math.max(1, cell.rowSpan ?? 1);
            const cs = Math.max(1, cell.colSpan ?? 1);
            for (let dr = 0; dr < rs && r + dr < rows; dr++)
                for (let dc = 0; dc < cs && c + dc < cols; dc++) if (dr || dc) out.add((r + dr) * cols + c + dc);
        }
    }
    return out;
}

/**
 * Put the 'status-badges' cell where the presets put it (addStatusBadges): the
 * bottom-right cell when it is free, else a narrow column of its own on the right.
 */
export function placeStatusBadgesCell(grid: CustomGridDef): CustomGridDef {
    const cell: CustomCell = {
        type: 'component',
        componentKey: 'status-badges',
        align: 'right',
        valign: 'bottom',
        allowOverflow: true,
    };
    let g = grid;
    const at = () => (g.rows - 1) * g.cols + g.cols - 1;
    const free = (gg: CustomGridDef, idx: number) =>
        (gg.cells[idx] ?? EMPTY).type === 'empty' && !coveredCells(gg).has(idx);
    if (!free(g, at())) {
        const sizes = grid.colSizes ?? Array.from({ length: grid.cols }, () => '1fr');
        g = { ...insertGridCol(g, g.cols), colSizes: [...sizes.slice(0, grid.cols), 'auto'] };
    }
    const idx = at();
    return { ...g, cells: g.cells.map((c, i) => (i === idx ? cell : c)) };
}
