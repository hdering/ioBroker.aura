// What the aggregate badge of a tab / section counts — utils/badgeAggregate.ts.
//
//   node tools/tests/badge-aggregate.mjs
//
// The aggregate used to have exactly one rule ("a widget showing any marker counts
// 1"), which made a decorative free-text marker weigh as much as an alarm. Three
// promises are checked here, all of them pure — no dev server, no browser:
//
//   * 'widgets' still means what it meant, marker for marker, so every stored
//     dashboard shows the same number after the update;
//   * 'conditional' lets through exactly the markers that can switch off again
//     (a condition, or the legacy 'nonzero'), never a permanently visible one;
//   * 'sum' adds the values the count markers actually display — hidden markers
//     contribute nothing, non-numbers are skipped instead of poisoning the sum
//     with NaN, and 0.1 + 0.2 must not reach the badge as 0.30000000000000004.
//
// `countInAggregate: false` is the per-marker override and has to beat all three.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-badge-aggregate-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { aggregateBadgeValue, badgeInAggregate, badgeVisible } from './src-vis/utils/badgeAggregate.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
    plugins: [
        {
            // conditionSources reaches the number formatter through the list stats,
            // and that one reads a zustand store which boots the ioBroker connection.
            // Nothing in this test formats a number, so the store is stubbed away.
            name: 'stub-settings-store',
            setup(b) {
                b.onResolve({ filter: /globalSettingsStore$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                    contents: 'export const useGlobalSettingsStore = { getState: () => ({}) };',
                    loader: 'js',
                }));
            },
        },
    ],
});
const { aggregateBadgeValue, badgeInAggregate, badgeVisible } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// ── Fixtures ──────────────────────────────────────────────────────────────────

let n = 0;
const badge = (b) => ({ id: `b${++n}`, style: 'dot', corner: 'top-right', visibility: 'always', ...b });
/** A free-text marker: always visible, says nothing about a state. */
const text = (extra = {}) => badge({ style: 'label', label: 'Info', ...extra });
/** A marker gated by "datapoint is active". */
const cond = (dp) => badge({ visibility: 'condition', clauses: [{ datapoint: dp, operator: 'active', value: '' }] });
/** A marker that prints the value of a datapoint. */
const count = (dp, extra = {}) => badge({ style: 'count', dp, ...extra });

const w = (badges, ctx) => ({ badges, ctx });
const vals = (o) => new Map(Object.entries(o));

const agg = (entries, values, mode) =>
    aggregateBadgeValue(entries, values instanceof Map ? values : vals(values), mode);

// ── 'widgets' — the stored behaviour must not move ────────────────────────────

eq('two free-text markers count as two widgets', agg([w([text()]), w([text()])], {}), 2);
eq('the default mode is "widgets"', agg([w([text()])], {}, undefined), 1);
eq('a widget with three markers counts once', agg([w([text(), text(), cond('a')])], { a: true }, 'widgets'), 1);
eq('a widget without markers counts nothing', agg([w([])], {}, 'widgets'), 0);
eq('a false condition hides the widget', agg([w([cond('a')])], { a: false }, 'widgets'), 0);
eq('a true condition shows it', agg([w([cond('a')])], { a: true }, 'widgets'), 1);
eq('no entries at all', agg([], {}, 'widgets'), 0);

// ── 'conditional' — the case the free text broke ──────────────────────────────

eq('free text is not counted', agg([w([text()]), w([text()])], {}, 'conditional'), 0);
eq('a true condition still counts', agg([w([cond('a')]), w([text()])], { a: true }, 'conditional'), 1);
eq('a false condition counts nothing', agg([w([cond('a')])], { a: false }, 'conditional'), 0);
eq(
    'free text next to a condition does not add a second widget',
    agg([w([text(), cond('a')])], { a: true }, 'conditional'),
    1,
);
// The legacy visibility is a condition in disguise — it must not be dropped.
eq(
    'a legacy "nonzero" marker counts',
    agg([w([badge({ visibility: 'nonzero', dp: 'a' })])], { a: 5 }, 'conditional'),
    1,
);
eq('…and follows its value', agg([w([badge({ visibility: 'nonzero', dp: 'a' })])], { a: 0 }, 'conditional'), 0);
// An always-visible count marker is a number, not a state — same rule as free text.
eq('a permanent count marker is not a condition', agg([w([count('a')])], { a: 3 }, 'conditional'), 0);

// ── 'sum' — only numbers are added ────────────────────────────────────────────

eq('two count markers are added', agg([w([count('a')]), w([count('b')])], { a: 2, b: 3 }, 'sum'), 5);
eq('free text adds nothing', agg([w([text()]), w([count('a')])], { a: 7 }, 'sum'), 7);
eq('a dot marker adds nothing', agg([w([badge({ style: 'dot' })])], {}, 'sum'), 0);
eq('two count markers on one widget both count', agg([w([count('a'), count('b')])], { a: 1, b: 2 }, 'sum'), 3);
eq(
    'a hidden count marker is left out',
    agg(
        [w([count('a', { visibility: 'condition', clauses: [{ datapoint: 'on', operator: 'active', value: '' }] })])],
        { a: 10, on: false },
        'sum',
    ),
    0,
);
eq(
    '…and is added once it shows',
    agg(
        [w([count('a', { visibility: 'condition', clauses: [{ datapoint: 'on', operator: 'active', value: '' }] })])],
        { a: 10, on: true },
        'sum',
    ),
    10,
);
eq(
    'a boolean counts like the badge prints it',
    agg([w([count('a')]), w([count('b')])], { a: true, b: false }, 'sum'),
    1,
);
eq('a numeric string is parsed', agg([w([count('a')])], { a: '12.5' }, 'sum'), 12.5);
eq('a decimal comma is parsed', agg([w([count('a')])], { a: '12,5' }, 'sum'), 12.5);
eq('text is skipped, not NaN', agg([w([count('a')]), w([count('b')])], { a: 'offen', b: 4 }, 'sum'), 4);
eq('null is skipped', agg([w([count('a')]), w([count('b')])], { a: null, b: 4 }, 'sum'), 4);
eq('an unknown datapoint is skipped', agg([w([count('nope')]), w([count('b')])], { b: 4 }, 'sum'), 4);
eq('a negative value lowers the sum', agg([w([count('a')]), w([count('b')])], { a: -1200, b: 200 }, 'sum'), -1000);
eq('float noise does not reach the badge', agg([w([count('a')]), w([count('b')])], { a: 0.1, b: 0.2 }, 'sum'), 0.3);

// The widget's own datapoint — an empty marker DP means "the main DP", and the
// token map is per widget, so two widgets must not read the same value.
eq(
    'an empty marker datapoint reads the widget main DP',
    agg([w([count('')], { ownDp: 'a' }), w([count('')], { ownDp: 'b' })], { a: 5, b: 6 }, 'sum'),
    11,
);
eq(
    'the own-DP token is refreshed per widget in count mode too',
    agg([w([cond('')], { ownDp: 'a' }), w([cond('')], { ownDp: 'b' })], { a: true, b: false }, 'widgets'),
    1,
);

// ── countInAggregate — the per-marker override ────────────────────────────────

eq('an excluded marker is not counted', agg([w([text({ countInAggregate: false })])], {}, 'widgets'), 0);
eq(
    'excluding the only marker empties the widget',
    agg([w([badge({ countInAggregate: false, visibility: 'condition', clauses: [] })])], {}, 'conditional'),
    0,
);
eq('an excluded count marker is not summed', agg([w([count('a', { countInAggregate: false })])], { a: 9 }, 'sum'), 0);
eq(
    'its sibling still counts',
    agg([w([count('a', { countInAggregate: false }), count('b')])], { a: 9, b: 4 }, 'sum'),
    4,
);
eq('countInAggregate true is the default', agg([w([count('a', { countInAggregate: true })])], { a: 9 }, 'sum'), 9);

// ── The eligibility predicate on its own ──────────────────────────────────────

check('badgeInAggregate: free text is in "widgets"', badgeInAggregate(text(), 'widgets') === true);
check('badgeInAggregate: free text is out in "conditional"', badgeInAggregate(text(), 'conditional') === false);
check('badgeInAggregate: free text is out in "sum"', badgeInAggregate(text(), 'sum') === false);
check('badgeInAggregate: a count marker is in "sum"', badgeInAggregate(count('a'), 'sum') === true);
check('badgeInAggregate: the opt-out beats every mode', badgeInAggregate(text({ countInAggregate: false })) === false);

// badgeVisible is shared with the marker rendering — a condition with no clause
// at all is "no restriction", not "never".
check('badgeVisible: an empty condition shows', badgeVisible(badge({ visibility: 'condition' }), new Map()) === true);
check('badgeVisible: "always" shows', badgeVisible(text(), new Map()) === true);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} checks, ${failed.length} failed`);
if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.name} — ${f.detail}`);
    process.exit(1);
}
