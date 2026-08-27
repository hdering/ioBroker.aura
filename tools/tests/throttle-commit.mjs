// Verifies the rate limiter behind the colour picker — utils/throttleCommit.ts.
//
//   node tools/tests/throttle-commit.mjs
//
// No dev server needed: the module is pure, so esbuild bundles it and the test
// drives it directly.
//
// What matters: a drag must not reach the config once per pointer move (that path
// re-serializes the whole dashboard), the first value must still land instantly,
// and the value the user ends on must always be the one that survives.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-throttle-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { createThrottle } from './src-vis/utils/throttleCommit.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { createThrottle } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, got === want ? '' : `got ${got}, want ${want}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MS = 40;

// ── a single value is applied at once ────────────────────────────────────────
{
    const seen = [];
    const t = createThrottle((v) => seen.push(v), MS);
    t.push('#111111');
    eq('a single push applies immediately', seen.join(), '#111111');
    await sleep(MS * 2);
    eq('and is not applied twice', seen.join(), '#111111');
}

// ── a drag is coalesced ──────────────────────────────────────────────────────
{
    const seen = [];
    const t = createThrottle((v) => seen.push(v), MS);
    // 30 pointer moves inside one window — unthrottled this is 30 dashboard writes.
    for (let i = 0; i < 30; i++) t.push(`#0000${i.toString(16).padStart(2, '0')}`);
    eq('a burst applies only its first value right away', seen.length, 1);
    eq('and that is the first one', seen[0], '#000000');
    await sleep(MS * 2);
    eq('the trailing run adds exactly one more', seen.length, 2);
    eq('carrying the newest value of the burst', seen[1], '#00001d');
}

// ── flush hands the pending value over ───────────────────────────────────────
{
    const seen = [];
    const t = createThrottle((v) => seen.push(v), MS);
    t.push('#aaaaaa');
    t.push('#bbbbbb');
    t.push('#cccccc');
    t.flush();
    eq('flush delivers the pending value without waiting', seen.join(), '#aaaaaa,#cccccc');
    await sleep(MS * 2);
    eq('and the cancelled trailing run does not fire again', seen.length, 2);
}

// ── flush with nothing pending is a no-op ────────────────────────────────────
{
    const seen = [];
    const t = createThrottle((v) => seen.push(v), MS);
    t.push('#123456');
    t.flush();
    t.flush();
    eq('flush without a pending value applies nothing', seen.join(), '#123456');
}

// ── the window reopens after it elapsed ──────────────────────────────────────
{
    const seen = [];
    const t = createThrottle((v) => seen.push(v), MS);
    t.push('#010101');
    await sleep(MS * 2);
    t.push('#020202');
    eq('a push after the window applies immediately again', seen.join(), '#010101,#020202');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
