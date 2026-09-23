// Rules of the collapsible widget (issue #676): which types fold, in which
// context, how many grid rows the folded card takes and where the fold button
// lands when it shares a corner with the fullscreen button.
//
//   node tools/tests/widget-collapse-logic.mjs
//
// No dev server needed - utils/widgetCollapse.ts and utils/fullscreenButton.ts
// are pure arithmetic and are bundled with esbuild. The rendered card is covered
// by widget-collapse.mjs.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-collapse-logic-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export * from './src-vis/utils/widgetCollapse.ts';\n" +
            "export * from './src-vis/utils/fullscreenButton.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const {
    COLLAPSE_EXCLUDED_TYPES,
    COLLAPSED_HEADER_FALLBACK_PX,
    supportsCollapse,
    collapsibleWidget,
    isCollapsedNow,
    collapsedRows,
    collapsedPadY,
    COLLAPSED_PAD_Y,
    COLLAPSED_MIN_PX,
    collapsePosition,
    collapseButtonSlot,
    cornerInset,
    fullscreenButtonInset,
} = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });
const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

// ── 1. Which types fold ──
for (const type of ['value', 'group', 'mirror', 'menu', 'chart', 'iframe', 'camera', 'panels']) {
    ok(`${type} may fold`, supportsCollapse(type));
}
ok('the section title has no card to fold', !supportsCollapse('header'));
eq('exactly the section title is excluded', [...COLLAPSE_EXCLUDED_TYPES], ['header']);

// ── 2. The option has to be set explicitly, and only the frontend folds ──
const fe = { editMode: false };
ok('off without options', !collapsibleWidget('value', undefined, fe));
ok('off with an empty options object', !collapsibleWidget('value', {}, fe));
ok('on with defaultCollapsed: true', collapsibleWidget('value', { defaultCollapsed: true }, fe));
ok('a string "true" does not count', !collapsibleWidget('value', { defaultCollapsed: 'true' }, fe));
ok('not in the editor by itself', !collapsibleWidget('value', { defaultCollapsed: true }, { editMode: true }));
ok(
    'in the editor once the widget opts in',
    collapsibleWidget('value', { defaultCollapsed: true, collapseInEditor: true }, { editMode: true }),
);
ok(
    'collapseInEditor alone does nothing',
    !collapsibleWidget('value', { collapseInEditor: true }, { editMode: true }) &&
        !collapsibleWidget('value', { collapseInEditor: true }, { editMode: false }),
);
ok(
    'the editor opt-in does not override the group-child rule',
    !collapsibleWidget('value', { defaultCollapsed: true, collapseInEditor: true }, { editMode: true, inGroup: true }),
);
ok(
    'a group may fold in the editor too',
    collapsibleWidget('group', { defaultCollapsed: true, collapseInEditor: true }, { editMode: true }),
);
ok('never as a group child', !collapsibleWidget('value', { defaultCollapsed: true }, { ...fe, inGroup: true }));
ok(
    'never inside the fullscreen overlay',
    !collapsibleWidget('value', { defaultCollapsed: true }, { ...fe, fullscreen: true }),
);
ok('never in a measurement probe', !collapsibleWidget('value', { defaultCollapsed: true }, { ...fe, probe: true }));
ok('never for a tab-filling widget', !collapsibleWidget('value', { defaultCollapsed: true, fillTab: true }, fe));
ok('never for the section title', !collapsibleWidget('header', { defaultCollapsed: true }, fe));
ok('a group folds too (its own header does the drawing)', collapsibleWidget('group', { defaultCollapsed: true }, fe));

// ── 3. Session state: absent = the configured default (collapsed) ──
ok('untouched -> collapsed', isCollapsedNow({}, 'a'));
ok('expanded by the user -> open', !isCollapsedNow({ a: false }, 'a'));
ok('folded again by the user -> collapsed', isCollapsedNow({ a: true }, 'a'));
ok("another widget's toggle does not leak", isCollapsedNow({ b: false }, 'a'));

// ── 4. Rows of the folded card: header + slim padding + border, rounded up ──
eq('the folded card pads like a group header', COLLAPSED_PAD_Y, 10);
eq('the folded card never follows the widget padding', collapsedPadY(), 10);
// A dense board (small row/gap and little widget padding) used to fold the card onto
// the bare text row, so the 28 px corner buttons hung out of it (#676 follow-up).
eq('the corner buttons set the floor', COLLAPSED_MIN_PX, 40);
eq('20px header, default grid: two rows like a folded group', collapsedRows(20, collapsedPadY(), 20, 10), 2); // 42 + 10 = 52 / 30
eq('20px header with the full padding would need three', collapsedRows(20, 16, 20, 10), 3); // 54 + 10 = 64 / 30
eq('a dense grid keeps room for the corner buttons', collapsedRows(20, collapsedPadY(), 10, 4), 4); // 42 -> 46 / 14
eq('a padding-less card is floored, not flattened', collapsedRows(20, 0, 10, 4), 4); // 22 -> 40, 44 / 14
eq('37px header on a 40px grid', collapsedRows(37, 16, 40, 10), 2); // 71 + 10 = 81 / 50
eq('an unmeasured header still clears the buttons', collapsedRows(0, 0, 20, 10), 2); // 40 + 10 = 50 / 30
eq('never below one row', collapsedRows(0, 0, 80, 10), 1);
eq('the floor tips a full row over', collapsedRows(28, 0, 20, 10), 2); // 40 + 10 = 50 / 30
ok('fallback header is a sane single line', COLLAPSED_HEADER_FALLBACK_PX >= 16 && COLLAPSED_HEADER_FALLBACK_PX <= 28);

// ── 5. Corner of the fold button ──
eq('default corner is top right', collapsePosition(undefined), 'tr');
eq('top left when configured', collapsePosition({ collapsePosition: 'tl' }), 'tl');
eq('bottom right when configured', collapsePosition({ collapsePosition: 'br' }), 'br');
eq('an unknown corner falls back', collapsePosition({ collapsePosition: 'xx' }), 'tr');

// ── 6. Corner ladder shared with the fullscreen button ──
eq('outermost top right', cornerInset('tr', 0), { top: 6, right: 6 });
eq('second slot top right', cornerInset('tr', 1), { top: 6, right: 38 });
eq('second slot top left steps inwards along the left edge', cornerInset('tl', 1), { top: 6, left: 38 });
eq('outermost bottom right', cornerInset('br', 0), { bottom: 6, right: 6 });
for (const pos of ['tr', 'tl', 'br']) {
    eq(`fullscreen button still outermost in ${pos}`, fullscreenButtonInset(pos), cornerInset(pos, 0));
}
const fe0 = { editMode: false, fullscreenSameCorner: false };
eq('fold button alone is outermost', collapseButtonSlot('tr', fe0), 0);
eq('fold button behind the fullscreen button', collapseButtonSlot('tr', { ...fe0, fullscreenSameCorner: true }), 1);
eq(
    'editor: top right steps past the two chrome buttons',
    collapseButtonSlot('tr', { editMode: true, fullscreenSameCorner: false }),
    2,
);
eq(
    'editor: bottom right steps past the resize handle',
    collapseButtonSlot('br', { editMode: true, fullscreenSameCorner: false }),
    1,
);
eq(
    'editor: top left has nothing to step past',
    collapseButtonSlot('tl', { editMode: true, fullscreenSameCorner: false }),
    0,
);

// ── 7. The click-action icon steps aside for the fold button ──
// Covered in click-action-icon-logic.mjs (clickActionIconSlot), which replaced the
// top-right-only actionButtonRight.

// ── Report ──
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : ` - ${r.detail}`}`);
console.log(`\nwidget-collapse-logic: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
