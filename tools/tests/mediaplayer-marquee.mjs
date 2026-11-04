// Verifies the media player's marquee option (#921): a title / subtitle that does
// not fit scrolls instead of being cut off with an ellipsis; short texts and the
// option switched off stay static.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/mediaplayer-marquee.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values live in the
// in-memory cache only - no socket write, no real datapoint is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const LONG_TITLE = 'Ein sehr langer Radiotitel, der niemals in eine schmale Kachel passt - Live aus dem Studio';
const LONG_ARTIST = 'Interpret mit einem ebenso langen Namen und Featuring-Gästen';
const DPS = { title: 'demo.mp.title', artist: 'demo.mp.artist', album: 'demo.mp.album' };

let seq = 0;
async function show({ layout = 'default', marquee, title = LONG_TITLE, artist = LONG_ARTIST, w = 8 }) {
    const widget = {
        id: `w-mp-${++seq}`,
        type: 'mediaplayer',
        title: 'Radio',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w, h: 4 },
        options: { titleDp: DPS.title, artistDp: DPS.artist, albumDp: DPS.album, marquee },
    };
    const vals = { [DPS.title]: title, [DPS.artist]: artist, [DPS.album]: '' };
    await page.evaluate(
        ([wd, v]) => {
            window.__auraShot.mock(v);
            window.__auraShot.mockServerState(v);
            window.__auraShot.showWidgets([wd]);
        },
        [widget, vals],
    );
    await page.waitForTimeout(400);
}

// Running marquee tracks and ellipsis-truncated lines in the widget.
const state = () =>
    page.evaluate(() => {
        const root = document.querySelector('.react-grid-item');
        const tracks = [...root.querySelectorAll('.aura-marquee-track')];
        return {
            tracks: tracks.length,
            animated: tracks.filter((t) => getComputedStyle(t).animationName === 'aura-marquee').length,
            truncated: root.querySelectorAll('p.truncate').length,
            // Content width: the long text must not widen the widget.
            scrollW: root.scrollWidth,
        };
    });

for (const layout of ['default', 'compact']) {
    await show({ layout, marquee: true });
    let s = await state();
    const onW = s.scrollW;
    check(`${layout}: marquee on - title and subtitle scroll`, s.tracks === 2 && s.animated === 2, JSON.stringify(s));
    check(`${layout}: marquee on - no ellipsis lines`, s.truncated === 0, JSON.stringify(s));
    if (process.env.SHOT)
        await page
            .locator('.react-grid-item')
            .first()
            .screenshot({ path: `${process.env.SHOT}-${layout}.png` });

    await show({ layout, marquee: false });
    s = await state();
    check(`${layout}: marquee off - texts are cut off`, s.tracks === 0 && s.truncated === 2, JSON.stringify(s));
    check(`${layout}: marquee does not widen the widget`, onW <= s.scrollW, `${onW} vs ${s.scrollW}`);

    await show({ layout });
    s = await state();
    check(`${layout}: default is off`, s.tracks === 0, JSON.stringify(s));

    await show({ layout, marquee: true, title: 'Kurz', artist: 'Band', w: 12 });
    s = await state();
    check(`${layout}: short texts stay static`, s.tracks === 0, JSON.stringify(s));
    const text = await page.locator('.react-grid-item .aura-widget-title').first().innerText();
    check(`${layout}: short title shown once`, text.trim() === 'Kurz', JSON.stringify(text));
}

// Mobile: vertical layout.
await ctx.close();
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
const mpage = await mctx.newPage();
mpage.on('pageerror', (e) => pageErrors.push(e.message));
await mpage.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await mpage.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await mpage.evaluate(
    ([d, t, a]) => {
        const v = { [d.title]: t, [d.artist]: a, [d.album]: '' };
        window.__auraShot.mock(v);
        window.__auraShot.mockServerState(v);
        window.__auraShot.showWidgets([
            {
                id: 'w-mp-mobile',
                type: 'mediaplayer',
                title: 'Radio',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 4, h: 6 },
                options: { titleDp: d.title, artistDp: d.artist, albumDp: d.album, marquee: true },
            },
        ]);
    },
    [DPS, LONG_TITLE, LONG_ARTIST],
);
await mpage.waitForTimeout(500);
const mobileTracks = await mpage.locator('.aura-marquee-track').count();
check('mobile: title and subtitle scroll', mobileTracks === 2, String(mobileTracks));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
