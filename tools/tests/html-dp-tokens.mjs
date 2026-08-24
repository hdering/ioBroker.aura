// Verifies the datapoint bindings of free HTML (HTML widget content, value widget
// template): the plain `{state.id}` / `{dp}` tokens with their three JSON-path
// spellings, the vis operation chain `{id;round(1)}`, the vis named-variable form
// `{a:id;b:id2;expr}` and aura's `{{ expression }}`.
//
//   node tools/tests/html-dp-tokens.mjs
//
// No dev server needed: extractTemplateDpRefs/renderTemplate are pure, so the util is
// bundled with esbuild and exercised directly. The interesting part is what must NOT
// be touched — inline CSS, popup placeholders and adapter ids that carry a '#'.
//
// The expression language itself lives in tools/tests/expr.mjs.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-html-dp-tokens-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { extractTemplateDpRefs, renderTemplate } from './src-vis/utils/htmlTemplate.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { extractTemplateDpRefs, renderTemplate } = await import(pathToFileURL(bundle).href);
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

// ── the world the templates see ───────────────────────────────────────────────

const STAMP = new Date(2026, 7, 22, 14, 32, 7);

// Live states keyed by the canonical ref extractTemplateDpRefs returns.
const STATES = {
    '0_userdata.0.Temperatur': { val: 21.4, ts: +STAMP, lc: +STAMP },
    '0_userdata.0.Akku?soc': { val: 87, ts: 0, lc: 0 },
    '0_userdata.0.Akku?cells[1]': { val: 3.31, ts: 0, lc: 0 },
    '0_userdata.0.Akku?cells.1': { val: 3.31, ts: 0, lc: 0 },
    '0_userdata.0.Hoehe': { val: 3, ts: 0, lc: 0 },
    '0_userdata.0.Breite': { val: 4, ts: 0, lc: 0 },
    '0_userdata.0.Rot': { val: 100, ts: 0, lc: 0 },
    '0_userdata.0.Gruen': { val: 200, ts: 0, lc: 0 },
    '0_userdata.0.Blau': { val: 12, ts: 0, lc: 0 },
    '0_userdata.0.Netz': { val: -1234.56, ts: 0, lc: 0 },
    'shelly.0.SHSW-25#4C7525#1.Relay0.Switch': { val: true, ts: 0, lc: 0 },
};
const OWN = { temperature: 21.4, battery: { soc: 87 } };

const formatNum = (value, decimals) => {
    const base = decimals === 0 ? String(Math.round(value)) : value.toFixed(decimals);
    const sign = base.startsWith('-') ? '-' : '';
    const [int, frac] = (sign ? base.slice(1) : base).split('.');
    return sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (frac ? `,${frac}` : '');
};
const t = (key) => key;

const fmt = (v) => (v === null || v === undefined ? '–' : String(v));

/** The context both widgets build — display formatting for `{id}`, raw values for
 *  everything that calculates. */
const context = (vars = { dp: '42' }, rawVars = { dp: OWN }) => ({
    vars,
    resolve: (ref) => fmt(STATES[ref]?.val),
    resolveVarPath: (name, path) => {
        if (name !== 'dp') return '–';
        let cur = OWN;
        for (const seg of path.replace(/\[(\d+)\]/g, '.$1').split('.')) cur = cur?.[seg];
        return cur === undefined || cur === null ? '–' : String(cur);
    },
    resolveRaw: (ref, field) => STATES[ref]?.[field] ?? null,
    rawVars,
    ops: { formatNum, decimals: 1, t },
});

const render = (tpl, vars, rawVars) => renderTemplate(tpl, context(vars, rawVars));
/** Same template without the calculating half of the context. */
const renderPlain = (tpl) =>
    renderTemplate(tpl, {
        vars: { dp: '42' },
        resolve: (ref) => fmt(STATES[ref]?.val),
    });

// ── 1. plain state id ─────────────────────────────────────────────────────────
{
    eq('extract: plain id', extractTemplateDpRefs('<b>{0_userdata.0.Temperatur}</b> °C'), ['0_userdata.0.Temperatur']);
    eq('render: plain id', render('<b>{0_userdata.0.Temperatur}</b> °C'), '<b>21.4</b> °C');
    eq('render: unknown id shows the dash', render('{0_userdata.0.Fehlt}'), '–');
}

// ── 2. JSON path: all three spellings address the same ref ────────────────────
{
    for (const tpl of ['{0_userdata.0.Akku?soc}', '{0_userdata.0.Akku#soc}', '{0_userdata.0.Akku}#soc']) {
        eq(`extract: ${tpl}`, extractTemplateDpRefs(tpl), ['0_userdata.0.Akku?soc']);
        eq(`render: ${tpl}`, render(tpl), '87');
    }
    eq('render: bracket index path', render('{0_userdata.0.Akku}#cells[1]'), '3.31');
}

// ── 3. reserved {dp}, with and without a path ─────────────────────────────────
{
    eq('extract: {dp} is not a datapoint ref', extractTemplateDpRefs('{dp} {dp}#battery.soc'), []);
    eq('render: {dp}', render('Wert: {dp}'), 'Wert: 42');
    eq('render: {dp}#battery.soc', render('{dp}#battery.soc %'), '87 %');
    eq('render: {dp}#temperature', render('{dp}#temperature'), '21.4');
    eq('render: {dp}#missing.path', render('{dp}#nichts.da'), '–');
    // Without a main datapoint the widget passes no vars — the token stays visible
    // instead of silently rendering an empty string.
    eq('render: {dp} without vars stays verbatim', render('{dp}', {}), '{dp}');
    eq('render: {dp}#path without vars stays verbatim', render('{dp}#battery.soc', {}), '{dp}#battery.soc');
}

// ── 4. nothing else in the markup may be rewritten ────────────────────────────
{
    const css = '<style>.x { color: red; font-size: 2em }</style>{0_userdata.0.Temperatur}';
    eq('render: inline CSS survives', render(css), '<style>.x { color: red; font-size: 2em }</style>21.4');
    eq('extract: CSS braces are no refs', extractTemplateDpRefs('.x { color: red }'), []);
    eq('render: unknown var stays verbatim', render('{foo}'), '{foo}');
    eq('render: single word is no id', extractTemplateDpRefs('{einwort}').length, 0);
    // A '#' tail that is not a path is left alone — the token still resolves.
    eq('render: {dp}#Anchor keeps the tail', render('<a href="{dp}#TOP">x</a>'), '<a href="42#TOP">x</a>');
}

// ── 5. ids that legitimately carry a '#' (Shelly) keep working ────────────────
{
    const id = 'shelly.0.SHSW-25#4C7525#1.Relay0.Switch';
    eq('extract: shelly id stays whole', extractTemplateDpRefs(`{${id}}`), [id]);
    eq('render: shelly id resolves', render(`{${id}}`), 'true');
    eq('render: shelly id in a chain', render(`{${id};bool}`), 'true');
}

// ── 6. the vis operation chain ────────────────────────────────────────────────
{
    eq('chain: extract collects the source', extractTemplateDpRefs('{0_userdata.0.Netz;round(0)}'), [
        '0_userdata.0.Netz',
    ]);
    eq('chain: round', render('{0_userdata.0.Netz;round(0)}'), '-1235');
    eq('chain: formatValue is localized', render('{0_userdata.0.Netz;formatValue(1)}'), '-1.234,6');
    eq('chain: on the reserved {dp}', render('{dp;round(0)}', { dp: '42' }, { dp: 21.6 }), '22');
    eq(
        'chain: the vis colour recipe',
        render('#{0_userdata.0.Rot;HEX2}{0_userdata.0.Gruen;HEX2}{0_userdata.0.Blau;HEX2}'),
        '#64C80C',
    );
    eq('chain: scaling before hex', render('{0_userdata.0.Rot;/(100);*(255);HEX2}'), 'FF');
    eq('chain: json path plus operation', render('{0_userdata.0.Akku?soc;formatValue(0)}'), '87');
    eq('chain: unquoted date argument on .lc', render('{0_userdata.0.Temperatur.lc;date(hh:mm)}'), '14:32');
    eq('chain: .lc needs no extra subscription', extractTemplateDpRefs('{0_userdata.0.Temperatur.lc;date(hh:mm)}'), [
        '0_userdata.0.Temperatur',
    ]);
    eq(
        'chain: unknown operation stays verbatim',
        render('{0_userdata.0.Netz;frobnicate}'),
        '{0_userdata.0.Netz;frobnicate}',
    );
}

// ── 7. the vis named-variable form ────────────────────────────────────────────
{
    const hypot = '{h:0_userdata.0.Hoehe;w:0_userdata.0.Breite;Math.max(20, Math.sqrt(h * h + w * w))}';
    eq('vars: extract collects both declarations', extractTemplateDpRefs(hypot).sort(), [
        '0_userdata.0.Breite',
        '0_userdata.0.Hoehe',
    ]);
    eq('vars: the vis README example', render(hypot), '20');
    eq('vars: simple product', render('{h:0_userdata.0.Hoehe;w:0_userdata.0.Breite;h * w}'), '12');
    // The expression is the last block and is never split on ':', so a conditional
    // needs no '::' escape — unlike in vis.
    eq('vars: ternary without an escape', render("{g:0_userdata.0.Netz;g < 0 ? '#00ff00' : '#ff2c0a'}"), '#00ff00');
    eq('vars: the :: escape is still accepted', render("{g:0_userdata.0.Netz;g < 0 ? 'a::b' : 'c'}"), 'a:b');
    eq('vars: a declaration may point at {dp}', render('{v:dp;v * 2}', { dp: '42' }, { dp: 21 }), '42');
    eq('vars: declarations alone stay verbatim', render('{h:0_userdata.0.Hoehe}'), '{h:0_userdata.0.Hoehe}');
    eq(
        'vars: an unparsable expression stays verbatim',
        render('{h:0_userdata.0.Hoehe;h +}'),
        '{h:0_userdata.0.Hoehe;h +}',
    );
}

// ── 8. aura's {{ expression }} ────────────────────────────────────────────────
{
    eq('expr: extract collects inline ids', extractTemplateDpRefs('{{ 0_userdata.0.Temperatur * 2 }}'), [
        '0_userdata.0.Temperatur',
    ]);
    eq('expr: arithmetic', render('{{ 0_userdata.0.Temperatur * 2 }}'), '42.8');
    eq('expr: reserved var with spaces', render('{{ dp }}', { dp: '42' }, { dp: 7 }), '7');
    eq('expr: conditional colour', render("{{ 0_userdata.0.Netz < 0 ? '#00ff00' : '#ff2c0a' }}"), '#00ff00');
    eq('expr: pipe', render('{{ 0_userdata.0.Netz | round(0) }}'), '-1235');
    eq('expr: several per template', render('{{ 1 + 1 }}/{{ 2 + 2 }}'), '2/4');
    eq('expr: multiline body', render('{{\n  1 +\n  1\n}}'), '2');
    eq('expr: broken body stays verbatim', render('{{ 1 + }}'), '{{ 1 + }}');
    eq('expr: unknown function stays verbatim', render('{{ alert(1) }}'), '{{ alert(1) }}');
    eq('expr: missing value renders as nothing', render('[{{ 0_userdata.0.Fehlt }}]'), '[]');
    eq(
        'expr: the issue #571 gauge',
        render('{{ 188.5 - 188.5 * Math.min(0_userdata.0.Rot / 255, 1) }}'),
        '114.578431373',
    );

    // The popup placeholder layer owns bare words in double braces.
    eq('expr: {{parent}} belongs to the popup layer', render('{{parent}}'), '{{parent}}');
    eq('expr: {{dp}} belongs to the popup layer', render('{{dp}}'), '{{dp}}');
    eq('expr: popup tokens are no refs', extractTemplateDpRefs('{{parent}} {{dp}}'), []);

    // Without raw values there is nothing sensible to compute on.
    eq('expr: no raw context leaves the token alone', renderPlain('{{ 1 + 1 }}'), '{{ 1 + 1 }}');
    eq(
        'chain: no raw context leaves the token alone',
        renderPlain('{0_userdata.0.Netz;round(0)}'),
        '{0_userdata.0.Netz;round(0)}',
    );
}

// ── 9. CSS regression list — none of these may change ─────────────────────────
{
    const untouched = [
        '{ color: red }',
        '{color:red;background:blue}',
        '{margin:0;padding:0}',
        '{ font: 12px/1.4 sans-serif; color: #333 }',
        '{ transition: all 0.3s ease; opacity: 1 }',
        '.a{color:red}.b{color:blue}',
        '@media (max-width:600px){.x{display:none}}',
        '<style>\n.k {\n  color: red;\n  background: blue;\n}\n</style>',
        '{background:url.0.png;border:0}',
        '{grid-template-columns:1fr 2fr;gap:4px}',
    ];
    for (const css of untouched) {
        eq(`css untouched: ${css.slice(0, 44)}`, render(css), css);
        eq(`css has no refs: ${css.slice(0, 44)}`, extractTemplateDpRefs(css), []);
    }
    // Minified CSS ends in '}}' without ever opening a '{{'.
    eq(
        'css: closing }} without {{',
        render('@media(min-width:1px){.a{color:red}}'),
        '@media(min-width:1px){.a{color:red}}',
    );
}

// ── 10. a whole widget body ───────────────────────────────────────────────────
{
    const tpl = [
        '<svg viewBox="0 0 200 200">',
        '  <rect y="{{ 180 - 180 * Math.min(0_userdata.0.Rot / 255, 1) }}" height="10"',
        "        fill=\"{{ 0_userdata.0.Netz < 0 ? '#00ff00' : '#ff2c0a' }}\" />",
        '  <text x="4" y="196" style="font: 12px sans-serif">{0_userdata.0.Netz;round(0)} W</text>',
        '</svg>',
    ].join('\n');
    eq('body: subscribes to both datapoints', extractTemplateDpRefs(tpl).sort(), [
        '0_userdata.0.Netz',
        '0_userdata.0.Rot',
    ]);
    const out = render(tpl);
    check('body: bar position computed', out.includes('y="109.411764706"'), out);
    check('body: colour computed', out.includes('fill="#00ff00"'), out);
    check('body: chain rendered', out.includes('>-1235 W<'), out);
    check('body: inline style untouched', out.includes('style="font: 12px sans-serif"'), out);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) {
        console.log(`  - ${f.name}: ${f.detail}`);
    }
    process.exit(1);
}
