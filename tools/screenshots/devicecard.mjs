// Documentation screenshots for the Gerätekarte (#743).
// Output: docs/widgets/assets/geraetekarte/*.png
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5197
//   AURA_BASE=http://localhost:5197 node tools/screenshots/devicecard.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/geraetekarte';
mkdirSync(OUT, { recursive: true });

const ROOMS = [
    { id: 'bad', name: 'Bad', temp: 22.4, set: 23, win: false },
    { id: 'kueche', name: 'Küche', temp: 20.1, set: 21, win: true },
    { id: 'buero', name: 'Büro', temp: 21.3, set: 21, win: false },
];
const OTHER = { id: 'flur', name: 'Flur', temp: 18.6, set: 19, win: false };

const mock = {};
for (const r of [...ROOMS, OTHER]) {
    mock[`hm-rpc.0.${r.id}.1.ACTUAL_TEMPERATURE`] = { val: r.temp, unit: '°C' };
    mock[`hm-rpc.0.${r.id}.1.SET_POINT_TEMPERATURE`] = { val: r.set, unit: '°C' };
    mock[`hm-rpc.0.${r.id}.1.WINDOW_STATE`] = { val: r.win };
}

const DEF = 'def-thermo-doc';
const DEF2 = 'def-thermo-doc-2';
const children = [
    {
        id: 'child-ist',
        type: 'value',
        title: 'Ist',
        datapoint: '{{parent}}.ACTUAL_TEMPERATURE',
        gridPos: { x: 0, y: 0, w: 5, h: 3 },
        options: { decimals: 1, icon: 'Thermometer' },
    },
    {
        id: 'child-soll',
        type: 'value',
        title: 'Soll',
        datapoint: '{{parent}}.SET_POINT_TEMPERATURE',
        gridPos: { x: 5, y: 0, w: 5, h: 3 },
        options: { decimals: 1, icon: 'Target' },
    },
    {
        id: 'child-fenster',
        type: 'binarysensor',
        title: 'Fenster',
        datapoint: '{{parent}}.WINDOW_STATE',
        gridPos: { x: 0, y: 3, w: 10, h: 3 },
        options: { labelOn: 'offen', labelOff: 'zu', icon: 'AppWindow' },
    },
];
const card = (r, i, def = DEF, y = 0) => ({
    id: `w-card-${r.id}`,
    type: 'devicecard',
    title: r.name,
    datapoint: `hm-rpc.0.${r.id}.1.ACTUAL_TEMPERATURE`,
    gridPos: { x: i * 11, y, w: 11, h: 9 },
    options: { defId: def, icon: 'IdCard' },
});

const browser = await chromium.launch();
const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
).newPage();
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((m) => {
    window.__auraShot.mockServerState(m);
    window.__auraShot.mock(m);
}, mock);

async function show(widgets, defs, editMode) {
    await page.evaluate(
        ([w, d, e]) => {
            window.__auraShot.groupDefs(d);
            window.__auraShot.showWidgets(w, { editMode: e });
        },
        [widgets, defs, editMode],
    );
    await page.waitForTimeout(1500);
}

/** Bounding box around the given grid items, with a margin. */
async function clipFor(ids, pad = 12) {
    const boxes = await page.evaluate(
        (list) =>
            list.map((id) => {
                const r = document.querySelector(`[data-aura-widget="${id}"]`).getBoundingClientRect();
                return { x: r.left, y: r.top, r: r.right, b: r.bottom };
            }),
        ids,
    );
    const x = Math.min(...boxes.map((b) => b.x)) - pad;
    const y = Math.min(...boxes.map((b) => b.y)) - pad;
    return {
        x,
        y,
        width: Math.max(...boxes.map((b) => b.r)) + pad - x,
        height: Math.max(...boxes.map((b) => b.b)) + pad - y,
    };
}

// Hero: three rooms, one layout.
const cards = ROOMS.map((r, i) => card(r, i));
await show(cards, { [DEF]: children }, false);
await page.screenshot({ path: `${OUT}/runtime.png`, clip: await clipFor(cards.map((c) => c.id)) });

// Editor: two linked sets side by side — the frame colour tells them apart.
const second = { ...card(OTHER, 0, DEF2, 10) };
const linked = [...cards, second, { ...card({ ...OTHER, id: 'flur2', name: 'Flur 2' }, 1, DEF2, 10) }];
mock['hm-rpc.0.flur2.1.ACTUAL_TEMPERATURE'] = { val: 19.2, unit: '°C' };
mock['hm-rpc.0.flur2.1.SET_POINT_TEMPERATURE'] = { val: 20, unit: '°C' };
await page.evaluate((m) => window.__auraShot.mock(m), mock);
await show(linked, { [DEF]: children, [DEF2]: children.slice(0, 2) }, true);
await page.mouse.move(1270, 790);
await page.waitForTimeout(300);
await page.screenshot({
    path: `${OUT}/linked.png`,
    clip: await clipFor(
        linked.map((c) => c.id),
        16,
    ),
});

// Config dialog of one card.
await show(cards, { [DEF]: children }, true);
await page.locator('[data-aura-widget="w-card-kueche"]').hover({ position: { x: 20, y: 10 } });
const btn = await page.evaluateHandle(() => {
    const frame = document.querySelector('.aura-widget-w-card-kueche');
    const chrome = [...frame.querySelectorAll('.aura-edit-chrome')].find((c) => c.closest('.aura-widget') === frame);
    return chrome?.querySelector('button[title="Widget-Optionen"]');
});
await btn.asElement().click({ force: true });
await page.locator('button:text-is("Bearbeiten")').first().click();
await page.waitForTimeout(700);
const cfg = page.locator('[data-aura-devicecard-config]');
await cfg.scrollIntoViewIfNeeded();
const box = await cfg.boundingBox();
await page.screenshot({
    path: `${OUT}/config.png`,
    clip: { x: box.x - 16, y: box.y - 36, width: box.width + 32, height: box.height + 52 },
});

await browser.close();
console.log(`written to ${OUT}`);
