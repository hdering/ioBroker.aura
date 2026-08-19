// Documentation screenshots for the message system (issue #429).
// Output: docs/widgets/assets/meldungen/runtime.png (Verlauf-Widget)
//         docs/einstellungen/assets/meldungen-toast.png (Einblendungen)
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/messages.mjs
//
// Both images used to be captured by hand against the dev-proxy instance, which runs
// the dark theme — the rest of the documentation is light. The harness forces the light
// theme, so generating them here keeps the whole documentation consistent.
//
// Messages are pushed straight into the store (`__auraShot.message*`), so no datapoint
// is ever written. Timestamps are relative to the run, which is what produces the
// "vor 1 min" / "vor 2 h 30 min" labels in the archive.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const WIDGET_OUT = 'docs/widgets/assets/meldungen';
const ADMIN_OUT = 'docs/einstellungen/assets';
const WIDGET_ID = 'w-msg-doc';

mkdirSync(WIDGET_OUT, { recursive: true });
mkdirSync(ADMIN_OUT, { recursive: true });

const now = Date.now();
/** A normalized message, as the adapter would have produced it. */
const msg = (o) => ({
    id: 'm',
    ts: now,
    severity: 'info',
    read: false,
    durationSec: 0,
    requireAck: false,
    position: 'top-right',
    priority: 0,
    persist: true,
    title: '',
    text: '',
    ...o,
});

// One entry per severity, spread over two days so the day grouping shows up. The two
// older ones are confirmed, so the widget also shows the check mark and the badge count.
const ARCHIVE = [
    msg({ id: 'a-err', ts: now - 60_000, severity: 'error', title: 'Heizung', text: 'Kein Kontakt zum Thermostat' }),
    msg({
        id: 'a-warn',
        ts: now - 2_700_000,
        severity: 'warning',
        title: 'Waschmaschine',
        text: 'Programm fertig',
    }),
    msg({
        id: 'a-ok',
        ts: now - 9_000_000,
        severity: 'success',
        title: 'Backup',
        text: 'Sicherung abgeschlossen',
        read: true,
    }),
    msg({
        id: 'a-info',
        ts: now - 97_200_000,
        severity: 'info',
        title: 'Sonnenuntergang',
        text: 'Rollläden gefahren',
        read: true,
    }),
];

// The toast image: an error that demands confirmation plus a warning that can be closed.
const TOASTS = [
    msg({
        id: 't-err',
        severity: 'error',
        title: 'Heizung',
        text: 'Kein Kontakt zum Thermostat',
        requireAck: true,
    }),
    msg({ id: 't-warn', severity: 'warning', title: 'Waschmaschine', text: 'Programm fertig' }),
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => window.__auraShot.messages(true));

// ── 1. Verlauf-Widget ────────────────────────────────────────────────────────
await page.evaluate(
    ([list, id]) => {
        window.__auraShot.messagesReset();
        window.__auraShot.showWidgets([
            {
                id,
                type: 'messages',
                title: 'Meldungen',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 13, h: 12 },
                options: { groupByDay: true, allowClear: true },
            },
        ]);
        window.__auraShot.messagesHistory(list);
    },
    [ARCHIVE, WIDGET_ID],
);
await page.waitForTimeout(900);
await page
    .locator(`.aura-widget-${WIDGET_ID}`)
    .first()
    .screenshot({ path: `${WIDGET_OUT}/runtime.png` });
console.log('✓', `${WIDGET_OUT}/runtime.png`);

// ── 2. Einblendungen (Toasts) ────────────────────────────────────────────────
// Drop the widget first so the archive card cannot bleed into the crop.
await page.evaluate(
    ([list]) => {
        window.__auraShot.seed({
            layouts: [
                {
                    id: 'lay-toast',
                    name: 'Toast',
                    slug: 'toast',
                    activeSectionId: 'sec-toast',
                    // The dev instance shows the grid guidelines in the frontend and a header —
                    // both would draw lines through the crop around the toasts.
                    settings: { guidelinesEnabled: false, guidelinesShowInFrontend: false, showHeader: false },
                    sections: [
                        {
                            id: 'sec-toast',
                            name: 'Toast',
                            slug: 'toast',
                            activeTabId: 'tab-toast',
                            tabs: [{ id: 'tab-toast', name: 'Toast', slug: 'toast', widgets: [] }],
                        },
                    ],
                },
            ],
            activeLayoutId: 'lay-toast',
        });
        window.__auraShot.messagesReset();
        window.__auraShot.messageIngest(list);
    },
    [TOASTS],
);
await page.waitForTimeout(900);

const box = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('[data-aura-toasts]')].map((el) => el.getBoundingClientRect());
    if (!rects.length) return null;
    const x = Math.min(...rects.map((r) => r.x));
    const y = Math.min(...rects.map((r) => r.y));
    return {
        x,
        y,
        width: Math.max(...rects.map((r) => r.right)) - x,
        height: Math.max(...rects.map((r) => r.bottom)) - y,
    };
});
if (!box) {
    console.log('✗', `${ADMIN_OUT}/meldungen-toast.png`, '- no toast container');
} else {
    const pad = 12;
    await page.screenshot({
        path: `${ADMIN_OUT}/meldungen-toast.png`,
        clip: {
            x: Math.max(0, box.x - pad),
            y: Math.max(0, box.y - pad),
            width: box.width + pad * 2,
            height: box.height + pad * 2,
        },
    });
    console.log('✓', `${ADMIN_OUT}/meldungen-toast.png`);
}

await browser.close();
console.log('done');
