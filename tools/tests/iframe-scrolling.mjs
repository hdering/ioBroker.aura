// Verifies that an embedded page only keeps its scrollbars while it is operable
// (issue #529) against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/iframe-scrolling.mjs
//
// An embedded document owns its scrollbars — the host can only reach them through
// the frame's `scrolling` attribute. Windows/Chrome paints classic, space-taking
// bars, so a stream page that overflows its frame by a few pixels shows a permanent
// scrollbar at every widget size, while tablets hide the same overflow behind
// overlay scrollbars. The interaction mode decides: `action` blocks pointer events,
// so the bar is dead chrome and gets suppressed; both content modes keep it.
//
// Runs HEADED on purpose: headless Chromium always uses overlay scrollbars, which
// would make the desktop symptom unmeasurable.
import { chromium } from 'playwright';
import http from 'node:http';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

// Stand-in for a go2rtc stream page: content 4px taller than the frame.
const STREAM_PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{height:100%;margin:0;background:#000}
div{width:100%;height:calc(100% + 4px);background:#123}</style></head><body><div></div></body></html>`;

const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' }).end(STREAM_PAGE);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const STREAM_HTML = `http://127.0.0.1:${server.address().port}/cam.html`;
const STREAM_JPG = 'https://example.invalid/cam.jpg';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const WID = 'scroll-test';
const SEL = `.aura-widget-${WID}`;

function widget(type, options) {
    return { id: WID, type, title: 'Scroll', datapoint: '', gridPos: { x: 0, y: 0, w: 14, h: 10 }, options };
}

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

async function show(type, options) {
    await page.evaluate(([w]) => window.__auraShot.showWidgets([w]), [widget(type, options)]);
    await page.waitForTimeout(700);
}

const attrOf = (sel, attr) =>
    page.evaluate(([s, a]) => document.querySelector(s)?.getAttribute(a) ?? null, [sel, attr]);
const count = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);

/** Width the embedded document loses to a classic scrollbar (0 = none painted). */
async function scrollbarPx() {
    const frame = page.frames().find((f) => f.url().startsWith(STREAM_HTML.slice(0, 22)));
    if (!frame) return null;
    return frame.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
}

// ── camera: default (legacy widgets resolve to `content`) ────────────────────
await show('camera', { streamUrl: STREAM_HTML, layout: 'minimal' });
check('camera default → scrolling=auto', (await attrOf(`${SEL} iframe`, 'scrolling')) === 'auto');
check('camera default → embedded page scrolls', (await scrollbarPx()) > 0, `${await scrollbarPx()}px`);

// ── camera: interaction blocked → no scrollbar ───────────────────────────────
await show('camera', { streamUrl: STREAM_HTML, layout: 'minimal', interactionMode: 'action' });
check('camera action → scrolling=no', (await attrOf(`${SEL} iframe`, 'scrolling')) === 'no');
check('camera action → no scrollbar', (await scrollbarPx()) === 0, `${await scrollbarPx()}px`);
check('camera action → blocker present', (await count(`${SEL} iframe + div`)) === 1);

// ── camera: legacy allowInteraction=false maps to the same thing ─────────────
await show('camera', { streamUrl: STREAM_HTML, layout: 'minimal', allowInteraction: false });
check('camera allowInteraction=false → scrolling=no', (await attrOf(`${SEL} iframe`, 'scrolling')) === 'no');

// ── camera: contentOnly stays operable, keeps its bar ────────────────────────
await show('camera', { streamUrl: STREAM_HTML, layout: 'minimal', interactionMode: 'contentOnly' });
check('camera contentOnly → scrolling=auto', (await attrOf(`${SEL} iframe`, 'scrolling')) === 'auto');
check('camera contentOnly → no blocker', (await count(`${SEL} iframe + div`)) === 0);

// ── camera: MJPEG has no embedded document at all ────────────────────────────
await show('camera', { streamUrl: STREAM_JPG, layout: 'minimal', interactionMode: 'action' });
check('camera MJPEG → no iframe', (await count(`${SEL} iframe`)) === 0);

// ── action button follows the mode (issue #527 wiring) ───────────────────────
const clickAction = { kind: 'link-external', url: 'https://example.invalid/x' };
await show('camera', { streamUrl: STREAM_HTML, layout: 'minimal', interactionMode: 'content', clickAction });
check('camera content → action button shown', (await count(`${SEL} [data-embed-action]`)) === 1);
await show('camera', { streamUrl: STREAM_HTML, layout: 'minimal', interactionMode: 'action', clickAction });
check('camera action → no action button', (await count(`${SEL} [data-embed-action]`)) === 0);

// ── iframe widget: same rule ─────────────────────────────────────────────────
await show('iframe', { iframeUrl: STREAM_HTML, interactionMode: 'content' });
check('iframe content → scrolling=auto', (await attrOf(`${SEL} iframe`, 'scrolling')) === 'auto');
check('iframe content → embedded page scrolls', (await scrollbarPx()) > 0, `${await scrollbarPx()}px`);
await show('iframe', { iframeUrl: STREAM_HTML, interactionMode: 'action' });
check('iframe action → scrolling=no', (await attrOf(`${SEL} iframe`, 'scrolling')) === 'no');
check('iframe action → no scrollbar', (await scrollbarPx()) === 0, `${await scrollbarPx()}px`);

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
