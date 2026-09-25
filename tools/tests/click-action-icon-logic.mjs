// Rules of the click-action icon (issues #527, #702): when the frame shows it,
// which corner it takes and how it shares that corner with the fullscreen and fold
// buttons.
//
//   node tools/tests/click-action-icon-logic.mjs
//
// No dev server needed - utils/clickActionIcon.ts is pure logic and is bundled with
// esbuild. The rendered button is covered by click-action-icon.mjs.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-click-action-icon-logic-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export * from './src-vis/utils/clickActionIcon.ts'; export { cornerInset } from './src-vis/utils/fullscreenButton.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { clickActionIconEnabled, clickActionIconPosition, clickActionIconSlot, hasOwnClickAction, cornerInset } =
    await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });
const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

const OWN = { clickAction: { kind: 'popup-html', html: 'x' } };
const on = (options, ctx) => clickActionIconEnabled(options, { hasClickAction: true, embed: false, ...ctx });

// ── 1. Own vs. inherited action ──
ok('an own action counts', hasOwnClickAction(OWN));
ok("'none' is no action", !hasOwnClickAction({ clickAction: { kind: 'none' } }));
ok('no options, no action', !hasOwnClickAction(undefined));

// ── 2. When the icon shows ──
ok('own action: off by default', !on(OWN));
ok('own action: opt in', on({ ...OWN, clickActionIcon: true }));
ok('own action: switched off', !on({ ...OWN, clickActionIcon: false }));
// A type default (admin popup per type) resolves to an action without one being stored.
ok('type default: off by default', !on({}));
ok('type default: opt in', on({ clickActionIcon: true }));
ok(
    'no resolved action: never',
    !clickActionIconEnabled({ ...OWN, clickActionIcon: true }, { hasClickAction: false, embed: false }),
);
// An iframe body swallows the click — the button is the only way to the action.
ok('embed: always, even switched off', on({ clickActionIcon: false }, { embed: true }));
ok('embed without an action: never', !clickActionIconEnabled({}, { hasClickAction: false, embed: true }));

// ── 3. Corner ──
eq('default corner', clickActionIconPosition(undefined), 'tr');
eq('stored corner', clickActionIconPosition({ clickActionIconPosition: 'tl' }), 'tl');
eq('unknown corner falls back', clickActionIconPosition({ clickActionIconPosition: 'bl' }), 'tr');

// ── 4. Ladder: the icon is the innermost occupant ──
const none = { iframeOwnFullscreen: false, fullscreenSameCorner: false, collapseSameCorner: false };
eq('empty corner', clickActionIconSlot('tr', none), 0);
eq('beside the fullscreen button', clickActionIconSlot('tr', { ...none, fullscreenSameCorner: true }), 1);
eq('beside the fold button', clickActionIconSlot('br', { ...none, collapseSameCorner: true }), 1);
eq('beside both', clickActionIconSlot('tl', { ...none, fullscreenSameCorner: true, collapseSameCorner: true }), 2);
eq('beside the iframe fullscreen button', clickActionIconSlot('tr', { ...none, iframeOwnFullscreen: true }), 1);
eq('iframe button is top right only', clickActionIconSlot('tl', { ...none, iframeOwnFullscreen: true }), 0);
eq(
    'everything top right',
    clickActionIconSlot('tr', { iframeOwnFullscreen: true, fullscreenSameCorner: true, collapseSameCorner: true }),
    3,
);
// Same arithmetic as before the icon became general (issue #527 ladder).
eq('inset beside two buttons', cornerInset('tr', 2), { top: 6, right: 70 });

// ── 5. The schema tells a model about it ──
const schema = JSON.parse(readFileSync('public/ai/aura-widget-schema.json', 'utf8'));
for (const key of ['clickActionIcon', 'clickActionIconPosition', 'clickActionIconName']) {
    ok(`the schema describes ${key}`, !!schema.commonOptions?.[key]?.description);
}
eq('the schema offers the same corners', schema.commonOptions?.clickActionIconPosition?.enum ?? [], ['tr', 'tl', 'br']);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
console.log(`\nclick-action-icon-logic: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
