// Settings of ioBroker web components whose options come from the adapter:
// `selectSendTo` and `autocompleteSendTo` of JSON-Config in the settings editor of
// the webcomponent widget. Aura asks the instance with sendTo (mocked here), asks
// again when the message or the instance changes, and shows a text field when it
// gets no list.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/web-component-send-to-ui.mjs
//   SHOTS=<folder> node tools/tests/web-component-send-to-ui.mjs   - also save a screenshot
//
// The component is served by the browser itself (page.route), so no adapter and no
// ioBroker are needed.
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

// any component will do - only its settings are looked at
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
    name: { en: 'Send to demo', de: 'SendTo-Demo' },
    module: 'aura-dialog-demo.js',
    size: { width: 220, height: 140 },
    settings: {
        type: 'panel',
        items: {
            lang: { type: 'text', label: 'Lang', default: 'de' },
            // no instance: the first instance of the adapter that brings the component
            location: {
                type: 'selectSendTo',
                label: 'Location',
                command: 'getLocations',
                jsonData: '{ "lang": "${data.lang}" }',
            },
            inst: { type: 'instance', label: 'Instance', adapter: 'aura-demo' },
            device: {
                type: 'autocompleteSendTo',
                label: 'Device',
                command: 'getDevices',
                instance: '${data.inst}',
                options: [{ value: 'none', label: 'None' }],
            },
            broken: { type: 'selectSendTo', label: 'Broken', command: 'broken' },
        },
    },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/adapter/aura-demo/webcomponents/**', (route) => {
    const url = route.request().url();
    if (new URL(url).pathname.endsWith('.json')) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(manifest) });
    }
    return route.fulfill({ contentType: 'text/javascript', body: moduleJs });
});
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => {
    const shot = window.__auraShot;
    shot.mockObject({ 'system.config': { _id: 'system.config', type: 'config', common: { language: 'de' } } });
    const instance = (id) => ({
        id: `system.adapter.${id}`,
        value: {
            _id: `system.adapter.${id}`,
            common: { version: '1.0.0', webComponents: ['webcomponents/aura-dialog-demo.json'] },
        },
    });
    shot.mockObjectView({ instance: [instance('aura-demo.0'), instance('aura-demo.1')] });
    shot.mockSendTo({
        getLocations: [
            { value: 'home', label: 'Zuhause' },
            { value: 'work', label: { en: 'Work', de: 'Arbeit' } },
        ],
        getDevices: ['lamp', { value: 'fan', label: 'Fan' }],
        broken: null,
    });
    shot.showWidgets([
        {
            id: 'wc-send-to',
            type: 'webcomponent',
            title: 'Send to demo',
            datapoint: '',
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            options: { wcTag: 'aura-dialog-demo', wcAdapter: 'aura-demo', wcSettings: { lang: 'de' } },
        },
    ]);
    shot.setEditMode(true);
});
const card = page.locator('[data-aura-widget="wc-send-to"]').first();
await card.waitFor({ timeout: 15000 });
await card.hover();
await card.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
const field = (key) => dlg.locator(`[data-wc-field="${key}"]`);
await field('location').waitFor({ state: 'attached', timeout: 15000 });
// the settings of the component are a folded section
await dlg.getByText('Einstellungen', { exact: true }).last().click();
await field('location').waitFor({ timeout: 5000 });

const calls = () => page.evaluate(() => window.__auraShot.sendToCalls());
const options = (key) =>
    field(key).evaluate((box) => {
        const list = box.querySelector('select') ?? box.querySelector('datalist');
        return list ? [...list.querySelectorAll('option')].map((o) => [o.value, o.textContent]) : null;
    });

// selectSendTo without instance: asks <adapter>.0 with the message of jsonData
await field('location').locator('select').waitFor({ timeout: 5000 });
eq('selectSendTo: the options of the answer, labels in the language', await options('location'), [
    ['', '–'],
    ['home', 'Zuhause'],
    ['work', 'Arbeit'],
]);
const first = (await calls()).find((c) => c.command === 'getLocations');
eq('selectSendTo: asks the first instance of the adapter with jsonData', first && [first.target, first.payload], [
    'aura-demo.0',
    { lang: 'de' },
]);
await field('location').locator('select').selectOption('work');
eq('selectSendTo: the value is chosen', await field('location').locator('select').inputValue(), 'work');

// the message changes: asked again
const before = (await calls()).filter((c) => c.command === 'getLocations').length;
await field('lang').locator('input').selectText();
await field('lang').locator('input').pressSequentially('en', { delay: 40 });
await page.waitForFunction(
    (n) => window.__auraShot.sendToCalls().filter((c) => c.command === 'getLocations').length > n,
    before,
    { timeout: 5000 },
);
const last = (await calls()).filter((c) => c.command === 'getLocations').at(-1);
eq('selectSendTo: asks again with the new message', last.payload, { lang: 'en' });
eq(
    'selectSendTo: once per change, not per key',
    (await calls()).filter((c) => c.command === 'getLocations').length,
    before + 1,
);
eq('selectSendTo: keeps the value', await field('location').locator('select').inputValue(), 'work');

// autocompleteSendTo with instance: ${data.inst} - nothing to ask before an instance is chosen
check('autocompleteSendTo: a text field without instance', (await field('device').locator('input').count()) === 1);
check(
    'autocompleteSendTo: says to choose an instance',
    (await field('device').textContent()).includes('Erst eine Instanz wählen'),
);
check('autocompleteSendTo: has not asked', !(await calls()).some((c) => c.command === 'getDevices'));
await field('inst').locator('select').selectOption('aura-demo.1');
await page.waitForFunction(() => window.__auraShot.sendToCalls().some((c) => c.command === 'getDevices'), null, {
    timeout: 5000,
});
eq(
    'autocompleteSendTo: asks the chosen instance',
    (await calls()).find((c) => c.command === 'getDevices').target,
    'aura-demo.1',
);
await field('device').locator('datalist').waitFor({ state: 'attached', timeout: 5000 });
eq('autocompleteSendTo: options of the manifest and of the answer', await options('device'), [
    ['none', 'None'],
    ['lamp', 'lamp'],
    ['fan', 'Fan'],
]);
await field('device').locator('input').fill('fan');
check('autocompleteSendTo: a value of the list', !(await field('device').textContent()).includes('nicht in der Liste'));
await field('device').locator('input').fill('heater');
check(
    'autocompleteSendTo: without freeSolo, a text not in the list is marked',
    (await field('device').textContent()).includes('„heater“ ist nicht in der Liste'),
);

// no list: a text field with the reason
await field('broken').locator('p').waitFor({ timeout: 5000 });
check('no answer: a text field', (await field('broken').locator('input').count()) === 1);
check(
    'no answer: says so',
    (await field('broken').textContent()).includes('Keine Liste von aura-demo.0'),
    await field('broken').textContent(),
);
await field('broken').locator('input').fill('manual');
eq('no answer: the value can be typed', await field('broken').locator('input').inputValue(), 'manual');

if (SHOTS) await dlg.screenshot({ path: join(SHOTS, 'wc-send-to.png') });
eq('no page errors', errors, []);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
