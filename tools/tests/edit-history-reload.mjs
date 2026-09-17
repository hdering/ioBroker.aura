// Undo survives a reload of the admin (IndexedDB-backed history).
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199    (or set AURA_BASE)
//   AURA_BASE=http://localhost:5199 node tools/tests/edit-history-reload.mjs
//
// Real admin (dev login fallback), real IndexedDB: rename a widget in the editor,
// reload the page, expect the step to be back — Ctrl+Z restores the name and
// disarms the save bar again. Then the negative: after a save nothing is dirty,
// the chain still ends at the current state, so undo keeps working across the
// reload as well.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const widget = (id, x) => ({
    id,
    type: 'value',
    title: `W ${id}`,
    datapoint: `demo.0.${id}`,
    layout: 'default',
    gridPos: { x, y: 0, w: 12, h: 6 },
    options: { showTitle: true },
});
const layouts = [
    {
        id: 'layout-default',
        name: 'Standard',
        slug: 'default',
        activeSectionId: 'sec',
        sections: [
            {
                id: 'sec',
                name: 'Bereich',
                slug: 'bereich',
                activeTabId: 'tab1',
                tabs: [{ id: 'tab1', name: 'Eins', slug: 'eins', widgets: [widget('w1', 0), widget('w2', 12)] }],
            },
        ],
    },
];
const persisted = JSON.stringify({ state: { layouts, activeLayoutId: 'layout-default', editMode: false }, version: 0 });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true });
await ctx.addInitScript((p) => {
    try {
        if (!localStorage.getItem('aura-dashboard')) localStorage.setItem('aura-dashboard', p);
    } catch {
        /* ignore */
    }
}, persisted);
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/#/admin/login`, { waitUntil: 'domcontentloaded' });
await page.locator('input[type="password"]').first().fill('1234');
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
await page.goto(`${BASE}/#/admin/editor`, { waitUntil: 'domcontentloaded' });
await page.locator('.aura-widget-w1').first().waitFor({ timeout: 20000 });
await page.waitForFunction(() => !!window.__auraEditHistory, { timeout: 20000 });
await page.waitForTimeout(600);

const counts = () => page.evaluate(() => window.__auraEditHistory.counts());
const titleOf = (id) =>
    page.evaluate((w) => document.querySelector(`.aura-widget-${w}`)?.innerText.split('\n')[0] ?? null, id);

async function openEdit(id) {
    const w = page.locator(`.aura-widget-${id}`).first();
    await w.hover();
    await w.locator('button[title="Widget-Optionen"]').first().click({ timeout: 4000 });
    await page.locator('button:has-text("Bearbeiten")').last().click({ timeout: 4000 });
    await page.locator('.aura-widget-edit-modal').first().waitFor({ timeout: 5000 });
}

eq('fresh admin: nothing to undo', await counts(), { undo: 0, redo: 0, dirty: false });

// ── 1. edit, reload, undo ────────────────────────────────────────────────────
await openEdit('w1');
const name = page.locator('.aura-widget-edit-modal input[type="text"]').first();
await name.fill('Umbenannt');
await page.waitForTimeout(950);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
eq('the rename is one step and dirty', await counts(), { undo: 1, redo: 0, dirty: true });
eq(
    'the save bar names the unsaved change (this session)',
    await page.locator('[data-unsaved-status]').getAttribute('data-unsaved-status'),
    'session',
);
await page.evaluate(() => window.__auraEditHistory.persistNow());
await page.waitForTimeout(400);

await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('.aura-widget-w1').first().waitFor({ timeout: 20000 });
await page.waitForFunction(() => !!window.__auraEditHistory, { timeout: 20000 });
await page.waitForFunction(() => window.__auraEditHistory.counts().undo === 1, { timeout: 8000 }).catch(() => {});
eq('after the reload the step is back and the edit is still unsaved', await counts(), {
    undo: 1,
    redo: 0,
    dirty: true,
});
eq('… the widget shows the new name', await titleOf('w1'), 'Umbenannt');
eq(
    '… and the save bar flags it as carried over from the last session',
    await page.locator('[data-unsaved-status]').getAttribute('data-unsaved-status'),
    'carried',
);
check('… in words', (await page.locator('[data-unsaved-status]').innerText()).includes('letzten Sitzung'));

await page.evaluate(() => document.activeElement && document.activeElement.blur());
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
eq('Ctrl+Z after the reload restores the name', await titleOf('w1'), 'W w1');
eq('… and disarms the save bar (back on the saved value)', await counts(), { undo: 0, redo: 1, dirty: false });
eq('… the status chip is gone', await page.locator('[data-unsaved-status]').count(), 0);

// ── 2. the chain must end at the current state — a foreign change discards it ─
await page.keyboard.press('Control+y');
await page.waitForTimeout(400);
await page.evaluate(() => window.__auraEditHistory.persistNow());
await page.waitForTimeout(400);
await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('aura-dashboard'));
    raw.state.layouts[0].sections[0].tabs[0].widgets[1].title = 'Von woanders';
    localStorage.setItem('aura-dashboard', JSON.stringify(raw));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('.aura-widget-w1').first().waitFor({ timeout: 20000 });
await page.waitForFunction(() => !!window.__auraEditHistory, { timeout: 20000 });
await page.waitForTimeout(1500);
eq('a state the chain does not end in → history stays empty', (await counts()).undo, 0);

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
