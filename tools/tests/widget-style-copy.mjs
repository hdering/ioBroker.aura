// "Stil kopieren / Stil einfügen" (issue #654): which option keys count as
// presentation, and what a paste does to the target widget.
//
//   node tools/tests/widget-style-copy.mjs
//
// No dev server needed — utils/widgetStyle.ts is pure classification and is
// bundled with esbuild. The last block walks the shipped widget schema, so a new
// option that lands on the wrong side of the split shows up here.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-widget-style-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/widgetStyle.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { isStyleOptionKey, extractWidgetStyle, applyWidgetStyle, canApplyWidgetStyle, countStyleChanges } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });
const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

// ── 1. What counts as style ──
for (const key of [
    'showTitle',
    'echartShowLegend',
    'hideScrollbar',
    'titleColor',
    'zone1Color',
    'valueFontSize',
    'rowPopupWidth',
    'chipsCorner',
    'fontScale',
    'transparent',
    'styleOverride',
    'colorThresholds',
    'decimals',
    'valign',
]) {
    ok(`${key} is style`, isStyleOptionKey(key));
}

// ── 2. What must never travel with a style ──
for (const key of [
    'datapoint',
    'switchDp',
    'actualDatapoint',
    'batteryDp',
    'defId', // group children — a shared defId would clone the whole group
    'targetWidgetId',
    'fullscreenWidget',
    'presetId',
    'url',
    'iframeUrl',
    'streamUrl',
    'htmlTemplate',
    'onValue',
    'offValue',
    'unit',
    'valueFactor',
    'valueOffset',
    'min',
    'max',
    'step',
    'customGrid',
    'conditions',
    'badges',
    'clickAction',
    'entries',
    'echartSeries',
]) {
    ok(`${key} is not style`, !isStyleOptionKey(key));
}

// ── 3. Pattern false positives that had to be named explicitly ──
for (const key of ['icon', 'baseIcon', 'binSize', 'listBinSize', 'bufferSize', 'invertPosition']) {
    ok(`${key} is kept out although a pattern matches`, !isStyleOptionKey(key));
}
ok('iconSize stays style next to icon', isStyleOptionKey('iconSize'));
ok('trueIcon stays style — it draws a state, not the device', isStyleOptionKey('trueIcon'));

// ── 4. Copying ──
const source = {
    id: 'w1',
    type: 'value',
    title: 'Küche',
    datapoint: '0_userdata.0.Kueche.Temp',
    gridPos: { x: 0, y: 0, w: 8, h: 4 },
    layout: 'compact',
    options: {
        showTitle: false,
        titleColor: '#ff0000',
        valueFontSize: 32,
        transparent: true,
        styleOverride: { '--accent': '#0f0' },
        unit: '°C',
        batteryDp: 'x.battery',
        url: 'https://example.invalid',
    },
};
const style = extractWidgetStyle(source);
eq('only style keys land on the clipboard', Object.keys(style.options).sort(), [
    'showTitle',
    'styleOverride',
    'titleColor',
    'transparent',
    'valueFontSize',
]);
eq('the layout travels', style.layout, 'compact');
eq('the source label is the title', style.sourceLabel, 'Küche');
eq(
    'a widget without a title falls back to its type',
    extractWidgetStyle({ ...source, title: '' }).sourceLabel,
    'value',
);

// ── 5. Pasting ──
const target = {
    id: 'w2',
    type: 'value',
    title: 'Bad',
    datapoint: '0_userdata.0.Bad.Temp',
    gridPos: { x: 8, y: 0, w: 4, h: 4 },
    layout: 'card',
    options: {
        unit: '%',
        subtitleColor: '#00f', // style the source does not have → must go
        decimals: 2, // ditto
        datapoint: '0_userdata.0.Bad.Temp',
        maxRows: 5,
    },
};
const pasted = applyWidgetStyle(target, style);
eq('the target keeps its own datapoint', pasted.datapoint, '0_userdata.0.Bad.Temp');
eq('the target keeps its own title', pasted.title, 'Bad');
eq('the target keeps its own size', pasted.gridPos, target.gridPos);
eq('the target keeps its own unit', pasted.options.unit, '%');
eq('non-style options survive', pasted.options.maxRows, 5);
eq('the style arrives', pasted.options.valueFontSize, 32);
eq('the layout arrives', pasted.layout, 'compact');
ok('a style the source lacks is dropped, not merged', !('subtitleColor' in pasted.options));
ok('… including scalar leftovers', !('decimals' in pasted.options));
ok('the source is not mutated', source.options.valueFontSize === 32 && target.options.decimals === 2);
pasted.options.styleOverride['--accent'] = '#00f';
eq('objects are cloned, not shared', style.options.styleOverride['--accent'], '#0f0');

// A source without a layout resets the target back to the default variant.
const plain = extractWidgetStyle({ ...source, layout: undefined });
ok('no layout on the source clears the target layout', applyWidgetStyle(target, plain).layout === undefined);

// ── 6. Guard rails and feedback ──
ok('a style only fits the same type', canApplyWidgetStyle(target, style));
ok('a foreign type is refused', !canApplyWidgetStyle({ ...target, type: 'switch' }, style));
ok('an empty clipboard is refused', !canApplyWidgetStyle(target, null));
ok('the change count is non-zero for a real paste', countStyleChanges(target, style) > 0);
eq('pasting a style onto its own source changes nothing', countStyleChanges(source, style), 0);

// ── 7. The shipped schema: every option ends up on one side of the split ──
const schema = JSON.parse(readFileSync('public/ai/aura-widget-schema.json', 'utf8'));
const keys = new Set(Object.keys(schema.commonOptions ?? {}));
for (const w of Object.values(schema.widgets ?? {})) for (const k of Object.keys(w.options ?? {})) keys.add(k);
const styleKeys = [...keys].filter(isStyleOptionKey);
ok(`the schema has options at all (${keys.size})`, keys.size > 500);
ok(`a useful share is classified as style (${styleKeys.length})`, styleKeys.length > 200);
// Nothing datapoint-shaped may slip through the patterns.
const dpish = styleKeys.filter(
    (k) => k === 'datapoint' || k.endsWith('Dp') || k.endsWith('Datapoint') || /Ids?$/.test(k),
);
eq('no datapoint key is classified as style', dpish, []);
// Free-text/URL options are the expensive kind of false positive. `valueTimePattern`
// is the one allowed hit: it is a date format string, registered on purpose.
const texty = styleKeys.filter(
    (k) => !/show|hide/i.test(k) && k !== 'valueTimePattern' && /url|template|pattern|prefix/i.test(k),
);
eq('no url / template key is classified as style', texty, []);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
console.log(`\nwidget-style-copy: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
