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

async function openEditor(viewport, options = {}, objects = { state: [], device: [], enum: [] }) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });
    await page.evaluate((objects) => {
        const s = window.__auraShot;
        s.captureWrites(true);
        s.mockObjectView(objects);
    }, objects);
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

    // Extra battery datapoints (e.g. Shelly over MQTT) sit in the battery category.
    await dlg.locator('[data-status-cat="battery"] button').first().click();
    await dlg.locator('[data-battery-extra] input').fill('mqtt.0.shelly.');
    check('extra battery patterns write the option', (await opts())?.batteryExtraPatterns === 'mqtt.0.shelly.');
    // Same field in alarm, window and light.
    for (const [cat, key] of [
        ['alarm', 'alarmExtraPatterns'],
        ['window', 'windowExtraPatterns'],
        ['light', 'lightExtraPatterns'],
    ]) {
        // Light was switched off above - its greyed fields take no input.
        if (cat === 'light') await dlg.locator('[data-status-cat="light"] [role="switch"]').click();
        await dlg.locator(`[data-status-cat="${cat}"] button`).first().click();
        await dlg.locator(`[data-status-cat-detail="${cat}"] [data-extra-patterns="${key}"] input`).fill('mqtt.0.x.');
        check(`extra ${cat} patterns write the option`, (await opts())?.[key] === 'mqtt.0.x.');
    }
    // "+ Datenpunkt" opens the datapoint picker on top of the dialog; closing it keeps the field.
    await dlg.locator('[data-extra-patterns="lightExtraPatterns"] [data-extra-pick]').click();
    const picker = page.locator('.fixed.inset-0.bg-black\\/70');
    await picker.first().waitFor({ timeout: 5000 });
    check('picker opens from the pattern field', (await picker.count()) >= 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check(
        'closing the picker keeps the dialog and the value',
        (await page.locator('.aura-config-modal').count()) === 1 && (await opts())?.lightExtraPatterns === 'mqtt.0.x.',
    );
    const withButton = [];
    for (const cat of ['window', 'battery', 'light', 'unreach', 'alarm']) {
        await dlg.locator(`[data-status-cat="${cat}"] button`).first().click();
        if ((await dlg.locator(`[data-status-cat-detail="${cat}"] [data-extra-pick]`).count()) === 1)
            withButton.push(cat);
    }
    check('every category pattern field has the button', withButton.length === 5, withButton.join());

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

// ── 3. "Namen": preview on top, then the three numbered steps general → specific ──
{
    const st = (id, name) => ({
        id,
        value: {
            _id: id,
            type: 'state',
            common: { name, role: 'value.battery', type: 'number', unit: '%', read: true, write: false },
            native: {},
        },
    });
    const dev = (id, name) => ({ id, value: { _id: id, type: 'device', common: { name }, native: {} } });
    const { ctx, page, opts } = await openEditor(
        { width: 1300, height: 900 },
        { catWindow: false, catLight: false, catUnreach: false, catAlarm: false, batteryTypeEnabled: false },
        {
            state: [st('zigbee.0.a1.battery', 'Batterie'), st('zigbee.0.a2.battery', 'Batterie')],
            device: [dev('zigbee.0.a1', 'Fenster Bad'), dev('zigbee.0.a2', 'Bewegung Flur')],
            enum: [],
        },
    );
    await page.locator('[data-status-config-open]').click();
    const dlg = page.locator('.aura-config-modal');
    await dlg.locator('[data-config-tab="names"]').click();
    const pane = dlg.locator('[data-config-pane="names"]');
    const order = await pane.evaluate((p) => {
        const top = (sel) => p.querySelector(sel)?.getBoundingClientRect().top ?? -1;
        return [
            top('[data-name-preview]'),
            top('[data-name-step="1"]'),
            top('[data-name-step="2"]'),
            top('[data-name-step="3"]'),
        ];
    });
    check(
        'preview, then steps 1 → 2 → 3',
        order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])),
        JSON.stringify(order),
    );
    check(
        'rules step folded without rules',
        !(await pane.locator('details[data-name-step="2"]').evaluate((d) => d.open)),
    );
    await pane.locator('details[data-name-step="2"] > summary').click();
    await pane.locator('details[data-name-step="2"] button:has-text("Regel hinzufügen")').waitFor({ timeout: 10000 });
    check(
        'rule editor keeps no preview of its own',
        (await pane.locator('details[data-name-step="2"] >> text=Vorschau >> visible=true').count()) === 0,
    );
    // The shared preview follows the pattern.
    await pane.locator('[data-name-step="1"] input[type=text]').fill('X <Name>');
    await page.waitForTimeout(300);
    const prev = await pane.locator('[data-name-preview]').textContent();
    check('preview follows the pattern', prev.includes('→ X '), prev);
    check('pattern writes namePattern', (await opts())?.namePattern === 'X <Name>');
    if (process.env.AURA_SHOT_DIR) await dlg.screenshot({ path: `${process.env.AURA_SHOT_DIR}/names-tab.png` });
    await ctx.close();
}

// ── 4. "Zeilen-Aktionen": existing buttons start folded, "Klick auf Zeile" has its own heading ──
{
    const { ctx, page, opts } = await openEditor(
        { width: 1300, height: 900 },
        { rowActions: [{ label: 'Aus', targetDp: '{id}', value: 'false', categories: ['light'] }] },
    );
    await page.locator('[data-status-config-open]').click();
    const dlg = page.locator('.aura-config-modal');
    await dlg.locator('[data-config-tab="actions"]').click();
    const row = dlg.locator('[data-row-action="0"]');
    check('existing button starts folded', (await row.locator('input[aria-label="Beschriftung"]').count()) === 0);
    const sum = await row.locator('[data-row-action-summary]').textContent();
    check('folded row names label and target', sum.includes('Aus') && sum.includes('{id}'), sum);
    check(
        '"Klick auf Zeile" is a heading of its own',
        (
            await dlg
                .locator('.aura-status-row-click [data-aura-subgroup], .aura-status-row-click')
                .first()
                .textContent()
        ).startsWith('Klick auf Zeile'),
    );
    await row.locator('[data-row-action-toggle]').click();
    check('toggle unfolds it', (await row.locator('input[aria-label="Beschriftung"]').count()) === 1);
    // A new button opens right away - it needs filling in.
    await dlg.locator('button:has-text("Knopf hinzufügen")').click();
    check(
        'new button opens unfolded',
        (await dlg.locator('[data-row-action="1"] input[aria-label="Ziel-Datenpunkt"]').count()) === 1,
    );
    // Removing the first keeps the (now first) new one open.
    await row.locator('button[title="Entfernen"]').click();
    check(
        'open state follows a removal',
        (await dlg.locator('[data-row-action="0"] input[aria-label="Ziel-Datenpunkt"]').count()) === 1 &&
            (await opts())?.rowActions?.length === 1,
    );
    await ctx.close();
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
