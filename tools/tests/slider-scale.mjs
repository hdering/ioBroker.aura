// Verifies the tick scale under a slider (#643): where the marks sit, which of
// them carry a number, and what happens to a scale that is too fine to draw.
//
//   node tools/tests/slider-scale.mjs
//
// The three sliders (Schieberegler widget, list rows, universal widget cell) all
// call sliderTicks, so the arithmetic is pinned once here. No dev server needed —
// the util is pure and is bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-slider-scale-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { sliderTicks, stepDecimals, niceInterval } from './src-vis/utils/sliderScale.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { sliderTicks, stepDecimals, niceInterval } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });
const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

const values = (t) => t.map((x) => x.value);
const labels = (t) => t.filter((x) => x.labeled).map((x) => x.value);

// ── 1. The example from the issue: min 1, max 10, step 1 ──
const issue = sliderTicks({ min: 1, max: 10, step: 1, trackPx: 400, labelPx: 20 });
eq('every step gets a mark', values(issue), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
eq('a wide track labels every step', labels(issue), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
eq('the first tick sits at the start', issue[0].ratio, 0);
eq('the last tick sits at the end', issue[issue.length - 1].ratio, 1);

// ── 2. Thinning follows the measured width ──
// Narrow track, same scale: the marks stay, only the numbers thin out — and the
// ends keep theirs, because a scale with blank ends says nothing about the range.
const narrow = sliderTicks({ min: 1, max: 10, step: 1, trackPx: 60, labelPx: 20 });
eq('a narrow track keeps every mark', values(narrow).length, 10);
ok('a narrow track prints fewer numbers', labels(narrow).length < 10, `${labels(narrow).length} labels`);
eq('min keeps its number', labels(narrow)[0], 1);
eq('max keeps its number', labels(narrow)[labels(narrow).length - 1], 10);

// ── 3. An explicit interval overrides the automatic one ──
eq(
    'labelEvery 5 labels every fifth step',
    labels(sliderTicks({ min: 0, max: 20, step: 1, labelEvery: 5, trackPx: 400 })),
    [0, 5, 10, 15, 20],
);
// 0…20 by 3 does not end on a labelled step, so 20 is added — and 18 gives way,
// otherwise two numbers would sit on top of each other.
eq(
    'the last number never crowds the one before it',
    labels(sliderTicks({ min: 0, max: 20, step: 1, labelEvery: 3, trackPx: 400 })),
    [0, 3, 6, 9, 12, 15, 20],
);

// ── 4. Too fine to draw a mark per step ──
// A 0…255 dimmer would cost 256 nodes per slider. Above the cap only the labelled
// positions are drawn, on a round raster that still lands on real steps.
const dimmer = sliderTicks({ min: 0, max: 255, step: 1, trackPx: 300, labelPx: 30 });
ok('a 0…255 dimmer draws far fewer than 256 marks', dimmer.length <= 15, `${dimmer.length} marks`);
eq('its scale still starts at min', dimmer[0].value, 0);
eq('its scale still ends at max', dimmer[dimmer.length - 1].value, 255);
ok(
    'its numbers sit on a round raster',
    dimmer.slice(0, -1).every((t) => t.value % 10 === 0),
    JSON.stringify(values(dimmer)),
);

// ── 5. Ranges that do not end on a step ──
const offGrid = sliderTicks({ min: 0, max: 7.5, step: 2, trackPx: 300 });
eq('an off-grid maximum is still the last tick', offGrid[offGrid.length - 1].value, 7.5);
ok(
    'no tick overshoots the maximum',
    offGrid.every((t) => t.value <= 7.5 && t.ratio <= 1),
    JSON.stringify(values(offGrid)),
);

// ── 6. Fractional steps ──
const half = sliderTicks({ min: 20, max: 24, step: 0.5, trackPx: 400, labelPx: 24 });
eq('a 0.5 step keeps clean values', values(half), [20, 20.5, 21, 21.5, 22, 22.5, 23, 23.5, 24]);
eq('0.5 implies one decimal', stepDecimals(0.5), 1);
eq('a whole step implies none', stepDecimals(1), 0);

// ── 7. Degenerate input draws nothing rather than dividing by zero ──
eq('max equal to min yields no scale', sliderTicks({ min: 5, max: 5, step: 1 }), []);
eq('an inverted range yields no scale', sliderTicks({ min: 10, max: 0, step: 1 }), []);
ok('a zero step falls back to a tenth of the span', sliderTicks({ min: 0, max: 100, step: 0 }).length > 1);

// ── 8. Label intervals land on real steps ──
// A scale must not print a value the slider cannot take.
eq('a nice interval snaps up to a multiple of the step', niceInterval(4, 3), 6);
eq('a nice interval never falls below the step', niceInterval(0.1, 5), 5);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
console.log(`\nslider-scale: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
