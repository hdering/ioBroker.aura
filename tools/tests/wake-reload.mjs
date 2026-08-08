// Verifies that embedded streams reload after the device wakes from standby
// (issue #526) against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/wake-reload.mjs
//
// A stream inside an iframe is torn down when the WebView is backgrounded, and
// the embedded player cannot restart it without a user gesture — so the host has
// to remount the element. The wake is triggered here through the Page Lifecycle
// `resume` event, one of the three real signals `utils/wakeSignal.ts` listens to.
// Checked: the camera widget reloads by default, its opt-out works, MJPEG images
// reload too, the iframe widget stays put unless asked, and `reloadOnWake`
// overrides `keepAlive`.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const STREAM_HTML = 'https://example.invalid/cam.html';
const STREAM_JPG = 'https://example.invalid/cam.jpg';
const PAGE = 'data:text/html,<body style="margin:0;background:%23dbeafe">embedded</body>';
/** Must clear COALESCE_MS in wakeSignal.ts, which collapses back-to-back wakes. */
const COALESCE_CLEAR_MS = 3500;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

function widget(type, options) {
    return {
        id: 'wake-test',
        type,
        title: 'Wake',
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

const settle = () => page.waitForTimeout(600);

async function show(type, options) {
    await page.evaluate(([w]) => window.__auraShot.showWidgets([w]), [widget(type, options)]);
    await settle();
}

/** Marks the embedded element so a remount can be told apart from a re-render. */
const tag = (sel) =>
    page.evaluate((s) => {
        const el = document.querySelector(`.aura-widget-wake-test ${s}`);
        if (!el) return false;
        el.__wakeProbe = 1;
        return true;
    }, sel);

/** True when the element survived — i.e. it was NOT reloaded. */
const survived = (sel) =>
    page.evaluate((s) => {
        const el = document.querySelector(`.aura-widget-wake-test ${s}`);
        return !!el && !!el.__wakeProbe;
    }, sel);

const srcOf = (sel) =>
    page.evaluate((s) => document.querySelector(`.aura-widget-wake-test ${s}`)?.getAttribute('src') ?? null, sel);

/** Fires the real Page Lifecycle signal the wake handler subscribes to. */
async function wake() {
    await page.waitForTimeout(COALESCE_CLEAR_MS);
    await page.evaluate(() => document.dispatchEvent(new Event('resume')));
    await settle();
}

/** show → tag → wake → did the element get replaced? */
async function reloadsAfterWake(type, options, sel) {
    await show(type, options);
    const tagged = await tag(sel);
    if (!tagged) return { tagged: false };
    const srcBefore = await srcOf(sel);
    await wake();
    return { tagged: true, reloaded: !(await survived(sel)), srcBefore, srcAfter: await srcOf(sel) };
}

// ── 1. Camera in iframe mode reloads by default ───────────────────────────────
{
    const r = await reloadsAfterWake('camera', { streamUrl: STREAM_HTML }, 'iframe');
    check('camera (iframe mode) reloads on wake by default', r.tagged && r.reloaded, r.tagged ? '' : 'no iframe found');
    check('camera keeps the same stream URL across the reload', r.srcBefore === r.srcAfter);
}

// ── 2. …and the opt-out is honoured ───────────────────────────────────────────
{
    const r = await reloadsAfterWake('camera', { streamUrl: STREAM_HTML, reloadOnWake: false }, 'iframe');
    check('camera with reloadOnWake:false stays put', r.tagged && !r.reloaded);
}

// ── 3. An MJPEG image is dead after standby too — remount re-requests it ──────
{
    const r = await reloadsAfterWake('camera', { streamUrl: STREAM_JPG, refreshInterval: 0 }, 'img');
    check('camera (MJPEG) reloads on wake', r.tagged && r.reloaded, r.tagged ? '' : 'no img found');
}

// ── 4. The iframe widget is opt-in: a generic page keeps its state ────────────
{
    const r = await reloadsAfterWake('iframe', { iframeUrl: PAGE }, 'iframe');
    check('iframe widget does not reload unless asked', r.tagged && !r.reloaded);
}

// ── 5. reloadOnWake wins over keepAlive — that combination is the whole point ─
{
    const r = await reloadsAfterWake('iframe', { iframeUrl: PAGE, keepAlive: true, reloadOnWake: true }, 'iframe');
    check('iframe widget reloadOnWake overrides keepAlive', r.tagged && r.reloaded);
}

// ── 6. A wake without any subscriber must not throw ───────────────────────────
await show('value', {});
await wake();

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
