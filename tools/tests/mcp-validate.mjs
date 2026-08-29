#!/usr/bin/env node
/**
 * Checks the MCP server's validation rules against the real widget schema.
 *
 *   npm run test:mcp
 *
 * These rules are the point of the whole server: without them a model's mistake
 * is invisible — AURA renders the widget and ignores the unknown option. Every
 * case below is a mistake a model actually tends to make.
 *
 * Pure logic, no ioBroker, no browser.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { validateWidget, validateTab, validateAny, allowedOptions } from '../mcp/validate.mjs';
import { designColumns, allTabs, findTab, collectDefIds } from '../mcp/aura-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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

console.log('\nmcp-validate');

check('a correct widget passes clean', () => {
    const res = validateWidget(OK_SWITCH, schema);
    assert.deepEqual(res.errors, []);
    assert.deepEqual(res.warnings, []);
});

check('an unknown widget type is named, with a suggestion', () => {
    const res = validateWidget({ ...OK_SWITCH, type: 'switsch' }, schema);
    assert.ok(hasError(res, /unbekannter Typ "switsch"/));
    assert.ok(hasError(res, /meintest du "switch"/), 'expected a near-miss suggestion');
});

check('an option the widget never reads is an error, not silence', () => {
    const res = validateWidget({ ...OK_SWITCH, options: { showTitel: true } }, schema);
    assert.ok(hasError(res, /liest die Option "showTitel" nicht/));
    assert.ok(hasError(res, /meintest du "showTitle"/));
});

check('an out-of-set enum value lists what is allowed', () => {
    const res = validateWidget({ ...OK_SWITCH, options: { controlMode: 'switch' } }, schema);
    assert.ok(hasError(res, /Option "controlMode".*nicht erlaubt/));
    assert.ok(hasError(res, /toggle/), 'the allowed values must be shown');
});

check('a wrong value type is caught', () => {
    const res = validateWidget({ ...OK_SWITCH, options: { showTitle: 'ja' } }, schema);
    assert.ok(hasError(res, /Option "showTitle": string übergeben, erwartet boolean/));
});

check('an invalid layout lists the valid ones', () => {
    const res = validateWidget({ ...OK_SWITCH, layout: 'dial' }, schema);
    assert.ok(hasError(res, /layout "dial" gibt es für switch nicht/));
    assert.ok(hasError(res, /erlaubt: .*minimal/));
    assert.deepEqual(validateWidget({ ...OK_SWITCH, layout: 'compact' }, schema).errors, []);
});

check('a datapoint widget without a datapoint fails', () => {
    const res = validateWidget({ ...OK_SWITCH, datapoint: '' }, schema);
    assert.ok(hasError(res, /switch braucht einen Datenpunkt/));
});

check('a datapoint on a free widget is flagged as ineffective', () => {
    const clock = { id: 'w-c', type: 'clock', title: 'Uhr', datapoint: 'x.0.y', gridPos: { x: 0, y: 0, w: 6, h: 4 } };
    const res = validateWidget(clock, schema);
    assert.deepEqual(res.errors, []);
    assert.ok(hasWarning(res, /wertet "datapoint" nicht aus/));
});

check('datapoint ids are checked against the live tree when supplied', () => {
    const known = new Set(['hm-rpc.0.LEQ1.1.STATE']);
    assert.deepEqual(validateWidget(OK_SWITCH, schema, { knownDatapoints: known }).errors, []);
    const res = validateWidget({ ...OK_SWITCH, datapoint: 'hm-rpc.0.NOPE' }, schema, { knownDatapoints: known });
    assert.ok(hasError(res, /"hm-rpc\.0\.NOPE" gibt es in dieser ioBroker-Installation nicht/));
});

check('a datapoint-valued OPTION is checked too', () => {
    const known = new Set(['hm-rpc.0.LEQ1.1.STATE']);
    const res = validateWidget({ ...OK_SWITCH, options: { statusDp: 'erfunden.0.dp' } }, schema, {
        knownDatapoints: known,
    });
    assert.ok(hasError(res, /Option "statusDp": Datenpunkt "erfunden\.0\.dp" gibt es nicht/));
});

check('gridPos must be whole, positive and within the column bound', () => {
    assert.ok(hasError(validateWidget({ ...OK_SWITCH, gridPos: { x: 0, y: 0, w: 8.5, h: 4 } }, schema), /ganze Zahl/));
    assert.ok(
        hasError(validateWidget({ ...OK_SWITCH, gridPos: { x: -1, y: 0, w: 8, h: 4 } }, schema), /nicht negativ/),
    );
    assert.ok(hasError(validateWidget({ ...OK_SWITCH, gridPos: { x: 0, y: 0, w: 0, h: 4 } }, schema), /mindestens 1/));
    const res = validateWidget({ ...OK_SWITCH, gridPos: { x: 40, y: 0, w: 12, h: 4 } }, schema, { columns: 48 });
    assert.ok(hasError(res, /52 überschreitet die 48 Spalten/));
});

check('a group without defId warns about its children living elsewhere', () => {
    const group = { id: 'g1', type: 'group', title: 'Wohnzimmer', datapoint: '', gridPos: { x: 0, y: 0, w: 12, h: 8 } };
    assert.ok(hasWarning(validateWidget(group, schema), /aura-group-defs/));
});

check('overlapping widgets in a tab are reported by id', () => {
    const tab = {
        _type: 'aura-tab',
        tab: {
            name: 'Test',
            widgets: [
                { ...OK_SWITCH, id: 'a', gridPos: { x: 0, y: 0, w: 8, h: 4 } },
                { ...OK_SWITCH, id: 'b', gridPos: { x: 4, y: 2, w: 8, h: 4 } },
            ],
        },
    };
    assert.ok(hasError(validateTab(tab, schema), /"a".*"b".*überlappen/));
});

check('adjacent widgets do not count as overlapping', () => {
    const tab = {
        _type: 'aura-tab',
        tab: {
            name: 'Test',
            widgets: [
                { ...OK_SWITCH, id: 'a', gridPos: { x: 0, y: 0, w: 8, h: 4 } },
                { ...OK_SWITCH, id: 'b', gridPos: { x: 8, y: 0, w: 8, h: 4 } },
                { ...OK_SWITCH, id: 'c', gridPos: { x: 0, y: 4, w: 8, h: 4 } },
            ],
        },
    };
    assert.deepEqual(validateTab(tab, schema).errors, []);
});

check('duplicate widget ids are caught', () => {
    const tab = {
        _type: 'aura-tab',
        tab: { name: 'T', widgets: [OK_SWITCH, { ...OK_SWITCH, gridPos: { x: 0, y: 8, w: 8, h: 4 } }] },
    };
    assert.ok(hasError(validateTab(tab, schema), /id "w-1" kommt mehrfach vor/));
});

check('a wrong envelope is reported', () => {
    assert.ok(hasError(validateTab({ _type: 'aura-widget', tab: { name: 'x', widgets: [] } }, schema), /_type/));
    assert.ok(hasError(validateTab({ _type: 'aura-tab', tab: { name: 'x' } }, schema), /"widgets" fehlt/));
});

check('validateAny tells a widget from a tab', () => {
    assert.deepEqual(validateAny(OK_SWITCH, schema).errors, []);
    assert.ok(hasError(validateAny({ _type: 'aura-tab', tab: { name: 'x' } }, schema), /widgets/));
});

check('allowedOptions merges own and shared keys', () => {
    const opts = allowedOptions('switch', schema);
    assert.ok('onValue' in opts, 'own option missing');
    assert.ok('showTitle' in opts, 'shared option missing');
    assert.equal(allowedOptions('nope', schema).onValue, undefined);
});

// ── Config helpers ───────────────────────────────────────────────────────────

const LAYOUTS = [
    {
        name: 'Wohnzimmer',
        slug: 'wohnzimmer',
        sections: [
            {
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
        name: 'Tablet',
        slug: 'tablet',
        sections: [{ name: 'Haupt', slug: 'haupt', tabs: [{ id: 't3', name: 'Licht', slug: 'licht', widgets: [] }] }],
    },
];

check('designColumns takes the widest widget across all tabs', () => {
    assert.equal(designColumns(LAYOUTS), 44);
    assert.equal(designColumns([]), 48, 'an empty dashboard falls back to a sane default');
});

check('allTabs flattens layout / section / tab', () => {
    assert.equal(allTabs(LAYOUTS).length, 3);
    assert.equal(allTabs(LAYOUTS)[0].layoutName, 'Wohnzimmer');
});

check('findTab refuses to guess when a name is ambiguous', () => {
    assert.ok(/mehrfach/.test(findTab(LAYOUTS, { tab: 'Licht' }).error ?? ''));
    assert.equal(findTab(LAYOUTS, { tab: 'Licht', layout: 'Tablet' }).tab.id, 't3');
    assert.equal(findTab(LAYOUTS, { tab: 'klima' }).tab.id, 't2');
    assert.ok(/Kein Tab/.test(findTab(LAYOUTS, { tab: 'Garage' }).error ?? ''));
});

check('collectDefIds follows nested group definitions', () => {
    const defs = {
        outer: [{ options: { defId: 'inner' } }],
        inner: [{ type: 'switch' }],
        unused: [{ type: 'value' }],
    };
    const found = collectDefIds([{ options: { defId: 'outer' } }], defs);
    assert.deepEqual([...found].sort(), ['inner', 'outer']);
});

console.log(`\nmcp-validate: ${checks} checks passed\n`);
