// Verifies the reordering helper behind the "Elemente" lists of the tab bar and
// the area menu (Bereichs-Menü) in the layout admin.
//
//   node tools/tests/menu-item-order.mjs
//
// No dev server needed: the helper is pure, so it is bundled with esbuild and
// exercised directly. The point of the test is that a move always changes what
// the bar shows - both bars render their elements grouped by position, so an
// element only ever swaps with a sibling of the same position.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-menu-item-order-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { menuItemSibling, canMoveMenuItem, moveMenuItem } from './src-vis/utils/menuItemOrder.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { menuItemSibling, canMoveMenuItem, moveMenuItem } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) => {
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    check(name, g === w, `got ${g}, want ${w}`);
};

const ids = (list) => list.map((i) => i.id).join(',');

// ── 1. Neighbours of the same position swap ─────────────────────────────────
{
    const items = [
        { id: 'a', position: 'top' },
        { id: 'b', position: 'top' },
        { id: 'c', position: 'top' },
    ];
    eq('b moves up', ids(moveMenuItem(items, 'b', -1)), 'b,a,c');
    eq('b moves down', ids(moveMenuItem(items, 'b', 1)), 'a,c,b');
    check('the first cannot move up', !canMoveMenuItem(items, 'a', -1));
    check('the last cannot move down', !canMoveMenuItem(items, 'c', 1));
    check('the first can move down', canMoveMenuItem(items, 'a', 1));
}

// ── 2. Elements of another position are skipped, not disturbed ──────────────
// The editor list is flat while the bar groups by position, so "up" has to reach
// past the foreign element - otherwise the click would do nothing on screen.
{
    const items = [
        { id: 'top1', position: 'top' },
        { id: 'bot1', position: 'bottom' },
        { id: 'top2', position: 'top' },
    ];
    eq('sibling of top2 is the far top1', menuItemSibling(items, 'top2', -1), 0);
    eq('top2 swaps with top1 across bot1', ids(moveMenuItem(items, 'top2', -1)), 'top2,bot1,top1');
    check('the lone bottom element cannot move up', !canMoveMenuItem(items, 'bot1', -1));
    check('the lone bottom element cannot move down', !canMoveMenuItem(items, 'bot1', 1));
}

// ── 3. Three positions (tab bar: L / M / R) stay independent ────────────────
{
    const items = [
        { id: 'l1', position: 'left' },
        { id: 'c1', position: 'center' },
        { id: 'r1', position: 'right' },
        { id: 'c2', position: 'center' },
        { id: 'l2', position: 'left' },
    ];
    eq('c2 moves up to c1', ids(moveMenuItem(items, 'c2', -1)), 'l1,c2,r1,c1,l2');
    eq('l1 moves down to l2', ids(moveMenuItem(items, 'l1', 1)), 'l2,c1,r1,c2,l1');
    check('the only right element sits still', !canMoveMenuItem(items, 'r1', -1) && !canMoveMenuItem(items, 'r1', 1));
}

// ── 4. Edge cases: unknown id, single element, empty list ───────────────────
{
    const items = [{ id: 'only', position: 'top' }];
    eq('unknown id has no sibling', menuItemSibling(items, 'ghost', 1), -1);
    eq('unknown id leaves the list alone', ids(moveMenuItem(items, 'ghost', 1)), 'only');
    check('a single element cannot move', !canMoveMenuItem(items, 'only', -1));
    eq('empty list stays empty', moveMenuItem([], 'x', 1).length, 0);
}

// ── 5. Moving hands back a copy - the config array is shared state ──────────
{
    const items = [
        { id: 'a', position: 'top' },
        { id: 'b', position: 'top' },
    ];
    const moved = moveMenuItem(items, 'b', -1);
    check('the result is a different array', moved !== items);
    eq('the original order is untouched', ids(items), 'a,b');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
