// The value of a web component bound to a datapoint (wcValueDp) in the dashboard: a
// test component (fixtures/web-components/aura-value-demo.js, bundled here with the
// base class of the package) shows its value as a list and adds an entry with
// changeValue(). The JSON state arrives as an array, the change is written back as
// JSON text, the own echo does not reset the element, an outside change does, and in
// edit mode or on a read-only state nothing is written.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/web-component-value-ui.mjs
//   SHOTS=<folder> node tools/tests/web-component-value-ui.mjs   - also save screenshots
//
// The component is served by the browser itself (page.route), so no adapter and no
// ioBroker are needed: the instance list is mocked with __auraShot.mockObjectView.
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { join } from 'node:path';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOTS = process.env.SHOTS;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const bundled = await build({
    entryPoints: [join(process.cwd(), 'tools/tests/fixtures/web-components/aura-value-demo.js')],
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'warning',
});
const moduleJs = bundled.outputFiles[0].text;
const manifest = {
    manifestVersion: 1,
    tag: 'aura-value-demo',
    name: { en: 'Value demo', de: 'Wert-Demo' },
    module: 'aura-value-demo.js',
    editsValue: true,
    settings: { type: 'panel', items: {} },
};

// a second component that does not declare editsValue: no value field in its settings
const plainManifest = {
    manifestVersion: 1,
    tag: 'aura-plain-demo',
    name: { en: 'Plain demo', de: 'Einfache Demo' },
    module: 'aura-plain-demo.js',
    settings: { type: 'panel', items: {} },
};
const plainJs = "customElements.get('aura-plain-demo') || customElements.define('aura-plain-demo', class extends HTMLElement {});";

const LIST = 'demo.wc.list';
const RO = 'demo.wc.readonly';
const widget = (id, dp, y, tag = 'aura-value-demo') => ({
    id,
    type: 'webcomponent',
    title: id,
    datapoint: '',
    gridPos: { x: 0, y, w: 12, h: 6 },
    options: { wcTag: tag, wcAdapter: 'aura-demo', ...(dp ? { wcValueDp: dp } : {}) },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/adapter/aura-demo/webcomponents/**', (route) => {
    const url = route.request().url().split('?')[0];
    if (url.endsWith('.json')) {
        const body = url.includes('aura-plain-demo') ? plainManifest : manifest;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.fulfill({
        contentType: 'text/javascript',
        body: url.includes('aura-plain-demo') ? plainJs : moduleJs,
    });
});
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(
    ({ list, ro, widgets }) => {
        const shot = window.__auraShot;
        shot.mockObject({
            'system.config': { _id: 'system.config', type: 'config', common: { language: 'de' } },
            [list]: { _id: list, type: 'state', common: { name: 'List', type: 'json', write: true } },
            [ro]: { _id: ro, type: 'state', common: { name: 'Read only', type: 'json', write: false } },
        });
        shot.mock({ [list]: '[1,2]', [ro]: '["x"]' });
        shot.mockServerState({ [list]: '[1,2]', [ro]: '["x"]' });
        shot.mockObjectView({
            instance: [
                {
                    id: 'system.adapter.aura-demo.0',
                    value: {
                        _id: 'system.adapter.aura-demo.0',
                        common: {
                            version: '1.0.0',
                            webComponents: ['webcomponents/aura-value-demo.json', 'webcomponents/aura-plain-demo.json'],
                        },
                    },
                },
            ],
        });
        shot.captureWrites(true);
        shot.showWidgets(widgets);
    },
    {
        list: LIST,
        ro: RO,
        widgets: [
            widget('wc-list', LIST, 0),
            widget('wc-ro', RO, 7),
            widget('wc-plain', undefined, 14, 'aura-plain-demo'),
            widget('wc-plain-bound', LIST, 21, 'aura-plain-demo'),
        ],
    },
);
const list = page.locator('aura-value-demo').nth(0);
const ro = page.locator('aura-value-demo').nth(1);
await list.locator('button#add').waitFor({ timeout: 15000 });
// without ioBroker behind the dev server the socket never connects, and the widget
// hooks subscribe only while connected: play a connect, so mocked changes arrive live
await page.evaluate(() => window.__auraShot.simulateReconnect({}));
await page.waitForTimeout(300);
const valueOf = (loc) => loc.evaluate((e) => e.value);
const writes = () => page.evaluate(() => window.__auraShot.writes());

eq('state -> element: JSON text arrives as an array', await valueOf(list), [1, 2]);
eq('state -> element: also for the read-only state', await valueOf(ro), ['x']);
if (SHOTS) await page.screenshot({ path: join(SHOTS, 'wc-value.png') });

// element -> state
await list.evaluate((e) => (window.__before = e));
await list.locator('button#add').click();
await page.waitForTimeout(400);
eq('change: the host took it (preventDefault)', await list.evaluate((e) => e.lastTaken), true);
eq(
    'change: written as JSON text',
    (await writes()).filter((w) => w.id === LIST),
    [{ id: LIST, val: '[1,2,3]' }],
);
eq('change: the element holds the new value', await valueOf(list), [1, 2, 3]);
check(
    'echo: the element keeps its own array (not reset with a parsed copy)',
    await list.evaluate((e) => {
        const kept = e.value;
        return new Promise((resolve) => setTimeout(() => resolve(e.value === kept), 300));
    }),
);

// a late echo of an older own write must not reset the element
await list.evaluate((e) => (window.__keep = e.value));
await page.evaluate((id) => window.__auraShot.mock({ [id]: '[1,2,3]' }), LIST);
await page.waitForTimeout(200);
check(
    'echo: the server echo of the own write leaves the element alone',
    await list.evaluate((e) => e.value === window.__keep),
);

// an outside change reaches the element
await page.evaluate((id) => window.__auraShot.mock({ [id]: '[7,8]' }), LIST);
await page.waitForTimeout(200);
eq('outside change: reaches the element', await valueOf(list), [7, 8]);

// two quick changes, then the server's late echo of the first one
await list.locator('button#add').click();
await list.locator('button#add').click();
await page.waitForTimeout(200);
eq('two changes: the element holds the second', await valueOf(list), [7, 8, 3, 4]);
await page.evaluate((id) => window.__auraShot.mock({ [id]: '[7,8,3]' }), LIST);
await page.waitForTimeout(200);
eq('two changes: the late echo of the first does not reset it', await valueOf(list), [7, 8, 3, 4]);
eq(
    'two changes: both written',
    (await writes()).filter((w) => w.id === LIST).map((w) => w.val),
    ['[1,2,3]', '[7,8,3]', '[7,8,3,4]'],
);

// read-only state: the event is left alone, nothing written
await ro.locator('button#add').click();
await page.waitForTimeout(300);
eq('read-only: the host does not take it', await ro.evaluate((e) => e.lastTaken), false);
eq(
    'read-only: nothing written',
    (await writes()).filter((w) => w.id === RO),
    [],
);
eq('read-only: the value stays', await valueOf(ro), ['x']);

// edit mode: nothing written, also for an event a component sends without the base class
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(400);
const before = (await writes()).length;
const prevented = await list.evaluate(
    (e) =>
        !e.dispatchEvent(
            new CustomEvent('iob-change', { detail: [0], bubbles: true, composed: true, cancelable: true }),
        ),
);
await page.waitForTimeout(200);
eq('edit mode: the event is not taken', prevented, false);
eq('edit mode: nothing written', (await writes()).length, before);

// the field in the settings of the widget
await page.evaluate(() => window.__auraShot.unfoldSections());
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await page.waitForTimeout(300);
const field = dlg.locator('[data-field="wcValueDp"] input');
eq('settings: the value datapoint is shown', await field.inputValue(), LIST);
if (SHOTS) await dlg.screenshot({ path: join(SHOTS, 'wc-value-settings.png') });
await field.fill('');
await page.waitForTimeout(300);
const opts = await page.evaluate(() => window.__auraShot.widgetOptions('wc-list'));
check('settings: clearing it removes the option', opts && opts.wcValueDp === undefined, JSON.stringify(opts));
eq('settings: declared by the manifest, the empty field stays', await field.count(), 1);
await page.keyboard.press('Escape');
await dlg.waitFor({ state: 'hidden', timeout: 5000 });

const openSettings = async (index) => {
    await page.locator('.aura-edit-chrome').nth(index).locator('button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await dlg.waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
};
await openSettings(2);
eq('settings: not declared, no value field', await field.count(), 0);
await page.keyboard.press('Escape');
await dlg.waitFor({ state: 'hidden', timeout: 5000 });
await openSettings(3);
eq('settings: not declared but set, it can still be removed', await field.inputValue(), LIST);
await page.keyboard.press('Escape');
await dlg.waitFor({ state: 'hidden', timeout: 5000 });
await page.evaluate(() => window.__auraShot.setEditMode(false));
await page.waitForTimeout(400);
eq('unbound: the element has no value any more', await valueOf(list), undefined);

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
