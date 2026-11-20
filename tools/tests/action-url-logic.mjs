// Datapoint placeholders in the URL of a click action (issue #1006):
// `http://{dp}/` takes the clicked row's (or widget's) value, `{adapter.0.id}` any
// other datapoint; a missing scheme becomes http://, only http(s) may come out.
//
//   node tools/tests/action-url-logic.mjs
//
// No dev server needed - utils/actionUrl.ts is pure logic and is bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-action-url-logic-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/actionUrl.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { resolveActionUrl, hasUrlPlaceholders, urlTemplateRefs } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });

const states = {
    'list.0.ip': '192.168.1.5',
    'list.0.host': 'fritz.box:8080',
    'list.0.full': 'https://router.local/admin',
    'list.0.evil': 'javascript:alert(1)',
    'list.0.empty': '',
    'list.0.json': '{"ip":"10.0.0.7"}',
    'other.0.port': 8443,
};
const read = (id) => states[id];
const r = (url, dp) => resolveActionUrl(url, dp, read);

// ── 1. Without placeholders nothing changes ──
eq('plain URL untouched', r('https://example.com/x', 'list.0.ip'), 'https://example.com/x');
eq('relative URL untouched', r('/webfs/x.html', undefined), '/webfs/x.html');
eq('no placeholder detected', hasUrlPlaceholders('https://example.com'), false);

// ── 2. {dp} = own datapoint ──
eq('IP into a template', r('http://{dp}/', 'list.0.ip'), 'http://192.168.1.5/');
eq('bare {dp} gets http://', r('{dp}', 'list.0.ip'), 'http://192.168.1.5/');
eq('host:port without scheme', r('{dp}', 'list.0.host'), 'http://fritz.box:8080/');
eq('whole URL in the datapoint', r('{dp}', 'list.0.full'), 'https://router.local/admin');
eq('JSON path on {dp}', r('http://{dp}#ip/', 'list.0.json'), 'http://10.0.0.7/');

// ── 3. Foreign datapoints ──
eq('foreign datapoint', r('https://{dp}:{other.0.port}/', 'list.0.ip'), 'https://192.168.1.5:8443/');
eq('refs incl. own dp', urlTemplateRefs('http://{dp}:{other.0.port}', 'list.0.ip').sort(), [
    'list.0.ip',
    'other.0.port',
]);

// ── 4. Nothing to open ──
eq('empty value', r('http://{dp}/', 'list.0.empty'), null);
eq('unknown datapoint', r('http://{nope.0.x}/', undefined), null);
eq('{dp} without a datapoint', r('http://{dp}/', undefined), null);

// ── 5. Only http(s) out of a placeholder ──
const evil = r('{dp}', 'list.0.evil');
eq('javascript: never comes out', evil === null || /^https?:/.test(evil), true);
eq('ftp scheme rejected', resolveActionUrl('ftp://{dp}/', 'list.0.ip', read), null);

const failed = results.filter((x) => !x.ok);
for (const x of results) {
    console.log(`${x.ok ? '  ✓' : '  ✗'} ${x.name}${x.ok ? '' : ` — ${x.detail}`}`);
}
console.log(`\naction-url-logic: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
