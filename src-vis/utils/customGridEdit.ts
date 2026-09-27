import type { CustomCell, CustomGridDef } from '../types';

// Insert / delete a whole row or column of a custom grid (#717). Cells are stored
// row-major, so shifting one line means rebuilding the cell array; spans that
// cross the edited line grow or shrink with it, the track-size arrays follow.

export const CUSTOM_GRID_MAX = 20;

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
    if (rows >= CUSTOM_GRID_MAX) return grid;
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
    if (cols >= CUSTOM_GRID_MAX) return grid;
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
