// Slideshow order (#848) — the pure part.
//
//   node tools/tests/slideshow-order.mjs
//
// No dev server needed: slideshowOrder.ts is pure and bundled with esbuild.
// Checks the sorted orders, that random order shows every file once per round
// without a repeat across the round boundary, that seed + round reproduce the
// order (the screensaver remounts the widget and must continue), and that the
// position survives files appearing and vanishing.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-slideshow-order-${process.pid}.mjs`);
await build({
    entryPoints: ['src-vis/components/widgets/slideshowOrder.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { slideshowSequence, stepPosition, currentItem, peekNext } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const item = (name, time, dir = '/p') => ({
    path: `${dir}/${name}`,
    name,
    kind: 'image',
    size: 1,
    time,
    dateSource: 'exif',
});
const items = [item('b.jpg', 300), item('a.jpg', 100), item('img10.jpg', 200), item('img2.jpg', 200)];
const names = (seq) => seq.map((m) => m.name);

// ── sorted orders ────────────────────────────────────────────────────────────
eq('newest first', names(slideshowSequence(items, 'dateDesc', 1, 0)), ['b.jpg', 'img10.jpg', 'img2.jpg', 'a.jpg']);
eq('oldest first', names(slideshowSequence(items, 'dateAsc', 1, 0)), ['a.jpg', 'img10.jpg', 'img2.jpg', 'b.jpg']);
eq('name, numeric aware', names(slideshowSequence(items, 'name', 1, 0)), ['a.jpg', 'b.jpg', 'img2.jpg', 'img10.jpg']);
eq(
    'sorted orders ignore the round',
    names(slideshowSequence(items, 'name', 1, 5)),
    names(slideshowSequence(items, 'name', 1, 0)),
);

// ── random order ─────────────────────────────────────────────────────────────
const many = Array.from({ length: 40 }, (_, i) => item(`f${i}.jpg`, i));
const r0 = slideshowSequence(many, 'random', 42, 0);
eq('round holds every file once', [...names(r0)].sort(), [...names(many)].sort());
eq('same seed + round = same order', names(slideshowSequence(many, 'random', 42, 0)), names(r0));
eq('input order does not matter', names(slideshowSequence([...many].reverse(), 'random', 42, 0)), names(r0));
check('next round is shuffled anew', names(slideshowSequence(many, 'random', 42, 1)).join() !== names(r0).join());
check('another seed, another order', names(slideshowSequence(many, 'random', 7, 0)).join() !== names(r0).join());
check(
    'not just the sorted order',
    names(r0).join() !== names([...many].sort((a, b) => (a.path < b.path ? -1 : 1))).join(),
);

for (const n of [2, 3, 5]) {
    const set = Array.from({ length: n }, (_, i) => item(`s${i}.jpg`, i));
    let boundaryRepeats = 0;
    for (let seed = 0; seed < 200; seed++) {
        for (let round = 1; round < 6; round++) {
            const prev = slideshowSequence(set, 'random', seed, round - 1);
            const cur = slideshowSequence(set, 'random', seed, round);
            if (prev[prev.length - 1].path === cur[0].path) boundaryRepeats++;
        }
    }
    eq(`${n} files: never the same file twice across a round boundary`, boundaryRepeats, 0);
}

// Walking forward over three rounds shows each file once per round.
{
    let pos = { seed: 99, round: 0, path: null };
    pos = { ...pos, path: currentItem(many, 'random', pos).path };
    const seen = [pos.path];
    for (let i = 0; i < many.length * 3 - 1; i++) {
        const step = stepPosition(many, 'random', pos, 1);
        pos = step.pos;
        seen.push(step.item.path);
    }
    const rounds = [0, 1, 2].map((r) => new Set(seen.slice(r * many.length, (r + 1) * many.length)).size);
    eq('three rounds, every file once in each', rounds, [40, 40, 40]);
    eq('round counter advanced', pos.round, 2);
    const repeats = seen.filter((p, i) => i > 0 && seen[i - 1] === p).length;
    eq('no file twice in a row', repeats, 0);
}

// ── stepping ─────────────────────────────────────────────────────────────────
{
    const p0 = { seed: 1, round: 0, path: '/p/a.jpg' };
    const fwd = stepPosition(items, 'name', p0, 1);
    eq('forward', fwd.item.name, 'b.jpg');
    const back = stepPosition(items, 'name', p0, -1);
    eq('back from the first of round 0 wraps to the end', [back.item.name, back.pos.round], ['img10.jpg', 0]);
    const end = stepPosition(items, 'name', { seed: 1, round: 0, path: '/p/img10.jpg' }, 1);
    eq('past the end: next round, first item', [end.item.name, end.pos.round], ['a.jpg', 1]);
    const backRound = stepPosition(items, 'name', { seed: 1, round: 1, path: '/p/a.jpg' }, -1);
    eq('back from the first of round 1: last of round 0', [backRound.item.name, backRound.pos.round], ['img10.jpg', 0]);
    eq('peekNext does not move', peekNext(items, 'name', p0).name, 'b.jpg');
}

// ── files appearing / vanishing (rescan) ────────────────────────────────────
{
    const pos = { seed: 1, round: 0, path: '/p/b.jpg' };
    const grown = [...items, item('c.jpg', 50)];
    eq('new file: position kept', currentItem(grown, 'name', pos).name, 'b.jpg');
    eq('new file: continues in the new order', stepPosition(grown, 'name', pos, 1).item.name, 'c.jpg');
    const shrunk = items.filter((m) => m.name !== 'b.jpg');
    eq('shown file deleted: current falls back to the first', currentItem(shrunk, 'name', pos).name, 'a.jpg');
    eq('shown file deleted: step restarts the round', stepPosition(shrunk, 'name', pos, 1).item.name, 'a.jpg');
    eq('empty list', stepPosition([], 'name', pos, 1).item, null);
    eq(
        'single file steps onto itself',
        stepPosition([items[0]], 'random', { seed: 1, round: 0, path: items[0].path }, 1).item.name,
        'b.jpg',
    );
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : ` - ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
