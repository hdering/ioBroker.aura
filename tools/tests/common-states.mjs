// Verifies reading common.states into value-mapping entries (Auswahlfeld import and
// the JSON table's "Zuordnung", issue #852).
//
//   node tools/tests/common-states.mjs
//
// Both spellings ioBroker knows ({"1":"an"} and "0:zu;1:auf") must parse, and an import
// into an existing list must keep what was set by hand: icon and colour of a known
// value, its own text, entries the states do not list.
//
// No dev server needed - the helpers are pure and bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-common-states-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/commonStates.ts';",
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
            // The socket layer runs browser-only setup on load; only the parser and the
            // merge are checked here, so getObjectDirect is a stub.
            name: 'stub-iobroker',
            setup(b) {
                b.onResolve({ filter: /useIoBroker$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
                    contents: 'export const getObjectDirect = async () => null;',
                    loader: 'js',
                }));
            },
        },
    ],
});
const { parseCommonStates, mergeStatesIntoEntries } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${ok || !detail ? '' : ` - ${detail}`}`);
    if (!ok) failed++;
};
const same = (label, actual, expected) =>
    check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);

// ── Parsing ──────────────────────────────────────────────────────────────────────
same('object form', parseCommonStates({ 1: 'eingehend', 2: 'entgangen' }), { 1: 'eingehend', 2: 'entgangen' });
same('non-string texts become text', parseCommonStates({ 0: 0, 1: true }), { 0: '0', 1: 'true' });
same('legacy string form', parseCommonStates('0:zu; 1:auf'), { 0: 'zu', 1: 'auf' });
same('a colon inside the text survives', parseCommonStates('1:Zeit: 10 min'), { 1: 'Zeit: 10 min' });
same('pairs without key are skipped', parseCommonStates(':x;2:b;kaputt'), { 2: 'b' });
same('empty object is nothing', parseCommonStates({}), null);
same('missing states are nothing', parseCommonStates(undefined), null);
same('an array is nothing', parseCommonStates(['a', 'b']), null);

// ── Merging ──────────────────────────────────────────────────────────────────────
const make = (value, label) => ({ value, label });
const states = { 1: 'eingehend', 2: 'entgangen', 3: 'ausgehend' };
same('empty list takes the states in order', mergeStatesIntoEntries([], states, make), [
    make('1', 'eingehend'),
    make('2', 'entgangen'),
    make('3', 'ausgehend'),
]);
same(
    'a known value keeps icon and colour, gets the missing text',
    mergeStatesIntoEntries(
        [{ value: '2', label: '', icon: 'mdi:phone-missed', color: '#f00' }],
        { 2: 'entgangen' },
        make,
    ),
    [{ value: '2', label: 'entgangen', icon: 'mdi:phone-missed', color: '#f00' }],
);
same('its own text wins', mergeStatesIntoEntries([{ value: '2', label: 'verpasst' }], { 2: 'entgangen' }, make), [
    { value: '2', label: 'verpasst' },
]);
same(
    'entries the states do not know stay',
    mergeStatesIntoEntries([{ value: '9', label: 'sonst' }], { 1: 'a' }, make),
    [{ value: '9', label: 'sonst' }, make('1', 'a')],
);
same(
    'blanks around a stored value still match',
    mergeStatesIntoEntries([{ value: ' 1 ', label: '' }], { 1: 'a' }, make),
    [{ value: ' 1 ', label: 'a' }],
);

console.log(failed === 0 ? '\nAll common.states checks OK' : `\n${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
