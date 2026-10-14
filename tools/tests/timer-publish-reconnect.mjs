// A timer saved while the socket reconnects must still reach the adapter (#778).
//
//   node tools/tests/timer-publish-reconnect.mjs
//
// No dev server: publishTimerConfig is bundled with esbuild, useIoBroker is stubbed
// with a socket that behaves like the ioBroker ws client — after the first connect
// it drops every emit while offline and never calls back.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const stub = `
let connected = true;
let disconnectedSince = null;
const listeners = new Set();
export const sent = [];
export function setOnline(on) {
    connected = on;
    disconnectedSince = on ? null : Date.now();
    listeners.forEach((fn) => fn());
}
const socket = {
    emit(name, ...args) {
        if (!connected) return; // dropped, no callback — like the ws client after a drop
        const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
        if (name === 'setState') sent.push([args[0], args[1].val]);
        if (cb) queueMicrotask(() => cb(null));
    },
};
export const getSocket = () => socket;
export const getDisconnectedSince = () => disconnectedSince;
export function onDisconnectedSinceChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
export function setStateConfirmed(id, val, ack) {
    return new Promise((resolve) => socket.emit('setState', id, { val, ack }, (err) => resolve(!err)));
}
export const sendToDirect = async () => null;
export const devWritesBlocked = () => false;
`;

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-timer-publish-reconnect-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { publishTimerConfig, publishTimerEnabled } from './src-vis/utils/publishTimerConfig.ts';\nexport { sent, setOnline } from 'io-stub';",
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
            name: 'io-stub',
            setup(b) {
                b.onResolve({ filter: /hooks\/useIoBroker$|^io-stub$/ }, () => ({
                    path: 'io-stub',
                    namespace: 'stub',
                }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: stub, loader: 'js' }));
            },
        },
    ],
});
const { publishTimerConfig, publishTimerEnabled, sent, setOnline } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const tick = () => new Promise((r) => setTimeout(r, 0));
const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });
const configs = () =>
    sent.filter(([id]) => id.endsWith('.config')).map(([, v]) => JSON.parse(v).events[0].trigger.hour);
const ev = (hour) => ({
    events: [{ id: 'e1', enabled: true, weekdays: [], trigger: { kind: 'time', hour, minute: 0 } }],
});

// 1. Online: written once, nothing left to retry.
publishTimerConfig('w1', 'T', ev(7));
await tick();
eq('online write lands', configs(), [7]);

// 2. Saved while reconnecting: dropped, re-sent on the next connect.
setOnline(false);
publishTimerConfig('w1', 'T', ev(8));
publishTimerEnabled('w1', 'T', false);
await tick();
eq('offline write is dropped', configs(), [7]);
setOnline(true);
await tick();
await tick();
eq('re-sent after reconnect', configs(), [7, 8]);
eq('master switch re-sent too', sent.filter(([id]) => id.endsWith('.enabled')).at(-1), [
    'aura.0.timers.w1.enabled',
    false,
]);

// 3. Only the latest offline edit is re-sent.
setOnline(false);
publishTimerConfig('w1', 'T', ev(9));
publishTimerConfig('w1', 'T', ev(10));
await tick();
setOnline(true);
await tick();
await tick();
eq('latest offline edit wins', configs(), [7, 8, 10]);

// 4. A confirmed write is not repeated on a later reconnect (would overwrite
//    a newer edit from another device).
setOnline(false);
setOnline(true);
await tick();
await tick();
eq('confirmed write not repeated', configs(), [7, 8, 10]);

let failed = 0;
for (const r of results) {
    console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
    if (!r.ok) {
        failed++;
    }
}
console.log(`timer-publish-reconnect: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
