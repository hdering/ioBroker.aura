// Verifies the per-row half of the "Meldung senden" condition effect (issue #605)
// — utils/conditionSources.ts::matchingListRefs and utils/notifyTemplate.ts.
//
//   node tools/tests/cond-notify-rows.mjs
//
// No dev server needed: both modules are pure, so esbuild bundles them and the
// test drives them directly. The end-to-end path (edge detection, one message per
// entry, what lands on the wire) is covered by tools/tests/messages.mjs.
//
// What matters here: only `{list:any}` names a single row, AND/OR combine the
// per-clause hits the way the rule reads, the `{{…}}` substitution keeps the
// stored draft untouched while making every row's message id unique, and the
// `[[dp]]` layer freezes the values the message is sent with.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-notify-rows-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export { matchingListRefs, hasListAnyClause } from './src-vis/utils/conditionSources.ts';",
            "export { resolveDraftForRow, draftHasRowVars, freezeDraftTokens } from './src-vis/utils/notifyTemplate.ts';",
            "export { matchingNotifyRules, ruleMatches, resolveRuleRefs } from './src-vis/utils/rowConditions.ts';",
        ].join('\n'),
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
            // conditionSources reaches the number formatter through the list stats,
            // and that one reads a zustand store which boots the ioBroker connection.
            // Nothing in this test formats a number, so the store is stubbed away.
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
const {
    matchingListRefs,
    hasListAnyClause,
    resolveDraftForRow,
    draftHasRowVars,
    freezeDraftTokens,
    matchingNotifyRules,
    ruleMatches,
    resolveRuleRefs,
} = await import(pathToFileURL(bundle).href);
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

const A = 'hm-rpc.0.Melder1.MOTION';
const B = 'hm-rpc.0.Melder2.MOTION';
const C = 'hm-rpc.0.Melder3.MOTION';
const NIGHT = '0_userdata.0.Nachtmodus';
const ctx = { listRefs: [A, B, C] };
const clause = (datapoint, operator, value = '') => ({ datapoint, operator, value });
const cond = (clauses, logic = 'AND') => ({ logic, clauses });
const values = (obj) => new Map(Object.entries(obj));
const noValues = new Map();

// ── Which entries triggered ──────────────────────────────────────────────────
{
    const v = values({ [A]: true, [B]: false, [C]: true });
    eq('any: the entries that match, in list order', matchingListRefs(cond([clause('{list:any}', 'true')]), v, ctx), [
        A,
        C,
    ]);
    eq('any: the short {list} spelling behaves the same', matchingListRefs(cond([clause('{list}', 'true')]), v, ctx), [
        A,
        C,
    ]);
    eq('any: nothing matches → no row', matchingListRefs(cond([clause('{list:any}', 'false')]), values({}), ctx), []);
}
{
    // all/none/count speak about the list as a whole — no single row is to blame.
    const v = values({ [A]: true, [B]: true, [C]: true });
    eq('all: names no row', matchingListRefs(cond([clause('{list:all}', 'true')]), v, ctx), []);
    eq('none: names no row', matchingListRefs(cond([clause('{list:none}', 'true')]), v, ctx), []);
    eq('count: names no row', matchingListRefs(cond([clause('{list:count}', '>', '1')]), v, ctx), []);
    eq('a plain datapoint names no row', matchingListRefs(cond([clause(NIGHT, 'true')]), v, ctx), []);
    eq('without a list context there is no row', matchingListRefs(cond([clause('{list:any}', 'true')]), v, {}), []);
}
{
    // The global clause gates, the list clause picks: "ein Melder aktiv UND Nacht".
    const v = values({ [A]: true, [B]: false, [C]: true, [NIGHT]: true });
    eq(
        'AND: a global clause does not widen the row set',
        matchingListRefs(cond([clause('{list:any}', 'true'), clause(NIGHT, 'true')]), v, ctx),
        [A, C],
    );
}
{
    const v = values({ [A]: 25, [B]: 5, [C]: 30 });
    eq(
        'AND: two list clauses intersect',
        matchingListRefs(cond([clause('{list:any}', '>', '10'), clause('{list:any}', '<', '28')]), v, ctx),
        [A],
    );
    eq(
        'OR: two list clauses union, in list order',
        matchingListRefs(cond([clause('{list:any}', '>', '28'), clause('{list:any}', '<', '10')], 'OR'), v, ctx),
        [B, C],
    );
}
{
    // 'changed' is an event: the rows that just delivered a value.
    const v = values({ [A]: true, [B]: true, [C]: true });
    eq(
        'changed: only the entries that just arrived',
        matchingListRefs(cond([clause('{list:any}', 'changed')]), v, ctx, new Set([B])),
        [B],
    );
    eq(
        'changed: nothing arrived → no row',
        matchingListRefs(cond([clause('{list:any}', 'changed')]), v, ctx, new Set()),
        [],
    );
    eq(
        'changed + value: the row must do both',
        matchingListRefs(
            cond([clause('{list:any}', 'changed'), clause('{list:any}', 'true')]),
            values({ [A]: true, [B]: false, [C]: true }),
            ctx,
            new Set([B, C]),
        ),
        [C],
    );
}

// ── Does the rule fan out at all ─────────────────────────────────────────────
check('hasListAnyClause: {list:any}', hasListAnyClause(cond([clause('{list:any}', 'true')])) === true);
check('hasListAnyClause: {list:all}', hasListAnyClause(cond([clause('{list:all}', 'true')])) === false);
check('hasListAnyClause: plain datapoint', hasListAnyClause(cond([clause(NIGHT, 'true')])) === false);
check(
    'hasListAnyClause: one of several clauses is enough',
    hasListAnyClause(cond([clause(NIGHT, 'true'), clause('{list:any}', 'true')])) === true,
);

// ── The message draft of the triggering row ──────────────────────────────────
const draft = (patch) => ({
    id: '',
    severity: 'warning',
    title: '',
    text: '',
    html: '',
    image: '',
    icon: '',
    view: '',
    dp: '',
    position: '',
    durationSec: '',
    requireAck: false,
    priority: '',
    width: '',
    height: '',
    transparency: '',
    appearance: '',
    align: '',
    showTime: '',
    color: '',
    background: '',
    textColor: '',
    ackDp: '',
    ackValue: '',
    persist: true,
    actions: [],
    targetClients: '',
    targetLayout: '',
    targetTab: '',
    ...patch,
});

{
    const d = draft({ title: 'Bewegung: [[{{parent}}.NAME]]', text: '{{name}} von {{dp}}' });
    const out = resolveDraftForRow(d, A);
    eq('the [[…]] token keeps its brackets and gets a real id', out.title, 'Bewegung: [[hm-rpc.0.Melder1.NAME]]');
    eq('{{name}} is the last segment, {{dp}} the whole id', out.text, `MOTION von ${A}`);
    eq('the stored draft is untouched', d.title, 'Bewegung: [[{{parent}}.NAME]]');
}
{
    // Without a row (a rule on the widget's own datapoint) nothing must change.
    const d = draft({ title: 'Bewegung: [[{{parent}}.NAME]]' });
    eq('no datapoint → the draft passes through', resolveDraftForRow(d, undefined), d);
}
{
    const d = draft({ id: 'melder', title: 'x' });
    eq('a fixed id gets the row appended', resolveDraftForRow(d, A).id, `melder:${A}`);
    eq('…and a second row gets a different one', resolveDraftForRow(d, B).id, `melder:${B}`);
}
{
    const d = draft({ id: 'melder-{{name}}-{{parent}}' });
    eq(
        'an id that carries a variable is already unique and keeps its shape',
        resolveDraftForRow(d, A).id,
        'melder-MOTION-hm-rpc.0.Melder1',
    );
}
{
    eq('an empty id stays empty (the adapter generates one)', resolveDraftForRow(draft({}), A).id, '');
}
{
    const d = draft({
        ackDp: '{{parent}}.QUIT',
        ackValue: 'true',
        actions: [{ label: 'Aus: {{name}}', dp: '{{parent}}.STATE', value: 'false', close: true }],
    });
    const out = resolveDraftForRow(d, A);
    eq('the confirmation datapoint follows the row', out.ackDp, 'hm-rpc.0.Melder1.QUIT');
    eq('a button label follows the row', out.actions[0].label, 'Aus: MOTION');
    eq('a button datapoint follows the row', out.actions[0].dp, 'hm-rpc.0.Melder1.STATE');
    check('a button keeps its other fields', out.actions[0].close === true && out.actions[0].value === 'false');
}
{
    const d = draft({ title: 'Fenster offen' });
    eq('a draft without variables comes back unchanged in content', resolveDraftForRow(d, A).title, 'Fenster offen');
    check('draftHasRowVars: plain draft', draftHasRowVars(d) === false);
    check('draftHasRowVars: variable in the title', draftHasRowVars(draft({ title: '{{name}}' })) === true);
    check(
        'draftHasRowVars: variable in a button',
        draftHasRowVars(draft({ actions: [{ label: 'x', dp: '{{parent}}.STATE', value: '1', close: true }] })) === true,
    );
}
{
    // A top-level datapoint has no strang — the token must not silently vanish.
    eq(
        'an id without a parent leaves {{parent}} alone',
        resolveDraftForRow(draft({ title: '{{parent}}' }), 'demo').title,
        '{{parent}}',
    );
}

// ── Freezing the `[[dp]]` values (issue #605) ────────────────────────────────
// The second substitution layer, applied once when the rule fires: a message is a
// record of something that happened, so its text keeps the value the datapoint had
// then. Only the display fields are frozen - a datapoint ID stays a reference.
{
    const VALUES = {
        'demo.melder.NAME': 'Flur',
        'demo.melder.MOTION': true,
        'demo.window.OPEN': false,
        'demo.batt': { soc: 87 },
    };
    const read = async (id) => VALUES[id];

    const frozen = await freezeDraftTokens(
        draft({
            title: 'Bewegung [[demo.melder.NAME]]',
            text: 'Wert [[demo.melder.MOTION]]',
            image: 'http://cam/[[demo.melder.NAME]].jpg',
            dp: 'demo.melder.MOTION',
            ackDp: 'demo.melder.ACK',
        }),
        read,
    );
    eq('freeze: a string value lands in the title', frozen.title, 'Bewegung Flur');
    eq('freeze: a boolean reads like it does in a title', frozen.text, 'Wert AN');
    eq('freeze: an image url is frozen too', frozen.image, 'http://cam/Flur.jpg');
    eq('freeze: the datapoint field stays a reference', frozen.dp, 'demo.melder.MOTION');
    eq('freeze: so does the confirmation datapoint', frozen.ackDp, 'demo.melder.ACK');

    // false is a value, not a missing one.
    const off = await freezeDraftTokens(draft({ title: 'Fenster [[demo.window.OPEN]]' }), read);
    eq('freeze: false freezes as AUS', off.title, 'Fenster AUS');

    // A reference nobody can answer keeps its token: the value may simply not have
    // arrived yet, and the live layer still gets its chance when it is displayed.
    const unknown = await freezeDraftTokens(draft({ title: 'Bewegung [[demo.ghost.NAME]]' }), read);
    eq('freeze: an unreadable reference keeps its token', unknown.title, 'Bewegung [[demo.ghost.NAME]]');

    // Mixed: what can be read is frozen, what cannot stays.
    const mixed = await freezeDraftTokens(draft({ title: '[[demo.melder.NAME]] / [[demo.ghost.NAME]]' }), read);
    eq('freeze: one readable, one not', mixed.title, 'Flur / [[demo.ghost.NAME]]');

    // The JSON path of a token is applied before the value becomes text.
    const path = await freezeDraftTokens(draft({ title: 'Akku [[demo.batt?soc]] %' }), read);
    eq('freeze: a JSON path resolves', path.title, 'Akku 87 %');

    // A button label is display text; its datapoint and value are not.
    const withAction = await freezeDraftTokens(
        draft({
            title: 'x',
            actions: [{ label: 'Aus [[demo.melder.NAME]]', dp: '[[demo.melder.NAME]]', value: '1', close: true }],
        }),
        read,
    );
    eq('freeze: an action label is frozen', withAction.actions[0].label, 'Aus Flur');
    eq('freeze: an action datapoint is not', withAction.actions[0].dp, '[[demo.melder.NAME]]');

    const plain = draft({ title: 'Fenster offen' });
    check('freeze: a draft without tokens comes back as-is', (await freezeDraftTokens(plain, read)) === plain);
    check('freeze: the stored draft is never mutated', plain.title === 'Fenster offen');
}

// ── Row rules: which of them want to send (Datenpunkte verwalten → Bedingungen) ──
// The other half of #605: a rule configured on the list's rows, evaluated per row,
// so the row that matches is the row the message is about.
{
    const notify = { title: 'Bewegung {{name}}' };
    const rules = [
        { id: 'paint', clauses: [clause('{dp}', 'true')], color: '#f00' },
        { id: 'msg', clauses: [clause('{dp}', 'true')], notify },
        { id: 'msg-off', clauses: [clause('{dp}', 'false')], notify },
    ];
    eq(
        'only the matching rules that carry a message are reported',
        matchingNotifyRules(rules, A, true, noValues).map((r) => r.id),
        ['msg'],
    );
    eq(
        'a rule without a message never shows up',
        matchingNotifyRules([rules[0]], A, true, noValues).map((r) => r.id),
        [],
    );
    eq(
        'the other row value picks the other rule',
        matchingNotifyRules(rules, A, false, noValues).map((r) => r.id),
        ['msg-off'],
    );
}
{
    // A foreign datapoint in the clause is resolved per row first ({{parent}}).
    const rules = [{ id: 'msg', clauses: [clause('{{parent}}.UNREACH', 'true')], notify: { title: 'x' } }];
    const resolved = resolveRuleRefs(rules, A);
    eq('the clause is rewritten for this row', resolved[0].clauses[0].datapoint, 'hm-rpc.0.Melder1.UNREACH');
    eq(
        'and matches against that row datapoint',
        matchingNotifyRules(resolved, A, null, values({ 'hm-rpc.0.Melder1.UNREACH': true })).map((r) => r.id),
        ['msg'],
    );
    eq(
        'a neighbouring row is unaffected',
        matchingNotifyRules(resolveRuleRefs(rules, B), B, null, values({ 'hm-rpc.0.Melder1.UNREACH': true })).map(
            (r) => r.id,
        ),
        [],
    );
}
{
    const rule = { id: 'r', logic: 'OR', clauses: [clause('{dp}', '>', '30'), clause('{dp}', '<', '10')] };
    check('ruleMatches: OR combines the clauses', ruleMatches(rule, A, 35, noValues) === true);
    check('ruleMatches: …and stays false between them', ruleMatches(rule, A, 20, noValues) === false);
    check(
        'ruleMatches: a rule without clauses never matches',
        ruleMatches({ id: 'r', clauses: [] }, A, true, noValues) === false,
    );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('\nFailed:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
