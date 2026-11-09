// The value of an ioBroker web component bound to a datapoint (wcValueDp of the
// webcomponent widget): state value -> element.value, iob-change -> state value,
// equality as JSON and the guard against late echoes of own writes.
//
//   node tools/tests/web-component-value.mjs
//
// No dev server needed - utils/webComponentValue.ts is free of React and of the
// socket and is bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-web-component-value-${process.pid}.mjs`);
await build({
    entryPoints: [join(process.cwd(), 'src-vis/utils/webComponentValue.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const m = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) {
        failed++;
    }
    console.log(
        `${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` - got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
    );
}

// ── state -> element ────────────────────────────────────────────────────────
const schedule = [{ from: '06:00', to: '08:00', temp: 21 }];
check('from: json state -> array', m.fromStateValue(JSON.stringify(schedule), 'json'), schedule);
check('from: object state -> object', m.fromStateValue('{"a":1}', 'object'), { a: 1 });
check('from: array state -> array', m.fromStateValue('[1,2]', 'array'), [1, 2]);
check('from: json state with a scalar', m.fromStateValue('5', 'json'), 5);
check('from: json state with a JSON string', m.fromStateValue('"abc"', 'json'), 'abc');
check('from: json state with text that is no JSON', m.fromStateValue('abc', 'json'), 'abc');
check('from: json state empty', m.fromStateValue('', 'json'), '');
check('from: string state holding an object', m.fromStateValue(' {"a":[1]} ', 'string'), { a: [1] });
check('from: mixed state holding an array, no type known', m.fromStateValue('[1,"x"]'), [1, 'x']);
check('from: string state with a number text stays text', m.fromStateValue('5', 'string'), '5');
check('from: string state with broken JSON stays text', m.fromStateValue('{a:1}', 'string'), '{a:1}');
check('from: string state "null" stays text', m.fromStateValue('null', 'string'), 'null');
check('from: number', m.fromStateValue(21.5, 'number'), 21.5);
check('from: boolean', m.fromStateValue(false, 'boolean'), false);
check('from: null', m.fromStateValue(null, 'json'), null);
check('from: an object as the socket delivered it', m.fromStateValue({ a: 1 }, 'object'), { a: 1 });

// ── element -> state ────────────────────────────────────────────────────────
check('to: array -> JSON text', m.toStateValue(schedule, 'json'), JSON.stringify(schedule));
check('to: object -> JSON text for any type', m.toStateValue({ a: 1 }, 'string'), '{"a":1}');
check('to: object without known type', m.toStateValue({ a: 1 }), '{"a":1}');
check('to: number into a json state reads back as the number', m.toStateValue(5, 'json'), '5');
check('to: boolean into an object state', m.toStateValue(true, 'object'), 'true');
check('to: text into a json state stays as it is', m.toStateValue('abc', 'json'), 'abc');
check('to: number into a string state', m.toStateValue(5, 'string'), '5');
check('to: numeric text into a number state', m.toStateValue('2,5', 'number'), 2.5);
check('to: boolean into a number state', m.toStateValue(true, 'number'), 1);
check('to: other text into a number state stays', m.toStateValue('abc', 'number'), 'abc');
check('to: empty text into a number state stays', m.toStateValue('', 'number'), '');
check('to: "true" into a boolean state', m.toStateValue('true', 'boolean'), true);
check('to: 0 into a boolean state', m.toStateValue(0, 'boolean'), false);
check('to: number into a mixed state', m.toStateValue(7, 'mixed'), 7);
check('to: undefined -> null', m.toStateValue(undefined, 'json'), null);
check('to: null -> null', m.toStateValue(null, 'string'), null);
check(
    'to: a function is no value',
    m.toStateValue(() => 1, 'string'),
    null,
);

// round trip
for (const [type, value] of [
    ['json', schedule],
    ['json', 5],
    ['json', 'plain text'],
    ['object', { nested: { list: [1, 2] } }],
    ['string', ['a', 'b']],
    ['number', 3],
    ['boolean', true],
    ['mixed', { a: 1 }],
]) {
    check(`round trip: ${type} ${JSON.stringify(value)}`, m.fromStateValue(m.toStateValue(value, type), type), value);
}

// ── equality ────────────────────────────────────────────────────────────────
check(
    'same: equal objects, other key order',
    m.sameValue({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }),
    true,
);
check('same: arrays in other order differ', m.sameValue([1, 2], [2, 1]), false);
check('same: number and its text differ', m.sameValue(5, '5'), false);
check('same: undefined and null differ', m.sameValue(undefined, null), false);
check('same: undefined and undefined', m.sameValue(undefined, undefined), true);
check('same: different values', m.sameValue({ a: 1 }, { a: 2 }), false);

// ── the manifest declares it ─
check('editsValue: declared', m.editsValue({ editsValue: true }), true);
check('editsValue: missing means no', m.editsValue({}), false);
check('editsValue: false', m.editsValue({ editsValue: false }), false);
check('editsValue: only true counts', m.editsValue({ editsValue: 'true' }), false);

// ── echoes of own writes ────────────────────────────────────────────────────
{
    let t = 1000;
    const g = m.createEchoGuard(5000, () => t);
    check('echo: a value nobody wrote is news', g.accept('x'), true);
    g.wrote('A');
    g.wrote('B');
    check('echo: the echo of A is overtaken by B', g.accept('A'), false);
    check('echo: the echo of B is the newest', g.accept('B'), true);
    check('echo: another value is news', g.accept('C'), true);
    check('echo: an echo may come twice (local, then server)', [g.accept('A'), g.accept('B')], [false, true]);
    g.wrote('A');
    check('echo: A written again is the newest', g.accept('A'), true);
    check('echo: and B is now stale', g.accept('B'), false);
    t += 6000;
    check('echo: forgotten after the time to live', g.accept('B'), true);
    g.wrote({ b: 1, a: 2 });
    g.wrote('Z');
    check('echo: objects compare as JSON', g.accept({ a: 2, b: 1 }), false);
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
