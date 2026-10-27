// Verifies the news widget (issue #854) in the browser.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/feed-widget.mjs
//
// The server side is mocked with Playwright routes: /feed answers fixture feeds
// (one host embeddable, one not, one broken), /feed/frame the embeddability.
// Checked: list (merged, newest first, source labels, relative time, images),
// opening an article (auto → popup or new tab, newTab, editor does nothing),
// cards, ticker (doubled track, pauses on hover), single (rotates, swipe), the
// rssfeed adapter source, filters, error notices and the warning for one failing
// feed, phase 2 (new marks, announcing arrivals, read aloud, image proxy), and the
// settings dialog (add a URL feed, rssfeed states offered).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const NOW = Date.now();
const rfc = (msAgo) => new Date(NOW - msAgo).toUTCString();
const rss = (title, items) =>
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>${title}</title>${items
        .map(
            (i) =>
                `<item><title>${i.title}</title><link>${i.link}</link><guid>${i.link}</guid><pubDate>${rfc(i.ago)}</pubDate><description>${i.desc ?? ''}</description>${
                    i.img ? `<media:thumbnail url="${i.img}"/>` : ''
                }</item>`,
        )
        .join('')}</channel></rss>`;

const IMG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#2563eb"/></svg>',
    );

const FEEDS = {
    'https://news.embed.test/rss': rss('Embed News', [
        { title: 'Embed eins', link: 'https://news.embed.test/1', ago: 5 * 60e3, desc: 'Erster Teaser', img: IMG },
        { title: 'Embed drei', link: 'https://news.embed.test/3', ago: 3 * 3600e3, desc: 'Wetter morgen' },
    ]),
    'https://news.noframe.test/rss': rss('Noframe News', [
        { title: 'Noframe zwei', link: 'https://news.noframe.test/2', ago: 30 * 60e3, desc: 'Sport heute', img: IMG },
        // the same article as in the first feed - shown once
        { title: 'Embed eins', link: 'https://news.embed.test/1', ago: 5 * 60e3 },
    ]),
};
const feedCalls = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
    window.__opened = [];
    window.open = (url) => {
        window.__opened.push(String(url));
        return null;
    };
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.route('**/feed?**', (route) => {
    const u = new URL(route.request().url());
    const url = u.searchParams.get('url');
    feedCalls.push({ url, ttl: u.searchParams.get('ttl') });
    if (url === 'https://broken.test/rss') return route.fulfill({ status: 502, body: 'HTTP 500' });
    if (url === 'https://html.test/')
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' });
    return route.fulfill({ status: 200, contentType: 'application/rss+xml', body: FEEDS[url] ?? '' });
});
await page.route('**/feed/frame?**', (route) => {
    const url = new URL(route.request().url()).searchParams.get('url') ?? '';
    return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ embeddable: url.includes('embed.test') }),
    });
});
// The article pages themselves, for the popup iframe.
await page.route('https://news.embed.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Artikel</body></html>' }),
);

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });

const W = (id) => page.locator(`.aura-widget-${id}`).first();
const SRC = [
    { id: 'a', type: 'url', url: 'https://news.embed.test/rss' },
    { id: 'b', type: 'url', url: 'https://news.noframe.test/rss', name: 'Zweite', color: '#ef4444' },
];
async function mount(id, options, layout, h = 14) {
    await page.evaluate(
        ([id, options, layout, h]) => {
            window.__auraShot.showWidgets([
                { id, type: 'feed', title: 'News', layout, gridPos: { x: 0, y: 0, w: 16, h }, options },
            ]);
        },
        [id, options, layout, h],
    );
    await W(id).waitFor({ timeout: 15000 });
}
const titles = (id) => W(id).locator('.aura-feed-title').allInnerTexts();
async function waitFor(fn, timeout = 8000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        if (await fn()) return true;
        await page.waitForTimeout(100);
    }
    return false;
}

// ── list ─────────────────────────────────────────────────────────────────────
await mount('fl', { feeds: SRC });
await waitFor(async () => (await titles('fl')).length === 3);
check(
    'list: merged, newest first, duplicate once',
    JSON.stringify(await titles('fl')) === JSON.stringify(['Embed eins', 'Noframe zwei', 'Embed drei']),
    JSON.stringify(await titles('fl')),
);
check(
    'list: fetched with the default ttl',
    feedCalls.some((c) => c.ttl === '900'),
    JSON.stringify(feedCalls.slice(0, 2)),
);
{
    const meta = await W('fl').locator('.aura-feed-meta').allInnerTexts();
    check(
        'list: source label from the feed title, own name wins',
        /Embed News/.test(meta[0]) && /Zweite/.test(meta[1]),
        JSON.stringify(meta),
    );
    check(
        'list: relative time',
        /vor 5 min/.test(meta[0]) && /vor 30 min/.test(meta[1]) && /vor 3 h/.test(meta[2]),
        JSON.stringify(meta),
    );
    check('list: preview images', (await W('fl').locator('img.aura-feed-image').count()) === 2);
    check('list: no teaser by default', (await W('fl').locator('.aura-feed-summary').count()) === 0);
}

// ── opening ──────────────────────────────────────────────────────────────────
await page.waitForTimeout(300); // frame probes answered
await W('fl').locator('[data-aura-feed-item="https://news.embed.test/1"]').click();
{
    const frame = page.locator('iframe[src="https://news.embed.test/1"]');
    check(
        'auto: embeddable site opens in the popup',
        await frame.waitFor({ timeout: 5000 }).then(
            () => true,
            () => false,
        ),
    );
    check('popup titled with the headline', (await page.getByText('Embed eins').count()) > 1);
    await page.keyboard.press('Escape');
    await frame.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
}
await W('fl').locator('[data-aura-feed-item="https://news.noframe.test/2"]').click();
check(
    'auto: refusing site opens a new tab',
    (await page.evaluate(() => window.__opened)).includes('https://news.noframe.test/2'),
);
check('no popup for it', (await page.locator('iframe[src="https://news.noframe.test/2"]').count()) === 0);

await mount('fn', { feeds: SRC, openMode: 'newTab' });
await waitFor(async () => (await titles('fn')).length === 3);
await page.evaluate(() => (window.__opened = []));
await W('fn').locator('[data-aura-feed-item="https://news.embed.test/1"]').click();
check(
    'newTab: always a new tab',
    JSON.stringify(await page.evaluate(() => window.__opened)) === '["https://news.embed.test/1"]',
);

// ── teaser, filters, own options ─────────────────────────────────────────────
await mount('ff', {
    feeds: SRC,
    showSummary: true,
    showImage: false,
    showSource: false,
    showDate: 'none',
    includeKeywords: 'teaser, SPORT',
});
await waitFor(async () => (await titles('ff')).length === 2);
check(
    'include filter on title and teaser',
    JSON.stringify(await titles('ff')) === JSON.stringify(['Embed eins', 'Noframe zwei']),
    JSON.stringify(await titles('ff')),
);
check(
    'teaser shown',
    (await W('ff').locator('.aura-feed-summary').allInnerTexts()).join('|') === 'Erster Teaser|Sport heute',
);
check('images, source and time off', (await W('ff').locator('img.aura-feed-image, .aura-feed-meta').count()) === 0);
await mount('fx', { feeds: SRC, excludeKeywords: 'wetter', maxItems: 1 });
await waitFor(async () => (await titles('fx')).length === 1);
check(
    'exclude + max items',
    JSON.stringify(await titles('fx')) === '["Embed eins"]',
    JSON.stringify(await titles('fx')),
);

// ── cards ────────────────────────────────────────────────────────────────────
await mount('fc', { feeds: SRC }, 'card');
await waitFor(async () => (await W('fc').locator('.aura-feed-card').count()) === 3);
check('cards: one card per article', (await W('fc').locator('.aura-feed-card').count()) === 3);
{
    const box = await W('fc').locator('.aura-feed-card img').first().boundingBox();
    check('cards: 16:9 image on top', box && Math.abs(box.width / box.height - 16 / 9) < 0.05, JSON.stringify(box));
}

// ── ticker ───────────────────────────────────────────────────────────────────
await mount('ft', { feeds: SRC, tickerSpeed: 50 }, 'ticker', 3);
await waitFor(async () => (await W('ft').locator('.aura-feed-ticker-item').count()) === 6);
check('ticker: headlines twice for a seamless loop', (await W('ft').locator('.aura-feed-ticker-item').count()) === 6);
{
    const track = W('ft').locator('.aura-feed-ticker-track');
    const st = await track.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { name: cs.animationName, dur: parseFloat(cs.animationDuration), half: el.scrollWidth / 2 };
    });
    check(
        'ticker: animated at the set speed',
        st.name === 'aura-feed-ticker' && Math.abs(st.dur - Math.max(5, st.half / 50)) < 0.5,
        JSON.stringify(st),
    );
    check('ticker: one line', (await W('ft').locator('.aura-feed-ticker').boundingBox()).height < 60);
    await W('ft').locator('.aura-feed-ticker').hover();
    check('ticker: hover pauses', (await track.evaluate((el) => getComputedStyle(el).animationPlayState)) === 'paused');
    await page.mouse.move(1270, 890);
}

// ── single ───────────────────────────────────────────────────────────────────
await mount('fs', { feeds: SRC, rotateSec: 2 }, 'single', 8);
const singleTitle = () =>
    W('fs')
        .locator('.aura-feed-title')
        .first()
        .innerText()
        .catch(() => '');
await waitFor(async () => (await singleTitle()) === 'Embed eins');
check('single: starts with the newest', (await singleTitle()) === 'Embed eins', await singleTitle());
check('single: one dot per article', (await W('fs').locator('.aura-feed-dots button').count()) === 3);
check(
    'single: rotates by itself',
    await waitFor(async () => (await singleTitle()) === 'Noframe zwei', 4000),
    await singleTitle(),
);
{
    const box = await W('fs').locator('.aura-feed-single-stage').boundingBox();
    const y = box.y + box.height / 2;
    await page.evaluate(() => (window.__opened = []));
    await page.mouse.move(box.x + box.width * 0.7, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, y, { steps: 6 });
    await page.mouse.up();
    check(
        'single: swipe left goes on',
        await waitFor(async () => (await singleTitle()) === 'Embed drei', 2000),
        await singleTitle(),
    );
    check('single: a swipe does not open the article', (await page.evaluate(() => window.__opened)).length === 0);
    await page.mouse.move(1270, 890);
}

// ── rssfeed adapter source ───────────────────────────────────────────────────
{
    const state = JSON.stringify({
        meta: { title: 'Tagesschau' },
        articles: [
            { title: 'Adapter eins', link: 'https://tagesschau.test/1', date: new Date(NOW - 60e3).toISOString() },
            { title: 'Adapter zwei', link: 'https://tagesschau.test/2', date: new Date(NOW - 7200e3).toISOString() },
        ],
    });
    await page.evaluate((state) => {
        window.__auraShot.mock({ 'rssfeed.0.tagesschau': state });
        window.__auraShot.mockServerState({ 'rssfeed.0.tagesschau': state });
    }, state);
    await mount('fa', { feeds: [{ id: 'r', type: 'adapter', datapoint: 'rssfeed.0.tagesschau' }, SRC[1]] });
    await waitFor(async () => (await titles('fa')).length === 4);
    check(
        'adapter + url feed merged',
        JSON.stringify(await titles('fa')) ===
            JSON.stringify(['Adapter eins', 'Embed eins', 'Noframe zwei', 'Adapter zwei']),
        JSON.stringify(await titles('fa')),
    );
    check(
        'adapter: feed title as source',
        /Tagesschau/.test(await W('fa').locator('.aura-feed-meta').first().innerText()),
    );
}

// ── errors ───────────────────────────────────────────────────────────────────
await mount('fe', { feeds: [{ id: 'x', type: 'url', url: 'https://broken.test/rss' }] });
check(
    'unreachable feed: notice',
    await waitFor(async () => /nicht erreichbar/.test(await W('fe').innerText())),
    await W('fe').innerText(),
);
await mount('fh', { feeds: [{ id: 'x', type: 'url', url: 'https://html.test/' }] });
check(
    'no feed at the address: notice',
    await waitFor(async () => /Kein gültiger/.test(await W('fh').innerText())),
    await W('fh').innerText(),
);
await mount('fw', { feeds: [SRC[0], { id: 'x', type: 'url', url: 'https://broken.test/rss', name: 'Kaputt' }] });
await waitFor(async () => (await titles('fw')).length === 2);
{
    const warn = W('fw').locator('.aura-feed-warning');
    check(
        'one feed failing: articles of the other + warning',
        (await titles('fw')).length === 2 && (await warn.count()) === 1,
    );
    check(
        'warning names the feed',
        /Kaputt/.test((await warn.getAttribute('title')) ?? ''),
        await warn.getAttribute('title'),
    );
}
await mount('f0', {});
check('no feeds: notice', /Kein Feed/.test(await W('f0').innerText()));

// ── phase 2: new marks, announcements, read aloud, image proxy ───────────────
{
    // The speech store as the app loaded it (after a hot update the URL carries ?t=…).
    const speech = (fn) =>
        page.evaluate(async (fn) => {
            const url = performance
                .getEntriesByType('resource')
                .map((e) => e.name)
                .find((n) => n.includes('/src-vis/store/speechStore.ts'));
            if (!url) return null;
            const m = await import(url);
            if (fn === 'clear') return m.__devClearAnnounced();
            return m.__devAnnounced().map((r) => r.text);
        }, fn);
    const art = (n, minAgo) => ({
        title: `Meldung ${n}`,
        link: `https://neu.test/${n}`,
        date: new Date(NOW - minAgo * 60e3).toISOString(),
    });
    const setFeed = (articles) =>
        page.evaluate(
            (state) => {
                window.__auraShot.mock({ 'rssfeed.0.neu': state });
                window.__auraShot.mockServerState({ 'rssfeed.0.neu': state });
            },
            JSON.stringify({ meta: { title: 'Neu' }, articles }),
        );
    const NEWS = { feeds: [{ id: 'n', type: 'adapter', datapoint: 'rssfeed.0.neu' }], openMode: 'none' };
    const dots = (id) => W(id).locator('.aura-feed-new').count();
    const unreadText = (id) =>
        W(id)
            .locator('.aura-feed-unread')
            .innerText({ timeout: 500 })
            .catch(() => '');

    await page.evaluate(() => localStorage.removeItem('aura-feed-seen:fnew'));
    await setFeed([art(1, 30), art(2, 60)]);
    await mount('fnew', { ...NEWS, markNew: true, speakNew: true });
    await waitFor(async () => (await titles('fnew')).length === 2);
    await speech('clear');
    check('new: nothing new on the very first load', (await dots('fnew')) === 0 && !(await unreadText('fnew')));

    await setFeed([art(3, 1), art(1, 30), art(2, 60)]);
    await waitFor(async () => (await titles('fnew')).length === 3);
    check(
        'new: the arrival gets a dot',
        (await W('fnew').locator('[data-aura-feed-item="https://neu.test/3"] .aura-feed-new').count()) === 1,
    );
    check('new: "1 neu" in the title row', /1 neu/.test(await unreadText('fnew')), await unreadText('fnew'));
    check(
        'speak: the arrival is announced, the first load was not',
        JSON.stringify(await speech()) === '["Neue Meldung: Meldung 3"]',
        JSON.stringify(await speech()),
    );

    await W('fnew').locator('[data-aura-feed-item="https://neu.test/3"]').click();
    check('new: tapping an article marks it read', (await dots('fnew')) === 0 && !(await unreadText('fnew')));

    await setFeed([art(4, 0), art(5, 0.5), art(3, 1), art(1, 30), art(2, 60)]);
    await waitFor(async () => (await dots('fnew')) === 2);
    check('new: two more → "2 neu"', /2 neu/.test(await unreadText('fnew')), await unreadText('fnew'));
    await W('fnew').locator('.aura-feed-unread').click();
    check('new: "N neu" marks all read', (await dots('fnew')) === 0);

    // Read marks live on this device: a remount (reload) keeps them.
    await page.evaluate(() =>
        window.__auraShot.showWidgets([
            { id: 'tmp', type: 'value', title: 'x', datapoint: 'demo.x', gridPos: { x: 0, y: 0, w: 4, h: 4 } },
        ]),
    );
    await page.waitForTimeout(200);
    await speech('clear');
    await mount('fnew', { ...NEWS, markNew: true, speakNew: true });
    await waitFor(async () => (await titles('fnew')).length === 5);
    await page.waitForTimeout(300);
    check('new: read marks survive a remount', (await dots('fnew')) === 0);
    check('speak: a remount does not announce again', (await speech()).length === 0, JSON.stringify(await speech()));

    const many = [10, 11, 12, 13, 14].map((n) => art(n, 0));
    await setFeed([...many, art(4, 0), art(5, 0.5), art(3, 1), art(1, 30), art(2, 60)]);
    await waitFor(async () => (await dots('fnew')) === 5);
    check('speak: at most three arrivals at once', (await speech()).length === 3, JSON.stringify(await speech()));

    // Read aloud button
    await mount('fread', { ...NEWS, speakButton: true, speakCount: 2 });
    await waitFor(async () => (await titles('fread')).length > 2);
    await speech('clear');
    await W('fread').locator('.aura-feed-speak').click();
    check(
        'read aloud: the first speakCount headlines',
        JSON.stringify(await speech()) === '["Meldung 10. Meldung 11."]',
        JSON.stringify(await speech()),
    );
    check('read aloud: no new marks without markNew', (await dots('fread')) === 0);

    // Image proxy
    await page.route('https://img.fail.test/**', (route) => route.fulfill({ status: 403, body: 'hotlink' }));
    await page.route('**/proxy?url=**', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#0f0"/></svg>',
        }),
    );
    const state = JSON.stringify({
        meta: { title: 'Bilder' },
        articles: [{ title: 'Mit Bild', link: 'https://img.test/1', image: { url: 'https://img.fail.test/a.jpg' } }],
    });
    await page.evaluate((state) => {
        window.__auraShot.mock({ 'rssfeed.0.img': state });
        window.__auraShot.mockServerState({ 'rssfeed.0.img': state });
    }, state);
    const IMGS = { feeds: [{ id: 'i', type: 'adapter', datapoint: 'rssfeed.0.img' }] };
    const img = (id) => W(id).locator('img.aura-feed-image');
    const src = (id) => img(id).getAttribute('src', { timeout: 5000 });

    await mount('fimg-auto', IMGS);
    check(
        'image auto: a refused picture is retried through Aura',
        await waitFor(async () => /proxy\?url=https%3A%2F%2Fimg\.fail\.test/.test((await src('fimg-auto')) ?? '')),
        await src('fimg-auto'),
    );
    check(
        'image auto: …and shown',
        await waitFor(() => img('fimg-auto').evaluate((el) => el.naturalWidth > 0 && el.style.display !== 'none')),
    );
    await mount('fimg-always', { ...IMGS, imageProxy: 'always' });
    check('image always: through Aura from the start', /proxy\?url=/.test((await src('fimg-always')) ?? ''));
    await mount('fimg-off', { ...IMGS, imageProxy: 'off' });
    check(
        'image off: broken picture hidden, no retry',
        await waitFor(() => img('fimg-off').evaluate((el) => el.style.display === 'none')),
    );
    check('image off: src stays direct', (await src('fimg-off')) === 'https://img.fail.test/a.jpg');
}

// ── editor ───────────────────────────────────────────────────────────────────
await mount('fed', { feeds: [SRC[0]] });
await waitFor(async () => (await titles('fed')).length === 2);
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.waitForTimeout(400);
await page.evaluate(() => (window.__opened = []));
await W('fed').locator('.aura-feed-title').first().click({ force: true });
check(
    'editor: a tap opens nothing',
    (await page.evaluate(() => window.__opened)).length === 0 &&
        (await page.locator('iframe[src^="https://news."]').count()) === 0,
);
{
    await page.evaluate(() =>
        window.__auraShot.mockObjectView({
            state: [
                { id: 'rssfeed.0.info.lastRequest', value: {} },
                { id: 'rssfeed.0.tagesschau', value: {} },
                { id: 'rssfeed.0.heise', value: {} },
            ],
        }),
    );
    await page.evaluate(() => window.__auraShot.unfoldSections());
    await W('fed').hover();
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const dlg = page.locator('[data-aura-config-section="datapoints"]');
    await dlg.locator('[data-aura-feed-add]').click();
    await dlg.locator('[data-aura-feed-url]').fill('https://neu.test/feed.xml');
    await dlg.locator('[data-aura-feed-add-confirm]').click();
    await page.waitForTimeout(200);
    let opts = await page.evaluate(() => window.__auraShot.widgetOptions('fed'));
    check(
        'settings: URL feed added',
        opts?.feeds?.[1]?.url === 'https://neu.test/feed.xml' && opts.feeds[1].type === 'url',
        JSON.stringify(opts?.feeds),
    );

    await dlg.locator('[data-aura-feed-add]').click();
    await dlg.locator('[data-aura-feed-type="adapter"]').click();
    const sel = dlg.locator('select').first();
    await sel.waitFor({ timeout: 5000 });
    const offered = await sel.locator('option').allInnerTexts();
    check(
        'settings: rssfeed feeds offered, info.* not',
        JSON.stringify(offered) === JSON.stringify(['rssfeed.0.heise', 'rssfeed.0.tagesschau']),
        JSON.stringify(offered),
    );
    await sel.selectOption('rssfeed.0.tagesschau');
    await dlg.locator('[data-aura-feed-add-confirm]').click();
    await page.waitForTimeout(200);
    opts = await page.evaluate(() => window.__auraShot.widgetOptions('fed'));
    check(
        'settings: adapter feed added',
        opts?.feeds?.[2]?.datapoint === 'rssfeed.0.tagesschau' && opts.feeds[2].type === 'adapter',
        JSON.stringify(opts?.feeds),
    );
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__auraShot.setEditMode(false));
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
