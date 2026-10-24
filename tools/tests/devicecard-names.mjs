// Gerätekarte (#841): {{dpname}}, {{parentname}}, {{parent2name}} resolve to the
// common.name of the card's datapoint and the objects above it.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5197
//   AURA_BASE=http://localhost:5197 node tools/tests/devicecard-names.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DEF = 'def-card-841';

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
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.unfoldSections());

const mock = { 'test.dev.a.1.STATE': { val: true }, 'test.dev.b.1.STATE': { val: false } };
await page.evaluate((m) => {
    window.__auraShot.mockServerState(m);
    window.__auraShot.mock(m);
    // Card a has named objects (the channel with a translated name), card b none.
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

const card = (c, i) => ({
    id: `w-card-${c}`,
    type: 'devicecard',
    title: '{{parent2name}}',
    datapoint: `test.dev.${c}.1.STATE`,
    gridPos: { x: i * 10, y: 0, w: 10, h: 6 },
    options: { defId: DEF },
});
const children = [
    {
        id: 'child-state',
        type: 'value',
        title: '{{dpname}} / {{parentname}}',
        datapoint: '{{dp}}',
        gridPos: { x: 0, y: 0, w: 10, h: 3 },
        options: {},
    },
];

async function show(editMode) {
    await page.evaluate(
        ([cards, kids, def, edit]) => {
            window.__auraShot.groupDefs({ [def]: kids });
            window.__auraShot.showWidgets(cards, { editMode: edit });
        },
        [['a', 'b'].map(card), children, DEF, editMode],
    );
    await page.waitForTimeout(1200);
}

const cardText = (c) =>
    page.evaluate((cid) => document.querySelector(`[data-aura-widget="w-card-${cid}"]`)?.innerText ?? '', c);

await show(false);
const a = await cardText('a');
check('card title: {{parent2name}} is the device name', a.includes('Steckdose Küche'), a);
check('child title: {{dpname}} is the datapoint name', a.includes('Schaltzustand'), a);
check('child title: {{parentname}} picks the UI language of a translated name', a.includes('Kanal Eins'), a);
const b = await cardText('b');
check('no name: the placeholder stays visible', b.includes('{{dpname}}'), b);
await page.screenshot({ path: 'node_modules/.cache/devicecard-names.png' });

// ── config panel lists the name tokens ───────────────────────────────────────
await show(true);
await page.locator('[data-aura-widget="w-card-a"]').hover({ position: { x: 20, y: 10 } });
const chrome = await page.evaluateHandle(() => {
    const frame = document.querySelector('.aura-widget-w-card-a');
    const c = [...frame.querySelectorAll('.aura-edit-chrome')].find((x) => x.closest('.aura-widget') === frame);
    return c?.querySelector('button[title="Widget-Optionen"]');
});
await chrome.asElement().click({ force: true });
await page.locator('button:text-is("Bearbeiten")').first().click();
await page.waitForTimeout(600);
const tokens = (await page.locator('[data-aura-devicecard-tokens]').innerText()).replace(/\s+/g, ' ');
check('config: token table shows {{parentname}}', tokens.includes('{{parentname}} Kanal Eins'), tokens);
check('config: token table shows {{parent2name}}', tokens.includes('{{parent2name}} Steckdose Küche'), tokens);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
