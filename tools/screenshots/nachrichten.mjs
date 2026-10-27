// Documentation screenshots for the news widget (issue #854).
// Output: docs/widgets/assets/nachrichten/runtime.png     (Liste mit Anriss, zwei Quellen)
//         docs/widgets/assets/nachrichten/karten.png      (Layout "card")
//         docs/widgets/assets/nachrichten/laufschrift.png (Layout "ticker")
//         docs/widgets/assets/nachrichten/einzel.png      (Layout "single")
//         docs/widgets/assets/nachrichten/neu.png         (Neu-Markierung + Vorlese-Knopf)
//         docs/widgets/assets/nachrichten/config.png      (Bearbeiten-Dialog)
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/nachrichten.mjs
//
// /feed and /feed/frame are answered by Playwright routes with made-up feeds of
// made-up sources; the pictures are drawn SVGs. No adapter, no internet.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/nachrichten';
mkdirSync(OUT, { recursive: true });

/** A simple "press photo": gradient, a few shapes. */
const picture = (a, b, c) => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="640" height="360" fill="url(#g)"/>
<circle cx="470" cy="120" r="70" fill="${c}" opacity=".8"/>
<path d="M0 300 L160 190 L280 260 L420 160 L640 290 L640 360 L0 360 Z" fill="#000" opacity=".25"/>
</svg>`;
const PICTURES = {
    rathaus: picture('#0ea5e9', '#1e3a8a', '#fde68a'),
    rad: picture('#22c55e', '#14532d', '#fef08a'),
    markt: picture('#f97316', '#7c2d12', '#fed7aa'),
    chip: picture('#8b5cf6', '#1e1b4b', '#c4b5fd'),
    solar: picture('#facc15', '#b45309', '#fff7ed'),
};

const NOW = Date.now();
const item = (title, slug, minAgo, desc, pic) => ({ title, slug, minAgo, desc, pic });
const FEEDS = {
    'https://stadtanzeiger.example/rss': {
        title: 'Stadtanzeiger',
        items: [
            item(
                'Neuer Radweg entlang des Flussufers freigegeben',
                'radweg',
                12,
                'Nach acht Monaten Bauzeit ist der 3,2 Kilometer lange Abschnitt zwischen Altstadt und Hafen befahrbar.',
                'rad',
            ),
            item(
                'Wochenmarkt zieht ab Mai auf den Rathausplatz',
                'markt',
                95,
                'Die Händler bekommen mehr Platz, der Markt öffnet künftig auch samstags.',
                'markt',
            ),
            item(
                'Stadtrat beschließt Haushalt für das kommende Jahr',
                'haushalt',
                260,
                'Schwerpunkte sind Schulen, Brücken und der Ausbau des Nahverkehrs.',
                'rathaus',
            ),
        ],
    },
    'https://technik-blog.example/feed': {
        title: 'Technik-Blog',
        items: [
            item(
                'Balkonkraftwerk: Was die neue Grenze von 800 Watt bedeutet',
                'balkon',
                40,
                'Mehr Leistung ohne Anmeldung beim Netzbetreiber – worauf man beim Wechselrichter achten sollte.',
                'solar',
            ),
            item(
                'Smart Home lokal steuern: Thread und Matter im Praxistest',
                'matter',
                180,
                'Drei Wochen mit Sensoren, Lampen und Thermostaten ohne Cloud.',
                'chip',
            ),
        ],
    },
};
const rss = (url) => {
    const f = FEEDS[url];
    const host = new URL(url).origin;
    return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>${f.title}</title><link>${host}/</link>${f.items
        .map(
            (i) =>
                `<item><title>${i.title}</title><link>${host}/${i.slug}</link><pubDate>${new Date(NOW - i.minAgo * 60e3).toUTCString()}</pubDate><description>${i.desc}</description><media:thumbnail url="${host}/img/${i.pic}.svg"/></item>`,
        )
        .join('')}</channel></rss>`;
};

const browser = await chromium.launch();
// Reduced motion holds the ticker at its start, so the shot shows the first headlines.
const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
});
const page = await ctx.newPage();
await page.route('**/feed?**', (route) => {
    const url = new URL(route.request().url()).searchParams.get('url');
    return route.fulfill({ status: 200, contentType: 'application/rss+xml', body: rss(url) });
});
await page.route('**/feed/frame?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"embeddable":false}' }),
);
await page.route(/\.example\/img\/(\w+)\.svg$/, (route) => {
    const name = /img\/(\w+)\.svg$/.exec(route.request().url())[1];
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PICTURES[name] });
});

// Neu-Markierung: this device has "read" two of the five articles already.
await ctx.addInitScript(() => {
    localStorage.setItem(
        'aura-feed-seen:w-news-new',
        JSON.stringify({
            ids: ['https://stadtanzeiger.example/haushalt', 'https://technik-blog.example/matter'],
            sources: ['url:https://stadtanzeiger.example/rss', 'url:https://technik-blog.example/feed'],
        }),
    );
});
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });

const FEED_SOURCES = [
    { id: 's1', type: 'url', url: 'https://stadtanzeiger.example/rss', color: '#0ea5e9' },
    { id: 's2', type: 'url', url: 'https://technik-blog.example/feed', color: '#f59e0b' },
];
const WIDGETS = [
    {
        id: 'w-news-list',
        type: 'feed',
        title: 'Nachrichten',
        gridPos: { x: 0, y: 0, w: 10, h: 18 },
        options: { feeds: FEED_SOURCES, showSummary: true },
    },
    {
        id: 'w-news-cards',
        type: 'feed',
        title: 'Nachrichten',
        layout: 'card',
        gridPos: { x: 10, y: 0, w: 22, h: 18 },
        options: { feeds: FEED_SOURCES, maxItems: 6 },
    },
    {
        id: 'w-news-ticker',
        type: 'feed',
        title: 'Laufschrift',
        layout: 'ticker',
        gridPos: { x: 0, y: 19, w: 32, h: 3 },
        options: { feeds: FEED_SOURCES, showTitle: false, showIcon: false },
    },
    {
        id: 'w-news-single',
        type: 'feed',
        title: 'Schlagzeile',
        layout: 'single',
        gridPos: { x: 0, y: 23, w: 16, h: 7 },
        options: { feeds: FEED_SOURCES, showSummary: true, rotateSec: 600 },
    },
    {
        id: 'w-news-new',
        type: 'feed',
        title: 'Nachrichten',
        gridPos: { x: 16, y: 23, w: 10, h: 14 },
        options: { feeds: FEED_SOURCES, markNew: true, speakButton: true, showImage: false },
    },
];
await page.evaluate((widgets) => {
    window.__auraShot.seed({
        layouts: [
            {
                id: 'lay-news',
                name: 'Nachrichten',
                slug: 'nachrichten',
                activeSectionId: 'sec-news',
                settings: { gridRowHeight: 20, gridGap: 10, guidelinesEnabled: false, guidelinesShowInFrontend: false },
                sections: [
                    {
                        id: 'sec-news',
                        name: 'Nachrichten',
                        slug: 'nachrichten',
                        activeTabId: 'tab-news',
                        tabs: [{ id: 'tab-news', name: 'News', slug: 'news', widgets }],
                    },
                ],
            },
        ],
        activeLayoutId: 'lay-news',
    });
}, WIDGETS);
await page.waitForFunction(() => document.querySelectorAll('.aura-feed-item').length >= 20, null, { timeout: 20000 });
// Let the lazy preview images arrive.
await page.waitForFunction(
    () => [...document.querySelectorAll('img.aura-feed-image')].every((i) => i.complete && i.naturalWidth > 0),
    null,
    { timeout: 20000 },
);
// The screen-resolution hint of the dev instance would sit on top of the lower widgets.
await page
    .locator('button:text-is("Verstanden")')
    .click({ timeout: 2000 })
    .catch(() => {});
await page.waitForTimeout(500);

const shot = (id, file) =>
    page
        .locator(`.aura-widget-${id}`)
        .first()
        .screenshot({ path: `${OUT}/${file}` });
await shot('w-news-list', 'runtime.png');
await shot('w-news-cards', 'karten.png');
await shot('w-news-ticker', 'laufschrift.png');
await shot('w-news-single', 'einzel.png');
await shot('w-news-new', 'neu.png');
console.log('✓ runtime.png, karten.png, laufschrift.png, einzel.png, neu.png');

// Settings dialog: the widget's own sections, from "Feeds" to "Neu und Vorlesen".
await page.evaluate(() => {
    window.__auraShot.setEditMode(true);
    window.__auraShot.unfoldSections();
});
await page.waitForTimeout(500);
await page.locator('.aura-widget-w-news-list').hover();
await page.locator('.aura-widget-w-news-list .aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const modal = page.locator('.aura-widget-edit-modal').first();
await modal.waitFor({ timeout: 10000 });
await page.waitForTimeout(400);
await modal.evaluate((el) => {
    el.style.maxHeight = 'none';
    el.style.height = 'auto';
    for (const s of el.querySelectorAll('*')) {
        const cs = getComputedStyle(s);
        if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
            s.style.maxHeight = 'none';
            s.style.overflow = 'visible';
        }
    }
});
await page.setViewportSize({ width: 1600, height: 2600 });
await page.waitForTimeout(400);
{
    const a = await modal.locator('[data-aura-config-section="datapoints"]').boundingBox();
    const b = await modal.locator('[data-aura-config-section="news"]').boundingBox();
    await page.screenshot({
        path: `${OUT}/config.png`,
        clip: { x: a.x - 8, y: a.y - 8, width: a.width + 16, height: b.y + b.height - a.y + 16 },
    });
}
console.log('✓ config.png');

await browser.close();
