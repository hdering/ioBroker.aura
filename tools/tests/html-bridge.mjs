// Verifies where the HTML widget's `window.aura` script lands in the widget's own
// markup, and when it is injected at all (issue #649).
//
//   node tools/tests/html-bridge.mjs
//
// No dev server needed: injectBridge/sandboxAllowsScripts are pure, so the util is
// bundled with esbuild and exercised directly. The round trip through postMessage
// into a real frame is tools/tests/html-api.mjs.
//
// The interesting part is the insertion point: a <script> in front of a <!doctype>
// puts the frame into quirks mode, which silently changes every box in it.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-html-bridge-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { injectBridge, sandboxAllowsScripts } from './src-vis/utils/htmlBridge.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { injectBridge, sandboxAllowsScripts } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

// ── the script itself ─────────────────────────────────────────────────────────

const plain = injectBridge('<b>Hallo</b>');
check('bare markup: script comes first', plain.startsWith('<script>'), plain.slice(0, 40));
check('bare markup: markup survives', plain.endsWith('<b>Hallo</b>'), plain.slice(-40));
for (const method of ['setState', 'toggle', 'getState', 'subscribe', 'sendTo']) {
    check(`api exposes ${method}`, plain.includes(`${method}:function`));
}
check('api announces itself on load', plain.includes("method:'hello'"));
check('api talks to the host, not to a global', plain.includes('parent.postMessage'));
check('script tag is closed before the markup', /<\/script>\s*<b>/.test(plain));

// ── insertion point ───────────────────────────────────────────────────────────
// Quirks mode is the whole reason this is not a plain string concat.

const doc = injectBridge('<!DOCTYPE html><html><body>x</body></html>');
check('doctype stays in front', doc.toLowerCase().startsWith('<!doctype html>'), doc.slice(0, 40));
check('script follows the doctype', /<!DOCTYPE html><script>/i.test(doc), doc.slice(0, 60));

const withHead = injectBridge('<!DOCTYPE html><html><head><title>t</title></head><body>x</body></html>');
check('head wins over the doctype', /<head><script>/i.test(withHead), withHead.slice(0, 90));
check('head: doctype untouched', withHead.toLowerCase().startsWith('<!doctype html>'));
check('head: title still there', withHead.includes('<title>t</title>'));

const withHtmlOnly = injectBridge('<html><body>x</body></html>');
check('no doctype, no head: after <html>', /<html><script>/i.test(withHtmlOnly), withHtmlOnly.slice(0, 60));

const leading = injectBridge('\n  <!doctype html>\n<p>x</p>');
check('doctype with leading whitespace still wins', /<!doctype html><script>/i.test(leading), leading.slice(0, 60));

const attrs = injectBridge('<!DOCTYPE html><html lang="de"><head data-x="1"><meta charset="utf-8"></head><body>x');
check('head with attributes is found', /<head data-x="1"><script>/i.test(attrs), attrs.slice(0, 100));

const header = injectBridge('<header>oben</header><p>x</p>');
check('<header> is not <head>', header.startsWith('<script>'), header.slice(0, 40));

// A `<head` that is not the tag must not be mistaken for one.
const text = injectBridge('<p>Kopf &lt;head&gt; im Text</p>');
check('escaped text is not a head tag', text.startsWith('<script>'), text.slice(0, 40));

// ── when the injection happens at all ─────────────────────────────────────────

check('no sandbox: scripts run', sandboxAllowsScripts(undefined) === true);
check('standard preset: scripts run', sandboxAllowsScripts('allow-scripts allow-same-origin') === true);
check('minimal preset: scripts run', sandboxAllowsScripts('allow-scripts') === true);
check('custom without scripts: off', sandboxAllowsScripts('allow-forms allow-popups') === false);
check('empty custom sandbox: off', sandboxAllowsScripts('') === false);
// `allow-scripts-foo` is not `allow-scripts` — the flag list is exact, not a substring.
check('lookalike flag does not count', sandboxAllowsScripts('allow-scripts-x') === false);

// ── summary ───────────────────────────────────────────────────────────────────

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
