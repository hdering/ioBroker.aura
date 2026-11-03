// Swipe navigation (#908): gesture classification and the next target.
//
//   node tools/tests/swipe-nav-logic.mjs
//
// No dev server needed - utils/swipeNav.ts is pure and bundled with esbuild.
// The real touch handling in the frontend is covered by swipe-nav.mjs.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-swipe-nav-logic-${process.pid}.mjs`);
await build({
    entryPoints: ['src-vis/utils/swipeNav.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const m = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failed++;
    console.log(
        `${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` - got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`,
    );
}

// ── classifySwipe ──
check('long left swipe', m.classifySwipe(-120, 10, 300), 'left');
check('long right swipe', m.classifySwipe(120, -10, 300), 'right');
check('up swipe', m.classifySwipe(5, -150, 300), 'up');
check('down swipe', m.classifySwipe(-5, 150, 300), 'down');
check('too short and slow', m.classifySwipe(-40, 0, 400), null);
check('short fast flick counts', m.classifySwipe(-40, 0, 50), 'left');
check('flick below minimum', m.classifySwipe(-20, 0, 10), null);
check('diagonal is no swipe', m.classifySwipe(-100, 80, 300), null);
check('too slow drag', m.classifySwipe(-300, 0, 1500), null);

// ── swipeStep ──
check('left = forward', m.swipeStep('left'), 1);
check('up = forward', m.swipeStep('up'), 1);
check('right = back', m.swipeStep('right'), -1);
check('down = back', m.swipeStep('down'), -1);

// ── stepTarget ──
const list = [{ id: 'a' }, { id: 'b', off: true }, { id: 'c' }, { id: 'd' }];
const ok = (it) => !it.off;
const id = (it) => it?.id ?? null;
check('next skips unreachable', id(m.stepTarget(list, ok, 'a', 1, false)), 'c');
check('prev skips unreachable', id(m.stepTarget(list, ok, 'c', -1, false)), 'a');
check('end without wrap', id(m.stepTarget(list, ok, 'd', 1, false)), null);
check('start without wrap', id(m.stepTarget(list, ok, 'a', -1, false)), null);
check('end with wrap', id(m.stepTarget(list, ok, 'd', 1, true)), 'a');
check('start with wrap', id(m.stepTarget(list, ok, 'a', -1, true)), 'd');
check('current unreachable counts from its slot', id(m.stepTarget(list, ok, 'b', 1, false)), 'c');
check('unknown current forward = first', id(m.stepTarget(list, ok, 'x', 1, false)), 'a');
check('unknown current back = last', id(m.stepTarget(list, ok, 'x', -1, false)), 'd');
check('single entry', id(m.stepTarget([{ id: 'a' }], ok, 'a', 1, true)), null);
check('only self reachable, wrap', id(m.stepTarget(list, (it) => it.id === 'a', 'a', 1, true)), null);

// ── swipeAllowed ──
const free = { blockX: false, blockY: false, atLeft: true, atRight: true, atTop: true, atBottom: true };
check(
    'free surface allows all',
    ['left', 'right', 'up', 'down'].map((d) => m.swipeAllowed(d, free)),
    [true, true, true, true],
);
check(
    'blockX stops horizontal only',
    ['left', 'right', 'up', 'down'].map((d) => m.swipeAllowed(d, { ...free, blockX: true })),
    [false, false, true, true],
);
check(
    'scrolled to middle: no vertical',
    ['up', 'down'].map((d) => m.swipeAllowed(d, { ...free, atTop: false, atBottom: false })),
    [false, false],
);
check(
    'at top: only down (back) is free',
    ['up', 'down'].map((d) => m.swipeAllowed(d, { ...free, atBottom: false })),
    [false, true],
);
check('scroller not at right edge: no left swipe', m.swipeAllowed('left', { ...free, atRight: false }), false);

if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
}
console.log('\nall swipe-nav logic checks passed');
