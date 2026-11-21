// The "Datenpunkte des Geräts" row popup reads only the clicked device's branch.
//
//   node tools/tests/device-dps-branch.mjs
//
// No dev server needed. Before, the popup loaded the whole object DB (every state, channel
// and device) to pick a handful of siblings - up to 20 s on a large installation, since the
// dashboard no longer warms that cache (#882). fetchDatapointBranch must issue one ranged
// state query and getObject reads for the branch's parents, never an unbounded view.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const STUB = `
const objs = {
    'hm-rpc.0.ABC': { type: 'device', common: { name: 'Stehlampe' } },
    'hm-rpc.0.ABC.1': { type: 'channel', common: { name: 'Schalter' } },
};
const states = [
    ['hm-rpc.0.ABC.1.STATE', { name: 'STATE', role: 'switch.light', type: 'boolean', write: true }],
    ['hm-rpc.0.ABC.1.ON_TIME', { name: 'ON_TIME', role: 'level', type: 'number', write: true }],
    ['hm-rpc.0.ABC.0.LOW_BAT', { name: 'LOW_BAT', role: 'indicator.lowbat', type: 'boolean' }],
    ['hm-rpc.0.ABCD.1.STATE', { name: 'STATE', role: 'switch', type: 'boolean' }],
];
export const calls = [];
export const getObjectViewDirect = async (type, start, end) => {
    calls.push(['view', type, start ?? '', end ?? '']);
    const rows = states
        .filter(([id]) => (!start || id >= start) && (!end || id <= end))
        .map(([id, common]) => ({ id, value: { _id: id, type: 'state', common } }));
    return { rows };
};
export const getObjectDirect = async (id) => {
    calls.push(['get', id]);
    return objs[id] ?? null;
};
export const whenStateReadsIdle = () => Promise.resolve();
`;

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-dps-branch-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { fetchDatapointBranch } from './useDatapointList.ts'; export { calls } from './useIoBroker';",
        resolveDir: join(process.cwd(), 'src-vis', 'hooks'),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    external: ['react'],
    logLevel: 'warning',
    plugins: [
        {
            name: 'stub-io',
            setup(b) {
                b.onResolve({ filter: /^\.\/useIoBroker$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
                b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: STUB, loader: 'js' }));
            },
        },
    ],
});
const { fetchDatapointBranch, calls } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const channel = await fetchDatapointBranch('hm-rpc.0.ABC.1');
check(
    'channel branch lists its own states only',
    channel.map((e) => e.id).join() === 'hm-rpc.0.ABC.1.STATE,hm-rpc.0.ABC.1.ON_TIME',
    channel.map((e) => e.id).join(),
);
const views = calls.filter((c) => c[0] === 'view');
check('exactly one object view', views.length === 1, JSON.stringify(views));
check(
    'the view is ranged on the branch',
    views[0]?.[1] === 'state' && views[0]?.[2] === 'hm-rpc.0.ABC.1.' && views[0]?.[3].startsWith('hm-rpc.0.ABC.1.'),
);
const st = channel.find((e) => e.id.endsWith('.STATE'));
check('role, type and write survive', st?.role === 'switch.light' && st?.type === 'boolean' && st?.write !== false);
check('the name comes from the parent objects', /Stehlampe|Schalter/.test(st?.name ?? ''), st?.name);

calls.length = 0;
const device = await fetchDatapointBranch('hm-rpc.0.ABC');
check(
    'device branch spans its channels but not a sibling device with the same prefix',
    device.length === 3 && !device.some((e) => e.id.startsWith('hm-rpc.0.ABCD')),
    device.map((e) => e.id).join(),
);
check(
    'no unbounded view',
    calls.every((c) => c[0] !== 'view' || c[2] !== ''),
);

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
