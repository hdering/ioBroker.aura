#!/usr/bin/env node
/**
 * Tests the MCP endpoint the adapter serves at POST /mcp.
 *
 *   npm run test:mcp
 *
 * Two halves:
 *   1. The validation rules and config helpers, against the real widget schema.
 *      These are the reason the server exists — a misnamed option is otherwise
 *      ignored silently and nobody finds out.
 *   2. The endpoint itself, driven by the REAL @modelcontextprotocol client over
 *      HTTP. Hand-written JSON-RPC that is only ever tested against itself proves
 *      nothing; the SDK stays a devDependency purely to be the other side here.
 *
 * ioBroker is replaced by a small adapter double, so writes are verified without
 * touching an installation.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const { validateWidget, validateTab, validateAny, allowedOptions } = require('../../lib/mcp/validate.js');
const {
    designColumns,
    loggingInstances,
    allTabs,
    findTab,
    findWidget,
    mergeWidget,
    NODE_FIELDS,
    reorderNodes,
    updateNode,
    collectDefIds,
    replaceTabWidgets,
} = require('../../lib/mcp/auraConfig.js');
const { handleAuthDiscovery, handleMcpRequest } = require('../../lib/mcp/httpEndpoint.js');
const { LEVELS, levelIndex, toolsFor } = require('../../lib/mcp/tools.js');
const { RECIPES, findRecipe, renderRecipe, renderRecipeIndex } = require('../../lib/mcp/recipes.js');
const {
    looksLikeCounter,
    reviewWidgets,
    renderReview,
    TILE_ROW_LIMIT,
    CONTACT_LIMIT,
} = require('../../lib/mcp/review.js');
const { auditDashboard, renderAudit } = require('../../lib/mcp/audit.js');
const { collectDatapointRefs, historyFindings, historyReads, writeRefs } = require('../../lib/mcp/dpFit.js');
const { measureWidget, renderMeasure, rowsToPx, pxToRows } = require('../../lib/mcp/measure.js');
const { designCanvas, renderCanvas } = require('../../lib/mcp/canvas.js');
const { activeThemes, renderPalette, renderTheme, themeValues } = require('../../lib/mcp/theme.js');
const THEME_TOKENS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/ai/aura-theme-tokens.json'), 'utf8'));
const {
    TOKEN_PLACEHOLDER,
    baseUrl,
    clientConfig,
    hostAddresses,
    maskClientConfig,
    outboundAddress,
    resolveBaseUrl,
} = require('../../lib/mcp/clientConfig.js');

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/ai/aura-widget-schema.json'), 'utf8'));

let checks = 0;
const check = (label, fn) => {
    fn();
    checks++;
    console.log(`  ✓ ${label}`);
};
const hasError = (res, re) => res.errors.some((e) => re.test(e));
const hasWarning = (res, re) => res.warnings.some((w) => re.test(w));

const OK_SWITCH = {
    id: 'w-1',
    type: 'switch',
    title: 'Deckenlicht',
    datapoint: 'hm-rpc.0.LEQ1.1.STATE',
    gridPos: { x: 0, y: 0, w: 8, h: 4 },
    options: { showTitle: true, controlMode: 'toggle' },
};

console.log('\nmcp — Regeln');

check('a correct widget passes clean', () => {
    const res = validateWidget(OK_SWITCH, schema);
    assert.deepEqual(res.errors, []);
    assert.deepEqual(res.warnings, []);
});

check('an unknown widget type is named, with a suggestion', () => {
    const res = validateWidget({ ...OK_SWITCH, type: 'switsch' }, schema);
    assert.ok(hasError(res, /unbekannter Typ "switsch"/));
    assert.ok(hasError(res, /meintest du "switch"/));
});

check('an option the widget never reads is an error, not silence', () => {
    const res = validateWidget({ ...OK_SWITCH, options: { showTitel: true } }, schema);
    assert.ok(hasError(res, /liest die Option "showTitel" nicht/));
    assert.ok(hasError(res, /meintest du "showTitle"/));
});

// ── Row options the chosen display never reads ───────────────────────────────
// Reported from use: trueLabel/falseLabel on a `displayType: "value"` row are
// dropped in silence, and you only find out in the browser. The editor does not
// even offer the fields there — a written payload can carry them anyway.

const listOfRows = (entries, extra = {}) => ({
    id: 'l-1',
    type: 'list',
    title: 'Fenster',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 10, h: 8 },
    options: { entries, ...extra },
});

check('on/off labels on a display that cannot show them are named', () => {
    const res = validateWidget(
        listOfRows([{ id: 'demo.a', displayType: 'value', trueLabel: 'AN', falseLabel: 'AUS' }]),
        schema,
    );
    assert.deepEqual(res.errors, [], 'the fields exist — this is a warning, not a refusal');
    assert.ok(hasWarning(res, /trueLabel \/ falseLabel bei displayType "value"/));
    assert.ok(hasWarning(res, /nur "switch" zeigt sie/), 'and it says what does show them');
});

check('the displays that do read them stay silent', () => {
    // 'switch' draws the pair, and 'auto' resolves to a switch on a boolean
    // datapoint — usesOnOffLabels() in entryControls.tsx is the authority.
    for (const entry of [
        { id: 'demo.a', displayType: 'switch', trueLabel: 'AN' },
        { id: 'demo.a', trueLabel: 'AN' },
        { id: 'demo.a', displayType: 'auto', falseLabel: 'AUS' },
    ]) {
        assert.deepEqual(validateWidget(listOfRows([entry]), schema).warnings, [], JSON.stringify(entry));
    }
});

check('the badges layout is not accused — there the pair is read', () => {
    // ListWidget's minimal layout evaluates trueLabel/falseLabel itself for a
    // boolean-ish value, whatever the display says. A finding would be wrong.
    const w = { ...listOfRows([{ id: 'demo.a', displayType: 'value', trueLabel: 'AN' }]), layout: 'minimal' };
    assert.deepEqual(validateWidget(w, schema).warnings, []);
});

check('a state mapping or a preset list on the wrong display is named', () => {
    const states = validateWidget(
        listOfRows([{ id: 'demo.a', displayType: 'value', states: [{ value: 1, label: 'Zu' }] }]),
        schema,
    );
    assert.ok(hasWarning(states, /states bei displayType "value"/));
    // 'auto' does not save it either: the mapping is read on strict equality
    // with 'states', so an undeclared row never sees it.
    const auto = validateWidget(listOfRows([{ id: 'demo.a', presets: [{ value: 1, label: 'A' }] }]), schema);
    assert.ok(hasWarning(auto, /presets bei displayType "auto"/));
    assert.ok(hasWarning(auto, /"buttons" und "select"/));
    for (const entry of [
        { id: 'demo.a', displayType: 'states', states: [{ value: 1, label: 'Zu' }] },
        { id: 'demo.a', displayType: 'buttons', presets: [{ value: 1, label: 'A' }] },
        { id: 'demo.a', displayType: 'select', presets: [{ value: 1, label: 'A' }] },
    ]) {
        assert.deepEqual(validateWidget(listOfRows([entry]), schema).warnings, [], JSON.stringify(entry));
    }
});

check('sixteen rows of the same mistake are one finding', () => {
    const rows = Array.from({ length: 16 }, (_, i) => ({
        id: `demo.${i}`,
        displayType: 'contact',
        trueLabel: 'AN',
    }));
    const res = validateWidget(listOfRows(rows), schema);
    assert.equal(res.warnings.length, 1, res.warnings.join(' | '));
    assert.match(res.warnings[0], /entries\[0\], entries\[1\]/, 'the rows are named');
    assert.match(res.warnings[0], /\(\+10\)/, 'and the rest is counted, not printed');
});

check('the list-wide display block is checked too, and needs a display', () => {
    const wide = validateWidget(
        listOfRows([{ id: 'demo.a' }], { entryDisplay: { displayType: 'contact', presets: [{ value: 1 }] } }),
        schema,
    );
    assert.ok(hasWarning(wide, /Option "entryDisplay": presets bei displayType "contact"/));
    // Without a display of its own the whole block is never applied
    // (listDisplayApplies in utils/listDisplayDefaults.ts).
    const noDisplay = validateWidget(listOfRows([{ id: 'demo.a' }], { entryDisplay: { iconSize: 20 } }), schema);
    assert.ok(hasWarning(noDisplay, /"entryDisplay" nennt keinen "displayType"/));
});

check('the labels of a contact row are documented and checked', () => {
    // Reported from use: contactAppearance was typed `object`, so the labels
    // could not be looked up — "heizt"/"zu" for a heating valve meant falling
    // back to the `states` mapping. Now the shape is in the schema, which also
    // means a typo in it is caught instead of silently doing nothing.
    const ok = listOfRows([
        {
            id: 'demo.a',
            displayType: 'contact',
            contactPreset: 'boolean',
            contactAppearance: { closed: { label: 'zu' }, open: { label: 'heizt', color: '#f59e0b' } },
        },
    ]);
    const res = validateWidget(ok, schema);
    assert.deepEqual(res.errors, [], res.errors.join(' | '));
    assert.deepEqual(res.warnings, [], res.warnings.join(' | '));

    const typo = listOfRows([{ id: 'demo.a', displayType: 'contact', contactAppearance: { closed: { labl: 'zu' } } }]);
    assert.ok(hasError(validateWidget(typo, schema), /"labl" gibt es hier nicht/));
    const wrongState = listOfRows([
        { id: 'demo.a', displayType: 'contact', contactAppearance: { geschlossen: { label: 'zu' } } },
    ]);
    assert.ok(hasError(validateWidget(wrongState, schema), /"geschlossen" gibt es hier nicht/));
});

check('a separator is not a row with a display', () => {
    // A divider carries no display and draws no control — the fields on it are a
    // different question, and inventing a display for it would be noise.
    const res = validateWidget(listOfRows([{ divider: true, id: 'demo.sep' }]), schema);
    assert.deepEqual(res.warnings, []);
});

check('an out-of-set enum value lists what is allowed', () => {
    const res = validateWidget({ ...OK_SWITCH, options: { controlMode: 'switch' } }, schema);
    assert.ok(hasError(res, /Option "controlMode".*nicht erlaubt/));
    assert.ok(hasError(res, /toggle/));
});

check('a wrong value type is caught', () => {
    const res = validateWidget({ ...OK_SWITCH, options: { showTitle: 'ja' } }, schema);
    assert.ok(hasError(res, /Option "showTitle": string übergeben, erwartet boolean/));
});

check('an invalid layout lists the valid ones', () => {
    const res = validateWidget({ ...OK_SWITCH, layout: 'dial' }, schema);
    assert.ok(hasError(res, /layout "dial" gibt es für switch nicht/));
    assert.deepEqual(validateWidget({ ...OK_SWITCH, layout: 'compact' }, schema).errors, []);
});

check('datapoint expectations follow the widget type', () => {
    assert.ok(hasError(validateWidget({ ...OK_SWITCH, datapoint: '' }, schema), /braucht einen Datenpunkt/));
    const clock = { id: 'c', type: 'clock', title: 'Uhr', datapoint: 'x.0.y', gridPos: { x: 0, y: 0, w: 6, h: 4 } };
    assert.ok(hasWarning(validateWidget(clock, schema), /wertet "datapoint" nicht aus/));
});

check('datapoint ids and datapoint-valued options are checked against the tree', () => {
    const known = new Set(['hm-rpc.0.LEQ1.1.STATE']);
    assert.deepEqual(validateWidget(OK_SWITCH, schema, { knownDatapoints: known }).errors, []);
    assert.ok(
        hasError(
            validateWidget({ ...OK_SWITCH, datapoint: 'hm-rpc.0.NOPE' }, schema, { knownDatapoints: known }),
            /nicht/,
        ),
    );
    const res = validateWidget({ ...OK_SWITCH, options: { statusDp: 'erfunden.0.dp' } }, schema, {
        knownDatapoints: known,
    });
    assert.ok(hasError(res, /Option "statusDp": Datenpunkt "erfunden\.0\.dp" gibt es .*nicht/));
});

check('a datapoint one level down is checked too, placeholders are not', () => {
    const known = new Set(['hm-rpc.0.LEQ1.1.STATE']);
    // A list entry's statusDp: the typo that used to produce one silent row in
    // twelve, with nothing anywhere saying which.
    const list = {
        id: 'l1',
        type: 'list',
        title: 'Licht',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 10, h: 6 },
        options: { entries: [{ id: 'hm-rpc.0.LEQ1.1.STATE', statusDp: 'erfunden.0.dp' }] },
    };
    assert.ok(hasError(validateWidget(list, schema, { knownDatapoints: known }), /erfunden\.0\.dp/));

    // {{parent}} is resolved per row. Checked against the id list it would refuse
    // every correct row rule there is.
    const templated = {
        ...list,
        options: { entries: [{ id: 'hm-rpc.0.LEQ1.1.STATE', statusDp: '{{parent}}.STATE' }] },
    };
    assert.deepEqual(validateWidget(templated, schema, { knownDatapoints: known }).errors, []);
});

// ── A chart on a datapoint nobody logs ────────────────────────────────────────
// The mistake that looks least like one: the id exists, the type is a number, the
// options are spelled right, and the chart draws an empty frame for ever.

const chartSeries = (over = {}) => ({
    id: 'c1',
    type: 'echart',
    title: 'Verlauf',
    datapoint: 'zigbee.0.temp',
    gridPos: { x: 0, y: 0, w: 20, h: 10 },
    options: {
        echartSeries: [{ id: 's1', name: 'Temperatur', datapointId: 'zigbee.0.temp', chartType: 'line', ...over }],
    },
});

check('logging instances are read the way the frontend reads them', () => {
    assert.deepEqual(loggingInstances({ 'influxdb.0': { enabled: true } }), ['influxdb.0']);
    assert.deepEqual(loggingInstances({ 'history.0': { enabled: true }, 'sql.1': { enabled: true } }), [
        'history.0',
        'sql.1',
    ]);
    // Switched off counts as not logged, and a foreign custom entry is not history.
    assert.deepEqual(loggingInstances({ 'influxdb.0': { enabled: false } }), []);
    assert.deepEqual(loggingInstances({ 'javascript.0': { enabled: true } }), []);
    assert.deepEqual(loggingInstances(undefined), []);
});

check('a series on an unlogged datapoint is named, with what to do about it', () => {
    const meta = new Map([['zigbee.0.temp', { type: 'number', logging: [] }]]);
    const found = historyFindings(chartSeries(), meta);
    assert.equal(found.length, 1);
    assert.match(found[0], /Reihe s1 „Temperatur"/);
    assert.match(found[0], /wird von keiner History-Instanz geloggt/);
    assert.match(found[0], /das Diagramm bleibt leer/);
});

check('a logged datapoint produces no remark', () => {
    const meta = new Map([['zigbee.0.temp', { type: 'number', logging: ['influxdb.0'] }]]);
    assert.deepEqual(historyFindings(chartSeries(), meta), []);
});

check('a history instance that does not log this datapoint is a finding of its own', () => {
    const meta = new Map([['zigbee.0.temp', { type: 'number', logging: ['influxdb.0'] }]]);
    const found = historyFindings(chartSeries({ historyInstance: 'history.0' }), meta);
    assert.equal(found.length, 1);
    assert.match(found[0], /historyInstance "history\.0" zeichnet .* nicht auf/);
    assert.match(found[0], /aktiv ist influxdb\.0/);
});

check('a JSON series needs no history — and neither does the JSON mode', () => {
    const meta = new Map([['zigbee.0.temp', { type: 'number', logging: [] }]]);
    assert.deepEqual(historyFindings(chartSeries({ source: 'json' }), meta), []);
    const jsonMode = chartSeries();
    jsonMode.options.echartMode = 'json';
    assert.deepEqual(historyFindings(jsonMode, meta), []);
});

check('the series path stays the stored index when a JSON series sits in between', () => {
    const w = {
        type: 'echart',
        options: {
            echartSeries: [
                { id: 'a', datapointId: 'zigbee.0.temp' },
                { id: 'b', datapointId: 'x.json', source: 'json' },
                { id: 'c', datapointId: 'zigbee.0.temp' },
            ],
        },
    };
    assert.deepEqual(
        historyReads(w).map((r) => r.path),
        ['Reihe a', 'Reihe c'],
    );
});

check('the energy balance is checked per entry, and only where it aggregates', () => {
    const bars = (aggregate) => ({
        id: 'eb',
        type: 'energiebilanz',
        title: 'Bilanz',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 20, h: 10 },
        options: {
            bars: [
                {
                    id: 'b1',
                    title: 'Verbrauch',
                    entries: [{ id: 'e1', datapointId: 'zigbee.0.temp', label: 'Wärmepumpe', aggregate }],
                    totalDatapoint: 'zigbee.0.temp',
                },
            ],
        },
    });
    // 'last' is served from the live state (issue #596) — no history needed.
    assert.deepEqual(historyReads(bars('last')), []);
    assert.deepEqual(historyReads(bars(undefined)), [], 'the default is last');
    const reads = historyReads(bars('delta'));
    assert.equal(reads.length, 1, 'the bar total is a live value and must not be counted');
    assert.match(reads[0].path, /bars\[0\]\.entries\[0\] „Wärmepumpe" \(delta\)/);
    const meta = new Map([['zigbee.0.temp', { type: 'number', logging: [] }]]);
    const ebFound = historyFindings(bars('delta'), meta);
    assert.match(ebFound.join(' '), /wird von keiner History-Instanz geloggt/);
    // The energy balance is not a chart — the sentence has to name what stays empty here.
    assert.match(ebFound.join(' '), /die Auswertung bleibt leer/);
});

check('a datapoint logged to an instance that does not exist is its own finding', () => {
    // The case that also hangs a history query: common.custom still names
    // history.0 on a system that has only influxdb.
    const meta = new Map([['zigbee.0.temp', { type: 'number', logging: ['history.0'] }]]);
    const found = historyFindings(chartSeries(), meta, ['influxdb.0']);
    assert.equal(found.length, 1);
    assert.match(found[0], /eingetragen ist history\.0, diese Instanz gibt es .* nicht/);
    assert.match(found[0], /Vorhanden: influxdb\.0/);
    // With that instance installed there is nothing to say.
    assert.deepEqual(historyFindings(chartSeries(), meta, ['history.0']), []);
    // And a second, working instance next to a ghost is fine.
    const both = new Map([['zigbee.0.temp', { type: 'number', logging: ['history.0', 'influxdb.0'] }]]);
    assert.deepEqual(historyFindings(chartSeries(), both, ['influxdb.0']), []);
});

check('the simple chart is checked on its own datapoint', () => {
    const meta = new Map([['zigbee.0.temp', { type: 'number', logging: [] }]]);
    const chart = {
        id: 'ch',
        type: 'chart',
        title: 'Verlauf',
        datapoint: 'zigbee.0.temp',
        gridPos: { x: 0, y: 0, w: 20, h: 10 },
        options: {},
    };
    assert.match(historyFindings(chart, meta).join(' '), /datapoint: zigbee\.0\.temp wird von keiner/);
});

check('an unlogged chart datapoint warns but never refuses the write', () => {
    const meta = new Map([['zigbee.0.temp', { type: 'number', logging: [] }]]);
    const res = validateWidget(chartSeries(), schema, {
        knownDatapoints: new Set(['zigbee.0.temp']),
        datapointMeta: meta,
    });
    assert.deepEqual(res.errors, []);
    assert.ok(hasWarning(res, /wird von keiner History-Instanz geloggt/));
});

check('a typo in a series datapoint is an error now that the field is flagged', () => {
    assert.ok(schema.types.EChartSeriesConfig.fields.datapointId.datapoint, 'datapointId must be flagged');
    const res = validateWidget(chartSeries({ datapointId: 'zigbee.0.tmp' }), schema, {
        knownDatapoints: new Set(['zigbee.0.temp']),
    });
    assert.ok(hasError(res, /zigbee\.0\.tmp/));
});

check('the object behind the datapoint is compared with the widget', () => {
    const known = new Set(['hm-rpc.0.LEQ1.1.STATE']);
    // Read-only state under a switch: passes every other check and then the
    // button does nothing, for good.
    const readOnly = new Map([['hm-rpc.0.LEQ1.1.STATE', { type: 'boolean', write: false }]]);
    const res = validateWidget(OK_SWITCH, schema, { knownDatapoints: known, datapointMeta: readOnly });
    assert.deepEqual(res.errors, [], 'a mislabelled object must never refuse a write');
    assert.ok(hasWarning(res, /nur lesbar/));

    // A number under a switch is normal in plenty of installations — but only
    // with onValue/offValue, and that is the difference worth naming.
    const numeric = new Map([['hm-rpc.0.LEQ1.1.STATE', { type: 'number', write: true }]]);
    assert.ok(
        hasWarning(
            validateWidget(OK_SWITCH, schema, { knownDatapoints: known, datapointMeta: numeric }),
            /erwartet boolean/,
        ),
    );
    const mapped = { ...OK_SWITCH, options: { ...(OK_SWITCH.options || {}), onValue: 1, offValue: 0 } };
    assert.deepEqual(
        validateWidget(mapped, schema, { knownDatapoints: known, datapointMeta: numeric }).warnings.filter((w) =>
            /erwartet boolean/.test(w),
        ),
        [],
    );
});

// ── Chart colours: a token, resolved before it reaches the canvas ───────────
// Reported from use: `var(--accent)` in echartSeries[].color and a chart that
// stayed empty — a canvas drops a CSS variable (measured: fillStyle unchanged,
// the fallback inside the var() included). The answer is not to forbid tokens in
// charts but to resolve them: the widget looks the value up at its own element
// before handing the option to eCharts (tools/tests/echart-token-colors.mjs
// checks that in the browser), so the colour rule is the same everywhere.
//
// What is left to check here is whether the token EXISTS — an unknown one
// resolves to nothing and the series quietly takes a palette colour.

const echartWith = (color, extra) => ({
    id: 'e1',
    type: 'echart',
    title: 'Verbrauch',
    datapoint: 'demo.value',
    gridPos: { x: 0, y: 0, w: 12, h: 8 },
    options: {
        echartSeries: [
            { id: 's1', name: 'Strom', datapointId: 'demo.value', chartType: 'bar', ...(color ? { color } : {}) },
        ],
        ...extra,
    },
});
const THEME_VALUES = themeValues(THEME_TOKENS, { themeId: 'dark' });

check('a token in a chart colour is right, not a finding', () => {
    for (const color of ['var(--accent-yellow)', 'var(--text-secondary)', '#3b82f6', 'red', undefined]) {
        const res = validateWidget(echartWith(color), schema, { themeValues: THEME_VALUES });
        assert.deepEqual(res.errors, [], `${color}: ${res.errors.join(' | ')}`);
        assert.deepEqual(res.warnings, [], `${color}: ${res.warnings.join(' | ')}`);
    }
});

check('a token this dashboard does not define is named, with what happens instead', () => {
    const res = validateWidget(echartWith('var(--accent-orange)'), schema, { themeValues: THEME_VALUES });
    assert.deepEqual(res.errors, [], 'the chart still draws — a warning, not a refusal');
    assert.ok(hasWarning(res, /--accent-orange ist kein Token dieses Dashboards/), res.warnings.join(' | '));
    assert.ok(hasWarning(res, /Palettenfarbe/), 'and says what the series does instead');
});

check('a variable the widget defines itself counts as defined', () => {
    // styleOverride sets it on the card, and the chart resolves at its own
    // element — so this one does resolve.
    const res = validateWidget(echartWith('var(--mine)', { styleOverride: { '--mine': '#123456' } }), schema, {
        themeValues: THEME_VALUES,
    });
    assert.deepEqual(res.warnings, [], res.warnings.join(' | '));
});

check('without the palette in context nothing is guessed', () => {
    // Own variables from Admin → CSS/JS are invisible here; a finding without the
    // palette would be the false one this check exists to avoid.
    assert.deepEqual(validateWidget(echartWith('var(--accent-orange)'), schema, {}).warnings, []);
});

// ── Controls that are not the widget's own datapoint ─────────────────────────
// Reported from use: a hm-rpc SWITCH_TRANSMITTER (exists, boolean, write false)
// went in as a switch row, validated clean, and would have done nothing when
// pressed. Only `widget.datapoint` was ever compared with the object.

const READ_ONLY = 'hm-rpc.1.00085D89A3C5E2.3.STATE';
const roMeta = () => new Map([[READ_ONLY, { type: 'boolean', role: 'switch', write: false }]]);
const listWith = (entries) => ({
    id: 'l1',
    type: 'list',
    title: 'Licht',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 10, h: 6 },
    options: { entries },
});

check('a switch row on a read-only datapoint is named, with the row', () => {
    const res = validateWidget(listWith([{ id: READ_ONLY, label: 'Deckenlicht', displayType: 'switch' }]), schema, {
        datapointMeta: roMeta(),
    });
    assert.deepEqual(res.errors, [], 'a mislabelled object must never refuse a write');
    assert.ok(hasWarning(res, /Zeile 1 „Deckenlicht“/), JSON.stringify(res.warnings));
    assert.ok(hasWarning(res, /tut beim Klick nichts/));
});

check('a display-only row on the same datapoint is not a finding', () => {
    // Showing a read-only state is exactly what it is for — warning here would
    // teach the reader to ignore the warning.
    const res = validateWidget(listWith([{ id: READ_ONLY, label: 'Nur Anzeige', displayType: 'value' }]), schema, {
        datapointMeta: roMeta(),
    });
    assert.deepEqual(res.warnings, []);
});

check('a read display on a read-only datapoint is never a finding', () => {
    // Reported from use: a room of smoke and water sensors — read-only states,
    // mapped for display — produced nine findings claiming `states` wrote on
    // them. StateDisplay draws a chip out of the mapping and writes nowhere.
    for (const displayType of ['states', 'contact', 'time', 'value']) {
        const res = validateWidget(listWith([{ id: READ_ONLY, label: 'Rauch Küche', displayType }]), schema, {
            datapointMeta: roMeta(),
        });
        assert.deepEqual(res.warnings, [], `${displayType}: ${res.warnings.join(' | ')}`);
    }
    assert.ok(
        !writeRefs(listWith([{ id: READ_ONLY, displayType: 'states' }])).length,
        'states must not count as a write',
    );
});

check('a row declared read-only is taken at its word', () => {
    // `writable: false` is the row saying it does not write. Warning that its
    // control sits on a read-only datapoint repeated what the author declared.
    const res = validateWidget(
        listWith([{ id: READ_ONLY, label: 'Deckenlicht', displayType: 'switch', writable: false }]),
        schema,
        { datapointMeta: roMeta() },
    );
    assert.deepEqual(res.warnings, [], res.warnings.join(' | '));
    // Without the flag the finding is exactly the one this check exists for.
    assert.ok(
        hasWarning(
            validateWidget(listWith([{ id: READ_ONLY, label: 'Deckenlicht', displayType: 'switch' }]), schema, {
                datapointMeta: roMeta(),
            }),
            /nur lesbar/,
        ),
    );
});

check('a display that ignores writable says so instead of staying silent', () => {
    // The flag is only half kept: SwitchControl and SliderControl take it as a
    // prop and the `auto` path guards its toggle, the rich controls never see it.
    // Taking the declaration at face value above must not hide that.
    const res = validateWidget(
        listWith([{ id: READ_ONLY, label: 'Text', displayType: 'input', writable: false }]),
        schema,
        { datapointMeta: roMeta() },
    );
    assert.ok(hasWarning(res, /writable bei displayType "input"/), res.warnings.join(' | '));
    assert.ok(hasWarning(res, /bleibt trotzdem bedienbar/));
    // Where it IS evaluated, and on a display that writes nothing anyway, the
    // flag is not a finding — that would be the noise this whole fix removes.
    for (const displayType of ['switch', 'slider', 'value', 'states', 'contact']) {
        const quiet = validateWidget(listWith([{ id: 'demo.a', displayType, writable: false }]), schema);
        assert.deepEqual(quiet.warnings, [], `${displayType}: ${quiet.warnings.join(' | ')}`);
    }
    // `writable: true` is the default spelled out, never a finding.
    const on = validateWidget(listWith([{ id: 'demo.a', displayType: 'input', writable: true }]), schema);
    assert.deepEqual(on.warnings, []);
});

check('the list-wide display counts for rows that do not set their own', () => {
    const w = listWith([{ id: READ_ONLY, label: 'Deckenlicht' }]);
    w.options.entryDisplay = 'switch';
    assert.ok(hasWarning(validateWidget(w, schema, { datapointMeta: roMeta() }), /nur lesbar/));
});

check('the written half of a shutter is checked, the read-back half is not', () => {
    const shutter = {
        id: 'sh',
        type: 'shutter',
        title: 'Rollo',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 6, h: 6 },
        options: { openDp: READ_ONLY, actualPositionDp: READ_ONLY },
    };
    const res = validateWidget(shutter, schema, { datapointMeta: roMeta() });
    const hits = res.warnings.filter((w) => /nur lesbar/.test(w));
    assert.equal(hits.length, 1, `only the written field: ${JSON.stringify(res.warnings)}`);
    assert.match(hits[0], /openDp/);
});

check('a lamp on a read-only state warns too', () => {
    // `light` was missing from the table entirely, so it passed clean.
    const lamp = {
        id: 'li',
        type: 'light',
        title: 'Lampe',
        datapoint: READ_ONLY,
        gridPos: { x: 0, y: 0, w: 6, h: 6 },
        options: {},
    };
    assert.ok(hasWarning(validateWidget(lamp, schema, { datapointMeta: roMeta() }), /nur lesbar/));
});

check('writeRefs leaves separators and templates alone', () => {
    const w = listWith([
        { id: 'divider:1', divider: true, displayType: 'switch' },
        { id: '{{row.id}}', displayType: 'switch' },
        { id: READ_ONLY, displayType: 'switch' },
    ]);
    assert.deepEqual(
        writeRefs(w).map((r) => r.id),
        [READ_ONLY],
    );
});

check('an invented clickAction kind is refused, with the real ones named', () => {
    // The dead end: no kind writes a datapoint, so a model reaches for one that
    // sounds right. It used to be written and silently do nothing.
    const button = { id: 'b1', type: 'button', title: 'Szene', datapoint: '', gridPos: { x: 0, y: 0, w: 4, h: 3 } };
    const invented = validateWidget(
        { ...button, options: { clickAction: { kind: 'write-datapoint', dp: 'x', value: 1 } } },
        schema,
    );
    assert.ok(hasError(invented, /kind "write-datapoint" gibt es nicht/));
    assert.ok(hasError(invented, /popup-view/), 'the allowed kinds belong in the message');

    const typo = validateWidget(
        { ...button, options: { clickAction: { kind: 'link-tabs', layoutId: 'l1', tabId: 't1' } } },
        schema,
    );
    assert.ok(hasError(typo, /meintest du "link-tab"/));
});

check('the fields of the chosen kind are checked, and a valid one passes', () => {
    const button = { id: 'b1', type: 'button', title: 'Sprung', datapoint: '', gridPos: { x: 0, y: 0, w: 4, h: 3 } };
    const incomplete = validateWidget({ ...button, options: { clickAction: { kind: 'link-tab' } } }, schema);
    assert.ok(hasError(incomplete, /"layoutId" fehlt/));
    assert.ok(hasError(incomplete, /"tabId" fehlt/));

    const stray = validateWidget(
        { ...button, options: { clickAction: { kind: 'popup-view', viewId: 'pv-1', wieId: 'x' } } },
        schema,
    );
    assert.ok(hasError(stray, /"wieId" gibt es hier nicht — meintest du "viewId"/));

    const good = validateWidget(
        { ...button, options: { clickAction: { kind: 'link-tab', layoutId: 'l1', tabId: 't1' } } },
        schema,
    );
    assert.deepEqual(good.errors, []);
});

check('gridPos must be whole and positive', () => {
    assert.ok(hasError(validateWidget({ ...OK_SWITCH, gridPos: { x: 0, y: 0, w: 8.5, h: 4 } }, schema), /ganze Zahl/));
    assert.ok(hasError(validateWidget({ ...OK_SWITCH, gridPos: { x: -1, y: 0, w: 8, h: 4 } }, schema), /negativ/));
});

check('exceeding the column count warns instead of refusing', () => {
    // The count is inferred from the widest widget present, and the frontend
    // widens the grid to fit. Refusing would block building up a thin dashboard:
    // move its one wide widget and the "limit" shrinks with it.
    const res = validateWidget({ ...OK_SWITCH, gridPos: { x: 40, y: 0, w: 12, h: 4 } }, schema, { columns: 48 });
    assert.deepEqual(res.errors, []);
    assert.ok(hasWarning(res, /52 ist breiter als das bisher Vorhandene \(48 Spalten\)/));
});

check('a widget below the guideline is named, not silently placed off screen', () => {
    // The height was never checked against anything: a tab could end below the
    // bottom edge of the very device it was built for and nothing said a word.
    const ctx = { columns: 48, maxCols: 42, maxRows: 23 };
    const deep = validateWidget({ ...OK_SWITCH, gridPos: { x: 0, y: 20, w: 8, h: 6 } }, schema, ctx);
    assert.deepEqual(deep.errors, [], 'scrolling is allowed, it just has to be a decision');
    assert.ok(hasWarning(deep, /26 endet unterhalb der Hilfslinie \(23 Zeilen/));
    const fits = validateWidget({ ...OK_SWITCH, gridPos: { x: 0, y: 17, w: 8, h: 6 } }, schema, ctx);
    assert.deepEqual(fits.warnings, [], 'the last row that fits is not a finding');
});

check('the screen replaces the guessed width, it does not double up on it', () => {
    const ctx = { columns: 48, maxCols: 42, maxRows: 23 };
    const wide = validateWidget({ ...OK_SWITCH, gridPos: { x: 40, y: 0, w: 12, h: 4 } }, schema, ctx);
    assert.ok(hasWarning(wide, /52 reicht über die Hilfslinie hinaus \(42 Spalten/));
    assert.equal(wide.warnings.length, 1, 'the same widget must not be reported twice');
});

check('an option written one level too high is an error, not a shrug', () => {
    // It would be written, ignored by AURA, and reported to the user as done.
    const res = validateWidget({ ...OK_SWITCH, conditions: [] }, schema);
    assert.ok(hasError(res, /"conditions" gehört unter "options"/));
    const own = validateWidget({ ...OK_SWITCH, controlMode: 'toggle' }, schema);
    assert.ok(hasError(own, /"controlMode" gehört unter "options"/));
    // Something nobody knows stays a warning with a suggestion.
    assert.ok(hasWarning(validateWidget({ ...OK_SWITCH, mobilOrder: 2 }, schema), /meintest du "mobileOrder"/));
});

check('a group without defId warns about its children living elsewhere', () => {
    const g = { id: 'g1', type: 'group', title: 'WZ', datapoint: '', gridPos: { x: 0, y: 0, w: 12, h: 8 } };
    assert.ok(hasWarning(validateWidget(g, schema), /aura-group-defs/));
});

check('overlaps are reported by id, adjacency is not', () => {
    const tab = (widgets) => ({ _type: 'aura-tab', tab: { name: 'T', widgets } });
    const over = tab([
        { ...OK_SWITCH, id: 'a', gridPos: { x: 0, y: 0, w: 8, h: 4 } },
        { ...OK_SWITCH, id: 'b', gridPos: { x: 4, y: 2, w: 8, h: 4 } },
    ]);
    assert.ok(hasError(validateTab(over, schema), /"a".*"b".*überlappen/));
    const side = tab([
        { ...OK_SWITCH, id: 'a', gridPos: { x: 0, y: 0, w: 8, h: 4 } },
        { ...OK_SWITCH, id: 'b', gridPos: { x: 8, y: 0, w: 8, h: 4 } },
    ]);
    assert.deepEqual(validateTab(side, schema).errors, []);
});

check('duplicate ids and a wrong envelope are caught', () => {
    const dup = {
        _type: 'aura-tab',
        tab: { name: 'T', widgets: [OK_SWITCH, { ...OK_SWITCH, gridPos: { x: 0, y: 8, w: 8, h: 4 } }] },
    };
    assert.ok(hasError(validateTab(dup, schema), /mehrfach/));
    assert.ok(hasError(validateTab({ _type: 'aura-widget', tab: { name: 'x', widgets: [] } }, schema), /_type/));
});

check('validateAny tells a widget from a tab', () => {
    assert.deepEqual(validateAny(OK_SWITCH, schema).errors, []);
    assert.ok(hasError(validateAny({ _type: 'aura-tab', tab: { name: 'x' } }, schema), /widgets/));
});

check('every shape the write tools take passes the validator too', () => {
    // Reported from use: a bare widget ARRAY came back as "widget: kein Objekt"
    // with a demand for an aura-tab envelope — while aura_write_tab took that very
    // array in the same conversation.
    const at = (id, x) => ({ ...OK_SWITCH, id, gridPos: { x, y: 0, w: 8, h: 4 } });
    const list = [at('a', 0), at('b', 8)];
    for (const [label, payload] of [
        ['bare array', list],
        ['{ widgets }', { widgets: list }],
        ['{ tab: { widgets } }', { tab: { widgets: list } }],
        ['aura-tab', { _type: 'aura-tab', tab: { name: 'T', widgets: list } }],
        ['one widget', OK_SWITCH],
        ['empty array', []],
    ]) {
        const res = validateAny(payload, schema);
        assert.deepEqual(res.errors, [], `${label}: ${res.errors.join(' | ')}`);
    }
});

check('a bare array still gets the rules that are about the whole list', () => {
    const at = (id, x) => ({ ...OK_SWITCH, id, gridPos: { x, y: 0, w: 8, h: 4 } });
    assert.ok(hasError(validateAny([at('a', 0), at('b', 4)], schema), /überlappen/), 'overlaps');
    assert.ok(hasError(validateAny([at('a', 0), at('a', 8)], schema), /mehrfach/), 'duplicate ids');
    // And the per-widget rules, with the index in the path.
    assert.ok(
        hasError(validateAny([at('a', 0), { ...at('b', 8), options: { showTitel: true } }], schema), /widgets\[1\]/),
    );
});

check('the name belongs to the aura-tab envelope, not to a widget list', () => {
    // `{ widgets: [...] }` is the list the write tools take; the name comes from
    // the target tab there. Demanding one would refuse a valid write payload.
    assert.deepEqual(validateAny({ widgets: [] }, schema).errors, []);
    assert.ok(hasError(validateAny({ _type: 'aura-tab', tab: { widgets: [] } }, schema), /"name" fehlt/));
});

check('allowedOptions merges own and shared keys', () => {
    const opts = allowedOptions('switch', schema);
    assert.ok('onValue' in opts && 'showTitle' in opts);
});

// ── Nested validation ────────────────────────────────────────────────────────
// Reported from the field: wrong operators and effect names passed silently,
// which is exactly what the validator is for — AURA ignores what it does not
// understand, so nothing else would ever say a word.

const withConditions = (conditions) => ({ ...OK_SWITCH, options: { conditions } });

check('a misspelled operator inside a clause is caught', () => {
    const res = validateWidget(
        withConditions([
            {
                id: 'c',
                logic: 'AND',
                clauses: [{ datapoint: 'hm-rpc.0.LEQ1.1.STATE', operator: 'gleich', value: '1' }],
                style: {},
            },
        ]),
        schema,
    );
    assert.ok(hasError(res, /clauses\[0\]\.operator: "gleich" ist nicht erlaubt/));
    assert.ok(hasError(res, /==/), 'the allowed operators must be listed');
});

check('an unknown effect name is caught', () => {
    const res = validateWidget(
        withConditions([{ id: 'c', logic: 'AND', clauses: [], style: {}, effect: 'flimmern' }]),
        schema,
    );
    assert.ok(hasError(res, /effect: "flimmern" ist nicht erlaubt/));
    assert.ok(hasError(res, /none, pulse, blink, border/));
});

check('a stray field inside a condition is caught, with a suggestion', () => {
    const res = validateWidget(
        withConditions([{ id: 'c', logic: 'AND', clauses: [], style: {}, hideWidgt: true }]),
        schema,
    );
    assert.ok(hasError(res, /"hideWidgt" gibt es hier nicht/));
    assert.ok(hasError(res, /meintest du "hideWidget"/));
});

check('a wrong value for a nested union is caught', () => {
    const res = validateWidget(withConditions([{ id: 'c', logic: 'XOR', clauses: [], style: {} }]), schema);
    assert.ok(hasError(res, /logic: "XOR" ist nicht erlaubt/));
});

check('a missing required field inside a nested object is caught', () => {
    const res = validateWidget(
        withConditions([{ id: 'c', logic: 'AND', clauses: [{ operator: '==', value: '1' }], style: {} }]),
        schema,
    );
    assert.ok(hasError(res, /clauses\[0\]: "datapoint" fehlt/));
});

check('conditions.elements has a shape now, keys and fields included', () => {
    // It was `elements?: object` — the most useful option in the schema with its
    // shape documented nowhere but inside one recipe, so it went unused.
    const spec = schema.types.WidgetCondition.fields.elements;
    assert.deepEqual(Object.keys(spec.fields).sort(), ['icon', 'title', 'value']);
    assert.equal(spec.fields.title.ref, 'ConditionElement');
    assert.ok(schema.types.ConditionElement, 'ConditionElement must be a named type');
    assert.deepEqual(Object.keys(schema.types.ConditionElement.fields).sort(), [
        'bold',
        'color',
        'fontSize',
        'icon',
        'iconSize',
        'italic',
        'show',
        'text',
    ]);

    const withElements = (elements) =>
        withConditions([
            {
                id: 'c',
                logic: 'AND',
                clauses: [{ datapoint: 'hm-rpc.0.LEQ1.1.STATE', operator: '>', value: '5', valueType: 'static' }],
                style: {},
                elements,
            },
        ]);
    assert.deepEqual(validateWidget(withElements({ title: { text: 'Alarm', bold: true } }), schema).errors, []);
    assert.ok(hasError(validateWidget(withElements({ titel: { text: 'x' } }), schema), /meintest du "title"/));
    assert.ok(hasError(validateWidget(withElements({ title: { fett: true } }), schema), /"fett" gibt es hier nicht/));
});

check('a correct condition passes all the way down', () => {
    const res = validateWidget(
        withConditions([
            {
                id: 'c',
                logic: 'OR',
                clauses: [{ datapoint: 'hm-rpc.0.LEQ1.1.STATE', operator: '>', value: '5', valueType: 'static' }],
                style: { accent: '#f00' },
                effect: 'pulse',
                hideWidget: true,
                visibilityMode: 'showOnMatch',
            },
        ]),
        schema,
    );
    assert.deepEqual(res.errors, []);
});

check('badges are checked the same way', () => {
    const bad = validateWidget({ ...OK_SWITCH, options: { badges: [{ id: 'b', size: 'riesig' }] } }, schema);
    assert.ok(hasError(bad, /size/), `expected a size complaint, got: ${bad.errors.join(' | ')}`);
});

check('an unresolved type is not used to reject valid configuration', () => {
    // Types the generator could not resolve carry no `fields`; treating that as
    // "no key is allowed" would reject perfectly good widgets.
    const unresolved = Object.entries(schema.types).filter(([, t]) => !t.fields && !t.enum && !t.tuple);
    for (const [name, t] of unresolved) {
        assert.ok(!t.fields, `${name} unexpectedly has fields`);
    }
    // A tuple-typed value on a widget that has the option: resolved, so checked.
    const dimmer = { ...OK_SWITCH, type: 'dimmer', options: { colorThresholds: [[20, '#f00']] } };
    assert.deepEqual(validateWidget(dimmer, schema).errors, []);
    // And an object type the generator could not resolve (Partial<Record<…>>):
    // its keys are unknowable here, so none of them may be rejected.
    const list = { ...OK_SWITCH, type: 'list', options: { statIcons: { sum: 'Sigma', avg: 'Divide' } } };
    assert.deepEqual(validateWidget(list, schema).errors, []);
});

// ── Type resolution ──────────────────────────────────────────────────────────

check('every type the schema references is also defined', () => {
    const refs = new Set();
    const walk = (o) => {
        if (!o || typeof o !== 'object') {
            return;
        }
        if (o.ref) {
            refs.add(o.ref);
        }
        Object.values(o).forEach(walk);
    };
    walk(schema);
    const missing = [...refs].filter((r) => !schema.types[r]);
    assert.deepEqual(missing, [], 'referenced but undefined — a consumer cannot resolve these');
});

check('the condition types are fully described, valueType included', () => {
    // Reported as missing: they were left as bare names because the resolver
    // stopped one level too early.
    for (const name of ['ConditionClause', 'ConditionStyle', 'MessageDraft', 'BadgeDef', 'BadgeSize', 'ClickAction']) {
        assert.ok(schema.types[name], `${name} must be defined`);
    }
    assert.ok(schema.types.ConditionClause.fields.valueType, 'valueType belongs to ConditionClause');
    assert.deepEqual(schema.types.ConditionClause.fields.valueType.enum, ['static', 'datapoint']);
    // BadgeSize is a mixed union: three presets or a pixel number.
    assert.deepEqual(schema.types.BadgeSize.enum, ['sm', 'md', 'lg']);
    assert.deepEqual(schema.types.BadgeSize.type, ['string', 'number']);
});

check('WidgetCondition carries no "set" field — that type is never persisted', () => {
    // ConditionSet is the derived, in-memory override WidgetFrame hands to a
    // widget; stripRenderOverrides() keeps it out of the stored config on
    // purpose, so advertising it would invite writing something that is thrown
    // away on the next save.
    assert.ok(!schema.types.WidgetCondition.fields.set, 'set must not be part of the stored shape');
});

// ── Sizing ───────────────────────────────────────────────────────────────────
// The measured numbers come from tools/schema/measure-widget-metrics.mjs; what is
// checked here is the arithmetic on top of them, which is what a model gets wrong.

const METRICS = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/ai/aura-widget-metrics.json'), 'utf8'));
const GRID = { rowHeight: 20, snapX: 20, gap: 10 };

check('rows and pixels convert both ways, gaps included', () => {
    assert.equal(rowsToPx(14, GRID), 14 * 20 + 13 * 10);
    assert.equal(rowsToPx(1, GRID), 20);
    assert.equal(rowsToPx(0, GRID), 0);
    // The inverse must be the smallest height that covers the pixels.
    assert.equal(pxToRows(rowsToPx(14, GRID), GRID), 14);
    assert.equal(pxToRows(rowsToPx(14, GRID) + 1, GRID), 15);
});

const listWidget = (n, h) => ({
    id: `l${n}`,
    type: 'list',
    title: 'Liste',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 10, h },
    options: { entries: Array.from({ length: n }, (_, i) => ({ id: `demo.${i}` })) },
});

check('the question that started this: do 16 list rows fit in h=14?', () => {
    const m = measureWidget(listWidget(16, 14), { metrics: METRICS, grid: GRID });
    assert.equal(m.items, 16);
    assert.equal(m.verdict, 'zu klein');
    // Not an opinion: 66 px + 16 × 33 px against 14 rows of 20 px plus 13 gaps.
    assert.equal(m.requiredPx, METRICS.counted.list.basePx + 16 * METRICS.counted.list.perItemPx);
    assert.ok(m.needRows > 14, `needRows should exceed 14, got ${m.needRows}`);
    assert.ok(rowsToPx(m.needRows, GRID) >= m.requiredPx, 'the suggested height must actually fit');
    assert.ok(rowsToPx(m.needRows - 1, GRID) < m.requiredPx, 'and must not be one row too generous');
});

check('a height with room to spare passes without a complaint', () => {
    const m = measureWidget(listWidget(4, 12), { metrics: METRICS, grid: GRID });
    assert.equal(m.verdict, 'passt');
    assert.ok(m.slackPx > 0);
});

check('a type measured only as a minimum is compared against that', () => {
    const gauge = { id: 'g', type: 'gauge', title: 'G', datapoint: 'demo.value', gridPos: { x: 0, y: 0, w: 8, h: 3 } };
    const m = measureWidget(gauge, { metrics: METRICS, grid: GRID });
    assert.equal(m.requiredPx, METRICS.minimum.gauge.minPx);
    assert.equal(m.verdict, 'zu klein');
});

check('a runtime-filled list says so, and computes once given a row count', () => {
    const auto = { id: 'a', type: 'autolist', title: 'A', datapoint: '', gridPos: { x: 0, y: 0, w: 10, h: 8 } };
    assert.ok(!measureWidget(auto, { metrics: METRICS, grid: GRID }).requiredPx);
    assert.match(measureWidget(auto, { metrics: METRICS, grid: GRID }).unknown, /Laufzeit/);
    const withCount = measureWidget(auto, { metrics: METRICS, grid: GRID, items: 16 });
    assert.equal(withCount.requiredPx, METRICS.counted.list.basePx + 16 * METRICS.counted.list.perItemPx);
});

// Reported from the field: a working energiebilanz WITH bars was told it "braucht
// konfigurierte Balken". The reason belongs to the type, nothing here reads the
// widget — but in the slot where a verdict goes it was read as a finding, and the
// answer was a second look at a widget that is fine.
check('a type without a measurement says so, and does not sound like a finding', () => {
    const pv = {
        id: 'pv',
        type: 'energiebilanz',
        title: 'PV',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 20, h: 14 },
        options: { bars: [{ id: 'b1', title: 'Erzeugung', entries: [{ id: 'e1', datapointId: 'demo.value' }] }] },
    };
    const m = measureWidget(pv, { metrics: METRICS, grid: GRID });
    assert.ok(!m.requiredPx);
    assert.ok(!m.unknown, 'a type-level reason is not an ask the caller can answer');
    assert.ok(m.unmeasured, 'it is the absence of a number for the type');
    assert.ok(!/braucht/.test(m.unmeasured), 'the reason must not read as a demand on this widget');
    const out = renderMeasure([m], { grid: GRID, metrics: METRICS });
    assert.match(out, /nicht gemessen \(energiebilanz:/);
    assert.match(out, /kein Befund/, 'the answer has to say once that this is not a finding');

    // Same type, chartStyle 'donut' — reported alongside the bar one, so the
    // reason has to hold for both styles and must not talk only about bars.
    const ring = { ...pv, id: 'donut', options: { ...pv.options, chartStyle: 'donut', pieSize: 70 } };
    const r = measureWidget(ring, { metrics: METRICS, grid: GRID });
    assert.equal(r.unmeasured, m.unmeasured, 'the reason belongs to the type, not to a style');
    assert.match(r.unmeasured, /Ringe/, 'a donut is not a row of bars');
});

check('without the metrics file the geometry half still answers', () => {
    const m = measureWidget(listWidget(16, 14), { metrics: null, grid: GRID });
    assert.equal(m.availPx, rowsToPx(14, GRID));
    assert.ok(!m.requiredPx);
    assert.match(renderMeasure([m], { grid: GRID }), /h Zeilen = h × 20/);
});

check('the grid of this dashboard is used, not the default one', () => {
    const tight = { rowHeight: 10, snapX: 20, gap: 0 };
    const m = measureWidget(listWidget(16, 14), { metrics: METRICS, grid: tight });
    assert.equal(m.availPx, 140);
    assert.equal(m.needRows, Math.ceil(m.requiredPx / 10));
});

// ── A row is not one shape ───────────────────────────────────────────────────
// Reported from use: the same list with and without subDps, and in every layout,
// produced exactly the same number. A shutter list built to that "minimum"
// scrolled and had to be rebuilt.

const withSubDps = (n, h) => {
    const w = listWidget(n, h);
    return {
        ...w,
        options: { entries: w.options.entries.map((e) => ({ ...e, subDps: [{ id: 'demo.sub' }] })) },
    };
};

check('a second line under every entry costs height', () => {
    const plain = measureWidget(listWidget(8, 14), { metrics: METRICS, grid: GRID });
    const sub = measureWidget(withSubDps(8, 14), { metrics: METRICS, grid: GRID });
    assert.ok(sub.requiredPx > plain.requiredPx, `${sub.requiredPx} must exceed ${plain.requiredPx}`);
    // Measured at ~15 px per row, so eight rows are worth more than a grid row.
    assert.ok(sub.requiredPx - plain.requiredPx > 100);
    assert.match(sub.basis, /subDps/);
});

/** A list of `n` rows of which the first `withSub` have a second line. */
const someSubDps = (n, withSub, h = 25) => {
    const w = listWidget(n, h);
    return {
        ...w,
        options: {
            entries: w.options.entries.map((e, i) => (i < withSub ? { ...e, subDps: [{ id: 'demo.sub' }] } : e)),
        },
    };
};
const SUB_PX = METRICS.counted.list.modifiers.find((m) => m.key === 'subDps').perItemPx;

check('the second line is charged to the rows that have one', () => {
    // Reported from use: the surcharge was added to the widget's per-item height,
    // so it was multiplied by EVERY row. A list of twelve with four second lines
    // came back 123 px too big — and the answer said so itself ("12 × 48.3
    // px/Zeile — zweite Zeile je Eintrag").
    const base = METRICS.counted.list.basePx;
    const row = METRICS.counted.list.perItemPx;
    for (const [n, withSub] of [
        [12, 4],
        [12, 1],
        [5, 2],
        [7, 7],
        [12, 0],
    ]) {
        const m = measureWidget(someSubDps(n, withSub), { metrics: METRICS, grid: GRID });
        assert.equal(
            m.requiredPx,
            Math.round(base + n * row + withSub * SUB_PX),
            `${n} rows, ${withSub} with a second line: ${m.basis}`,
        );
    }
});

check('and the answer counts them instead of claiming every row', () => {
    const m = measureWidget(someSubDps(12, 4), { metrics: METRICS, grid: GRID });
    assert.match(m.basis, /12 × 33 px\/Zeile/, 'the row height stays the plain one');
    assert.match(m.basis, /4 × zweite Zeile je Eintrag/, 'and the second line is counted');
    assert.equal(m.perRow.length, 1);
    // The old text put the surcharge INTO the per-item number, which is what made
    // the mistake invisible in the answer.
    assert.ok(!/12 × 48/.test(m.basis), m.basis);
});

check('where every row has one, both sums agree — which is why it stood', () => {
    const all = measureWidget(withSubDps(8, 25), { metrics: METRICS, grid: GRID });
    const counted = measureWidget(someSubDps(8, 8), { metrics: METRICS, grid: GRID });
    assert.equal(all.requiredPx, counted.requiredPx);
    assert.equal(
        all.requiredPx,
        Math.round(METRICS.counted.list.basePx + 8 * (METRICS.counted.list.perItemPx + SUB_PX)),
    );
});

check('a capped list counts only the rows it shows', () => {
    // maxRows cuts the list off; the rows below the cap are not drawn and their
    // second line is not drawn either. On the DYNAMIC list — the static one does
    // not read the option (see below).
    const w = someSubDps(12, 12);
    const capped = { ...w, type: 'autolist', options: { ...w.options, maxRows: 4 } };
    const m = measureWidget(capped, { metrics: METRICS, grid: GRID });
    assert.equal(m.items, 4);
    assert.equal(m.requiredPx, Math.round(METRICS.counted.list.basePx + 4 * (METRICS.counted.list.perItemPx + SUB_PX)));
});

check('a cap the widget does not read is not applied', () => {
    // Measured in the browser: a static list with maxRows: 4 draws all nine rows.
    // The option was in its schema only because the option reader followed an
    // import into the dynamic list — and the measurement believed it, reporting
    // four rows where nine are drawn. The mirror image of every other finding
    // here: too SMALL a number, and the list then scrolls.
    const w = { ...listWidget(9, 20), options: { ...listWidget(9, 20).options, maxRows: 4 } };
    const m = measureWidget(w, { metrics: METRICS, grid: GRID });
    assert.equal(m.items, 9);
    assert.ok(!m.moreRow, 'and no footer row is promised either');
    // The dynamic list and the status overview do read it.
    for (const type of ['autolist', 'statusoverview']) {
        const runtime = measureWidget(
            { id: 'r', type, title: 'R', datapoint: '', gridPos: { x: 0, y: 0, w: 8, h: 10 }, options: { maxRows: 4 } },
            { metrics: METRICS, grid: GRID },
        );
        assert.equal(runtime.items, 4, type);
    }
});

const modPx = (key) => METRICS.counted.list.modifiers.find((m) => m.key === key).perItemPx;

// ── The timestamp under a row ────────────────────────────────────────────────
// Reported from use: `showEntryLastChange` was not in the number at all. It hangs
// a "vor 3 Min. aktualisiert" line under every row (measured: +13.7 px), so a
// dynamic list of twelve was short by 164 px.
//
// Two forms, and they need different arithmetic — the static list reads
// `entries[].showLastChange` (per row), the dynamic one has the list-wide
// `showEntryLastChange` (every row). Both are measured on the same rendering.

check('the timestamp line is in the number, per row where it is per row', () => {
    const perEntry = modPx('lastChangePerEntry');
    assert.ok(perEntry > 10, `a timestamp line is worth something, got ${perEntry}`);
    const rows = (n, withStamp) => ({
        ...listWidget(n, 25),
        options: {
            entries: Array.from({ length: n }, (_, i) => ({
                id: `demo.${i}`,
                ...(i < withStamp ? { showLastChange: true } : {}),
            })),
        },
    });
    const plain = measureWidget(rows(12, 0), { metrics: METRICS, grid: GRID });
    const some = measureWidget(rows(12, 4), { metrics: METRICS, grid: GRID });
    const all = measureWidget(rows(12, 12), { metrics: METRICS, grid: GRID });
    assert.equal(some.requiredPx, Math.round(plain.requiredPx + 4 * perEntry));
    assert.equal(all.requiredPx, Math.round(plain.requiredPx + 12 * perEntry));
    assert.match(some.basis, /4 × Zeitstempel je Eintrag/, some.basis);
});

check('and for the whole list where the option is list-wide', () => {
    // The reported widget: a dynamic list of twelve with the list-wide switch on.
    const listWide = modPx('lastChangeList');
    const auto = {
        id: 'w-diag',
        type: 'autolist',
        title: 'Verbindungen & Diagnose',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 12, h: 25 },
        options: { maxRows: 12 },
    };
    const plain = measureWidget(auto, { metrics: METRICS, grid: GRID });
    const stamped = measureWidget(
        { ...auto, options: { ...auto.options, showEntryLastChange: true } },
        { metrics: METRICS, grid: GRID },
    );
    assert.equal(stamped.items, 12);
    assert.equal(stamped.requiredPx, Math.round(plain.requiredPx + 12 * listWide));
    // Every row, so it belongs in the per-item number rather than in a count.
    assert.match(stamped.basis, /Zeitstempel je Zeile/, stamped.basis);
    assert.ok(stamped.requiredPx - plain.requiredPx > 150, 'the reported ~170 px');
});

check('the static list is not charged for an option it does not read', () => {
    // `showEntryLastChange` on a static list draws nothing (measured in the
    // browser) — and it is not in its schema any more either.
    const w = { ...listWidget(12, 25), options: { ...listWidget(12, 25).options, showEntryLastChange: true } };
    const m = measureWidget(w, { metrics: METRICS, grid: GRID });
    const plain = measureWidget(listWidget(12, 25), { metrics: METRICS, grid: GRID });
    assert.equal(m.requiredPx, plain.requiredPx);
    assert.ok(hasError(validateWidget(w, schema), /liest die Option "showEntryLastChange" nicht/));
});

const DIVIDER_PX = METRICS.counted.list.rowTypes.divider.perItemPx;

check('a separator carrying the field is not a row with a second line', () => {
    const w = {
        ...listWidget(3, 25),
        options: {
            entries: [
                { id: 'demo.a', subDps: [{ id: 'demo.sub' }] },
                { id: 'demo.sep', divider: true, subDps: [{ id: 'demo.sub' }] },
                { id: 'demo.b' },
            ],
        },
    };
    const m = measureWidget(w, { metrics: METRICS, grid: GRID });
    assert.equal(
        m.requiredPx,
        Math.round(METRICS.counted.list.basePx + 3 * METRICS.counted.list.perItemPx + SUB_PX + DIVIDER_PX),
    );
});

// ── The separator: a row, and a shorter one ──────────────────────────────────
// Reported from use: the footnote said separators were "not included" while the
// row count charged a full content row for each. Both halves wrong at once — the
// sentence read as "add space per separator", which is what the reader did, on
// top of a number that was already too big.

check('a separator is counted as a row, and as the shorter row it is', () => {
    assert.ok(DIVIDER_PX < 0, `a separator is shorter than a content row, got ${DIVIDER_PX}`);
    const rows = (n, dividers) => ({
        ...listWidget(n, 25),
        options: {
            entries: Array.from({ length: n }, (_, i) =>
                i > 0 && i <= dividers ? { id: `demo.sep${i}`, divider: true } : { id: `demo.${i}` },
            ),
        },
    });
    const plain = measureWidget(rows(6, 0), { metrics: METRICS, grid: GRID });
    const two = measureWidget(rows(6, 2), { metrics: METRICS, grid: GRID });
    // The reported case: six entries, two of them separators. The row count stays
    // six — that part was right and is what the answer showed.
    assert.equal(two.items, 6);
    assert.match(two.basis, /6 × 33 px\/Zeile/);
    assert.equal(two.requiredPx, Math.round(plain.requiredPx + 2 * DIVIDER_PX));
    assert.match(two.basis, /2 × Trennzeile/, two.basis);
});

// ── The dashboard's own presentation ─────────────────────────────────────────
// Reported from a running dashboard: every list came out wrong, one way below
// three rows and the other way above it. The installation runs widgetPadding 8
// and fontScale 1.3, the metrics are measured at 16 and 1 — 14 px too much
// chrome and 4.8 px too little per row, which cancel at three rows and diverge
// from there (a twelve-row list came back 50 px short, and the "use h=15" advice
// still scrolled). Both are read from the dashboard now.

// A stale metrics file would otherwise take the whole suite down with a
// TypeError instead of saying what is missing.
const REF_PRESENTATION = METRICS.$meta.reference ?? { fontScale: 1, widgetPaddingPx: 16 };

check('the metrics file says what presentation it was measured at', () => {
    assert.ok(METRICS.$meta.reference, 'run npm run metrics — the file predates the presentation correction');
    assert.ok(METRICS.counted.list.fontScalePx, 'the list must carry what a font-scale step is worth');
});
const AT = (fontScale, widgetPadding) => ({
    metrics: METRICS,
    grid: GRID,
    presentation: { fontScale, widgetPadding },
});

check('a dashboard drawn like the measurement gets the measured numbers', () => {
    const plain = measureWidget(listWidget(8, 25), { metrics: METRICS, grid: GRID });
    const same = measureWidget(listWidget(8, 25), AT(REF_PRESENTATION.fontScale, REF_PRESENTATION.widgetPaddingPx));
    assert.equal(same.requiredPx, plain.requiredPx);
    // And it does not say anything about a presentation nobody changed.
    assert.ok(!/Darstellung dieses Dashboards/.test(renderMeasure([plain], { grid: GRID, metrics: METRICS })));
});

check('the inner padding sits twice in the chrome — two pixels per pixel', () => {
    const ref = REF_PRESENTATION.widgetPaddingPx;
    const at = (pad) => measureWidget(listWidget(8, 25), AT(1, pad)).requiredPx;
    assert.equal(at(ref) - at(ref - 8), 16);
    assert.equal(at(ref + 8) - at(ref), 16);
    // A minimum is a card too — it carries the padding just the same.
    const gauge = { id: 'g', type: 'gauge', title: 'G', datapoint: 'demo.value', gridPos: { x: 0, y: 0, w: 8, h: 3 } };
    assert.equal(measureWidget(gauge, AT(1, ref)).requiredPx - measureWidget(gauge, AT(1, ref - 8)).requiredPx, 16);
});

check('the frame types that have no padding are not corrected for it', () => {
    // WidgetFrame draws these edge to edge (isNoPad) — correcting them would
    // invent a gutter that is not there.
    const iframe = { id: 'h', type: 'header', title: 'H', datapoint: '', gridPos: { x: 0, y: 0, w: 8, h: 2 } };
    const tight = measureWidget(iframe, AT(1, 0)).requiredPx;
    const wide = measureWidget(iframe, AT(1, 40)).requiredPx;
    if (tight && wide) {
        assert.equal(tight, wide, 'a widget drawn without padding does not react to the setting');
    }
});

check('the font scale stretches the rows, and the answer says so', () => {
    const one = measureWidget(listWidget(10, 25), AT(1, 16));
    const big = measureWidget(listWidget(10, 25), AT(1.3, 16));
    const rowSlope = METRICS.counted.list.fontScalePx.perItemPx;
    assert.ok(rowSlope > 0, 'a list row grows with the font scale');
    // Ten rows, three tenths of a scale step: the whole difference is the rows.
    assert.equal(big.requiredPx - one.requiredPx, Math.round(10 * rowSlope * 0.3));
    assert.ok(big.needRows > one.needRows, 'and it costs grid rows, which is the point');
    const out = renderMeasure([big], { grid: GRID, metrics: METRICS, presentation: { fontScale: 1.3 } });
    assert.match(out, /Schriftskalierung 1\.3/, out);
    assert.match(out, /umgerechnet/, out);
});

check('a row of fixed height stops the surcharge instead of scaling it', () => {
    // A contact chip is text: its +4 px is +4 px at every scale. A shutter row is
    // a control 43 px tall: its +10 px shrinks as the text grows and is gone once
    // the text has passed it. Measured at two scales, told apart by `addPx`.
    const rowsOf = (dt) => ({
        ...listWidget(6, 25),
        options: { entries: Array.from({ length: 6 }, (_, i) => ({ id: `demo.${i}`, displayType: dt })) },
    });
    const px = (dt, f) => measureWidget(rowsOf(dt), AT(f, 16)).requiredPx;
    const plain = (f) => measureWidget(listWidget(6, 25), AT(f, 16)).requiredPx;
    // The text row: the surcharge survives the scale unchanged.
    assert.equal(px('contact', 1) - plain(1), px('contact', 1.3) - plain(1.3));
    // The control: it stays where it is while the text row underneath it grows by
    // a fifth. Not exactly equal — the two ends are measured to a tenth of a
    // pixel, and six rows carry that rounding.
    const grew = px('shutter', 1.3) - px('shutter', 1);
    assert.ok(Math.abs(grew) <= 6, `a fixed control must not follow the scale, grew ${grew} px over 6 rows`);
    assert.ok(plain(1.3) - plain(1) > 20, 'while the text row does follow it');
    assert.ok(px('shutter', 1) > plain(1), 'and it is the taller row at scale 1');
});

check('the reported dashboard is measured the way it is drawn', () => {
    // The case from the report, end to end: ten value rows and two section
    // separators at padding 8 and scale 1.3 — measured at 480 px in the browser.
    const entries = [
        ...Array.from({ length: 5 }, (_, i) => ({ id: `demo.a${i}` })),
        { id: 'demo.sep1', divider: true, dividerLabel: 'Abschnitt' },
        ...Array.from({ length: 3 }, (_, i) => ({ id: `demo.b${i}` })),
        { id: 'demo.sep2', divider: true, dividerLabel: 'Abschnitt' },
        ...Array.from({ length: 2 }, (_, i) => ({ id: `demo.c${i}` })),
    ];
    const w = { ...listWidget(12, 9), options: { entries } };
    const m = measureWidget(w, AT(1.3, 8));
    assert.ok(Math.abs(m.requiredPx - 480) <= 12, `expected about 480 px, got ${m.requiredPx} — ${m.basis}`);
    // And the advice has to fit on the first try: h=9 was reported as needing
    // h=15, which still scrolled.
    assert.ok(rowsToPx(m.needRows, GRID) >= m.requiredPx, 'the suggested height must actually fit');
});

check('a separator with a heading is not the bare rule', () => {
    // The metrics only ever measured a separator without a heading (the harness
    // set `name`, the widget reads `dividerLabel`), so every list with section
    // titles came back short by nearly a row per title.
    const sep = (label) => ({
        ...listWidget(6, 25),
        options: {
            entries: [
                { id: 'demo.0' },
                { id: 'demo.sep', divider: true, ...(label ? { dividerLabel: 'Abschnitt' } : {}) },
                ...Array.from({ length: 4 }, (_, i) => ({ id: `demo.${i + 1}` })),
            ],
        },
    });
    const bare = measureWidget(sep(false), { metrics: METRICS, grid: GRID });
    const titled = measureWidget(sep(true), { metrics: METRICS, grid: GRID });
    assert.ok(titled.requiredPx > bare.requiredPx, `a heading is a line of text: ${titled.basis}`);
    assert.match(titled.basis, /Überschrift/, titled.basis);
});

check('the footnote no longer claims separators are left out', () => {
    // The exact sentence that misled: "Raum-Überschriften (groupByRoom) und
    // Trennzeilen (entries[].divider)" under every measurement.
    const out = renderMeasure([measureWidget(listWidget(8, 25), { metrics: METRICS, grid: GRID })], {
        grid: GRID,
        metrics: METRICS,
    });
    assert.ok(!/Trennzeilen \(entries\[\]\.divider\)/.test(out), out);
    assert.match(out, /groupByRoom/, 'the room headings are still not included — those are not rows');
});

check('every layout knows its own separator', () => {
    // A separator is 17 px in every layout, but the row it replaces is not: in
    // `compact` two content rows share a grid row, so a full-width separator
    // costs MORE there, not less.
    for (const layout of ['card', 'compact', 'minimal']) {
        const d = METRICS.counted.list.variants[layout].rowTypes?.divider;
        assert.ok(d, `${layout} must carry a measured separator`);
        const w = {
            ...listWidget(4, 25),
            layout,
            options: {
                entries: [{ id: 'demo.0' }, { id: 'demo.sep', divider: true }, { id: 'demo.1' }, { id: 'demo.2' }],
            },
        };
        const plain = measureWidget({ ...listWidget(4, 25), layout }, { metrics: METRICS, grid: GRID });
        const withSep = measureWidget(w, { metrics: METRICS, grid: GRID });
        assert.equal(withSep.requiredPx, Math.round(plain.requiredPx + d.perItemPx), `${layout}: ${withSep.basis}`);
    }
    assert.ok(
        METRICS.counted.list.variants.compact.rowTypes.divider.perItemPx > 0,
        'the compact separator costs more than the half row it replaces',
    );
});

check('the layout re-measures the row instead of being ignored', () => {
    const px = (layout) => measureWidget({ ...listWidget(8, 14), layout }, { metrics: METRICS, grid: GRID }).requiredPx;
    const plain = px(undefined);
    assert.ok(px('compact') < plain, 'compact rows are shorter');
    assert.ok(px('card') > plain, 'card rows are taller');
    assert.match(
        measureWidget({ ...listWidget(8, 14), layout: 'card' }, { metrics: METRICS, grid: GRID }).basis,
        /card/,
    );
});

check('a factor that changes nothing is named as measured, not left out', () => {
    // showTitle alone keeps the header row (the icon holds it open) — the honest
    // answer is "looked at, ±0", not silence.
    const w = listWidget(8, 14);
    const m = measureWidget({ ...w, options: { ...w.options, showTitle: false } }, { metrics: METRICS, grid: GRID });
    const plain = measureWidget(w, { metrics: METRICS, grid: GRID });
    assert.equal(m.requiredPx, plain.requiredPx);
    assert.ok(
        m.applied.some((a) => /±0/.test(a)),
        `expected a measured zero, got ${JSON.stringify(m.applied)}`,
    );
    // Title AND icon off does remove the row.
    const bare = measureWidget(
        { ...w, options: { ...w.options, showTitle: false, showIcon: false } },
        { metrics: METRICS, grid: GRID },
    );
    assert.ok(bare.requiredPx < plain.requiredPx - 20, 'the header row is worth about 34 px');
});

// ── The row display ──────────────────────────────────────────────────────────
// Reported from use: "44 px Luft" for a list that scrolls. The default row was
// measured as a value row (33 px); a contact or a state chip is taller, and
// eleven of them ate exactly that slack.

const ROW_TYPES = METRICS.counted.list.rowTypes;
const CARD_ROW_TYPES = METRICS.counted.list.variants.card.rowTypes;
/** The measured surcharge of one display, in the default layout. */
const rowPx = (dt) => ROW_TYPES[dt]?.perItemPx ?? 0;
/** A list of `n` rows, all drawn with the same display. */
const listOf = (n, displayType, h = 14) => ({
    ...listWidget(n, h),
    options: { entries: Array.from({ length: n }, (_, i) => ({ id: `demo.${i}`, displayType })) },
});

check('a taller row display is charged, and only where it was measured', () => {
    assert.ok(rowPx('contact') > 0, 'the contact chip is the taller row — that is the whole finding');
    const plain = measureWidget(listWidget(8, 14), { metrics: METRICS, grid: GRID });
    const contact = measureWidget(listOf(8, 'contact'), { metrics: METRICS, grid: GRID });
    assert.equal(contact.requiredPx - plain.requiredPx, 8 * rowPx('contact'));
    assert.match(contact.basis, /je Zeilenform/, 'the answer names what it added');
    assert.ok(contact.needRows > plain.needRows, 'and it reaches the height, not only the text');
});

check('a list that mixes displays is summed row by row', () => {
    const mixed = {
        ...listWidget(8, 14),
        options: {
            entries: [
                ...Array.from({ length: 4 }, (_, i) => ({ id: `demo.v${i}`, displayType: 'value' })),
                ...Array.from({ length: 4 }, (_, i) => ({ id: `demo.c${i}`, displayType: 'contact' })),
            ],
        },
    };
    const m = measureWidget(mixed, { metrics: METRICS, grid: GRID });
    const plain = measureWidget(listWidget(8, 14), { metrics: METRICS, grid: GRID });
    // Neither eight value rows nor eight contact rows — that is why it is per row.
    assert.equal(m.requiredPx - plain.requiredPx, 4 * rowPx('value') + 4 * rowPx('contact'));
    assert.equal(m.rowTypes.length, 1, 'only the display that costs something is named');
});

check('the list-wide display block reaches the rows that have none', () => {
    const base = listWidget(8, 14);
    const wide = { ...base, options: { ...base.options, entryDisplay: { displayType: 'contact' } } };
    const plain = measureWidget(base, { metrics: METRICS, grid: GRID });
    assert.equal(
        measureWidget(wide, { metrics: METRICS, grid: GRID }).requiredPx - plain.requiredPx,
        8 * rowPx('contact'),
    );
    // Precedence is all-or-nothing per row: an entry with a display of its own is
    // configured on its own and ignores the list-wide block (listDisplayDefaults.ts).
    const own = {
        ...wide,
        options: {
            ...wide.options,
            entries: base.options.entries.map((e, i) => (i ? e : { ...e, displayType: 'value' })),
        },
    };
    assert.equal(
        measureWidget(own, { metrics: METRICS, grid: GRID }).requiredPx - plain.requiredPx,
        7 * rowPx('contact') + rowPx('value'),
    );
});

check('a capped autolist is charged for the display its rows will have', () => {
    const auto = {
        id: 'a',
        type: 'autolist',
        title: 'Fenster',
        gridPos: { x: 0, y: 0, w: 8, h: 10 },
        options: { maxRows: 8 },
    };
    const plain = measureWidget(auto, { metrics: METRICS, grid: GRID });
    const contacts = measureWidget(
        { ...auto, options: { ...auto.options, entryDisplay: { displayType: 'contact' } } },
        { metrics: METRICS, grid: GRID },
    );
    // Its rows appear at runtime, but every one of them starts from the list-wide
    // block — so this is knowable, and it was the list in the report.
    assert.equal(contacts.requiredPx - plain.requiredPx, 8 * rowPx('contact'));
});

check('the surcharge is the one measured in that layout', () => {
    const cardSlider = CARD_ROW_TYPES.slider?.perItemPx ?? 0;
    assert.notEqual(cardSlider, rowPx('slider'), 'a card cell is not a default row');
    const plain = measureWidget({ ...listWidget(8, 14), layout: 'card' }, { metrics: METRICS, grid: GRID });
    const slider = measureWidget({ ...listOf(8, 'slider'), layout: 'card' }, { metrics: METRICS, grid: GRID });
    assert.equal(slider.requiredPx - plain.requiredPx, 8 * cardSlider);
});

check('the badges layout is not charged for a display it draws itself', () => {
    // One pill per row, and the pill handles the displays on its own — a surcharge
    // measured on a default row would be an invention here.
    const m = measureWidget({ ...listOf(8, 'contact'), layout: 'minimal' }, { metrics: METRICS, grid: GRID });
    const plain = measureWidget({ ...listWidget(8, 14), layout: 'minimal' }, { metrics: METRICS, grid: GRID });
    assert.equal(m.requiredPx, plain.requiredPx);
});

check('a separator is a row of its own, not a display', () => {
    const w = {
        ...listWidget(3, 14),
        options: {
            entries: [
                { id: 'demo.a', displayType: 'contact' },
                { divider: true, id: 'demo.sep' },
                { id: 'demo.b', displayType: 'contact' },
            ],
        },
    };
    const m = measureWidget(w, { metrics: METRICS, grid: GRID });
    const plain = measureWidget(listWidget(3, 14), { metrics: METRICS, grid: GRID });
    // No display surcharge for the separator — it is not a contact row — but it is
    // a row of its own, and a shorter one (rowTypes.divider).
    assert.equal(m.requiredPx - plain.requiredPx, 2 * rowPx('contact') + DIVIDER_PX);
});

check('a modifier the layout ignores is not added to it', () => {
    // The badges layout draws a row as one pill and ignores subDps entirely.
    const m = measureWidget({ ...withSubDps(8, 14), layout: 'minimal' }, { metrics: METRICS, grid: GRID });
    const plain = measureWidget({ ...listWidget(8, 14), layout: 'minimal' }, { metrics: METRICS, grid: GRID });
    assert.equal(m.requiredPx, plain.requiredPx);
});

check('a capped runtime list becomes measurable', () => {
    // Reported from use: statusoverview and autolist could not be capped, so on a
    // dashboard that must not scroll they were unusable — their height was only
    // ever a runtime fact.
    const auto = { id: 'a', type: 'autolist', title: 'Heizung', gridPos: { x: 0, y: 0, w: 8, h: 10 }, options: {} };
    const open = measureWidget(auto, { metrics: METRICS, grid: GRID });
    assert.ok(!open.requiredPx, 'without a cap there is nothing to measure');
    assert.match(open.unknown, /maxRows/, 'and the answer names the way out');

    const capped = measureWidget({ ...auto, options: { maxRows: 8 } }, { metrics: METRICS, grid: GRID });
    assert.equal(capped.items, 8);
    assert.ok(capped.requiredPx > 0);
    assert.equal(capped.needRows, pxToRows(capped.requiredPx, GRID));

    // A dynamic list capped below the row count it found follows the cap.
    const short = measureWidget({ ...auto, options: { maxRows: 4 } }, { metrics: METRICS, grid: GRID, items: 16 });
    assert.equal(short.items, 16, 'an explicit count from the caller wins');
    const noCount = measureWidget({ ...auto, options: { maxRows: 4 } }, { metrics: METRICS, grid: GRID });
    assert.equal(noCount.items, 4);
});

check('the footer row is named as not included, not silently added', () => {
    const w = { id: 'a', type: 'autolist', title: 'x', gridPos: { x: 0, y: 0, w: 8, h: 10 }, options: { maxRows: 6 } };
    const out = renderMeasure([measureWidget(w, { metrics: METRICS, grid: GRID })], { grid: GRID, metrics: METRICS });
    assert.match(out, /„\+N weitere“-Zeile steckt nicht in der Zahl/);
    const off = { ...w, options: { maxRows: 6, showMore: false } };
    const outOff = renderMeasure([measureWidget(off, { metrics: METRICS, grid: GRID })], {
        grid: GRID,
        metrics: METRICS,
    });
    assert.ok(!/weitere“-Zeile steckt nicht/.test(outOff));
});

check('the answer says which factors are NOT in the number', () => {
    const out = renderMeasure([measureWidget(listWidget(8, 14), { metrics: METRICS, grid: GRID })], {
        grid: GRID,
        metrics: METRICS,
    });
    assert.match(out, /Nicht eingerechnet:/);
    assert.match(out, /Filterzeile/);
});

check('adding up several measured factors is called an approximation', () => {
    const w = withSubDps(8, 14);
    const m = measureWidget(
        { ...w, layout: 'card', options: { ...w.options, showTitle: false, showIcon: false } },
        { metrics: METRICS, grid: GRID },
    );
    assert.ok(m.applied.length > 1);
    const out = renderMeasure([m], { grid: GRID, metrics: METRICS });
    assert.match(out, /Näherung/);
});

// ── The health check on what already exists ──────────────────────────────────

const AUDIT_PLACES = [
    {
        where: 'Wohnzimmer / Start / Klima',
        widgets: [
            // A dead datapoint, and an option this widget stopped reading.
            {
                id: 'w1',
                type: 'value',
                title: 'Temperatur',
                datapoint: 'zigbee.0.WEG',
                gridPos: { x: 0, y: 0, w: 8, h: 3 },
                options: { showLastChange: true },
            },
            // The datapoint exists but nothing has written to it in months.
            {
                id: 'w2',
                type: 'value',
                title: 'Alt',
                datapoint: 'zigbee.0.temp',
                gridPos: { x: 8, y: 0, w: 8, h: 3 },
                options: {},
            },
            // A shared setting one level too high, where nobody reads it.
            {
                id: 'w3',
                type: 'switch',
                title: 'Licht',
                datapoint: 'hm-rpc.0.LEQ1.1.STATE',
                gridPos: { x: 16, y: 0, w: 8, h: 3 },
                conditions: [],
                options: {},
            },
        ],
    },
    {
        where: 'Popup „Details“',
        // The same id twice: two widgets sharing their runtime state (issue #606).
        widgets: [{ id: 'w1', type: 'value', title: 'Kopie', datapoint: '', gridPos: { x: 0, y: 0, w: 8, h: 3 } }],
    },
    { where: 'Wohnzimmer / Start / Leer', widgets: [] },
];

const auditResult = auditDashboard({
    places: AUDIT_PLACES,
    schema,
    knownDatapoints: new Set(['hm-rpc.0.LEQ1.1.STATE', 'zigbee.0.temp']),
    stateValues: new Map([
        ['hm-rpc.0.LEQ1.1.STATE', { val: true, ts: 1_000_000_000_000 + 86400000 * 3 }],
        ['zigbee.0.temp', { val: 21.5, ts: 1_000_000_000_000 - 86400000 * 90 }],
    ]),
    orphanDefIds: ['g-verwaist'],
    now: 1_000_000_000_000 + 86400000 * 3,
});
const auditIds = auditResult.findings.map((f) => f.id);

check('the audit finds a dead datapoint and names where it sits', () => {
    assert.ok(auditIds.includes('dead-datapoints'));
    const f = auditResult.findings.find((x) => x.id === 'dead-datapoints');
    assert.match(f.items.join(' '), /Klima \/ w1 → "zigbee\.0\.WEG" \(datapoint\)/);
});

check('a datapoint nothing has written to in months is reported with its age', () => {
    const f = auditResult.findings.find((x) => x.id === 'stale-datapoints');
    assert.ok(f, `expected a stale finding, got ${auditIds.join(', ')}`);
    assert.match(f.items.join(' '), /zigbee\.0\.temp" \(93 Tage\)/);
});

check('an option the widget no longer reads is reported, not silently ignored', () => {
    const f = auditResult.findings.find((x) => x.id === 'ignored-options');
    assert.ok(f, 'showLastChange on a value widget must be named');
    assert.match(f.items.join(' '), /showLastChange/);
});

check('a shared setting written one level too high is reported', () => {
    const f = auditResult.findings.find((x) => x.id === 'misplaced-options');
    assert.ok(f);
    assert.match(f.items.join(' '), /conditions/);
});

check('a row setting left behind by a changed display is reported', () => {
    // The likeliest way to end up with one: the row was a switch, the display was
    // changed to a value, and the labels stayed in the configuration.
    const res = auditDashboard({
        places: [
            {
                where: 'Wohnzimmer / Start / Fenster',
                widgets: [
                    {
                        id: 'liste',
                        type: 'list',
                        title: 'Fenster',
                        datapoint: '',
                        gridPos: { x: 0, y: 0, w: 10, h: 8 },
                        options: { entries: [{ id: 'demo.a', displayType: 'value', trueLabel: 'AN' }] },
                    },
                ],
            },
        ],
        schema,
    });
    const f = res.findings.find((x) => x.id === 'display-mismatch');
    assert.ok(f, `expected the finding, got ${res.findings.map((x) => x.id).join(', ')}`);
    assert.match(f.items.join(' '), /Fenster \/ liste: Option "entries"/, 'with the place it sits in');
    assert.match(f.items.join(' '), /trueLabel bei displayType "value"/);
});

check('the same widget id in two places is a finding', () => {
    const f = auditResult.findings.find((x) => x.id === 'duplicate-ids');
    assert.ok(f);
    assert.match(f.items.join(' '), /"w1" in Wohnzimmer \/ Start \/ Klima und Popup/);
});

check('an empty tab and an orphaned group definition are named', () => {
    assert.ok(auditIds.includes('empty-places'));
    assert.ok(auditIds.includes('orphan-groups'));
});

check('the sweep reports the unlogged chart datapoint too', () => {
    const res = auditDashboard({
        places: [
            {
                where: 'Wohnzimmer / Start / Verlauf',
                widgets: [
                    {
                        id: 'c1',
                        type: 'echart',
                        title: 'Verlauf',
                        datapoint: 'zigbee.0.temp',
                        gridPos: { x: 0, y: 0, w: 20, h: 10 },
                        options: {
                            echartSeries: [
                                { id: 's1', name: 'Temperatur', datapointId: 'zigbee.0.temp', chartType: 'line' },
                            ],
                        },
                    },
                ],
            },
        ],
        schema,
        knownDatapoints: new Set(['zigbee.0.temp']),
        datapointMeta: new Map([['zigbee.0.temp', { type: 'number', write: false, logging: [] }]]),
    });
    const f = res.findings.find((x) => x.id === 'no-history');
    assert.ok(f, `expected a no-history finding, got ${res.findings.map((x) => x.id).join(', ')}`);
    assert.match(f.items.join(' '), /Verlauf \/ c1: Reihe s1/);
});

check('a clean dashboard says so instead of inventing findings', () => {
    const clean = auditDashboard({
        places: [{ where: 'Test', widgets: [OK_SWITCH] }],
        schema,
        knownDatapoints: new Set(['hm-rpc.0.LEQ1.1.STATE']),
    });
    assert.deepEqual(clean.findings, []);
    assert.match(renderAudit(clean, 'Test'), /nichts zu beanstanden/);
});

check('the rendered audit keeps one finding from filling the whole answer', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
        id: `x${i}`,
        type: 'value',
        title: `T${i}`,
        datapoint: 'weg.0.dp',
        gridPos: { x: 0, y: i, w: 4, h: 3 },
        options: {},
    }));
    const res = auditDashboard({ places: [{ where: 'Viel', widgets: many }], schema, knownDatapoints: new Set() });
    const out = renderAudit(res, 'Viel');
    assert.match(out, /\(\+25\)/, 'the tail must be summarised');
});

check('datapoints one level down are collected, dividers and placeholders are not', () => {
    const refs = collectDatapointRefs(
        {
            id: 'l1',
            type: 'list',
            title: 'Licht',
            datapoint: '',
            options: {
                entries: [
                    { id: 'hm-rpc.0.LEQ1.1.STATE', statusDp: 'zigbee.0.temp' },
                    // The real shape of a separator: `divider: true` (isDivider in
                    // ListWidget). A fixture with `type: 'divider'` pinned a rule
                    // that does not exist, and every actual separator in the field
                    // was reported as a dead datapoint.
                    { id: 'divider:1', divider: true, name: 'Abschnitt' },
                    { id: 'weg.0.dp', subDps: [{ id: 'zigbee.0.batt' }] },
                ],
                rowConditions: [{ id: 'regel-1', clauses: [{ datapoint: '{{parent}}.STATE' }] }],
            },
        },
        schema,
        { loose: true },
    );
    const ids = refs.map((r) => r.id);
    assert.ok(ids.includes('hm-rpc.0.LEQ1.1.STATE'));
    assert.ok(ids.includes('zigbee.0.temp'), 'a nested statusDp is a datapoint');
    assert.ok(ids.includes('zigbee.0.batt'), 'a second-line datapoint counts too');
    assert.ok(!ids.includes('divider:1'), 'a divider row carries no datapoint');
    assert.ok(!ids.includes('regel-1'), 'a rule id is not a datapoint');
    assert.ok(!ids.some((id) => id.includes('{{')), 'a placeholder is resolved per row and must not be checked');
});

check('a power reading is not a meter, whatever the datapoint is called', () => {
    // The reported false finding: midas-aquatemp.0.consumption is W, role
    // value.power — an instantaneous reading. "consumption" in the name had been
    // enough to suggest a delta aggregation, which is advice about another
    // datapoint entirely.
    const tile = (dp, options = {}) => ({
        id: 'v1',
        type: 'value',
        title: 'Leistung',
        datapoint: dp,
        gridPos: { x: 0, y: 0, w: 8, h: 3 },
        options,
    });
    const meta = new Map([
        ['midas.0.consumption', { unit: 'W', role: 'value.power' }],
        ['sm.0.total_energy', { unit: 'kWh', role: 'value.energy' }],
    ]);
    assert.equal(looksLikeCounter(tile('midas.0.consumption'), meta), false);
    assert.equal(looksLikeCounter(tile('sm.0.total_energy'), meta), true);
    // The unit set on the widget counts as evidence too.
    assert.equal(looksLikeCounter(tile('sm.0.verbrauch', { unit: 'W' })), false);
    // Nothing known at all: the name is all there is, and it may have its say.
    assert.equal(looksLikeCounter(tile('sm.0.verbrauch_total')), true);

    const findings = reviewWidgets([tile('midas.0.consumption')], meta);
    assert.ok(
        !findings.some((f) => f.id === 'counter-as-reading'),
        `a W reading must not be reported as a meter: ${JSON.stringify(findings.map((f) => f.id))}`,
    );
    assert.ok(reviewWidgets([tile('sm.0.total_energy')], meta).some((f) => f.id === 'counter-as-reading'));
});

check('an element id is never mistaken for a datapoint — the dp next to it is one', () => {
    // The 23 false findings on a clean tab: badge, chip and series ids taken for
    // state ids because the type, not the key, decides which field holds one.
    const refs = collectDatapointRefs(
        {
            id: 'w1',
            type: 'echart',
            title: 'Verlauf',
            datapoint: '',
            options: {
                echartSeries: [{ id: 's-tempout', name: 'Außen', datapointId: 'hm.0.temp', chartType: 'line' }],
                badges: [{ id: 'b-ph-offline', dp: 'hm.0.offline' }],
                chips: [{ id: 'c-1', dp: 'hm.0.chip' }],
            },
        },
        schema,
        { loose: true },
    );
    const ids = refs.map((r) => r.id);
    assert.deepEqual(ids.filter((id) => id.startsWith('hm.0.')).sort(), ['hm.0.chip', 'hm.0.offline', 'hm.0.temp']);
    assert.ok(!ids.includes('s-tempout'), 'a series id is a key, datapointId holds the datapoint');
    assert.ok(!ids.includes('b-ph-offline'), 'a badge id is a key, dp holds the datapoint');
    assert.ok(!ids.includes('c-1'), 'a chip id is a key too');
});

check('a bare dp field is flagged by the schema, so the write gate sees it', () => {
    assert.ok(schema.types.BadgeDef.fields.dp.datapoint, 'BadgeDef.dp must be a datapoint field');
    assert.ok(schema.types.ChipItem.fields.dp.datapoint, 'ChipItem.dp must be a datapoint field');
    const strict = collectDatapointRefs(
        { id: 'w', type: 'value', title: 'V', datapoint: '', options: { badges: [{ id: 'b1', dp: 'weg.0.dp' }] } },
        schema,
    );
    assert.deepEqual(
        strict.map((r) => r.id),
        ['weg.0.dp'],
    );
});

// ── Config helpers ───────────────────────────────────────────────────────────

const LAYOUTS = [
    {
        id: 'l1',
        name: 'Wohnzimmer',
        slug: 'wohnzimmer',
        sections: [
            {
                id: 's1',
                name: 'Start',
                slug: 'start',
                tabs: [
                    { id: 't1', name: 'Licht', slug: 'licht', widgets: [{ gridPos: { x: 0, y: 0, w: 30, h: 4 } }] },
                    { id: 't2', name: 'Klima', slug: 'klima', widgets: [{ gridPos: { x: 10, y: 0, w: 34, h: 4 } }] },
                ],
            },
        ],
    },
    {
        id: 'l2',
        name: 'Tablet',
        slug: 'tablet',
        sections: [
            { id: 's2', name: 'Haupt', slug: 'haupt', tabs: [{ id: 't3', name: 'Licht', slug: 'licht', widgets: [] }] },
        ],
    },
];

// ── The palette ──────────────────────────────────────────────────────────────
// Reported from use: the schema mentions var(--accent-green) in its option
// descriptions, but nothing listed the tokens — so a whole dashboard came back
// with #f59e0b and #94a3b8 hard-coded, which hold up in one theme only.

check('every theme defines every base token', () => {
    // A missing one leaves an empty value in the answer, which reads as "no such
    // colour" and sends the model back to hex.
    for (const theme of THEME_TOKENS.themes) {
        for (const t of THEME_TOKENS.baseTokens) {
            assert.ok(theme.vars[t.name], `${theme.id} has no ${t.name}`);
        }
    }
});

check('the element tokens say which base token they inherit', () => {
    for (const t of THEME_TOKENS.elementTokens) {
        assert.ok(t.inherits, `${t.name} has no fallback`);
        if (t.inherits.startsWith('--')) {
            assert.ok(
                THEME_TOKENS.baseTokens.some((b) => b.name === t.inherits),
                `${t.name} inherits from ${t.inherits}, which is not a base token`,
            );
        }
    }
});

check('only the themes actually in play are reported', () => {
    // Appending the default as well produced two values per token on a dashboard
    // that has one theme — "#a6e3a1 / #22c55e" reads as "it depends".
    const one = activeThemes(THEME_TOKENS, { themeId: 'catppuccin-mocha' });
    assert.deepEqual(
        one.map((t) => t.id),
        ['catppuccin-mocha'],
    );
    // Following the browser really is two, and both have to be named.
    const two = activeThemes(THEME_TOKENS, {
        followBrowser: true,
        browserLightThemeId: 'light',
        browserDarkThemeId: 'dark',
    });
    assert.deepEqual(
        two.map((t) => t.id),
        ['light', 'dark'],
    );
    // Nothing configured falls back to the default, not to an empty answer.
    assert.deepEqual(
        activeThemes(THEME_TOKENS, {}).map((t) => t.id),
        [THEME_TOKENS.defaultThemeId],
    );
});

check('the palette names the tokens with the values of THIS dashboard', () => {
    const out = renderPalette(THEME_TOKENS, { themeId: 'light', customVars: {} });
    assert.match(out, /var\(--accent-green\) = #16a34a/);
    assert.match(out, /var\(--text-secondary\) = #6b7280/);
    assert.match(out, /nie einen Hex-Wert/, 'the instruction belongs next to the values');
    // Sizes and shadows are not colours and only make the block longer.
    assert.ok(!/--widget-radius/.test(out));
});

check("a user's own colour is shown as theirs, not as the theme's", () => {
    const out = renderPalette(THEME_TOKENS, { themeId: 'light', customVars: { '--accent': '#ff6600' } });
    assert.match(out, /var\(--accent\) = #ff6600 \[angepasst\]/);
});

check('aura_theme adds the per-element tokens and what they inherit', () => {
    const full = renderTheme(THEME_TOKENS, { themeId: 'light', customVars: {} }, { elements: true });
    assert.match(full, /var\(--switch-bg\).*wie --accent-green/);
    assert.match(full, /## Switch \/ toggle/, 'the groups from the source are worth keeping');
    const base = renderTheme(THEME_TOKENS, { themeId: 'light', customVars: {} }, { elements: false });
    assert.ok(!/--switch-bg/.test(base));
    assert.match(base, /mit elements=true/);
});

check('following the browser is said out loud, not averaged away', () => {
    const out = renderTheme(
        THEME_TOKENS,
        { followBrowser: true, browserLightThemeId: 'light', browserDarkThemeId: 'dark' },
        { elements: false },
    );
    assert.match(out, /ZWEI Themes/);
    assert.match(out, /var\(--text-primary\) = #111827 \/ #ffffff/);
});

check('without the generated palette the answer says so instead of inventing one', () => {
    assert.match(renderTheme(null, {}), /nicht mitgeliefert/);
    assert.equal(renderPalette(null, {}), '');
});

check('designColumns takes the widest widget across all tabs', () => {
    assert.equal(designColumns(LAYOUTS), 44);
    assert.equal(designColumns([]), 48);
});

// ── The target screen (guidelines) ───────────────────────────────────────────
// The guidelines are the one place the user says how big the dashboard may get.
// Before this the server inferred the width from the widest widget it found and
// had no notion of height at all.

const GUIDED = { gridRowHeight: 20, gridSnapX: 20, gridGap: 10, guidelinesEnabled: true };
const TABLET = { ...GUIDED, guidelinesWidth: 1280, guidelinesHeight: 800 };

check('the guidelines become a column and a row budget', () => {
    const cv = designCanvas({ frontend: TABLET, tabCount: 2 });
    // Same formula the frontend uses: floor((1280 − 10) / (20 + 10)).
    assert.equal(cv.maxCols, 42);
    // 800 minus header (65) and tab bar (44) leaves 691 px: floor((691 + 10) / 30).
    assert.equal(cv.topInset, 109);
    assert.equal(cv.maxRows, 23);
    // The budget must be reachable, not one row optimistic.
    assert.ok(rowsToPx(cv.maxRows, cv.grid) <= cv.usableHeight, 'the last row must still fit');
    assert.ok(rowsToPx(cv.maxRows + 1, cv.grid) > cv.usableHeight, 'and one more must not');
});

check('chrome that is not there does not cost a row', () => {
    const bare = designCanvas({ frontend: { ...TABLET, showHeader: false }, tabCount: 1 });
    assert.equal(bare.topInset, 0);
    assert.equal(bare.maxRows, 27);
    // A footer tab bar sits below the grid, so the top is unaffected.
    const footer = designCanvas({ frontend: { ...TABLET, tabBar: { position: 'bottom' } }, tabCount: 3 });
    assert.equal(footer.topInset, 65);
});

check('a docked sidebar takes its width off the dashboard, a floating menu does not', () => {
    const host = {
        frontend: { ...TABLET, layoutDrawerEnabled: true, layoutDrawerPlacement: 'sidebar', layoutDrawerWidth: 240 },
        layout: { sections: [{ id: 'a' }, { id: 'b' }] },
        tabCount: 2,
    };
    const docked = designCanvas(host);
    assert.equal(docked.menuInset, 240);
    assert.equal(docked.maxCols, 34);
    const floating = designCanvas({ ...host, frontend: { ...host.frontend, layoutDrawerPlacement: 'floating' } });
    assert.equal(floating.menuInset, 0);
    assert.equal(floating.maxCols, 42);
    // One visible section means no menu at all — nothing to switch between.
    const single = designCanvas({ ...host, layout: { sections: [{ id: 'a' }] } });
    assert.equal(single.menuInset, 0);
});

check('a section may state a screen of its own', () => {
    // The keys are 3-level in the frontend, so a wall panel and a desk layout in
    // the same installation do not share a budget.
    const cv = designCanvas({
        frontend: TABLET,
        layout: { sections: [], settings: { guidelinesWidth: 800 } },
        section: { settings: { guidelinesHeight: 480 } },
        tabCount: 1,
    });
    assert.equal(cv.width, 800);
    assert.equal(cv.height, 480);
    assert.equal(cv.maxCols, 26);
});

check('without guidelines the answer says so instead of inventing a size', () => {
    const off = designCanvas({ frontend: { gridRowHeight: 20, gridGap: 10 } });
    assert.equal(off.enabled, false);
    assert.equal(off.maxRows, null);
    assert.match(renderCanvas(off), /Hilfslinien sind nicht gesetzt/);
    assert.match(renderCanvas(off), /Einstellungen/, 'and where to set them');
    assert.match(renderCanvas(designCanvas({ frontend: TABLET, tabCount: 2 })), /1280×800 px/);
});

check('findTab refuses to guess when a name is ambiguous', () => {
    assert.ok(/mehrfach/.test(findTab(LAYOUTS, { tab: 'Licht' }).error ?? ''));
    assert.equal(findTab(LAYOUTS, { tab: 'Licht', layout: 'Tablet' }).tab.id, 't3');
    assert.equal(findTab(LAYOUTS, { tab: 'klima' }).tab.id, 't2');
    assert.ok(/Kein Tab/.test(findTab(LAYOUTS, { tab: 'Garage' }).error ?? ''));
});

check('allTabs flattens and replaceTabWidgets touches only the target tab', () => {
    assert.equal(allTabs(LAYOUTS).length, 3);
    const next = replaceTabWidgets(LAYOUTS, 't2', [{ id: 'neu' }]);
    assert.deepEqual(next[0].sections[0].tabs[1].widgets, [{ id: 'neu' }]);
    assert.deepEqual(next[0].sections[0].tabs[0].widgets, LAYOUTS[0].sections[0].tabs[0].widgets);
    assert.deepEqual(LAYOUTS[0].sections[0].tabs[1].widgets.length, 1, 'must not mutate the input');
});

check('collectDefIds follows nested group definitions', () => {
    const defs = { outer: [{ options: { defId: 'inner' } }], inner: [{ type: 'switch' }], unused: [{ type: 'value' }] };
    assert.deepEqual([...collectDefIds([{ options: { defId: 'outer' } }], defs)].sort(), ['inner', 'outer']);
});

// ── The endpoint, driven by the real MCP client ──────────────────────────────

console.log('\nmcp — Endpunkt');

const TOKEN = 'geheim-123';

/** Stands in for the ioBroker adapter: just the calls lib/mcp makes. */
function makeAdapter() {
    const states = {
        'config.dashboard': JSON.stringify({ version: 0, state: { layouts: JSON.parse(JSON.stringify(LAYOUTS)) } }),
        'config.group-defs': JSON.stringify({ version: 0, state: { defs: {} } }),
        'config.app-config': JSON.stringify({ version: 0, state: { frontend: { gridRowHeight: 20, gridGap: 10 } } }),
        // The theme the dashboard shows, with one colour the user changed.
        'config.theme': JSON.stringify({
            version: 0,
            state: { themeId: 'light', customVars: { '--accent': '#ff6600' } },
        }),
    };
    const files = {};
    return {
        namespace: 'aura.0',
        states,
        files,
        getStateAsync: async (id) => (states[id] === undefined ? null : { val: states[id], ack: true }),
        setStateAsync: async (id, v) => {
            states[id] = v.val;
        },
        writeFileAsync: async (_ns, name, data) => {
            files[name] = data;
        },
        readDirAsync: async () => Object.keys(files).map((file) => ({ file })),
        readFileAsync: async (_ns, name) => {
            if (files[name] === undefined) {
                throw new Error('not found');
            }
            return files[name];
        },
        getObjectViewAsync: async (_design, type, opts) => {
            // The instance view is what names the available history adapters; it
            // used to fall through to the state rows, which made every logging
            // instance look missing.
            if (type === 'instance') {
                return {
                    rows: [
                        { id: 'system.adapter.influxdb.0' },
                        { id: 'system.adapter.admin.0' },
                        { id: 'system.adapter.web.0' },
                    ],
                };
            }
            return {
                rows: (opts.startkey || '').startsWith('alias.')
                    ? [{ id: 'alias.0.licht' }]
                    : [
                          { id: 'hm-rpc.0.LEQ1.1.STATE' },
                          { id: 'hm-rpc.1.00085D89A3C5E2.3.STATE' },
                          { id: 'zigbee.0.temp' },
                      ],
            };
        },
        // The objects and the last values behind those ids: what the datapoint-fit
        // check and the liveness half of aura_review read.
        getForeignObjectAsync: async (id) => FOREIGN_OBJECTS[id] || null,
        getForeignStateAsync: async (id) => FOREIGN_STATES[id] || null,
    };
}

/** hm-rpc is a normal writable switch; zigbee.0.temp is read-only and long dead. */
const FOREIGN_OBJECTS = {
    'hm-rpc.0.LEQ1.1.STATE': {
        common: { type: 'boolean', role: 'switch', write: true, custom: { 'influxdb.0': { enabled: true } } },
    },
    // Deliberately NOT logged: the datapoint a chart series on it draws nothing from.
    'zigbee.0.temp': { common: { type: 'number', role: 'value.temperature', write: false, unit: '°C' } },
    'alias.0.licht': { common: { type: 'boolean', role: 'switch', write: true } },
    // A HomeMatic SWITCH_TRANSMITTER: exists, is boolean, looks like a switch —
    // and is read-only. Reported from use: built as a switch, validated clean,
    // did nothing when pressed.
    'hm-rpc.1.00085D89A3C5E2.3.STATE': { common: { type: 'boolean', role: 'switch', write: false } },
};

const FOREIGN_STATES = {
    'hm-rpc.0.LEQ1.1.STATE': { val: true, ts: Date.now(), ack: true },
    'zigbee.0.temp': { val: 21.5, ts: Date.now() - 90 * 86400000, ack: true },
    'alias.0.licht': { val: null, ts: Date.now(), ack: true },
};

let adapter = makeAdapter();
const server = http.createServer((req, res) => {
    handleMcpRequest(req, res, { adapter, token: TOKEN, mode: 'delete', version: '9.9.9' }).catch((e) => {
        res.writeHead(500);
        res.end(String(e.message));
    });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/mcp`;

// Auth first — everything else is pointless if this is wrong.
const noToken = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
});
check('a request without a token is rejected with 401', () => {
    assert.equal(noToken.status, 401);
});

const wrongToken = await fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer falsch' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
});
check('a wrong token is rejected with 403, not 401', () => {
    // 401 makes every client library start an OAuth flow it cannot finish, and
    // the user then reads a registration error instead of "wrong token". (#612)
    assert.equal(wrongToken.status, 403);
    assert.equal(wrongToken.headers.get('www-authenticate'), null);
});

const noConfiguredToken = await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
        handleMcpRequest(req, res, { adapter, token: '', version: '1' }).catch(() => {});
    });
    s.listen(0, '127.0.0.1', async () => {
        const r = await fetch(`http://127.0.0.1:${s.address().port}/mcp`, { method: 'POST', body: '{}' });
        const body = await r.json();
        s.close();
        resolve({ status: r.status, body });
    });
});
check('enabled without a configured token serves nothing and says why', () => {
    assert.equal(noConfiguredToken.status, 503);
    assert.match(noConfiguredToken.body.error, /kein Token gesetzt/);
});

// ── Reachability for clients other than Claude Code (#612) ──────────────────
// A bridge like mcp-remote probes for an authorization server first. Aura's
// static handler answers unknown extension-less paths with index.html and 200,
// so the probe used to receive HTML and the client died parsing it as JSON.

const wellKnown = await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
        if (handleAuthDiscovery(new URL(req.url, 'http://x').pathname, res, req.method)) {
            return;
        }
        // Stand-in for the SPA fallback in main.js: HTML with status 200.
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><html></html>');
    });
    s.listen(0, '127.0.0.1', async () => {
        const at = async (p, method = 'GET') => {
            const r = await fetch(`http://127.0.0.1:${s.address().port}${p}`, { method });
            return { status: r.status, type: r.headers.get('content-type'), body: await r.text() };
        };
        // Every path a real mcp-remote 0.8.3 run probed, in the order it did.
        const out = {
            resource: await at('/.well-known/oauth-protected-resource/mcp'),
            authServer: await at('/.well-known/oauth-authorization-server'),
            openid: await at('/.well-known/openid-configuration'),
            // Nested under the endpoint — a prefix match on /.well-known/ misses it.
            nested: await at('/mcp/.well-known/openid-configuration'),
            register: await at('/register', 'POST'),
            spa: await at('/some/router/route'),
            registerGet: await at('/register'),
        };
        s.close();
        resolve(out);
    });
});

check('OAuth discovery answers 404 JSON instead of the SPA', () => {
    for (const key of ['authServer', 'resource', 'openid', 'nested', 'register']) {
        assert.equal(wellKnown[key].status, 404, key);
        assert.match(wellKnown[key].type, /application\/json/, key);
        // The whole point: parseable, so the client reports "no OAuth" and
        // keeps the static token instead of throwing on "<!doctype".
        assert.equal(JSON.parse(wellKnown[key].body).error, 'not_found', key);
    }
});

check('other unknown paths still reach the SPA fallback', () => {
    assert.equal(wellKnown.spa.status, 200);
    assert.match(wellKnown.spa.body, /doctype/);
    // Only the registration POST is intercepted; a navigation to the same path
    // stays a frontend route.
    assert.equal(wellKnown.registerGet.status, 200);
});

const transport = await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
        handleMcpRequest(req, res, { adapter, token: TOKEN, mode: 'read', version: '1' }).catch(() => {});
    });
    s.listen(0, '127.0.0.1', async () => {
        const url = `http://127.0.0.1:${s.address().port}/mcp`;
        const preflight = await fetch(url, {
            method: 'OPTIONS',
            headers: { Origin: 'https://claude.ai', 'Access-Control-Request-Method': 'POST' },
        });
        const del = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } });
        const get = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
        const bad = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer nope' }, body: '{}' });
        const none = await fetch(url, { method: 'POST', body: '{}' });
        const bare = await fetch(url, {
            method: 'POST',
            headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
        });
        s.close();
        resolve({
            preflight: { status: preflight.status, headers: preflight.headers },
            del: del.status,
            get: { status: get.status, allow: get.headers.get('allow') },
            bad: { status: bad.status, body: await bad.json() },
            none: { status: none.status, auth: none.headers.get('www-authenticate') },
            bare: { status: bare.status, body: await bare.json() },
        });
    });
});

check('the CORS preflight is answered before the token is checked', () => {
    // A browser sends OPTIONS without the Authorization header — replying 401
    // would refuse the request that asks whether the header may be sent.
    assert.equal(transport.preflight.status, 204);
    assert.equal(transport.preflight.headers.get('access-control-allow-origin'), '*');
    assert.match(transport.preflight.headers.get('access-control-allow-headers'), /Authorization/i);
    assert.match(transport.preflight.headers.get('access-control-allow-methods'), /POST/);
});

check('DELETE closes without an error, GET names the allowed methods', () => {
    assert.equal(transport.del, 204);
    assert.equal(transport.get.status, 405);
    assert.match(transport.get.allow, /POST/);
});

check('a missing token gets the challenge, a wrong one does not', () => {
    // Only "nothing presented" is worth telling a client to authenticate about.
    assert.equal(transport.none.status, 401);
    assert.match(transport.none.auth, /^Bearer/);
    // resource_metadata would send the client to an authorization server that
    // does not exist, and it would report that instead of the real cause.
    assert.ok(!/resource_metadata/.test(transport.none.auth));
    assert.equal(transport.bad.status, 403);
    assert.match(transport.bad.body.error, /Token/);
});

check('a bare token without the Bearer prefix is accepted', () => {
    assert.equal(transport.bare.status, 200);
    assert.deepEqual(transport.bare.body.result, {});
});

const client = new Client({ name: 'aura-test', version: '1.0.0' }, { capabilities: {} });
await client.connect(
    new StreamableHTTPClientTransport(new URL(base), {
        requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    }),
);

check('the real MCP client completes the handshake', () => {
    const v = client.getServerVersion();
    assert.equal(v.name, 'aura');
    assert.equal(v.version, '9.9.9');
});

check('the instructions tell the model where datapoints come from', () => {
    const ins = client.getInstructions();
    assert.match(ins, /ioBroker MCP server/);
    assert.match(ins, /SAME ioBroker installation/);
    assert.match(ins, /aura_validate/);
});

const { tools } = await client.listTools();
check('all twenty-eight tools are announced with descriptions', () => {
    assert.deepEqual(tools.map((t) => t.name).sort(), [
        'aura_add_widget',
        'aura_backups',
        'aura_copy_node',
        'aura_copy_widget',
        'aura_create_layout',
        'aura_create_section',
        'aura_create_tab',
        'aura_dashboard',
        'aura_delete',
        'aura_find',
        'aura_group',
        'aura_insert_preset',
        'aura_measure',
        'aura_popup',
        'aura_popups',
        'aura_presets',
        'aura_recipes',
        'aura_rename',
        'aura_reorder',
        'aura_restore',
        'aura_review',
        'aura_save_preset',
        'aura_tab',
        'aura_theme',
        'aura_types',
        'aura_update_node',
        'aura_update_widget',
        'aura_validate',
        'aura_widget_schema',
        'aura_widget_types',
        'aura_write_group',
        'aura_write_popup',
        'aura_write_tab',
    ]);
    for (const t of tools) {
        assert.ok(t.description && t.description.length > 40, `${t.name}: description too thin`);
    }
});

const dash = await client.callTool({ name: 'aura_dashboard', arguments: {} });
check('aura_dashboard names the available history adapters', () => {
    // Nothing listed them, so a chart's historyInstance had to be guessed.
    assert.match(dash.content[0].text, /History-Adapter für Diagramme: influxdb\.0/);
});

check('aura_dashboard reports tabs, grid and the design width', () => {
    const t = dash.content[0].text;
    // Nested since the section line carries its own markers.
    assert.match(t, /- Wohnzimmer \/ Start/);
    assert.match(t, /· Licht — 1 Widget/);
    assert.match(t, /Die vorhandenen Widgets nutzen 44 Spalten/);
    assert.match(t, /Zeilenhöhe 20 px/);
});

check('with no guidelines set, aura_dashboard says the target size is unknown', () => {
    assert.match(dash.content[0].text, /Hilfslinien sind nicht gesetzt/);
});

check('aura_dashboard hands over the palette, so colours need not be invented', () => {
    const t = dash.content[0].text;
    assert.match(t, /Farben: Theme „Hell“/);
    assert.match(t, /var\(--accent-green\) = #16a34a/);
    assert.match(t, /var\(--accent\) = #ff6600 \[angepasst\]/, "the user's own colour wins");
    assert.match(t, /nie einen Hex-Wert/);
});

const themeRes = await client.callTool({ name: 'aura_theme', arguments: {} });
const themeBase = await client.callTool({ name: 'aura_theme', arguments: { elements: false } });
check('aura_theme answers with the full palette of the selected theme', () => {
    const t = themeRes.content[0].text;
    assert.ok(!themeRes.isError, t);
    assert.match(t, /Ausgewähltes Theme: Hell \(light\)/);
    assert.match(t, /var\(--text-secondary\) = #6b7280/);
    assert.match(t, /var\(--switch-bg\).*wie --accent-green/, 'the per-element tokens too');
    assert.ok(!/--switch-bg/.test(themeBase.content[0].text), 'elements=false keeps it to the base palette');
});

// The same dashboard, with the target device the user drew in the editor.
const APP_CONFIG_PLAIN = adapter.states['config.app-config'];
adapter.states['config.app-config'] = JSON.stringify({
    version: 0,
    state: {
        frontend: {
            gridRowHeight: 20,
            gridGap: 10,
            guidelinesEnabled: true,
            guidelinesWidth: 1280,
            guidelinesHeight: 800,
        },
    },
});
const guidedDash = await client.callTool({ name: 'aura_dashboard', arguments: {} });
const guidedMeasure = await client.callTool({ name: 'aura_measure', arguments: { tab: 'Klima' } });
const guidedValidate = await client.callTool({
    name: 'aura_validate',
    arguments: {
        checkDatapoints: false,
        json: JSON.stringify({ ...OK_SWITCH, gridPos: { x: 0, y: 24, w: 8, h: 4 } }),
    },
});
adapter.states['config.app-config'] = APP_CONFIG_PLAIN;

check('the guidelines reach the model as columns and rows', () => {
    assert.match(guidedDash.content[0].text, /Zielgröße laut Hilfslinien: 1280×800 px/);
    assert.match(guidedDash.content[0].text, /42 Spalten und 23 Zeilen/);
});

check('aura_measure names the widgets that fall off the target screen', () => {
    // The Klima widget ends at column 44 — every widget can be tall enough and
    // the tab still not fit on the screen it was built for.
    const t = guidedMeasure.content[0].text;
    assert.match(t, /Zielgröße laut Hilfslinien/);
    assert.match(t, /reichen über die Hilfslinie hinaus .*Spalte 44/s);
});

check('aura_validate checks a widget against the target screen before it is written', () => {
    assert.match(guidedValidate.content[0].text, /28 endet unterhalb der Hilfslinie \(23 Zeilen/);
});

const badReorderKind = await client.callTool({
    name: 'aura_reorder',
    arguments: { kind: 'popup', order: ['Details'] },
});
check('reorder names an unknown kind instead of hunting for a tab', () => {
    assert.ok(badReorderKind.isError);
    assert.match(badReorderKind.content[0].text, /"kind": "popup" gibt es hier nicht/);
});

const ambiguous = await client.callTool({ name: 'aura_tab', arguments: { tab: 'Licht' } });
check('an ambiguous tab name lists the candidates instead of guessing', () => {
    assert.ok(ambiguous.isError);
    assert.match(ambiguous.content[0].text, /gibt es mehrfach/);
});

const tabRes = await client.callTool({ name: 'aura_tab', arguments: { tab: 'Klima' } });
check('aura_tab returns the aura-tab payload', () => {
    assert.match(tabRes.content[0].text, /"_type": "aura-tab"/);
});

const schemaRes = await client.callTool({ name: 'aura_widget_schema', arguments: { types: ['switch'] } });
check('aura_widget_schema documents only what was asked for', () => {
    const t = schemaRes.content[0].text;
    assert.match(t, /## switch — Schalter/);
    assert.match(t, /- statusDp: string.*\[Datenpunkt-Id\]/);
    assert.ok(!/## value —/.test(t));
});

// ── Answer size ──────────────────────────────────────────────────────────────
// The named-type block is two thirds of the answer and used to be reprinted on
// every call, so four widget types fetched one at a time paid for CustomCell four
// times. These three switches are what makes the schema affordable to read.

const fullList = await client.callTool({ name: 'aura_widget_schema', arguments: { types: ['list'] } });
const leanSchema = await client.callTool({
    name: 'aura_widget_schema',
    arguments: { types: ['list'], sharedTypes: false, shape: false },
});
check('sharedTypes=false names the types instead of printing them', () => {
    const t = leanSchema.content[0].text;
    assert.match(t, /## list — /);
    assert.match(t, /## Verwendete Typen \(nicht ausgegeben\)/);
    // The names come with their size, so a model can decide before fetching.
    assert.match(t, /StaticListEntry \(\d+ Z\.\)/);
    assert.ok(!/^StaticListEntry = \{/m.test(t), 'the type body must be gone');
    assert.ok(!/# Aufbau eines Widgets/.test(t), 'shape=false drops the widget shape');
    // The whole point: cheaper than the full slice by a wide margin.
    const full = fullList.content[0].text.length;
    assert.ok(t.length * 2 < full, `lean slice ${t.length} should be far under half of ${full}`);
});

const filteredSchema = await client.callTool({
    name: 'aura_widget_schema',
    arguments: { types: ['list'], options: ['entries', 'quatsch'], sharedTypes: false, shape: false },
});
check('options=[…] narrows to the named keys and names what does not exist', () => {
    const t = filteredSchema.content[0].text;
    assert.match(t, /- entries: StaticListEntry\[\]/);
    assert.match(t, /\(list kennt nicht: quatsch\)/);
    assert.ok(!/- rowConditions:/.test(t), 'an option that was not asked for must not appear');
    assert.ok(t.length < 2000, `filtered slice should be tiny, was ${t.length}`);
});

const typesRes = await client.callTool({
    name: 'aura_types',
    arguments: { names: ['WidgetCondition[]', 'customcell', 'Condition'] },
});
check('aura_types resolves a type through brackets and case, and names a miss', () => {
    const t = typesRes.content[0].text;
    assert.match(t, /^WidgetCondition = \{/m);
    assert.match(t, /^CustomCell = \{/m);
    // "Condition" is not a type — the near-miss list is what gets the model there.
    assert.match(t, /Keinen Typ "Condition"/);
    assert.match(t, /WidgetCondition/);
});

const clickActionType = await client.callTool({ name: 'aura_types', arguments: { names: ['ClickAction'] } });
check('aura_types spells out a discriminated union instead of answering "object"', () => {
    // Reported from use: both aura_widget_schema and aura_types returned
    // "ClickAction = object". The kinds could only be found by reading a widget
    // somebody had already built.
    const t = clickActionType.content[0].text;
    assert.match(t, /ClickAction = one of/);
    for (const kind of ['none', 'popup-view', 'popup-image', 'link-tab', 'link-external', 'popup-dps']) {
        assert.match(t, new RegExp(`kind: "${kind}"`), `${kind} must be listed`);
    }
    // The fields per kind, not just the names.
    assert.match(t, /kind: "link-tab"; layoutId: string; tabId: string; sectionId\?: string/);
    assert.match(t, /kind: "popup-view"; viewId: string/);
    // The question the reader actually arrives with, answered before the list.
    assert.match(t, /KEINE Variante, die einen Datenpunkt schreibt/);
    assert.match(t, /chips/, 'and what to use instead');
});

const entryType = await client.callTool({ name: 'aura_types', arguments: { names: ['EntryControlConfig'] } });
check('aura_types writes out an inline object instead of answering "object"', () => {
    // Reported from use: contactAppearance was "object" here as well as in the
    // JSON, so the labels of a contact row could not be looked up — "heizt"/"zu"
    // for a heating valve meant reaching for the `states` mapping instead.
    const t = entryType.content[0].text;
    assert.match(t, /contactAppearance\?: \{ closed\?: \{ label\?: string; color\?: string; icon\?: string \}/);
    assert.match(t, /tilted\?: \{/);
    assert.match(t, /open\?: \{/);
    // And the defaults, so it is clear what is being overridden.
    assert.match(t, /Geschlossen/);
});

check('the shared-option description no longer promises a write action', () => {
    // It said "Popup, Navigation, Datenpunkt schreiben, URL" — one of those four
    // does not exist, which is what sent a reader looking for it.
    const d = schema.commonOptions.clickAction.description;
    assert.match(d, /Schreibt KEINEN Datenpunkt/);
    assert.ok(!/^(?!.*KEINEN).*Datenpunkt schreiben/.test(d));
});

const noTypes = await client.callTool({ name: 'aura_types', arguments: { names: [] } });
check('aura_types without names lists what there is', () => {
    assert.ok(noTypes.isError);
    assert.match(noTypes.content[0].text, /CustomCell/);
});

const tileRow = (n, over = {}) =>
    Array.from({ length: n }, (_, i) => ({
        id: `t${i}`,
        type: 'value',
        title: `T${i}`,
        datapoint: `hm-rpc.0.DEV${i}.1.TEMP`,
        gridPos: { x: 0, y: i, w: 4, h: 3 },
        options: {},
        ...over,
    }));

const ids = (findings, id) => findings.find((f) => f.id === id);

check('a row of single-value tiles is reported, a handful is not', () => {
    // Three lamps are a layout. Ten are a list nobody wants to maintain — that is
    // the difference the threshold encodes, and it must not fire below it.
    assert.ok(!ids(reviewWidgets(tileRow(TILE_ROW_LIMIT - 1)), 'tile-row'));
    const found = ids(reviewWidgets(tileRow(TILE_ROW_LIMIT)), 'tile-row');
    assert.ok(found, 'the tile row was not reported');
    assert.equal(found.widgets.length, TILE_ROW_LIMIT);
    assert.ok(found.recipe);
});

// Reported from the field: a deliberate KPI row of five tiles that react one by
// one through conditions[].elements kept being told to become a list. The two
// rules were pulling against each other — value-without-meaning asks for exactly
// that individual reaction, tile-row proposed to fold it into a list row, where
// it is lost. A configured tile is not list material.
check('tiles that carry their own meaning are not list material', () => {
    const kpi = (i) => ({
        id: `k${i}`,
        type: 'value',
        title: `KPI ${i}`,
        datapoint: `pv.0.k${i}`,
        gridPos: { x: i * 4, y: 0, w: 4, h: 3 },
        options: {
            conditions: [
                {
                    id: 'c1',
                    clauses: [{ datapoint: `pv.0.k${i}`, operator: 'gt', value: 100 }],
                    elements: { value: { color: '#e33' } },
                },
            ],
        },
    });
    const row = Array.from({ length: TILE_ROW_LIMIT }, (_, i) => kpi(i));
    assert.ok(!ids(reviewWidgets(row), 'tile-row'), 'a KPI row is not a device list');
    // A threshold or a badge says the same thing as a condition.
    const byThreshold = tileRow(TILE_ROW_LIMIT, { options: { colorThresholds: [[10, '#0f0']] } });
    assert.ok(!ids(reviewWidgets(byThreshold), 'tile-row'));
    const byBadge = tileRow(TILE_ROW_LIMIT, { options: { badges: [{ id: 'b1', dp: 'hm-rpc.0.X.1.LOW' }] } });
    assert.ok(!ids(reviewWidgets(byBadge), 'tile-row'));

    // The plain ones still count, and only they are named.
    const mixed = tileRow(TILE_ROW_LIMIT).concat(row);
    const found = ids(reviewWidgets(mixed), 'tile-row');
    assert.ok(found, 'plain tiles next to a KPI row are still a list');
    assert.equal(found.widgets.length, TILE_ROW_LIMIT);
    assert.ok(!found.widgets.some((id) => id.startsWith('k')), 'a configured tile must not be named');
    assert.match(found.why, /ausgenommen/, 'the answer has to say why the others are left out');
});

check('a number without a good or bad range is reported, one with is not', () => {
    assert.ok(ids(reviewWidgets(tileRow(1)), 'value-without-meaning'));
    const withThresholds = tileRow(1, { options: { colorThresholds: [[20, '#fff']] } });
    assert.ok(!ids(reviewWidgets(withThresholds), 'value-without-meaning'));
    const withCondition = tileRow(1, { options: { conditions: [{ id: 'c', logic: 'AND', clauses: [], style: {} }] } });
    assert.ok(!ids(reviewWidgets(withCondition), 'value-without-meaning'));
});

check('a meter is spotted by its unit and by its id', () => {
    const byUnit = reviewWidgets([
        { id: 'm', type: 'value', datapoint: 'x.0.reading', options: { unit: 'kWh', colorThresholds: [[1, '#f']] } },
    ]);
    assert.ok(ids(byUnit, 'counter-as-reading'));
    const byId = reviewWidgets([
        { id: 'm', type: 'value', datapoint: 'shelly.0.emeter.total', options: { colorThresholds: [[1, '#f']] } },
    ]);
    assert.ok(ids(byId, 'counter-as-reading'));
    const plain = reviewWidgets([
        { id: 'm', type: 'value', datapoint: 'x.0.temp', options: { unit: '°C', colorThresholds: [[1, '#f']] } },
    ]);
    assert.ok(!ids(plain, 'counter-as-reading'));
});

check('contact tiles are only reported while no status overview is there', () => {
    const contacts = Array.from({ length: CONTACT_LIMIT }, (_, i) => ({
        id: `c${i}`,
        type: 'windowcontact',
        datapoint: `hm.0.W${i}.STATE`,
        options: {},
    }));
    assert.ok(ids(reviewWidgets(contacts), 'contacts-without-overview'));
    const withOverview = [...contacts, { id: 'ov', type: 'statusoverview', datapoint: '', options: {} }];
    assert.ok(!ids(reviewWidgets(withOverview), 'contacts-without-overview'));
});

check('a bar series without aggregate is reported, an aggregated one is not', () => {
    const raw = [{ id: 'e', type: 'echart', datapoint: 'x.0.c', options: { echartSeries: [{ chartType: 'bar' }] } }];
    assert.ok(ids(reviewWidgets(raw), 'bars-without-aggregate'));
    const delta = [
        {
            id: 'e',
            type: 'echart',
            datapoint: 'x.0.c',
            options: { echartSeries: [{ chartType: 'bar', aggregate: 'delta' }] },
        },
    ];
    assert.ok(!ids(reviewWidgets(delta), 'bars-without-aggregate'));
});

check('a list without row rules or a second line is reported', () => {
    const flat = [{ id: 'l', type: 'autolist', datapoint: '', options: {} }];
    assert.ok(ids(reviewWidgets(flat), 'list-without-depth'));
    const deep = [{ id: 'l', type: 'autolist', datapoint: '', options: { subDpTemplate: [{ id: '{{parent}}.B' }] } }];
    assert.ok(!ids(reviewWidgets(deep), 'list-without-depth'));
});

check('the "nothing reacts" remark does not pile onto a finding that already said it', () => {
    // Every value tile already got "no good or bad range"; repeating it as a tab
    // remark would be the same complaint twice.
    assert.ok(!ids(reviewWidgets(tileRow(6)), 'nothing-reacts'));
    const shutters = Array.from({ length: 3 }, (_, i) => ({
        id: `s${i}`,
        type: 'shutter',
        datapoint: `x.0.S${i}.LEVEL`,
        options: {},
    }));
    assert.ok(ids(reviewWidgets(shutters), 'nothing-reacts'));
});

check('a tab with nothing to complain about gets no invented findings', () => {
    const good = [
        {
            id: 'l',
            type: 'autolist',
            datapoint: '',
            options: { rowConditions: [{ id: 'r', clauses: [] }] },
        },
    ];
    const findings = reviewWidgets(good);
    assert.deepEqual(findings, [], `unexpected: ${findings.map((f) => f.id).join(', ')}`);
    assert.match(renderReview(findings, 'Tab'), /Nichts gefunden/);
});

check('every finding points at a recipe that exists', () => {
    const mixed = [
        ...tileRow(6),
        { id: 'th', type: 'thermostat', datapoint: 'x.0.SET', options: {} },
        { id: 'li', type: 'list', datapoint: '', options: {} },
    ];
    const findings = reviewWidgets(mixed);
    assert.ok(findings.length >= 3, `expected several findings, got ${findings.length}`);
    for (const f of findings) {
        assert.ok(findRecipe(f.recipe), `${f.id} points at unknown recipe "${f.recipe}"`);
    }
});

check('every recipe validates against the real widget schema', () => {
    // The whole point of shipping examples is that they are copied. One with a
    // misspelled option teaches the mistake to every model that reads it, and the
    // schema moves under them — a renamed option has to fail here, not in a user's
    // dashboard.
    for (const recipe of RECIPES) {
        for (const widget of recipe.widgets) {
            const { errors, warnings } = validateWidget(widget, schema, {});
            assert.deepEqual(errors, [], `${recipe.id}/${widget.id}: ${errors.join(' | ')}`);
            assert.deepEqual(warnings, [], `${recipe.id}/${widget.id}: ${warnings.join(' | ')}`);
        }
    }
});

check('a recipe carries no datapoint id that could pass for a real one', () => {
    // A plausible id gets written verbatim and produces a widget that silently
    // shows nothing — the exact failure the instructions warn about. Every id in a
    // recipe must be a placeholder, empty, or a per-row template.
    const ok = (v) => v === '' || /^%[^%\s]+%$/.test(v) || v.startsWith('{{') || v.startsWith('divider:');
    const walk = (node, where) => {
        if (Array.isArray(node)) {
            node.forEach((n) => walk(n, where));
            return;
        }
        if (!node || typeof node !== 'object') {
            return;
        }
        for (const [key, value] of Object.entries(node)) {
            if (typeof value === 'string' && (key === 'datapoint' || key === 'datapointId' || key.endsWith('Dp'))) {
                assert.ok(ok(value), `${where}: ${key} = "${value}" is not a placeholder`);
            }
            walk(value, where);
        }
    };
    for (const recipe of RECIPES) {
        walk(recipe.widgets, recipe.id);
        // Entry ids of a static list ARE the datapoint, so they fall under the same rule.
        for (const widget of recipe.widgets) {
            for (const entry of widget.options?.entries ?? []) {
                assert.ok(ok(entry.id), `${recipe.id}: entry id "${entry.id}" is not a placeholder`);
            }
        }
    }
});

check('the recipe index lists every recipe and the ids are unique', () => {
    const index = renderRecipeIndex();
    const ids = RECIPES.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate recipe id');
    for (const id of ids) {
        assert.ok(index.includes(id), `${id} missing from the index`);
        assert.ok(findRecipe(id.toUpperCase()), `${id} not found case-insensitively`);
    }
    assert.equal(findRecipe('gibtsnicht'), null);
});

check('one row rule for a whole list has a recipe of its own', () => {
    // Reported from use: sixteen mode rules were written by hand because
    // rowConditions with {{parent}} was only mentioned in a note on another
    // recipe. What replaces sixteen rules with one deserves its own example.
    const r = findRecipe('zeilenregel');
    assert.ok(r, 'recipe missing');
    const rules = r.widgets[0].options.rowConditions;
    assert.ok(rules.length >= 2);
    assert.ok(
        rules.some((x) => x.clauses.some((c) => c.datapoint.includes('{{parent}}'))),
        'the placeholder is the point of the recipe',
    );
    assert.match(r.instead, /je Zeile/);
    assert.match(r.notes.join(' '), /\{\{parent\}\}/);
});

check('no recipe teaches a hard-coded colour where a token works', () => {
    // The reported #f59e0b came from here: the recipes wrote hex values, so the
    // model did too. eCharts used to be exempt — a canvas drops a var() — but the
    // chart resolves its colours itself now, so the rule holds for every type.
    for (const recipe of RECIPES) {
        for (const w of recipe.widgets) {
            const json = JSON.stringify(w);
            const hex = json.match(/#[0-9a-fA-F]{6}/g);
            assert.deepEqual(hex, null, `${recipe.id}/${w.id}: ${hex && hex.join(', ')}`);
        }
    }
    // The chart series carry tokens like everything else now, and the recipe says
    // that the widget resolves them.
    for (const recipe of RECIPES) {
        for (const w of recipe.widgets) {
            for (const s of w.options?.echartSeries ?? []) {
                assert.match(s.color ?? '', /^var\(--/, `${recipe.id}/${w.id}: series colour "${s.color}"`);
            }
        }
    }
    assert.match(findRecipe('verbrauch').notes.join(' '), /Canvas/, 'and why that works');
});

check('a rendered recipe hands over parseable JSON and names its placeholders', () => {
    const BLANK = String.fromCharCode(10, 10);
    for (const recipe of RECIPES) {
        const rendered = renderRecipe(recipe);
        const start = rendered.indexOf('## JSON') + '## JSON'.length + 1;
        const json = rendered.slice(start, rendered.indexOf(BLANK, start));
        const parsed = JSON.parse(json);
        const widgets = Array.isArray(parsed) ? parsed : [parsed];
        assert.equal(widgets.length, recipe.widgets.length, `${recipe.id}: widget count`);
        assert.ok(rendered.includes('aura_validate'), `${recipe.id}: does not send the model to the validator`);
        if (json.match(/%[^%\s]+%/g)) {
            assert.ok(rendered.includes('Vor dem Schreiben ersetzen'), `${recipe.id}: placeholders unannounced`);
        }
    }
});

const recipeIndex = await client.callTool({ name: 'aura_recipes', arguments: {} });
check('aura_recipes without an id lists the recipes', () => {
    const t = recipeIndex.content[0].text;
    assert.match(t, /# Rezepte \(\d+\)/);
    assert.match(t, /- raum-liste —/);
    assert.ok(!/"gridPos"/.test(t), 'the index must stay an index, not a dump of every recipe');
});

const recipeOne = await client.callTool({ name: 'aura_recipes', arguments: { id: 'raum-liste' } });
check('aura_recipes returns the full widget for one id', () => {
    const t = recipeOne.content[0].text;
    assert.match(t, /"type": "autolist"/);
    assert.match(t, /rowConditions/);
    assert.match(t, /Vor dem Schreiben ersetzen/);
});

const recipeUnknown = await client.callTool({ name: 'aura_recipes', arguments: { id: 'kachelwand' } });
check('an unknown recipe id lists the ones there are', () => {
    assert.ok(recipeUnknown.isError);
    assert.match(recipeUnknown.content[0].text, /Kein Rezept "kachelwand"/);
    assert.match(recipeUnknown.content[0].text, /raum-liste/);
});

const reviewRes = await client.callTool({ name: 'aura_review', arguments: { tab: 'Klima' } });
check('aura_review reports on a real tab and points at recipes', () => {
    const t = reviewRes.content[0].text;
    assert.match(t, /Klima/);
    assert.ok(
        /aura_recipes mit id=/.test(t) || /Nichts gefunden/.test(t),
        `unexpected review output:
${t}`,
    );
});

const reviewUnknown = await client.callTool({ name: 'aura_review', arguments: { tab: 'Gibtsnicht' } });
check('aura_review names the tabs there are instead of guessing', () => {
    assert.ok(reviewUnknown.isError);
    assert.match(reviewUnknown.content[0].text, /Vorhanden:/);
});

const sweep = await client.callTool({ name: 'aura_review', arguments: {} });
check('aura_review without a tab sweeps the whole dashboard for health', () => {
    const t = sweep.content[0].text;
    assert.match(t, /alle Tabs und Popups/);
    // The counted line proves it actually walked the configuration.
    assert.match(t, /Widget\(s\) an \d+ Stelle\(n\)/);
});

const styleOnly = await client.callTool({ name: 'aura_review', arguments: { tab: 'Klima', mode: 'style' } });
check('mode=style leaves the health half out', () => {
    assert.ok(!/Datenpunkt-Verweis\(e\) geprüft/.test(styleOnly.content[0].text));
});

const measured = await client.callTool({
    name: 'aura_measure',
    arguments: {
        json: JSON.stringify({
            id: 'l16',
            type: 'list',
            title: 'Liste',
            datapoint: '',
            gridPos: { x: 0, y: 0, w: 10, h: 14 },
            options: { entries: Array.from({ length: 16 }, (_, i) => ({ id: `demo.${i}` })) },
        }),
    },
});
check('aura_measure answers the sizing question over the endpoint', () => {
    const t = measured.content[0].text;
    assert.match(t, /Zeilenhöhe 20 px/);
    assert.match(t, /ZU KLEIN/);
    assert.match(t, /→ h=\d+/);
});

const measuredTab = await client.callTool({ name: 'aura_measure', arguments: { tab: 'Klima' } });
check('aura_measure takes an existing tab', () => {
    assert.ok(!measuredTab.isError, measuredTab.content[0].text);
    assert.match(measuredTab.content[0].text, /Klima/);
});

const measuredNothing = await client.callTool({ name: 'aura_measure', arguments: {} });
check('aura_measure says what it needs instead of guessing', () => {
    assert.ok(measuredNothing.isError);
    assert.match(measuredNothing.content[0].text, /"tab" oder "json"/);
});

const badValidate = await client.callTool({
    name: 'aura_validate',
    arguments: { json: JSON.stringify({ ...OK_SWITCH, options: { showTitel: true } }) },
});
check('aura_validate reports a bad option and checks live datapoints', () => {
    assert.ok(badValidate.isError);
    assert.match(badValidate.content[0].text, /liest die Option "showTitel" nicht/);
    assert.match(badValidate.content[0].text, /4 Datenpunkte gegengeprüft/);
});

const chartValidate = await client.callTool({
    name: 'aura_validate',
    arguments: {
        json: JSON.stringify({
            id: 'c1',
            type: 'echart',
            title: 'Verlauf',
            datapoint: 'zigbee.0.temp',
            gridPos: { x: 0, y: 0, w: 20, h: 10 },
            options: {
                echartSeries: [{ id: 's1', name: 'Temperatur', datapointId: 'zigbee.0.temp', chartType: 'line' }],
            },
        }),
    },
});
check('aura_validate warns when a chart series datapoint is not logged', () => {
    const t = chartValidate.content[0].text;
    // Not an error: a series on an unlogged datapoint is a mistake, not a reason
    // to refuse the write — the user may be about to switch logging on.
    assert.ok(!chartValidate.isError, t);
    assert.match(t, /wird von keiner History-Instanz geloggt/);
    assert.match(t, /Reihe s1 „Temperatur"/);
    // Proof the handler looked the series datapoint up, not only widget.datapoint.
    assert.match(t, /Objekt\(e\) gelesen/);
});

const switchRowValidate = await client.callTool({
    name: 'aura_validate',
    arguments: {
        json: JSON.stringify({
            id: 'rollos',
            type: 'list',
            title: 'Licht',
            datapoint: '',
            gridPos: { x: 0, y: 0, w: 10, h: 8 },
            options: {
                entries: [
                    { id: 'hm-rpc.1.00085D89A3C5E2.3.STATE', label: 'Deckenlicht', displayType: 'switch' },
                    { id: 'hm-rpc.0.LEQ1.1.STATE', label: 'Stehlampe', displayType: 'switch' },
                ],
            },
        }),
    },
});
check('aura_validate reads the objects behind the ROWS of a list, not just the widget', () => {
    // The whole point: a list is one widget with twenty controls in it. Without
    // the loose lookup the rows were never looked up at all, and a switch on a
    // read-only state validated clean.
    const t = switchRowValidate.content[0].text;
    assert.ok(!switchRowValidate.isError, t);
    assert.match(t, /Zeile 1 „Deckenlicht“/);
    assert.match(t, /nur lesbar \(write: false\)/);
    assert.doesNotMatch(t, /Stehlampe/, 'the writable row is not a finding');
});

// ── Writing ──────────────────────────────────────────────────────────────────

const refused = await client.callTool({
    name: 'aura_add_widget',
    arguments: { tab: 'Klima', widget: JSON.stringify({ ...OK_SWITCH, datapoint: 'gibt.es.nicht' }) },
});
check('a widget with an invented datapoint is refused, and nothing is written', () => {
    assert.ok(refused.isError);
    assert.match(refused.content[0].text, /Nicht geschrieben/);
    assert.equal(Object.keys(adapter.files).length, 0, 'a refused write must not leave a backup');
    assert.match(adapter.states['config.dashboard'], /"t2"/);
    assert.ok(!adapter.states['config.dashboard'].includes('gibt.es.nicht'));
});

const overlapping = await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: 'Klima',
        widget: JSON.stringify({ ...OK_SWITCH, id: 'neu', gridPos: { x: 10, y: 0, w: 8, h: 4 } }),
    },
});
check('a widget overlapping what is already there is refused', () => {
    assert.ok(overlapping.isError);
    assert.match(overlapping.content[0].text, /überlappen/);
});

const added = await client.callTool({
    name: 'aura_add_widget',
    arguments: { tab: 'Klima', widget: JSON.stringify({ ...OK_SWITCH, id: 'neu', gridPos: { x: 0, w: 8, h: 4 } }) },
});
check('a valid widget is appended below the existing content', () => {
    assert.ok(!added.isError, added.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const klima = layouts[0].sections[0].tabs[1];
    assert.equal(klima.widgets.length, 2);
    assert.equal(klima.widgets[1].id, 'neu');
    assert.equal(klima.widgets[1].gridPos.y, 4, 'must be placed below the existing widget, not on top of it');
});

check('the write is backed up first and the answer says where', () => {
    const names = Object.keys(adapter.files);
    assert.equal(names.length, 1);
    assert.match(names[0], /^mcp-.*\.json$/);
    assert.match(added.content[0].text, /Sicherung: aura\.0\.backups\/mcp-/);
    const backup = JSON.parse(adapter.files[names[0]]);
    assert.ok(backup.dashboard.includes('"t2"'), 'the backup must hold the PREVIOUS dashboard');
    assert.ok(!backup.dashboard.includes('"neu"'), 'the backup must predate the change');
});

check('the answer warns about an editor with unsaved changes', () => {
    assert.match(added.content[0].text, /ungespeicherten/);
});

// The gap aura_validate did not have and the write tools did: building a chart
// on an unlogged datapoint went through in silence, and the empty frame is the
// one mistake that looks like a working configuration from every angle
// afterwards. The write still succeeds — the datapoint may be about to be logged.
const wroteChart = await client.callTool({
    name: 'aura_write_tab',
    arguments: {
        tab: 'Klima',
        widgets: JSON.stringify([
            {
                id: 'c9',
                type: 'echart',
                title: 'Verlauf',
                datapoint: 'zigbee.0.temp',
                gridPos: { x: 0, y: 0, w: 20, h: 10 },
                options: {
                    echartSeries: [{ id: 's1', name: 'Temperatur', datapointId: 'zigbee.0.temp', chartType: 'line' }],
                },
            },
        ]),
    },
});
check('writing a chart on an unlogged datapoint warns while it writes', () => {
    const t = wroteChart.content[0].text;
    assert.ok(!wroteChart.isError, t);
    assert.match(t, /Reihe s1 „Temperatur"/);
    assert.match(t, /wird von keiner History-Instanz geloggt/);
    assert.ok(adapter.states['config.dashboard'].includes('"c9"'), 'the warning must not block the write');
});

const wroteDeadSwitch = await client.callTool({
    name: 'aura_write_tab',
    arguments: {
        tab: 'Klima',
        widgets: JSON.stringify([
            {
                id: 'tote-liste',
                type: 'list',
                title: 'Licht',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 10, h: 8 },
                options: {
                    entries: [{ id: 'hm-rpc.1.00085D89A3C5E2.3.STATE', label: 'Deckenlicht', displayType: 'switch' }],
                },
            },
        ]),
    },
});
check('the write path warns about a dead control too, and still writes', () => {
    // The finding has to reach the tool that actually puts the widget on the
    // dashboard — that is the moment the mistake becomes the user's.
    const t = wroteDeadSwitch.content[0].text;
    assert.ok(!wroteDeadSwitch.isError, t);
    assert.match(t, /Zeile 1 „Deckenlicht“/);
    assert.match(t, /tut beim Klick nichts/);
    assert.ok(adapter.states['config.dashboard'].includes('tote-liste'));
});

const written = await client.callTool({
    name: 'aura_write_tab',
    arguments: {
        tab: 'Klima',
        widgets: JSON.stringify([{ ...OK_SWITCH, id: 'nur-dieses', gridPos: { x: 0, y: 0, w: 8, h: 4 } }]),
    },
});
check('aura_write_tab replaces the whole widget list', () => {
    assert.ok(!written.isError, written.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    assert.deepEqual(
        layouts[0].sections[0].tabs[1].widgets.map((w) => w.id),
        ['nur-dieses'],
    );
    assert.equal(layouts[0].sections[0].tabs[0].widgets.length, 1, 'the other tab must be untouched');
});

check('group definitions are written alongside, before the widgets that use them', () => {
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.deepEqual(defs, {}, 'nothing to write here yet');
});

const withDefs = await client.callTool({
    name: 'aura_write_tab',
    arguments: {
        tab: 'Klima',
        widgets: JSON.stringify([
            {
                id: 'g',
                type: 'group',
                title: 'WZ',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 12, h: 8 },
                options: { defId: 'd1' },
            },
        ]),
        groupDefs: JSON.stringify({ d1: [{ id: 'kind', type: 'switch' }] }),
    },
});
check('a group widget carries its children into config.group-defs', () => {
    assert.ok(!withDefs.isError, withDefs.content[0].text);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.deepEqual(defs.d1, [{ id: 'kind', type: 'switch' }]);
});

// ── Creating tabs ────────────────────────────────────────────────────────────

const ambiguousSection = await client.callTool({ name: 'aura_create_tab', arguments: { name: 'Garten' } });
check('creating a tab refuses to guess the section when several exist', () => {
    assert.ok(ambiguousSection.isError);
    assert.match(ambiguousSection.content[0].text, /Mehrere Bereiche möglich/);
});

const created = await client.callTool({
    name: 'aura_create_tab',
    arguments: { name: 'Garten', layout: 'Tablet', section: 'Haupt' },
});
check('a tab is created in the named section, with a slug', () => {
    assert.ok(!created.isError, created.content[0].text);
    assert.match(created.content[0].text, /Tab „Garten“ angelegt in Tablet \/ Haupt/);
    assert.match(created.content[0].text, /slug "garten"/);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const tabs = layouts[1].sections[0].tabs;
    assert.equal(tabs.length, 2);
    assert.equal(tabs[1].name, 'Garten');
    assert.deepEqual(tabs[1].widgets, []);
});

const created2 = await client.callTool({
    name: 'aura_create_tab',
    arguments: { name: 'Garten', layout: 'Tablet', section: 'Haupt' },
});
check('a second tab of the same name gets a distinct slug', () => {
    assert.ok(!created2.isError, created2.content[0].text);
    assert.match(created2.content[0].text, /slug "garten-2"/);
});

const createdBad = await client.callTool({
    name: 'aura_create_tab',
    arguments: {
        name: 'Kaputt',
        layout: 'Tablet',
        section: 'Haupt',
        widgets: JSON.stringify([{ ...OK_SWITCH, datapoint: 'gibt.es.nicht' }]),
    },
});
check('a tab whose widgets do not validate is not created at all', () => {
    assert.ok(createdBad.isError);
    assert.match(createdBad.content[0].text, /Nicht angelegt/);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    assert.ok(!JSON.stringify(layouts).includes('Kaputt'), 'a refused creation must leave no tab behind');
});

// ── Layouts and sections ─────────────────────────────────────────────────────

const layoutCreated = await client.callTool({ name: 'aura_create_layout', arguments: { name: 'Küche' } });
check('a layout is created with one section and one tab', () => {
    assert.ok(!layoutCreated.isError, layoutCreated.content[0].text);
    assert.match(layoutCreated.content[0].text, /Layout „Küche“ angelegt \(slug "kueche"\)/);
    assert.match(layoutCreated.content[0].text, /\/#\/view\/kueche/);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const made = layouts[layouts.length - 1];
    assert.equal(made.name, 'Küche');
    // An empty shell has nothing to render and no activeTabId to point at.
    assert.equal(made.sections.length, 1);
    assert.equal(made.sections[0].tabs.length, 1);
    assert.equal(made.activeSectionId, made.sections[0].id);
    assert.equal(made.sections[0].activeTabId, made.sections[0].tabs[0].id);
});

check('the umlaut is transliterated in the slug, as the frontend does', () => {
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    assert.equal(layouts[layouts.length - 1].slug, 'kueche');
});

const sectionNoLayout = await client.callTool({ name: 'aura_create_section', arguments: { name: 'Oben' } });
check('creating a section asks which layout when there are several', () => {
    assert.ok(sectionNoLayout.isError);
    assert.match(sectionNoLayout.content[0].text, /mit "layout" angeben/);
});

const sectionCreated = await client.callTool({
    name: 'aura_create_section',
    arguments: { name: 'Oben', layout: 'Küche' },
});
check('a section is created in the named layout, with one tab', () => {
    assert.ok(!sectionCreated.isError, sectionCreated.content[0].text);
    assert.match(sectionCreated.content[0].text, /Bereich „Oben“ in Layout „Küche“ angelegt/);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const kueche = layouts.find((l) => l.name === 'Küche');
    assert.equal(kueche.sections.length, 2);
    assert.equal(kueche.sections[1].name, 'Oben');
    assert.equal(kueche.sections[1].tabs.length, 1);
});

const sectionUnknown = await client.callTool({
    name: 'aura_create_section',
    arguments: { name: 'X', layout: 'gibtsnicht' },
});
check('an unknown layout lists the existing ones', () => {
    assert.ok(sectionUnknown.isError);
    assert.match(sectionUnknown.content[0].text, /Kein Layout "gibtsnicht"/);
    assert.match(sectionUnknown.content[0].text, /- Küche/);
});

const tabInNewSection = await client.callTool({
    name: 'aura_create_tab',
    arguments: { name: 'Herd', layout: 'Küche', section: 'Oben' },
});
check('a tab can be created in the freshly made section', () => {
    assert.ok(!tabInNewSection.isError, tabInNewSection.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const oben = layouts.find((l) => l.name === 'Küche').sections.find((s) => s.name === 'Oben');
    assert.deepEqual(
        oben.tabs.map((t) => t.name),
        ['Dashboard', 'Herd'],
    );
});

check('creating structure leaves the other layouts untouched', () => {
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    assert.equal(layouts[0].name, 'Wohnzimmer');
    assert.equal(layouts[0].sections[0].tabs.length, 2, 'the first layout must keep its tabs');
});

// ── Popups ───────────────────────────────────────────────────────────────────

adapter.states['config.popup-config'] = JSON.stringify({
    version: 0,
    state: {
        typeDefaults: { switch: 'builtin-switch' },
        views: [
            { id: 'builtin-switch', name: 'Schalter', widgets: [], version: 3 },
            { id: 'view-eigen', name: 'Eigenes', widgets: [{ ...OK_SWITCH, id: 'p1' }] },
        ],
    },
});

const popupList = await client.callTool({ name: 'aura_popups', arguments: {} });
check('aura_popups lists the views with their widget counts', () => {
    assert.match(popupList.content[0].text, /- Schalter \(id builtin-switch\) — 0 Widget/);
    assert.match(popupList.content[0].text, /- Eigenes \(id view-eigen\) — 1 Widget/);
});

const popupRead = await client.callTool({ name: 'aura_popup', arguments: { view: 'Eigenes' } });
check('aura_popup returns the widgets of one view', () => {
    assert.ok(!popupRead.isError, popupRead.content[0].text);
    assert.match(popupRead.content[0].text, /"id": "p1"/);
});

const popupMissing = await client.callTool({ name: 'aura_popup', arguments: { view: 'gibtsnicht' } });
check('an unknown popup lists what is there', () => {
    assert.ok(popupMissing.isError);
    assert.match(popupMissing.content[0].text, /Vorhanden:/);
    assert.match(popupMissing.content[0].text, /Schalter/);
});

const popupWritten = await client.callTool({
    name: 'aura_write_popup',
    arguments: { view: 'builtin-switch', widgets: JSON.stringify([{ ...OK_SWITCH, id: 'neu-im-popup' }]) },
});
check('editing a built-in popup flags it as user-edited', () => {
    assert.ok(!popupWritten.isError, popupWritten.content[0].text);
    const views = JSON.parse(adapter.states['config.popup-config']).state.views;
    const builtin = views.find((v) => v.id === 'builtin-switch');
    assert.equal(builtin.widgets[0].id, 'neu-im-popup');
    // Without the flag, ensureBuiltins() discards the change on the next start.
    assert.equal(builtin.userEdited, true);
});

check('the other keys of the popup state survive the write', () => {
    const state = JSON.parse(adapter.states['config.popup-config']).state;
    assert.deepEqual(state.typeDefaults, { switch: 'builtin-switch' });
    assert.equal(state.views.length, 2);
});

const popupCreated = await client.callTool({
    name: 'aura_write_popup',
    arguments: { view: 'Frisch', create: true, widgets: JSON.stringify([{ ...OK_SWITCH, id: 'f1' }]) },
});
check('a popup can be created with create:true', () => {
    assert.ok(!popupCreated.isError, popupCreated.content[0].text);
    const views = JSON.parse(adapter.states['config.popup-config']).state.views;
    assert.equal(views.length, 3);
    assert.equal(views[2].name, 'Frisch');
    assert.match(views[2].id, /^view-/);
});

const popupBad = await client.callTool({
    name: 'aura_write_popup',
    arguments: { view: 'Eigenes', widgets: JSON.stringify([{ ...OK_SWITCH, options: { showTitel: true } }]) },
});
check('a popup with a bad option is refused and the view is untouched', () => {
    assert.ok(popupBad.isError);
    assert.match(popupBad.content[0].text, /showTitel/);
    const views = JSON.parse(adapter.states['config.popup-config']).state.views;
    assert.equal(views.find((v) => v.name === 'Eigenes').widgets[0].id, 'p1');
});

// ── Groups ───────────────────────────────────────────────────────────────────

adapter.states['config.group-defs'] = JSON.stringify({
    version: 0,
    state: { defs: { d1: [{ ...OK_SWITCH, id: 'kind-1' }] }, hydrated: true },
});

const groupRead = await client.callTool({ name: 'aura_group', arguments: { defId: 'd1' } });
check('aura_group returns the children of a group', () => {
    assert.ok(!groupRead.isError, groupRead.content[0].text);
    assert.match(groupRead.content[0].text, /1 Kind\(er\)/);
    assert.match(groupRead.content[0].text, /"id": "kind-1"/);
});

const groupMissing = await client.callTool({ name: 'aura_group', arguments: { defId: 'gibtsnicht' } });
check('an unknown defId lists the known ones', () => {
    assert.ok(groupMissing.isError);
    assert.match(groupMissing.content[0].text, /Vorhanden: d1/);
});

const groupWritten = await client.callTool({
    name: 'aura_write_group',
    arguments: {
        defId: 'd1',
        widgets: JSON.stringify([
            { ...OK_SWITCH, id: 'kind-a' },
            { ...OK_SWITCH, id: 'kind-b', gridPos: { x: 0, y: 4, w: 8, h: 4 } },
        ]),
    },
});
check('aura_write_group replaces the children', () => {
    assert.ok(!groupWritten.isError, groupWritten.content[0].text);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.deepEqual(
        defs.d1.map((w) => w.id),
        ['kind-a', 'kind-b'],
    );
});

const groupBad = await client.callTool({
    name: 'aura_write_group',
    arguments: { defId: 'd1', widgets: JSON.stringify([{ ...OK_SWITCH, id: 'x', layout: 'dial' }]) },
});
check('a group whose children do not validate is left alone', () => {
    assert.ok(groupBad.isError);
    assert.match(groupBad.content[0].text, /layout "dial"/);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.deepEqual(
        defs.d1.map((w) => w.id),
        ['kind-a', 'kind-b'],
    );
});

check('the backup covers all three config states, not just the dashboard', () => {
    const names = Object.keys(adapter.files).sort();
    const last = JSON.parse(adapter.files[names[names.length - 1]]);
    assert.ok('dashboard' in last, 'dashboard missing from the backup');
    assert.ok('group-defs' in last, 'group-defs missing from the backup');
    assert.ok('popup-config' in last, 'popup-config missing from the backup — a popup edit would be unrecoverable');
});

// ── Changing one widget ──────────────────────────────────────────────────────

check('mergeWidget merges options and removes a key set to null', () => {
    const before = { id: 'a', title: 'Alt', layout: 'card', options: { showTitle: true, icon: 'X' } };
    const after = mergeWidget(before, { title: 'Neu', options: { icon: null, iconSize: 20 } });
    assert.deepEqual(after, {
        id: 'a',
        title: 'Neu',
        layout: 'card',
        // The options the caller did not mention have to survive; losing them is
        // the whole failure mode this tool exists to prevent.
        options: { showTitle: true, iconSize: 20 },
    });
    assert.deepEqual(mergeWidget(before, { layout: null }).layout, undefined);
    assert.deepEqual(before.options, { showTitle: true, icon: 'X' }, 'the input must not be mutated');
});

check('findWidget reports the tab, and refuses on a duplicated id', () => {
    const found = findWidget(LAYOUTS, 'w-dup');
    assert.ok(/Kein Widget/.test(found.error ?? ''));
    const dupes = [
        {
            id: 'l',
            name: 'L',
            sections: [
                {
                    id: 's',
                    name: 'S',
                    tabs: [
                        { id: 't1', name: 'Eins', widgets: [{ id: 'w-dup' }] },
                        { id: 't2', name: 'Zwei', widgets: [{ id: 'w-dup' }] },
                    ],
                },
            ],
        },
    ];
    assert.ok(/kommt mehrfach vor/.test(findWidget(dupes, 'w-dup').error ?? ''));
});

adapter.states['config.group-defs'] = JSON.stringify({
    version: 0,
    state: {
        defs: {
            d1: [
                { ...OK_SWITCH, id: 'kind-a', title: 'Kind A', options: { showTitle: true, iconSize: 24 } },
                { ...OK_SWITCH, id: 'kind-b', gridPos: { x: 0, y: 4, w: 8, h: 4 } },
            ],
        },
        hydrated: true,
    },
});

const groupPatched = await client.callTool({
    name: 'aura_update_widget',
    arguments: { defId: 'd1', widgetId: 'kind-a', patch: JSON.stringify({ title: 'Umbenannt' }) },
});
check('one child of a group is changed without touching its siblings', () => {
    assert.ok(!groupPatched.isError, groupPatched.content[0].text);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.equal(defs.d1.length, 2);
    assert.equal(defs.d1[0].title, 'Umbenannt');
    // The options nobody mentioned must still be there.
    assert.deepEqual(defs.d1[0].options, { showTitle: true, iconSize: 24 });
    assert.equal(defs.d1[1].id, 'kind-b', 'the sibling must be untouched');
});

const groupPatchOptions = await client.callTool({
    name: 'aura_update_widget',
    arguments: {
        defId: 'd1',
        widgetId: 'kind-a',
        patch: JSON.stringify({ options: { iconSize: 32, showTitle: null } }),
    },
});
check('an option can be changed and another removed in one call', () => {
    assert.ok(!groupPatchOptions.isError, groupPatchOptions.content[0].text);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.deepEqual(defs.d1[0].options, { iconSize: 32 });
});

const groupUnknownChild = await client.callTool({
    name: 'aura_update_widget',
    arguments: { defId: 'd1', widgetId: 'gibtsnicht', patch: JSON.stringify({ title: 'X' }) },
});
check('an unknown child lists the ids that exist', () => {
    assert.ok(groupUnknownChild.isError);
    assert.match(groupUnknownChild.content[0].text, /kind-a, kind-b/);
});

const patchInvalid = await client.callTool({
    name: 'aura_update_widget',
    arguments: { defId: 'd1', widgetId: 'kind-a', patch: JSON.stringify({ options: { showTitel: true } }) },
});
check('a patch that introduces a bad option is refused and nothing changes', () => {
    assert.ok(patchInvalid.isError);
    assert.match(patchInvalid.content[0].text, /showTitel/);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.deepEqual(defs.d1[0].options, { iconSize: 32 });
});

const idChange = await client.callTool({
    name: 'aura_update_widget',
    arguments: { defId: 'd1', widgetId: 'kind-a', patch: JSON.stringify({ id: 'anders' }) },
});
check('the id cannot be changed, because references would be orphaned', () => {
    assert.ok(idChange.isError);
    assert.match(idChange.content[0].text, /id darf sich nicht ändern/);
});

// Do not rely on what earlier tests left in the tab — put the target there.
await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: 'Klima',
        widget: JSON.stringify({ ...OK_SWITCH, id: 'im-tab', title: 'Vorher', gridPos: { x: 0, w: 8, h: 4 } }),
    },
});

const tabPatched = await client.callTool({
    name: 'aura_update_widget',
    arguments: { widgetId: 'im-tab', patch: JSON.stringify({ title: 'Im Tab geändert' }) },
});
check('a widget in a tab is found without naming the tab', () => {
    assert.ok(!tabPatched.isError, tabPatched.content[0].text);
    assert.match(tabPatched.content[0].text, /Wohnzimmer \/ Start \/ Klima/);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const klima = layouts[0].sections[0].tabs[1];
    assert.equal(klima.widgets.find((w) => w.id === 'im-tab').title, 'Im Tab geändert');
});

const replaced = await client.callTool({
    name: 'aura_update_widget',
    arguments: {
        widgetId: 'im-tab',
        replace: true,
        patch: JSON.stringify({ ...OK_SWITCH, id: 'im-tab', title: 'Ganz neu', gridPos: { x: 0, y: 8, w: 8, h: 4 } }),
    },
});
check('replace:true swaps the whole widget instead of merging', () => {
    assert.ok(!replaced.isError, replaced.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const w = layouts[0].sections[0].tabs[1].widgets.find((x) => x.id === 'im-tab');
    assert.equal(w.title, 'Ganz neu');
    assert.deepEqual(w.options, OK_SWITCH.options);
});

const missingWidget = await client.callTool({
    name: 'aura_update_widget',
    arguments: { widgetId: 'nirgendwo', patch: JSON.stringify({ title: 'X' }) },
});
check('a widget that exists nowhere says where it was looked for', () => {
    // Group children and popup widgets are found without being told where they
    // are, so the old advice ("pass the defId") would now be wrong.
    assert.ok(missingWidget.isError);
    assert.match(missingWidget.content[0].text, /weder in einem Tab, einem Popup noch in einer Gruppe/);
});

// ── Permission levels ────────────────────────────────────────────────────────

check('the token is kept out of the instance object handed to browsers', () => {
    // The password field type only masks the input in the admin UI. Without
    // protectedNative the value sits in native, and the frontend reads that
    // object on every start (App.tsx fetches system.adapter.aura.*), so every
    // browser on the network would receive the token in clear text.
    const ioPack = JSON.parse(fs.readFileSync(path.join(ROOT, 'io-package.json'), 'utf8'));
    // js-controller reads protectedNative from the ROOT of io-package.json, not
    // from common — the list was moved there and this check stayed behind, so it
    // failed on a file that was right. Both places are accepted here; only the
    // root one has an effect.
    const protectedNative = ioPack.protectedNative || ioPack.common.protectedNative || [];
    assert.ok(protectedNative.includes('mcpToken'), 'mcpToken must be protected');
    // The generated client block carries the same token a second time.
    assert.ok(protectedNative.includes('mcpClientConfig'), 'mcpClientConfig must be protected too');
});

check('the levels escalate and an unknown value falls back to read', () => {
    assert.deepEqual(LEVELS, ['read', 'write', 'rename', 'delete']);
    assert.equal(levelIndex('read'), 0);
    assert.equal(levelIndex('delete'), 3);
    // An unrecognised or missing setting must never widen permissions.
    assert.equal(levelIndex('quatsch'), 0);
    assert.equal(levelIndex(undefined), 0);
});

check('each level offers strictly more tools, and read offers no writer', () => {
    const counts = LEVELS.map((l) => toolsFor(l).length);
    for (let i = 1; i < counts.length; i++) {
        assert.ok(counts[i] > counts[i - 1], `${LEVELS[i]} must offer more than ${LEVELS[i - 1]}`);
    }
    const readTools = toolsFor('read').map((t) => t.name);
    for (const name of readTools) {
        assert.ok(!/^aura_(write|create|add|update|delete|rename)/.test(name), `${name} must not be a read tool`);
    }
    assert.ok(!toolsFor('rename').some((t) => t.name === 'aura_delete'));
    assert.ok(toolsFor('delete').some((t) => t.name === 'aura_delete'));
});

check('the level is not leaked into the advertised tool schema', () => {
    for (const t of toolsFor('delete')) {
        assert.ok(!('level' in t), `${t.name} still carries its level`);
    }
});

/** Talk to the endpoint at a given permission level. */
async function atLevel(mode, body) {
    const s = http.createServer((req, res) => {
        handleMcpRequest(req, res, { adapter, token: TOKEN, mode, version: '1' }).catch(() => {});
    });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const r = await fetch(`http://127.0.0.1:${s.address().port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(body),
    });
    const json = await r.json();
    s.close();
    return json;
}

const listedRead = await atLevel('read', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
check('tools/list at read advertises no writing tool', () => {
    const names = listedRead.result.tools.map((t) => t.name);
    assert.ok(names.includes('aura_dashboard'));
    assert.ok(!names.includes('aura_write_tab'));
    assert.ok(!names.includes('aura_delete'));
});

const refusedWrite = await atLevel('read', {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'aura_write_tab', arguments: { tab: 'Klima', widgets: '[]' } },
});
check('a cached client calling a forbidden tool is refused, naming the setting', () => {
    // The list is filtered, but a client may still hold an older copy.
    assert.equal(refusedWrite.result.isError, true);
    assert.match(refusedWrite.result.content[0].text, /braucht die Berechtigung "write"/);
    assert.match(refusedWrite.result.content[0].text, /eingestellt ist "read"/);
    assert.match(refusedWrite.result.content[0].text, /Adapter-Konfiguration/);
});

const refusedDelete = await atLevel('rename', {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'aura_delete', arguments: { kind: 'tab', target: 'Klima' } },
});
check('rename does not include delete', () => {
    assert.equal(refusedDelete.result.isError, true);
    assert.match(refusedDelete.result.content[0].text, /braucht die Berechtigung "delete"/);
});

const initRead = await atLevel('read', {
    jsonrpc: '2.0',
    id: 4,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
});
check('the instructions tell the model which level it is on', () => {
    assert.match(initRead.result.instructions, /Permission: read only/);
});

const initDelete = await atLevel('delete', {
    jsonrpc: '2.0',
    id: 5,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } },
});
check('at delete the model is told to ask before removing anything', () => {
    assert.match(initDelete.result.instructions, /Permission: delete/);
    assert.match(initDelete.result.instructions, /Ask the user before deleting/);
});

// ── Navigation properties: conditions, badges, aggregate ─────────────────────

check('each kind advertises exactly the fields it really has', () => {
    // A tab button carries conditions, a section menu entry does not, and a layout
    // has neither badges nor an aggregate. Getting this wrong means the value is
    // stored and silently ignored.
    assert.deepEqual(NODE_FIELDS.layout, ['icon', 'hidden', 'defaultSectionId', 'settings']);
    assert.deepEqual(NODE_FIELDS.section, ['icon', 'hidden', 'defaultTabId', 'badges', 'badgeAggregate', 'settings']);
    assert.deepEqual(NODE_FIELDS.tab, [
        'icon',
        'hideLabel',
        'disabled',
        'hidden',
        'conditions',
        'badges',
        'badgeAggregate',
    ]);
});

check('a field the kind does not have is refused, with the list of allowed ones', () => {
    const onSection = updateNode(LAYOUTS, 'section', 's1', { conditions: [] });
    assert.match(onSection.error, /Ein section kennt "conditions" nicht/);
    assert.match(onSection.error, /badges, badgeAggregate/);
    assert.match(updateNode(LAYOUTS, 'layout', 'l1', { badges: [] }).error, /Ein layout kennt "badges" nicht/);
});

check('renaming cannot sneak in through a property patch', () => {
    // Otherwise the write level would bypass the rename permission entirely.
    const res = updateNode(LAYOUTS, 'tab', 't1', { name: 'Anders' });
    assert.match(res.error, /kennt "name" nicht/);
    assert.match(res.error, /aura_rename/);
});

check('updateNode merges, removes on null, and does not mutate the input', () => {
    const withBoth = updateNode(LAYOUTS, 'tab', 't1', {
        icon: 'Lightbulb',
        badgeAggregate: { enabled: true, corner: 'tr' },
    });
    const tab = withBoth.layouts[0].sections[0].tabs[0];
    assert.equal(tab.icon, 'Lightbulb');
    assert.deepEqual(tab.badgeAggregate, { enabled: true, corner: 'tr' });
    // A second patch keeps the corner it did not mention.
    const merged = updateNode(withBoth.layouts, 'tab', 't1', { badgeAggregate: { enabled: false } });
    assert.deepEqual(merged.layouts[0].sections[0].tabs[0].badgeAggregate, { enabled: false, corner: 'tr' });
    const cleared = updateNode(withBoth.layouts, 'tab', 't1', { icon: null });
    assert.equal(cleared.layouts[0].sections[0].tabs[0].icon, undefined);
    assert.equal(LAYOUTS[0].sections[0].tabs[0].icon, undefined, 'the input must not be mutated');
});

const nodeUpdated = await client.callTool({
    name: 'aura_update_node',
    arguments: {
        kind: 'tab',
        target: 'Licht',
        layout: 'Wohnzimmer',
        patch: JSON.stringify({
            icon: 'Lightbulb',
            conditions: [{ id: 'c1', datapoint: 'hm-rpc.0.LEQ1.1.STATE', operator: '==', value: 'true' }],
            badgeAggregate: { enabled: true },
        }),
    },
});
check('a tab button takes an icon, conditions and the aggregate through the endpoint', () => {
    assert.ok(!nodeUpdated.isError, nodeUpdated.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const tab = layouts[0].sections[0].tabs.find((t) => t.name === 'Licht');
    assert.equal(tab.icon, 'Lightbulb');
    assert.equal(tab.conditions.length, 1);
    assert.equal(tab.badgeAggregate.enabled, true);
    // The widgets on the tab are untouched by a button change.
    assert.equal(tab.widgets.length, 1);
});

const sectionUpdated = await client.callTool({
    name: 'aura_update_node',
    arguments: {
        kind: 'section',
        target: 'Start',
        layout: 'Wohnzimmer',
        patch: JSON.stringify({ icon: 'Home', badges: [{ id: 'b1' }] }),
    },
});
check('a section menu entry takes an icon and badges', () => {
    assert.ok(!sectionUpdated.isError, sectionUpdated.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    assert.equal(layouts[0].sections[0].icon, 'Home');
    assert.equal(layouts[0].sections[0].badges.length, 1);
});

const sectionCondition = await client.callTool({
    name: 'aura_update_node',
    arguments: { kind: 'section', target: 'Start', layout: 'Wohnzimmer', patch: JSON.stringify({ conditions: [] }) },
});
check('the endpoint refuses conditions on a section instead of storing dead config', () => {
    assert.ok(sectionCondition.isError);
    assert.match(sectionCondition.content[0].text, /kennt "conditions" nicht/);
});

const overview = await client.callTool({ name: 'aura_dashboard', arguments: {} });
check('aura_dashboard shows what is set on the buttons', () => {
    const t = overview.content[0].text;
    assert.match(t, /Bereichsmenü: Icon, 1 Marker/);
    assert.match(t, /Tab-Button: Icon, 1 Bedingung\(en\), Aggregat-Anzahl/);
});

// ── Renaming ─────────────────────────────────────────────────────────────────

const renamed = await client.callTool({
    name: 'aura_rename',
    arguments: { kind: 'tab', target: 'Klima', name: 'Raumklima' },
});
check('a tab is renamed and keeps its slug', () => {
    assert.ok(!renamed.isError, renamed.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const tab = layouts[0].sections[0].tabs[1];
    assert.equal(tab.name, 'Raumklima');
    // Changing the slug would break bookmarks and the navigate datapoints.
    assert.equal(tab.slug, 'klima');
    assert.match(renamed.content[0].text, /slug bleibt "klima"/);
});

const renamedLayout = await client.callTool({
    name: 'aura_rename',
    arguments: { kind: 'layout', target: 'Tablet', name: 'Wandtablet' },
});
check('a layout is renamed and keeps its slug too', () => {
    assert.ok(!renamedLayout.isError, renamedLayout.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const l = layouts.find((x) => x.name === 'Wandtablet');
    assert.equal(l.slug, 'tablet');
});

// ── Deleting ─────────────────────────────────────────────────────────────────

const deletedTab = await client.callTool({ name: 'aura_delete', arguments: { kind: 'tab', target: 'Raumklima' } });
check('deleting a tab says how much content went with it', () => {
    assert.ok(!deletedTab.isError, deletedTab.content[0].text);
    assert.match(deletedTab.content[0].text, /Widget\(s\)/);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    assert.ok(!layouts[0].sections[0].tabs.some((t) => t.name === 'Raumklima'));
});

const onlySection = await client.callTool({
    name: 'aura_delete',
    arguments: { kind: 'section', target: 'Start', layout: 'Wohnzimmer' },
});
check('the only section of a layout cannot be deleted', () => {
    assert.ok(onlySection.isError);
    assert.match(onlySection.content[0].text, /nur diesen einen Bereich/);
});

// The group needs a host widget, or the prune that follows every delete drops
// its children as orphans — which is exactly what it is there for.
adapter.states['config.group-defs'] = JSON.stringify({
    version: 0,
    state: {
        defs: {
            d1: [
                { ...OK_SWITCH, id: 'kind-a' },
                { ...OK_SWITCH, id: 'kind-b', gridPos: { x: 0, y: 4, w: 8, h: 4 } },
            ],
        },
        hydrated: true,
    },
});
const anyTab = allTabs(JSON.parse(adapter.states['config.dashboard']).state.layouts)[0];
const host = await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: anyTab.id,
        widget: JSON.stringify({
            id: 'wirt-d1',
            type: 'group',
            title: 'Wirt',
            datapoint: '',
            gridPos: { x: 0, w: 12, h: 8 },
            options: { defId: 'd1' },
        }),
    },
});
assert.ok(!host.isError, host.content[0].text);
const deletedWidgetInGroup = await client.callTool({
    name: 'aura_delete',
    arguments: { kind: 'widget', target: 'kind-b', defId: 'd1' },
});
check('a single child can be deleted out of a group', () => {
    assert.ok(!deletedWidgetInGroup.isError, deletedWidgetInGroup.content[0].text);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.deepEqual(
        defs.d1.map((w) => w.id),
        ['kind-a'],
    );
});

const deletedPopup = await client.callTool({ name: 'aura_delete', arguments: { kind: 'popup', target: 'Frisch' } });
check('a popup can be deleted', () => {
    assert.ok(!deletedPopup.isError, deletedPopup.content[0].text);
    const views = JSON.parse(adapter.states['config.popup-config']).state.views;
    assert.ok(!views.some((v) => v.name === 'Frisch'));
});

check('every deletion left a backup behind', () => {
    const names = Object.keys(adapter.files);
    assert.ok(names.length >= 4, `expected several backups, got ${names.length}`);
});

// ── Custom layout ────────────────────────────────────────────────────────────
// 27 of 55 types offer layout "custom", and customGrid used to be an untyped {}:
// no guidance, no validation, and CustomGridView falls back to nine empty cells.

check('a custom grid is described down to the cell type', () => {
    assert.equal(schema.commonOptions.customGrid.ref, 'CustomGridDef');
    const def = schema.types.CustomGridDef.fields;
    assert.ok(def.cols.required && def.rows.required);
    assert.equal(def.cells.items.ref, 'CustomCell');
    assert.ok(schema.types.CustomCell.fields.type, 'a cell needs its type described');
    assert.ok(schema.types.CustomCellType.enum.includes('value'));
});

check('a broken custom grid is caught, cell by cell', () => {
    const w = (customGrid) => ({ ...OK_SWITCH, layout: 'custom', options: { customGrid } });
    assert.ok(hasError(validateWidget(w({ unsinn: true }), schema), /"cols" fehlt/));
    assert.ok(
        hasError(validateWidget(w({ cols: 1, rows: 1, cells: [{ type: 'blubb' }] }), schema), /cells\[0\]\.type/),
    );
    assert.deepEqual(
        validateWidget(w({ cols: 2, rows: 1, cells: [{ type: 'title', align: 'left' }, { type: 'value' }] }), schema)
            .errors,
        [],
    );
});

check('layout "custom" without a grid is flagged as the empty widget it produces', () => {
    const res = validateWidget({ ...OK_SWITCH, layout: 'custom' }, schema);
    assert.deepEqual(res.errors, [], 'it is valid, just pointless');
    assert.ok(hasWarning(res, /ohne "customGrid" ergibt ein leeres Widget/));
});

// ── Backups ──────────────────────────────────────────────────────────────────

const backupList = await client.callTool({ name: 'aura_backups', arguments: {} });
check('aura_backups lists what earlier writes left behind', () => {
    assert.ok(!backupList.isError, backupList.content[0].text);
    assert.match(backupList.content[0].text, /# Sicherungen \(\d+\)/);
    assert.match(backupList.content[0].text, /- mcp-.*\.json/);
});

const beforeRestore = JSON.parse(adapter.states['config.dashboard']);
const firstBackup = Object.keys(adapter.files).sort()[0];
const restored = await client.callTool({ name: 'aura_restore', arguments: { backup: firstBackup } });

check('restoring puts the earlier state back', () => {
    assert.ok(!restored.isError, restored.content[0].text);
    const expected = JSON.parse(JSON.parse(adapter.files[firstBackup]).dashboard);
    assert.deepEqual(JSON.parse(adapter.states['config.dashboard']), expected);
    assert.notDeepEqual(JSON.parse(adapter.states['config.dashboard']), beforeRestore, 'nothing would have changed');
});

check('the state before the restore is itself kept', () => {
    // Restoring the wrong backup must not be a one-way door.
    assert.match(restored.content[0].text, /Der Stand davor liegt als aura\.0\.backups\/mcp-/);
    const safety = restored.content[0].text.match(/backups\/(mcp-[\w.-]+\.json)/)[1];
    assert.deepEqual(JSON.parse(JSON.parse(adapter.files[safety]).dashboard), beforeRestore);
});

const badName = await client.callTool({ name: 'aura_restore', arguments: { backup: '../../etc/passwd' } });
check('only this server own backup names are accepted', () => {
    // The name reaches readFile, so it must not be able to walk out of the folder.
    assert.ok(badName.isError);
    assert.match(badName.content[0].text, /kein Sicherungsname/);
});

adapter.files['mcp-fremd.json'] = JSON.stringify({ _type: 'etwas-anderes', dashboard: '{}' });
const foreign = await client.callTool({ name: 'aura_restore', arguments: { backup: 'mcp-fremd.json' } });
check('a file that is not one of our backups is refused', () => {
    assert.ok(foreign.isError);
    assert.match(foreign.content[0].text, /keine Sicherung dieses Servers/);
});

adapter.files['mcp-alt.json'] = JSON.stringify({
    _type: 'aura-mcp-backup',
    _ts: 1,
    dashboard: JSON.stringify({ version: 0, state: { layouts: [] } }),
    // An older backup, taken before popups were covered.
    'popup-config': null,
});
const popupsBefore = adapter.states['config.popup-config'];
const partial = await client.callTool({ name: 'aura_restore', arguments: { backup: 'mcp-alt.json' } });
check('an older backup does not wipe what it never held', () => {
    assert.ok(!partial.isError, partial.content[0].text);
    // Writing null over the live popups would turn a restore into a second accident.
    assert.equal(adapter.states['config.popup-config'], popupsBefore);
    assert.match(partial.content[0].text, /\(dashboard\)/);
});

// ── The widget frame itself ──────────────────────────────────────────────────
// The one level that used to pass unchecked.

check('a wrongly typed frame field is caught', () => {
    assert.ok(hasError(validateWidget({ ...OK_SWITCH, mobileOrder: 'zwei' }, schema), /"mobileOrder": string/));
    assert.deepEqual(validateWidget({ ...OK_SWITCH, mobileOrder: 2 }, schema).errors, []);
});

check('a stray top-level key is a warning, not a rejection', () => {
    // AURA ignores it rather than breaking, so an error would be too harsh —
    // but staying silent is how a typo survives forever.
    const res = validateWidget({ ...OK_SWITCH, mobilOrder: 2 }, schema);
    assert.deepEqual(res.errors, []);
    assert.ok(hasWarning(res, /"mobilOrder" gehört nicht zu einem Widget/));
    assert.ok(hasWarning(res, /meintest du "mobileOrder"/));
});

check('groupDefs may ride along without being flagged', () => {
    // Import payloads carry it next to the widget; it is not part of one.
    assert.deepEqual(validateWidget({ ...OK_SWITCH, groupDefs: { d1: [] } }, schema).warnings, []);
});

// ── Reordering ───────────────────────────────────────────────────────────────

check('reorderNodes demands the complete set', () => {
    const list = [
        { id: 'a', name: 'Eins', slug: 'eins' },
        { id: 'b', name: 'Zwei', slug: 'zwei' },
    ];
    // Omission must not read as deletion.
    assert.match(reorderNodes(list, ['Eins'], 'Tabs').error, /es fehlen: "Zwei"/);
    assert.match(reorderNodes(list, ['Eins', 'Drei'], 'Tabs').error, /"Drei" gibt es .* nicht/);
    assert.match(reorderNodes(list, ['Eins', 'Eins'], 'Tabs').error, /mehrfach/);
    assert.deepEqual(
        reorderNodes(list, ['Zwei', 'eins'], 'Tabs').ordered.map((x) => x.id),
        ['b', 'a'],
    );
});

// Earlier blocks renamed and deleted their way through the fixture, so this one
// builds what it needs instead of inheriting it.
await client.callTool({ name: 'aura_create_layout', arguments: { name: 'Werkbank' } });
await client.callTool({
    name: 'aura_create_tab',
    arguments: { name: 'Eins', layout: 'Werkbank', section: 'Standard' },
});
await client.callTool({
    name: 'aura_create_tab',
    arguments: { name: 'Zwei', layout: 'Werkbank', section: 'Standard' },
});

const reordered = await client.callTool({
    name: 'aura_reorder',
    arguments: { kind: 'tab', layout: 'Werkbank', section: 'Standard', order: ['Zwei', 'Eins', 'Dashboard'] },
});
check('tabs are reordered through the endpoint', () => {
    assert.ok(!reordered.isError, reordered.content[0].text);
    const wb = JSON.parse(adapter.states['config.dashboard']).state.layouts.find((l) => l.name === 'Werkbank');
    assert.deepEqual(
        wb.sections[0].tabs.map((t) => t.name),
        ['Zwei', 'Eins', 'Dashboard'],
    );
});

const reorderIncomplete = await client.callTool({
    name: 'aura_reorder',
    arguments: { kind: 'tab', layout: 'Werkbank', section: 'Standard', order: ['Eins'] },
});
check('an incomplete order is refused rather than dropping a tab', () => {
    assert.ok(reorderIncomplete.isError);
    assert.match(reorderIncomplete.content[0].text, /muss alle Tabs enthalten/);
    const wb = JSON.parse(adapter.states['config.dashboard']).state.layouts.find((l) => l.name === 'Werkbank');
    assert.equal(wb.sections[0].tabs.length, 3, 'nothing may have been dropped');
});

const layoutNames = JSON.parse(adapter.states['config.dashboard']).state.layouts.map((l) => l.name);
const wantOrder = [...layoutNames].reverse();
const reorderLayouts = await client.callTool({ name: 'aura_reorder', arguments: { kind: 'layout', order: wantOrder } });
check('layouts are reordered too', () => {
    assert.ok(!reorderLayouts.isError, reorderLayouts.content[0].text);
    assert.deepEqual(
        JSON.parse(adapter.states['config.dashboard']).state.layouts.map((l) => l.name),
        wantOrder,
    );
});

// ── Copy and move ────────────────────────────────────────────────────────────

adapter.states['config.group-defs'] = JSON.stringify({
    version: 0,
    state: { defs: { dg: [{ ...OK_SWITCH, id: 'kind' }] }, hydrated: true },
});
await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: 'Eins',
        layout: 'Werkbank',
        widget: JSON.stringify({
            id: 'quelle',
            type: 'group',
            title: 'Gruppe',
            datapoint: '',
            gridPos: { x: 0, w: 12, h: 8 },
            options: { defId: 'dg' },
        }),
    },
});

const copied = await client.callTool({
    name: 'aura_copy_widget',
    arguments: { widgetId: 'quelle', toTab: 'Zwei', layout: 'Werkbank' },
});
check('a copied group gets its own children, not a shared reference', () => {
    assert.ok(!copied.isError, copied.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const wz = layouts.find((l) => l.name === 'Werkbank').sections[0];
    const klima = wz.tabs.find((t) => t.name === 'Zwei');
    const copy = klima.widgets.find((w) => w.id !== 'quelle' && w.type === 'group');
    assert.ok(copy, 'the copy must be in the target tab');
    // Sharing the defId would make editing the copy change the original.
    assert.notEqual(copy.options.defId, 'dg');
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.ok(defs[copy.options.defId], 'the copied children must exist under the new id');
    assert.ok(defs.dg, 'the original children must be untouched');
    assert.match(copied.content[0].text, /Gruppen-Kinder wurden mitkopiert/);
});

const sameTab = await client.callTool({
    name: 'aura_copy_widget',
    arguments: { widgetId: 'quelle', toTab: 'Eins', layout: 'Werkbank' },
});
check('copying into the tab it already sits in is refused', () => {
    assert.ok(sameTab.isError);
    assert.match(sameTab.content[0].text, /liegt bereits/);
});

const moved = await client.callTool({
    name: 'aura_copy_widget',
    arguments: { widgetId: 'quelle', toTab: 'Zwei', layout: 'Werkbank', mode: 'move' },
});
check('a move takes the widget out of the source tab', () => {
    assert.ok(!moved.isError, moved.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const wz = layouts.find((l) => l.name === 'Werkbank').sections[0];
    assert.ok(!wz.tabs.find((t) => t.name === 'Eins').widgets.some((w) => w.id === 'quelle'));
    assert.ok(wz.tabs.find((t) => t.name === 'Zwei').widgets.some((w) => w.id === 'quelle'));
});

// ── Presets ──────────────────────────────────────────────────────────────────

const noPresets = await client.callTool({ name: 'aura_presets', arguments: {} });
check('an empty preset store says so', () => {
    assert.match(noPresets.content[0].text, /Keine Widget-Vorlagen/);
});

const saved = await client.callTool({
    name: 'aura_save_preset',
    arguments: { widgetId: 'quelle', name: 'Meine Gruppe', icon: '🏠' },
});
check('a widget is saved as a preset, with its group children', () => {
    assert.ok(!saved.isError, saved.content[0].text);
    const presets = JSON.parse(adapter.states['config.widget-presets']).state.presets;
    assert.equal(presets.length, 1);
    assert.equal(presets[0].name, 'Meine Gruppe');
    assert.equal(presets[0].icon, '🏠');
    // Without the children the blueprint would insert an empty group.
    assert.ok(presets[0].groupDefs && Object.keys(presets[0].groupDefs).length);
    assert.match(saved.content[0].text, /mit 1 Gruppen-Definition/);
});

const inserted = await client.callTool({
    name: 'aura_insert_preset',
    arguments: { preset: 'Meine Gruppe', tab: 'Eins', layout: 'Werkbank' },
});
check('a preset is inserted with fresh ids', () => {
    assert.ok(!inserted.isError, inserted.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const licht = layouts.find((l) => l.name === 'Werkbank').sections[0].tabs.find((t) => t.name === 'Eins');
    const made = licht.widgets.find((w) => w.type === 'group');
    assert.ok(made && made.id.startsWith('w-'), 'a new id, not the blueprint one');
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.ok(defs[made.options.defId], 'its children must have been registered');
});

const insertedTwice = await client.callTool({
    name: 'aura_insert_preset',
    arguments: { preset: 'Meine Gruppe', tab: 'Eins', layout: 'Werkbank' },
});
check('inserting the same preset twice does not make them share children', () => {
    assert.ok(!insertedTwice.isError, insertedTwice.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const licht = layouts.find((l) => l.name === 'Werkbank').sections[0].tabs.find((t) => t.name === 'Eins');
    const groups = licht.widgets.filter((w) => w.type === 'group');
    assert.equal(groups.length, 2);
    assert.notEqual(groups[0].options.defId, groups[1].options.defId);
    assert.notEqual(groups[0].id, groups[1].id);
});

const repointed = await client.callTool({
    name: 'aura_insert_preset',
    arguments: { preset: 'Meine Gruppe', tab: 'Zwei', layout: 'Werkbank', datapoint: 'zigbee.0.temp' },
});
check('a preset can be re-pointed at another datapoint on insert', () => {
    assert.ok(!repointed.isError, repointed.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const klima = layouts.find((l) => l.name === 'Werkbank').sections[0].tabs.find((t) => t.name === 'Zwei');
    const made = klima.widgets.filter((w) => w.type === 'group').pop();
    assert.equal(made.datapoint, 'zigbee.0.temp');
});

const unknownPreset = await client.callTool({
    name: 'aura_insert_preset',
    arguments: { preset: 'gibtsnicht', tab: 'Eins', layout: 'Werkbank' },
});
check('an unknown preset lists what is there', () => {
    assert.ok(unknownPreset.isError);
    assert.match(unknownPreset.content[0].text, /Meine Gruppe/);
});

const beforePresets = adapter.states['config.widget-presets'];
const savedSecond = await client.callTool({
    name: 'aura_save_preset',
    arguments: { widgetId: 'quelle', name: 'Zweite' },
});
const restoredPresets = await client.callTool({
    name: 'aura_restore',
    arguments: { backup: savedSecond.content[0].text.match(/mcp-[\w.-]+\.json/)[0] },
});
check('a preset write is covered by the backup it announces', () => {
    // Presets are a fourth writable state; leaving them out of the snapshot would
    // make the "Sicherung: ..." line a promise the restore cannot keep.
    assert.ok(!restoredPresets.isError, restoredPresets.content[0].text);
    assert.equal(adapter.states['config.widget-presets'], beforePresets);
});

// ── Vorlagen löschen und umbenennen, und was bei falscher Art passiert ───────

const badKind = await client.callTool({ name: 'aura_delete', arguments: { kind: 'quatsch', target: 'x' } });
check('an unknown kind is named as such instead of being read as a tab', () => {
    // It used to fall through to the tab branch and answer "Kein Tab ... gefunden"
    // with a list of tabs — an answer to a question nobody asked.
    assert.ok(badKind.isError);
    assert.match(badKind.content[0].text, /"kind": "quatsch" gibt es hier nicht/);
    assert.match(badKind.content[0].text, /preset/);
});

await client.callTool({ name: 'aura_save_preset', arguments: { widgetId: 'quelle', name: 'Zum Umbenennen' } });
const renamedPreset = await client.callTool({
    name: 'aura_rename',
    arguments: { kind: 'preset', target: 'Zum Umbenennen', name: 'Neuer Name' },
});
check('a preset can be renamed', () => {
    assert.ok(!renamedPreset.isError, renamedPreset.content[0].text);
    const presets = JSON.parse(adapter.states['config.widget-presets']).state.presets;
    assert.ok(presets.some((p) => p.name === 'Neuer Name'));
});

const deletedPreset = await client.callTool({
    name: 'aura_delete',
    arguments: { kind: 'preset', target: 'Neuer Name' },
});
check('a preset can be deleted', () => {
    assert.ok(!deletedPreset.isError, deletedPreset.content[0].text);
    const presets = JSON.parse(adapter.states['config.widget-presets']).state.presets;
    assert.ok(!presets.some((p) => p.name === 'Neuer Name'));
});

const missingPreset = await client.callTool({ name: 'aura_delete', arguments: { kind: 'preset', target: 'nix' } });
check('deleting an unknown preset says what there is', () => {
    assert.ok(missingPreset.isError);
    assert.match(missingPreset.content[0].text, /Vorhanden:|keine Vorlagen/);
});

// ── Eine Gruppe über die Widget-Id ansprechen ────────────────────────────────

const byWidgetId = await client.callTool({ name: 'aura_group', arguments: { widgetId: 'quelle' } });
check('a group can be addressed by the id of its widget', () => {
    // The defId sits in options; the id a model has in hand comes from aura_tab.
    assert.ok(!byWidgetId.isError, byWidgetId.content[0].text);
    assert.match(byWidgetId.content[0].text, /Kind\(er\)/);
});

const noAddress = await client.callTool({ name: 'aura_group', arguments: {} });
check('neither defId nor widgetId names both parameters', () => {
    assert.ok(noAddress.isError);
    assert.match(noAddress.content[0].text, /"defId" oder "widgetId" angeben/);
});

await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: 'Eins',
        layout: 'Werkbank',
        widget: JSON.stringify({
            id: 'schlicht',
            type: 'value',
            title: 'Schlicht',
            datapoint: 'zigbee.0.temp',
            gridPos: { x: 0, w: 6, h: 4 },
            options: {},
        }),
    },
});
const notAGroup = await client.callTool({ name: 'aura_group', arguments: { widgetId: 'schlicht' } });
check('a widget without children says so instead of reporting a missing defId', () => {
    assert.ok(notAGroup.isError);
    assert.match(notAGroup.content[0].text, /hat keine Gruppen-Kinder/);
});

// ── Ein einzelnes Kind anhängen ──────────────────────────────────────────────

const beforeChildren = JSON.parse(adapter.states['config.group-defs']).state.defs;
const beforeCount = Object.values(beforeChildren)[0].length;
const appended = await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        widgetId: 'quelle',
        widget: JSON.stringify({
            id: 'kind-neu',
            type: 'value',
            title: 'Neu',
            datapoint: 'zigbee.0.temp',
            gridPos: { x: 0, y: 20, w: 6, h: 4 },
            options: {},
        }),
    },
});
check('a single child is appended without rewriting the whole group', () => {
    assert.ok(!appended.isError, appended.content[0].text);
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    const children = Object.values(defs).find((list) => list.some((w) => w.id === 'kind-neu'));
    assert.ok(children, 'the new child must be in the group');
    assert.equal(children.length, beforeCount + 1, 'and the existing ones must still be there');
});

// ── Tabs, Bereiche und Layouts kopieren und verschieben ──────────────────────

await client.callTool({ name: 'aura_create_section', arguments: { name: 'Zweitbereich', layout: 'Werkbank' } });

const copiedTab = await client.callTool({
    name: 'aura_copy_node',
    arguments: { kind: 'tab', target: 'Eins', fromLayout: 'Werkbank', toLayout: 'Werkbank', toSection: 'Zweitbereich' },
});
check('a copied tab brings its widgets and its own group children', () => {
    assert.ok(!copiedTab.isError, copiedTab.content[0].text);
    const wb = JSON.parse(adapter.states['config.dashboard']).state.layouts.find((l) => l.name === 'Werkbank');
    const zweit = wb.sections.find((s) => s.name === 'Zweitbereich');
    const copy = zweit.tabs.find((t) => t.name === 'Eins Kopie');
    assert.ok(copy, 'the copy must exist under its new name');
    const source = wb.sections[0].tabs.find((t) => t.name === 'Eins');
    assert.equal(copy.widgets.length, source.widgets.length);
    // Fresh ids, or the click-action picker would mark both twins.
    assert.ok(!copy.widgets.some((w) => source.widgets.some((s) => s.id === w.id)));
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    for (const w of copy.widgets.filter((x) => x.options && x.options.defId)) {
        assert.ok(defs[w.options.defId], `children of ${w.id} must exist`);
        assert.ok(!source.widgets.some((s) => s.options && s.options.defId === w.options.defId));
    }
});

const movedTab = await client.callTool({
    name: 'aura_copy_node',
    arguments: {
        kind: 'tab',
        target: 'Eins Kopie',
        mode: 'move',
        fromLayout: 'Werkbank',
        toLayout: 'Werkbank',
        toSection: 'Standard',
    },
});
check('a moved tab keeps its ids and leaves the source section', () => {
    assert.ok(!movedTab.isError, movedTab.content[0].text);
    const wb = JSON.parse(adapter.states['config.dashboard']).state.layouts.find((l) => l.name === 'Werkbank');
    assert.ok(!wb.sections.find((s) => s.name === 'Zweitbereich').tabs.some((t) => t.name === 'Eins Kopie'));
    assert.ok(wb.sections.find((s) => s.name === 'Standard').tabs.some((t) => t.name === 'Eins Kopie'));
});

const emptied = JSON.parse(adapter.states['config.dashboard']).state.layouts.find((l) => l.name === 'Werkbank');
check('a section emptied by a move gets a fresh tab', () => {
    // A section with no tabs renders nothing and cannot be filled through the UI.
    assert.equal(emptied.sections.find((s) => s.name === 'Zweitbereich').tabs.length, 1);
});

const sameSection = await client.callTool({
    name: 'aura_copy_node',
    arguments: { kind: 'tab', target: 'Eins', fromLayout: 'Werkbank', toLayout: 'Werkbank', toSection: 'Standard' },
});
check('a tab can be duplicated where it already is', () => {
    // "Duplicate this tab" is the commonest copy wish; only a MOVE to the place
    // it already occupies is pointless.
    assert.ok(!sameSection.isError, sameSection.content[0].text);
    const wb = JSON.parse(adapter.states['config.dashboard']).state.layouts.find((l) => l.name === 'Werkbank');
    const std = wb.sections.find((s) => s.name === 'Standard');
    assert.ok(std.tabs.some((t) => t.name === 'Eins Kopie'));
});

const moveToItself = await client.callTool({
    name: 'aura_copy_node',
    arguments: {
        kind: 'tab',
        target: 'Eins',
        mode: 'move',
        fromLayout: 'Werkbank',
        toLayout: 'Werkbank',
        toSection: 'Standard',
    },
});
check('moving it there is still refused', () => {
    assert.ok(moveToItself.isError);
    assert.match(moveToItself.content[0].text, /liegt bereits/);
});

const copiedLayout = await client.callTool({
    name: 'aura_copy_node',
    arguments: { kind: 'layout', target: 'Werkbank', name: 'Werkbank Zwilling' },
});
check('a whole layout can be copied', () => {
    assert.ok(!copiedLayout.isError, copiedLayout.content[0].text);
    const layouts = JSON.parse(adapter.states['config.dashboard']).state.layouts;
    const twin = layouts.find((l) => l.name === 'Werkbank Zwilling');
    const source = layouts.find((l) => l.name === 'Werkbank');
    assert.ok(twin);
    assert.equal(twin.sections.length, source.sections.length);
    assert.notEqual(twin.slug, source.slug);
});

const movedLayout = await client.callTool({
    name: 'aura_copy_node',
    arguments: { kind: 'layout', target: 'Werkbank', mode: 'move' },
});
check('moving a layout is refused with the tool that does mean something', () => {
    assert.ok(movedLayout.isError);
    assert.match(movedLayout.content[0].text, /aura_reorder/);
});

// ── Suchen ───────────────────────────────────────────────────────────────────

const foundByDp = await client.callTool({ name: 'aura_find', arguments: { datapoint: 'zigbee.0.temp' } });
check('aura_find reports where a datapoint is used, options included', () => {
    assert.ok(!foundByDp.isError, foundByDp.content[0].text);
    assert.match(foundByDp.content[0].text, /Treffer/);
    assert.match(foundByDp.content[0].text, /kind-neu/, 'group children must be searched too');
});

const foundNothing = await client.callTool({ name: 'aura_find', arguments: { datapoint: 'gibt.es.nicht' } });
check('a search without hits says so plainly', () => {
    assert.match(foundNothing.content[0].text, /Keine Treffer/);
});

const noNeedle = await client.callTool({ name: 'aura_find', arguments: {} });
check('a search without a criterion is refused rather than dumping everything', () => {
    assert.ok(noNeedle.isError);
    assert.match(noNeedle.content[0].text, /Mindestens eines/);
});

// ── Popups sind kein Sonderfall mehr ─────────────────────────────────────────

adapter.states['config.popup-config'] = JSON.stringify({
    version: 0,
    state: { views: [{ id: 'v-test', name: 'Detailfenster', widgets: [{ ...OK_SWITCH, id: 'pw-1' }] }] },
});

const popupPatched = await client.callTool({
    name: 'aura_update_widget',
    arguments: { widgetId: 'pw-1', patch: JSON.stringify({ title: 'Umbenannt' }) },
});
check('a widget inside a popup can be changed in place', () => {
    // It used to mean replacing the whole view with aura_write_popup.
    assert.ok(!popupPatched.isError, popupPatched.content[0].text);
    const views = JSON.parse(adapter.states['config.popup-config']).state.views;
    assert.equal(views.find((v) => v.id === 'v-test').widgets[0].title, 'Umbenannt');
});

const popupAppended = await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: 'Detailfenster',
        widget: JSON.stringify({ ...OK_SWITCH, id: 'pw-2', gridPos: { x: 0, w: 8, h: 4 } }),
    },
});
check('a popup takes a new widget wherever a tab would', () => {
    assert.ok(!popupAppended.isError, popupAppended.content[0].text);
    const view = JSON.parse(adapter.states['config.popup-config']).state.views.find((v) => v.id === 'v-test');
    assert.deepEqual(
        view.widgets.map((w) => w.id),
        ['pw-1', 'pw-2'],
    );
});

const popupRefused = await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: 'Detailfenster',
        widget: JSON.stringify({ ...OK_SWITCH, id: 'pw-3', datapoint: 'gibt.es.nicht', gridPos: { x: 0, w: 8, h: 4 } }),
    },
});
check('and is refused on the same grounds, in its own words', () => {
    assert.ok(popupRefused.isError);
    assert.match(popupRefused.content[0].text, /das Popup wäre fehlerhaft/);
});

const copiedToPopup = await client.callTool({
    name: 'aura_copy_widget',
    arguments: { widgetId: 'quelle', toTab: 'Detailfenster' },
});
check('a group widget can be copied into a popup, children and all', () => {
    assert.ok(!copiedToPopup.isError, copiedToPopup.content[0].text);
    const view = JSON.parse(adapter.states['config.popup-config']).state.views.find((v) => v.id === 'v-test');
    const copy = view.widgets.find((w) => w.type === 'group');
    assert.ok(copy, 'the copy must be in the popup');
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    assert.ok(defs[copy.options.defId], 'with children of its own');
});

const deletedInPopup = await client.callTool({
    name: 'aura_delete',
    arguments: { kind: 'widget', target: 'pw-2' },
});
check('a single popup widget can be deleted', () => {
    assert.ok(!deletedInPopup.isError, deletedInPopup.content[0].text);
    const view = JSON.parse(adapter.states['config.popup-config']).state.views.find((v) => v.id === 'v-test');
    assert.ok(!view.widgets.some((w) => w.id === 'pw-2'));
});

// ── replace ohne mitgeschickte id ────────────────────────────────────────────

const replacedWhole = await client.callTool({
    name: 'aura_update_widget',
    arguments: {
        widgetId: 'pw-1',
        replace: true,
        patch: JSON.stringify({
            type: 'switch',
            title: 'Ganz neu',
            datapoint: OK_SWITCH.datapoint,
            gridPos: { x: 0, y: 0, w: 8, h: 4 },
            options: {},
        }),
    },
});
check('replace keeps the id when the patch leaves it out', () => {
    // It used to answer 'Die id darf sich nicht aendern ("pw-1" -> "undefined")'
    // without saying that the id had to be carried along.
    assert.ok(!replacedWhole.isError, replacedWhole.content[0].text);
    const view = JSON.parse(adapter.states['config.popup-config']).state.views.find((v) => v.id === 'v-test');
    const w = view.widgets.find((x) => x.id === 'pw-1');
    assert.equal(w.title, 'Ganz neu');
    assert.equal(w.options.showTitle, undefined, 'replace must not keep the old options');
});

// ── Verwaiste Gruppen-Definitionen ───────────────────────────────────────────

const orphanTab = allTabs(JSON.parse(adapter.states['config.dashboard']).state.layouts)[0];
await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: orphanTab.id,
        widget: JSON.stringify({
            id: 'g-weg',
            type: 'group',
            title: 'Geht weg',
            datapoint: '',
            gridPos: { x: 0, w: 12, h: 8 },
            options: { defId: 'd-weg' },
        }),
        groupDefs: JSON.stringify({ 'd-weg': [{ ...OK_SWITCH, id: 'weg-kind' }] }),
    },
});
check('the group definition is there while its widget is', () => {
    assert.ok(JSON.parse(adapter.states['config.group-defs']).state.defs['d-weg']);
});

const droppedWith = await client.callTool({ name: 'aura_delete', arguments: { kind: 'widget', target: 'g-weg' } });
check('deleting a group widget takes its children with it', () => {
    assert.ok(!droppedWith.isError, droppedWith.content[0].text);
    assert.ok(!JSON.parse(adapter.states['config.group-defs']).state.defs['d-weg']);
    assert.match(droppedWith.content[0].text, /verwaiste Gruppen-Definition/);
});

check('a definition still in use is never collected', () => {
    // The prune runs after every delete; a def a popup or another tab still
    // references must survive it.
    const defs = JSON.parse(adapter.states['config.group-defs']).state.defs;
    const views = JSON.parse(adapter.states['config.popup-config']).state.views;
    const used = views.find((v) => v.id === 'v-test').widgets.find((w) => w.type === 'group');
    assert.ok(defs[used.options.defId], 'the popup copy keeps its children');
});

// ── Was die Antworten kosten ─────────────────────────────────────────────────

const allTypes = await client.callTool({ name: 'aura_widget_types', arguments: {} });
const oneGroup = await client.callTool({ name: 'aura_widget_types', arguments: { group: 'control' } });
check('the type index can be narrowed to one category', () => {
    assert.ok(oneGroup.content[0].text.length < allTypes.content[0].text.length / 1.5);
    assert.match(oneGroup.content[0].text, /## Steuerung/);
    assert.ok(!/## Layout/.test(oneGroup.content[0].text));
});

const unknownGroup = await client.callTool({ name: 'aura_widget_types', arguments: { group: 'quatsch' } });
check('an unknown category lists the real ones', () => {
    assert.match(unknownGroup.content[0].text, /control \(Steuerung/);
});

const longSchema = await client.callTool({
    name: 'aura_widget_schema',
    arguments: { types: ['switch', 'thermostat'] },
});
const briefSchema = await client.callTool({
    name: 'aura_widget_schema',
    arguments: { types: ['switch', 'thermostat'], brief: true },
});
check('brief=true drops the prose but keeps names and types', () => {
    const b = briefSchema.content[0].text;
    assert.ok(
        b.length < longSchema.content[0].text.length * 0.7,
        `${b.length} vs ${longSchema.content[0].text.length}`,
    );
    assert.match(b, /- controlMode: /);
    assert.match(b, /WidgetCondition = \{/, 'the referenced types must still be defined');
    assert.ok(!/Vor dem Schalten eine Rückfrage/.test(b), 'descriptions are what goes');
});

// ── Zwei Schreibvorgänge gleichzeitig ────────────────────────────────────────

{
    // The suite's double answers in the same microtask, which hides the race
    // entirely. Real ioBroker states do not, so this one takes its time.
    const slow = makeAdapter();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const inner = { get: slow.getStateAsync, set: slow.setStateAsync };
    slow.getStateAsync = async (id) => {
        await wait(3);
        return inner.get(id);
    };
    slow.setStateAsync = async (id, v) => {
        await wait(3);
        return inner.set(id, v);
    };
    const raceServer = http.createServer((req, res) => {
        handleMcpRequest(req, res, { adapter: slow, token: TOKEN, mode: 'delete', version: '1' }).catch(() => {});
    });
    await new Promise((r) => raceServer.listen(0, '127.0.0.1', r));
    const raceClient = new Client({ name: 'race', version: '1' }, { capabilities: {} });
    await raceClient.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${raceServer.address().port}/mcp`), {
            requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
        }),
    );
    const add = (id) =>
        raceClient.callTool({
            name: 'aura_add_widget',
            arguments: {
                tab: 'Klima',
                widget: JSON.stringify({ ...OK_SWITCH, id, gridPos: { x: 0, w: 8, h: 4 } }),
            },
        });
    const parallel = await Promise.all([add('par-a'), add('par-b'), add('par-c')]);

    check('three parallel writes all arrive', () => {
        // Unqueued they read the same dashboard, the last write wins, and every
        // answer still reports success: the assistant is told it added three
        // widgets and added one.
        assert.ok(
            parallel.every((r) => !r.isError),
            parallel.map((r) => r.content[0].text).join(' | '),
        );
        const tab = allTabs(JSON.parse(slow.states['config.dashboard']).state.layouts).find((t) => t.name === 'Klima');
        const ids = tab.widgets.map((w) => w.id);
        for (const id of ['par-a', 'par-b', 'par-c']) {
            assert.ok(ids.includes(id), `${id} fehlt — ${ids.join(', ')}`);
        }
    });

    const reads = await Promise.all([
        raceClient.callTool({ name: 'aura_dashboard', arguments: {} }),
        raceClient.callTool({ name: 'aura_widget_types', arguments: { group: 'layout' } }),
    ]);
    check('reads are not held up by the write queue', () => {
        assert.ok(reads.every((r) => !r.isError));
    });
    await raceClient.close();
    raceServer.close();
}

// ── Mehrdeutigkeit statt stiller Treffer ─────────────────────────────────────

adapter.states['config.popup-config'] = JSON.stringify({
    version: 0,
    state: { views: [{ id: 'v-amb', name: 'Zwilling', widgets: [{ ...OK_SWITCH, id: 'zwilling-id' }] }] },
});
const hostTab = allTabs(JSON.parse(adapter.states['config.dashboard']).state.layouts)[0];
await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: hostTab.id,
        widget: JSON.stringify({ ...OK_SWITCH, id: 'zwilling-id', gridPos: { x: 0, w: 8, h: 4 } }),
    },
});

const ambiguousId = await client.callTool({
    name: 'aura_update_widget',
    arguments: { widgetId: 'zwilling-id', patch: JSON.stringify({ title: 'X' }) },
});
check('one id in two places is refused, with both places named', () => {
    // Ids are meant to be unique but are not guaranteed to be — the editor has a
    // deduplicator for the twins copying used to produce. First-match-wins would
    // edit whichever the search happened to reach first.
    assert.ok(ambiguousId.isError);
    assert.match(ambiguousId.content[0].text, /gibt es mehrfach/);
    assert.match(ambiguousId.content[0].text, /Popup „Zwilling“/);
});

const twinTab = await client.callTool({
    name: 'aura_create_tab',
    arguments: { name: 'Zwilling', layout: 'Werkbank', section: 'Standard' },
});
assert.ok(!twinTab.isError, twinTab.content[0].text);
const ambiguousName = await client.callTool({
    name: 'aura_add_widget',
    arguments: { tab: 'Zwilling', widget: JSON.stringify({ ...OK_SWITCH, id: 'egal', gridPos: { x: 0, w: 8, h: 4 } }) },
});
check('a name that is both a tab and a popup asks which one', () => {
    assert.ok(ambiguousName.isError);
    assert.match(ambiguousName.content[0].text, /als Tab .* und als Popup/);
    assert.match(ambiguousName.content[0].text, /Die Id angeben/);
});

const byPopupId = await client.callTool({
    name: 'aura_add_widget',
    arguments: {
        tab: 'v-amb',
        widget: JSON.stringify({ ...OK_SWITCH, id: 'per-id', gridPos: { x: 0, w: 8, h: 4 } }),
    },
});
check('and the id settles it', () => {
    assert.ok(!byPopupId.isError, byPopupId.content[0].text);
    const view = JSON.parse(adapter.states['config.popup-config']).state.views.find((v) => v.id === 'v-amb');
    assert.ok(view.widgets.some((w) => w.id === 'per-id'));
});

// ── Vorlagen aus Popup und Gruppe ────────────────────────────────────────────

const presetFromPopup = await client.callTool({
    name: 'aura_save_preset',
    arguments: { widgetId: 'per-id', name: 'Aus dem Popup' },
});
check('a widget in a popup can be saved as a template', () => {
    // aura_save_preset only ever looked in tabs.
    assert.ok(!presetFromPopup.isError, presetFromPopup.content[0].text);
});

const intoGroup = await client.callTool({
    name: 'aura_insert_preset',
    arguments: { preset: 'Aus dem Popup', widgetId: 'quelle' },
});
check('a template can be inserted into a group', () => {
    assert.ok(!intoGroup.isError, intoGroup.content[0].text);
    assert.match(intoGroup.content[0].text, /Gruppe /);
});

// ── Popup-Ansichten kopieren, Namen eindeutig halten ─────────────────────────

const copiedView = await client.callTool({
    name: 'aura_copy_node',
    arguments: { kind: 'popup', target: 'Zwilling', name: 'Zwilling Zwei' },
});
check('a popup view can be copied, children and all', () => {
    assert.ok(!copiedView.isError, copiedView.content[0].text);
    const views = JSON.parse(adapter.states['config.popup-config']).state.views;
    const copy = views.find((v) => v.name === 'Zwilling Zwei');
    assert.ok(copy, 'the copy must exist');
    const source = views.find((v) => v.id === 'v-amb');
    assert.equal(copy.widgets.length, source.widgets.length);
    assert.ok(!copy.widgets.some((w) => source.widgets.some((s) => s.id === w.id)), 'fresh ids');
});

const movedView = await client.callTool({
    name: 'aura_copy_node',
    arguments: { kind: 'popup', target: 'Zwilling', mode: 'move' },
});
check('moving a popup is refused — there is nothing to move it into', () => {
    assert.ok(movedView.isError);
    assert.match(movedView.content[0].text, /verschieben ergibt hier nichts/);
});

const duplicateName = await client.callTool({
    name: 'aura_write_popup',
    arguments: { view: 'Zwilling', create: true, widgets: '[]' },
});
check('a second popup of the same name is refused', () => {
    // Two views of one name make every later lookup ambiguous, and the first
    // found would silently win from then on.
    assert.ok(duplicateName.isError);
    assert.match(duplicateName.content[0].text, /gibt schon eine Ansicht/);
});

// ── Token generation (the button in the adapter config) ──────────────────────

const { randomBytes } = await import('node:crypto');
const genToken = () => randomBytes(16).toString('hex');

check('the client block is valid JSON and carries the token', () => {
    const token = genToken();
    const parsed = JSON.parse(clientConfig({ port: 8095, interfaces: {} }, token));
    assert.equal(parsed.mcpServers.aura.type, 'http');
    assert.equal(parsed.mcpServers.aura.headers.Authorization, `Bearer ${token}`);
    assert.match(parsed.mcpServers.aura.url, /\/mcp$/);
});

check('a configured base URL wins and loses its trailing slash', () => {
    assert.equal(baseUrl({ customUrl: 'https://aura.example.org/', port: 8095 }), 'https://aura.example.org');
    assert.equal(baseUrl({ customUrl: 'https://aura.example.org//' }), 'https://aura.example.org');
});

check('without a base URL the host LAN address and the live protocol are used', () => {
    const ifaces = {
        lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
        eth0: [{ address: '192.168.188.140', family: 'IPv4', internal: false }],
    };
    assert.equal(baseUrl({ port: 8095, interfaces: ifaces }), 'http://192.168.188.140:8095');
    assert.equal(baseUrl({ port: 8095, https: true, interfaces: ifaces }), 'https://192.168.188.140:8095');
});

check('an explicit host address wins over the interface list', () => {
    // A machine with VMware has 192.168.171.1 (host-only) AND the real LAN address;
    // both are private, so the interface list alone cannot tell them apart.
    const ifaces = {
        vmnet1: [{ address: '192.168.171.1', family: 'IPv4', internal: false }],
        wlan: [{ address: '192.168.188.235', family: 'IPv4', internal: false }],
    };
    assert.equal(baseUrl({ interfaces: ifaces }), 'http://192.168.171.1:8095');
    assert.equal(baseUrl({ interfaces: ifaces, hostIp: '192.168.188.235' }), 'http://192.168.188.235:8095');
});

check('a LAN address is preferred over a VPN or container interface', () => {
    // Docker's bridge comes first alphabetically and would otherwise win.
    const ifaces = {
        br0: [{ address: '172.17.0.1', family: 'IPv4', internal: false }],
        eth0: [{ address: '192.168.188.140', family: 'IPv4', internal: false }],
        tun0: [{ address: '100.64.0.3', family: 'IPv4', internal: false }],
    };
    assert.equal(baseUrl({ interfaces: ifaces }), 'http://172.17.0.1:8095');
    const noPrivate = { tun0: [{ address: '100.64.0.3', family: 'IPv4', internal: false }] };
    assert.equal(baseUrl({ interfaces: noPrivate }), 'http://100.64.0.3:8095');
});

check('numeric IPv4 family and IPv6 are handled', () => {
    const ifaces = {
        eth0: [
            { address: 'fe80::1', family: 'IPv6', internal: false },
            { address: '10.0.0.5', family: 4, internal: false },
        ],
    };
    assert.deepEqual(hostAddresses(ifaces), ['10.0.0.5']);
});

check('with no usable address a visible placeholder is left in', () => {
    assert.equal(
        baseUrl({ interfaces: { lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] } }),
        'http://<ioBroker-IP>:8095',
    );
});

const routed = await outboundAddress();
check('the routing table yields a usable address on a networked host', () => {
    // No packet is sent; connect() only makes the kernel pick a source address.
    // A host with no route at all legitimately answers null — hence the fallback.
    assert.ok(routed === null || /^\d+\.\d+\.\d+\.\d+$/.test(routed), `unexpected: ${routed}`);
    if (routed) {
        assert.ok(!routed.startsWith('127.'), 'the loopback address would be useless in the client block');
    }
});

check('resolveBaseUrl still honours a configured base URL without asking the network', async () => {
    assert.equal(await resolveBaseUrl({ customUrl: 'https://aura.example.org/' }), 'https://aura.example.org');
});

check('the stored block loses its token, and says where to get it', () => {
    const full = clientConfig({ customUrl: 'http://192.168.188.140:8095' }, 'abcdef0123456789abcdef0123456789');
    const masked = maskClientConfig(full);
    assert.ok(!masked.includes('abcdef0123456789abcdef0123456789'), 'the token must be gone');
    assert.ok(masked.includes(TOKEN_PLACEHOLDER), 'the placeholder must point at the field above');
    // Still pasteable: the URL is the part that is tedious to work out by hand.
    assert.equal(JSON.parse(masked).mcpServers.aura.url, 'http://192.168.188.140:8095/mcp');
});

check('masking is idempotent, so it cannot restart the adapter in a loop', () => {
    const masked = maskClientConfig(clientConfig({ customUrl: 'http://x:1' }, 'tok'));
    // null means "nothing to do" — the caller skips the write, so no object change.
    assert.equal(maskClientConfig(masked), null);
    assert.equal(maskClientConfig(''), null);
    assert.equal(maskClientConfig(undefined), null);
});

check('a generated token is 32 hex chars and never repeats', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
        const t = genToken();
        assert.match(t, /^[0-9a-f]{32}$/, `unexpected shape: ${t}`);
        assert.ok(!seen.has(t), 'a repeat means the generator is not random');
        seen.add(t);
    }
});

const fresh = genToken();
const askWith = async (token) => {
    const s = http.createServer((req, res) => {
        handleMcpRequest(req, res, { adapter, token: fresh, version: '1' }).catch(() => {});
    });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const r = await fetch(`http://127.0.0.1:${s.address().port}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    s.close();
    return r.status;
};
const okStatus = await askWith(fresh);
// One character off, and same length — the comparison must not shortcut on it.
const nearMiss = await askWith(fresh.slice(0, -1) + (fresh.endsWith('a') ? 'b' : 'a'));
const truncated = await askWith(fresh.slice(0, -1));
check('a valid token is accepted, a near-miss and a truncation are not', () => {
    assert.equal(okStatus, 200);
    assert.equal(nearMiss, 403);
    assert.equal(truncated, 403);
});

await client.close();
server.close();
console.log(`\nmcp: ${checks} checks passed\n`);
