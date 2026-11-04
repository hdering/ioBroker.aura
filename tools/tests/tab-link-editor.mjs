// Linked tabs in the editor (#896): in the target layout, "+ Tab" offers a new tab or
// "Bestehenden Tab verknüpfen"; the linked tab's settings can re-point it. The tab
// settings no longer push a link elsewhere.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/tab-link-editor.mjs
//
// Admin via the screenshot harness — no real configuration is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const widget = (id, title) => ({
    id,
    type: 'info',
    title,
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 10, h: 6 },
    options: { showTitle: true },
});

const FLUR = {
    id: 'l-flur',
    name: 'FlurEG',
    slug: 'flureg',
    activeSectionId: 's-flur',
    sections: [
        {
            id: 's-flur',
            name: 'Flur',
            slug: 'flur',
            activeTabId: 't-licht',
            tabs: [
                { id: 't-licht', name: 'Licht', slug: 'licht', widgets: [widget('w-licht', 'Deckenlampe')] },
                { id: 't-heizung', name: 'Heizung', slug: 'heizung', widgets: [widget('w-heiz', 'Thermostat')] },
            ],
        },
    ],
};
const WOHN = {
    id: 'l-wohn',
    name: 'Wohnzimmer',
    slug: 'wohnzimmer',
    activeSectionId: 's-wohn',
    sections: [
        {
            id: 's-wohn',
            name: 'Wohnen',
            slug: 'wohnen',
            activeTabId: 't-tv',
            tabs: [
                { id: 't-tv', name: 'TV', slug: 'tv', widgets: [] },
                // An existing link is not offered as an original.
                {
                    id: 't-alt',
                    name: 'Alt',
                    slug: 'alt',
                    widgets: [],
                    link: { sectionId: 's-flur', tabId: 't-heizung' },
                },
            ],
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
await page.evaluate((layouts) => window.__auraShot.seed({ layouts }), [FLUR, WOHN]);
await page.evaluate(() => {
    window.location.hash = '#/admin/editor?layout=l-wohn&tab=t-tv';
});
const plus = page.locator('[data-aura-tab-add]');
await plus.waitFor({ state: 'visible', timeout: 20000 });
const menu = page.locator('[data-aura-tab-add-menu]');
const add = page.locator('[data-aura-tab-link-add]');

// ── "+ Tab" menu ─────────────────────────────────────────────────────────────
console.log('\n── + Tab ──');
check('the menu is closed at first', !(await menu.isVisible()));
const rowsBefore = await page.locator('.aura-tab-manage-row').count();
await plus.click();
check('the menu opens', await menu.isVisible());
await page.locator('[data-aura-tab-add-new]').click();
await page.waitForTimeout(300);
check('"Neuer Tab" adds a plain tab', (await page.locator('.aura-tab-manage-row').count()) === rowsBefore + 1);
check('and closes the menu', !(await menu.isVisible()));
await plus.click();

// ── Pull: pick the original from the target layout ───────────────────────────
console.log('\n── Tab verknüpfen… ──');
const values = await add.locator('option').evaluateAll((os) => os.map((o) => o.value));
check(
    'offers the tabs of the other layout',
    values.includes('s-flur::t-licht') && values.includes('s-flur::t-heizung'),
    values.join(','),
);
check('not the own section', !values.some((v) => v.startsWith('s-wohn::')), values.join(','));
const linkedBefore = await page.locator('[data-aura-tab-linked]').count();
await add.selectOption('s-flur::t-licht');
await page.waitForTimeout(400);
check('a linked tab is added here', (await page.locator('[data-aura-tab-linked]').count()) === linkedBefore + 1);
check('named after the original', (await page.locator('.aura-tab-manage-row', { hasText: 'Licht' }).count()) === 1);
check('the new tab is open (canvas notice)', await page.locator('[data-aura-linked-canvas]').isVisible());
check(
    'still in the target layout',
    page.url().includes('l-wohn') || (await page.locator('.aura-tab-manage-row', { hasText: 'TV' }).count()) === 1,
);
check('the menu closes after linking', !(await menu.isVisible()));

// ── Re-point: the linked tab's settings ──────────────────────────────────────
console.log('\n── Original wechseln ──');
const row = page.locator('.aura-tab-manage-row', { hasText: 'Licht' });
await row.locator('button').nth(1).click();
const source = page.locator('[data-aura-tab-link-source]');
await source.waitFor({ state: 'visible', timeout: 5000 });
check('the source select shows the original', (await source.inputValue()) === 's-flur::t-licht');
await source.selectOption('s-flur::t-heizung');
await page.waitForTimeout(300);
check('re-pointed to another original', (await source.inputValue()) === 's-flur::t-heizung');
check('the name stays its own', (await page.locator('.aura-tab-manage-row', { hasText: 'Licht' }).count()) === 1);
check('no "link elsewhere" button in the settings', (await page.locator('[data-aura-tab-link-btn]').count()) === 0);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
