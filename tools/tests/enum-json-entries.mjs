// Verifies the Auswahlfeld's JSON entry source — utils/enumEntriesJson.ts (issue #577).
//
//   node tools/tests/enum-json-entries.mjs
//
// No dev server needed: the module is pure (its only widget contact is an
// `import type`), so esbuild bundles it and the test drives it directly.
//
// Every JSON shape printed in docs/widgets/auswahlfeld.md appears here as a case,
// so the documentation cannot drift away from the parser without turning this red.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-enum-json-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { parseEnumEntriesJson } from './src-vis/utils/enumEntriesJson.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { parseEnumEntriesJson } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );
/** value→label pairs only — the shape most cases care about. */
const pairs = (entries) => entries.map((e) => [e.value, e.label]);

// ── the documented shapes ─────────────────────────────────────────────────────

// The example the config panel offers and the docs print.
const EXAMPLE = [
    { value: 0, label: 'Aus', color: '#ef4444' },
    { value: 1, label: 'Heizen', color: '#f59e0b', icon: 'Flame' },
    { value: 2, label: 'Kühlen', color: '#3b82f6', icon: 'Snowflake' },
];

eq('object list: value/label pairs', pairs(parseEnumEntriesJson(EXAMPLE)), [
    ['0', 'Aus'],
    ['1', 'Heizen'],
    ['2', 'Kühlen'],
]);
eq('object list: color and icon carried over', parseEnumEntriesJson(EXAMPLE)[1], {
    value: '1',
    label: 'Heizen',
    color: '#f59e0b',
    icon: 'Flame',
});
eq(
    'JSON string is parsed like the object',
    pairs(parseEnumEntriesJson(JSON.stringify(EXAMPLE))),
    pairs(parseEnumEntriesJson(EXAMPLE)),
);

eq('map form: key is the value', pairs(parseEnumEntriesJson({ 0: 'Aus', 1: 'An' })), [
    ['0', 'Aus'],
    ['1', 'An'],
]);
eq(
    'map form with objects: key wins over any value field',
    parseEnumEntriesJson({ 0: { label: 'Aus', color: '#ef4444' }, 7: { value: 99, label: 'An' } }),
    [
        { value: '0', label: 'Aus', color: '#ef4444' },
        { value: '7', label: 'An' },
    ],
);

eq('scalar list: value equals label', pairs(parseEnumEntriesJson(['Aus', 'An'])), [
    ['Aus', 'Aus'],
    ['An', 'An'],
]);
eq('scalar list: numbers become text', pairs(parseEnumEntriesJson([0, 1])), [
    ['0', '0'],
    ['1', '1'],
]);

eq('field names are auto-detected', pairs(parseEnumEntriesJson([{ id: 1, name: 'Küche' }])), [['1', 'Küche']]);
eq('auto-detection is case-insensitive', pairs(parseEnumEntriesJson([{ ID: 3, Name: 'Bad' }])), [['3', 'Bad']]);
eq(
    'wrapper object with one list is unpacked',
    pairs(parseEnumEntriesJson({ result: [{ value: 5, label: 'Fünf' }], count: 1 })),
    [['5', 'Fünf']],
);
eq(
    'pair list [wert, label]',
    pairs(
        parseEnumEntriesJson([
            [0, 'Aus'],
            [1, 'An'],
        ]),
    ),
    [
        ['0', 'Aus'],
        ['1', 'An'],
    ],
);

// ── configured field names ────────────────────────────────────────────────────

eq(
    'configured keys beat auto-detection',
    pairs(
        parseEnumEntriesJson([{ id: 1, name: 'ignoriert', code: 'A', text: 'Modus A' }], {
            value: 'code',
            label: 'text',
        }),
    ),
    [['A', 'Modus A']],
);
eq(
    'configured key may be a path',
    pairs(parseEnumEntriesJson([{ id: 2, attributes: { name: 'Flur' } }], { label: 'attributes.name' })),
    [['2', 'Flur']],
);
eq(
    'configured color/icon fields',
    parseEnumEntriesJson([{ value: 1, label: 'An', hex: '#0f0', glyph: 'Power' }], { color: 'hex', icon: 'glyph' }),
    [{ value: '1', label: 'An', color: '#0f0', icon: 'Power' }],
);

// ── fallbacks and rejects ─────────────────────────────────────────────────────

eq('label alone becomes the value', pairs(parseEnumEntriesJson([{ label: 'Nur Text' }])), [['Nur Text', 'Nur Text']]);
eq('value alone becomes the label', pairs(parseEnumEntriesJson([{ value: 4 }])), [['4', '4']]);
eq('booleans are kept as text', pairs(parseEnumEntriesJson([{ value: true, label: 'An' }])), [['true', 'An']]);
eq(
    'duplicate values: first one wins',
    pairs(
        parseEnumEntriesJson([
            { value: 1, label: 'A' },
            { value: 1, label: 'B' },
        ]),
    ),
    [['1', 'A']],
);
eq('rows without any usable field are dropped', parseEnumEntriesJson([{ foo: {} }, null, { value: 1, label: 'A' }]), [
    { value: '1', label: 'A' },
]);

eq('image field switches the render mode', parseEnumEntriesJson([{ value: 1, label: 'Logo', image: '/a.png' }]), [
    { value: '1', label: 'Logo', image: '/a.png', render: 'image' },
]);
eq('explicit render mode is kept', parseEnumEntriesJson([{ value: 1, label: '<b>An</b>', render: 'html' }]), [
    { value: '1', label: '<b>An</b>', render: 'html' },
]);

eq('broken JSON yields nothing', parseEnumEntriesJson('{ not json'), []);
eq('empty string yields nothing', parseEnumEntriesJson(''), []);
eq('null yields nothing', parseEnumEntriesJson(null), []);
eq('a plain number yields nothing', parseEnumEntriesJson(42), []);
eq('an empty list yields nothing', parseEnumEntriesJson([]), []);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
