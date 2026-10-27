// Spaltenzahl pro Abschnitt im Mobil-/Tablet-Fluss (issue #851): ein Widget mit
// tabletBandCols / mobileBandCols beginnt einen neuen Spaltenblock mit eigener
// Spaltenzahl, das Panel schreibt den Wert ueber linearizeBands() zurueck.
//
//   node tools/tests/flow-band-cols-logic.mjs
//
// Kein Dev-Server noetig - utils/flowOrder.ts wird mit esbuild gebuendelt.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-flow-band-cols-${process.pid}.mjs`);
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
const { flowBands, linearizeBands, redealBlock } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });

/** Neun schmale Widgets, Reihenfolge 0..8, Rasterbreite 3 von 12. */
const mk = (extra = {}) =>
    Array.from({ length: 9 }, (_, i) => ({
        id: `w${i}`,
        gridPos: { x: (i % 4) * 3, y: Math.floor(i / 4) * 4, w: 3, h: 4 },
        mobileOrder: i,
        ...(extra[i] ?? {}),
    }));
/** Bands als Kurzform: Spaltenblock = Spalten mit ids, Band = '=id'. */
const shape = (bands) =>
    bands.map((b) => (b.kind === 'full' ? `=${b.widget.id}` : b.columns.map((c) => c.map((w) => w.id))));

// ── ohne Abschnittswert: ein Block mit der eingestellten Spaltenzahl ────────
eq('ohne Wert: ein Block mit 4 Spalten', shape(flowBands(mk(), 'mobile', 4)), [
    [
        ['w0', 'w4', 'w8'],
        ['w1', 'w5'],
        ['w2', 'w6'],
        ['w3', 'w7'],
    ],
]);

// ── 4 / 3 / 2 wie im Issue ──────────────────────────────────────────────────
const sections = mk({ 4: { mobileBandCols: 3 }, 7: { mobileBandCols: 2 } });
const bands = flowBands(sections, 'mobile', 4);
eq('4 / 3 / 2: drei Bloecke', shape(bands), [
    [['w0'], ['w1'], ['w2'], ['w3']],
    [['w4'], ['w5'], ['w6']],
    [['w7'], ['w8']],
]);
eq(
    'eigene Bloecke tragen start',
    bands.map((b) => !!b.start),
    [false, true, true],
);

// ── Spalten-Pin wird auf die Spaltenzahl des Blocks gekappt ─────────────────
eq(
    'mobileCol 3 in einem 2er-Block landet in Spalte 2',
    shape(flowBands(mk({ 7: { mobileBandCols: 2 }, 8: { mobileCol: 3 } }), 'mobile', 4)).at(-1),
    [['w7'], ['w8']],
);

// ── Gleiche Spaltenzahl direkt darunter bleibt ein eigener Block ────────────
eq(
    'mobileBandCols = eingestellte Zahl beginnt trotzdem einen Block',
    shape(flowBands(mk({ 6: { mobileBandCols: 4 } }), 'mobile', 4)).length,
    2,
);

// ── Nach einem Band gilt wieder die eingestellte Zahl ───────────────────────
eq(
    'nach einem Band: wieder 4 Spalten',
    shape(flowBands(mk({ 2: { mobileBandCols: 2 }, 4: { mobileWide: true }, 5: {}, 6: {} }), 'mobile', 4)).map((b) =>
        typeof b === 'string' ? b : b.length,
    ),
    [4, 2, '=w4', 4],
);

// ── Tablet liest nur die eigenen Felder ─────────────────────────────────────
eq('Tablet ignoriert mobileBandCols', shape(flowBands(sections, 'tablet', 4)).length, 1);
eq(
    'Tablet liest tabletBandCols',
    shape(flowBands(mk({ 4: { tabletBandCols: 1 } }), 'tablet', 4)).map((b) => b.length),
    [4, 1],
);

// ── Einspaltig: Abschnitte wirken nicht ─────────────────────────────────────
eq('mobileCols 1 ignoriert Abschnitte', shape(flowBands(sections, 'mobile', 1)).length, 1);

// ── Zurueckschreiben: Rundreise ueber linearizeBands ────────────────────────
const lin = linearizeBands(bands, 4);
eq(
    'linearize setzt bandCols nur am ersten Widget eigener Bloecke',
    lin.map((e) => e.bandCols),
    [null, null, null, null, 3, null, null, 2, null],
);
const back = sections.map((w) => {
    const e = lin.find((x) => x.widget.id === w.id);
    return { ...w, mobileOrder: e.order, mobileCol: e.col, mobileBandCols: e.bandCols ?? undefined };
});
eq('Rundreise ergibt dieselben Bloecke', shape(flowBands(back, 'mobile', 4)), shape(bands));

eq(
    'ein Block mit abweichender Zahl wird markiert, auch ohne start',
    linearizeBands([{ kind: 'columns', columns: [['a'].map((id) => ({ id })), [{ id: 'b' }]] }], 4).map(
        (e) => e.bandCols,
    ),
    [2, null],
);
eq(
    'ohne cols (alte Aufrufer) wird nur start markiert',
    linearizeBands([{ kind: 'columns', columns: [[{ id: 'a' }], [{ id: 'b' }]] }]).map((e) => e.bandCols),
    [null, null],
);

// ── Neu verteilen: Reihe fuer Reihe ─────────────────────────────────────────
eq(
    'redealBlock 4 -> 3',
    redealBlock(
        [
            ['a', 'e'],
            ['b', 'f'],
            ['c', 'g'],
            ['d', 'h'],
        ],
        3,
    ),
    [
        ['a', 'd', 'g'],
        ['b', 'e', 'h'],
        ['c', 'f'],
    ],
);
eq('redealBlock 2 -> 4', redealBlock([['a', 'c'], ['b']], 4), [['a'], ['b'], ['c'], []]);

let failed = 0;
for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : ` - ${r.detail}`}`);
}
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
