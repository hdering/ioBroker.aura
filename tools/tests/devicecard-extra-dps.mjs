// Gerätekarte (#1007): further datapoints of a card - `options.extraDps` with a short
// name each, resolved as {{aussen}}, {{aussen_parent}}, {{aussen_dpname}} … per card.
// The config panel lists the rows, flags reserved names and offers the short names
// of linked cards as empty rows.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5197
//   AURA_BASE=http://localhost:5197 node tools/tests/devicecard-extra-dps.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DEF = 'def-card-1007';

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

const mock = {
    'test.dev.a.1.STATE': { val: 701 },
    'test.dev.b.1.STATE': { val: 702 },
    'test.dev.c.1.STATE': { val: 703 },
    'test.out.x.1.TEMP': { val: 811 },
    'test.out.y.1.TEMP': { val: 822 },
};
await page.evaluate((m) => {
    window.__auraShot.mockServerState(m);
    window.__auraShot.mock(m);
    window.__auraShot.mockObject({
        'test.out.x.1.TEMP': { _id: 'test.out.x.1.TEMP', type: 'state', common: { name: 'Fuehler Nord' } },
        'test.out.x.1': { _id: 'test.out.x.1', type: 'channel', common: { name: 'Kanal Nord' } },
        'test.out.y.1.TEMP': { _id: 'test.out.y.1.TEMP', type: 'state', common: { name: 'Fuehler Sued' } },
        'test.out.y.1': { _id: 'test.out.y.1', type: 'channel', common: { name: 'Kanal Sued' } },
    });
}, mock);

const card = (c, i, extra) => ({
    id: `w-card-${c}`,
    type: 'devicecard',
    title: `Karte ${c}`,
    datapoint: `test.dev.${c}.1.STATE`,
    gridPos: { x: i * 10, y: 0, w: 10, h: 8 },
    options: { defId: DEF, ...(extra ? { extraDps: [{ key: 'aussen', dp: extra }] } : {}) },
});
const cards = [card('a', 0, 'test.out.x.1.TEMP'), card('b', 1, 'test.out.y.1.TEMP'), card('c', 2, null)];
const children = [
    {
        id: 'child-own',
        type: 'value',
        title: 'Eigen',
        datapoint: '{{dp}}',
        gridPos: { x: 0, y: 0, w: 10, h: 3 },
        options: {},
    },
    {
        id: 'child-out',
        type: 'value',
        title: '{{aussen_dpname}} / {{aussen_parentname}} / {{aussen_name}}',
        datapoint: '{{aussen}}',
        gridPos: { x: 0, y: 3, w: 10, h: 3 },
        options: {},
    },
];

async function show(editMode) {
    await page.evaluate(
        ([cs, kids, def, edit]) => {
            window.__auraShot.groupDefs({ [def]: kids });
            window.__auraShot.showWidgets(cs, { editMode: edit });
        },
        [cards, children, DEF, editMode],
    );
    await page.waitForTimeout(1200);
}

const cardText = (c) =>
    page.evaluate((cid) => document.querySelector(`[data-aura-widget="w-card-${cid}"]`)?.innerText ?? '', c);

await show(false);
const a = await cardText('a');
const b = await cardText('b');
const c = await cardText('c');
check('card a: own datapoint', a.includes('701'), a);
check('card a: {{aussen}} reads its own extra datapoint', a.includes('811') && !a.includes('822'), a);
check('card a: {{aussen_dpname}} / {{aussen_parentname}} / {{aussen_name}}', a.includes('Fuehler Nord / Kanal Nord / TEMP'), a);
check('card b: {{aussen}} reads its own extra datapoint', b.includes('822') && !b.includes('811'), b);
check('card b: name tokens of its own extra datapoint', b.includes('Fuehler Sued'), b);
check('card c without extra datapoint: placeholder stays unresolved', c.includes('{{aussen_dpname}}'), c);
await page.screenshot({ path: 'node_modules/.cache/devicecard-extra-dps.png' });

// ── config panel ─────────────────────────────────────────────────────────────
async function openConfig(cid) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator(`[data-aura-widget="w-card-${cid}"]`).hover({ position: { x: 20, y: 10 } });
    const chrome = await page.evaluateHandle((id) => {
        const frame = document.querySelector(`.aura-widget-w-card-${id}`);
        const ch = [...frame.querySelectorAll('.aura-edit-chrome')].find((x) => x.closest('.aura-widget') === frame);
        return ch?.querySelector('button[title="Widget-Optionen"]');
    }, cid);
    await chrome.asElement().click({ force: true });
    await page.locator('button:text-is("Bearbeiten")').first().click();
    await page.waitForTimeout(600);
}

await show(true);
await openConfig('a');
const rowA = page.locator('[data-aura-devicecard-extra="aussen"]');
const tokA = (await rowA.locator('[data-aura-devicecard-extra-tokens]').innerText()).replace(/\s+/g, ' ');
check('config a: row "aussen" lists {{aussen}}', tokA.includes('{{aussen}} test.out.x.1.TEMP'), tokA);
check('config a: row lists {{aussen_parent}}', tokA.includes('{{aussen_parent}} test.out.x.1'), tokA);
check('config a: row lists {{aussen_dpname}}', tokA.includes('{{aussen_dpname}} Fuehler Nord'), tokA);

// A reserved short name is flagged.
await page.locator('[data-aura-devicecard-extra-add]').click();
await page.locator('[data-aura-devicecard-extra-key]').nth(1).fill('parent');
await page.waitForTimeout(200);
const extrasText = await page.locator('[data-aura-devicecard-extras]').innerText();
check('config a: reserved name "parent" is flagged', extrasText.includes('schon ein Platzhalter'), extrasText);
await page.locator('[data-aura-devicecard-extra-remove]').nth(1).click();
await page.waitForTimeout(200);
const optsA = await page.evaluate(() => window.__auraShot.widgetOptions('w-card-a'));
check(
    'config a: removing the row leaves one entry',
    JSON.stringify(optsA?.extraDps) === JSON.stringify([{ key: 'aussen', dp: 'test.out.x.1.TEMP' }]),
    JSON.stringify(optsA?.extraDps),
);

// Card c shares the layout but has no entry: the linked short name is offered empty.
await openConfig('c');
const rowC = page.locator('[data-aura-devicecard-extra="aussen"]');
check('config c: linked short name "aussen" is offered', (await rowC.count()) === 1);
const hintC = (await rowC.count()) ? await rowC.innerText() : '';
check('config c: row says it comes from a linked card', hintC.includes('verknüpften Karte'), hintC);
await rowC.locator('[data-aura-devicecard-extra-dp]').fill('test.out.y.1.TEMP');
await page.waitForTimeout(300);
const optsC = await page.evaluate(() => window.__auraShot.widgetOptions('w-card-c'));
check(
    'config c: filling it stores the entry on card c',
    JSON.stringify(optsC?.extraDps) === JSON.stringify([{ key: 'aussen', dp: 'test.out.y.1.TEMP' }]),
    JSON.stringify(optsC?.extraDps),
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
