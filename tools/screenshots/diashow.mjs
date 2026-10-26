// Documentation screenshots for the slideshow widget (issue #848).
// Output: docs/widgets/assets/diashow/runtime.png   (Kachel, Hochformat mit unscharfem Hintergrund, Beschriftung)
//         docs/widgets/assets/diashow/rahmen.png    (fit "cover", ohne Titel: Bilderrahmen / Bildschirmschoner)
//         docs/widgets/assets/diashow/umblaettern.png (Übergang „Umblättern“ mittendrin)
//         docs/widgets/assets/diashow/config.png    (Bearbeiten-Dialog)
//         docs/widgets/assets/diashow/ordner.png    (Ordner wählen)
//
//   npm run dev            (or set AURA_BASE)
//   node tools/screenshots/diashow.mjs
//
// /fs/media, /fs/read, /fs/roots and /fs/list are answered by Playwright routes;
// the "photos" are drawn SVG landscapes, so no adapter and no picture files are needed.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const OUT = 'docs/widgets/assets/diashow';
mkdirSync(OUT, { recursive: true });

/** A landscape "photo": sky, sun, two mountain ridges, water. */
function landscape({ w, h, sky, sun, far, near, water }) {
    const hz = h * 0.62;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
<linearGradient id="wa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${water[0]}"/><stop offset="1" stop-color="${water[1]}"/></linearGradient>
<radialGradient id="g"><stop offset="0" stop-color="${sun}" stop-opacity=".9"/><stop offset="1" stop-color="${sun}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${w}" height="${h}" fill="url(#s)"/>
<circle cx="${w * 0.68}" cy="${hz * 0.55}" r="${Math.min(w, h) * 0.32}" fill="url(#g)"/>
<circle cx="${w * 0.68}" cy="${hz * 0.55}" r="${Math.min(w, h) * 0.07}" fill="${sun}"/>
<path d="M0 ${hz} L${w * 0.18} ${hz * 0.62} L${w * 0.33} ${hz * 0.8} L${w * 0.52} ${hz * 0.5} L${w * 0.75} ${hz * 0.78} L${w} ${hz * 0.6} L${w} ${hz} Z" fill="${far}"/>
<path d="M0 ${hz} L${w * 0.12} ${hz * 0.82} L${w * 0.3} ${hz * 0.93} L${w * 0.46} ${hz * 0.76} L${w * 0.66} ${hz * 0.95} L${w * 0.86} ${hz * 0.8} L${w} ${hz * 0.9} L${w} ${hz} Z" fill="${near}"/>
<rect y="${hz}" width="${w}" height="${h - hz}" fill="url(#wa)"/>
<rect x="${w * 0.6}" y="${hz + 6}" width="${w * 0.16}" height="3" fill="${sun}" opacity=".55"/>
<rect x="${w * 0.63}" y="${hz + 16}" width="${w * 0.1}" height="3" fill="${sun}" opacity=".35"/>
</svg>`;
}

const PHOTOS = [
    {
        name: 'IMG_2041.jpg',
        time: Date.UTC(2024, 9, 2, 18, 40),
        svg: landscape({
            w: 900,
            h: 1200,
            sky: ['#1e3a8a', '#f97316'],
            sun: '#fde68a',
            far: '#7c2d12',
            near: '#431407',
            water: ['#9a3412', '#1e1b4b'],
        }),
    },
    {
        name: 'IMG_1877.jpg',
        time: Date.UTC(2024, 6, 3, 9, 15),
        svg: landscape({
            w: 1600,
            h: 1000,
            sky: ['#38bdf8', '#e0f2fe'],
            sun: '#fffbeb',
            far: '#64748b',
            near: '#166534',
            water: ['#0ea5e9', '#075985'],
        }),
    },
    {
        name: 'IMG_2290.jpg',
        time: Date.UTC(2024, 9, 1, 7, 5),
        svg: landscape({
            w: 1600,
            h: 1000,
            sky: ['#a78bfa', '#fbcfe8'],
            sun: '#fff1f2',
            far: '#6d28d9',
            near: '#3b0764',
            water: ['#c084fc', '#4c1d95'],
        }),
    },
];
const ITEMS = PHOTOS.map((p) => ({
    path: `/media/fotos/Urlaub 2024/${p.name}`,
    name: p.name,
    kind: 'image',
    size: 2_400_000,
    time: p.time,
    dateSource: 'exif',
}));

const browser = await chromium.launch();
const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

await page.route('**/fs/media?**', (r) =>
    r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ path: '/media/fotos', items: ITEMS, truncated: false, pending: 0 }),
    }),
);
await page.route('**/fs/read?**', (r) => {
    const name = (new URL(r.request().url()).searchParams.get('path') ?? '').split('/').pop();
    const photo = PHOTOS.find((p) => p.name === name);
    return photo
        ? r.fulfill({ status: 200, contentType: 'image/svg+xml', body: photo.svg })
        : r.fulfill({ status: 404, body: '' });
});
await page.route('**/fs/roots', (r) =>
    r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
            { label: 'ioBroker Files', path: '/opt/iobroker/iobroker-data/files' },
            { label: 'Fotos (USB)', path: '/media/fotos' },
        ]),
    }),
);
await page.route('**/fs/list?**', (r) => {
    const p = new URL(r.request().url()).searchParams.get('path');
    const file = (name, mime, size) => ({ name, isDir: false, size, mtime: 1, mime });
    const entries =
        p === '/media/fotos'
            ? [
                  { name: 'Familie', isDir: true, size: null, mtime: null, mime: null },
                  { name: 'Urlaub 2024', isDir: true, size: null, mtime: null, mime: null },
              ]
            : [
                  ...PHOTOS.map((ph) => file(ph.name, 'image/jpeg', 2_400_000)),
                  file('VID_2044.mp4', 'video/mp4', 18_000_000),
                  file('Reiseplan.pdf', 'application/pdf', 120_000),
              ];
    return r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ path: p, parent: null, entries }),
    });
});

await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 90000 });

const TILE = {
    id: 'w-ds-tile',
    type: 'slideshow',
    title: 'Urlaub 2024',
    gridPos: { x: 0, y: 0, w: 22, h: 16 },
    options: {
        folder: '/media/fotos/Urlaub 2024',
        order: 'dateDesc',
        intervalSec: 600,
        blurBackground: true,
        showCaption: 'nameDate',
        transition: 'pageTurn',
        transitionMs: 2400,
    },
};
const FRAME = {
    id: 'w-ds-frame',
    type: 'slideshow',
    title: 'Bilderrahmen',
    gridPos: { x: 0, y: 18, w: 22, h: 16 },
    options: {
        folder: '/media/fotos/Urlaub 2024',
        order: 'dateAsc',
        intervalSec: 600,
        fit: 'cover',
        showTitle: false,
        showIcon: false,
        controls: false,
    },
};
await page.evaluate(
    (widgets) => {
        window.__auraShot.seed({
            layouts: [
                {
                    id: 'lay-ds',
                    name: 'Diashow',
                    slug: 'diashow',
                    activeSectionId: 'sec-ds',
                    // The dev instance draws the breakpoint guidelines through the frontend.
                    settings: {
                        gridRowHeight: 20,
                        gridGap: 10,
                        guidelinesEnabled: false,
                        guidelinesShowInFrontend: false,
                    },
                    sections: [
                        {
                            id: 'sec-ds',
                            name: 'Diashow',
                            slug: 'diashow',
                            activeTabId: 'tab-ds',
                            tabs: [{ id: 'tab-ds', name: 'Fotos', slug: 'fotos', widgets }],
                        },
                    ],
                },
            ],
            activeLayoutId: 'lay-ds',
        });
    },
    [TILE, FRAME],
);
await page.waitForFunction(
    () =>
        document.querySelectorAll('.aura-widget-w-ds-tile [data-aura-slideshow-item]').length > 0 &&
        document.querySelectorAll('.aura-widget-w-ds-frame [data-aura-slideshow-item]').length > 0,
    null,
    { timeout: 20000 },
);
await page.waitForTimeout(800);
await page
    .locator('.aura-widget-w-ds-tile')
    .first()
    .screenshot({ path: `${OUT}/runtime.png` });
await page
    .locator('.aura-widget-w-ds-frame')
    .first()
    .screenshot({ path: `${OUT}/rahmen.png` });
console.log('✓ runtime.png, rahmen.png');

// Page turn, caught halfway.
{
    const box = await page.locator('.aura-widget-w-ds-tile .aura-slideshow-stage').boundingBox();
    await page.mouse.click(box.x + box.width * 0.92, box.y + box.height / 2);
    await page.waitForTimeout(1500);
    await page
        .locator('.aura-widget-w-ds-tile')
        .first()
        .screenshot({ path: `${OUT}/umblaettern.png` });
    console.log('✓ umblaettern.png');
}

// Settings dialog.
await page.evaluate(() => {
    window.__auraShot.setEditMode(true);
    window.__auraShot.unfoldSections();
});
await page.waitForTimeout(500);
await page.locator('.aura-widget-w-ds-tile .aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const modal = page.locator('.aura-widget-edit-modal').first();
await modal.waitFor({ timeout: 10000 });
await page.waitForTimeout(400);
// Only the slideshow's own sections: from "Einstellungen" to the end of "Video".
{
    const first = await modal.locator('[data-aura-config-section="settings"]').boundingBox();
    const video = modal.locator('[data-aura-config-section="video"]');
    await video.locator('input[type="checkbox"]').first().check();
    await page.waitForTimeout(200);
    await video.locator('input[type="checkbox"]').nth(1).check();
    await page.waitForTimeout(300);
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
    const a = await modal.locator('[data-aura-config-section="settings"]').boundingBox();
    const b = await video.boundingBox();
    void first;
    await page.screenshot({
        path: `${OUT}/config.png`,
        clip: { x: a.x - 8, y: a.y - 8, width: a.width + 16, height: b.y + b.height - a.y + 16 },
    });
    await page.setViewportSize({ width: 1600, height: 1200 });
    console.log('✓ config.png');
}

// Folder picker.
await page.locator('[data-aura-slideshow-pick]').click();
const picker = page.locator('.z-\\[10050\\]').last();
await picker.getByText('Fotos (USB)', { exact: true }).click();
await picker.getByText('Urlaub 2024', { exact: true }).click();
await picker.locator('.aura-picker-folder-bar').waitFor({ timeout: 5000 });
await page.waitForTimeout(400);
await picker
    .locator('.rounded-xl, .rounded-2xl')
    .first()
    .screenshot({ path: `${OUT}/ordner.png` });
console.log('✓ ordner.png');

await browser.close();
