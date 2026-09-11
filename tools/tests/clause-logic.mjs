// How the clauses of a condition combine — utils/clauseLogic.ts (issue #635).
//
//   node tools/tests/clause-logic.mjs
//
// Before #635 a rule had ONE logic for its whole clause list, so "AND on this row,
// OR on the next" was impossible and brackets did not exist. The fold now lives in
// one pure module, which is what this test drives directly — no dev server, no
// browser.
//
// The connector cases are checked against a plain boolean formula over all 2^n
// inputs rather than against a hand-written truth table: the formula is what the
// user believes the rule says, written independently of the tree fold, so a wrong
// precedence cannot pass by agreeing with a typo.
//
// Two promises are exercised as hard as the new behaviour itself:
//   * a stored rule with no `join` anywhere still means exactly what it meant, for
//     both fallbacks — that is the whole back-compat guarantee;
//   * AND binds tighter than OR, in every position, so nobody has to learn a
//     precedence rule that only this dashboard uses.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-clause-logic-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { clauseTree, combineClauseHits, combineClauseSets, materializeJoins, groupEdges, cycleBracket, describeClauseLogic } from './src-vis/utils/clauseLogic.ts';",
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
    clauseTree,
    combineClauseHits,
    combineClauseSets,
    materializeJoins,
    groupEdges,
    cycleBracket,
    describeClauseLogic,
} = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

/**
 * A clause list from a compact spec. Each entry is the row's `join`, prefixed with
 * '(' for a row that OPENS a bracket and '|' for one that continues the bracket
 * above it: '', 'AND', 'OR', '(AND', '|OR'.
 */
const cl = (...specs) =>
    specs.map((spec) => {
        const bracket = spec.startsWith('(') ? 'open' : spec.startsWith('|') ? 'in' : undefined;
        const join = spec.replace(/^[(|]/, '') || undefined;
        return { ...(join ? { join } : null), ...(bracket ? { bracket } : null) };
    });

/** Every combination of n booleans. Clause 0 is the lowest bit. */
const allHits = (n) =>
    Array.from({ length: 2 ** n }, (_, mask) => Array.from({ length: n }, (_, i) => !!(mask & (1 << i))));

/** The module's verdict over every input combination, as a '0101…' string. */
const table = (clauses, fallback) =>
    allHits(clauses.length)
        .map((hits) => (combineClauseHits(clauses, hits, fallback) ? '1' : '0'))
        .join('');

/** The same, from a plain boolean formula — the independent reference. */
const formula = (n, fn) =>
    allHits(n)
        .map((hits) => (fn(...hits) ? '1' : '0'))
        .join('');

/** Assert the clause list means exactly what `fn` says, for every input. */
const means = (name, clauses, fallback, fn) => eq(name, table(clauses, fallback), formula(clauses.length, fn));

console.log('\n── back-compat: a rule without any `join` ───────────────────────────────');

// The stored shape: no join, no bracket — the verdict comes from the rule-wide logic.
const plain3 = cl('', '', '');
eq('three clauses, AND fallback, all true', combineClauseHits(plain3, [true, true, true], 'AND'), true);
eq('… one false and it is false', combineClauseHits(plain3, [true, false, true], 'AND'), false);
eq('three clauses, OR fallback, one true', combineClauseHits(plain3, [false, true, false], 'OR'), true);
eq('… none true and it is false', combineClauseHits(plain3, [false, false, false], 'OR'), false);
means('AND fallback is exactly "all of them"', plain3, 'AND', (a, b, c) => a && b && c);
means('OR fallback is exactly "any of them"', plain3, 'OR', (a, b, c) => a || b || c);
eq('the default fallback is AND', table(plain3), table(plain3, 'AND'));
eq('an empty clause list never matches', combineClauseHits([], [], 'OR'), false);
means('a single clause is just its own hit', cl(''), 'AND', (a) => a);
// The first clause has nothing to hang off, so its join must not be read.
eq('a join on the first clause is ignored', table(cl('OR', '', ''), 'AND'), table(plain3, 'AND'));

console.log('\n── mixed connectors: what the issue asked for ───────────────────────────');

// The case from the issue: one row AND, the next OR. AND binds tighter.
const aAndBorC = cl('', 'AND', 'OR');
means('A AND B OR C reads as (A AND B) OR C', aAndBorC, 'AND', (a, b, c) => (a && b) || c);
eq('… A alone does not match it', combineClauseHits(aAndBorC, [true, false, false], 'AND'), false);
eq('… A and B together do', combineClauseHits(aAndBorC, [true, true, false], 'AND'), true);
eq('… C alone does too', combineClauseHits(aAndBorC, [false, false, true], 'AND'), true);

// The AND must attach to B, not to the whole left-hand side.
const aOrBandC = cl('', 'OR', 'AND');
means('A OR B AND C reads as A OR (B AND C)', aOrBandC, 'AND', (a, b, c) => a || (b && c));
eq('… B alone does not match', combineClauseHits(aOrBandC, [false, true, false], 'AND'), false);
eq('… B and C do', combineClauseHits(aOrBandC, [false, true, true], 'AND'), true);

// The fallback must not leak into a clause that states its own join.
means('an explicit join wins over the fallback', cl('', 'AND', 'AND'), 'OR', (a, b, c) => a && b && c);
eq('… and a missing one still takes it', table(cl('', 'AND'), 'OR'), table(cl('', 'AND'), 'AND'));

means('two OR-separated AND runs', cl('', 'AND', 'OR', 'AND'), 'AND', (a, b, c, d) => (a && b) || (c && d));
means(
    'an OR in the middle of a long AND chain',
    cl('', 'AND', 'OR', 'AND', 'AND'),
    'AND',
    (a, b, c, d, e) => (a && b) || (c && d && e),
);

console.log('\n── brackets ─────────────────────────────────────────────────────────────');

// The order AND-precedence cannot express on its own.
const bracketed = cl('', '(AND', '|OR');
means('A AND (B OR C)', bracketed, 'AND', (a, b, c) => a && (b || c));
eq('… A and B match', combineClauseHits(bracketed, [true, true, false], 'AND'), true);
eq('… A and C match', combineClauseHits(bracketed, [true, false, true], 'AND'), true);
eq('… B and C without A do not', combineClauseHits(bracketed, [false, true, true], 'AND'), false);
eq('the bracket is what changes it', table(bracketed, 'AND') !== table(aAndBorC, 'AND'), true);

// A bracket that opens on the very first row.
means('(A OR B) AND C', cl('(', '|OR', 'AND'), 'AND', (a, b, c) => (a || b) && c);
eq('… C alone does not match', combineClauseHits(cl('(', '|OR', 'AND'), [false, false, true], 'AND'), false);

// The bracket hangs off the outer level with the join of its 'open' row.
means('a bracket joined with OR: A OR (B AND C)', cl('', '(OR', '|AND'), 'AND', (a, b, c) => a || (b && c));

// Two ADJACENT brackets — the case a plain depth flag cannot encode, because the
// third row has to say "a new bracket starts here", not just "I am inside one".
means('(A OR B) AND (C OR D)', cl('(', '|OR', '(AND', '|OR'), 'AND', (a, b, c, d) => (a || b) && (c || d));
means(
    '(A AND B) OR (C AND D) with brackets spelled out',
    cl('(', '|AND', '(OR', '|AND'),
    'AND',
    (a, b, c, d) => (a && b) || (c && d),
);
means(
    'three in a row: (A OR B) AND (C OR D) AND (E OR F)',
    cl('(', '|OR', '(AND', '|OR', '(AND', '|OR'),
    'AND',
    (a, b, c, d, e, f) => (a || b) && (c || d) && (e || f),
);

// A top-level row between two brackets keeps them apart as well.
means(
    '(A OR B) AND C AND (D OR E)',
    cl('(', '|OR', 'AND', '(AND', '|OR'),
    'AND',
    (a, b, c, d, e) => (a || b) && c && (d || e),
);

// Degenerate but reachable states while the user is still building the rule.
means('a bracket around a single clause is that clause', cl('', '(AND'), 'AND', (a, b) => a && b);
eq(
    'a bracket around everything changes nothing',
    table(cl('(', '|AND', '|OR'), 'AND'),
    table(cl('', 'AND', 'OR'), 'AND'),
);
// An 'in' with nothing above it continues nothing and has to read as an 'open'.
eq(
    'a dangling "in" on the first row behaves as an open',
    table(cl('|', '|OR', 'AND'), 'AND'),
    table(cl('(', '|OR', 'AND'), 'AND'),
);
eq(
    'a dangling "in" after a top-level row too',
    table(cl('', '|AND', '|OR'), 'AND'),
    table(cl('', '(AND', '|OR'), 'AND'),
);

console.log('\n── the tree itself ──────────────────────────────────────────────────────');

eq(
    'a flat list is all leaves',
    clauseTree(plain3).map((n) => n.kind),
    ['leaf', 'leaf', 'leaf'],
);
eq(
    '… with the fallback written into every join',
    clauseTree(plain3, 'OR').map((n) => n.join),
    ['AND', 'OR', 'OR'],
);
eq(
    'a bracket becomes one node',
    clauseTree(bracketed).map((n) => n.kind),
    ['leaf', 'group'],
);
eq(
    '… holding both rows',
    clauseTree(bracketed)[1].items.map((n) => n.index),
    [1, 2],
);
eq('… attached with the join of its "open" row', clauseTree(bracketed)[1].join, 'AND');
eq('… whose own inner join is not read', clauseTree(bracketed)[1].items[0].join, 'AND');
const twoGroups = clauseTree(cl('(', '|OR', '(AND', '|OR'));
eq(
    'two adjacent brackets stay two nodes',
    twoGroups.map((n) => n.kind),
    ['group', 'group'],
);
eq(
    '… split at the "open" row',
    twoGroups.map((n) => n.items.map((it) => it.index)),
    [
        [0, 1],
        [2, 3],
    ],
);
eq('an empty list is an empty tree', clauseTree([]), []);

console.log('\n── groupEdges (the editor’s bracket bar) ────────────────────────────────');

eq('an ungrouped row has no bar', groupEdges(bracketed, 0), { inGroup: false, first: false, last: false });
eq('the opening row starts it', groupEdges(bracketed, 1), { inGroup: true, first: true, last: false });
eq('the last row closes it', groupEdges(bracketed, 2), { inGroup: true, first: false, last: true });
eq('a one-row bracket opens and closes', groupEdges(cl('', '(AND'), 1), { inGroup: true, first: true, last: true });
const three = cl('(', '|AND', '|AND');
eq('a middle row is neither end', groupEdges(three, 1), { inGroup: true, first: false, last: false });
eq('the run ends at the list end', groupEdges(three, 2), { inGroup: true, first: false, last: true });
// Where the second bracket opens, the first one has to be drawn as closed.
const pair = cl('(', '|OR', '(AND', '|OR');
eq('the row before a new bracket closes the old one', groupEdges(pair, 1), {
    inGroup: true,
    first: false,
    last: true,
});
eq('… and the new one opens', groupEdges(pair, 2), { inGroup: true, first: true, last: false });
eq('an out-of-range index is not in a group', groupEdges(three, 9), { inGroup: false, first: false, last: false });

console.log('\n── cycleBracket (what the editor’s bracket button does) ─────────────────');

const brackets = (list) => list.map((c) => c.bracket ?? '-');

eq('an unbracketed first row opens a bracket', brackets(cycleBracket(cl('', '', ''), 0)), ['open', '-', '-']);
eq('a row below a bracketed one joins it', brackets(cycleBracket(cl('(', '', ''), 1)), ['open', 'in', '-']);
eq('a row below an unbracketed one opens its own', brackets(cycleBracket(cl('', '', ''), 1)), ['-', 'open', '-']);
eq('clicking an "in" row splits the bracket there', brackets(cycleBracket(cl('(', '|', '|'), 1)), [
    'open',
    'open',
    'in',
]);
eq('clicking an "open" row removes the bracket', brackets(cycleBracket(cl('(', '', ''), 0)), ['-', '-', '-']);
// Removing the opening row must not leave its follower continuing nothing.
eq('… and promotes the follower that was inside it', brackets(cycleBracket(cl('(', '|', ''), 0)), ['-', 'open', '-']);
eq(
    'three clicks return to where it started',
    brackets([0, 0, 0].reduce((list) => cycleBracket(list, 1), cl('(', '|', ''))),
    brackets(cl('(', '|', '')),
);
eq('the joins are left alone', cycleBracket(cl('', 'AND', 'OR'), 1)[1].join, 'AND');

console.log('\n── materializeJoins (what the editor writes) ────────────────────────────');

// Toggling one chip must first pin down what the others meant, or the rule would
// quietly change meaning without anyone touching those rows.
eq('the fallback is written onto every row but the first', materializeJoins(plain3, 'OR'), [
    {},
    { join: 'OR' },
    { join: 'OR' },
]);
eq('a row that already states its join is left alone', materializeJoins(cl('', 'AND', ''), 'OR'), [
    {},
    { join: 'AND' },
    { join: 'OR' },
]);
eq('the first row never gets one', materializeJoins(cl(''), 'OR'), [{}]);
eq('brackets survive', materializeJoins(cl('', '(AND'), 'OR'), [{}, { join: 'AND', bracket: 'open' }]);
// The point of the whole exercise: materialising must not change the verdict.
eq(
    'materialising is verdict-neutral',
    table(materializeJoins(cl('', '', '(OR'), 'OR'), 'AND'),
    table(cl('', '', '(OR'), 'OR'),
);

console.log('\n── combineClauseSets (which list rows triggered) ────────────────────────');

const rows = ['a', 'b', 'c', 'd'];
/** setFor from a plain array: `null` = the clause speaks about the list, not a row. */
const sets =
    (...per) =>
    (i) =>
        per[i];

eq('AND intersects the row sets', combineClauseSets(cl('', 'AND'), sets(['a', 'b', 'c'], ['b', 'c', 'd']), rows), [
    'b',
    'c',
]);
eq('OR unions them', combineClauseSets(cl('', 'OR'), sets(['a'], ['d']), rows), ['a', 'd']);
eq(
    'the output keeps the list order, not the clause order',
    combineClauseSets(cl('', 'OR'), sets(['d', 'c'], ['a']), rows),
    ['a', 'c', 'd'],
);
eq(
    'a clause about the whole list drops out instead of gating rows',
    combineClauseSets(cl('', 'AND'), sets(['a', 'b'], null), rows),
    ['a', 'b'],
);
eq('no row-bearing clause at all is not identifiable', combineClauseSets(cl('', 'AND'), sets(null, null), rows), null);
eq('an empty clause list likewise', combineClauseSets([], sets(), rows), null);
eq('an empty hit set is a real answer, not "unknown"', combineClauseSets(cl('', 'AND'), sets(['a'], []), rows), []);
eq('mixed connectors: (A ∩ B) ∪ C', combineClauseSets(cl('', 'AND', 'OR'), sets(['a', 'b'], ['b', 'c'], ['d']), rows), [
    'b',
    'd',
]);
eq(
    'a bracket regroups the sets: A ∩ (B ∪ C)',
    combineClauseSets(cl('', '(AND', '|OR'), sets(['a', 'b'], ['b'], ['c']), rows),
    ['b'],
);
eq(
    '… which the same rows without the bracket would answer differently',
    combineClauseSets(cl('', 'AND', 'OR'), sets(['a', 'b'], ['b'], ['c']), rows),
    ['b', 'c'],
);

console.log('\n── describeClauseLogic (the preview line) ───────────────────────────────');

const words = { and: 'UND', or: 'ODER' };
const label = (i) => 'ABCDEF'[i];
eq('a flat AND chain', describeClauseLogic(plain3, label, words, 'AND'), 'A UND B UND C');
eq('a flat OR chain', describeClauseLogic(plain3, label, words, 'OR'), 'A ODER B ODER C');
eq('mixed connectors', describeClauseLogic(aAndBorC, label, words, 'AND'), 'A UND B ODER C');
eq('a bracket is printed', describeClauseLogic(bracketed, label, words, 'AND'), 'A UND (B ODER C)');
eq('a leading bracket too', describeClauseLogic(cl('(', '|OR', 'AND'), label, words, 'AND'), '(A ODER B) UND C');
eq(
    'two adjacent brackets',
    describeClauseLogic(cl('(', '|OR', '(AND', '|OR'), label, words, 'AND'),
    '(A ODER B) UND (C ODER D)',
);
// A bracket the user has only half-built should not read as `(A) UND B`.
eq('a one-row bracket prints no parentheses', describeClauseLogic(cl('', '(AND'), label, words, 'AND'), 'A UND B');
eq('an empty list is an empty line', describeClauseLogic([], label, words), '');

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} checks, ${failed.length} failed`);
if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.name} — ${f.detail}`);
    process.exit(1);
}
