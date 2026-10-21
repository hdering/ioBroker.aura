// Screenshots for the "Bildschirmschoner erstellen" guide (#822).
// Writes docs/anleitungen/assets/bildschirmschoner-*.png.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/screensaver.mjs
//
// Side-effect-free: screenshot mode blocks every write to the instance.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/anleitungen/assets';
mkdirSync(OUT, { recursive: true });

const CLIENT = 'wandtablet';
const NS = 'aura.0';

const MOCK = { 'demo.wz.temp': 21.5, 'demo.we.temp': 14.2, 'demo.wz.hum': 48 };

const VIEW = {
    id: 'pv-ruhe',
    name: 'Ruhe',
    autoCloseSec: 0,
    widgets: [
        { id: 'r-clock', type: 'clock', title: '', datapoint: '', gridPos: { x: 0, y: 0, w: 24, h: 8 }, options: {} },
        {
            id: 'r-in',
            type: 'value',
            title: 'Wohnzimmer',
            datapoint: 'demo.wz.temp',
            gridPos: { x: 0, y: 8, w: 12, h: 5 },
            options: { unit: '°C' },
        },
        {
            id: 'r-out',
            type: 'value',
            title: 'Außen',
            datapoint: 'demo.we.temp',
            gridPos: { x: 12, y: 8, w: 12, h: 5 },
            options: { unit: '°C' },
        },
    ],
};

const TRIGGER = {
    id: 'pt-screensaver',
    name: 'Bildschirmschoner',
    enabled: true,
    clause: { datapoint: `${NS}.clients.{{clientId}}.idle.active`, operator: '==', value: 'true' },
    host: {
        id: 'ptw-screensaver',
        type: 'value',
        title: '',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 1, h: 1 },
        options: {
            clickAction: { kind: 'popup-view', viewId: VIEW.id },
            popupFullscreen: true,
            popupHideTitle: true,
        },
    },
    resetDp: false,
    closeOnFalse: true,
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

async function go(hash) {
    await page.goto('about:blank');
    await page.goto(`${BASE}/?shot=1&client=${CLIENT}#/${hash}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
    await page.evaluate(
        ([mock, view]) => {
            window.__auraShot.mock(mock);
            window.__auraShot.popupViews([view]);
        },
        [MOCK, VIEW],
    );
    await page.waitForTimeout(800);
}

await go('');
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

// ── 1. Idle time: Frontend-Design → Navigation ───────────────────────────────
await go('admin/design?tab=nav');
await page
    .locator('h2', { hasText: 'Navigation' })
    .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
    .screenshot({ path: `${OUT}/bildschirmschoner-leerlauf.png` });
console.log('✓ bildschirmschoner-leerlauf.png');

// ── 2. Trigger dialog ────────────────────────────────────────────────────────
// Tall viewport so the whole dialog fits without scrolling.
await page.setViewportSize({ width: 1280, height: 1460 });
await go('admin/popups');
await page.evaluate((t) => window.__auraShot.dpTriggers([t]), TRIGGER);
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Bearbeiten' }).first().click();
await page.waitForTimeout(700);
const modal = page.locator('.aura-config-modal').last();
await modal.screenshot({ path: `${OUT}/bildschirmschoner-trigger.png` });
console.log('✓ bildschirmschoner-trigger.png');

// ── 3. Result: the fullscreen popup over the dashboard ───────────────────────
await page.setViewportSize({ width: 1280, height: 800 });
await go('');
const dp = `${NS}.clients.${CLIENT}.idle.active`;
await page.evaluate(
    ([t, dp]) => {
        window.__auraShot.mock({ [dp]: false });
        window.__auraShot.dpTriggers([t]);
    },
    [TRIGGER, dp],
);
await page.waitForTimeout(500);
await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), dp);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/bildschirmschoner-ergebnis.png` });
console.log('✓ bildschirmschoner-ergebnis.png');

await browser.close();
