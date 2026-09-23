// Click-action icon (issue #702): a widget with a click action shows a small button
// that runs it — expanded in the card corner, folded at the right end of the header.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/click-action-icon.mjs
//
// Checked in the browser: the icon appears for an own action and runs it, can be
// switched off, stays away for a type-level default unless opted in, follows its
// corner, steps aside for the fullscreen and fold buttons, is absent in the editor,
// while folded runs the action without unfolding (a tap beside it unfolds) and does
// not make the folded card taller, and that Appearance always lists the option
// (greyed out without a click action). The rules themselves are covered by
// click-action-icon-logic.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const MARKER = 'CLICK-ICON-OK';
const CLICK_ACTION = { kind: 'popup-html', html: `<b>${MARKER}</b>` };

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const widget = (id, type, options = {}, gridPos = { x: 0, y: 0, w: 14, h: 10 }) => ({
    id,
    type,
    title: 'Klick-Probe',
    datapoint: 'demo.temp',
    layout: 'default',
    gridPos,
    options,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() => window.__auraShot.mockServerState({ 'demo.temp': { val: 21.5, unit: '°C' } }));

const settle = () => page.waitForTimeout(500);
let seq = 0;
/** Fresh id per case: the collapse store and the harness remember widgets by id. */
async function show(type, options, gridPos) {
    const id = `cai-${++seq}`;
    await page.evaluate(([w]) => window.__auraShot.showWidgets([w]), [widget(id, type, options, gridPos)]);
    await settle();
    return id;
}
const card = (id) => page.locator(`[data-aura-widget="${id}"]`).first();
const icon = (id) => card(id).locator('[data-click-action-icon]');
const popupVisible = () =>
    page
        .locator(`text=${MARKER}`)
        .first()
        .isVisible({ timeout: 800 })
        .catch(() => false);
const closePopup = () => page.keyboard.press('Escape').then(settle);

// ── 1. Own action: icon on by default, runs the action ────────────────────────
let id = await show('value', { clickAction: CLICK_ACTION });
check('own action shows the icon', (await icon(id).count()) === 1);
if ((await icon(id).count()) === 1) {
    await icon(id).click();
    await settle();
    check('the icon runs the action', await popupVisible());
    await closePopup();
}

// ── 2. Switched off / no action ────────────────────────────────────────────────
id = await show('value', { clickAction: CLICK_ACTION, clickActionIcon: false });
check('clickActionIcon:false hides it', (await icon(id).count()) === 0);
id = await show('value', {});
check('no action, no icon', (await icon(id).count()) === 0);

// ── 3. Type-level default (slider → built-in popup) needs an opt-in ───────────
id = await show('slider', {});
check('type default: no icon by default', (await icon(id).count()) === 0);
id = await show('slider', { clickActionIcon: true });
check('type default: icon when opted in', (await icon(id).count()) === 1);

// ── 4. Corner ──────────────────────────────────────────────────────────────────
for (const [pos, test] of [
    ['tr', (b, c) => c.x + c.width - (b.x + b.width) < 12 && b.y - c.y < 12],
    ['tl', (b, c) => b.x - c.x < 12 && b.y - c.y < 12],
    ['br', (b, c) => c.x + c.width - (b.x + b.width) < 12 && c.y + c.height - (b.y + b.height) < 12],
]) {
    id = await show('value', { clickAction: CLICK_ACTION, clickActionIconPosition: pos });
    const b = await icon(id).boundingBox();
    const c = await card(id).boundingBox();
    check(`corner ${pos}`, !!b && !!c && test(b, c), JSON.stringify({ b, c }));
}

// ── 5. Shares the corner with fullscreen + fold button without overlap ────────
id = await show('value', {
    clickAction: CLICK_ACTION,
    fullscreenWidget: true,
    defaultCollapsed: true,
});
// Unfold first: the fold button only exists while expanded.
await card(id).locator('[data-collapsed-header]').click();
await settle();
await card(id).hover();
const boxes = await card(id)
    .locator('[data-click-action-icon], [data-fullscreen-open], [data-collapse-toggle]')
    .evaluateAll((els) =>
        els.map((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }),
    );
const overlap = boxes.some((a, i) =>
    boxes.some((b, j) => i !== j && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom),
);
check('three corner buttons, no overlap', boxes.length === 3 && !overlap, `${boxes.length} buttons`);

// ── 6. Folded: icon in the header, runs the action without unfolding ──────────
const foldedPlain = await show('value', { defaultCollapsed: true });
const plainH = (await card(foldedPlain).boundingBox())?.height ?? 0;
id = await show('value', { clickAction: CLICK_ACTION, defaultCollapsed: true });
const header = card(id).locator('[data-collapsed-header]');
check('folded header carries the icon', (await header.locator('[data-click-action-icon]').count()) === 1);
const foldedH = (await card(id).boundingBox())?.height ?? 0;
check('the icon does not make the folded card taller', Math.abs(foldedH - plainH) < 1, `${foldedH} vs ${plainH}`);
await header.locator('[data-click-action-icon]').click();
await settle();
check('folded icon runs the action', await popupVisible());
await closePopup();
check('…and the card stays folded', (await card(id).locator('[data-collapsed-header]').count()) === 1);
await header.click({ position: { x: 30, y: 10 } });
await settle();
check('a tap beside the icon unfolds', (await card(id).locator('[data-collapsed-header]').count()) === 0);
check('unfolded: the icon moves to the corner', (await icon(id).count()) === 1);

// ── 7. Editor: no icon ─────────────────────────────────────────────────────────
id = await show('value', { clickAction: CLICK_ACTION });
await page.evaluate(() => window.__auraShot.setEditMode(true));
await settle();
check('no icon in the editor', (await icon(id).count()) === 0);
await page.evaluate(() => window.__auraShot.setEditMode(false));

// ── 8. Appearance lists the option always, greyed out without an action ──────
async function openAppearance(options) {
    const wid = `cai-${++seq}`;
    await page.evaluate(
        ([w]) => {
            window.__auraShot.showWidgets([w], { editMode: true });
            window.__auraShot.setEditMode(true);
        },
        [widget(wid, 'value', options)],
    );
    await settle();
    await card(wid).hover();
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const dlg = page.locator('.aura-widget-edit-modal');
    await dlg.waitFor({ timeout: 10000 });
    await dlg.locator('summary:has(span:text-is("Darstellung"))').first().click();
    await page.waitForTimeout(300);
    return dlg;
}
let dlg = await openAppearance({});
const section = dlg.locator('[data-click-action-icon-section]');
check('without an action the option is still listed', (await section.count()) === 1);
check('…greyed out', (await section.getAttribute('aria-disabled')) === 'true');
check('…and its switch is disabled', await dlg.locator('[data-click-action-icon-option]').isDisabled());
await page.keyboard.press('Escape');
await settle();
dlg = await openAppearance({ clickAction: CLICK_ACTION });
check('with an action the switch is enabled', !(await dlg.locator('[data-click-action-icon-option]').isDisabled()));
check(
    '…and the section is not greyed',
    (await dlg.locator('[data-click-action-icon-section]').getAttribute('aria-disabled')) === 'false',
);
await page.keyboard.press('Escape');
await page.evaluate(() => window.__auraShot.setEditMode(false));

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\nclick-action-icon: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
