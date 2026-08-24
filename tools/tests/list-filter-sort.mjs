// Verifies the list filter and sort additions from issue #572 — utils/listFilter.ts.
//
//   node tools/tests/list-filter-sort.mjs
//
// Two gaps the issue reported. A custom filter could only look at VALUES, so
// "hide every row whose name contains Offline" was unbuildable: the free-text
// search matches inclusively and rules had no access to the row name at all. And
// sorting knew only name and value, never a datapoint of the second line.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-listfilter-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            'export { ruleMatches, presetMatches, matchesFilterMode, matchesSearch, subValueByKey, sortSubKey,',
            '  subMatchesKey, LIST_FILTER_OPERATORS, SOURCE_LABELS, SUB_SORT_PREFIX }',
            "  from './src-vis/utils/listFilter.ts';",
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
    ruleMatches,
    presetMatches,
    matchesSearch,
    subValueByKey,
    sortSubKey,
    LIST_FILTER_OPERATORS,
    SOURCE_LABELS,
    SUB_SORT_PREFIX,
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

const row = (label, value, subs = []) => ({ id: 'hm-rpc.0.Dev.STATE', label, value, subs });

// ── the row name as a filter source ──────────────────────────────────────────
{
    const r = { source: 'name', operator: 'contains', value: 'Offline' };
    check('name source: matches a name that contains the text', ruleMatches(r, row('Bad Offline', true)));
    check('name source: skips one that does not', !ruleMatches(r, row('Bad', true)));
    check(
        'name source: ignores the values on the row',
        !ruleMatches(r, row('Bad', 'Offline', [{ id: 'x', value: 'Offline' }])),
    );
}
{
    // The reported case: hide every row whose name says Offline.
    const r = { source: 'name', operator: 'notContains', value: 'Offline' };
    check('notContains: a matching name is filtered out', !ruleMatches(r, row('Bad Offline', true)));
    check('notContains: every other row stays', ruleMatches(r, row('Bad', true)));
    check('notContains: case-insensitive, like the search', !ruleMatches(r, row('BAD OFFLINE', true)));
    check('notContains: an empty needle excludes nothing', ruleMatches({ ...r, value: '' }, row('Offline', true)));
    check('notContains: a row without a name cannot contain it', ruleMatches(r, { id: 'x', value: 1 }));
}
{
    // A negative rule is about ALL candidates — one hit is enough to exclude the row.
    const r = { source: 'sub', operator: 'notContains', value: 'err' };
    const clean = row('Bad', 1, [
        { id: 'a', value: 'ok' },
        { id: 'b', value: 'fine' },
    ]);
    const dirty = row('Bad', 1, [
        { id: 'a', value: 'ok' },
        { id: 'b', value: 'error' },
    ]);
    check('notContains: passes when no extra datapoint contains it', ruleMatches(r, clean));
    check('notContains: one hit among the extras excludes the row', !ruleMatches(r, dirty));
}
{
    const preset = {
        id: 'p',
        label: 'Online',
        logic: 'AND',
        rules: [
            { source: 'name', operator: 'notContains', value: 'Offline' },
            { source: 'main', operator: 'active' },
        ],
    };
    check('preset: both rules hold', presetMatches(preset, row('Bad', 1)));
    check('preset: the name rule vetoes', !presetMatches(preset, row('Bad Offline', 1)));
    check('preset: the value rule vetoes', !presetMatches(preset, row('Bad', 0)));
}

// ── the operator and source tables the editor renders from ───────────────────
{
    const op = LIST_FILTER_OPERATORS.find((o) => o.value === 'notContains');
    check('operator table: notContains is offered', !!op, JSON.stringify(LIST_FILTER_OPERATORS.map((o) => o.value)));
    check('operator table: it needs a comparison value', op?.needsValue === true);
    eq('source table: the name is labelled', SOURCE_LABELS.name, 'Name');
}

// ── sorting by a datapoint of the second line ────────────────────────────────
eq('sort key: plain keys are not sub keys', sortSubKey('label'), null);
eq('sort key: undefined is not a sub key', sortSubKey(undefined), null);
eq('sort key: sub:BATTERY', sortSubKey(`${SUB_SORT_PREFIX}BATTERY`), 'BATTERY');

{
    const subs = [
        { id: 'hm-rpc.0.Dev.BATTERY', label: 'Akku', value: 42 },
        { id: 'hm-rpc.0.Dev.RSSI', value: -70 },
    ];
    eq('sub lookup: by label', subValueByKey(subs, 'Akku'), 42);
    eq('sub lookup: by last id segment', subValueByKey(subs, 'BATTERY'), 42);
    eq('sub lookup: by full id', subValueByKey(subs, 'hm-rpc.0.Dev.RSSI'), -70);
    eq('sub lookup: an unknown key yields null, not the first one', subValueByKey(subs, 'NOPE'), null);
    eq('sub lookup: nothing configured', subValueByKey(undefined, 'BATTERY'), null);
}
{
    // What the comparator does with it: rows sort by the named extra datapoint.
    const rows = [
        row('A', 1, [{ id: 'x.BATTERY', value: 80 }]),
        row('B', 1, [{ id: 'x.BATTERY', value: 12 }]),
        row('C', 1, []),
    ];
    const key = sortSubKey(`${SUB_SORT_PREFIX}BATTERY`);
    const vals = rows.map((r) => subValueByKey(r.subs, key));
    eq('sort: the values the comparator sees', vals, [80, 12, null]);
}

// ── the free-text search still behaves ───────────────────────────────────────
check('search: matches the name', matchesSearch(row('Bad Offline', true), 'offline'));
check('search: matches a value', matchesSearch(row('Bad', 'Offline'), 'offline'));
check('search: an empty term keeps everything', matchesSearch(row('Bad', 1), '  '));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
