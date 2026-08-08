// Verifies the click action stays reachable on iframe-bodied widgets (issue #527)
// against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/embed-action-button.mjs
//
// A click inside a foreign document never enters the host document's event path,
// so the frame click action is unreachable while the embedded page is operable.
// Checked: the action button appears exactly in that case, it triggers the action,
// the blocker mode still works via the frame click, `contentOnly` opts out, and the
// legacy `allowInteraction: false` still maps to the blocker.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const MARKER = 'EMBED-ACTION-OK';
const PAGE = 'data:text/html,<body style="margin:0;background:%23dbeafe"><h3>embedded</h3></body>';
const CLICK_ACTION = { kind: 'popup-html', html: `<b>${MARKER}</b>` };

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

function widget(type, options) {
    return {
        id: 'embed-test',
        type,
        title: 'Embed',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 14, h: 10 },
        options,
    };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const settle = () => page.waitForTimeout(500);
const actionBtn = () => page.locator('[data-embed-action]');
const popupVisible = () =>
    page
        .locator(`text=${MARKER}`)
        .first()
        .isVisible({ timeout: 500 })
        .catch(() => false);
const closePopup = () => page.keyboard.press('Escape').then(settle);

async function show(type, options) {
    await page.evaluate(([w]) => window.__auraShot.showWidgets([w]), [widget(type, options)]);
    await settle();
}

// ── 1. content mode: button present and it runs the action ────────────────────
await show('iframe', { iframeUrl: PAGE, interactionMode: 'content', clickAction: CLICK_ACTION });
check('content mode shows the action button', (await actionBtn().count()) === 1);
if ((await actionBtn().count()) === 1) {
    await actionBtn().click();
    await settle();
    check('action button opens the popup', await popupVisible());
    await closePopup();
}

// ── 2. No click action → no button (no chrome on untouched dashboards) ────────
await show('iframe', { iframeUrl: PAGE, interactionMode: 'content' });
check('no button without a click action', (await actionBtn().count()) === 0);

// ── 3. action mode: blocker overlay keeps the frame click working, no button ──
await show('iframe', { iframeUrl: PAGE, interactionMode: 'action', clickAction: CLICK_ACTION });
check('action mode shows no button', (await actionBtn().count()) === 0);
await page.locator('.aura-widget-embed-test').click({ position: { x: 120, y: 120 } });
await settle();
check('action mode opens the popup on a frame click', await popupVisible());
await closePopup();

// ── 4. contentOnly: opts out of the button, action stays inert (by design) ────
await show('iframe', { iframeUrl: PAGE, interactionMode: 'contentOnly', clickAction: CLICK_ACTION });
check('contentOnly shows no button', (await actionBtn().count()) === 0);
await page.locator('.aura-widget-embed-test').click({ position: { x: 120, y: 120 } });
await settle();
check('contentOnly swallows the click (documents the browser limit)', !(await popupVisible()));

// ── 5. Legacy option still maps to the blocker ────────────────────────────────
await show('iframe', { iframeUrl: PAGE, allowInteraction: false, clickAction: CLICK_ACTION });
check('legacy allowInteraction:false → no button', (await actionBtn().count()) === 0);
await page.locator('.aura-widget-embed-test').click({ position: { x: 120, y: 120 } });
await settle();
check('legacy allowInteraction:false still opens the popup', await popupVisible());
await closePopup();

// ── 6. Legacy allowInteraction:true migrates to content → button appears ─────
await show('iframe', { iframeUrl: PAGE, allowInteraction: true, clickAction: CLICK_ACTION });
check('legacy allowInteraction:true → button appears', (await actionBtn().count()) === 1);

// ── 7. Does not collide with the widget's own fullscreen button ───────────────
// Two arrangements: with a title row the fullscreen button sits below it, without
// one both land in the same corner and the action button has to step aside.
async function buttonBoxes() {
    return page.locator('.aura-widget-embed-test button').evaluateAll((els) =>
        els.map((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }),
    );
}
const overlapping = (boxes) =>
    boxes.some((a, i) =>
        boxes.some((b, j) => i !== j && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom),
    );

for (const [label, chrome] of [
    ['with title row', {}],
    ['without title row', { showTitle: false, showIcon: false }],
]) {
    await show('iframe', {
        iframeUrl: PAGE,
        interactionMode: 'content',
        fullscreenButton: true,
        clickAction: CLICK_ACTION,
        ...chrome,
    });
    const boxes = await buttonBoxes();
    check(
        `action and fullscreen button do not overlap (${label})`,
        boxes.length === 2 && !overlapping(boxes),
        `${boxes.length} buttons`,
    );
}

// ── 8. The other iframe-bodied widgets get the button too ────────────────────
await show('html', { htmlContent: '<b>hi</b>', clickAction: CLICK_ACTION });
check('html widget shows the action button', (await actionBtn().count()) === 1);

await show('echartsPreset', { presetId: 'demo-preset', clickAction: CLICK_ACTION });
check('echartsPreset widget shows the action button', (await actionBtn().count()) === 1);

// A plain img camera stream is host DOM — its frame click already works, so no button.
await show('camera', { streamUrl: 'https://example.invalid/cam.jpg', clickAction: CLICK_ACTION });
check('camera in img mode shows no button', (await actionBtn().count()) === 0);

await show('camera', { streamUrl: 'https://example.invalid/cam.html', clickAction: CLICK_ACTION });
check('camera in iframe mode shows the action button', (await actionBtn().count()) === 1);

// ── 9. Type switch inside the same frame must not leave a stale button ───────
await show('iframe', { iframeUrl: PAGE, interactionMode: 'content', clickAction: CLICK_ACTION });
await page.evaluate(
    ([w]) => window.__auraShot.showWidgets([w]),
    [{ ...widget('value', { clickAction: CLICK_ACTION }), datapoint: 'demo.value' }],
);
await settle();
check('button disappears after a type switch', (await actionBtn().count()) === 0);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
