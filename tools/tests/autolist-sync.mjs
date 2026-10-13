// Dynamische Liste: what the auto-sync adds and — with syncRemove — takes out again.
//
//   node tools/tests/autolist-sync.mjs
//
// No dev server: syncEntries is pure.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-autolist-sync-${process.pid}.mjs`);
await build({
    entryPoints: ['src-vis/utils/autoListSync.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const m = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    console.log(
        `${ok ? '  ok  ' : '  FAIL'} ${name}${ok ? '' : ` - got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`,
    );
};

const found = (id) => ({ id, rooms: ['Flur'], role: 'switch', write: true });
const synced = (id) => ({ id, label: undefined, rooms: ['Flur'], unit: undefined, role: 'switch', writable: true });

let r = m.syncEntries([], [found('a'), found('b')], false);
eq('leere Liste wird gefüllt', [r.entries.map((e) => e.id), r.added, r.removed], [['a', 'b'], 2, 0]);

r = m.syncEntries([synced('a'), synced('gone')], [found('a')], false);
eq('ohne syncRemove bleibt Verschwundenes', [r.entries.map((e) => e.id), r.removed], [['a', 'gone'], 0]);

r = m.syncEntries([synced('a'), synced('gone')], [found('a')], true);
eq('mit syncRemove fliegt es raus', [r.entries.map((e) => e.id), r.removed], [['a'], 1]);

r = m.syncEntries([synced('a'), { ...synced('own'), label: 'Meins' }], [found('a')], true);
eq('eigenes Label schützt', r.entries.map((e) => e.id), ['a', 'own']);

r = m.syncEntries([synced('a'), { ...synced('own'), icon: 'mdi:lamp' }], [found('a')], true);
eq('eigenes Icon schützt', r.entries.map((e) => e.id), ['a', 'own']);

r = m.syncEntries([synced('a'), synced('b')], [], true);
eq('leeres Suchergebnis entfernt nichts', [r.entries.map((e) => e.id), r.removed], [['a', 'b'], 0]);

const same = [synced('a')];
eq('nichts geändert → selbe Liste', m.syncEntries(same, [found('a')], true).entries === same, true);

if (failed) {
    console.log(`\n${failed} FAILED`);
    process.exit(1);
}
console.log('\nall ok');
