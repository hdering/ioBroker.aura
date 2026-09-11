// The `{{parent}}` placeholder layer: which variables one datapoint id offers and
// how the sub-datapoint editor turns a picked id back into a pattern (issue #637).
//
//   node tools/tests/dp-vars.mjs
//
// No dev server needed: all four modules are pure, so esbuild bundles them and the
// test drives them directly.
//
// The case that started this: HomeMatic keeps a device's maintenance datapoints in
// channel 0 while the reading sits in channel 1, so a thermostat row can reach its
// battery only by climbing TWO levels - `{{parent}}` alone stops at the channel.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-dpvars-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export { dpVarMap, subAll, buildPopupSubMap } from './src-vis/utils/popupPlaceholders.ts';",
            "export { toSubDpTemplateId, resolveSubDpTemplate, isResolvedDpId } from './src-vis/utils/subDpTemplate.ts';",
            "export { substituteItemVars } from './src-vis/utils/nameFilter.ts';",
            "export { resolveRuleRefs } from './src-vis/utils/rowConditions.ts';",
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
const {
    dpVarMap,
    subAll,
    buildPopupSubMap,
    toSubDpTemplateId,
    resolveSubDpTemplate,
    isResolvedDpId,
    substituteItemVars,
    resolveRuleRefs,
} = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// The worked example of the issue: a HomeMatic IP thermostat.
const HM = 'hm-rpc.2.000A1234567890.1.ACTUAL_TEMPERATURE';

// -- the variable table -------------------------------------------------------
const hm = dpVarMap(HM);
eq('{{dp}} is the id itself', hm.dp, HM);
eq('{{name}} is the last segment', hm.name, 'ACTUAL_TEMPERATURE');
eq('{{parent}} is the channel', hm.parent, 'hm-rpc.2.000A1234567890.1');
eq('{{parent2}} is the device', hm.parent2, 'hm-rpc.2.000A1234567890');
eq('{{parent3}} is the instance', hm.parent3, 'hm-rpc.2');
eq('the climb stops at the adapter', hm.parent4, undefined);

const flat = dpVarMap('0_userdata.0.Anzeige');
eq('a flat id still has its parent', flat.parent, '0_userdata.0');
eq('... but nothing above the instance', flat.parent2, undefined);

eq('an empty id yields no variables', Object.keys(dpVarMap('')).length, 0);
eq('an id without a dot yields only {{dp}}', JSON.stringify(dpVarMap('nodots')), JSON.stringify({ dp: 'nodots' }));

// -- substitution -------------------------------------------------------------
eq(
    'the battery of the HomeMatic device resolves',
    subAll('{{parent2}}.0.OPERATING_VOLTAGE', hm),
    'hm-rpc.2.000A1234567890.0.OPERATING_VOLTAGE',
);
eq(
    'a sibling of the reading still resolves',
    subAll('{{parent}}.SET_POINT_TEMPERATURE', hm),
    'hm-rpc.2.000A1234567890.1.SET_POINT_TEMPERATURE',
);
eq('an unreachable level is left literal', subAll('{{parent9}}.X', hm), '{{parent9}}.X');
check('... and is therefore counted as unresolved', !isResolvedDpId(subAll('{{parent9}}.X', hm)));

// The name pattern is typed by hand, so its lookup ignores case.
eq(
    'the name pattern accepts {{Parent2}}',
    substituteItemVars('[[{{Parent2}}.0.RSSI_DEVICE]]', HM),
    '[[hm-rpc.2.000A1234567890.0.RSSI_DEVICE]]',
);

// Popups derive the same table from their main datapoint, and it beats a widget
// option of the same name.
const popup = buildPopupSubMap({ options: { parent2: 'nonsense' } }, HM);
eq('a popup gets {{parent2}} too', popup.parent2, 'hm-rpc.2.000A1234567890');

// -- the list-wide template ---------------------------------------------------
const tpl = [{ id: '{{parent2}}.0.OPERATING_VOLTAGE' }, { id: '{{parent}}.SET_POINT_TEMPERATURE' }];
const rowA = resolveSubDpTemplate(tpl, HM);
eq('the template resolves both levels per row', rowA.length, 2);
eq('... the deep one against the device', rowA[0].id, 'hm-rpc.2.000A1234567890.0.OPERATING_VOLTAGE');
eq(
    '... and the same template on another device',
    resolveSubDpTemplate(tpl, 'hm-rpc.2.000BBBBBBBBBBB.1.ACTUAL_TEMPERATURE')[0].id,
    'hm-rpc.2.000BBBBBBBBBBB.0.OPERATING_VOLTAGE',
);
eq('a row too shallow for {{parent2}} drops that entry', resolveSubDpTemplate(tpl, '0_userdata.0.Temp').length, 1);

// Row conditions share the table, so a rule can test the maintenance channel.
const rules = [{ target: 'row', clauses: [{ datapoint: '{{parent2}}.0.UNREACH', op: 'eq', value: true }] }];
eq(
    'a row condition reaches the maintenance channel',
    resolveRuleRefs(rules, HM)[0].clauses[0].datapoint,
    'hm-rpc.2.000A1234567890.0.UNREACH',
);

// -- turning a picked datapoint back into a pattern ---------------------------
eq(
    'a sibling becomes {{parent}}',
    toSubDpTemplateId('hm-rpc.2.000A1234567890.1.SET_POINT_TEMPERATURE', HM),
    '{{parent}}.SET_POINT_TEMPERATURE',
);
eq(
    'another channel of the same device becomes {{parent2}}',
    toSubDpTemplateId('hm-rpc.2.000A1234567890.0.OPERATING_VOLTAGE', HM),
    '{{parent2}}.0.OPERATING_VOLTAGE',
);
eq(
    'the deepest match wins, so the pattern stays specific',
    toSubDpTemplateId('hm-rpc.2.000A1234567890.1.BOOST_STATE', HM),
    '{{parent}}.BOOST_STATE',
);
// The instance strang matches every device of the adapter - tokenising against it
// would silently repoint the datapoint on every OTHER row.
eq(
    'a different device stays absolute',
    toSubDpTemplateId('hm-rpc.2.000BBBBBBBBBBB.1.ACTUAL_TEMPERATURE', HM),
    'hm-rpc.2.000BBBBBBBBBBB.1.ACTUAL_TEMPERATURE',
);
eq('a different adapter stays absolute', toSubDpTemplateId('alias.0.Wetter.Aussen', HM), 'alias.0.Wetter.Aussen');
eq(
    'a sibling of a flat id still becomes {{parent}}',
    toSubDpTemplateId('0_userdata.0.Andere', '0_userdata.0.Anzeige'),
    '{{parent}}.Andere',
);
// Longstanding behaviour, and the right one for a template: the leaf name is what
// every row should read, not this one device's copy of it.
eq('the sample id itself becomes its own pattern', toSubDpTemplateId(HM, HM), '{{parent}}.ACTUAL_TEMPERATURE');
eq('no sample means no rewrite', toSubDpTemplateId('a.0.b', ''), 'a.0.b');

// What the editor stores must be what the widget resolves back.
eq(
    'store and resolve are inverse for the battery pick',
    resolveSubDpTemplate([{ id: toSubDpTemplateId('hm-rpc.2.000A1234567890.0.OPERATING_VOLTAGE', HM) }], HM)[0].id,
    'hm-rpc.2.000A1234567890.0.OPERATING_VOLTAGE',
);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log(failed.map((f) => `  FAIL ${f.name} - ${f.detail}`).join('\n'));
    process.exit(1);
}
