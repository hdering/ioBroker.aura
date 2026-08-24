// Verifies the "Anzeige überschreiben" plumbing behind condition rules (issue #96)
// — utils/conditionSet.ts.
//
//   node tools/tests/condition-set.mjs
//
// No dev server needed: the module is pure (its only contact with the app types is
// an `import type`), so esbuild bundles it and the test drives it directly.
//
// The point of these cases is the write path. A widget renders from a *derived*
// config, and several widgets hand their config back through onConfigChange — so a
// rule that currently paints a different icon must never end up in the layout.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-condset-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            'export { applyConditionSet, stripRenderOverrides, conditionSetToOptions, isEmptySet, valueTextOverride }',
            "  from './src-vis/utils/conditionSet.ts';",
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
const { applyConditionSet, stripRenderOverrides, conditionSetToOptions, isEmptySet, valueTextOverride } = await import(
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

const raw = () => ({
    id: 'w1',
    type: 'value',
    title: 'Küche',
    datapoint: 'demo.x',
    gridPos: { x: 0, y: 0, w: 8, h: 4 },
    options: { icon: 'Thermometer', iconSize: 20, decimals: 1 },
});

// ── empty set ────────────────────────────────────────────────────────────────
check('isEmptySet: undefined', isEmptySet(undefined) === true);
check('isEmptySet: {}', isEmptySet({}) === true);
check('isEmptySet: all-undefined fields', isEmptySet({ icon: undefined }) === true);
check('isEmptySet: a real value', isEmptySet({ icon: 'Zap' }) === false);
eq('conditionSetToOptions: nothing to patch', conditionSetToOptions({}), null);

// ── apply ────────────────────────────────────────────────────────────────────
{
    const c = raw();
    // Identity matters: React bails out of re-rendering the body on it.
    check('apply: unchanged config keeps its identity', applyConditionSet(c, c.title, undefined) === c);
    check('apply: an empty set keeps the identity too', applyConditionSet(c, c.title, {}) === c);
}
{
    const c = raw();
    const out = applyConditionSet(c, c.title, { icon: 'AlertTriangle', iconSize: 40 });
    eq('apply: icon overridden', out.options.icon, 'AlertTriangle');
    eq('apply: size overridden', out.options.iconSize, 40);
    eq('apply: untouched options survive', out.options.decimals, 1);
    eq('apply: the stored config is not mutated', c.options.icon, 'Thermometer');
}
{
    const c = raw();
    // The caller resolves `set.title ?? config.title` through [[dp]] first, so the
    // rendered title arrives already substituted.
    const out = applyConditionSet(c, 'Alarm 21.5°', { title: 'Alarm [[demo.x]]°' });
    eq('apply: title comes from the rendered string', out.title, 'Alarm 21.5°');
}
{
    const c = raw();
    c.options.hideTitle = true;
    const out = applyConditionSet(c, 'Alarm', { title: 'Alarm' });
    eq('apply: hideTitle still wins over a title override', out.title, '');
}
{
    const c = raw();
    const out = applyConditionSet(c, c.title, { valueText: 'STÖRUNG', showIcon: false });
    eq('apply: value text lands on its option key', out.options.valueTextOverride, 'STÖRUNG');
    eq('apply: showIcon false is applied, not dropped as falsy', out.options.showIcon, false);
}

// ── strip (the write path) ───────────────────────────────────────────────────
{
    const c = raw();
    const derived = applyConditionSet(c, c.title, { icon: 'AlertTriangle', iconSize: 40 });
    // A widget that spreads what it was handed and changes one unrelated option.
    const written = { ...derived, options: { ...derived.options, decimals: 2 } };
    const out = stripRenderOverrides(written, c, derived);
    eq('strip: the overridden icon is restored', out.options.icon, 'Thermometer');
    eq('strip: the overridden size is restored', out.options.iconSize, 20);
    eq('strip: the widget’s own change survives', out.options.decimals, 2);
}
{
    const c = raw();
    const derived = applyConditionSet(c, c.title, { icon: 'AlertTriangle' });
    // The widget deliberately set the icon itself — that is not an override.
    const written = { ...derived, options: { ...derived.options, icon: 'Sun' } };
    const out = stripRenderOverrides(written, c, derived);
    eq('strip: a value the widget itself changed is left alone', out.options.icon, 'Sun');
}
{
    const c = raw();
    delete c.options.icon; // nothing stored — the override added the key
    const derived = applyConditionSet(c, c.title, { icon: 'AlertTriangle' });
    const out = stripRenderOverrides({ ...derived }, c, derived);
    check('strip: an added key is removed again, not blanked', !('icon' in out.options));
}
{
    const c = raw();
    const derived = applyConditionSet(c, 'Alarm', { title: 'Alarm' });
    const out = stripRenderOverrides({ ...derived }, c, derived);
    eq('strip: the raw title comes back', out.title, 'Küche');
}
{
    const c = raw();
    // Same shape the [[dp]] substitution produces without any condition at all.
    const derived = applyConditionSet(c, 'Küche 21.5°', undefined);
    const out = stripRenderOverrides({ ...derived }, c, derived);
    eq('strip: a resolved [[dp]] title is not persisted either', out.title, 'Küche');
}
{
    const c = raw();
    check('strip: nothing derived means nothing to undo', stripRenderOverrides(c, c, c) === c);
}

// ── reader ───────────────────────────────────────────────────────────────────
eq('valueTextOverride: unset', valueTextOverride(raw()), undefined);
eq(
    'valueTextOverride: empty string counts as unset',
    valueTextOverride({ options: { valueTextOverride: '' } }),
    undefined,
);
eq('valueTextOverride: set', valueTextOverride({ options: { valueTextOverride: 'OFFLINE' } }), 'OFFLINE');

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
