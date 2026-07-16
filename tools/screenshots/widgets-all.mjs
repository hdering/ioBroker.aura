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

// Build a widget config for one entry of w.shots. A shot inherits the widget's
// runtime defaults and overrides layout/options/value/size. `mock` lets a shot
// seed extra datapoints (e.g. a thermostat's actual-temperature DP).
function shotConfig(w, s) {
    const rt = w.runtime ?? {};
    return {
        id: ID,
        type: w.type,
        title: s.title ?? rt.title ?? w.label,
        datapoint: rt.noDp ? '' : `demo.${w.type}`,
        layout: s.layout ?? rt.layout ?? 'default',
        options: { ...(rt.options ?? {}), ...(s.options ?? {}) },
        gridPos: { x: 0, y: 0, w: s.w ?? rt.w ?? 12, h: s.h ?? rt.h ?? 6 },
    };
}

// ── bootstrap ────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'networkidle' });
await ready();
await page.evaluate(() => localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })));

// ── Phase A: runtime element shots (public route) ────────────────────────────
// Widgets with a `shots: []` list get one element-cropped PNG per shot
// (layout-<name>.png / variant-<name>.png). Widgets with only `runtime` keep the
// single runtime.png. Element crops are side-effect-free (screenshotMode blocks
// all ioBroker writes).
const withRuntime = WIDGETS.filter((w) => w.runtime !== null);

async function renderShot(w, cfg, dp, val, mock, click, file) {
    await page.evaluate(
        ({ cfg, dp, val, mock }) => {
            const seed = { ...(mock ?? {}) };
            if (dp && val !== undefined && val !== null) seed[dp] = val;
            if (Object.keys(seed).length) window.__auraShot.mock(seed);
            window.__auraShot.showWidgets([cfg]);
            if (Object.keys(seed).length) window.__auraShot.mock(seed);
        },
        { cfg, dp, val, mock },
    );
    await page.waitForTimeout(900);
    if (click) {
        await page.locator(`${SEL} ${click === true ? '.aura-widget-action' : click}`).first().click();
        await page.waitForTimeout(400);
    }
    const el = page.locator(SEL).first();
    await el.screenshot({ path: `${ASSETS}/${w.slug}/${file}.png` });
}

for (const w of withRuntime) {
    mkdirSync(`${ASSETS}/${w.slug}`, { recursive: true });
    if (Array.isArray(w.shots) && w.shots.length) {
        for (const s of w.shots) {
            try {
                const cfg = shotConfig(w, s);
                await renderShot(w, cfg, cfg.datapoint, s.value ?? w.runtime.val, s.mock, s.click, s.file);
                console.log('✓ shot   ', `${w.slug}/${s.file}`);
            } catch (e) {
                console.log('✗ shot   ', `${w.slug}/${s.file}`, '-', e.message.split('\n')[0]);
            }
        }
        continue;
    }
    try {
        const cfg = widgetConfig(w);
        await renderShot(w, cfg, cfg.datapoint, w.runtime.val, undefined, false, 'runtime');
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
