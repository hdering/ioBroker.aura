// Verifies that condition rules can be reordered after the fact (issue #623).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/condition-reorder.mjs
//
// Rules are applied top to bottom and the last one wins per property, so their
// order is configuration. Two editors own every rule list in the app:
//
//   ConditionEditor         — widget conditions, tab conditions (frontend + admin)
//   ElementConditionEditor  — list rows (static + dynamic), row datapoints, cells
//
// This drives one entry point of each and reads the stored order back, so the
// arrows are checked where the rules actually persist. The grip next to them is
// the drag path into the same move().
//
// Datapoint values are injected via the screenshot harness (__auraShot.mock) —
// no socket write, no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.plug.STATE';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const rule = (id) => ({
    id,
    label: id,
    logic: 'AND',
    clauses: [{ datapoint: DP, operator: 'true', value: '' }],
    style: {},
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
// The edit dialog folds every section; this test fills in settings, so open them all.
await page.evaluate(() => window.__auraShot.unfoldSections());

const settle = () => page.waitForTimeout(300);

// The grip is the drag source, the card the drop target — the shape the datapoint
// manager already uses. Playwright's synthesised mouse gestures never reach `drop`
// in this app, so the gesture is replayed as the three events a real drag fires,
// one turn apart: `dragstart` only records the source through a state update, and
// a `drop` in the same tick would still see the old one.
async function dragRule(scope, from, to) {
    await page.evaluate(
        ([sel, i]) => {
            window.__dragDt = new DataTransfer();
            window.__dragCards = [...document.querySelectorAll(`${sel} .rounded-xl.overflow-hidden`)].filter((c) =>
                c.querySelector('[data-aura-rule-grip]'),
            );
            const grip = window.__dragCards[i].querySelector('[data-aura-rule-grip]');
            grip.dispatchEvent(
                new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: window.__dragDt }),
            );
        },
        [scope, from],
    );
    await settle();
    for (const type of ['dragover', 'drop']) {
        await page.evaluate(
            ([t, i]) => {
                window.__dragCards[i].dispatchEvent(
                    new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: window.__dragDt }),
                );
            },
            [type, to],
        );
        await settle();
    }
}

// ── 1. widget conditions (ConditionEditor) ───────────────────────────────────

await page.evaluate(
    ([dp, conditions]) => {
        window.__auraShot.mock({ [dp]: true });
        window.__auraShot.mockServerState({ [dp]: true });
        window.__auraShot.showWidgets(
            [
                {
                    id: 'w-cond-order',
                    type: 'value',
                    title: 'Wert',
                    datapoint: dp,
                    gridPos: { x: 0, y: 0, w: 10, h: 6 },
                    options: { conditions },
                },
            ],
            { editMode: true },
        );
        window.__auraShot.setEditMode(true);
    },
    [DP, [rule('a'), rule('b'), rule('c')]],
);

const widgetOrder = () =>
    page.evaluate(() => (window.__auraShot.widgetOptions('w-cond-order').conditions ?? []).map((c) => c.id));

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:has-text("Bedingungen")').first().click();

const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
await dlg.locator('[data-aura-rule-move="down"]').first().waitFor({ timeout: 10000 });

eq('widget: order starts as configured', await widgetOrder(), ['a', 'b', 'c']);
check(
    'widget: every rule offers a grip',
    (await dlg.locator('[data-aura-rule-grip]').count()) === 3,
    String(await dlg.locator('[data-aura-rule-grip]').count()),
);
check('widget: the first rule cannot move up', await dlg.locator('[data-aura-rule-move="up"]').first().isDisabled());
check('widget: the last rule cannot move down', await dlg.locator('[data-aura-rule-move="down"]').last().isDisabled());

await dlg.locator('[data-aura-rule-move="down"]').first().click();
await settle();
eq('widget: down moves the first rule one slot', await widgetOrder(), ['b', 'a', 'c']);

await dlg.locator('[data-aura-rule-move="up"]').nth(2).click();
await settle();
eq('widget: up moves the last rule one slot', await widgetOrder(), ['b', 'c', 'a']);

// The card keeps its identity across the move — the rule name follows the row.
const firstLabel = await dlg.locator('input[placeholder="Regelname (optional)"]').first().inputValue();
check('widget: the moved card carries its rule with it', firstLabel === 'b', firstLabel);

await dragRule('.aura-widget-edit-modal', 0, 2);
eq('widget: dragging the grip onto the last card moves the rule there', await widgetOrder(), ['c', 'a', 'b']);

await page.keyboard.press('Escape');
await settle();

// ── 2. list row conditions (ElementConditionEditor) ──────────────────────────

const rowRule = (id) => ({
    id,
    label: id,
    logic: 'AND',
    target: 'name',
    clauses: [{ datapoint: '{dp}', operator: 'true', value: '' }],
});

await page.evaluate(
    ([dp, rowConditions]) => {
        window.__auraShot.mock({ [dp]: true });
        window.__auraShot.mockServerState({ [dp]: true });
        window.__auraShot.showWidgets(
            [
                {
                    id: 'w-rowcond-order',
                    type: 'list',
                    title: 'Liste',
                    datapoint: '',
                    gridPos: { x: 0, y: 0, w: 12, h: 8 },
                    options: { entries: [{ id: dp, label: 'Steckdose' }], rowConditions },
                },
            ],
            { editMode: true },
        );
        window.__auraShot.setEditMode(true);
    },
    [DP, [rowRule('x'), rowRule('y'), rowRule('z')]],
);

const rowOrder = () =>
    page.evaluate(() => (window.__auraShot.widgetOptions('w-rowcond-order').rowConditions ?? []).map((r) => r.id));

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const trigger = page.locator('button:has-text("Datenpunkte verwalten")').first();
await trigger.waitFor({ timeout: 10000 });
await trigger.click();

const listDlg = page.locator('.aura-config-modal');
await listDlg.waitFor({ timeout: 10000 });
await listDlg.locator('button:text-is("Bedingungen")').first().click();
await listDlg.locator('[data-aura-rule-move="down"]').first().waitFor({ timeout: 10000 });

eq('list: order starts as configured', await rowOrder(), ['x', 'y', 'z']);

await listDlg.locator('[data-aura-rule-move="down"]').first().click();
await settle();
eq('list: down moves the first rule one slot', await rowOrder(), ['y', 'x', 'z']);

await listDlg.locator('[data-aura-rule-move="up"]').nth(1).click();
await settle();
eq('list: up moves the middle rule one slot', await rowOrder(), ['x', 'y', 'z']);

await dragRule('.aura-config-modal', 2, 0);
eq('list: dragging the grip onto the first card moves the rule there', await rowOrder(), ['z', 'x', 'y']);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
