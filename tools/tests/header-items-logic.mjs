// Header items (issue #676): sanitising, visibility, which datapoints get
// subscribed, the widget values (main value, list aggregates) and the slot layout.
//
//   node tools/tests/header-items-logic.mjs
//
// No dev server needed - utils/headerItems.ts is pure and bundled with esbuild,
// together with the template engine the text items run through. The rendered header
// is covered by header-items.mjs.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-header-items-logic-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export * from './src-vis/utils/headerItems.ts'; export { renderTemplate } from './src-vis/utils/htmlTemplate.ts';",
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
            // formatValue (via listStats) reads the global settings store, which would
            // drag the socket layer into node. The test hands its own formatter in.
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
const m = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });
const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

const fmt = { formatNum: (n, d) => n.toFixed(d).replace('.', ','), defaultDecimals: 2 };
const item = (patch) => ({ id: 'a', source: 'dp', slot: 'r1-right', ...patch });

// ── 1. Sanitising ──
eq('no items', m.headerItems(undefined), []);
eq('not an array', m.headerItems({ headerItems: 'x' }), []);
eq(
    'drops malformed entries',
    m.headerItems({ headerItems: [null, { id: 'a' }, { source: 'dp' }, item({ id: 'ok' })] }).map((i) => i.id),
    ['ok'],
);
eq('unknown slot moves right', m.headerItems({ headerItems: [item({ slot: 'r3-x' })] })[0].slot, 'r1-right');
eq('unknown source dropped', m.headerItems({ headerItems: [item({ source: 'foo' })] }), []);

// ── 2. Visibility ──
ok('always: folded', m.headerItemVisible(item({}), true));
ok('always: unfolded', m.headerItemVisible(item({}), false));
ok('collapsed: folded', m.headerItemVisible(item({ show: 'collapsed' }), true));
ok('collapsed: not unfolded', !m.headerItemVisible(item({ show: 'collapsed' }), false));
ok('expanded: not folded', !m.headerItemVisible(item({ show: 'expanded' }), true));
ok('expanded: unfolded', m.headerItemVisible(item({ show: 'expanded' }), false));

// ── 3. Widget values on offer ──
const value = { id: 'w', type: 'value', title: 'T', datapoint: 'x.0.temp', gridPos: {}, options: {} };
const list = {
    id: 'l',
    type: 'list',
    title: 'L',
    datapoint: '',
    gridPos: {},
    options: { entries: [{ id: 'x.0.a' }, { id: 'x.0.b' }, { id: 'x.0.c' }, { id: '' }] },
};
eq(
    'value widget offers its main value',
    m.widgetValueOptions(value).map((o) => o.key),
    ['main'],
);
eq(
    'list offers the aggregates',
    m.widgetValueOptions(list).map((o) => o.key),
    ['list:sum', 'list:avg', 'list:min', 'list:max', 'list:count', 'list:active'],
);
eq('no datapoint, no list: nothing', m.widgetValueOptions({ ...value, datapoint: '' }), []);

// ── 4. Subscriptions ──
eq('dp item subscribes its datapoint', m.headerItemRefs([item({ dp: 'x.0.pv' })], value), ['x.0.pv']);
eq('empty dp subscribes nothing', m.headerItemRefs([item({ dp: '  ' })], value), []);
eq(
    'main value subscribes the own datapoint',
    m.headerItemRefs([item({ source: 'widget', widgetValue: 'main' })], value),
    ['x.0.temp'],
);
eq('list value subscribes every entry', m.headerItemRefs([item({ source: 'widget', widgetValue: 'list:sum' })], list), [
    'x.0.a',
    'x.0.b',
    'x.0.c',
]);
eq(
    'text subscribes its bindings and the list it names',
    m.headerItemRefs([item({ source: 'text', text: 'PV {x.0.pv;round(0)} W, {count} Geräte' })], list),
    ['x.0.pv', 'x.0.a', 'x.0.b', 'x.0.c'],
);
eq(
    'text with {dp} subscribes the own datapoint',
    m.headerItemRefs([item({ source: 'text', text: 'Jetzt {dp}' })], value),
    ['x.0.temp'],
);
ok('a word in braces is no list variable', !m.itemUsesList(item({ source: 'text', text: '{summary}' })));

// ── 5. dp template ──
eq('plain', m.dpItemTemplate(item({ dp: 'x.0.pv' })), '{x.0.pv}');
eq('decimals + unit', m.dpItemTemplate(item({ dp: 'x.0.pv', decimals: 1, unit: 'kW' })), '{x.0.pv;formatValue(1)} kW');

// ── 6. Own value: value factor, the widget's decimals, its unit ──
const scaled = { ...value, options: { valueFactor: 0.001, decimals: 1, unit: 'kW' } };
eq('own value as the widget shows it', m.ownValue(scaled, 2345, fmt), { raw: 2.345, text: '2,3', unit: 'kW' });
eq('item decimals win', m.ownValue(scaled, 2345, fmt, 3).text, '2,345');
eq('no value yet', m.ownValue(value, null, fmt).text, '–');
eq(
    'main value text carries the unit',
    m.widgetItemText(item({ source: 'widget', widgetValue: 'main' }), m.ownValue(scaled, 2345, fmt), null, fmt),
    '2,3 kW',
);
eq(
    'item unit overrides',
    m.widgetItemText(
        item({ source: 'widget', widgetValue: 'main', unit: 'W' }),
        m.ownValue(scaled, 2345, fmt),
        null,
        fmt,
    ),
    '2,3 W',
);

// ── 7. List values ──
const states = { 'x.0.a': { val: 100 }, 'x.0.b': { val: 0 }, 'x.0.c': { val: false } };
const lv = m.listValues(list, states);
eq('aggregates over numeric entries', [lv.raw.sum, lv.raw.min, lv.raw.max, lv.raw.avg], [100, 0, 100, 50]);
eq('count is every entry', lv.raw.count, 3);
eq('active counts >0 / true / non-empty', lv.raw.active, 1);
eq(
    'sum text',
    m.widgetItemText(item({ source: 'widget', widgetValue: 'list:sum', unit: 'W' }), null, lv, fmt),
    '100 W',
);
eq(
    'count has no unit and no decimals',
    m.widgetItemText(item({ source: 'widget', widgetValue: 'list:count', decimals: 2 }), null, lv, fmt),
    '3',
);
eq('nothing numeric = dash', m.listValues(list, {}).raw.sum, null);

// ── 8. Text items through the template engine ──
const render = (text) =>
    m.renderTemplate(text, {
        vars: { sum: '100', count: '3', dp: '21,5' },
        rawVars: { sum: 100, count: 3, dp: 21.5 },
        resolve: (ref) => (ref === 'x.0.pv' ? '1234' : '–'),
        resolveRaw: (ref) => (ref === 'x.0.pv' ? 1234 : null),
        ops: { formatNum: fmt.formatNum, decimals: 2, t: (k) => k },
    });
eq('list variable', render('Σ {sum} W'), 'Σ 100 W');
// Operation chains stay limited to the reserved variables (the CSS guard of the
// engine), so a list variable takes no `;op` — the text renders verbatim instead of
// guessing. Expressions do see it.
eq('no operation chain on a list variable', render('{sum;round(0)}'), '{sum;round(0)}');
eq('own value', render('{dp} °C'), '21,5 °C');
eq('datapoint', render('PV {x.0.pv} W'), 'PV 1234 W');
ok('expression over a list variable', render('{{ sum / count }}').startsWith('33.33'), render('{{ sum / count }}'));

// ── 9. Slots ──
const layout = m.groupBySlot([
    { id: '1', slot: 'r1-right' },
    { id: '2', slot: 'r2-left' },
    { id: '3', slot: 'r1-right' },
]);
eq(
    'grouped in list order',
    layout['r1-right'].map((i) => i.id),
    ['1', '3'],
);
eq('empty slots are empty', layout['r2-center'], []);
ok('row two when used', m.hasSecondRow([{ slot: 'r2-center' }]));
ok('no row two otherwise', !m.hasSecondRow([{ slot: 'r1-center' }, { slot: 'r1-right' }]));
eq('five slots', [...m.HEADER_SLOTS], ['r1-center', 'r1-right', 'r2-left', 'r2-center', 'r2-right']);

// ── 9a. Extra values: thermostat, room climate, custom cells ──
const thermo = {
    id: 't',
    type: 'thermostat',
    title: 'T',
    datapoint: 'x.0.set',
    gridPos: {},
    options: { actualDatapoint: 'x.0.act' },
};
eq(
    'thermostat offers target (main) and actual',
    m.widgetValueOptions(thermo).map((o) => `${o.key}:${o.labelKey}`),
    ['main:hdr.val.target', 'thermo:actual:hdr.val.actual'],
);
eq('thermostat main value gets °C', m.ownValue(thermo, 21.5, fmt).unit, '°C');
const climate = {
    id: 'c',
    type: 'climate',
    title: 'K',
    datapoint: 'x.0.temp',
    gridPos: {},
    options: {
        humidityDatapoint: 'x.0.hum',
        metrics: [
            { id: 'co2', source: 'datapoint', datapoint: 'x.0.co2', label: 'CO2', unit: 'ppm', decimals: 0 },
            { id: 'dew', source: 'dewpoint' },
        ],
    },
};
eq(
    'climate offers humidity and datapoint readings, not computed ones',
    m.widgetValueOptions(climate).map((o) => o.key),
    ['main', 'climate:humidity', 'metric:co2'],
);
const co2 = item({ source: 'widget', widgetValue: 'metric:co2' });
eq('reading subscribes its datapoint', m.headerItemRefs([co2], climate), ['x.0.co2']);
eq(
    'reading text with its unit and decimals',
    m.extraValueText(co2, m.extraValueFor(co2, climate), 812.4, fmt),
    '812 ppm',
);
const custom = {
    id: 'g',
    type: 'value',
    title: 'G',
    datapoint: '',
    layout: 'custom',
    gridPos: {},
    options: {
        customGrid: {
            cols: 2,
            rows: 2,
            cells: [
                { type: 'title' },
                { type: 'dp', dpId: 'x.0.power', suffix: 'kW', valueFactor: 0.001, decimals: 1, prefix: 'PV' },
                null,
                { type: 'dp', dpId: 'x.0.soc' },
            ],
        },
    },
};
eq(
    'custom layout offers every cell with a datapoint',
    m.widgetValueOptions(custom).map((o) => `${o.key}|${o.detail}`),
    ['cell:1|1/2 · PV', 'cell:3|2/2 · soc'],
);
const cell = item({ source: 'widget', widgetValue: 'cell:1' });
eq('cell value as the cell shows it', m.extraValueText(cell, m.extraValueFor(cell, custom), 2345, fmt), '2,3 kW');
eq('cell item unit wins', m.extraValueText({ ...cell, unit: 'W' }, m.extraValueFor(cell, custom), 2345, fmt), '2,3 W');
eq('not a custom layout: no cells', m.extraWidgetValues({ ...custom, layout: 'default' }), []);

// ── 9b. Conditions ──
const vctx = m.headerSourceCtx(value);
const lctx = m.headerSourceCtx(list);
const cond = (clauses, logic) => item({ source: 'text', text: 'x', clauses, logic });
const vals = (states, ctx) => m.conditionValues(states, ctx);
ok('no condition always passes', m.headerItemPasses(item({}), vals({}, vctx), vctx));
ok('empty clause list passes', m.headerItemPasses(cond([]), vals({}, vctx), vctx));
ok(
    'empty clause datapoint = own value (true)',
    m.headerItemPasses(
        cond([{ datapoint: '', operator: '>', value: '20' }]),
        vals({ 'x.0.temp': { val: 21.5 } }, vctx),
        vctx,
    ),
);
ok(
    '…and false below',
    !m.headerItemPasses(
        cond([{ datapoint: '', operator: '>', value: '20' }]),
        vals({ 'x.0.temp': { val: 19 } }, vctx),
        vctx,
    ),
);
const someOn = vals({ 'x.0.a': { val: 100 }, 'x.0.b': { val: 0 }, 'x.0.c': { val: false } }, lctx);
const allOff = vals({ 'x.0.a': { val: 0 }, 'x.0.b': { val: 0 }, 'x.0.c': { val: false } }, lctx);
const activeGt0 = [{ datapoint: '{list:active}', operator: '>', value: '0' }];
ok('list: active > 0 while one is on', m.headerItemPasses(cond(activeGt0), someOn, lctx));
ok('list: hidden while all are off', !m.headerItemPasses(cond(activeGt0), allOff, lctx));
ok(
    'OR joins clauses',
    m.headerItemPasses(
        cond(
            [
                { datapoint: '{list:active}', operator: '>', value: '5' },
                { datapoint: '{list:count}', operator: '==', value: '3' },
            ],
            'OR',
        ),
        allOff,
        lctx,
    ),
);
eq(
    'condition refs: own datapoint and every list entry',
    m.headerConditionRefs([cond([{ datapoint: '', operator: 'true', value: '' }])], vctx),
    ['x.0.temp'],
);
eq('condition refs: list token reads the entries', m.headerConditionRefs([cond(activeGt0)], lctx), [
    'x.0.a',
    'x.0.b',
    'x.0.c',
]);
eq('no condition, no refs', m.headerConditionRefs([item({})], vctx), []);

// ── 10. The schema tells a model about it ──
const schema = JSON.parse(readFileSync('public/ai/aura-widget-schema.json', 'utf8'));
ok('headerItems is described', !!schema.commonOptions?.headerItems?.description);
eq('…as a list of WidgetHeaderItem', schema.commonOptions?.headerItems?.items?.ref, 'WidgetHeaderItem');
const fields = schema.types?.WidgetHeaderItem?.fields ?? {};
for (const key of ['source', 'slot', 'show', 'dp', 'widgetValue', 'text', 'clauses']) {
    ok(`WidgetHeaderItem.${key} is described`, !!fields[key]?.description || key === 'id');
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
console.log(`\nheader-items-logic: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
