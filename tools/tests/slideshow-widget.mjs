// Verifies the slideshow widget (issue #848) in the browser.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/slideshow-widget.mjs
//
// The server side is mocked with Playwright routes: /fs/media answers a list,
// /fs/read serves SVG "photos" (one of them broken) and a short webm the page
// records itself. Checked: the folder request, automatic stepping, a broken
// file is skipped, swipe/tap controls and pause, the position survives a remount
// (screensaver popup), random order shows no file twice in a round, caption,
// the notices (no folder, not shared, empty), editor mode (count, no stepping),
// video sound blocked until the first tap and muted while an announcement
// speaks, and the folder picker of the settings dialog.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const COLORS = ['#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2'];
const svg = (name, i) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="${COLORS[i % COLORS.length]}"/><text x="20" y="160" font-size="40" fill="#fff">${name}</text></svg>`;
const img = (name, time) => ({ path: `/photos/${name}`, name, kind: 'image', size: 100, time, dateSource: 'exif' });

/** What the mocked server answers. */
const server = {
    status: 200,
    items: [img('a.svg', 1), img('b.svg', 2), img('broken.svg', 3), img('c.svg', 4)],
    mediaCalls: [],
    video: null,
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
// Autoplay with sound is refused until the first tap - the way phones and kiosks behave.
await ctx.addInitScript(() => {
    window.__gesture = false;
    addEventListener('pointerdown', () => (window.__gesture = true), true);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
        if (!this.muted && !window.__gesture) return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
        return play.call(this);
    };
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.route('**/fs/media?**', (route) => {
    const url = new URL(route.request().url());
    server.mediaCalls.push({ path: url.searchParams.get('path'), recursive: url.searchParams.get('recursive') });
    if (server.status !== 200) return route.fulfill({ status: server.status, body: 'no' });
    return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ path: '/photos', items: server.items, truncated: false, pending: 0 }),
    });
});
await page.route('**/fs/read?**', (route) => {
    const p = new URL(route.request().url()).searchParams.get('path') ?? '';
    const name = p.split('/').pop();
    if (name === 'clip.webm' && server.video) {
        return route.fulfill({ status: 200, contentType: 'video/webm', body: server.video });
    }
    const i = server.items.findIndex((m) => m.name === name);
    if (i < 0 || name.startsWith('broken')) return route.fulfill({ status: 404, body: 'gone' });
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg(name, i) });
});
await page.route('**/fs/roots', (route) =>
    route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ label: 'Fotos', path: '/photos' }]),
    }),
);
await page.route('**/fs/list?**', (route) => {
    const p = new URL(route.request().url()).searchParams.get('path');
    const entries =
        p === '/photos'
            ? [
                  { name: '2024', isDir: true, size: null, mtime: null, mime: null },
                  { name: 'a.svg', isDir: false, size: 100, mtime: 1, mime: 'image/svg+xml' },
              ]
            : [
                  { name: 'x.jpg', isDir: false, size: 100, mtime: 1, mime: 'image/jpeg' },
                  { name: 'y.mp4', isDir: false, size: 100, mtime: 1, mime: 'video/mp4' },
                  { name: 'notes.txt', isDir: false, size: 1, mtime: 1, mime: 'text/plain' },
              ];
    return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ path: p, parent: null, entries }),
    });
});

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });

const W = (id) => page.locator(`.aura-widget-${id}`).first();
const shown = (id) =>
    W(id)
        .locator('[data-aura-slideshow-item]')
        .first()
        .getAttribute('data-aura-slideshow-item', { timeout: 10000 })
        .catch(() => null);
async function waitShown(id, name, timeout = 8000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        if ((await shown(id)) === name) return true;
        await page.waitForTimeout(100);
    }
    return false;
}
async function mount(id, options, extra = []) {
    await page.evaluate(
        ([id, options, extra]) => {
            window.__auraShot.showWidgets([
                { id, type: 'slideshow', title: 'Fotos', gridPos: { x: 0, y: 0, w: 16, h: 14 }, options },
                ...extra,
            ]);
        },
        [id, options, extra],
    );
    await W(id).waitFor({ timeout: 15000 });
}
const BASE_OPTS = { folder: '/photos', order: 'name', intervalSec: 2, transition: 'fade', transitionMs: 200 };
const clickAt = async (id, rx) => {
    const box = await W(id).locator('.aura-slideshow-stage').boundingBox();
    await page.mouse.click(box.x + box.width * rx, box.y + box.height / 2);
};

// ── stepping ─────────────────────────────────────────────────────────────────
await mount('ss-1', BASE_OPTS);
check('starts with the first file by name', await waitShown('ss-1', 'a.svg'), await shown('ss-1'));
check(
    'asks the server for the folder, not recursive',
    server.mediaCalls.some((c) => c.path === '/photos' && c.recursive === '0'),
    JSON.stringify(server.mediaCalls),
);
check('steps on by itself', await waitShown('ss-1', 'b.svg', 5000), await shown('ss-1'));
check('skips the file that does not load', await waitShown('ss-1', 'c.svg', 6000), await shown('ss-1'));

// ── controls ────────────────────────────────────────────────────────────────
await clickAt('ss-1', 0.9);
check('tap on the right edge: next (wraps to the start)', await waitShown('ss-1', 'a.svg', 3000), await shown('ss-1'));
await clickAt('ss-1', 0.1);
check('tap on the left edge: back', await waitShown('ss-1', 'c.svg', 3000), await shown('ss-1'));
await clickAt('ss-1', 0.5);
check(
    'tap in the middle pauses',
    (await W('ss-1').locator('[data-aura-slideshow-paused]').count()) === 1 &&
        (await W('ss-1').locator('.aura-slideshow-paused').isVisible()),
);
await page.waitForTimeout(3000);
check('paused: stays on the same file', (await shown('ss-1')) === 'c.svg', await shown('ss-1'));
{
    const box = await W('ss-1').locator('.aura-slideshow-stage').boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.6, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, y, { steps: 5 });
    await page.mouse.up();
}
check('swipe left: next', await waitShown('ss-1', 'a.svg', 3000), await shown('ss-1'));

// ── remount continues (screensaver popup) ────────────────────────────────────
{
    const before = await shown('ss-1');
    await page.evaluate(() =>
        window.__auraShot.showWidgets([
            { id: 'other', type: 'value', title: 'x', datapoint: 'demo.x', gridPos: { x: 0, y: 0, w: 4, h: 4 } },
        ]),
    );
    await page.waitForTimeout(300);
    await mount('ss-1', BASE_OPTS);
    check(
        'remounted: continues after the file shown last',
        await waitShown('ss-1', 'b.svg', 5000),
        `${before} → ${await shown('ss-1')}`,
    );
}

// ── random order ─────────────────────────────────────────────────────────────
{
    const saved = server.items;
    server.items = ['r1', 'r2', 'r3', 'r4', 'r5'].map((n, i) => img(`${n}.svg`, i));
    await mount('ss-rand', { ...BASE_OPTS, order: 'random', intervalSec: 60 });
    await page.waitForTimeout(800);
    const seen = [await shown('ss-rand')];
    for (let i = 0; i < 4; i++) {
        const prev = seen[seen.length - 1];
        await clickAt('ss-rand', 0.9);
        const end = Date.now() + 3000;
        while (Date.now() < end && (await shown('ss-rand')) === prev) await page.waitForTimeout(80);
        seen.push(await shown('ss-rand'));
    }
    check('random: five steps, five different files', new Set(seen).size === 5, seen.join(' '));
    server.items = saved;
}

// ── caption ──────────────────────────────────────────────────────────────────
await mount('ss-cap', { ...BASE_OPTS, showCaption: 'name', intervalSec: 60 });
await page.waitForTimeout(600);
{
    const cap = await W('ss-cap')
        .locator('.aura-slideshow-caption')
        .first()
        .innerText()
        .catch(() => '');
    check('caption shows the file name', cap === (await shown('ss-cap')), cap);
}

// ── notices ──────────────────────────────────────────────────────────────────
await mount('ss-none', { intervalSec: 5 });
check('no folder: notice', /Kein Ordner/.test(await W('ss-none').innerText()), await W('ss-none').innerText());
server.status = 403;
await mount('ss-403', { ...BASE_OPTS, folder: '/secret' });
await page.waitForTimeout(800);
check(
    'folder outside the roots: notice',
    /nicht freigegeben/.test(await W('ss-403').innerText()),
    await W('ss-403').innerText(),
);
server.status = 200;
{
    const saved = server.items;
    server.items = [];
    await mount('ss-empty', { ...BASE_OPTS, folder: '/empty' });
    await page.waitForTimeout(800);
    check(
        'empty folder: notice',
        /Keine Bilder/.test(await W('ss-empty').innerText()),
        await W('ss-empty').innerText(),
    );
    server.items = saved;
}

// ── editor ───────────────────────────────────────────────────────────────────
await mount('ss-edit', BASE_OPTS);
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(600);
{
    const first = await shown('ss-edit');
    check('editor: file count shown', /4 Dateien/.test(await W('ss-edit').innerText()), await W('ss-edit').innerText());
    await page.waitForTimeout(3000);
    check('editor: does not step', (await shown('ss-edit')) === first, `${first} → ${await shown('ss-edit')}`);
}

// ── settings dialog: folder picker ───────────────────────────────────────────
{
    await page.evaluate(() => window.__auraShot.unfoldSections());
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    await page.locator('[data-aura-slideshow-pick]').click();
    const picker = page.locator('.z-\\[10050\\]').last();
    await picker.getByText('Fotos', { exact: true }).click();
    await picker.getByText('2024', { exact: true }).click();
    const bar = picker.locator('.aura-picker-folder-bar');
    await bar.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
    check(
        'picker counts the images and videos of the folder',
        /2 passende/.test(await bar.innerText()),
        await bar.innerText(),
    );
    await picker.locator('[data-aura-pick-folder]').click();
    await page.waitForTimeout(300);
    const opts = await page.evaluate(() => window.__auraShot.widgetOptions('ss-edit'));
    check('picked folder lands in the options', opts?.folder === '/photos/2024', JSON.stringify(opts?.folder));
    check('picker closed', (await page.locator('.z-\\[10050\\]').count()) === 0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

// ── video with sound ─────────────────────────────────────────────────────────
{
    const b64 = await page.evaluate(async () => {
        const c = document.createElement('canvas');
        c.width = 160;
        c.height = 120;
        const g = c.getContext('2d');
        const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm' });
        const chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        let i = 0;
        const iv = setInterval(() => {
            g.fillStyle = `hsl(${i++ * 20},80%,50%)`;
            g.fillRect(0, 0, 160, 120);
        }, 40);
        rec.start();
        await new Promise((r) => setTimeout(r, 1500));
        const stopped = new Promise((r) => (rec.onstop = r));
        rec.stop();
        await stopped;
        clearInterval(iv);
        const buf = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
        let bin = '';
        for (const b of buf) bin += String.fromCharCode(b);
        return btoa(bin);
    });
    server.video = Buffer.from(b64, 'base64');
    const saved = server.items;
    server.items = [
        {
            path: '/photos/clip.webm',
            name: 'clip.webm',
            kind: 'video',
            size: server.video.length,
            time: 1,
            dateSource: 'exif',
        },
    ];
    await page.evaluate(() => (window.__gesture = false));
    await mount('ss-vid', { ...BASE_OPTS, includeVideos: true, videoSound: true, videoVolume: 40 });
    const sound = W('ss-vid').locator('.aura-slideshow-sound');
    await sound.waitFor({ timeout: 8000 }).catch(() => {});
    const v = () =>
        W('ss-vid')
            .locator('video')
            .first()
            .evaluate((el) => ({ muted: el.muted, paused: el.paused, volume: el.volume }));
    check(
        'sound refused: plays muted, shows the speaker button',
        (await sound.isVisible()) && (await v()).muted,
        JSON.stringify(await v()),
    );
    await page.mouse.click(1200, 880); // anywhere on the page
    await page.waitForTimeout(300);
    const after = await v();
    check(
        'first tap on the page: sound on, button gone',
        !after.muted && !(await sound.isVisible()),
        JSON.stringify(after),
    );
    check('volume from the option', Math.abs(after.volume - 0.4) < 0.01, String(after.volume));
    // An announcement of the speech output takes priority. The store is imported under
    // the URL the app loaded it from: after a hot update the dev server appends ?t=…,
    // and the bare URL would be a second, unconnected instance.
    const setSpeaking = (playing) =>
        page.evaluate(async (playing) => {
            const url = performance
                .getEntriesByType('resource')
                .map((e) => e.name)
                .find((n) => n.includes('/src-vis/store/speechStore.ts'));
            if (!url) return false;
            (await import(url)).useSpeechStore.setState({ playing });
            return true;
        }, playing);
    if (await setSpeaking(true)) {
        await page.waitForTimeout(200);
        check('announcement playing: video muted', (await v()).muted, JSON.stringify(await v()));
        await setSpeaking(false);
        await page.waitForTimeout(200);
        check('announcement over: sound back', !(await v()).muted, JSON.stringify(await v()));
    } else {
        console.log('  skip  speech priority (store not importable)');
    }
    server.items = saved;
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
