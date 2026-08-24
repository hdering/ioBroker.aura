// Verifies the expression language and the operation vocabulary behind datapoint
// bindings — utils/expr.ts and utils/exprOps.ts.
//
//   node tools/tests/expr.mjs
//
// No dev server needed: both modules are pure (their only i18n contact is a
// `import type`), so esbuild bundles them and the test drives them directly.
//
// Every example printed in docs/widgets/bindings.md appears here as a case, so the
// documentation cannot drift away from the implementation without turning this red.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-expr-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export { evalExpr, exprRefs, exprToString, parseExpr, parseOpChain, applyOpChain } from './src-vis/utils/expr.ts';",
            "export { OP_NAMES, toNum } from './src-vis/utils/exprOps.ts';",
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
const { evalExpr, exprRefs, exprToString, parseExpr, parseOpChain, applyOpChain, OP_NAMES } = await import(
    pathToFileURL(bundle).href
);
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

// ── the world the expressions see ─────────────────────────────────────────────

// 22 Aug 2026, 14:32:07.045 — the reference instant for every date case.
const STAMP = new Date(2026, 7, 22, 14, 32, 7, 45);
const DAYS_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const DAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
];

const t = (key) => {
    let m;
    if ((m = /^clock\.day\.(\d)$/.exec(key))) return DAYS_LONG[+m[1]];
    if ((m = /^cal\.day\.(\d)$/.exec(key))) return DAYS_SHORT[+m[1]];
    if ((m = /^clock\.month\.(\d+)$/.exec(key))) return MONTHS[+m[1]];
    if (key === 'expr.today') return 'Heute';
    if (key === 'expr.yesterday') return 'Gestern';
    return key;
};

/** Stand-in for utils/formatValue bound to the German number format. */
const formatNum = (value, decimals) => {
    const base = decimals === 0 ? String(Math.round(value)) : value.toFixed(decimals);
    const sign = base.startsWith('-') ? '-' : '';
    const [int, frac] = (sign ? base.slice(1) : base).split('.');
    return sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (frac ? `,${frac}` : '');
};

const ops = { formatNum, decimals: 1, t };

const STATES = {
    'senec.0.ENERGY.GUI_INVERTER_POWER': { val: 2500, ts: 1_760_000_000_000, lc: +STAMP },
    'senec.0.ENERGY.GUI_GRID_POW': { val: -1234.56, ts: +STAMP, lc: +STAMP },
    '0_userdata.0.Temperatur': { val: 21.4, ts: +STAMP, lc: +STAMP },
    '0_userdata.0.Text': { val: '17.5', ts: 0, lc: 0 },
    '0_userdata.0.Akku?soc': { val: 87, ts: 0, lc: 0 },
    '0_userdata.0.Akku?cells.1': { val: 3.31, ts: 0, lc: 0 },
    '0_userdata.0.Objekt': { val: { a: { b: 7 } }, ts: 0, lc: 0 },
    '0_userdata.0.Rot': { val: 100, ts: 0, lc: 0 },
    '0_userdata.0.Gruen': { val: 200, ts: 0, lc: 0 },
    '0_userdata.0.Blau': { val: 12, ts: 0, lc: 0 },
    '0_userdata.0.Zeit': { val: +STAMP, ts: 0, lc: 0 },
    'shelly.0.SHSW-25#4C7525#1.Relay0.Switch': { val: true, ts: 0, lc: 0 },
};

const ctx = (vars = {}) => ({
    resolveRaw: (ref, field) => STATES[ref]?.[field] ?? null,
    vars,
    ops,
});

const ev = (src, vars, declared) => evalExpr(src, ctx(vars), declared);
const str = (src, vars, declared) => exprToString(ev(src, vars, declared));

// ── 1. literals, precedence, associativity ────────────────────────────────────
{
    eq('math: precedence', ev('2 + 3 * 4'), 14);
    eq('math: parentheses', ev('(2 + 3) * 4'), 20);
    eq('math: left assoc', ev('10 - 3 - 2'), 5);
    eq('math: modulo', ev('10 % 3'), 1);
    eq('math: unary minus', ev('-5 + 2'), -3);
    eq('math: not', ev('!0'), true);
    eq('math: exponent literal', ev('1e3 + 1'), 1001);
    eq('math: float', ev('188.5 - 11.2'), 177.3);
    eq('literal: string', ev("'#00ff00'"), '#00ff00');
    eq('literal: true/false/null', [ev('true'), ev('false'), ev('null')], [true, false, null]);
    eq('string: concatenation', ev("'a' + 1"), 'a1');
}

// ── 2. comparison, logic, null handling ───────────────────────────────────────
{
    eq('cmp: less than', ev('1 < 2'), true);
    eq('cmp: loose equality across types', ev("1 == '1'"), true);
    eq('cmp: strict equality across types', ev("1 === '1'"), false);
    eq('logic: or short-circuits a null', ev('null || 0'), 0);
    eq('logic: and', ev('1 && 2'), 2);
    eq('logic: nullish keeps a zero', ev('0 ?? 5'), 0);
    eq('ternary', ev("1 < 2 ? 'ja' : 'nein'"), 'ja');
    eq('ternary: nested', ev('5 > 3 ? (2 > 1 ? 1 : 2) : 3'), 1);
}

// ── 3. datapoints ─────────────────────────────────────────────────────────────
{
    eq('dp: plain read', ev('0_userdata.0.Temperatur'), 21.4);
    eq('dp: arithmetic', ev('0_userdata.0.Temperatur * 2'), 42.8);
    eq('dp: numeric string is coerced', ev('0_userdata.0.Text * 2'), 35);
    eq('dp: unknown id is null', ev('0_userdata.0.Fehlt'), null);
    eq('dp: unknown id in arithmetic', ev('0_userdata.0.Fehlt || 0'), 0);
    eq('dp: bracket json path', ev("0_userdata.0.Akku['soc']"), 87);
    eq('dp: bracket index path', ev("0_userdata.0.Akku['cells'][1]"), 3.31);
    eq('dp: shelly id survives # and -', ev('shelly.0.SHSW-25#4C7525#1.Relay0.Switch === true'), true);
    eq('dp: .lc timestamp', ev('senec.0.ENERGY.GUI_INVERTER_POWER.lc'), +STAMP);
    eq('dp: .ts differs from .lc', ev('senec.0.ENERGY.GUI_INVERTER_POWER.ts'), 1_760_000_000_000);
}

// ── 4. lexing corner cases ────────────────────────────────────────────────────
{
    eq('lex: 0.5 is a number, not an id', ev('0.5 + 0.5'), 1);
    eq('lex: id may start with a digit', exprRefs('0_userdata.0.Temperatur + 1'), [
        { ref: '0_userdata.0.Temperatur', field: 'val' },
    ]);
    eq('lex: spaced minus is an operator', ev('0_userdata.0.Rot - 1'), 99);
    // Documented trade-off: without spaces the '-' belongs to the identifier, which
    // is what keeps Shelly ids whole.
    eq('lex: unspaced minus glues the identifier', ev('0_userdata.0.Rot-1'), null);
    check('lex: unterminated string does not parse', parseExpr("'abc") === null);
    check('lex: stray character does not parse', parseExpr('1 § 2') === null);
}

// ── 5. functions ──────────────────────────────────────────────────────────────
{
    eq('fn: Math.max', ev('Math.max(20, 5)'), 20);
    eq('fn: Math.min/max nested', ev('Math.min(Math.max(7, 0), 5)'), 5);
    eq('fn: Math.sqrt', ev('Math.sqrt(16)'), 4);
    eq('fn: Math.pow', ev('Math.pow(2, 10)'), 1024);
    eq('fn: bare round', ev('round(2.6)'), 3);
    eq('fn: Math.PI', Math.abs(ev('Math.PI') - Math.PI) < 1e-12, true);
    eq('fn: parseFloat on a string dp', ev('parseFloat(0_userdata.0.Text) + 1'), 18.5);
    eq('fn: hypotenuse, the vis README example', ev('Math.max(20, Math.sqrt(h * h + w * w))', { h: 3, w: 4 }), 20);
    eq('fn: hypotenuse, above the floor', ev('Math.max(20, Math.sqrt(h * h + w * w))', { h: 30, w: 40 }), 50);
    check('fn: unknown function does not parse', parseExpr('alert(1)') === null);
    check('fn: uncalled Math.min is not a datapoint', exprRefs('Math.min').length === 0);
    check('fn: no property escape', parseExpr('constructor.constructor') !== null); // parses…
    eq('fn: …but resolves to nothing', ev('constructor.constructor'), null); // …and reads as nothing
}

// ── 6. variables ──────────────────────────────────────────────────────────────
{
    eq('var: dp', ev('dp * 2', { dp: 21 }), 42);
    eq('var: json path into dp', ev('dp.a.b', { dp: { a: { b: 7 } } }), 7);
    eq('var: unknown name is null', ev('nixda'), null);
    eq('var: declared name wins over a state id', ev('h + 1', { h: 41 }, ['h']), 42);
    eq('var: specials', ev("view + '/' + wname", { view: 'Küche', wname: 'Ofen' }), 'Küche/Ofen');
    check('var: declared names are no subscriptions', exprRefs('h * w', ['h', 'w']).length === 0);
}

// ── 7. reference collection ───────────────────────────────────────────────────
{
    eq('refs: dedupe', exprRefs('0_userdata.0.Rot + 0_userdata.0.Rot'), [{ ref: '0_userdata.0.Rot', field: 'val' }]);
    eq('refs: bracket path folds into the ref', exprRefs("0_userdata.0.Akku['soc']"), [
        { ref: '0_userdata.0.Akku?soc', field: 'val' },
    ]);
    eq('refs: nested bracket path', exprRefs("0_userdata.0.Akku['cells'][1]"), [
        { ref: '0_userdata.0.Akku?cells.1', field: 'val' },
    ]);
    eq('refs: .lc keeps the base ref', exprRefs('senec.0.ENERGY.GUI_GRID_POW.lc'), [
        { ref: 'senec.0.ENERGY.GUI_GRID_POW', field: 'lc' },
    ]);
    eq('refs: inside a ternary', exprRefs("0_userdata.0.Rot < 0 ? 'a' : 0_userdata.0.Blau").length, 2);
    eq('refs: reserved vars are none', exprRefs('dp + color + unit'), []);
    eq('refs: broken source yields none', exprRefs('1 +'), []);
}

// ── 8. operations, piped ──────────────────────────────────────────────────────
{
    eq('op: round', str('senec.0.ENERGY.GUI_GRID_POW | round(0)'), '-1235');
    eq('op: round to 1 decimal', str('senec.0.ENERGY.GUI_GRID_POW | round(1)'), '-1234.6');
    eq('op: floor / ceil', [ev('2.7 | floor'), ev('2.1 | ceil')], [2, 3]);
    eq('op: multiply', ev('4 | *(4)'), 16);
    eq('op: divide then multiply', ev('100 | /(100) | *(255)'), 255);
    eq('op: sqrt', ev('16 | sqrt'), 4);
    eq('op: pow defaults to square', ev('3 | pow'), 9);
    eq('op: pow(n)', ev('2 | pow(10)'), 1024);
    // vis names these the other way round to Math: min() is the LOWER bound.
    eq('op: min is the lower bound', [ev('-5 | min(0)'), ev('7 | min(0)')], [0, 7]);
    eq('op: max is the upper bound', [ev('150 | max(100)'), ev('40 | max(100)')], [100, 40]);
    eq('op: chained clamp', ev('150 | min(0) | max(100)'), 100);
    eq(
        'op: hex family',
        [ev('255 | hex'), ev('12 | hex2'), ev('255 | HEX'), ev('12 | HEX2')],
        ['ff', '0c', 'FF', '0C'],
    );
    eq('op: formatValue is the localized one', ev('1234.56 | formatValue(1)'), '1.234,6');
    eq('op: formatValue falls back to the widget decimals', ev('1234.56 | formatValue'), '1.234,6');
    eq('op: fixed stays technical', ev('1234.56 | fixed(1)'), '1234.6');
    eq('op: default fills a missing value', str("0_userdata.0.Fehlt | default('–')"), '–');
    eq('op: default leaves a real value alone', ev("21.4 | default('–')"), 21.4);
    eq('op: upper / lower / trim', [ev("'ab' | upper"), ev("'AB' | lower"), ev("'  a  ' | trim")], ['AB', 'ab', 'a']);
    eq('op: bool', [ev("'true' | bool"), ev('0 | bool')], [true, false]);
    eq('op: json', ev('0_userdata.0.Objekt | json'), '{"a":{"b":7}}');
    eq('op: unreadable input renders as nothing', str("'abc' | round(1)"), '');
    check('op: unknown operation does not parse', parseExpr('1 | frobnicate') === null);
}

// ── 9. date formatting ────────────────────────────────────────────────────────
{
    const d = (fmt, extra = '') => str(`0_userdata.0.Zeit | date('${fmt}'${extra})`);
    const m = (fmt, extra = '') => str(`0_userdata.0.Zeit | momentDate('${fmt}'${extra})`);

    eq('date: aura tokens', d('dd.MM.yyyy HH:mm'), '22.08.2026 14:32');
    eq('date: vis tokens', d('YYYY-MM-DD hh:mm:ss'), '2026-08-22 14:32:07');
    eq('date: vis hh is 24-hour', d('hh:mm'), '14:32');
    eq('date: moment hh is 12-hour', m('hh:mm'), '02:32');
    eq('date: HH is always 24-hour', m('HH:mm'), '14:32');
    eq('date: milliseconds', d('ss.SSS'), '07.045');
    eq('date: weekday long', d('EEEE'), DAYS_LONG[STAMP.getDay()]);
    eq('date: moment weekday long', m('dddd'), DAYS_LONG[STAMP.getDay()]);
    eq('date: moment weekday short', m('ddd'), DAYS_SHORT[STAMP.getDay()]);
    eq('date: month name', d('MMMM'), MONTHS[STAMP.getMonth()]);
    eq('date: repeated token is replaced everywhere', d('mm:mm'), '32:32');
    eq('date: unreadable value renders as nothing', str("'keine zeit' | date('HH:mm')"), '');
    eq('date: default format', d('dd.MM.yyyy HH:mm'), '22.08.2026 14:32');

    // useTodayOrYesterday swaps the weekday name for a relative one.
    const today = new Date();
    today.setHours(8, 5, 0, 0);
    const yesterday = new Date(today.getTime() - 86_400_000);
    const relCtx = { resolveRaw: () => null, vars: { a: +today, b: +yesterday }, ops };
    eq('date: today', exprToString(evalExpr("a | momentDate('dddd HH:mm', true)", relCtx, ['a'])), 'Heute 08:05');
    eq('date: yesterday', exprToString(evalExpr("b | momentDate('dddd', true)", relCtx, ['b'])), 'Gestern');
    eq(
        'date: relative off keeps the weekday',
        exprToString(evalExpr("a | momentDate('dddd')", relCtx, ['a'])),
        DAYS_LONG[today.getDay()],
    );
}

// ── 10. output rendering ──────────────────────────────────────────────────────
{
    eq('out: float noise is trimmed', exprToString(0.1 + 0.2), '0.3');
    eq('out: decimal point, never a comma', str('188.5 - 11.2'), '177.3');
    eq('out: null renders as nothing', exprToString(null), '');
    eq('out: NaN renders as nothing', exprToString(NaN), '');
    eq('out: Infinity renders as nothing', exprToString(1 / 0), '');
    eq('out: boolean', [exprToString(true), exprToString(false)], ['true', 'false']);
    eq('out: object', exprToString({ a: 1 }), '{"a":1}');
    eq('out: big number keeps its digits', exprToString(1234567), '1234567');
}

// ── 11. limits ────────────────────────────────────────────────────────────────
{
    check('limit: over-long source does not parse', parseExpr(`1 + ${'1 + '.repeat(2000)}1`) === null);
    check('limit: deep nesting does not parse', parseExpr('('.repeat(60) + '1' + ')'.repeat(60)) === null);
    check('limit: shallow nesting still parses', parseExpr('('.repeat(10) + '1' + ')'.repeat(10)) !== null);
    check('limit: empty source does not parse', parseExpr('   ') === null);
    eq('limit: a broken expression evaluates to undefined', ev('1 +'), undefined);
}

// ── 12. the vis operation chain ───────────────────────────────────────────────
{
    const run = (source, parts) => exprToString(applyOpChain(source, parseOpChain(parts), ops));

    eq('chain: round(0)', run(-1234.56, ['round(0)']), '-1235');
    eq('chain: the vis colour recipe', run(100, ['/(100)', '*(255)', 'HEX2']), 'FF');
    eq('chain: three members', run(2, ['*(4)', '+(2)', 'round']), '10');
    eq('chain: unquoted date argument', run(+STAMP, ['date(hh:mm)']), '14:32');
    eq('chain: unquoted text argument', run(null, ['default(kein Wert)']), 'kein Wert');
    eq('chain: negative argument', run(0, ['-(-674.5)']), '674.5');
    check('chain: an unknown member rejects the whole chain', parseOpChain(['round(0)', 'nope']) === null);
    check('chain: a CSS-ish member is rejected', parseOpChain(['background: blue']) === null);
    check(
        'chain: every operation name is chainable',
        OP_NAMES.every((n) => parseOpChain([n]) !== null),
    );
}

// ── 13. the cases from issue #571 ─────────────────────────────────────────────
{
    const gauge = '188.5 - (188.5 * Math.min(Math.max(senec.0.ENERGY.GUI_INVERTER_POWER || 0, 0), 5000) / 5000)';
    eq('#571: gauge at 2500 W', str(gauge), '94.25');
    eq('#571: gauge at 0 W', exprToString(evalExpr(gauge, { resolveRaw: () => 0, vars: {}, ops })), '188.5');
    eq(
        '#571: gauge with no value at all',
        exprToString(evalExpr(gauge, { resolveRaw: () => null, vars: {}, ops })),
        '188.5',
    );
    eq('#571: colour by sign', str("senec.0.ENERGY.GUI_GRID_POW < 0 ? '#00ff00' : '#ff2c0a'"), '#00ff00');
    eq('#571: rounded grid power', str('senec.0.ENERGY.GUI_GRID_POW | round(0)'), '-1235');
}

// ── 14. the documentation recipes ─────────────────────────────────────────────
{
    eq(
        'recipe: percentage of two datapoints',
        str('round(0_userdata.0.Rot / (0_userdata.0.Rot + 0_userdata.0.Gruen) * 100)'),
        '33',
    );
    eq(
        'recipe: rgb from three datapoints',
        `#${str('0_userdata.0.Rot | HEX2')}${str('0_userdata.0.Gruen | HEX2')}${str('0_userdata.0.Blau | HEX2')}`,
        '#64C80C',
    );
    eq(
        'recipe: traffic light',
        str("0_userdata.0.Temperatur > 25 ? 'rot' : 0_userdata.0.Temperatur > 20 ? 'gelb' : 'gruen'"),
        'gelb',
    );
    eq('recipe: clamped progress bar', str('120 | min(0) | max(100)'), '100');
    eq('recipe: opacity from a percentage', str("Math.min(0_userdata.0.Akku['soc'] / 100, 1)"), '0.87');
    eq(
        'recipe: last change as a time',
        str("senec.0.ENERGY.GUI_GRID_POW.lc | date('HH:mm')"),
        `${String(STAMP.getHours()).padStart(2, '0')}:${String(STAMP.getMinutes()).padStart(2, '0')}`,
    );
    eq(
        'recipe: text from several datapoints',
        str("'Akku ' + (0_userdata.0.Akku['soc'] | formatValue(0)) + ' %'"),
        'Akku 87 %',
    );
    eq('recipe: bar height in an svg', str('180 - 180 * Math.min(0_userdata.0.Rot / 255, 1)'), '109.411764706');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
