// Dynamische Liste / Liste (#888): the name pattern resolves {{dpname}}, {{parentname}},
// {{parent2name}} to the common.name of the row's datapoint and the objects above it.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5197
//   AURA_BASE=http://localhost:5197 node tools/tests/list-name-tokens.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });

const mock = { 'test.dev.a.1.STATE': { val: true }, 'test.dev.b.1.STATE': { val: false } };
await page.evaluate((m) => {
    window.__auraShot.mockServerState(m);
    window.__auraShot.mock(m);
    // Row a has named objects (the channel with a translated name), row b none.
    window.__auraShot.mockObject({
        'test.dev.a.1.STATE': { _id: 'test.dev.a.1.STATE', type: 'state', common: { name: 'Schaltzustand' } },
        'test.dev.a.1': {
            _id: 'test.dev.a.1',
            type: 'channel',
            common: { name: { de: 'Kanal Eins', en: 'Channel one' } },
        },
        'test.dev.a': { _id: 'test.dev.a', type: 'device', common: { name: 'Steckdose Küche' } },
        'test.dev.b.1.STATE': { _id: 'test.dev.b.1.STATE', type: 'state', common: {} },
        'test.dev.b.1': { _id: 'test.dev.b.1', type: 'channel', common: {} },
        'test.dev.b': { _id: 'test.dev.b', type: 'device', common: {} },
    });
}, mock);

const PATTERN = '{{parent2name}} / {{parentname}} / {{dpname}}';
const entries = [{ id: 'test.dev.a.1.STATE' }, { id: 'test.dev.b.1.STATE' }];
const widgets = [
    {
        id: 'w-autolist',
        type: 'autolist',
        title: 'Dyn',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 8, h: 6 },
        options: { entries, namePattern: PATTERN },
    },
    {
        id: 'w-list',
        type: 'list',
        title: 'Stat',
        datapoint: '',
        gridPos: { x: 8, y: 0, w: 8, h: 6 },
        options: { entries, namePattern: PATTERN },
    },
];
await page.evaluate((ws) => window.__auraShot.showWidgets(ws), widgets);
await page.waitForTimeout(1500);

const text = (id) => page.evaluate((wid) => document.querySelector(`[data-aura-widget="${wid}"]`)?.innerText ?? '', id);

for (const id of ['w-autolist', 'w-list']) {
    const t = await text(id);
    check(
        `${id}: names from the objects, translated name in the UI language`,
        t.includes('Steckdose Küche / Kanal Eins / Schaltzustand'),
        t.replace(/\s+/g, ' '),
    );
    check(`${id}: no name → the placeholder stays visible`, t.includes('{{parent2name}}'), '');
}
await page.screenshot({ path: 'node_modules/.cache/list-name-tokens.png' });

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
