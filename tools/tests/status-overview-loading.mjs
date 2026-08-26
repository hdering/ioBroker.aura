// Verifies that the Statusübersicht widget does not report a verdict before its data
// is in: over a slow (external) connection the datapoint scan and the first value
// round-trips take a moment, and the widget used to show "Alles in Ordnung" during that
// window — open windows and weak batteries only popped up afterwards.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/status-overview-loading.mjs
//
// The page is loaded fresh, so the module-level datapoint cache is empty and the first
// mount really has to fetch it. The DOM is then sampled every 10 ms from the moment the
// widget appears until it reaches its final state.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

await page.evaluate(() =>
    window.__auraShot.showWidgets([
        {
            id: 'w-so-loading',
            type: 'statusoverview',
            title: 'Statusübersicht',
            datapoint: '',
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 6, h: 20 },
            options: {},
        },
    ]),
);

/** One DOM sample: which of the mutually exclusive states the widget is showing. */
const sample = () =>
    page.evaluate(() => {
        const t = document.body.innerText;
        return {
            loading: t.includes('Daten werden geladen'),
            spinner: !!document.querySelector('.animate-spin'),
            chipLoading: t.includes('Lädt'),
            allClear: t.includes('Alles in Ordnung'),
            hints: /\d+ Hinweis/.test(t),
            ok: /\bOK\b/.test(t),
            progress: (t.match(/(\d+ von \d+ Datenpunkten|Datenpunkte werden gesucht)/) || [null])[0],
        };
    });

const frames = [];
for (let i = 0; i < 400; i++) {
    const snap = await sample();
    frames.push(snap);
    // Final state reached: the widget reports either hints or the all-clear.
    if (!snap.loading && (snap.allClear || snap.hints || snap.ok)) break;
    await page.waitForTimeout(10);
}

const loadingFrames = frames.filter((f) => f.loading);
const last = frames[frames.length - 1];

// ── 1. the loading state is visible at all ──────────────────────────────────
check('loading panel is shown while the data comes in', loadingFrames.length > 0, `${frames.length} frames sampled`);
check(
    'the panel carries a spinner',
    loadingFrames.some((f) => f.spinner),
    'no .animate-spin while loading',
);
check(
    'the header chip says it is loading',
    loadingFrames.some((f) => f.chipLoading),
    'chip never showed "Lädt"',
);
check(
    'the panel names its progress',
    loadingFrames.some((f) => !!f.progress),
    'no progress line',
);

// ── 2. no verdict before the data is in (the actual regression) ──────────────
check(
    'never claims "Alles in Ordnung" while loading',
    !frames.some((f) => f.loading && f.allClear),
    'all-clear rendered during loading',
);
check(
    'no green OK chip while loading',
    !loadingFrames.some((f) => f.ok && !f.chipLoading),
    'OK chip rendered during loading',
);

// ── 3. and it does resolve ───────────────────────────────────────────────────
check('reaches a final state', !!last && !last.loading, JSON.stringify(last));
check('spinner is gone afterwards', !!last && !last.spinner, JSON.stringify(last));
check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
