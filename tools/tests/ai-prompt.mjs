#!/usr/bin/env node
/**
 * Checks the AI prompt builder against the real generated schema.
 *
 *   npm run test:ai-prompt
 *
 * The prompt is the only thing standing between a model and a broken dashboard,
 * and every mistake in it is silent: a wrong column count produces a layout that
 * overflows, a missing datapoint list produces invented state ids. So this walks
 * the built text and asserts the facts a generator depends on are actually in it.
 *
 * src-vis is TypeScript, so the module is bundled with esbuild first (into
 * node_modules/.cache, like the other pure-logic tests) — no dev server needed.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'node_modules/.cache', `aura-ai-prompt-${process.pid}.mjs`);

await esbuild.build({
    entryPoints: [path.join(ROOT, 'src-vis/utils/aiPrompt.ts')],
    outfile: OUT,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
});
const { buildAiPrompt, filterDatapoints, estimateTokens, MAX_DATAPOINTS } = await import(pathToFileURL(OUT).href);

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/ai/aura-widget-schema.json'), 'utf8'));

let checks = 0;
const check = (label, fn) => {
    fn();
    checks++;
    console.log(`  ✓ ${label}`);
};

const DPS = [
    {
        id: 'hm-rpc.0.LEQ1.1.STATE',
        name: 'Deckenlicht',
        type: 'boolean',
        role: 'switch.light',
        write: true,
        rooms: ['Wohnzimmer'],
        funcs: ['Licht'],
    },
    {
        id: 'zigbee.0.abc.temperature',
        name: 'Temperatur',
        type: 'number',
        unit: '°C',
        role: 'value.temperature',
        write: false,
        rooms: ['Wohnzimmer'],
        funcs: ['Klima'],
    },
    {
        id: 'hm-rpc.0.XYZ.4.LEVEL',
        name: 'Rollladen',
        type: 'number',
        unit: '%',
        role: 'level.blind',
        write: true,
        rooms: ['Schlafzimmer'],
        funcs: ['Beschattung'],
    },
];

const GRID = { cols: 44, rowHeight: 20, snapX: 20, gap: 10 };

const base = {
    schema,
    task: 'Eine Kachel je Licht im Wohnzimmer',
    types: ['switch', 'value'],
    datapoints: DPS,
    grid: GRID,
    currentTab: null,
    target: 'widget',
};

console.log('\nai-prompt');

const prompt = buildAiPrompt(base);

check('names the actual column count as a hard limit', () => {
    assert.match(prompt, /Raster ist aktuell 44 Spalten breit/);
    assert.match(prompt, /x \+ w darf 44 nie überschreiten/);
});

check('states the output contract for a single widget', () => {
    assert.match(prompt, /## Ausgabe/);
    assert.match(prompt, /NUR mit dem JSON-Objekt eines einzelnen Widgets/);
    assert.ok(!prompt.includes('"_type": "aura-tab"'), 'widget mode must not describe the tab envelope');
});

check('tab mode carries the aura-tab envelope with the live grid', () => {
    const tabPrompt = buildAiPrompt({ ...base, target: 'tab' });
    assert.match(tabPrompt, /"_type": "aura-tab"/);
    assert.match(tabPrompt, /"rowHeight": 20, "snapX": 20, "gap": 10/);
});

check('lists every non-deprecated widget type', () => {
    const expected = Object.entries(schema.widgets).filter(([, w]) => !w.deprecated);
    for (const [type] of expected) {
        assert.ok(prompt.includes(`- ${type} (`), `type ${type} missing from the index`);
    }
    assert.ok(expected.length > 40, `expected many types, got ${expected.length}`);
});

check('documents the selected types in full, others only in the index', () => {
    assert.match(prompt, /### switch — Schalter/);
    assert.match(prompt, /### value —/);
    assert.ok(!prompt.includes('### gauge —'), 'unselected type must not get a detail section');
    // A switch-specific option and a shared one both have to be there.
    assert.ok(prompt.includes('- onValue:'), 'own option missing');
    assert.ok(prompt.includes('- showTitle:'), 'shared option missing');
});

check('marks datapoint-valued options so ids are not invented', () => {
    const withShutter = buildAiPrompt({ ...base, types: ['shutter'] });
    assert.match(withShutter, /- stopDp: string.*\[Datenpunkt-Id\]/);
});

check('resolves referenced named types', () => {
    const withThermostat = buildAiPrompt({ ...base, types: ['thermostat'] });
    assert.match(withThermostat, /## Verwendete Typen/);
    assert.match(withThermostat, /ColorThreshold = \[number, string\]/);
});

check('renders every datapoint with room, function, role and unit', () => {
    assert.match(prompt, /## Datenpunkte/);
    assert.match(prompt, /hm-rpc\.0\.LEQ1\.1\.STATE \| Deckenlicht \| Wohnzimmer \| Licht \| switch\.light \| boolean/);
    assert.match(prompt, /zigbee\.0\.abc\.temperature \|.*°C \| nur lesen/);
});

check('says so instead of staying silent when no datapoint was picked', () => {
    const empty = buildAiPrompt({ ...base, datapoints: [] });
    assert.match(empty, /frage nach den Datenpunkt-Ids, statt welche zu erfinden/);
});

check('caps the datapoint list and says it did', () => {
    const many = Array.from({ length: MAX_DATAPOINTS + 50 }, (_, i) => ({
        id: `x.0.dp${i}`,
        name: `DP ${i}`,
        rooms: [],
        funcs: [],
    }));
    const capped = buildAiPrompt({ ...base, datapoints: many });
    assert.ok(!capped.includes(`x.0.dp${MAX_DATAPOINTS + 10}`), 'rows beyond the cap must be dropped');
    assert.match(capped, new RegExp(`gekürzt auf ${MAX_DATAPOINTS} von ${MAX_DATAPOINTS + 50}`));
});

check('includes the current tab only when asked', () => {
    const tab = { name: 'Wohnzimmer', widgets: [{ id: 'w1', type: 'switch', gridPos: { x: 0, y: 0, w: 8, h: 4 } }] };
    const withTab = buildAiPrompt({ ...base, currentTab: tab });
    assert.match(withTab, /## Aktueller Tab „Wohnzimmer"/);
    assert.match(withTab, /"type": "switch"/);
    assert.ok(!prompt.includes('## Aktueller Tab'), 'omitted tab must not appear');
});

check('an empty task asks rather than inventing one', () => {
    assert.match(buildAiPrompt({ ...base, task: '   ' }), /frage nach, was gebaut werden soll/);
});

check('filterDatapoints ORs inside a facet and ANDs across facets', () => {
    assert.equal(filterDatapoints(DPS, { rooms: ['Wohnzimmer'] }).length, 2);
    assert.equal(filterDatapoints(DPS, { rooms: ['Wohnzimmer'], funcs: ['Licht'] }).length, 1);
    assert.equal(filterDatapoints(DPS, { rooms: ['Wohnzimmer', 'Schlafzimmer'] }).length, 3);
    assert.equal(filterDatapoints(DPS, { writableOnly: true }).length, 2);
    assert.equal(filterDatapoints(DPS, { search: 'rollladen' }).length, 1);
    assert.equal(filterDatapoints(DPS, { search: 'zigbee.0' }).length, 1);
});

check('the prompt stays a sane size for a typical selection', () => {
    const tokens = estimateTokens(prompt);
    assert.ok(tokens > 2000, `expected a substantial prompt, got ~${tokens} tokens`);
    assert.ok(tokens < 40000, `prompt too large to paste comfortably: ~${tokens} tokens`);
});

fs.rmSync(OUT, { force: true });
console.log(`\nai-prompt: ${checks} checks passed\n`);
