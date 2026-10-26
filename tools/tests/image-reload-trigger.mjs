// Verifies that image and camera widgets reload their content on demand
// (issue #853) against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/image-reload-trigger.mjs
//
// Needs a CONNECTED dev server (proxy target = a live ioBroker): live updates of
// a datapoint only reach `useDatapoint` while the socket is up. The harness blocks
// writes to the instance; the datapoints below are fantasy ids fed through mock().
// Checked: the refresh interval also works for a datapoint source, writing the
// same path to the source DP reloads, a trigger DP reloads a fixed URL, and the
// camera reloads both a snapshot and an iframe stream on the trigger.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SRC_DP = 'aura-test.0.image853.path';
const TRIGGER_DP = 'aura-test.0.image853.saved';
const IMG_URL = 'https://example.invalid/snapshot.jpg';
const CAM_HTML = 'https://example.invalid/cam.html';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

let seq = 0;
/** Fresh id per mount — the harness keeps known ids mounted. */
async function show(type, options, values = {}) {
    const id = `reload-${++seq}`;
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mockServerState(vals);
            window.__auraShot.mock(vals);
            window.__auraShot.showWidgets([w]);
        },
        [{ id, type, title: 'Reload', datapoint: '', gridPos: { x: 0, y: 0, w: 14, h: 10 }, options }, values],
    );
    await page.waitForTimeout(800);
    return id;
}

/** Writes a value the way a script would — same value again counts as a write. */
async function write(id, val) {
    await page.waitForTimeout(20); // distinct ts
    await page.evaluate(([i, v]) => window.__auraShot.mock({ [i]: v }), [id, val]);
    await page.waitForTimeout(400);
}

const srcOf = (id, sel) =>
    page.evaluate(([i, s]) => document.querySelector(`.aura-widget-${i} ${s}`)?.getAttribute('src') ?? null, [id, sel]);

const tag = (id, sel) =>
    page.evaluate(
        ([i, s]) => {
            const el = document.querySelector(`.aura-widget-${i} ${s}`);
            if (el) el.__probe = 1;
            return !!el;
        },
        [id, sel],
    );
const survived = (id, sel) =>
    page.evaluate(([i, s]) => !!document.querySelector(`.aura-widget-${i} ${s}`)?.__probe, [id, sel]);

// ── 1. Refresh interval with a datapoint source (was ignored before) ─────────
{
    const id = await show('image', { imageDatapoint: SRC_DP, refreshInterval: 1 }, { [SRC_DP]: '/vis.0/cam.jpg' });
    const before = await srcOf(id, 'img');
    await page.waitForTimeout(1500);
    const after = await srcOf(id, 'img');
    check('DP source: initial src without cache-bust', !!before && !before.includes('_t='), before ?? '');
    check('DP source: refresh interval reloads', !!after && after.includes('_t=') && after !== before, after ?? '');
}

// ── 2. Source DP rewritten with the same path reloads ─────────────────────────
{
    const id = await show('image', { imageDatapoint: SRC_DP }, { [SRC_DP]: '/vis.0/cam.jpg' });
    const before = await srcOf(id, 'img');
    await write(SRC_DP, '/vis.0/cam.jpg');
    const first = await srcOf(id, 'img');
    await write(SRC_DP, '/vis.0/cam.jpg');
    const second = await srcOf(id, 'img');
    check('DP source: same value again reloads', !!first && first.includes('_t=') && first !== before, first ?? '');
    check('DP source: every write reloads', !!second && second !== first, second ?? '');
}

// ── 3. Trigger DP reloads a fixed URL ─────────────────────────────────────────
{
    const id = await show('image', { imageUrl: IMG_URL, reloadDp: TRIGGER_DP }, { [TRIGGER_DP]: 1 });
    const before = await srcOf(id, 'img');
    check('trigger: mount alone does not reload', before === IMG_URL, before ?? '');
    await write(TRIGGER_DP, true);
    const first = await srcOf(id, 'img');
    await write(TRIGGER_DP, true);
    const second = await srcOf(id, 'img');
    check('trigger: write reloads the URL', !!first && first.startsWith(`${IMG_URL}?_t=`), first ?? '');
    check('trigger: same value again reloads', !!second && second !== first, second ?? '');
}

// ── 4. Camera snapshot reloads on the trigger, not only on its timer ──────────
{
    const id = await show(
        'camera',
        { streamUrl: IMG_URL, refreshInterval: 3600, reloadDp: TRIGGER_DP, reloadOnWake: false },
        { [TRIGGER_DP]: 1 },
    );
    const before = await srcOf(id, 'img');
    await write(TRIGGER_DP, 2);
    const after = await srcOf(id, 'img');
    check(
        'camera snapshot: trigger loads a fresh src',
        !!before && !!after && after !== before,
        `${before} → ${after}`,
    );
}

// ── 5. Camera iframe stream is remounted on the trigger ──────────────────────
{
    const id = await show('camera', { streamUrl: CAM_HTML, reloadDp: TRIGGER_DP }, { [TRIGGER_DP]: 1 });
    const tagged = await tag(id, 'iframe');
    await write(TRIGGER_DP, 2);
    check('camera iframe: trigger remounts the frame', tagged && !(await survived(id, 'iframe')));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
