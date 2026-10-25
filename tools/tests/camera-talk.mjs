// Intercom on the camera widget (issue #836) against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/camera-talk.mjs
//
// go2rtc's webrtc.html sends the tablet microphone to the doorbell when its
// `media` parameter contains `microphone`. The widget adds that token only while
// a call is accepted. Checked: the microphone is closed until "Annehmen" (even
// when the configured URL asks for it), accepting/hanging up rewrites the frame
// and the call datapoint, closing the widget hangs up, fullscreen keeps a single
// microphone, and a call holds an auto-closing popup open. localhost counts as a
// secure context, so the HTTPS guard does not get in the way here.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const STREAM = 'https://example.invalid/webrtc.html?src=tuer';
const TALK_DP = 'demo.camTalk.call';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const camera = (id, options) => ({
    id,
    type: 'camera',
    title: 'Haustür',
    datapoint: '',
    layout: 'minimal',
    gridPos: { x: 0, y: 0, w: 8, h: 6 },
    options,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page.evaluate(() => window.__auraShot.captureWrites(true));

const settle = () => page.waitForTimeout(500);
const show = async (widgets) => {
    await page.evaluate((w) => window.__auraShot.showWidgets(w), widgets);
    await settle();
};
const writes = (reset = false) => page.evaluate((r) => window.__auraShot.writes(r), reset);
const talkWrites = async () => {
    const log = (await writes()).filter((w) => w.id === TALK_DP).map((w) => w.val);
    await writes(true);
    return log;
};
const frames = () =>
    page.evaluate(() =>
        [...document.querySelectorAll('iframe')]
            .filter((f) => (f.getAttribute('src') ?? '').includes('example.invalid'))
            .map((f) => ({ src: f.getAttribute('src'), allow: f.getAttribute('allow') })),
    );
const hasMic = (src) => new URL(src).searchParams.get('media')?.includes('microphone') ?? false;
const talkButton = page.locator('.aura-camera-talk');

// ── 1. Option off: no button, no microphone permission ───────────────────────
await show([camera('cam-off', { streamUrl: STREAM })]);
{
    const [f] = await frames();
    check('without talk there is no intercom button', (await talkButton.count()) === 0);
    check('without talk the frame may not use the microphone', !!f && !f.allow.includes('microphone'), f?.allow);
}

// ── 2. Idle: microphone permitted but closed, even if the URL asks for it ─────
await show([camera('cam-talk', { streamUrl: `${STREAM}&media=video+audio+microphone`, talk: true, talkDp: TALK_DP })]);
await writes(true);
{
    const [f] = await frames();
    check('talk lets the frame use the microphone', !!f && f.allow.includes('microphone'), f?.allow);
    check('idle stream carries no microphone', !!f && !hasMic(f.src), f?.src);
    check('idle stream keeps video+audio', !!f && /video/.test(new URL(f.src).searchParams.get('media')), f?.src);
    check('button offers to accept', (await talkButton.textContent())?.includes('Annehmen'));
}

// ── 3. Accept / hang up ──────────────────────────────────────────────────────
await talkButton.click();
await settle();
{
    const [f] = await frames();
    check('accepting reconnects with the microphone', !!f && hasMic(f.src), f?.src);
    check('button turns into hang up', (await talkButton.textContent())?.includes('Auflegen'));
    const w = await talkWrites();
    check('accepting writes true to the call DP', w.length === 1 && w[0] === true, JSON.stringify(w));
}
await talkButton.click();
await settle();
{
    const [f] = await frames();
    check('hanging up drops the microphone', !!f && !hasMic(f.src), f?.src);
    const w = await talkWrites();
    check('hanging up writes false to the call DP', w.length === 1 && w[0] === false, JSON.stringify(w));
}

// ── 4. A plain URL gets video+audio+microphone ───────────────────────────────
await show([camera('cam-plain', { streamUrl: STREAM, talk: true })]);
await talkButton.click();
await settle();
{
    const [f] = await frames();
    const media = f ? new URL(f.src).searchParams.get('media') : null;
    check('URL without media gets video+audio+microphone', media === 'video+audio+microphone', media);
}

// ── 5. Leaving the widget mid-call hangs up ──────────────────────────────────
await show([camera('cam-leave', { streamUrl: STREAM, talk: true, talkDp: TALK_DP })]);
await talkButton.click();
await settle();
await writes(true);
await show([]);
{
    const w = await talkWrites();
    check('unmounting during a call writes false', w.length === 1 && w[0] === false, JSON.stringify(w));
}

// ── 6. Fullscreen: only one copy holds the microphone ────────────────────────
await show([camera('cam-full', { streamUrl: STREAM, talk: true })]);
await talkButton.click();
await settle();
await page.locator('.aura-widget-cam-full button:has(svg[class*="maximize"])').click({ force: true });
await settle();
{
    const fs = await frames();
    const withMic = fs.filter((f) => hasMic(f.src)).length;
    check('fullscreen shows two frames', fs.length === 2, String(fs.length));
    check('exactly one frame carries the microphone', withMic === 1, String(withMic));
}
await page.keyboard.press('Escape');
await settle();

// ── 7. A call holds an auto-closing popup open ───────────────────────────────
const DP = 'demo.camTalk.ring';
const VIEW_ID = 'pv-cam-talk';
await page.evaluate(
    ([dp, viewId, cam]) => {
        window.__auraShot.popupViews([{ id: viewId, name: 'Klingel', widgets: [cam] }]);
        window.__auraShot.mock({ [dp]: false });
        window.__auraShot.dpTriggers([
            {
                id: 'pt-cam-talk',
                name: 'Klingel',
                enabled: true,
                clause: { datapoint: dp, operator: 'true', value: '' },
                host: {
                    id: 'ptw-cam-talk',
                    type: 'value',
                    title: 'Klingel',
                    datapoint: dp,
                    gridPos: { x: 0, y: 0, w: 1, h: 1 },
                    options: { clickAction: { kind: 'popup-view', viewId }, popupAutoCloseSec: 2 },
                },
                resetDp: false,
            },
        ]);
    },
    [DP, VIEW_ID, camera('cam-popup', { streamUrl: STREAM, talk: true })],
);
await show([]);
await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), DP);
await settle();
check('ring opens the popup', (await talkButton.count()) === 1);
await talkButton.click();
await page.mouse.move(5, 5);
await page.waitForTimeout(3500);
check('popup stays open during the call', (await talkButton.count()) === 1);
await talkButton.click();
await page.mouse.move(5, 5);
await page.waitForTimeout(3000);
check('popup auto-closes after hanging up', (await talkButton.count()) === 0);
await page.evaluate(() => window.__auraShot.dpTriggers(false));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
