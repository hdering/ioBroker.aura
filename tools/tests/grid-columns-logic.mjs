// Columns and render width of the desktop grid (issue #413): the classic fixed
// pitch and the opt-in fluid mode that stretches the columns to the window.
//
//   node tools/tests/grid-columns-logic.mjs
//
// No dev server needed - utils/gridColumns.ts is pure arithmetic and is bundled
// with esbuild. The rendered grid is covered by grid-fluid.mjs.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-grid-columns-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/gridColumns.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { gridColumns, gridWidthPx, colsForWidth } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });
const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

const base = { snapX: 20, gap: 10 };
// 40 used columns → design width 40 · 30 + 10 = 1210 px
const used = 40;
const designPx = gridWidthPx(used, 20, 10);
eq('design width of 40 columns', designPx, 1210);

// ── 1. fixed: the formula Dashboard used before the extraction ──
for (const width of [0, 300, 800, 1210, 1920]) {
    const cols = width > 0 ? Math.max(2, Math.floor((width - 10) / 30)) : 12;
    const effectiveCols = Math.max(cols, used);
    const rglWidth = effectiveCols > cols ? effectiveCols * 30 + 10 : width;
    eq(`fixed at ${width} px is unchanged`, gridColumns({ ...base, mode: 'fixed', width, usedCols: used }), {
        cols: effectiveCols,
        rglWidth,
        scale: 1,
        fluid: false,
    });
}

// ── 2. fluid: columns stay, width follows the window ──
const fluid = (width, extra = {}) => gridColumns({ ...base, mode: 'fluid', width, usedCols: used, ...extra });
for (const width of [800, 1210, 1920, 2560]) {
    const r = fluid(width, { minScale: 0.5 });
    eq(`fluid at ${width} px keeps the 40 design columns`, r.cols, used);
    eq(`fluid at ${width} px fills the container`, r.rglWidth, width);
    ok(`fluid at ${width} px scale = width / design`, Math.abs(r.scale - width / designPx) < 1e-9);
}

// ── 3. min / max caps ──
{
    const r = fluid(600, { minScale: 0.6 });
    eq('below minScale the scale is clamped', r.scale, 0.6);
    eq('… and the grid gets the clamped width (scroller scrolls)', r.rglWidth, Math.round(designPx * 0.6));
    const m = fluid(3000, { maxScale: 1.5 });
    eq('above maxScale the scale is clamped', m.scale, 1.5);
    eq('… and the grid stops stretching', m.rglWidth, Math.round(designPx * 1.5));
    eq('maxScale 0 means no cap', fluid(3000, { maxScale: 0 }).rglWidth, 3000);
    eq('maxScale below minScale falls back to minScale', fluid(3000, { minScale: 0.8, maxScale: 0.5 }).scale, 0.8);
}

// ── 4. explicit design width ──
{
    const r = fluid(1920, { designWidth: 1920 });
    eq('design width 1920 → columns that fit 1920', r.cols, colsForWidth(1920, 20, 10));
    ok('… content narrower than the design leaves proportional space', r.cols > used);
    eq('a design width below the content never clamps it', fluid(1920, { designWidth: 600 }).cols, used);
}

// ── 5. width 0 (not measured yet) behaves like the fixed grid ──
eq('fluid without a width falls back to fixed', fluid(0).fluid, false);

// ── Report ──
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : ` - ${r.detail}`}`);
console.log(`\ngrid-columns-logic: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
