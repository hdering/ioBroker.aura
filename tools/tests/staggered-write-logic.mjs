// Group action with a delay between devices (#974) — utils/staggeredWrite.ts:
//   - without a delay: plain setState loop, nothing goes to the adapter
//   - with a delay: delay-0 items written at once, the rest sent to the adapter
//   - no adapter answer: the delayed items run on browser timers
//   - harness (writes blocked): browser timers, never sendTo
//   - cancel only asks the adapter when that key sent a run before
//
//   node tools/tests/staggered-write-logic.mjs
//
// No dev server needed — useIoBroker is stubbed, the module is bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-staggered-write-logic-${process.pid}.mjs`);
const stubIoBroker = {
    name: 'stub-iobroker',
    setup(b) {
        b.onResolve({ filter: /hooks\/useIoBroker$/ }, () => ({ path: 'useIoBroker', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents:
                'export const sendToDirect = (...a) => globalThis.__stub.sendToDirect(...a);' +
                'export const devWritesBlocked = () => globalThis.__stub.blocked;',
            loader: 'js',
        }));
    },
};
await build({
    stdin: {
        contents: "export * from './src-vis/utils/staggeredWrite.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
    plugins: [stubIoBroker],
});
const { runStaggered, cancelStaggered, staggerDelay } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const eq = (name, got, want) => {
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    const ok = g === w;
    if (!ok) failed++;
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : ` — got ${g}, want ${w}`}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function setup({ blocked = false, answer = { ok: true } } = {}) {
    const writes = [];
    const sent = [];
    globalThis.__stub = {
        blocked,
        sendToDirect: (target, command, payload) => {
            sent.push({ command, payload });
            return Promise.resolve(answer);
        },
    };
    return { writes, sent, setState: (id, v) => writes.push(`${id}=${v}`) };
}

eq(
    'staggerDelay: 0, step, 2·step',
    [0, 1, 2].map((i) => staggerDelay(i, 1500)),
    [0, 1500, 3000],
);
eq('staggerDelay: no step → 0', [staggerDelay(3, undefined), staggerDelay(3, -1)], [0, 0]);
eq('staggerDelay: capped at 10 min', staggerDelay(1000, 60000), 600000);

{
    const { writes, sent, setState } = setup();
    runStaggered(
        'w1',
        [
            { id: 'a', val: true, delayMs: 0 },
            { id: 'b', val: true, delayMs: 0 },
        ],
        setState,
    );
    eq('no delay: written at once', writes, ['a=true', 'b=true']);
    eq('no delay: nothing sent to the adapter', sent.length, 0);
}

{
    const { writes, sent, setState } = setup();
    runStaggered(
        'w2',
        [
            { id: 'a', val: 0, delayMs: 0 },
            { id: 'b', val: 0, delayMs: 2000 },
        ],
        setState,
    );
    await wait(10);
    eq('delay: first written at once', writes, ['a=0']);
    eq(
        'delay: rest sent to the adapter',
        sent.map((s) => s.payload),
        [{ key: 'w2', items: [{ id: 'b', val: 0, delayMs: 2000 }] }],
    );
    cancelStaggered('w2');
    eq('cancel after a remote run asks the adapter', sent[1]?.payload, { key: 'w2', cancel: true });
    cancelStaggered('w2');
    eq('second cancel stays local', sent.length, 2);
}

{
    const { writes, setState } = setup({ answer: { __timeout: true } });
    runStaggered(
        'w3',
        [
            { id: 'a', val: 1, delayMs: 0 },
            { id: 'b', val: 1, delayMs: 30 },
        ],
        setState,
    );
    await wait(80);
    eq('no adapter answer: browser timers take over', writes, ['a=1', 'b=1']);
}

{
    const { writes, sent, setState } = setup({ blocked: true });
    runStaggered(
        'w4',
        [
            { id: 'a', val: 1, delayMs: 20 },
            { id: 'b', val: 1, delayMs: 40 },
        ],
        setState,
    );
    await wait(30);
    cancelStaggered('w4');
    await wait(40);
    eq('harness: local timers, cancel drops the rest', writes, ['a=1']);
    eq('harness: never sendTo', sent.length, 0);
}

{
    const { writes, sent, setState } = setup();
    runStaggered('w 5/x', [{ id: 'a', val: 1, delayMs: 10 }], setState);
    await wait(5);
    eq('key sanitised for the adapter', sent[0]?.payload.key, 'w_5_x');
    // A later run without delays must still drop the adapter's pending writes.
    runStaggered('w 5/x', [{ id: 'a', val: 0, delayMs: 0 }], setState);
    eq('run without delay cancels the remote run', sent[1]?.payload, { key: 'w_5_x', cancel: true });
    eq('and writes at once', writes, ['a=0']);
}

if (failed) {
    console.log(`staggered-write-logic: ${failed} failed`);
    process.exit(1);
}
console.log('staggered-write-logic: all passed');
