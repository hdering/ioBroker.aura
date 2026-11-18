// The web component catalog after an ioBroker restart or an adapter update: a
// catalog read too early (a manifest not uploaded yet) is short, and must not stay
// that way until the page is reloaded.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/web-component-catalog-ui.mjs
//
// - short catalog: the manifest answers 404 at first; the widget shows the
//   component after the retry (SHORT_CATALOG_RETRY_MS, 10 s) without a reload
// - reconnect: after a connection drop the catalog is read once more
//
// The component is served by the browser itself (page.route) and the instance list
// is mocked with __auraShot.mockObjectView, so no adapter and no ioBroker are needed.
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { join } from 'node:path';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

let failed = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const bundled = await build({
    entryPoints: [join(process.cwd(), 'tools/tests/fixtures/web-components/aura-dialog-demo.js')],
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'warning',
});
const moduleJs = bundled.outputFiles[0].text;
const manifest = {
    manifestVersion: 1,
    tag: 'aura-dialog-demo',
    name: { en: 'Dialog demo', de: 'Dialog-Demo' },
    module: 'aura-dialog-demo.js',
    size: { width: 220, height: 140 },
    settings: { type: 'panel', items: {} },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
if (process.env.DEBUG) page.on('console', (m) => console.log('[page]', m.type(), m.text().slice(0, 300)));

// the upload is "still running": the manifest is missing until `uploaded`
let uploaded = false;
let manifestReads = 0;
await page.route('**/adapter/aura-demo/webcomponents/**', (route) => {
    const url = route.request().url();
    if (url.includes('.json')) {
        manifestReads++;
        if (!uploaded) return route.fulfill({ status: 404, body: 'not found' });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(manifest) });
    }
    return route.fulfill({ contentType: 'text/javascript', body: moduleJs });
});

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => {
    const shot = window.__auraShot;
    shot.mockObject({ 'system.config': { _id: 'system.config', type: 'config', common: { language: 'de' } } });
    shot.mockObjectView({
        instance: [
            {
                id: 'system.adapter.aura-demo.0',
                value: {
                    _id: 'system.adapter.aura-demo.0',
                    common: { version: '1.0.0', webComponents: ['webcomponents/aura-dialog-demo.json'] },
                },
            },
        ],
    });
    shot.showWidgets([
        {
            id: 'wc-catalog',
            type: 'webcomponent',
            title: 'Demo',
            datapoint: '',
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            options: { wcTag: 'aura-dialog-demo', wcAdapter: 'aura-demo' },
        },
    ]);
});

const element = page.locator('aura-dialog-demo');
await page.waitForTimeout(2500);
check('short catalog: the manifest was asked for', manifestReads >= 1, `reads ${manifestReads}`);
check('short catalog: no element yet', (await element.count()) === 0);

// ── the upload finishes: the retry picks the component up, no reload ─────────
uploaded = true;
const readsBefore = manifestReads;
const appeared = await element.waitFor({ timeout: 15000 }).then(
    () => true,
    () => false,
);
check('retry: the component appears without a reload', appeared, `reads ${readsBefore} -> ${manifestReads}`);

// a complete catalog is not read again on its own
await page.waitForTimeout(11000);
const settled = manifestReads;
await page.waitForTimeout(11000);
check('complete catalog: no further reads', manifestReads === settled, `reads ${settled} -> ${manifestReads}`);

// ── reconnect: read once more ──────────────────────────────────────────────
await page.evaluate(() => {
    const shot = window.__auraShot;
    shot.simulateReconnect({}); // the first connect, if the dev server has no ioBroker
    shot.simulateDisconnect();
    shot.simulateReconnect({});
});
await page.waitForTimeout(1500);
check('reconnect: the catalog is read again', manifestReads > settled, `reads ${settled} -> ${manifestReads}`);
check('reconnect: the component is still shown', (await element.count()) === 1);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
