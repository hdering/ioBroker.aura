// Verifies the iFrame sound button (issue #855) in a real browser against the dev server.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5174
//   node tools/tests/iframe-sound-ui.mjs
//
// Only a page of Aura's own origin can be reached, so the reachable case is served
// under the dev server's address (intercepted by playwright) and the foreign case by
// a separate local server. Media the page creates after the load has to follow the
// button too, and the player's own mute control has to flow back into it.
import { chromium } from 'playwright';
import http from 'node:http';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<video id="v1" controls></video>
<script>
// A tiny silent WAV, so a media element really starts loading (loadstart).
function wav() {
    const n = 800, b = new ArrayBuffer(44 + n), d = new DataView(b);
    const s = (o, t) => [...t].forEach((c, i) => d.setUint8(o + i, c.charCodeAt(0)));
    s(0, 'RIFF'); d.setUint32(4, 36 + n, true); s(8, 'WAVEfmt '); d.setUint32(16, 16, true);
    d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, 8000, true);
    d.setUint32(28, 8000, true); d.setUint16(32, 1, true); d.setUint16(34, 8, true);
    s(36, 'data'); d.setUint32(40, n, true); for (let i = 0; i < n; i++) d.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
window.addLate = () => { const a = document.createElement('audio'); a.id = 'late'; a.src = wav(); document.body.append(a); };
</script></body></html>`;

const SAME_ORIGIN_URL = `${BASE}/__iframe-sound-test.html`;
const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const FOREIGN_URL = `http://127.0.0.1:${server.address().port}/page.html`;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const WID = 'sound-test';
const SEL = `.aura-widget-${WID}`;
const widget = (options) => ({
    id: WID,
    type: 'iframe',
    title: 'Ton',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 14, h: 10 },
    options,
});

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.route('**/__iframe-sound-test.html', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: PAGE }),
);

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

async function show(options) {
    await page.evaluate(() => window.__auraShot.showWidgets([]));
    await page.waitForTimeout(150);
    await page.evaluate(([w]) => window.__auraShot.showWidgets([w]), [widget(options)]);
    await page.waitForTimeout(1200);
}

const btn = page.locator(`${SEL} .aura-sound-ctl`);
const frame = () => page.frame({ url: (u) => u.href.includes('__iframe-sound-test') });
const mutedOf = (id) => frame().evaluate((i) => document.getElementById(i)?.muted ?? null, id);
async function tap() {
    await page.hover(SEL);
    await btn.click();
    await page.waitForTimeout(250);
}

// ── option off: no button, page untouched ────────────────────────────────────
await show({ iframeUrl: SAME_ORIGIN_URL });
check('without the option there is no sound button', (await btn.count()) === 0);
check('and the page keeps its own sound', (await mutedOf('v1')) === false);

// ── button on, same origin ──────────────────────────────────────────────────
await show({ iframeUrl: SAME_ORIGIN_URL, iframeSoundControl: true });
check('the button appears', (await btn.count()) === 1);
check('it shows the page state (sound on)', (await btn.getAttribute('data-muted')) === 'false');
await tap();
check('a tap mutes the video', (await mutedOf('v1')) === true);
check('and the button says so', (await btn.getAttribute('data-muted')) === 'true');
await frame().evaluate(() => window.addLate());
await page.waitForTimeout(400);
check('media added later is muted too', (await mutedOf('late')) === true);
await tap();
check('a second tap brings the sound back', (await mutedOf('v1')) === false && (await mutedOf('late')) === false);
await frame().evaluate(() => (document.getElementById('v1').muted = true));
await page.waitForTimeout(250);
check("the player's own mute flows back into the button", (await btn.getAttribute('data-muted')) === 'true');

// ── start muted ──────────────────────────────────────────────────────────────
await show({ iframeUrl: SAME_ORIGIN_URL, iframeMuted: true });
check('start muted: the video loads muted', (await mutedOf('v1')) === true);
check('start muted alone shows no button', (await btn.count()) === 0);

// ── foreign page ─────────────────────────────────────────────────────────────
await show({ iframeUrl: FOREIGN_URL, iframeSoundControl: true });
check(
    'a foreign page greys the button out',
    (await btn.getAttribute('title'))?.includes('fremde Seite') === true,
    await btn.getAttribute('title'),
);

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
