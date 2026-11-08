// Camera widget × snapshot refresh (forum post 1362081).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/camera-snapshot-refresh.mjs
//
// Checks:
//   - a refresh keeps the same <img> element (a remount showed a black frame)
//   - while the next snapshot is still loading, the previous picture stays visible
//   - once it has loaded, it is swapped in
//   - a failing snapshot still ends in "Verbindungsfehler"
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ID = 'w-cam-snap';
const SEL = `.aura-widget-${ID}`;
// 1×1 PNG
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
);

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

// First request answers at once; later ones are held until released, so the test
// can look at the widget while a refresh is in flight.
let requests = 0;
const held = [];
let failAll = false;
await page.route('http://snap.test/**', (route) => {
    if (failAll) return route.fulfill({ status: 404, body: '' });
    requests++;
    const reply = () => route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (requests === 1) return reply();
    held.push(reply);
});

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });

async function show(options) {
    await page.evaluate(() => window.__auraShot.showWidgets([]));
    await page.waitForTimeout(100);
    await page.evaluate((cfg) => window.__auraShot.showWidgets([cfg]), {
        id: ID,
        type: 'camera',
        title: 'Snapshot',
        datapoint: '',
        layout: 'minimal',
        gridPos: { x: 0, y: 0, w: 8, h: 8 },
        options: { streamUrl: 'http://snap.test/snapshot.jpg?user=a&pw=b', refreshInterval: 1, ...options },
    });
}

const imgState = () =>
    page.locator(`${SEL} img`).evaluate((el) => ({
        src: el.getAttribute('src'),
        mark: el.dataset.mark ?? null,
        loaded: el.complete && el.naturalWidth > 0,
    }));

// ── 1. first picture ─────────────────────────────────────────────────────────
await show({});
await page.waitForTimeout(500);
const first = await imgState();
check('first snapshot shown', first.loaded, JSON.stringify(first));
await page.locator(`${SEL} img`).evaluate((el) => (el.dataset.mark = 'first'));

// ── 2. refresh in flight ─────────────────────────────────────────────────────
await page.waitForTimeout(1100);
check('next snapshot requested', held.length >= 1, `held=${held.length}`);
const during = await imgState();
check('same <img> element during refresh', during.mark === 'first', JSON.stringify(during));
check('previous picture stays during refresh', during.src === first.src && during.loaded, JSON.stringify(during));

// ── 3. refresh done → swapped in ─────────────────────────────────────────────
held.splice(0).forEach((reply) => reply());
await page.waitForTimeout(300);
const after = await imgState();
check('new snapshot swapped in', after.src !== first.src && after.loaded, JSON.stringify(after));
check('same <img> element after refresh', after.mark === 'first', JSON.stringify(after));

// ── 4. failing snapshot → error overlay ──────────────────────────────────────
failAll = true;
await show({});
await page.waitForTimeout(800);
check('404 snapshot: "Verbindungsfehler"', (await page.locator(SEL).innerText()).includes('Verbindungsfehler'));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
