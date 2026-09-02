// Verifies which colour a value bar is drawn in: progress cells and bar-style
// sliders in the custom layout.
//
//   node tools/tests/cell-bar-color.mjs
//
// Reported from the field, and the reason this is a test rather than a comment:
// CellConditionRule.color calls itself "text / icon color", so whether a matched
// rule reaches the BAR could not be answered from the schema. It did not — the bar
// used the static cell.color alone. Now it does, and this pins the precedence.
//
// No dev server needed: cellBarColor is pure, so the util is bundled with esbuild
// and exercised directly.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-cell-bar-color-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { cellBarColor } from './src-vis/utils/cellBarColor.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { cellBarColor } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({ name, ok: got === want, detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}` });

// ── 1. The fallback chain ──
eq('nothing configured falls back to the theme accent', cellBarColor({}, {}), 'var(--accent)');
eq('a configured cell colour is used', cellBarColor({ color: '#3b82f6' }, {}), '#3b82f6');
eq('no condition object at all is the same as no match', cellBarColor({ color: '#3b82f6' }), '#3b82f6');

// ── 2. A matched condition wins ──
// This is the whole point: the rule that turns the cell red has to reach the bar,
// not only the number drawn on top of it.
eq('a matched condition beats the cell colour', cellBarColor({ color: '#3b82f6' }, { color: '#ef4444' }), '#ef4444');
eq('a matched condition beats the accent fallback', cellBarColor({}, { color: '#ef4444' }), '#ef4444');

// ── 3. A rule that sets something else must not repaint the bar ──
// bg paints the cell, hide blanks it; neither is a colour for the fill.
eq('a background-only rule leaves the bar alone', cellBarColor({ color: '#3b82f6' }, { bg: '#fee' }), '#3b82f6');
eq('a bold-only rule leaves the bar alone', cellBarColor({ color: '#3b82f6' }, { bold: true }), '#3b82f6');
eq('an empty condition colour is not a colour', cellBarColor({ color: '#3b82f6' }, { color: '' }), '#3b82f6');

const failed = results.filter((r) => !r.ok);
for (const r of results) {
    console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
}
console.log(`\ncell-bar-color: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
