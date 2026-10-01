// Insert / delete rows and columns of a custom grid at a given position (issue #717).
//
//   node tools/tests/custom-grid-edit.mjs
//
// No dev server needed - utils/customGridEdit.ts is pure and is bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-custom-grid-edit-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/customGridEdit.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { insertGridRow, insertGridCol, deleteGridRow, deleteGridCol, gridLineHasContent } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });

// 2x2 grid, cells labelled by their position
const t = (label, extra = {}) => ({ type: 'text', text: label, ...extra });
const E = { type: 'empty' };
const labels = (g) => g.cells.map((c) => (c.type === 'empty' ? '.' : c.text));
const g2 = { cols: 2, rows: 2, cells: [t('a'), t('b'), t('c'), t('d')] };

eq('row on top', labels(insertGridRow(g2, 0)), ['.', '.', 'a', 'b', 'c', 'd']);
eq('row in the middle', labels(insertGridRow(g2, 1)), ['a', 'b', '.', '.', 'c', 'd']);
eq('row at the end', labels(insertGridRow(g2, 2)), ['a', 'b', 'c', 'd', '.', '.']);
eq('row count grows', insertGridRow(g2, 0).rows, 3);
eq('column left', labels(insertGridCol(g2, 0)), ['.', 'a', 'b', '.', 'c', 'd']);
eq('column in the middle', labels(insertGridCol(g2, 1)), ['a', '.', 'b', 'c', '.', 'd']);
eq('column right', labels(insertGridCol(g2, 2)), ['a', 'b', '.', 'c', 'd', '.']);
eq('column count grows', insertGridCol(g2, 0).cols, 3);

eq('delete first row', labels(deleteGridRow(g2, 0)), ['c', 'd']);
eq('delete last column', labels(deleteGridCol(g2, 1)), ['a', 'c']);
eq('last row stays', deleteGridRow({ cols: 2, rows: 1, cells: [t('a'), t('b')] }, 0).rows, 1);

// Track sizes follow the lines
const sized = { ...g2, colSizes: ['2fr', 'auto'], rowSizes: ['40px', '1fr'] };
eq('colSizes get a 1fr slot', insertGridCol(sized, 1).colSizes, ['2fr', '1fr', 'auto']);
eq('rowSizes get a 1fr slot', insertGridRow(sized, 0).rowSizes, ['1fr', '40px', '1fr']);
eq('deleted column drops its size', deleteGridCol(sized, 0).colSizes, ['auto']);
eq('no sizes stay undefined', insertGridRow(g2, 0).rowSizes, undefined);

// Spans crossing the edited line grow / shrink, spans beside it stay
const spanRow = { cols: 1, rows: 3, cells: [t('a', { rowSpan: 2 }), E, t('c')] };
eq('insert inside a row span grows it', insertGridRow(spanRow, 1).cells[0].rowSpan, 3);
eq('insert above a row span keeps it', insertGridRow(spanRow, 0).cells[1].rowSpan, 2);
eq('insert below a row span keeps it', insertGridRow(spanRow, 2).cells[0].rowSpan, 2);
eq('delete inside a row span shrinks it', deleteGridRow(spanRow, 1).cells[0].rowSpan, 1);
const spanCol = { cols: 3, rows: 1, cells: [t('a', { colSpan: 3 }), E, E] };
eq('insert inside a column span grows it', insertGridCol(spanCol, 2).cells[0].colSpan, 4);
eq('delete inside a column span shrinks it', deleteGridCol(spanCol, 2).cells[0].colSpan, 2);

// No upper limit (#735); content check
const big = { cols: 1, rows: 30, cells: Array.from({ length: 30 }, () => E) };
eq('row past the former limit of 20', insertGridRow(big, 0).rows, 31);
eq('row with content', gridLineHasContent(g2, 'row', 1), true);
eq('empty row', gridLineHasContent(insertGridRow(g2, 0), 'row', 0), false);
eq('empty column', gridLineHasContent(insertGridCol(g2, 1), 'col', 1), false);

// ── Report ──
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : ` - ${r.detail}`}`);
console.log(`\ncustom-grid-edit: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
