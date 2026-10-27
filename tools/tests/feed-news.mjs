// News widget (#854, phase 2) — which articles are new: feedNews.ts.
//
//   node tools/tests/feed-news.mjs
//
// No dev server: the module is pure and bundled with esbuild. Checked: a feed's
// first appearance is only the baseline, later unknown ids are reported (once
// per id, also across feeds), a feed added later gets its own baseline, and the
// read marks survive a round trip through storage, capped at SEEN_MAX with the
// oldest dropped first and junk in storage ignored.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-feed-news-${process.pid}.mjs`);
await build({
    entryPoints: ['src-vis/components/widgets/feedNews.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { unknownIds, loadSeen, saveSeen, seenKey, SEEN_MAX } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

// ── unknownIds ──
{
    const known = new Set();
    const based = new Set();
    eq('first load is the baseline', unknownIds(known, based, [{ key: 'u:a', ids: ['1', '2'] }]), []);
    eq('…and known afterwards', [...known], ['1', '2']);
    eq('nothing new on the same content', unknownIds(known, based, [{ key: 'u:a', ids: ['1', '2'] }]), []);
    eq('an arrival is reported', unknownIds(known, based, [{ key: 'u:a', ids: ['3', '1', '2'] }]), ['3']);
    eq(
        '…but not added: reported again until the caller adds it',
        unknownIds(known, based, [{ key: 'u:a', ids: ['3'] }]),
        ['3'],
    );
    known.add('3');
    eq(
        'a second feed appearing later is its own baseline',
        unknownIds(known, based, [
            { key: 'u:a', ids: ['3', '1'] },
            { key: 'd:rssfeed.0.x', ids: ['x1', 'x2'] },
        ]),
        [],
    );
    eq(
        'the same new id in two feeds is reported once',
        unknownIds(known, based, [
            { key: 'u:a', ids: ['9', '3'] },
            { key: 'd:rssfeed.0.x', ids: ['9', 'x1'] },
        ]),
        ['9'],
    );
    eq('a feed that failed (missing) reports nothing', unknownIds(known, based, []), []);
}

// ── storage ──
{
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
    eq('empty storage', loadSeen('w1', storage), { ids: [], sources: [] });
    eq('no storage at all', loadSeen('w1', null), { ids: [], sources: [] });
    saveSeen('w1', new Set(['a', 'b']), new Set(['u:x']), storage);
    eq('round trip', loadSeen('w1', storage), { ids: ['a', 'b'], sources: ['u:x'] });
    check('key per widget', mem.has(seenKey('w1')) && seenKey('w1') !== seenKey('w2'));
    eq('other widget untouched', loadSeen('w2', storage), { ids: [], sources: [] });

    const many = new Set(Array.from({ length: SEEN_MAX + 5 }, (_, i) => `id${i}`));
    saveSeen('w3', many, new Set(), storage);
    const back = loadSeen('w3', storage).ids;
    check(
        'capped at SEEN_MAX, oldest dropped',
        back.length === SEEN_MAX && back[0] === 'id5' && back.at(-1) === `id${SEEN_MAX + 4}`,
    );

    mem.set(seenKey('w4'), '{kaputt');
    eq('broken json ignored', loadSeen('w4', storage), { ids: [], sources: [] });
    mem.set(seenKey('w5'), JSON.stringify({ ids: ['ok', 3, null], sources: 'x' }));
    eq('junk entries ignored', loadSeen('w5', storage), { ids: ['ok'], sources: [] });

    const full = {
        setItem: () => {
            throw new Error('QuotaExceeded');
        },
    };
    let threw = false;
    try {
        saveSeen('w6', new Set(['a']), new Set(), full);
    } catch {
        threw = true;
    }
    check('full storage does not throw', !threw);
}

let failed = 0;
for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : ` - ${r.detail}`}`);
}
console.log(`feed-news: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
