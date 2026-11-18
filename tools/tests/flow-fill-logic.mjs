// Verteilung der Karten im Spaltenfluss nach Hoehe (issue #939):
// fill 'count' (wie bisher), 'height' (Masonry) und 'compact' (so wenige Spalten wie
// noetig, Block zentriert, Lesereihenfolge zeilenweise).
//
//   node tools/tests/flow-fill-logic.mjs
//
// Kein Dev-Server noetig - utils/flowOrder.ts wird mit esbuild gebuendelt.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-flow-fill-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/flowOrder.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { flowBands } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });

/** Karten mit Hoehe in px; Reihenfolge = Index. Schmal (3 von 12), also nie volle Breite. */
const mk = (heights, extra = {}) =>
    heights.map((h, i) => ({
        id: `w${i}`,
        px: h,
        gridPos: { x: (i % 4) * 3, y: Math.floor(i / 4) * 4, w: 3, h: 4 },
        mobileOrder: i,
        ...(extra[i] ?? {}),
    }));
const heightOf = (w) => w.px;
const shape = (bands) =>
    bands.map((b) =>
        b.kind === 'full'
            ? `=${b.widget.id}`
            : { cols: b.columns.map((c) => c.map((w) => w.id)), ...(b.slots ? { slots: b.slots } : {}) },
    );
const run = (heights, cols, fill, extra) =>
    shape(flowBands(mk(heights, extra), 'mobile', cols, { fill, heightOf, gap: 10 }));

// ── count: unveraendert, Hoehen spielen keine Rolle ─────────────────────────────
eq('count: Round-Robin wie bisher', run([300, 100, 100, 300], 3, 'count'), [{ cols: [['w0', 'w3'], ['w1'], ['w2']] }]);
eq(
    'ohne heightOf faellt height auf count zurueck',
    shape(flowBands(mk([300, 100, 100, 300]), 'mobile', 3, { fill: 'height' })),
    [{ cols: [['w0', 'w3'], ['w1'], ['w2']] }],
);

// ── height: Masonry ───────────────────────────────────────────────────────────
eq('height: niedrigste Spalte', run([300, 100, 100, 300], 3, 'height'), [{ cols: [['w0'], ['w1', 'w3'], ['w2']] }]);
eq('height: 2 Spalten', run([400, 100, 100, 100, 100], 2, 'height'), [{ cols: [['w0'], ['w1', 'w2', 'w3', 'w4']] }]);
eq('height: feste Spalte bleibt', run([300, 100, 100, 300], 3, 'height', { 3: { mobileCol: 2 } }), [
    { cols: [['w0'], ['w1'], ['w2', 'w3']] },
]);

// ── compact ───────────────────────────────────────────────────────────────────
// Beispiel aus dem Issue: lang – kurz – kurz – lang, 4 Spalten → 3, lang | kurz+kurz | lang.
eq('compact: Issue-Beispiel', run([300, 140, 140, 300], 4, 'compact'), [
    { cols: [['w0'], ['w1', 'w2'], ['w3']], slots: 4 },
]);
eq('compact: zwei Karten in 4 Spalten → 2 zentriert', run([200, 200], 4, 'compact'), [
    { cols: [['w0'], ['w1']], slots: 4 },
]);
eq('compact: passt nirgends → volle Spaltenzahl, keine slots', run([200, 200, 200, 200, 200, 200], 2, 'compact'), [
    {
        cols: [
            ['w0', 'w2', 'w4'],
            ['w1', 'w3', 'w5'],
        ],
    },
]);
eq('compact: alles passt in eine Spalte unter die lange', run([400, 100, 100, 100], 4, 'compact'), [
    { cols: [['w0'], ['w1', 'w2', 'w3']], slots: 4 },
]);
eq('compact: Toleranz 20 px', run([300, 150, 150], 3, 'compact'), [{ cols: [['w0'], ['w1', 'w2']], slots: 3 }]);
eq('compact: ueber der Toleranz → mehr Spalten', run([300, 160, 160], 3, 'compact'), [
    { cols: [['w0'], ['w1'], ['w2']] },
]);
// Block mit fester Spalte: kein compact, nur nach Hoehe.
eq(
    'compact: Block mit Pin bleibt bei voller Spaltenzahl',
    run([300, 140, 140, 300], 4, 'compact', { 1: { mobileCol: 1 } }),
    [{ cols: [['w0'], ['w1'], ['w2'], ['w3']] }],
);
// Block mit eigener Spaltenzahl: nicht schrumpfen.
eq(
    'compact: eigener Block (bandCols) schrumpft nicht',
    run([300, 140, 140], 3, 'compact', { 0: { mobileBandCols: 3 } }),
    [{ cols: [['w0'], ['w1'], ['w2']] }],
);
// Volle Breite trennt Bloecke; jeder Block fuer sich.
{
    const ws = mk([300, 140, 140, 300, 100, 100]);
    ws[3].gridPos = { x: 0, y: 10, w: 12, h: 4 };
    eq(
        'compact: volles Band trennt Bloecke',
        shape(flowBands(ws, 'mobile', 3, { fill: 'compact', heightOf, gap: 10 })),
        [{ cols: [['w0'], ['w1', 'w2']], slots: 3 }, '=w3', { cols: [['w4'], ['w5']], slots: 3 }],
    );
}

let failed = 0;
for (const r of results) {
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
    if (!r.ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
