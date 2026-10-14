// Verifies the optional auto-close countdown of popups against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/popup-countdown.mjs
//
// The countdown shows the seconds until an auto-closing popup closes itself, in a
// configurable corner. Asserted here:
//
//   1. It resolves through click action > popup view > global (default: none), and
//      'off' on a nearer level hides an inherited corner.
//   2. It only appears while an auto-close is actually pending.
//   3. It runs down, and pointer activity inside the popup pushes it back up.
//   4. Each corner lands in its corner; top-right stays clear of the close button.
//
// Popups are opened through the datapoint triggers like popup-padding.mjs.
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.popupCountdownTrigger';
const SHOT_DIR = process.env.AURA_SHOT_DIR ?? os.tmpdir();
const VIEW_ID = 'pv-countdown-test';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `gemessen ${got}, erwartet ${want}`);

function trigger(options) {
    return {
        id: 'pt-countdown',
        name: 'Countdown',
        enabled: true,
        clause: { datapoint: DP, operator: 'true', value: '' },
        host: {
            id: 'ptw-countdown',
            type: 'value',
            title: 'Popup',
            datapoint: DP,
            gridPos: { x: 0, y: 0, w: 1, h: 1 },
            options,
        },
        resetDp: false,
    };
}

const view = (extra = {}) => [
    {
        id: VIEW_ID,
        name: 'Countdown-Test',
        widgets: [
            {
                id: 'pw-val',
                type: 'value',
                title: 'Wert',
                datapoint: 'demo.value',
                gridPos: { x: 0, y: 0, w: 2, h: 2 },
                options: {},
            },
        ],
        ...extra,
    },
];
const action = (extra = {}) => ({ clickAction: { kind: 'popup-view', viewId: VIEW_ID }, ...extra });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const settle = () => page.waitForTimeout(450);

/** Arm the trigger, open the popup, return the countdown's corner, text and geometry. */
async function open(options, views) {
    await page.keyboard.press('Escape');
    await settle();
    await page.evaluate(
        ([dp, rule, vs]) => {
            window.__auraShot.mock({ 'demo.value': { val: 21.5, unit: '°C' }, [dp]: false });
            window.__auraShot.popupViews(vs);
            window.__auraShot.dpTriggers([rule]);
        },
        [DP, trigger(options), views],
    );
    await settle();
    await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), DP);
    await settle();
    return measure();
}

function measure() {
    return page.evaluate(() => {
        const backdrop = document.querySelector('[data-aura-click-popup]');
        if (!backdrop) return { open: false };
        const dialog = backdrop.firstElementChild;
        const cd = dialog.querySelector('.aura-popup-countdown');
        if (!cd) return { open: true, pos: null };
        const r = cd.getBoundingClientRect();
        const d = dialog.getBoundingClientRect();
        const close = dialog.querySelector(':scope > button').getBoundingClientRect();
        return {
            open: true,
            pos: cd.getAttribute('data-aura-popup-countdown'),
            secs: parseInt(cd.querySelector('.aura-popup-countdown-value').textContent, 10),
            left: Math.round(r.left - d.left),
            right: Math.round(d.right - r.right),
            top: Math.round(r.top - d.top),
            bottom: Math.round(d.bottom - r.bottom),
            clearOfClose: r.right <= close.left,
        };
    });
}

// ── 1. Without a corner there is no countdown, even with auto-close ───────────
const none = await open(action({ popupAutoCloseSec: 30 }), view());
check('Popup öffnet', none.open);
eq('ohne Einstellung kein Countdown', none.pos, null);

// ── 2. View level, then the click action wins, 'off' hides an inherited corner ─
eq(
    'View-Einstellung zeigt den Countdown',
    (await open(action({ popupAutoCloseSec: 30 }), view({ autoCloseCountdown: 'bottom-left' }))).pos,
    'bottom-left',
);
eq(
    'Klick-Aktion schlägt die View',
    (
        await open(
            action({ popupAutoCloseSec: 30, popupAutoCloseCountdown: 'top-left' }),
            view({ autoCloseCountdown: 'bottom-left' }),
        )
    ).pos,
    'top-left',
);
eq(
    "'aus' an der Klick-Aktion blendet die View-Ecke aus",
    (
        await open(
            action({ popupAutoCloseSec: 30, popupAutoCloseCountdown: 'off' }),
            view({ autoCloseCountdown: 'bottom-left' }),
        )
    ).pos,
    null,
);

// ── 3. No auto-close → no countdown ───────────────────────────────────────────
eq(
    'ohne Auto-Schließen kein Countdown',
    (await open(action({ popupAutoCloseSec: 0, popupAutoCloseCountdown: 'top-left' }), view())).pos,
    null,
);

// ── 4. It runs down, activity resets it ───────────────────────────────────────
await page.mouse.move(5, 5);
const first = await open(action({ popupAutoCloseSec: 30, popupAutoCloseCountdown: 'bottom-right' }), view());
check('startet bei der vollen Zeit', first.secs >= 29 && first.secs <= 30, `${first.secs} s`);
await page.waitForTimeout(2300);
const later = await measure();
check('läuft herunter', later.secs <= first.secs - 2, `${first.secs} → ${later.secs} s`);
const box = await page.locator('[data-aura-click-popup] > div').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2 + 5);
await page.waitForTimeout(300);
const reset = await measure();
check('Bewegung im Popup setzt zurück', reset.secs >= 29, `${reset.secs} s`);
await page.mouse.move(5, 5);

// ── 5. Corners ────────────────────────────────────────────────────────────────
for (const pos of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    const m = await open(action({ popupAutoCloseSec: 30, popupAutoCloseCountdown: pos }), view());
    const [v, h] = pos.split('-');
    const okV = m[v] <= 12;
    const okH = h === 'left' ? m.left <= 12 : pos === 'top-right' ? m.clearOfClose : m.right <= 12;
    check(`Ecke ${pos}`, m.pos === pos && okV && okH, JSON.stringify(m));
    await page.screenshot({
        path: path.join(SHOT_DIR, `popup-countdown-${pos}.png`),
        clip: await page.locator('[data-aura-click-popup] > div').boundingBox(),
    });
}

// ── 6. The popup really closes when it reaches zero ───────────────────────────
await open(action({ popupAutoCloseSec: 2, popupAutoCloseCountdown: 'top-left' }), view());
await page.mouse.move(5, 5);
await page.waitForTimeout(2600);
check('Popup schließt nach Ablauf', !(await measure()).open);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Checks ok`);
process.exit(failed.length ? 1 : 0);
