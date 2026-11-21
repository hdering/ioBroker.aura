// Statusübersicht editor: the tabbed dialog "Statusübersicht konfigurieren".
//
//   AURA_BASE=http://localhost:5174 node tools/tests/status-config-modal.mjs
//
// Covers:
//   - the panel keeps only the quick options, the rest opens in the dialog
//   - every tab opens; "Batterietypen" only while batteries are on
//   - the category list switches a category and selects its detail
//   - a switched-off category greys its detail out
//   - a tab stays mounted while hidden (an unsaved draft survives a tab change)
//   - the jump buttons in "Optik" open the dialog on their tab
//   - a narrow dialog stacks the category list above the detail
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const pageErrors = [];

async function openEditor(viewport, options = {}) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });
    await page.evaluate(() => {
        const s = window.__auraShot;
        s.captureWrites(true);
        s.mockObjectView({ state: [], device: [], enum: [] });
    });
    await page.evaluate(
        (options) =>
            window.__auraShot.showWidgets([
                {
                    id: 'w-cfg',
                    type: 'statusoverview',
                    title: 'Status',
                    datapoint: '',
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 6, h: 8 },
                    options,
                },
            ]),
        options,
    );
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.locator('.aura-widget-edit-modal').waitFor({ timeout: 10000 });
    await page.evaluate(() => window.__auraShot.unfoldSections?.());
    const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-cfg'));
    return { ctx, page, opts };
}

// ── 1. panel vs. dialog, tabs, category list ──
{
    const { ctx, page, opts } = await openEditor({ width: 1400, height: 900 });
    const panel = page.locator('.aura-widget-edit-modal');
    check(
        'panel no longer holds the category switches',
        (await panel.locator('label:text-is("Berücksichtigte Datenpunkte")').count()) === 0,
    );
    check('panel keeps "Sortierung"', (await panel.locator('label:text-is("Sortierung")').count()) === 1);
    check(
        'panel summary counts the categories',
        (await page.locator('[data-status-config-summary]').textContent()).includes('5 von 5 Kategorien'),
    );

    await page.locator('[data-status-config-open]').click();
    const dlg = page.locator('.aura-config-modal');
    await dlg.waitFor({ timeout: 10000 });
    const tabKeys = await dlg.locator('[data-config-tab]').evaluateAll((b) => b.map((x) => x.dataset.configTab));
    check(
        'all tabs present',
        JSON.stringify(tabKeys) ===
            JSON.stringify(['categories', 'datapoints', 'latch', 'rows', 'actions', 'names', 'batteries']),
        JSON.stringify(tabKeys),
    );
    for (const key of tabKeys.filter((k) => k !== 'batteries')) {
        await dlg.locator(`[data-config-tab="${key}"]`).click();
        check(`tab "${key}" shows its pane`, await dlg.locator(`[data-config-pane="${key}"]`).isVisible());
    }

    // Category list: selecting and switching.
    await dlg.locator('[data-config-tab="categories"]').click();
    await dlg.locator('[data-status-cat="light"] button').first().click();
    check('selecting shows the detail', (await dlg.locator('[data-status-cat-detail="light"]').count()) === 1);
    await dlg.locator('[data-status-cat="light"] [role="switch"]').click();
    check('list switch writes catLight', (await opts())?.catLight === false, JSON.stringify(await opts()));
    check(
        'switched-off category is greyed',
        (await dlg.locator('[data-status-cat-detail="light"] > .aura-cfg-unavailable').count()) === 1,
    );
    check(
        'tab label counts active categories',
        (await dlg.locator('[data-config-tab="categories"]').textContent()).includes('(4)'),
    );
    // Battery off: the battery-type tab goes away.
    await dlg.locator('[data-status-cat="battery"] [role="switch"]').click();
    check(
        '"Batterietypen" tab hidden without batteries',
        (await dlg.locator('[data-config-tab="batteries"]').count()) === 0,
    );
    await dlg.locator('[data-status-cat="battery"] [role="switch"]').click();

    // A hidden tab keeps its state: type into a filter, switch away and back.
    await dlg.locator('[data-config-tab="datapoints"]').click();
    const rooms = dlg.locator('[data-config-pane="datapoints"] input[type=text]').first();
    await rooms.fill('Küche');
    await dlg.locator('[data-config-tab="rows"]').click();
    await dlg.locator('[data-config-tab="datapoints"]').click();
    check('filter value survives a tab change', (await rooms.inputValue()) === 'Küche');
    check('filter writes filterRooms', (await opts())?.filterRooms === 'Küche');

    // Merkliste chip: jumps to the category and makes its latch switch blink.
    await dlg.locator('[data-config-tab="latch"]').click();
    await dlg.locator('[data-latch-jump="unreach"]').click();
    const latchRow = dlg.locator('[data-status-cat-detail="unreach"] [data-latch-toggle="unreach"]');
    await latchRow.waitFor({ timeout: 5000 });
    check(
        'chip jumps to "Kategorien"',
        (await dlg.locator('[data-config-tab="categories"]').getAttribute('aria-selected')) === 'true',
    );
    await page.waitForTimeout(100);
    check('latch switch blinks', (await latchRow.evaluate((el) => el.getAnimations().length)) > 0);

    await page.keyboard.press('Escape');
    check('Escape closes the dialog', (await page.locator('.aura-config-modal').count()) === 0);

    // Jump button from "Optik" opens the dialog on its tab.
    await page.locator('.aura-widget-edit-modal button:has-text("Gerätenamen")').click();
    await page.locator('.aura-config-modal').waitFor({ timeout: 5000 });
    check(
        'jump button opens "Namen"',
        (await page.locator('[data-config-tab="names"]').getAttribute('aria-selected')) === 'true',
    );
    await ctx.close();
}

// ── 2. narrow: the category list stacks above the detail ──
{
    const { ctx, page } = await openEditor({ width: 420, height: 800 });
    await page.locator('[data-status-config-open]').click();
    const dlg = page.locator('.aura-config-modal');
    await dlg.waitFor({ timeout: 10000 });
    const box = await page.evaluate(() => {
        const l = document.querySelector('[data-status-cat-list]')?.getBoundingClientRect();
        const d = document.querySelector('[data-status-cat-detail]')?.getBoundingClientRect();
        return { listBottom: l?.bottom ?? 0, detailTop: d?.top ?? 0 };
    });
    check('narrow: list above detail', box.listBottom > 0 && box.detailTop >= box.listBottom, JSON.stringify(box));
    const overflow = await page.evaluate(() => {
        const m = document.querySelector('[data-config-pane="categories"]');
        return m ? m.scrollWidth - m.clientWidth : -1;
    });
    check('narrow: no horizontal overflow', overflow === 0, String(overflow));
    await ctx.close();
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
