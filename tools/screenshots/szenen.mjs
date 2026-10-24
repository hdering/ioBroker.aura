// Documentation screenshots for the scenes widget (issue #825).
// Output: docs/widgets/assets/szenen/runtime.png  (Liste, eine Szene aktiv)
//         docs/widgets/assets/szenen/kacheln.png  (Layout Kacheln)
//         docs/widgets/assets/szenen/popup.png    (Szene bearbeiten)
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/szenen.mjs
//
// The backend replies (sceneStatus, listScenes) come from the harness (`mockSendTo`),
// so neither the scenes adapter nor the aura adapter is needed.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/szenen';
mkdirSync(OUT, { recursive: true });

const DEVICES = [
    { id: 'demo.doc.couch.LEVEL', name: 'Licht Couch', label: 'Licht Couch', type: 'number', unit: '%' },
    { id: 'demo.doc.decke.STATE', name: 'Deckenlicht', label: 'Deckenlicht', type: 'boolean', unit: '' },
    { id: 'demo.doc.rollo.LEVEL', name: 'Rollladen Terrasse', label: '', type: 'number', unit: '%' },
    { id: 'demo.doc.tv.STATE', name: 'Fernseher', label: '', type: 'boolean', unit: '' },
];
const own = (id, name, members) => ({
    id: `scene.0.aura.${id}`,
    name,
    own: true,
    enabled: true,
    memberCount: members.length,
    members: members.map(([dev, value]) => ({ id: DEVICES[dev].id, value })),
});
const SCENES = [
    own('Fernsehabend', 'Fernsehabend', [
        [0, 30],
        [1, false],
        [2, 0],
        [3, true],
    ]),
    own('Essen', 'Essen', [
        [0, 80],
        [1, true],
    ]),
    own('Alles_aus', 'Alles aus', [
        [0, 0],
        [1, false],
        [3, false],
    ]),
    { id: 'scene.0.Gute_Nacht', name: 'Gute Nacht', own: false, enabled: true, memberCount: 6 },
];
const REPLIES = {
    sceneStatus: {
        ok: true,
        instance: 'scenes.0',
        installed: true,
        running: true,
        pinRequired: false,
        devices: DEVICES,
    },
    listScenes: { ok: true, scenes: SCENES },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });

const LIST = {
    id: 'w-sc-list',
    type: 'scenes',
    title: 'Wohnzimmer',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 9, h: 9 },
    options: { showForeignScenes: true },
};
const TILES = {
    id: 'w-sc-tiles',
    type: 'scenes',
    title: 'Wohnzimmer',
    layout: 'card',
    gridPos: { x: 10, y: 0, w: 9, h: 11 },
    options: { showForeignScenes: true },
};

await page.evaluate(
    ([replies, widgets]) => {
        const a = window.__auraShot;
        a.mockSendTo(replies);
        const vals = { 'scene.0.aura.Fernsehabend': true, 'scene.0.aura.Essen': false };
        a.mock(vals);
        a.mockServerState(vals);
        a.showWidgets(widgets);
    },
    [REPLIES, [LIST, TILES]],
);
await page.waitForFunction(
    () => document.querySelectorAll('.aura-widget-w-sc-tiles [data-testid="scene"]').length > 3,
    null,
    {
        timeout: 20000,
    },
);
await page.waitForTimeout(500);
await page
    .locator('.aura-widget-w-sc-list')
    .first()
    .screenshot({ path: `${OUT}/runtime.png` });
await page
    .locator('.aura-widget-w-sc-tiles')
    .first()
    .screenshot({ path: `${OUT}/kacheln.png` });
console.log('✓ runtime.png, kacheln.png');

// ── Bearbeiten-Popup ───────────────────────────────────────────────────────────
await page.locator('.aura-widget-w-sc-list [data-testid="scene-edit"]').first().click();
await page.waitForSelector('[data-testid="scene-modal"]');
await page.waitForTimeout(300);
await page.locator('[data-testid="scene-modal"]').screenshot({ path: `${OUT}/popup.png` });
console.log('✓ popup.png');

await browser.close();
