// Verifies the row-condition engine behind the list widgets (issue #572)
// — utils/rowConditions.ts.
//
//   node tools/tests/row-conditions.mjs
//
// No dev server needed: the module is pure, so esbuild bundles it and the test
// drives it directly.
//
// The cases that matter are the two placeholder syntaxes ({dp} is a VALUE,
// {{parent}} is an ID), the precedence between list-wide and per-entry rules, and
// what a row-level effect does and does not hand down to the row's parts.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-rowcond-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            'export { resolveRuleRefs, ruleForeignRefs, evalRowRules, partOf, rowHidden, isOwnRef, condAnimation, ELEMENT_TARGETS }',
            "  from './src-vis/utils/rowConditions.ts';",
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
const { resolveRuleRefs, ruleForeignRefs, evalRowRules, partOf, rowHidden, isOwnRef, condAnimation, ELEMENT_TARGETS } =
    await import(pathToFileURL(bundle).href);
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

const ROW = 'hm-rpc.0.Thermostat.ACTUAL_TEMPERATURE';
const clause = (datapoint, operator, value = '', extra = {}) => ({ datapoint, operator, value, ...extra });
const rule = (id, clauses, effects = {}) => ({ id, logic: 'AND', clauses, ...effects });
const noValues = new Map();

// ── own-value refs ───────────────────────────────────────────────────────────
check('isOwnRef: empty field', isOwnRef('', ROW) === true);
check('isOwnRef: {dp} token', isOwnRef('{dp}', ROW) === true);
check('isOwnRef: the row datapoint itself', isOwnRef(ROW, ROW) === true);
check('isOwnRef: a neighbour', isOwnRef('hm-rpc.0.Thermostat.UNREACH', ROW) === false);

// ── {{parent}} resolution ────────────────────────────────────────────────────
{
    const rules = [rule('r', [clause('{{parent}}.UNREACH', 'true')])];
    const out = resolveRuleRefs(rules, ROW);
    eq('resolve: {{parent}} becomes the neighbour id', out[0].clauses[0].datapoint, 'hm-rpc.0.Thermostat.UNREACH');
    eq('resolve: the stored rule is untouched', rules[0].clauses[0].datapoint, '{{parent}}.UNREACH');
}
{
    const out = resolveRuleRefs([rule('r', [clause('{{dp}}', '>', '20')])], ROW);
    eq('resolve: {{dp}} becomes the row id', out[0].clauses[0].datapoint, ROW);
}
{
    const out = resolveRuleRefs([rule('r', [clause('shared.0.Outside', '>', '20')])], ROW);
    eq('resolve: an absolute id passes through', out[0].clauses[0].datapoint, 'shared.0.Outside');
}
{
    // {dp} is the VALUE token of the condition layer and must survive untouched.
    const out = resolveRuleRefs([rule('r', [clause('{dp}', '>', '20')])], ROW);
    eq('resolve: single-brace {dp} is not a template token', out[0].clauses[0].datapoint, '{dp}');
}
{
    // A top-level datapoint has no parent strang — the rule cannot mean anything here.
    const out = resolveRuleRefs([rule('r', [clause('{{parent}}.UNREACH', 'true')])], 'toplevel');
    eq('resolve: a rule that stays unresolved is dropped for this row', out.length, 0);
}
{
    const out = resolveRuleRefs(
        [rule('r', [clause('{dp}', '>', '{{parent}}.SETPOINT', { valueType: 'datapoint' })])],
        ROW,
    );
    eq('resolve: the compare side is templated too', out[0].clauses[0].value, 'hm-rpc.0.Thermostat.SETPOINT');
}

// ── subscriptions ────────────────────────────────────────────────────────────
{
    const rules = resolveRuleRefs(
        [
            rule('a', [clause('{dp}', '>', '20')]),
            rule('b', [clause('{{parent}}.UNREACH', 'true')]),
            rule('c', [clause('{dp}', '>', '{{parent}}.SETPOINT', { valueType: 'datapoint' })]),
            rule('d', [clause('{{parent}}.UNREACH', 'false')]),
        ],
        ROW,
    );
    eq('foreign refs: own value excluded, duplicates collapsed', ruleForeignRefs(rules, ROW).sort(), [
        'hm-rpc.0.Thermostat.SETPOINT',
        'hm-rpc.0.Thermostat.UNREACH',
    ]);
}

// ── evaluation ───────────────────────────────────────────────────────────────
{
    const rules = [rule('r', [clause('{dp}', '>', '25')], { target: 'value', color: '#f00' })];
    eq('eval: own value above threshold', evalRowRules(rules, ROW, 30, noValues).value?.color, '#f00');
    eq('eval: own value below threshold', evalRowRules(rules, ROW, 20, noValues).value, undefined);
}
{
    const values = new Map([['hm-rpc.0.Thermostat.UNREACH', true]]);
    const rules = resolveRuleRefs(
        [rule('r', [clause('{{parent}}.UNREACH', 'true')], { target: 'icon', icon: 'CloudOff' })],
        ROW,
    );
    eq('eval: a neighbour datapoint drives the icon', evalRowRules(rules, ROW, 21, values).icon?.icon, 'CloudOff');
}
{
    // The compare value points back at the row's own datapoint.
    const rules = resolveRuleRefs(
        [rule('r', [clause('{{parent}}.SETPOINT', '>', '{dp}', { valueType: 'datapoint' })], { color: '#00f' })],
        ROW,
    );
    const values = new Map([['hm-rpc.0.Thermostat.SETPOINT', 24]]);
    eq('eval: compare against the own value (heating)', evalRowRules(rules, ROW, 21, values).row?.color, '#00f');
    eq('eval: compare against the own value (at target)', evalRowRules(rules, ROW, 25, values).row, undefined);
}
{
    const rules = [
        rule('a', [clause('{dp}', 'true')], { logic: 'OR', target: 'value', text: 'ONLINE', color: '#0f0' }),
        rule('b', [clause('{dp}', 'false')], { logic: 'OR', target: 'value', text: 'OFFLINE', color: '#f00' }),
    ];
    const onVal = evalRowRules(rules, ROW, true, noValues).value;
    const offVal = evalRowRules(rules, ROW, false, noValues).value;
    eq('eval: value mapping true', [onVal.text, onVal.color], ['ONLINE', '#0f0']);
    eq('eval: value mapping false', [offVal.text, offVal.color], ['OFFLINE', '#f00']);
}

// ── precedence ───────────────────────────────────────────────────────────────
{
    // List-wide first, entry-specific after — the entry wins per field, and a field
    // only the list-wide rule sets survives.
    const listWide = rule('lw', [clause('{dp}', 'active')], { target: 'value', color: '#111', bold: true });
    const entry = rule('e', [clause('{dp}', 'active')], { target: 'value', color: '#222' });
    const res = evalRowRules([listWide, entry], ROW, 1, noValues);
    eq('precedence: the entry rule wins the shared field', res.value?.color, '#222');
    eq('precedence: the list-wide field survives', res.value?.bold, true);
}
{
    const res = evalRowRules(
        [rule('a', [clause('{dp}', 'active')], { hide: true }), rule('b', [clause('{dp}', 'active')], { hide: false })],
        ROW,
        1,
        noValues,
    );
    check('precedence: hiding is absorbing', rowHidden(res) === true);
}

// ── row effects vs. part effects ─────────────────────────────────────────────
{
    const res = evalRowRules([rule('r', [clause('{dp}', 'active')], { color: '#abc', bg: '#def' })], ROW, 1, noValues);
    eq('partOf: the row colour reaches the name', partOf(res, 'name').color, '#abc');
    eq('partOf: the row colour reaches the value', partOf(res, 'value').color, '#abc');
    eq('partOf: the row background stays on the row', partOf(res, 'name').bg, undefined);
    eq('partOf: the row background is readable on the row', res.row?.bg, '#def');
}
{
    const res = evalRowRules(
        [
            rule('a', [clause('{dp}', 'active')], { color: '#abc' }),
            rule('b', [clause('{dp}', 'active')], { target: 'value', color: '#123' }),
        ],
        ROW,
        1,
        noValues,
    );
    eq('partOf: a part-specific colour beats the row colour', partOf(res, 'value').color, '#123');
    eq('partOf: the other parts keep the row colour', partOf(res, 'name').color, '#abc');
}
{
    const res = evalRowRules([rule('r', [clause('{dp}', 'active')], { hide: true })], ROW, 1, noValues);
    check('partOf: hiding the row does not blank its name', partOf(res, 'name').hide === undefined);
}
{
    const res = evalRowRules(
        [rule('r', [clause('{dp}', 'active')], { icon: 'Zap', iconColor: '#ff0' })],
        ROW,
        1,
        noValues,
    );
    eq('partOf: a row icon reaches the icon part', partOf(res, 'icon').icon, 'Zap');
    eq('partOf: a row icon colour reaches the icon part', partOf(res, 'icon').iconColor, '#ff0');
    eq('partOf: the icon does not leak into the name', partOf(res, 'name').icon, undefined);
}

// ── icon size ────────────────────────────────────────────────────────────────
{
    // A size without an icon override is legal: it resizes whatever the row shows.
    const res = evalRowRules(
        [rule('r', [clause('{dp}', 'active')], { target: 'icon', iconSize: 28 })],
        ROW,
        1,
        noValues,
    );
    eq('iconSize: an icon rule carries the size', res.icon?.iconSize, 28);
    eq('iconSize: nothing else is touched', res.icon?.icon, undefined);
}
{
    const res = evalRowRules([rule('r', [clause('{dp}', 'active')], { icon: 'Zap', iconSize: 22 })], ROW, 1, noValues);
    eq('iconSize: a row rule reaches the icon part', partOf(res, 'icon').iconSize, 22);
    eq('iconSize: the size does not leak into the name', partOf(res, 'name').iconSize, undefined);
}
{
    const res = evalRowRules(
        [
            rule('lw', [clause('{dp}', 'active')], { target: 'icon', iconSize: 16, iconColor: '#f00' }),
            rule('e', [clause('{dp}', 'active')], { target: 'icon', iconSize: 32 }),
        ],
        ROW,
        1,
        noValues,
    );
    eq('iconSize: the later rule wins', res.icon?.iconSize, 32);
    eq('iconSize: the colour of the earlier rule survives', res.icon?.iconColor, '#f00');
}

// ── text size ────────────────────────────────────────────────────────────────
{
    const res = evalRowRules([rule('r', [clause('{dp}', 'active')], { fontSize: 18 })], ROW, 1, noValues);
    eq('fontSize: a row rule carries the size', res.row?.fontSize, 18);
    eq('fontSize: the row size reaches the name', partOf(res, 'name').fontSize, 18);
    eq('fontSize: the row size reaches the value', partOf(res, 'value').fontSize, 18);
}
{
    const res = evalRowRules(
        [
            rule('a', [clause('{dp}', 'active')], { fontSize: 12 }),
            rule('b', [clause('{dp}', 'active')], { target: 'value', fontSize: 24 }),
        ],
        ROW,
        1,
        noValues,
    );
    eq('fontSize: a part-specific size beats the row size', partOf(res, 'value').fontSize, 24);
    eq('fontSize: the other parts keep the row size', partOf(res, 'name').fontSize, 12);
}
{
    // Size and icon size are separate fields — one must not stand in for the other.
    const res = evalRowRules(
        [rule('r', [clause('{dp}', 'active')], { target: 'name', fontSize: 20 })],
        ROW,
        1,
        noValues,
    );
    eq('fontSize: the text size is not an icon size', res.name?.iconSize, undefined);
    eq('fontSize: nothing else is touched', res.name?.color, undefined);
}

// ── pulse / blink, the effects the widget level always had ──────────────────
{
    const res = evalRowRules([rule('r', [clause('{dp}', 'active')], { effect: 'blink' })], ROW, 1, noValues);
    eq('effect: stored on the row', res.row?.effect, 'blink');
    eq('effect: reaches the parts', partOf(res, 'value').effect, 'blink');
    eq('effect: becomes an animation', condAnimation(partOf(res, 'value')), 'blink 1s step-end infinite');
}
{
    const res = evalRowRules(
        [rule('r', [clause('{dp}', 'active')], { target: 'icon', effect: 'pulse' })],
        ROW,
        1,
        noValues,
    );
    eq('effect: pulse on one part only', condAnimation(res.icon), 'auraCondPulse 1.5s ease-in-out infinite');
    eq('effect: the other parts stay still', condAnimation(partOf(res, 'name')), undefined);
}
{
    const res = evalRowRules([rule('r', [clause('{dp}', 'active')], { effect: 'none' })], ROW, 1, noValues);
    eq('effect: "none" is not an effect', res.row?.effect, undefined);
}
eq('effect: nothing matched, nothing animates', condAnimation(undefined), undefined);

eq('targets', ELEMENT_TARGETS, ['row', 'name', 'value', 'icon']);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
