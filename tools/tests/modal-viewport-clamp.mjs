// The remembered dialog size must not survive a shrinking screen: sized on a big display
// (RDP session, external monitor) and reopened on the small built-in one, a centered box
// taller than the viewport pushed its title bar — and with it the ✕ — above the top edge.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/modal-viewport-clamp.mjs
//
// Checked for the widget edit dialog (CenteredModal) and a sub-editor (ConfigModal): the
// oversized stored size is clamped on open while the stored preference itself survives,
// shrinking the window with the dialog open keeps it on screen, and dragging cannot park
// the title bar out of reach.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const VIEW = { width: 1280, height: 720 };
/** Stored on a 1920x1440-ish screen — taller and wider than the viewport under test. */
const BIG = { w: 1900, h: 1300 };

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEW, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// Seeded before any app code runs — the modals read their size once, on mount.
await ctx.addInitScript(
    ([big]) => {
        localStorage.setItem('aura.widget.editModalSize', JSON.stringify(big));
        localStorage.setItem('aura-echart-dp-modal', JSON.stringify(big));
    },
    [BIG],
);

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

await page.evaluate(() => {
    const vals = { 'demo.power': 1500 };
    window.__auraShot.mock(vals);
    window.__auraShot.mockServerState(vals);
    window.__auraShot.enableHistory(true);
    window.__auraShot.showWidgets(
        [
            {
                id: 'w-clamp',
                type: 'echart',
                title: 'Leistung',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 20, h: 10 },
                options: {
                    echartMode: 'timeseries',
                    echartSeries: [
                        {
                            id: 's1',
                            name: 'Ist',
                            datapointId: 'demo.power',
                            chartType: 'line',
                            source: 'history',
                            historyInstance: 'history.0',
                            yAxisIndex: 0,
                        },
                    ],
                },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
});

const editModal = page.locator('.aura-widget-edit-modal');
const subModal = page.locator('.aura-config-modal');

/** Box of a locator, rounded — Playwright hands out fractional pixels. */
const boxOf = async (loc) => {
    const b = await loc.boundingBox();
    return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
};

/** The whole dialog inside the window, close button included. */
const onScreen = async (loc, label) => {
    const b = await boxOf(loc);
    const view = page.viewportSize();
    check(`${label}: top edge stays on screen`, b.y >= 0, JSON.stringify(b));
    check(`${label}: bottom edge stays on screen`, b.y + b.h <= view.height, `${b.y + b.h} > ${view.height}`);
    check(`${label}: left edge stays on screen`, b.x >= 0, JSON.stringify(b));
    check(`${label}: right edge stays on screen`, b.x + b.w <= view.width, `${b.x + b.w} > ${view.width}`);
    const close = await boxOf(loc.locator('button').first());
    check(`${label}: the ✕ is reachable`, close.y >= 0 && close.y + close.h <= view.height, JSON.stringify(close));
    return b;
};

// ── Widget edit dialog ───────────────────────────────────────────────────────
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await editModal.waitFor({ timeout: 10000 });
await page.waitForTimeout(200);
await onScreen(editModal, 'edit dialog');

// The stored value is a preference, not a layout — the big screen must get its size back.
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('aura.widget.editModalSize')));
check(
    'the remembered size survives the small screen',
    stored?.h === BIG.h && stored?.w === BIG.w,
    JSON.stringify(stored),
);

// ── Sub-editor on top of it ──────────────────────────────────────────────────
const trigger = page.locator('button:has-text("Datenpunkte verwalten")').first();
await trigger.waitFor({ timeout: 10000 });
await trigger.click();
await subModal.waitFor({ timeout: 10000 });
await page.waitForTimeout(200);
await onScreen(subModal, 'sub-editor');

// ── Window shrinks while both are open (RDP session ends) ────────────────────
await page.setViewportSize({ width: 1000, height: 560 });
await page.waitForTimeout(300);
await onScreen(subModal, 'sub-editor after shrink');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Escape closed only the sub-editor', (await subModal.count()) === 0 && (await editModal.count()) === 1);
await onScreen(editModal, 'edit dialog after shrink');

// ── Dragging cannot park the title bar out of reach ──────────────────────────
{
    const before = await boxOf(editModal);
    const header = editModal.locator('div').first();
    const hb = await boxOf(header);
    await page.mouse.move(hb.x + hb.w / 2, hb.y + 10);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.w / 2 - 4000, hb.y - 4000, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await boxOf(editModal);
    check('dragging moved the dialog at all', after.x !== before.x || after.y !== before.y);
    check('dragged up: the title bar stays visible', after.y >= 0, JSON.stringify(after));
    // Left is allowed to overhang, as long as 80px of the header — the ✕ side — remain.
    check('dragged left: a grabbable strip remains', after.x + after.w >= 80, JSON.stringify(after));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length === 0 ? 0 : 1);
