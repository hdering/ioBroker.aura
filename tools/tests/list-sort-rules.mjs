// Verifies the list sort chain — utils/listSort.ts.
//
//   node tools/tests/list-sort-rules.mjs
//
// Sorting was two fixed slots (key + direction, twice) that could only compare the
// way the widget happened to compare: alphabetically for text, so ON/OFF/ERROR had
// no useful order, and rows whose extra datapoint does not exist always landed in
// the same spot. The chain replaces that — and has to keep the two old option pairs
// sorting exactly as before, which is what most of this file checks.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-listsort-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            'export { effectiveSortRules, hasSorting, isUsableRule, compareByRule, compareByRules,',
            '  makeSortComparator, ruleValue, sortPreview, sortSummary, sortRuleLabel, collectSortValues,',
            '  orderLabels, SORT_MODES, SORT_SOURCE_LABELS }',
            "  from './src-vis/utils/listSort.ts';",
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
    effectiveSortRules,
    hasSorting,
    isUsableRule,
    compareByRules,
    makeSortComparator,
    ruleValue,
    sortPreview,
    sortSummary,
    sortRuleLabel,
    collectSortValues,
    orderLabels,
    SORT_MODES,
    SORT_SOURCE_LABELS,
} = await import(pathToFileURL(bundle).href);
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

/** A list row as the widgets hand it to the engine. */
const row = (label, value, subs = []) => ({ id: `demo.${label}.STATE`, label, value, subs });
const sub = (id, value, label) => ({ id, value, label });
/** Row order under a chain, by name. */
const order = (rules, rows) => sortPreview(rules, rows).map((r) => r.label);

// ── the old option pairs keep sorting as before ──────────────────────────────
{
    eq('legacy: nothing configured sorts nothing', effectiveSortRules({}), []);
    eq('legacy: sortBy none sorts nothing', effectiveSortRules({ sortBy: 'none', sortOrder: 'desc' }), []);
    eq('legacy: label is the row name', effectiveSortRules({ sortBy: 'label' }), [
        { source: 'name', order: undefined },
    ]);
    eq('legacy: value is the main datapoint', effectiveSortRules({ sortBy: 'value', sortOrder: 'desc' }), [
        { source: 'value', order: 'desc' },
    ]);
    eq('legacy: sub:<key> becomes a sub rule', effectiveSortRules({ sortBy: 'sub:BATTERY' }), [
        { source: 'sub', subKey: 'BATTERY', order: undefined },
    ]);
    eq(
        'legacy: the tie-breaker follows as a second rule',
        effectiveSortRules({ sortBy: 'label', sortBy2: 'value', sortOrder2: 'desc' }),
        [
            { source: 'name', order: undefined },
            { source: 'value', order: 'desc' },
        ],
    );
    eq(
        'legacy: a tie-breaker repeating the first key is ignored, as before',
        effectiveSortRules({ sortBy: 'value', sortBy2: 'value' }),
        [{ source: 'value', order: undefined }],
    );
    eq(
        'legacy: a rule chain wins over the old pair',
        effectiveSortRules({ sortBy: 'label', sortRules: [{ source: 'value', order: 'desc' }] }),
        [{ source: 'value', order: 'desc' }],
    );
    check('hasSorting: false without any criterion', hasSorting({}) === false);
    check('hasSorting: true for the legacy pair', hasSorting({ sortBy: 'label' }) === true);
    check('hasSorting: true for a chain', hasSorting({ sortRules: [{ source: 'name' }] }) === true);
}

// ── a chain: the first criterion decides, the next only on ties ──────────────
{
    const rows = [row('Alpha', 1), row('Beta', 0), row('Gamma', 1), row('Delta', 0)];
    eq(
        'chain: value desc, then name',
        order([{ source: 'value', order: 'desc' }, { source: 'name' }], rows),
        ['Alpha', 'Gamma', 'Beta', 'Delta'],
    );
    eq(
        'chain: swapping the order of the criteria swaps the result',
        order([{ source: 'name' }, { source: 'value', order: 'desc' }], rows),
        ['Alpha', 'Beta', 'Delta', 'Gamma'],
    );
    eq('chain: an empty chain keeps the configured order', order([], rows), [
        'Alpha',
        'Beta',
        'Gamma',
        'Delta',
    ]);
}

// ── a datapoint of the second line ──────────────────────────────────────────
{
    const rows = [
        row('Alpha', 1, [sub('hm.Alpha.BATTERY', 80, 'Akku'), sub('hm.Alpha.RSSI', -40)]),
        row('Beta', 1, [sub('hm.Beta.BATTERY', 12, 'Akku'), sub('hm.Beta.RSSI', -90)]),
        row('Gamma', 1, [sub('hm.Gamma.BATTERY', 45, 'Akku'), sub('hm.Gamma.RSSI', -60)]),
    ];
    eq('sub: by label, ascending', order([{ source: 'sub', subKey: 'Akku' }], rows), [
        'Beta',
        'Gamma',
        'Alpha',
    ]);
    eq('sub: by the last id segment', order([{ source: 'sub', subKey: 'BATTERY' }], rows), [
        'Beta',
        'Gamma',
        'Alpha',
    ]);
    eq('sub: descending', order([{ source: 'sub', subKey: 'RSSI', order: 'desc' }], rows), [
        'Alpha',
        'Gamma',
        'Beta',
    ]);
    // The static list's own second-line datapoints differ per row; an empty key then
    // means "whatever this row has first", which is what a one-datapoint list wants.
    eq('sub: an empty key reads the first extra datapoint', order([{ source: 'sub' }], rows), [
        'Beta',
        'Gamma',
        'Alpha',
    ]);
    eq('sub: ruleValue reads the named datapoint', ruleValue({ source: 'sub', subKey: 'RSSI' }, rows[1]), -90);
    eq('sub: an unknown key reads nothing', ruleValue({ source: 'sub', subKey: 'NOPE' }, rows[1]), null);
}

// ── rows without a value ────────────────────────────────────────────────────
{
    const rows = [
        row('Alpha', 1, [sub('hm.Alpha.BATTERY', 80)]),
        row('NoBat', 1, []),
        row('Beta', 1, [sub('hm.Beta.BATTERY', 12)]),
    ];
    const rule = { source: 'sub', subKey: 'BATTERY' };
    eq('empty: rows without the datapoint go last', order([rule], rows), ['Beta', 'Alpha', 'NoBat']);
    eq('empty: and stay last when the direction flips', order([{ ...rule, order: 'desc' }], rows), [
        'Alpha',
        'Beta',
        'NoBat',
    ]);
    eq('empty: first puts them in front', order([{ ...rule, empty: 'first' }], rows), [
        'NoBat',
        'Beta',
        'Alpha',
    ]);
    eq('empty: an empty string counts as no value', order([{ source: 'value' }], [row('A', ''), row('B', 3)]), [
        'B',
        'A',
    ]);
}

// ── how the values are compared ─────────────────────────────────────────────
{
    const nums = [row('A', '9'), row('B', '10'), row('C', '80')];
    eq('mode auto: numbers inside text still sort numerically', order([{ source: 'value' }], nums), [
        'A',
        'B',
        'C',
    ]);
    eq('mode text: purely alphabetical, so 10 comes before 9', order([{ source: 'value', mode: 'text' }], nums), [
        'B',
        'C',
        'A',
    ]);
    eq(
        'mode number: text is converted',
        order([{ source: 'value', mode: 'number' }], [row('A', '12,5'), row('B', '3'), row('C', '7')]),
        // '12,5' is not a number - it counts as no value and goes last.
        ['B', 'C', 'A'],
    );
    eq(
        'mode number: a non-numeric value counts as missing',
        order([{ source: 'value', mode: 'number' }], [row('A', 'n/a'), row('B', 5)]),
        ['B', 'A'],
    );
}

// ── active / inactive ───────────────────────────────────────────────────────
{
    const rows = [row('Aus', 0), row('An', true), row('Zahl', 5), row('Leer', false)];
    eq('mode active: active rows first', order([{ source: 'value', mode: 'active' }], rows), [
        'An',
        'Zahl',
        'Aus',
        'Leer',
    ]);
    eq(
        'mode active: desc puts the inactive ones first',
        order([{ source: 'value', mode: 'active', order: 'desc' }], rows),
        ['Aus', 'Leer', 'An', 'Zahl'],
    );
    eq('labels: the direction is named after the mode', orderLabels('active'), {
        asc: 'Aktive zuerst',
        desc: 'Inaktive zuerst',
    });
}

// ── a hand-written value order ──────────────────────────────────────────────
{
    const rows = [row('A', 'OK'), row('B', 'ERROR'), row('C', 'WARN'), row('D', 'unbekannt')];
    const rule = { source: 'value', mode: 'custom', values: ['ERROR', 'WARN', 'OK'] };
    eq('mode custom: the listed order wins', order([rule], rows), ['B', 'C', 'A', 'D']);
    eq('mode custom: unlisted values follow behind', ruleValue(rule, rows[3]), 'unbekannt');
    eq('mode custom: desc reverses it', order([{ ...rule, order: 'desc' }], rows), ['D', 'A', 'C', 'B']);
    eq(
        'mode custom: matching ignores case and padding',
        order([{ source: 'value', mode: 'custom', values: ['  error ', 'ok'] }], rows),
        // WARN and unbekannt are both unlisted, so they keep their relative order.
        ['B', 'A', 'C', 'D'],
    );
    check(
        'mode custom: a rule with an empty list is not a criterion',
        isUsableRule({ source: 'value', mode: 'custom', values: ['', ' '] }) === false,
    );
    check('usable: an ordinary rule is', isUsableRule({ source: 'value' }) === true);
    eq(
        'custom editor: the values currently present are offered',
        collectSortValues(rule, rows),
        ['ERROR', 'OK', 'unbekannt', 'WARN'],
    );
}

// ── the row name ────────────────────────────────────────────────────────────
{
    const rows = [row('Küche', 1), row('Bad 10', 1), row('Bad 9', 1)];
    eq('name: sorted with numbers read as numbers', order([{ source: 'name' }], rows), [
        'Bad 9',
        'Bad 10',
        'Küche',
    ]);
    eq('name: descending', order([{ source: 'name', order: 'desc' }], rows), ['Küche', 'Bad 10', 'Bad 9']);
}

// ── the comparator the widgets use ──────────────────────────────────────────
{
    const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const vals = { a: 3, b: 1, c: 2 };
    let built = 0;
    const toRow = (e) => {
        built += 1;
        return { id: e.id, label: e.id, value: vals[e.id], subs: [] };
    };
    const cmp = makeSortComparator([{ source: 'value' }], toRow, (e) => e.id);
    eq(
        'comparator: sorts the widget entries',
        [...entries].sort(cmp).map((e) => e.id),
        ['b', 'c', 'a'],
    );
    eq('comparator: the row is built once per entry, not per comparison', built, 3);
    check('comparator: null without a criterion', makeSortComparator([], toRow) === null);
    eq('comparator: two equal rows keep their order', compareByRules([{ source: 'value' }], row('A', 1), row('B', 1)), 0);
}

// ── what the panel says the list sorts by ───────────────────────────────────
{
    eq('summary: nothing configured', sortSummary({}), '');
    eq('summary: the legacy pair reads as a chain', sortSummary({ sortBy: 'label', sortOrder: 'desc' }), 'Name ↓');
    eq(
        'summary: several criteria',
        sortSummary({ sortRules: [{ source: 'sub', subKey: 'Akku' }, { source: 'name', order: 'desc' }] }),
        '2. Zeile: Akku ↑ · dann Name ↓',
    );
    eq('summary: the active mode is spelled out', sortRuleLabel({ source: 'value', mode: 'active' }), 'Wert (aktive zuerst)');
    eq('summary: an empty sub key names the fallback', sortRuleLabel({ source: 'sub' }), '2. Zeile: erster DP ↑');
    eq('tables: the sources the editor renders', Object.keys(SORT_SOURCE_LABELS), ['value', 'name', 'sub']);
    eq(
        'tables: the modes the editor renders',
        SORT_MODES.map((m) => m.value),
        ['auto', 'number', 'text', 'active', 'custom'],
    );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
