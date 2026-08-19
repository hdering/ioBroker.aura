// Documentation screenshots for the Menü and Spiegel widgets.
// Output: docs/widgets/assets/menue/*.png and docs/widgets/assets/spiegel/*.png
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/menu-mirror.mjs
//
// Both widgets need more than the single demo tab `__auraShot.showWidgets()` builds:
// a menu lists the sections/tabs around it, and a mirror needs a source widget next
// to it. So this seeds a small multi-section layout instead.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ASSETS = 'docs/widgets/assets';
const MENU_ID = 'w-menu';
const SRC_ID = 'w-src';
const MIRROR_ID = 'w-mirror';

mkdirSync(`${ASSETS}/menue`, { recursive: true });
mkdirSync(`${ASSETS}/spiegel`, { recursive: true });

const menuWidget = (options, gridPos) => ({
    id: MENU_ID,
    type: 'menu',
    title: 'Menü',
    datapoint: '',
    gridPos,
    options,
});

// Section-mode menus list these; the tab-mode shot lists the tabs of "Wohnen".
const LAYOUT = (widgets, tabs) => ({
    id: 'lay-doc',
    name: 'Zuhause',
    slug: 'zuhause',
    activeSectionId: 'sec-wohnen',
    sections: [
        {
            id: 'sec-wohnen',
            name: 'Wohnen',
            slug: 'wohnen',
            icon: 'lucide:sofa',
            activeTabId: 'tab-overview',
            tabs: tabs ?? [{ id: 'tab-overview', name: 'Übersicht', slug: 'uebersicht', widgets }],
        },
        { id: 'sec-kueche', name: 'Küche', slug: 'kueche', icon: 'lucide:utensils', tabs: [] },
        { id: 'sec-garten', name: 'Garten', slug: 'garten', icon: 'lucide:flower-2', tabs: [] },
        { id: 'sec-technik', name: 'Technik', slug: 'technik', icon: 'lucide:cog', tabs: [] },
    ],
});

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

const ready = () => page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

async function seed(layout, editMode = false) {
    await page.evaluate(
        ([l, edit]) => window.__auraShot.seed({ layouts: [l], activeLayoutId: l.id, editMode: edit }),
        [layout, editMode],
    );
    // Section/tab icons are fetched from api.iconify.design on demand — wait for them.
    await page.waitForTimeout(1800);
}

/** Element crop of one widget. */
async function shotWidget(id, file) {
    await page.locator(`.aura-widget-${id}`).first().screenshot({ path: file });
    console.log('✓', file);
}

/** Crop around several widgets at once (source + mirror side by side). */
async function shotArea(ids, file, pad = 14) {
    const box = await page.evaluate((sel) => {
        const rects = sel
            .map((s) => document.querySelector(`.aura-widget-${s}`)?.getBoundingClientRect())
            .filter(Boolean);
        if (!rects.length) return null;
        const x = Math.min(...rects.map((r) => r.x));
        const y = Math.min(...rects.map((r) => r.y));
        return {
            x,
            y,
            width: Math.max(...rects.map((r) => r.right)) - x,
            height: Math.max(...rects.map((r) => r.bottom)) - y,
        };
    }, ids);
    if (!box) {
        console.log('✗', file, '- widgets not found');
        return;
    }
    await page.screenshot({
        path: file,
        clip: {
            x: Math.max(0, box.x - pad),
            y: Math.max(0, box.y - pad),
            width: box.width + pad * 2,
            height: box.height + pad * 2,
        },
    });
    console.log('✓', file);
}

/** Open a widget's edit dialog in the editor and crop the modal. */
async function shotConfig(id, file) {
    await page.locator(`.aura-widget-${id} button[title="Widget-Optionen"]`).first().click({ force: true });
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Bearbeiten' }).first().click();
    await page.waitForTimeout(900);
    const box = await page.evaluate(() => {
        const el = document.querySelector('div.pointer-events-auto.rounded-xl.shadow-2xl');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    if (!box) {
        console.log('✗', file, '- no modal');
        return;
    }
    const pad = 6;
    await page.screenshot({
        path: file,
        clip: {
            x: Math.max(0, box.x - pad),
            y: Math.max(0, box.y - pad),
            width: box.width + pad * 2,
            height: box.height + pad * 2,
        },
    });
    console.log('✓', file);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(250);
}

// ── Menü: one shot per variant, on the frontend route so the active entry shows ──
await page.goto(`${BASE}/?shot=1#/view/zuhause/s/wohnen`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await ready();
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);

const MENU_SHOTS = [
    { file: 'variant-hbar', options: { variant: 'hbar' }, gridPos: { x: 0, y: 0, w: 14, h: 2 } },
    { file: 'variant-pills', options: { variant: 'pills', gap: 8 }, gridPos: { x: 0, y: 0, w: 14, h: 2 } },
    {
        file: 'variant-vlist',
        options: { variant: 'vlist', indicatorStyle: 'filled' },
        gridPos: { x: 0, y: 0, w: 6, h: 7 },
    },
    { file: 'variant-grid', options: { variant: 'grid', gridCols: 2 }, gridPos: { x: 0, y: 0, w: 10, h: 5 } },
];

for (const s of MENU_SHOTS) {
    await seed(LAYOUT([menuWidget(s.options, s.gridPos)]));
    await shotWidget(MENU_ID, `${ASSETS}/menue/${s.file}.png`);
}

// Tab menu: same widget, listing the tabs of the section it sits in.
await seed(
    LAYOUT(null, [
        {
            id: 'tab-overview',
            name: 'Übersicht',
            slug: 'uebersicht',
            widgets: [menuWidget({ menuMode: 'tab', variant: 'hbar' }, { x: 0, y: 0, w: 14, h: 2 })],
        },
        { id: 'tab-details', name: 'Details', slug: 'details', widgets: [] },
        { id: 'tab-verlauf', name: 'Verlauf', slug: 'verlauf', widgets: [] },
    ]),
);
await shotWidget(MENU_ID, `${ASSETS}/menue/mode-tab.png`);

// ── Spiegel: a source widget and its mirror side by side ─────────────────────
const sourceWidget = {
    id: SRC_ID,
    type: 'thermostat',
    title: 'Wohnzimmer',
    datapoint: 'demo.thermostat',
    gridPos: { x: 0, y: 0, w: 11, h: 7 },
    options: { actualDatapoint: 'demo.thermostat.actual' },
};
const mirrorWidget = {
    id: MIRROR_ID,
    type: 'mirror',
    title: 'Spiegel',
    datapoint: '',
    gridPos: { x: 11, y: 0, w: 11, h: 7 },
    options: { targetWidgetId: SRC_ID },
};

await page.evaluate(() => window.__auraShot.mock({ 'demo.thermostat': 21, 'demo.thermostat.actual': 19.5 }));
await seed(LAYOUT([sourceWidget, mirrorWidget]));
await page.evaluate(() => window.__auraShot.mock({ 'demo.thermostat': 21, 'demo.thermostat.actual': 19.5 }));
await page.waitForTimeout(600);
await shotArea([SRC_ID, MIRROR_ID], `${ASSETS}/spiegel/runtime.png`);

// ── Config dialogs (editor route) ────────────────────────────────────────────
await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await ready();

await seed(LAYOUT([menuWidget({ variant: 'hbar' }, { x: 0, y: 0, w: 14, h: 2 })]), true);
await shotConfig(MENU_ID, `${ASSETS}/menue/config.png`);

await seed(LAYOUT([sourceWidget, mirrorWidget]), true);
await shotConfig(MIRROR_ID, `${ASSETS}/spiegel/config.png`);

await browser.close();
console.log('done');
