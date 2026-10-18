// Verifies `callback("name", dp)` in the list value conversion (issue #794).
//
//   node tools/tests/list-value-callback.mjs
//
// Custom JS registers a function with `aura.registerFn(name, fn)`; the expression conversion
// calls it by name. Only registered functions are reachable, only the value conversion may call
// them (a binding whose text comes out of a datapoint must not), and a missing, throwing or async
// function yields "no value" instead of breaking the row.
//
// No dev server needed — the modules are pure and are bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-list-value-callback-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export { applyValueExpr } from './src-vis/utils/valueExpr.ts';",
            "export { evalExpr } from './src-vis/utils/expr.ts';",
            "export { renderTemplate } from './src-vis/utils/htmlTemplate.ts';",
            "export * from './src-vis/utils/fnRegistry.ts';",
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
const m = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) {
        failed++;
    }
};
const eq = (label, actual, expected) =>
    check(label, Object.is(actual, expected), `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);

// The registry warns once per failing function — keep the test output readable.
const warnings = [];
console.warn = (...a) => warnings.push(a.map(String).join(' '));

const OPS = { formatNum: (n, d) => n.toFixed(d).replace('.', ','), decimals: 1, t: (k) => k };
const conv = (val, expr) => m.applyValueExpr(val, expr, OPS);

// The issue's example function.
m.registerFn('geraeteStatus', (dp) => {
    const data = typeof dp === 'string' ? JSON.parse(dp) : dp;
    if (data.error === true) return 'FEHLER';
    if (data.veState !== 'running') return 'AUS';
    if (Number(data.leistung) > 1000) return 'HOCH';
    return 'AKTIV';
});

// ── calling ───────────────────────────────────────────────────────────────
eq(
    'issue example: running, 1500 W → HOCH',
    conv('{"veState":"running","leistung":1500}', 'callback("geraeteStatus", dp)'),
    'HOCH',
);
eq('issue example: error flag → FEHLER', conv('{"error":true}', 'callback("geraeteStatus", dp)'), 'FEHLER');
eq('issue example: off → AUS', conv('{"veState":"off"}', 'callback("geraeteStatus", dp)'), 'AUS');

m.registerFn('double', (n) => n * 2);
eq('numeric text arrives as a number', conv('21', 'callback("double", dp)'), 42);
eq('result feeds into arithmetic and pipes', conv(1.25, 'callback("double", dp) * 2 | fixed(1)'), '5.0');
m.registerFn('sum', (a, b, c) => a + b + c);
eq('several arguments are passed through', conv(1, 'callback("sum", dp, 2, 3)'), 6);
eq('JSON field as the argument', conv('{"a":{"b":4}}', 'callback("double", dp.a.b)'), 8);
m.registerFn('obj', () => ({ x: 1 }));
eq('an object result prints as JSON', conv(1, 'callback("obj", dp)'), '{"x":1}');

// ── failure is "no value" ─────────────────────────────────────────────────
eq('unregistered name → null', conv(5, 'callback("missing", dp)'), null);
eq('name not a string → null', conv(5, 'callback(dp, dp)'), null);
m.registerFn('boom', () => {
    throw new Error('kaputt');
});
eq('throwing function → null', conv(5, 'callback("boom", dp)'), null);
eq('throwing function warns once', warnings.filter((w) => w.includes("callback('boom')")).length, 1);
conv(5, 'callback("boom", dp)');
eq('… and only once', warnings.filter((w) => w.includes("callback('boom')")).length, 1);
m.registerFn('later', async (n) => n);
eq('async function → null', conv(5, 'callback("later", dp)'), null);
check(
    'async function is reported',
    warnings.some((w) => w.includes("callback('later')") && w.includes('Promise')),
);
m.registerFn('nothing', () => undefined);
eq('undefined result → null', conv(5, 'callback("nothing", dp)'), null);

// ── registration ──────────────────────────────────────────────────────────
const v0 = m.getFnsVersion();
let notified = 0;
const off = m.subscribeFns(() => notified++);
m.registerFn('fresh', () => 'neu');
check('registering bumps the version', m.getFnsVersion() > v0);
eq('registering notifies subscribers', notified, 1);
m.registerFn('bad name', () => 1);
m.registerFn('notFn', 42);
eq('invalid name or non-function is ignored', notified, 1);
m.registerFn('fresh', () => 'neuer');
eq('re-registering replaces the function', conv(0, 'callback("fresh", dp)'), 'neuer');
m.unregisterFn('fresh');
eq('unregistered function → null', conv(0, 'callback("fresh", dp)'), null);
m.clearFns();
eq('clearFns drops every function', conv('{"veState":"off"}', 'callback("geraeteStatus", dp)'), null);
off();
const before = notified;
m.registerFn('quiet', () => 1);
eq('unsubscribed listener is not called', notified, before);

// ── sealed outside the value conversion ───────────────────────────────────
m.registerFn('secret', () => 'LEAK');
eq(
    'evalExpr without callFn → null',
    m.evalExpr('callback("secret", 1)', { resolveRaw: () => null, vars: {}, ops: OPS }),
    null,
);
const html = m.renderTemplate('<b>{{ callback("secret", 1) }}</b>', {
    resolveRaw: () => null,
    rawVars: {},
    ops: OPS,
});
check('HTML binding cannot reach registered functions', !html.includes('LEAK'), html);
eq(
    'window globals stay unreachable',
    m.evalExpr('fetch("x")', { resolveRaw: () => null, vars: {}, ops: OPS }),
    undefined,
);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
