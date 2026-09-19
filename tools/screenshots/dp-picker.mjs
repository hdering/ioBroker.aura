// Capture the datapoint picker in tree view (docs/einstellungen/editor.md).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/dp-picker.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/einstellungen/assets';
mkdirSync(OUT, { recursive: true });

const stateRow = (id, common) => ({ id, value: { _id: id, type: 'state', common } });
const objRow = (id, type, common) => ({ id, value: { _id: id, type, common } });

const states = [];
for (const dev of ['ABC0001', 'ABC0002', 'ABC0003']) {
    states.push(
        stateRow(`hm-rpc.0.${dev}.1.STATE`, { name: 'Schalter', type: 'boolean', role: 'switch', read: true, write: true }),
        stateRow(`hm-rpc.0.${dev}.1.LEVEL`, { name: 'Helligkeit', type: 'number', role: 'value', unit: '%', read: true }),
        stateRow(`hm-rpc.0.${dev}.0.RSSI`, { name: 'RSSI', type: 'number', role: 'value', unit: 'dBm', read: true }),
    );
}
states.push(
    stateRow('alias.0.wohnzimmer.licht', { name: 'Licht', type: 'boolean', role: 'switch', read: true, write: true }),
    stateRow('alias.0.wohnzimmer.temperatur', { name: 'Temperatur', type: 'number', role: 'value.temperature', unit: '°C', read: true }),
    stateRow('0_userdata.0.zaehler.strom', { name: 'Strom', type: 'number', role: 'value', unit: 'kWh', read: true }),
);

const VIEW = {
    state: states,
    channel: [objRow('hm-rpc.0.ABC0001.1', 'channel', { name: 'Kanal 1' })],
    device: [
        objRow('hm-rpc.0.ABC0001', 'device', { name: 'Dimmaktor Flur' }),
        objRow('hm-rpc.0.ABC0002', 'device', { name: 'Schaltaktor Küche' }),
    ],
    instance: [objRow('system.adapter.hm-rpc.0', 'instance', { enabled: true })],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate((v) => {
    localStorage.setItem('aura-dp-picker-view', 'tree');
    window.__auraShot.mockObjectView(v);
    window.__auraShot.writes(true);
    window.__auraShot.showWidgets(
        [{ id: 'w-shot', type: 'value', title: 'Testwert', datapoint: '', gridPos: { x: 0, y: 0, w: 6, h: 4 }, options: {} }],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
}, VIEW);

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.locator('.aura-widget-edit-modal').waitFor();
await page.waitForTimeout(400);
await page.locator('.aura-widget-edit-modal button[title="Aus ioBroker wählen"]').first().click();
await page.locator('.aura-dp-picker').waitFor();
await page.waitForTimeout(900);

for (const path of ['hm-rpc', 'hm-rpc.0', 'hm-rpc.0.ABC0001', 'hm-rpc.0.ABC0001.1']) {
    await page.locator(`.aura-dp-tree-row[data-path="${path}"]`).click();
}
await page.waitForTimeout(700);
await page.mouse.move(5, 5); // no hover highlight in the shot

await page.locator('.aura-dp-picker').screenshot({ path: `${OUT}/dp-picker-baum.png` });
console.log(`  → ${OUT}/dp-picker-baum.png`);

await browser.close();
