// Documentation screenshots for the Ansagen widget (issue #918).
// Output: docs/widgets/assets/ansagen/runtime.png  (Liste mit eigenen Ansagen)
//         docs/widgets/assets/ansagen/popup.png    (Ansage bearbeiten, benannte Auslöser)
//         docs/widgets/assets/ansagen/config.png   (Bearbeiten-Dialog: Anzeigen, Auslöser zur Auswahl)
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/ansagen.mjs
//
// The rules come from a mocked aura.0.config.announcements; owner = this page's client id,
// so they count as created on this device.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/ansagen';
mkdirSync(OUT, { recursive: true });

const TRIGGERS = [
    { dp: 'demo.doc.klingel.PRESS', name: 'Haustürklingel' },
    { dp: 'demo.doc.waschmaschine.DONE', name: 'Waschmaschine fertig' },
    { dp: 'demo.doc.post.OPEN', name: 'Briefkasten' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

// ?client= pins this page's device id, so the rules below are its own.
const clientId = 'kueche';
await page.goto(`${BASE}/?shot=1&client=${clientId}#/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });

const rule = (id, name, dp, text, extra = {}) => ({
    id,
    name,
    enabled: true,
    clause: { datapoint: dp, operator: 'true', value: '' },
    text,
    clientIds: [clientId],
    owner: clientId,
    ...extra,
});
const RULES = [
    rule('k1', 'Klingel', TRIGGERS[0].dp, 'Es hat an der Haustür geklingelt', { mode: 'update' }),
    rule('k2', 'Wäsche', TRIGGERS[1].dp, 'Die Waschmaschine ist fertig', {
        timeFrom: '07:00',
        timeTo: '21:00',
    }),
    rule('k3', 'Post', TRIGGERS[2].dp, 'Die Post ist da', {
        days: [1, 2, 3, 4, 5, 6],
        oncePerDay: true,
        enabled: false,
    }),
];
const WIDGET = {
    id: 'w-ann',
    type: 'announcements',
    title: 'Ansagen Küche',
    gridPos: { x: 0, y: 0, w: 10, h: 12 },
    options: { triggers: TRIGGERS },
};

await page.evaluate(
    ([rules, widget]) => {
        const a = window.__auraShot;
        a.captureWrites(true);
        a.mockSendTo({ announcementEdit: { ok: true }, announcementTest: { ok: true, text: '' } });
        const vals = { 'aura.0.config.announcements': JSON.stringify({ rules }) };
        a.mock(vals);
        a.mockServerState(vals);
        a.showWidgets([widget]);
    },
    [RULES, WIDGET],
);
await page.waitForFunction(
    () => document.querySelectorAll('.aura-widget-w-ann [data-testid="announcement"]').length === 3,
    null,
    {
        timeout: 20000,
    },
);
await page.waitForTimeout(500);
await page
    .locator('.aura-widget-w-ann')
    .first()
    .screenshot({ path: `${OUT}/runtime.png` });
console.log('✓ runtime.png');

// ── Bearbeiten-Popup ───────────────────────────────────────────────────────────
await page.locator('.aura-widget-w-ann [data-testid="announcement-edit"]').nth(1).click();
await page.waitForSelector('[data-testid="announcement-modal"]');
await page.waitForTimeout(300);
await page.locator('[data-testid="announcement-modal"]').screenshot({ path: `${OUT}/popup.png` });
console.log('✓ popup.png');
await page.keyboard.press('Escape');

// ── Bearbeiten-Dialog ─────────────────────────────────────────────────────────
await page.evaluate((widget) => {
    const a = window.__auraShot;
    a.unfoldSections();
    a.showWidgets([widget], { editMode: true });
    a.setEditMode(true);
}, WIDGET);
await page.locator('.aura-widget-w-ann .aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const cfg = page
    .locator('details[data-aura-config-section="settings"]')
    .filter({ has: page.locator('[data-testid="announcement-trigger-row"]') });
await cfg.locator('[data-testid="announcement-trigger-row"]').first().waitFor({ timeout: 10000 });
await page.waitForTimeout(300);
await cfg.screenshot({ path: `${OUT}/config.png` });
console.log('✓ config.png');

await browser.close();
