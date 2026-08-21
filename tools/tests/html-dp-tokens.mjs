// Verifies the datapoint placeholders of free HTML (HTML widget content, value
// widget template): `{state.id}`, the reserved `{dp}`, and the three JSON-path
// spellings `?path` / `#path` / `}#path`.
//
//   node tools/tests/html-dp-tokens.mjs
//
// No dev server needed: extractTemplateDpRefs/renderTemplate are pure, so the util
// is bundled with esbuild and exercised directly. The interesting part is what must
// NOT be touched — inline CSS braces and adapter ids that carry a '#' themselves.
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
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

// Live values keyed by the canonical ref extractTemplateDpRefs returns.
const VALUES = {
    '0_userdata.0.Temperatur': '21.4',
    '0_userdata.0.Akku?soc': '87',
    '0_userdata.0.Akku?cells[1]': '3.31',
    'shelly.0.SHSW-25#4C7525#1.Relay0.Switch': 'true',
};
const OWN = { temperature: 21.4, battery: { soc: 87 } };

const render = (tpl, vars = { dp: '42' }) =>
    renderTemplate(
        tpl,
        vars,
        (ref) => VALUES[ref] ?? '–',
        (name, path) => {
            if (name !== 'dp') {
                return '–';
            }
            let cur = OWN;
            for (const seg of path.replace(/\[(\d+)\]/g, '.$1').split('.')) {
                cur = cur?.[seg];
            }
            return cur === undefined || cur === null ? '–' : String(cur);
        },
    );

// ── 1. Plain state id ──
{
    eq('extract: plain id', extractTemplateDpRefs('<b>{0_userdata.0.Temperatur}</b> °C'), ['0_userdata.0.Temperatur']);
    eq('render: plain id', render('<b>{0_userdata.0.Temperatur}</b> °C'), '<b>21.4</b> °C');
    eq('render: unknown id shows the dash', render('{0_userdata.0.Fehlt}'), '–');
}

// ── 2. JSON path: all three spellings address the same ref ──
{
    for (const tpl of ['{0_userdata.0.Akku?soc}', '{0_userdata.0.Akku#soc}', '{0_userdata.0.Akku}#soc']) {
        eq(`extract: ${tpl}`, extractTemplateDpRefs(tpl), ['0_userdata.0.Akku?soc']);
        eq(`render: ${tpl}`, render(tpl), '87');
    }
    eq('render: bracket index path', render('{0_userdata.0.Akku}#cells[1]'), '3.31');
}

// ── 3. Reserved {dp}, with and without a path ──
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

// ── 4. Nothing else in the markup may be rewritten ──
{
    const css = '<style>.x { color: red; font-size: 2em }</style>{0_userdata.0.Temperatur}';
    eq('render: inline CSS survives', render(css), '<style>.x { color: red; font-size: 2em }</style>21.4');
    eq('extract: CSS braces are no refs', extractTemplateDpRefs('.x { color: red }'), []);
    eq('render: unknown var stays verbatim', render('{foo}'), '{foo}');
    eq('render: single word is no id', extractTemplateDpRefs('{einwort}').length, 0);
    // A '#' tail that is not a path is left alone — the token still resolves.
    eq('render: {dp}#Anchor keeps the tail', render('<a href="{dp}#TOP">x</a>'), '<a href="42#TOP">x</a>');
}

// ── 5. Ids that legitimately carry a '#' (Shelly) keep working ──
{
    const id = 'shelly.0.SHSW-25#4C7525#1.Relay0.Switch';
    eq('extract: shelly id stays whole', extractTemplateDpRefs(`{${id}}`), [id]);
    eq('render: shelly id resolves', render(`{${id}}`), 'true');
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
