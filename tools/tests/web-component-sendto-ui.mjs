// Settings of type selectSendTo / autocompleteSendTo of an ioBroker web component (#975):
// the editor asks the adapter's instance with sendTo and shows the answer as the
// options; without an answer it keeps the text field. A change in alsoDependsOn asks
// again.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/web-component-sendto-ui.mjs
//
// The component is served by the browser itself (page.route), sendTo is answered by
// the harness (mockSendTo): no adapter, no ioBroker.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

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

const moduleJs = `
class AuraSendToDemo extends HTMLElement {
    set settings(v) { this.received = { ...(v || {}) }; this.textContent = JSON.stringify(this.received); }
}
customElements.get('aura-sendto-demo') || customElements.define('aura-sendto-demo', AuraSendToDemo);
`;
const manifest = {
    manifestVersion: 1,
    tag: 'aura-sendto-demo',
    name: { en: 'SendTo demo', de: 'SendTo-Demo' },
    module: 'aura-sendto-demo.js',
    size: { width: 220, height: 140 },
    settings: {
        type: 'panel',
        items: {
            region: { type: 'text', label: 'Region' },
            location: {
                type: 'selectSendTo',
                label: { en: 'Location', de: 'Ort' },
                command: 'getLocations',
                jsonData: '{ "region": "${data.region}" }',
                alsoDependsOn: ['region'],
            },
            camera: {
                type: 'autocompleteSendTo',
                label: { en: 'Camera', de: 'Kamera' },
                command: 'getCameras',
                instance: 'agent-dvr.1',
                options: [{ value: 'none', label: 'Keine' }],
            },
            broken: { type: 'selectSendTo', label: 'Broken', command: 'unknownCommand' },
        },
    },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/adapter/aura-demo/webcomponents/**', (route) => {
    const url = new URL(route.request().url()).pathname;
    if (url.endsWith('.json')) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(manifest) });
    }
    return route.fulfill({ contentType: 'text/javascript', body: moduleJs });
});
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
await page.evaluate(() => {
    const shot = window.__auraShot;
    shot.mockObject({ 'system.config': { _id: 'system.config', type: 'config', common: { language: 'de' } } });
    shot.mockObjectView({
        instance: [
            {
                id: 'system.adapter.aura-demo.0',
                value: {
                    _id: 'system.adapter.aura-demo.0',
                    common: { version: '1.0.0', webComponents: ['webcomponents/aura-sendto-demo.json'] },
                },
            },
        ],
    });
    shot.mockSendTo({
        getLocations: [
            { value: 'berlin', label: { en: 'Berlin', de: 'Berlin' } },
            { value: 'hilchenbach', label: 'Hilchenbach' },
        ],
        getCameras: [
            { value: 'cam1', label: 'Einfahrt' },
            { value: 'cam2', label: 'Garten' },
        ],
        unknownCommand: 'unknown command',
    });
    shot.showWidgets([
        {
            id: 'wc-sendto',
            type: 'webcomponent',
            title: 'Demo',
            datapoint: '',
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            options: {
                wcTag: 'aura-sendto-demo',
                wcAdapter: 'aura-demo',
                wcSettings: { region: 'nord', location: 'altena', broken: 'x' },
            },
        },
    ]);
});
await page.locator('aura-sendto-demo').waitFor({ state: 'attached', timeout: 15000 });

await page.evaluate(() => {
    window.__auraShot.unfoldSections();
    window.__auraShot.setEditMode(true);
});
const card = page.locator('[data-aura-widget="wc-sendto"]').first();
await card.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
const location = dlg.locator('[data-wc-field="location"] select');
await location.waitFor({ timeout: 10000 });
await dlg.locator('[data-wc-field="location"] [data-wc-sendto="ready"]').waitFor({ timeout: 10000 });

// ── selectSendTo ────────────────────────────────────────────────────────────
const calls = await page.evaluate(() => window.__auraShot.sendToCalls());
const loc = calls.filter((c) => c.command === 'getLocations');
eq('select: asks <adapter>.0 without instance', loc[0]?.target, 'aura-demo.0');
eq('select: message from jsonData', loc[0]?.payload, { region: 'nord' });
eq('select: options from the answer, the stored value kept', await location.locator('option').allTextContents(), [
    'altena (nicht in der Liste)',
    'Berlin',
    'Hilchenbach',
]);
await location.selectOption('hilchenbach');
let cfg = await page.evaluate(() => window.__auraShot.widgetConfig('wc-sendto'));
eq('select: choice stored', cfg?.options?.wcSettings?.location, 'hilchenbach');

// alsoDependsOn: a new region asks again
await dlg.locator('[data-wc-field="region"] input').fill('sued');
await page.waitForFunction(
    () => window.__auraShot.sendToCalls().filter((c) => c.command === 'getLocations').length >= 2,
    null,
    { timeout: 5000 },
);
const loc2 = (await page.evaluate(() => window.__auraShot.sendToCalls())).filter((c) => c.command === 'getLocations');
eq('select: region changed - asked again with it', loc2.at(-1)?.payload, { region: 'sued' });

// ── autocompleteSendTo ──────────────────────────────────────────────────────
const camField = dlg.locator('[data-wc-field="camera"] input');
await dlg.locator('[data-wc-field="camera"] [data-wc-sendto="ready"]').waitFor({ timeout: 10000 });
const cam = (await page.evaluate(() => window.__auraShot.sendToCalls())).find((c) => c.command === 'getCameras');
eq('autocomplete: asks the named instance', cam?.target, 'agent-dvr.1');
eq(
    'autocomplete: suggestions = answer + fixed options',
    await dlg.locator('[data-wc-field="camera"] datalist option').evaluateAll((os) => os.map((o) => o.value)),
    ['Einfahrt', 'Garten', 'Keine'],
);
await camField.fill('Garten');
cfg = await page.evaluate(() => window.__auraShot.widgetConfig('wc-sendto'));
eq('autocomplete: a label stores its value', cfg?.options?.wcSettings?.camera, 'cam2');
await camField.fill('Irgendwas');
cfg = await page.evaluate(() => window.__auraShot.widgetConfig('wc-sendto'));
eq('autocomplete: other text without freeSolo is not stored', cfg?.options?.wcSettings?.camera, 'cam2');
await camField.blur();
eq('autocomplete: leaving shows the stored label again', await camField.inputValue(), 'Garten');

// ── no answer: text field ───────────────────────────────────────────────────
const broken = dlg.locator('[data-wc-field="broken"]');
await page.waitForFunction(() => window.__auraShot.sendToCalls().some((c) => c.command === 'unknownCommand'), null, {
    timeout: 5000,
});
await page.waitForTimeout(200);
eq('no answer: no select', await broken.locator('select').count(), 0);
eq('no answer: text field with the value', await broken.locator('input[type="text"]').inputValue(), 'x');

eq('no page errors', errors, []);

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
