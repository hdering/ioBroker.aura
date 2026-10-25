// Camera widget × recorded video clips (Ring's Livestream.mp4, #843).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/camera-video.mjs
//
// Checks:
//   - an .mp4 URL renders a <video>, not an <img> (which can never decode it)
//   - every wake-up loads the clip with a fresh cache-buster (same file name per recording)
//   - wakeUpReadyDp: the stream waits for the ready DP's next update, not a fixed delay
//   - a missing clip still ends in "Verbindung verloren"
//   - snapshot/MJPEG URLs keep the <img> path (unchanged)
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ID = 'w-cam-video';
const SEL = `.aura-widget-${ID}`;
const CLIP = 'http://ring.test:8082/ring.0/ring_0_cocoa_1_Livestream.mp4';
const WAKE = 'aura-test.camvideo.Livestream.request';
const READY = 'aura-test.camvideo.Livestream.moment';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 700, height: 600 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// The clip request stays pending (no decodable fixture needed — a broken body would
// fire onError and end the stream); 404 models a recording that is not there yet.
let clipStatus = 'pending';
await page.route('http://ring.test:8082/**', (route) =>
    clipStatus === 'pending' ? undefined : route.fulfill({ status: 404, body: 'not found' }),
);
await page.route('http://snap.test/**', (route) => route.fulfill({ status: 404, body: '' }));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

async function show(options) {
    // Unmount first — the same id would otherwise keep its running stream.
    await page.evaluate(() => window.__auraShot.showWidgets([]));
    await page.waitForTimeout(100);
    await page.evaluate((cfg) => window.__auraShot.showWidgets([cfg]), {
        id: ID,
        type: 'camera',
        title: 'Ring',
        datapoint: '',
        layout: 'minimal',
        gridPos: { x: 0, y: 0, w: 8, h: 8 },
        options: { streamUrl: CLIP, refreshInterval: 0, ...options },
    });
    await page.waitForTimeout(400);
}

const videoSrc = () =>
    page
        .locator(`${SEL} video`)
        .first()
        .getAttribute('src')
        .catch(() => null);
const text = () => page.locator(SEL).innerText();

// ── 1. mp4 without trigger → <video> ─────────────────────────────────────────
await show({});
check('mp4 renders a <video>', (await page.locator(`${SEL} video`).count()) === 1);
check('mp4 renders no <img>', (await page.locator(`${SEL} img`).count()) === 0);
check('video is muted (autoplay)', await page.locator(`${SEL} video`).evaluate((v) => v.muted));
check('clip URL is cache-busted', /[?&]_t=\d+/.test((await videoSrc()) ?? ''), String(await videoSrc()));

// ── 2. wake-up + ready DP ────────────────────────────────────────────────────
await page.evaluate((id) => window.__auraShot.mock({ [id]: 1000 }), READY);
await show({ wakeUpDp: WAKE, wakeUpReadyDp: READY, wakeUpDelay: 1, streamTimeout: 30 });
await page.evaluate(() => window.__auraShot.writes(true));
await page.locator(SEL).click();
await page.waitForTimeout(1600);
check('ready DP: still waking after wakeUpDelay', (await text()).includes('Kamera wird aktiviert'));
check('ready DP: no video yet', (await page.locator(`${SEL} video`).count()) === 0);
const writes = await page.evaluate(() => window.__auraShot.writes());
check(
    'wake DP written true',
    writes.some((w) => w.id === WAKE && w.val === true),
    JSON.stringify(writes),
);
await page.evaluate((id) => window.__auraShot.mock({ [id]: 2000 }), READY);
await page.waitForTimeout(300);
check('ready DP update starts the clip', (await page.locator(`${SEL} video`).count()) === 1);
const firstSrc = await videoSrc();

// ── 3. second wake → new cache-buster ────────────────────────────────────────
await show({ wakeUpDp: WAKE, wakeUpReadyDp: READY, streamTimeout: 30 });
await page.locator(SEL).click();
await page.waitForTimeout(50);
await page.evaluate((id) => window.__auraShot.mock({ [id]: 3000 }), READY);
await page.waitForTimeout(300);
const secondSrc = await videoSrc();
check('next wake loads a fresh URL', !!secondSrc && secondSrc !== firstSrc, `${firstSrc} → ${secondSrc}`);

// ── 4. without ready DP the fixed delay still applies ────────────────────────
await show({ wakeUpDp: WAKE, wakeUpDelay: 1, streamTimeout: 30 });
await page.locator(SEL).click();
await page.waitForTimeout(1500);
check('fixed delay: clip after wakeUpDelay', (await page.locator(`${SEL} video`).count()) === 1);

// ── 5. missing clip → "Verbindung verloren" ──────────────────────────────────
clipStatus = 404;
await show({ wakeUpDp: WAKE, wakeUpDelay: 1, streamTimeout: 30 });
await page.locator(SEL).click();
await page.waitForTimeout(2500);
check('missing clip: "Verbindung verloren"', (await text()).includes('Verbindung verloren'));

// ── 6. snapshot URL keeps the <img> ──────────────────────────────────────────
await show({ streamUrl: 'http://snap.test/snapshot.jpg', refreshInterval: 5 });
check('snapshot keeps <img>', (await page.locator(`${SEL} img`).count()) === 1);
check('snapshot renders no <video>', (await page.locator(`${SEL} video`).count()) === 0);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
