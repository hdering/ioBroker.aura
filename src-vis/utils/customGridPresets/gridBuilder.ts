import type { CustomCell, CustomGridDef } from '../../types';

// Small helper for writing custom-grid presets row by row (#768). A preset says
// what goes into each row; the builder places the cells, skips slots a span from
// an earlier row already covers and fills everything else with empty cells — the
// row-major cell array with its placeholder cells is what CustomGridView expects.

const EMPTY: CustomCell = { type: 'empty' };

export class GridBuilder {
    private cols: number;
    private colSizes?: string[];
    private readonly matrix: (CustomCell | null)[][] = [];
    /** true = slot belongs to a span that starts elsewhere. */
    private readonly covered: boolean[][] = [];
    private readonly rowSizes: string[] = [];
    /** Rows declared so far — row spans may already have reserved slots further down. */
    private cursor = 0;

    constructor(colSizes: string[] | number) {
        if (typeof colSizes === 'number') {
            this.cols = colSizes;
        } else {
            this.cols = colSizes.length;
            this.colSizes = colSizes;
        }
    }

    get rowCount(): number {
        return this.cursor;
    }

    get colCount(): number {
        return this.cols;
    }

    /**
     * Append a row. `cells` fill the free slots of the row from left to right — a
     * slot covered by a row span from above is skipped, a cell with `colSpan` uses
     * up as many slots as it spans. `null` leaves a slot empty on purpose.
     */
    row(size: string, cells: (CustomCell | null)[]): this {
        const r = this.cursor++;
        this.ensureRow(r);
        this.rowSizes[r] = size;
        let c = 0;
        for (const cell of cells) {
            while (c < this.cols && this.covered[r][c]) c++;
            if (c >= this.cols) break;
            if (cell) this.put(r, c, cell);
            c += Math.max(1, Math.min(cell?.colSpan ?? 1, this.cols - c));
        }
        return this;
    }

    /** Place a cell at an explicit position (used for overlays like the status badges). */
    put(r: number, c: number, cell: CustomCell): this {
        this.ensureRow(r);
        this.cursor = Math.max(this.cursor, r + 1);
        const colSpan = Math.max(1, Math.min(cell.colSpan ?? 1, this.cols - c));
        const rowSpan = Math.max(1, cell.rowSpan ?? 1);
        for (let rr = r; rr < r + rowSpan; rr++) {
            this.ensureRow(rr);
            for (let cc = c; cc < c + colSpan; cc++) {
                if (rr !== r || cc !== c) this.covered[rr][cc] = true;
            }
        }
        const out: CustomCell = { ...cell };
        if (colSpan > 1) out.colSpan = colSpan;
        else delete out.colSpan;
        if (rowSpan > 1) out.rowSpan = rowSpan;
        else delete out.rowSpan;
        this.matrix[r][c] = out;
        return this;
    }

    /** Add a column on the right, empty in every row. Unsized grids get even columns first. */
    appendColumn(size: string): this {
        if (!this.colSizes) this.colSizes = Array.from({ length: this.cols }, () => '1fr');
        this.colSizes.push(size);
        this.cols += 1;
        for (let r = 0; r < this.matrix.length; r++) {
            this.matrix[r].push(null);
            this.covered[r].push(false);
        }
        return this;
    }

    /** Is the slot free — neither holding a cell nor covered by a span? */
    isFree(r: number, c: number): boolean {
        if (r < 0 || r >= this.cursor || c < 0 || c >= this.cols) return false;
        return !this.matrix[r][c] && !this.covered[r][c];
    }

    build(): CustomGridDef {
        const rows = Math.max(1, this.cursor);
        this.ensureRow(rows - 1);
        // Row spans running past the last row are clipped by the grid itself;
        // clamp them here so the stored grid stays consistent.
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = this.matrix[r][c];
                if (cell?.rowSpan && r + cell.rowSpan > rows) {
                    const span = rows - r;
                    if (span > 1) cell.rowSpan = span;
                    else delete cell.rowSpan;
                }
            }
        }
        const cells: CustomCell[] = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < this.cols; c++) cells.push(this.matrix[r][c] ?? { ...EMPTY });
        }
        const rowSizes = Array.from({ length: rows }, (_, r) => this.rowSizes[r] ?? 'auto');
        const def: CustomGridDef = { cols: this.cols, rows, cells };
        if (this.colSizes) def.colSizes = [...this.colSizes];
        // All-'1fr' rows are the grid's default — leave them out so the editor shows "even rows".
        if (rowSizes.some((s) => s !== '1fr')) def.rowSizes = rowSizes;
        return def;
    }

    private ensureRow(r: number) {
        while (this.matrix.length <= r) {
            this.matrix.push(Array.from({ length: this.cols }, () => null));
            this.covered.push(Array.from({ length: this.cols }, () => false));
        }
    }
}
