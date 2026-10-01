// Camera widget × a player page that reports its state (eusec go2rtc stream.html).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/camera-player-state.mjs
//
// The player page is stubbed by a route; the test makes it post
//   { type: 'eusec-stream', src, state, detail }
// to the widget exactly like the real player does (window.parent.postMessage).
// Checks:
//   - wakeUpMode "onClick" without wakeUpDp loads the player only on tap, at once
//     (no wake-up delay) and without any setState
//   - 'waiting' / 'playing' stop the stream timeout, 'error' restarts it
//   - 'waiting' shows the busy station's name
//   - messages from anywhere but the widget's own iframe are ignored
//   - without a trigger the player loads right away (unchanged)
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ID = 'w-cam-player';
const SEL = `.aura-widget-${ID}`;
const PLAYER = 'http://player.test:1984/stream.html?src=T8410';

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

await page.route('http://player.test:1984/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="background:#123">player</body>' }),
);
// Record setState frames and drop them — a click must not write anything here.
await page.addInitScript(() => {
    window.__wsSent = [];
    const orig = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
        const text = typeof data === 'string' ? data : '';
        if (text.includes('"setState"')) {
            window.__wsSent.push(text);
            return;
        }
        return orig.apply(this, arguments);
    };
});

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

async function show(options) {
    await page.evaluate((cfg) => window.__auraShot.showWidgets([cfg]), {
        id: ID,
        type: 'camera',
        title: 'Haustür',
        datapoint: '',
        layout: 'minimal',
        gridPos: { x: 0, y: 0, w: 8, h: 8 },
        options: { streamUrl: PLAYER, ...options },
    });
    await page.waitForTimeout(400);
}

const iframeCount = () => page.locator(`${SEL} iframe`).count();
const countdown = () =>
    page
        .locator(`${SEL} .font-mono`)
        .allTextContents()
        .then((t) => t.find((s) => /^\d+s$/.test(s.trim())) ?? null);
async function post(state, detail) {
    const frame = page.frames().find((f) => f.url().startsWith('http://player.test'));
    await frame.evaluate(
        ([st, de]) => window.parent.postMessage({ type: 'eusec-stream', src: 'T8410', state: st, detail: de }, '*'),
        [state, detail],
    );
    await page.waitForTimeout(150);
}

// ── 1. onClick without wake-up DP ────────────────────────────────────────────
await show({ wakeUpMode: 'onClick', streamTimeout: 3 });
check('onClick: player not loaded before the tap', (await iframeCount()) === 0);
await page.locator(SEL).click();
await page.waitForTimeout(100);
check('onClick: tap loads the player at once', (await iframeCount()) === 1);
check(
    'onClick: no "Kamera wird aktiviert" wait',
    !(await page.locator(SEL).innerText()).includes('Kamera wird aktiviert'),
);
check('onClick: tap writes no state', (await page.evaluate(() => window.__wsSent.length)) === 0);
check('timeout countdown runs before any report', (await countdown()) !== null, String(await countdown()));

// ── 2. waiting / playing pause the timeout ───────────────────────────────────
await post('waiting', 'Garten');
check('waiting: countdown stopped', (await countdown()) === null);
check(
    'waiting: busy station named',
    (await page.locator(SEL).innerText()).includes('Station überträgt gerade „Garten“'),
);
await post('playing');
check('playing: station hint gone', !(await page.locator(SEL).innerText()).includes('Station überträgt'));
await page.waitForTimeout(3500);
check('playing: stream survives the timeout', (await iframeCount()) === 1);

// ── 3. foreign message is ignored ────────────────────────────────────────────
await post('error', 'go2rtc: no stream');
const afterError = await countdown();
check('error: countdown restarted', afterError !== null, String(afterError));
await page.evaluate(() => window.postMessage({ type: 'eusec-stream', src: 'T8410', state: 'playing' }, '*'));
await page.waitForTimeout(150);
check('message from another source ignored', (await countdown()) !== null);
await page.waitForTimeout(3500);
check('error: timeout ends the stream', (await iframeCount()) === 0);

// ── 4. no trigger → loads right away ─────────────────────────────────────────
await show({});
check('no trigger: player loads immediately', (await iframeCount()) === 1);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
