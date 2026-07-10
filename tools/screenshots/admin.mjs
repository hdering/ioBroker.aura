// Admin-area documentation screenshots.
// Seeds a controlled demo config, then walks every admin page, its sub-tabs and
// the key dialogs, writing PNGs into docs/einstellungen/assets/.
// Side-effect-free: screenshotMode disables all writes to the ioBroker instance.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { LAYOUTS, ACTIVE_LAYOUT_ID, MOCK } from './demo-config.mjs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/einstellungen/assets';
mkdirSync(OUT, { recursive: true });

const VIEW = { width: 1600, height: 1300 };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

async function ensureReady() {
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 15000 });
    await page.evaluate(
        ({ LAYOUTS, ACTIVE_LAYOUT_ID, MOCK }) => {
            window.__auraShot.mock(MOCK);
            window.__auraShot.seed({ layouts: LAYOUTS, activeLayoutId: ACTIVE_LAYOUT_ID });
        },
        { LAYOUTS, ACTIVE_LAYOUT_ID, MOCK },
    );
}

async function go(hash) {
    await page.goto(`${BASE}/?shot=1#/${hash}`, { waitUntil: 'networkidle' });
    await ensureReady();
    await page.waitForTimeout(900);
    // Re-assert mock after widgets remounted on the new route.
    await page.evaluate((MOCK) => window.__auraShot.mock(MOCK), MOCK);
    await page.waitForTimeout(500);
}

async function shotPage(name) {
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log('✓', `${name}.png`);
}

async function shotModal(name) {
    await page.waitForTimeout(500);
    const box = await page.evaluate(() => {
        const el = document.querySelector('div.pointer-events-auto.rounded-xl.shadow-2xl');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    if (!box) {
        console.log('  (no modal found, full-page fallback)', name);
        await shotPage(name);
        return;
    }
    const pad = 6;
    await page.screenshot({
        path: `${OUT}/${name}.png`,
        clip: {
            x: Math.max(0, box.x - pad),
            y: Math.max(0, box.y - pad),
            width: box.width + pad * 2,
            height: box.height + pad * 2,
        },
    });
    console.log('✓', `${name}.png (modal)`);
}

// ── bootstrap: login bypass + seed ──────────────────────────────────────────
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await ensureReady();
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

// ── 1. Übersicht ────────────────────────────────────────────────────────────
await go('admin');
await shotPage('uebersicht');

// ── 2. Dashboard-Editor ──────────────────────────────────────────────────────
await go('admin/editor');
await shotPage('editor');
// Add-widget dialog
await page.getByRole('button', { name: 'Neues Widget' }).first().click();
await shotModal('editor-neues-widget');
await page.keyboard.press('Escape').catch(() => {});

// ── 3. Popups ────────────────────────────────────────────────────────────────
await go('admin/popups');
await shotPage('popups');

// ── 4. Widgets ───────────────────────────────────────────────────────────────
await go('admin/widgets');
await shotPage('widgets');

// ── 5. Layouts (list) ────────────────────────────────────────────────────────
await go('admin/layouts');
await shotPage('layouts');

// ── 6. Design (global-frame sections + scoped appearance sub-tabs) ────────────
for (const frame of ['header', 'menu', 'nav']) {
    await go(`admin/design?frame=${frame}`);
    await shotPage(`design-${frame}`);
}
for (const tab of ['theme', 'typo', 'grid', 'guidelines', 'tabbar']) {
    await go(`admin/design?tab=${tab}`);
    await shotPage(`design-${tab}`);
}

// ── 7. CSS & JS (2 tabs) ─────────────────────────────────────────────────────
for (const tab of ['css', 'js']) {
    await go(`admin/css-js?tab=${tab}`);
    await shotPage(`css-js-${tab}`);
}

// ── 8. Einstellungen ─────────────────────────────────────────────────────────
await go('admin/settings');
await shotPage('einstellungen');

await browser.close();
console.log('done');
