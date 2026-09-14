// Verifies the free-text search of the "Neues Widget" dialog: what an entry is
// found by, how umlauts are folded, and that a search for a widget type finds
// every quick-select template that produces it.
//
//   node tools/tests/widget-search.mjs
//
// No dev server needed - the search is pure string work and is bundled with
// esbuild. The widget labels come from the shipped AI schema, which is generated
// from widgetRegistry.tsx, so the assertions run against the real names without
// pulling React into node.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-widget-search-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export { normalizeQuery, buildHaystack, matchesQuery, templateHaystack, widgetHaystack } from './src-vis/utils/widgetSearch.ts';",
            "export { DP_TEMPLATES, DP_TEMPLATE_CATEGORIES } from './src-vis/utils/dpTemplates.ts';",
        ].join('\n'),
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const {
    normalizeQuery,
    buildHaystack,
    matchesQuery,
    templateHaystack,
    widgetHaystack,
    DP_TEMPLATES,
    DP_TEMPLATE_CATEGORIES,
} = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const schema = JSON.parse(readFileSync('public/ai/aura-widget-schema.json', 'utf8'));
const metaFor = (type) => ({ type, label: schema.widgets?.[type]?.label, hint: schema.widgets?.[type]?.hint });

const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });
const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

// ── 1. What the query is reduced to ──
eq('a query is lowercased', normalizeQuery('Rollladen'), 'rollladen');
eq('punctuation becomes a word break', normalizeQuery('Rollladen / Markise'), 'rollladen markise');
eq('surrounding space is dropped', normalizeQuery('  licht  '), 'licht');
eq('an umlaut is stripped, not written out', normalizeQuery('Wärme'), 'warme');
eq('nothing typed is an empty query', normalizeQuery(''), '');
eq('no query at all is an empty query', normalizeQuery(undefined), '');

// ── 2. An entry answers to both spellings of its umlauts ──
const warm = buildHaystack(['Wärmepumpe']);
ok('the stripped spelling hits', matchesQuery(warm, normalizeQuery('warmepumpe')));
ok('the written-out spelling hits', matchesQuery(warm, normalizeQuery('waermepumpe')));
ok('the typed umlaut hits', matchesQuery(warm, normalizeQuery('Wärmepumpe')));
ok('ß is written out too', matchesQuery(buildHaystack(['Außen']), normalizeQuery('aussen')));
ok('a plain entry is not doubled', buildHaystack(['Licht']) === 'licht');

// ── 3. Every word has to land, order does not matter ──
const shutter = buildHaystack(['Rollladen / Markise', 'Für alle positionsgesteuerten Beschattungsgeräte']);
ok('one word hits', matchesQuery(shutter, normalizeQuery('markise')));
ok('two words in any order hit', matchesQuery(shutter, normalizeQuery('markise rollladen')));
ok('a word that is not there misses', !matchesQuery(shutter, normalizeQuery('rollladen kamera')));
ok('an empty query hits everything', matchesQuery(shutter, ''));
ok('a part of a word hits', matchesQuery(shutter, normalizeQuery('rolll')));

// ── 4. A template is found by what stands behind it, not only by its label ──
// The reason the haystack is wider than the label: the Messwerte column is full of
// Wert-Anzeigen, so typing "Wert" has to bring up all of them - Helligkeit and
// Luftfeuchte included, neither of which carries the word.
const catLabel = new Map(DP_TEMPLATE_CATEGORIES.map((c) => [c.id, c.label]));
const hay = (tpl) => templateHaystack(tpl, metaFor(tpl.widgetType), catLabel.get(tpl.category));
const wert = normalizeQuery('wert');
const sensors = DP_TEMPLATES.filter((tpl) => tpl.category === 'sensor');
ok('there is a Messwerte column to check', sensors.length > 0, `${sensors.length} templates`);
eq(
    'every Messwerte template answers to "Wert"',
    sensors.filter((tpl) => !matchesQuery(hay(tpl), wert)).map((tpl) => tpl.id),
    [],
);
ok('the category name itself is typeable', matchesQuery(hay(sensors[0]), normalizeQuery('Messwerte')));

// The same for the widget type: every template that produces a given widget is
// found by that widget's name.
const byType = new Map();
for (const tpl of DP_TEMPLATES) byType.set(tpl.widgetType, [...(byType.get(tpl.widgetType) ?? []), tpl]);
const shared = [...byType.entries()].filter(([, tpls]) => tpls.length > 1);
ok('some widget types carry more than one template', shared.length > 0, `${shared.length} types`);
const typeBlind = shared.flatMap(([type, tpls]) => {
    const label = schema.widgets?.[type]?.label;
    if (!label) return [];
    return tpls.filter((tpl) => !matchesQuery(hay(tpl), normalizeQuery(label))).map((tpl) => `${tpl.id}<${label}>`);
});
eq('every template answers to the name of its widget type', typeBlind, []);
// …and that is not free: at least one template carries the widget name nowhere in
// its own label, so without the wider haystack it would be unfindable that way.
const crossHits = shared.flatMap(([type, tpls]) => {
    const label = schema.widgets?.[type]?.label;
    if (!label) return [];
    return tpls.filter((tpl) => !matchesQuery(buildHaystack([tpl.label]), normalizeQuery(label)));
});
ok(
    'the widget name reaches templates that do not carry it',
    crossHits.length > 0,
    `${crossHits.length} such templates`,
);

// Breadth has a limit - an unrelated template must still stay out.
const thermostat = DP_TEMPLATES.find((tpl) => tpl.id === 'thermostat');
ok('an unrelated template stays out', !matchesQuery(hay(thermostat), wert));

// ── 5. Widget types under "Weitere Widgets" ──
const camera = widgetHaystack({ type: 'camera', label: 'Kamera', shortLabel: 'Cam', hint: 'MJPEG-Stream' });
ok('the label hits', matchesQuery(camera, normalizeQuery('kamera')));
ok('the short label hits', matchesQuery(camera, normalizeQuery('cam')));
ok('the technical type hits', matchesQuery(camera, normalizeQuery('camera')));
ok('the hint hits', matchesQuery(camera, normalizeQuery('mjpeg')));
ok('something else misses', !matchesQuery(camera, normalizeQuery('rollladen')));

// ── 6. No template is invisible to its own name ──
const selfBlind = DP_TEMPLATES.filter((tpl) => !matchesQuery(hay(tpl), normalizeQuery(tpl.label)));
eq(
    'every template is found by typing its label',
    selfBlind.map((tpl) => tpl.id),
    [],
);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
console.log(`\nwidget-search: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
