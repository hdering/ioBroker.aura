// Custom CSS in the dashboard editor (issue #710): with "also apply in the dashboard
// editor" on, the CSS may style the preview only, never the admin UI around it.
//
//   node tools/tests/custom-css-scope.mjs
//
// No dev server needed - utils/scopeCss.ts is pure and bundled with esbuild; the
// browser half renders the scoped output in a static page with Chromium.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-custom-css-scope-${process.pid}.mjs`);
await build({
    entryPoints: ['src-vis/utils/scopeCss.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { scopeCss, scopeSelector } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
function check(name, actual, expected) {
    const ok = actual === expected;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got:      ${actual}\n     expected: ${expected}`}`);
}

// ── Selector rewrite ─────────────────────────────────────────────────────────
check('body', scopeSelector('body'), 'body :scope');
check(':root', scopeSelector(':root'), ':root :scope');
check('body descendant', scopeSelector('body .x'), 'body :scope .x');
check('body child', scopeSelector('body > .x'), 'body :scope > .x');
check('html body chain', scopeSelector('html body .x'), 'html body :scope .x');
check('qualified body', scopeSelector('body.dark .x'), 'body.dark :scope .x');
check('plain selector untouched', scopeSelector('.aura-widget h2'), '.aura-widget h2');
check('.body class untouched', scopeSelector('.body'), '.body');
check('tbody untouched', scopeSelector('tbody td'), 'tbody td');
check('list', scopeSelector('body, .a, :root'), 'body :scope, .a, :root :scope');
check('comma in :is() kept', scopeSelector(':is(.a, .b) p'), ':is(.a, .b) p');

// ── Stylesheet ───────────────────────────────────────────────────────────────
const issueCss = `@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@200..700&display=swap');
body {
  font-family: 'Oswald';
  font-weight: 300;
}`;
const scoped = scopeCss(issueCss, '[data-aura-css-scope]');
check(
    '@import hoisted first',
    scoped.startsWith("@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@200..700&display=swap');"),
    true,
);
check('body rule inside @scope', /@scope \(\[data-aura-css-scope\]\) \{\s*body :scope \{/.test(scoped), true);
check('empty css', scopeCss('   ', '[x]'), '');
const nested = scopeCss(
    '/* c { } */ @media (max-width: 600px) { body { color: red } } @keyframes k { from { opacity: 0 } }',
    '[x]',
);
check('keyframes hoisted', nested.startsWith('@keyframes k {'), true);
check('media recursed', /@media \(max-width: 600px\) \{\s*body :scope \{/.test(nested), true);
check('comment dropped', nested.includes('/*'), false);
check(
    'brace in string',
    scopeCss('.a::after { content: "}" } .b { color: red }', '[x]').includes('.b { color: red }'),
    true,
);

// ── Browser: admin UI keeps its font, the preview gets the custom one ────────
const css = scopeCss(
    `body { font-family: monospace; } :root { --probe: 7px; } .w { padding-left: var(--probe); }
     body.dark .w { color: rgb(1, 2, 3); }`,
    '[data-aura-css-scope]',
);
const browser = await chromium.launch();
try {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html><head><style>body { font-family: serif; }</style>
        <style>${css}</style></head><body class="dark">
        <nav id="admin">admin menu</nav>
        <div data-aura-css-scope id="scope"><div class="w" id="w">widget</div></div>
        <div class="w" id="outside">admin widget-like</div></body></html>`);
    const r = await page.evaluate(() => {
        const cs = (id) => getComputedStyle(document.getElementById(id));
        return {
            admin: cs('admin').fontFamily,
            scope: cs('scope').fontFamily,
            widget: cs('w').fontFamily,
            pad: cs('w').paddingLeft,
            color: cs('w').color,
            outsidePad: cs('outside').paddingLeft,
        };
    });
    check('browser: admin menu font untouched', r.admin, 'serif');
    check('browser: scope root gets body font', r.scope, 'monospace');
    check('browser: widget inherits it', r.widget, 'monospace');
    check('browser: :root var reaches widget', r.pad, '7px');
    check('browser: body.dark condition kept', r.color, 'rgb(1, 2, 3)');
    check('browser: rule does not leak outside', r.outsidePad, '0px');
} finally {
    await browser.close();
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
