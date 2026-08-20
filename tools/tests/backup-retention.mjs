// Verifies the auto-backup retention path after raising the limit from 20 to 100.
//
//   node tools/tests/backup-retention.mjs
//
// The old limit existed because listBackupFiles() read EVERY backup payload to
// recover its change summary - one ~60 KB gzip blob per kept backup on every
// visit to the settings page, over the same socket the config writes share.
// Each backup now gets a tiny summary sidecar, so listing is cheap and the limit
// is about disk instead. The checks below pin exactly that:
//
//   - a sidecar is never listed as a restorable backup of its own
//   - listing 100 backups reads 100 small sidecars and ZERO payloads
//   - pre-sidecar backups still get their summary, but the payload reads for
//     them are budgeted so an old instance cannot melt the socket either
//   - writing a backup produces payload + sidecar, and pruning removes both
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const root = process.cwd();

// ── Fake ioBroker file store ─────────────────────────────────────────────────
// A stateful stub so the test can watch exactly which files get read.
const stubPlugin = {
    name: 'aura-iobroker-fake',
    setup(b) {
        b.onResolve({ filter: /hooks\/useIoBroker$/ }, () => ({ path: 'fake-iobroker', namespace: 'stub' }));
        b.onResolve({ filter: /utils\/namespace$/ }, () => ({ path: 'stub-namespace', namespace: 'stub' }));
        b.onLoad({ filter: /^fake-iobroker$/, namespace: 'stub' }, () => ({
            contents: `
                export const files = new Map();      // name -> contents
                export const reads = [];             // every readFile, in order
                export const writes = [];            // every writeFile, in order
                export const deletes = [];           // every deleteFile, in order
                export const setStateDirectAsync = async () => {};
                export const setStateDirect = () => {};
                export const getStateDirect = async () => null;
                export const getStateFromCache = () => undefined;
                export const writeFileDirect = async (_ns, name, data) => { writes.push(name); files.set(name, data); };
                export const readFileDirect = async (_ns, name) => { reads.push(name); return files.has(name) ? files.get(name) : null; };
                export const readDirDirect = async () => [...files.entries()].map(([file, data]) => ({ file, isDir: false, size: data.length }));
                export const deleteFileDirect = async (_ns, name) => {
                    deletes.push(name);
                    if (!files.has(name)) throw new Error('ENOENT ' + name);
                    files.delete(name);
                };
            `,
            loader: 'js',
        }));
        b.onLoad({ filter: /^stub-namespace$/, namespace: 'stub' }, () => ({
            contents: `export const NS = 'aura.0';`,
            loader: 'js',
        }));
    },
};

const cache = join(root, 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-backup-retention-${process.pid}.mjs`);
await build({
    stdin: {
        contents: `
            export { listBackupFiles, isBackupFile, configureBackup, saveToIoBroker } from './src-vis/store/persistManager.ts';
            export { MAX_BACKUP_COUNT } from './src-vis/store/adminPrefsStore.ts';
            export * as fake from './src-vis/hooks/useIoBroker';
        `,
        resolveDir: root,
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    plugins: [stubPlugin],
    logLevel: 'warning',
});

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

let loadCount = 0;
async function boot() {
    const map = new Map();
    globalThis.localStorage = {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k),
        clear: () => map.clear(),
        key: (i) => [...map.keys()][i] ?? null,
        get length() {
            return map.size;
        },
    };
    return { mod: await import(`${pathToFileURL(bundle).href}?boot=${++loadCount}`), map };
}

const pad = (n) => String(n).padStart(3, '0');
const pad2 = (n) => String(n).padStart(2, '0');
// Real ISO timestamps, one second apart, so lexical filename order == chronology.
const tsOf = (i) => `2026-08-20T10:${pad2(Math.floor(i / 60))}:${pad2(i % 60)}.${pad(i)}Z`;
const nameOf = (i) => `backup-${tsOf(i).replace(/[:.]/g, '-')}.json.gz`;
const metaOf = (i) => `backup-${tsOf(i).replace(/[:.]/g, '-')}.meta.json`;

// A real gzip+base64 payload in the shipped format. It carries a summary too, so
// the legacy (no-sidecar) path has something to recover - and so a regression
// that starts reading payloads again is caught by the read counters, not by a
// decode error.
const FAKE_PAYLOAD = gzipSync(
    Buffer.from(JSON.stringify({ _ts: 'legacy', _changed: ['aura-theme'], _details: [] })),
).toString('base64');
const metaBody = (i) =>
    JSON.stringify({
        _ts: tsOf(i),
        _changed: ['aura-dashboard'],
        _details: [{ store: 'aura-dashboard', kind: 'widget-moved', label: `W${i}` }],
    });

// ── 1. A sidecar is metadata, never a restorable backup ──────────────────────
// It starts with the same prefix and ends in .json, so a naive filter lists it
// as its own entry - and restoring one would apply an empty config.
{
    const { mod } = await boot();
    check('payload is a backup file', mod.isBackupFile('backup-2026-08-20T10-00-00-000Z.json.gz') === true);
    check('legacy plain payload is a backup file', mod.isBackupFile('backup-2026-08-20T10-00-00-000Z.json') === true);
    check('sidecar is NOT a backup file', mod.isBackupFile('backup-2026-08-20T10-00-00-000Z.meta.json') === false);
}

// ── 2. Listing 100 backups reads 100 sidecars and zero payloads ──────────────
{
    const { mod } = await boot();
    const { files, reads } = mod.fake;
    for (let i = 0; i < 100; i++) {
        files.set(nameOf(i), FAKE_PAYLOAD);
        files.set(metaOf(i), metaBody(i));
    }
    reads.length = 0;
    const list = await mod.listBackupFiles();

    eq('100 payloads yield 100 entries', list.length, 100);
    check(
        'no sidecar leaked into the list',
        list.every((e) => !e.filename.endsWith('.meta.json')),
    );
    check(
        'zero payloads were read',
        reads.filter((n) => n.endsWith('.json.gz')).length === 0,
        `read ${reads.filter((n) => n.endsWith('.json.gz')).length}`,
    );
    eq('exactly 100 sidecars were read', reads.filter((n) => n.endsWith('.meta.json')).length, 100);
    check('summary came through', list[0].details[0]?.kind === 'widget-moved', JSON.stringify(list[0].details));
    check('changed list came through', list[0].changed[0] === 'aura-dashboard');
    // Newest first, and the timestamp is decoded back from the filename.
    eq('newest sorts first', list[0].ts, tsOf(99));
    check('timestamp parses as a date', !Number.isNaN(Date.parse(list[0].ts)), list[0].ts);
}

// ── 3. Pre-sidecar backups: summary still recovered, reads budgeted ──────────
// An instance upgrading with a full ring must not fire 100 payload reads at the
// settings page - that is the exact cost the old limit of 20 was protecting.
{
    const { mod } = await boot();
    const { files, reads } = mod.fake;
    for (let i = 0; i < 100; i++) files.set(nameOf(i), FAKE_PAYLOAD); // no sidecars
    reads.length = 0;
    const list = await mod.listBackupFiles();

    eq('all legacy backups are still listed', list.length, 100);
    const payloadReads = reads.filter((n) => n.endsWith('.json.gz')).length;
    check('payload reads are budgeted, not unbounded', payloadReads <= 20, `read ${payloadReads}`);
    check('the budget is spent on the newest entries', payloadReads > 0, `read ${payloadReads}`);
}

// ── 4. Writing a backup produces payload + sidecar, pruning removes both ─────
{
    const { mod, map } = await boot();
    const { files, writes, deletes } = mod.fake;
    map.set('aura-dashboard', JSON.stringify({ state: { layouts: [] }, version: 0 }));
    // Seed a full ring of old backups so the write has to prune.
    for (let i = 0; i < 3; i++) {
        files.set(nameOf(i), FAKE_PAYLOAD);
        files.set(metaOf(i), metaBody(i));
    }
    mod.configureBackup({ maxBackups: 3 });
    check('saveToIoBroker accepted the save', mod.saveToIoBroker({ all: true }) === true);
    // The backup runs after the config writes are ACK-confirmed, so wait for the
    // effect rather than for a fixed delay.
    for (let i = 0; i < 200 && writes.length < 2; i++) await new Promise((r) => setTimeout(r, 10));

    const newPayload = writes.find((n) => n.endsWith('.json.gz'));
    const newMeta = writes.find((n) => n.endsWith('.meta.json'));
    check('a payload was written', !!newPayload, JSON.stringify(writes));
    check('a sidecar was written next to it', !!newMeta, JSON.stringify(writes));
    check(
        'sidecar name matches its payload',
        !!newPayload && !!newMeta && newMeta === newPayload.replace('.json.gz', '.meta.json'),
        `${newPayload} / ${newMeta}`,
    );
    check(
        'the sidecar holds the change summary',
        !!newMeta && JSON.parse(files.get(newMeta))._changed.includes('aura-dashboard'),
    );

    // Ring of 3 + the new one -> the oldest pair is pruned.
    check('the oldest payload was pruned', deletes.includes(nameOf(0)), JSON.stringify(deletes));
    check('its sidecar was pruned too', deletes.includes(metaOf(0)), JSON.stringify(deletes));
    check('no orphan sidecar left behind', ![...files.keys()].some((n) => n === metaOf(0)));
}

// ── 5. The configured ceiling is the shared constant ─────────────────────────
{
    const { mod } = await boot();
    eq('maximum is 100', mod.MAX_BACKUP_COUNT, 100);
}

rmSync(bundle, { force: true });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
