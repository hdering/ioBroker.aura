// „Tab ausfüllen“ in einer Popup-View (#865).
//
// Ist das einzige Widget der View auf fillTab gestellt, füllt es den Popup-Inhalt:
// bei Vollbild den Bildschirm, bei gesetzter Popup-Breite/-Höhe diese Größe. Ohne
// Größenangabe behält es seine entworfene Größe. Mit einem zweiten Widget in der
// View bleibt es beim Raster.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199
//   AURA_BASE=http://localhost:5199 node tools/tests/popup-fill-tab.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const DP = 'demo.popupFillTrigger';
const VIEW_ID = 'pv-fill-test';
const PAD = 8;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};
const near = (a, b) => Math.abs(a - b) <= 2;

const SVG = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#2a6"/></svg>',
)}`;
const image = (id, extra = {}) => ({
    id,
    type: 'image',
    title: '',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 4, h: 3 },
    options: { imageUrl: SVG, showTitle: false, ...extra },
});

function trigger(options) {
    return {
        id: 'pt-fill',
        name: 'Fill',
        enabled: true,
        clause: { datapoint: DP, operator: 'true', value: '' },
        host: {
            id: 'ptw-fill',
            type: 'value',
            title: 'Popup',
            datapoint: DP,
            gridPos: { x: 0, y: 0, w: 1, h: 1 },
            options: {
                clickAction: { kind: 'popup-view', viewId: VIEW_ID },
                popupHideTitle: true,
                popupPadding: PAD,
                ...options,
            },
        },
        resetDp: false,
    };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });

const settle = () => page.waitForTimeout(450);

async function open(options, widgets) {
    await page.keyboard.press('Escape');
    await settle();
    await page.evaluate(
        ([dp, rule, vs]) => {
            window.__auraShot.mock({ [dp]: false });
            window.__auraShot.popupViews(vs);
            window.__auraShot.dpTriggers([rule]);
        },
        [DP, trigger(options), [{ id: VIEW_ID, name: 'Fill', widgets }]],
    );
    await settle();
    await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), DP);
    await settle();
    return page.evaluate(() => {
        const cell = document.querySelector('[data-aura-click-popup] [data-aura-popup-widget]');
        if (!cell) return null;
        const r = cell.getBoundingClientRect();
        const cs = getComputedStyle(cell);
        return {
            x: Math.round(r.left),
            y: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height),
            pad: parseFloat(cs.paddingLeft),
            border: parseFloat(cs.borderLeftWidth),
            radius: parseFloat(cs.borderTopLeftRadius),
            fill: !!document.querySelector('[data-aura-click-popup] [data-aura-popup-fill]'),
        };
    });
}

// 1. Fullscreen: the widget runs edge to edge — no popup padding, no card frame.
const full = await open({ popupFullscreen: true }, [image('pw-a', { fillTab: true })]);
check(
    'Vollbild: Widget füllt den Bildschirm randlos',
    !!full && full.fill && full.x === 0 && full.y === 0 && near(full.w, 1280) && near(full.h, 900),
    JSON.stringify(full),
);
check(
    'Vollbild: ohne Rahmen, Ecken und Innenabstand',
    !!full && full.pad === 0 && full.border === 0 && full.radius === 0,
    JSON.stringify(full),
);

// 2. Set width/height: the widget fills that size.
const sized = await open({ popupWidth: 700, popupHeight: 500 }, [image('pw-b', { fillTab: true })]);
check(
    'Feste Popup-Größe: Widget füllt sie',
    !!sized && sized.fill && near(sized.w, 700 - 2 * PAD - 2) && near(sized.h, 500 - 2 * PAD - 2),
    JSON.stringify(sized),
);

// 3. No size: the widget keeps the size it has in the grid.
const plain = await open({}, [image('pw-c', { fillTab: true })]);
const grid = await open({}, [image('pw-g')]);
check(
    'Ohne Größe: entworfene Größe wie im Raster',
    !!plain && !!grid && plain.fill && !grid.fill && near(plain.h, grid.h) && near(plain.w, grid.w),
    JSON.stringify({ plain, grid }),
);

// 4. A second widget: back to the grid.
const shared = await open({ popupFullscreen: true }, [image('pw-d', { fillTab: true }), image('pw-e')]);
check('Zweites Widget: Raster statt Füllen', !!shared && !shared.fill && shared.h < 400, JSON.stringify(shared));

// 5. Fullscreen fills a lone widget without content height even without fillTab.
const implicit = await open({ popupFullscreen: true }, [image('pw-f')]);
check(
    'Vollbild ohne fillTab: Widget ohne Inhaltshöhe füllt randlos',
    !!implicit && implicit.fill && implicit.x === 0 && near(implicit.w, 1280) && near(implicit.h, 900),
    JSON.stringify(implicit),
);

// 6. … but a widget that sizes to its content keeps its designed size.
const list = await open({ popupFullscreen: true }, [
    { id: 'pw-l', type: 'list', title: 'Liste', datapoint: '', gridPos: { x: 0, y: 0, w: 4, h: 3 }, options: {} },
]);
check('Vollbild: Liste bleibt im Raster', !!list && !list.fill && list.h < 600, JSON.stringify(list));

// 7. Embedded widget (popup-widget) in fullscreen fills the screen without a frame.
await open({ popupFullscreen: true, clickAction: { kind: 'popup-widget' } }, []);
const embed = await page.evaluate(() => {
    const el = document.querySelector('[data-aura-click-popup="popup-widget"] [data-aura-popup-fill]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        pad: parseFloat(cs.paddingLeft),
        border: parseFloat(cs.borderLeftWidth),
    };
});
check(
    'Vollbild: eingebettetes Widget füllt randlos',
    !!embed &&
        embed.x === 0 &&
        embed.y === 0 &&
        near(embed.w, 1280) &&
        near(embed.h, 900) &&
        embed.pad === 0 &&
        embed.border === 0,
    JSON.stringify(embed),
);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
