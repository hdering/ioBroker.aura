// Generate runtime + config-dialog screenshots for every remaining widget.
// Output: docs/widgets/assets/<slug>/runtime.png and config.png.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { WIDGETS } from './widgets-meta.mjs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ASSETS = 'docs/widgets/assets';
const ID = 'w-doc';
const SEL = `.aura-widget-${ID}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1500 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

async function ready() {
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 15000 });
}

function widgetConfig(w) {
    const rt = w.runtime ?? {};
    return {
        id: ID,
        type: w.type,
        title: rt.title ?? w.label,
        datapoint: rt.noDp ? '' : `demo.${w.type}`,
        layout: rt.layout ?? 'default',
        options: rt.options ?? {},
        gridPos: { x: 0, y: 0, w: rt.w ?? 12, h: rt.h ?? 6 },
    };
}

// ── bootstrap ────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await ready();
await page.evaluate(() => localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })));

// ── Phase A: runtime element shots (public route) ────────────────────────────
const withRuntime = WIDGETS.filter((w) => w.runtime !== null);
for (const w of withRuntime) {
    mkdirSync(`${ASSETS}/${w.slug}`, { recursive: true });
    try {
        const cfg = widgetConfig(w);
        const dp = cfg.datapoint;
        const val = w.runtime.val;
        await page.evaluate(
            ({ cfg, dp, val }) => {
                if (dp) window.__auraShot.mock({ [dp]: val });
                window.__auraShot.showWidgets([cfg]);
                if (dp) window.__auraShot.mock({ [dp]: val });
            },
            { cfg, dp, val },
        );
        await page.waitForTimeout(900);
        const el = page.locator(SEL).first();
        await el.screenshot({ path: `${ASSETS}/${w.slug}/runtime.png` });
        console.log('✓ runtime', w.slug);
    } catch (e) {
        console.log('✗ runtime', w.slug, '-', e.message.split('\n')[0]);
    }
}

// ── Phase B: config dialog (editor route) ────────────────────────────────────
await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'networkidle' });
await ready();

for (const w of WIDGETS) {
    mkdirSync(`${ASSETS}/${w.slug}`, { recursive: true });
    try {
        const cfg = widgetConfig(w);
        const dp = cfg.datapoint;
        const val = w.runtime?.val;
        await page.evaluate(
            ({ cfg, dp, val }) => {
                if (dp && val !== undefined && val !== null) window.__auraShot.mock({ [dp]: val });
                window.__auraShot.showWidgets([cfg], { editMode: true });
            },
            { cfg, dp, val },
        );
        await page.waitForTimeout(700);
        await page.locator(`${SEL} button[title="Widget-Optionen"]`).first().click();
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: 'Bearbeiten' }).first().click();
        await page.waitForTimeout(900);

        const box = await page.evaluate(() => {
            const el = document.querySelector('div.pointer-events-auto.rounded-xl.shadow-2xl');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
        if (box) {
            const pad = 6;
            await page.screenshot({
                path: `${ASSETS}/${w.slug}/config.png`,
                clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 },
            });
            console.log('✓ config ', w.slug);
        } else {
            console.log('✗ config ', w.slug, '- no modal');
        }
        // Close dialog for the next widget.
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(250);
    } catch (e) {
        console.log('✗ config ', w.slug, '-', e.message.split('\n')[0]);
        await page.keyboard.press('Escape').catch(() => {});
    }
}

await browser.close();
console.log('done');
