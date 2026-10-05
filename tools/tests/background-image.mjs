// Verifies background images on widget cards and popups (issue #442) against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/background-image.mjs
//
// Card: the image is its own layer (.aura-bg-image) between the card colour and
// the content; the card turns into a stacking context only while it has one.
// Asserted on the layer's computed style AND on painted pixels — a z-index slip
// (layer under the card colour, or over the content) only shows in the pixels.
//
// Popup: click action > popup view > global, each level inheriting while empty.
// Opened via datapoint triggers like popup-background.mjs; the global level has
// no harness setter (it sits in the same `??` chain).
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A solid-colour image — no network, and an exact colour to look for in the pixels. */
const solid = (hex) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="${hex}"/></svg>`)}`;
const RED = solid('#ff0000');
const BLUE = solid('#0000ff');
const GREEN = solid('#00ff00');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 90000 });
const settle = (ms = 400) => page.waitForTimeout(ms);

const widget = (id, options, extra = {}) => ({
    id,
    type: 'value',
    title: 'Bild',
    datapoint: 'demo.bgValue',
    gridPos: { x: 0, y: 0, w: 4, h: 4 },
    options,
    ...extra,
});

await page.evaluate(
    ([w]) => {
        window.__auraShot.mock({ 'demo.bgValue': 21.5 });
        window.__auraShot.showWidgets(w);
    },
    [
        [
            widget('w-img', { bgImage: { src: RED, dim: 50 } }),
            widget(
                'w-contain',
                { bgImage: { src: BLUE, fit: 'contain', position: 'top' } },
                { gridPos: { x: 4, y: 0, w: 4, h: 4 } },
            ),
            widget('w-plain', {}, { gridPos: { x: 8, y: 0, w: 4, h: 4 } }),
            widget('w-transp', { transparent: true, bgImage: { src: GREEN } }, { gridPos: { x: 0, y: 4, w: 4, h: 4 } }),
            {
                id: 'w-head',
                type: 'header',
                title: 'Abschnitt',
                datapoint: '',
                gridPos: { x: 4, y: 4, w: 4, h: 2 },
                options: { bgImage: { src: RED } },
            },
        ],
    ],
);
await settle(800);

const card = (id) => page.locator(`.aura-widget-${id}`).first();
const layerStyle = (id) =>
    card(id).evaluate((el) => {
        const layer = el.querySelector(':scope > .aura-bg-image');
        const host = getComputedStyle(el);
        if (!layer) return { layer: false, isolation: host.isolation };
        const cs = getComputedStyle(layer);
        return {
            layer: true,
            isolation: host.isolation,
            image: cs.backgroundImage,
            size: cs.backgroundSize,
            position: cs.backgroundPosition,
            repeat: cs.backgroundRepeat,
            filter: cs.filter,
            z: cs.zIndex,
        };
    });

/** RGB of the painted pixel at a point inside the card (fractions of its box). */
async function pixel(id, fx, fy) {
    const box = await card(id).boundingBox();
    const shot = await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } });
    return page.evaluate(
        async ([b64, x, y]) => {
            const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
            const c = new OffscreenCanvas(img.width, img.height);
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            const d = g.getImageData(Math.round(img.width * x), Math.round(img.height * y), 1, 1).data;
            return [d[0], d[1], d[2]];
        },
        [shot.toString('base64'), fx, fy],
    );
}

// ── 1. Card with an image: layer, stacking context, cover default, dim ────────
const img = await layerStyle('w-img');
check('card with bgImage renders the image layer', img.layer);
check('card becomes its own stacking context', img.isolation === 'isolate', img.isolation);
check('layer sits behind the content', img.z === '-1', img.z);
check('layer shows the configured image', /url\("data:image\/svg\+xml/.test(img.image ?? ''), img.image?.slice(0, 40));
check('fit defaults to cover', img.size === 'cover', img.size);
check('dim 50 darkens via brightness(0.5)', img.filter === 'brightness(0.5)', img.filter);

// Painted: an empty spot of the card is the darkened red (≈128,0,0), not the card colour.
const [r, gC, bC] = await pixel('w-img', 0.5, 0.85);
check('image paints over the card colour', r > 100 && r < 160 && gC < 30 && bC < 30, `${r},${gC},${bC}`);
// The value text still paints above the layer.
const valueOnTop = await card('w-img').evaluate((el) => {
    const layer = el.querySelector(':scope > .aura-bg-image');
    const texts = [...el.querySelectorAll('span, div')].filter(
        (n) => n !== layer && n.childNodes.length === 1 && n.firstChild?.nodeType === 3 && /21/.test(n.textContent),
    );
    if (!texts.length) return false;
    const r = texts[0].getBoundingClientRect();
    layer.style.pointerEvents = 'auto';
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    layer.style.pointerEvents = '';
    return hit !== layer;
});
check('content stays above the image layer', valueOnTop);

// ── 2. contain + position ────────────────────────────────────────────────────
const contain = await layerStyle('w-contain');
check('fit contain', contain.size === 'contain', contain.size);
check('position top', contain.position === '50% 0%', contain.position);
check('no-repeat unless tiling', contain.repeat === 'no-repeat', contain.repeat);

// ── 3. Without an image nothing changes ───────────────────────────────────────
const plain = await layerStyle('w-plain');
check('card without bgImage has no layer', !plain.layer);
check('card without bgImage stays out of stacking-context mode', plain.isolation === 'auto', plain.isolation);

// ── 4. Transparent card shows the image alone; bare header never ───────────────
const transp = await layerStyle('w-transp');
check('transparent card still shows its image', transp.layer);
const [tr, tg, tb] = await pixel('w-transp', 0.5, 0.85);
check('transparent card paints the image', tg > 200 && tr < 60 && tb < 60, `${tr},${tg},${tb}`);
check('bare section title draws no image', !(await layerStyle('w-head')).layer);

// ── 5. Editor: Erweitert writes options.bgImage ───────────────────────────────
await page.evaluate(() => window.__auraShot.setEditMode(true));
await settle();
await card('w-plain').hover();
await card('w-plain').locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.locator('summary:has-text("Erweitert")').click();
const field = dlg.locator('.aura-bg-image-field');
check('Erweitert offers the background image field', (await field.count()) === 1);
await field.locator('input[type="text"]').fill('/vis.0/test/bild.png');
await settle();
let opts = await page.evaluate(() => window.__auraShot.widgetOptions('w-plain'));
check(
    'typing a source stores bgImage.src',
    opts?.bgImage?.src === '/vis.0/test/bild.png',
    JSON.stringify(opts?.bgImage),
);
check(
    'defaults are not stored',
    opts?.bgImage && Object.keys(opts.bgImage).length === 1,
    JSON.stringify(opts?.bgImage),
);
await field.locator('select').first().selectOption('repeat');
await field.locator('input[type="number"]').fill('30');
await settle();
opts = await page.evaluate(() => window.__auraShot.widgetOptions('w-plain'));
check(
    'fit and dim are stored',
    opts?.bgImage?.fit === 'repeat' && opts?.bgImage?.dim === 30,
    JSON.stringify(opts?.bgImage),
);
const relLayer = await card('w-plain').evaluate(
    (el) => getComputedStyle(el.querySelector(':scope > .aura-bg-image')).backgroundImage,
);
check('relative adapter path is served through /webfs', /\/webfs\/vis\.0\/test\/bild\.png/.test(relLayer), relLayer);
await field.locator('button:text-is("Entfernen")').click();
await settle();
opts = await page.evaluate(() => window.__auraShot.widgetOptions('w-plain'));
check('Entfernen clears bgImage', opts?.bgImage === undefined, JSON.stringify(opts?.bgImage));
await page.keyboard.press('Escape');
await page.evaluate(() => window.__auraShot.setEditMode(false));
await settle();

// ── 6. Popup levels ───────────────────────────────────────────────────────────
const DP = 'demo.popupBgImgTrigger';
const VIEW_ID = 'pv-bgimg-test';
const trigger = (options) => ({
    id: 'pt-bgimg',
    name: 'Bild',
    enabled: true,
    clause: { datapoint: DP, operator: 'true', value: '' },
    host: {
        id: 'ptw-bgimg',
        type: 'value',
        title: 'Popup',
        datapoint: DP,
        gridPos: { x: 0, y: 0, w: 1, h: 1 },
        options,
    },
    resetDp: false,
});
const dialog = page.locator('div[class*="z-[300]"] > div').first();
async function openPopup(options, views) {
    await page.keyboard.press('Escape');
    await settle();
    await page.evaluate(
        ([dp, rule, vs]) => {
            if (vs) window.__auraShot.popupViews(vs);
            window.__auraShot.mock({ [dp]: false });
            window.__auraShot.dpTriggers([rule]);
        },
        [DP, trigger(options), views ?? null],
    );
    await settle();
    await page.evaluate((dp) => window.__auraShot.mock({ [dp]: true }), DP);
    await settle();
    return dialog.evaluate((el) => {
        const layer = el.querySelector(':scope > .aura-bg-image');
        return layer ? getComputedStyle(layer).backgroundImage : null;
    });
}
const viewAction = { clickAction: { kind: 'popup-view', viewId: VIEW_ID } };
const view = (backgroundImage) => [
    { id: VIEW_ID, name: 'Bild-Test', widgets: [], ...(backgroundImage ? { backgroundImage } : {}) },
];
const color = (bg, hex) => !!bg && bg.includes(encodeURIComponent(hex));

check('popup without any image has no layer', (await openPopup(viewAction, view(undefined))) === null);
const viewImg = await openPopup(viewAction, view({ src: BLUE }));
check('popup view image is painted', color(viewImg, '#0000ff'), viewImg?.slice(0, 60));
const actionImg = await openPopup({ ...viewAction, popupBackgroundImage: { src: GREEN } }, view({ src: BLUE }));
check('click-action image wins over the view', color(actionImg, '#00ff00'), actionImg?.slice(0, 60));
const isolated = await dialog.evaluate((el) => getComputedStyle(el).isolation);
check('popup surface becomes a stacking context', isolated === 'isolate', isolated);
const emptyAction = await openPopup({ ...viewAction, popupBackgroundImage: { src: '' } }, view({ src: BLUE }));
check('an empty click-action source inherits the view', color(emptyAction, '#0000ff'), emptyAction?.slice(0, 60));
await page.keyboard.press('Escape');

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
