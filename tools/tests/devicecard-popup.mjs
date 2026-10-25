// Gerätekarte + "Popup: Widget-Inhalt" (#845): the popup shows the child resolved
// against the card's datapoint, like the card body — not the raw `{{parent}}`.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5197
//   AURA_BASE=http://localhost:5197 node tools/tests/devicecard-popup.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DEF = 'def-card-845';

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

const mock = {
    'test.dev.a.1.STATE': { val: true },
    'test.dev.a.1.TEMP': { val: 21.4, unit: '°C' },
    'test.dev.b.1.STATE': { val: true },
    'test.dev.b.1.TEMP': { val: 37.6, unit: '°C' },
};
await page.evaluate((m) => {
    window.__auraShot.mockServerState(m);
    window.__auraShot.mock(m);
}, mock);

const cards = ['a', 'b'].map((c, i) => ({
    id: `w-card-${c}`,
    type: 'devicecard',
    title: 'Gerät',
    datapoint: `test.dev.${c}.1.STATE`,
    gridPos: { x: i * 10, y: 0, w: 10, h: 6 },
    options: { defId: DEF },
}));
const children = [
    {
        id: 'child-temp',
        type: 'value',
        title: 'Temp',
        datapoint: '{{parent}}.TEMP',
        gridPos: { x: 0, y: 0, w: 10, h: 3 },
        options: { decimals: 1, clickAction: { kind: 'popup-widget' } },
    },
];
await page.evaluate(
    ([c, kids, def]) => {
        window.__auraShot.groupDefs({ [def]: kids });
        window.__auraShot.showWidgets(c, { editMode: false });
    },
    [cards, children, DEF],
);
await page.waitForTimeout(1200);

for (const [c, want, other] of [
    ['a', '21.4', '37.6'],
    ['b', '37.6', '21.4'],
]) {
    await page.locator(`[data-aura-widget="w-card-${c}"] .aura-widget-child-temp`).click();
    const popup = page.locator('[data-aura-click-popup="popup-widget"]');
    await popup.waitFor({ timeout: 5000 });
    await page.waitForTimeout(400);
    const text = await popup.innerText();
    check(`card ${c}: popup shows its own device's value`, text.includes(want), JSON.stringify(text));
    check(`card ${c}: popup does not show the other device`, !text.includes(other), JSON.stringify(text));
    await page.screenshot({ path: `node_modules/.cache/devicecard-popup-${c}.png` });
    await page.keyboard.press('Escape');
    await popup.waitFor({ state: 'detached', timeout: 5000 });
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
