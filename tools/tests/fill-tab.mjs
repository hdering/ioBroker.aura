// „Tab ausfüllen“ für iFrame, Bild und Diashow (#865).
//
// Laufzeit: Ein Widget mit fillTab liegt als Overlay über dem ganzen Tab, nicht
// im Raster — seine Kachel ist so groß wie der Tab-Bereich.
// Editor: Der Schalter steht bei allen drei Typen unter „Optik“, ist im Tab mit
// nur diesem Widget bedienbar, mit weiteren Widgets gesperrt.
//
//   AURA_IOBROKER_URL=http://127.0.0.1:9 npx vite --port 5199
//   AURA_BASE=http://localhost:5199 node tools/tests/fill-tab.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const SVG = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#2a6"/></svg>',
)}`;
const widget = (id, type, options = {}) => ({
    id,
    type,
    title: id,
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 4, h: 3 },
    options,
});
const TYPES = [
    { type: 'iframe', options: { iframeUrl: 'about:blank' } },
    { type: 'image', options: { imageUrl: SVG } },
    { type: 'slideshow', options: { folder: '/nirgends' } },
];

const LAYOUT = {
    id: 'l-ft',
    name: 'FillTab',
    slug: 'ft',
    activeSectionId: 'sec-ft',
    sections: [
        {
            id: 'sec-ft',
            name: 'FT',
            slug: 'ft',
            activeTabId: 't-iframe',
            tabs: [
                ...TYPES.map(({ type, options }) => ({
                    id: `t-${type}`,
                    name: type,
                    slug: type,
                    widgets: [widget(`w-${type}`, type, { ...options, fillTab: true })],
                })),
                ...TYPES.map(({ type, options }) => ({
                    id: `t-${type}-shared`,
                    name: `${type} shared`,
                    slug: `${type}-shared`,
                    widgets: [widget(`w-${type}-shared`, type, options), widget(`w-${type}-info`, 'value')],
                })),
            ],
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });
await page.evaluate((layout) => window.__auraShot.seed({ layouts: [layout] }), LAYOUT);

const goto = async (slug) => {
    await page.evaluate((s) => {
        window.location.hash = `#/view/ft/s/ft/tab/${s}`;
    }, slug);
    await page.waitForTimeout(500);
};

// Runtime: the tile covers its overlay, and the overlay is far bigger than a 4×3 grid tile.
for (const { type } of TYPES) {
    await goto(type);
    const box = await page.evaluate((id) => {
        const el = document.querySelector(`.aura-widget-${id}`);
        if (!el || !el.offsetParent) return null;
        const overlay = el.closest('.absolute.inset-0');
        const r = el.getBoundingClientRect();
        const o = overlay?.getBoundingClientRect();
        return {
            w: r.width,
            h: r.height,
            ow: o?.width ?? 0,
            oh: o?.height ?? 0,
            inGrid: !!el.closest('.react-grid-item'),
        };
    }, `w-${type}`);
    check(
        `${type}: Kachel füllt den Tab`,
        !!box &&
            !box.inGrid &&
            box.ow > 900 &&
            box.oh > 500 &&
            Math.abs(box.w - box.ow) < 2 &&
            Math.abs(box.h - box.oh) < 2,
        JSON.stringify(box),
    );
}

// Editor: toggle present under „Optik“, enabled alone, disabled next to another widget.
await page.evaluate(() => window.__auraShot.setEditMode(true));
const toggleState = async (id) => {
    const tile = page.locator(`.aura-widget-${id}`).first();
    await tile.hover();
    await tile.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten"):visible').first().click();
    const modal = page.getByText(`(${id})`, { exact: true });
    await modal.waitFor({ timeout: 5000 });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__auraShot.unfoldSections());
    await page.waitForTimeout(300);
    const btn = page.locator('[data-aura-fill-tab] button').first();
    const state = (await btn.count())
        ? {
              disabled: await btn.isDisabled(),
              section: await btn.evaluate((el) => el.closest('details')?.querySelector('summary')?.innerText.trim()),
              btn,
          }
        : null;
    if (!state && process.env.DEBUG)
        console.log(
            await page.evaluate(
                () =>
                    [...document.querySelectorAll('summary')].map((s) => s.innerText).join('|') +
                    ' / ' +
                    document.querySelectorAll('[data-aura-fill-tab]').length,
            ),
        );
    return { state, modal };
};
const closeModal = async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
};

for (const { type } of TYPES) {
    await goto(`${type}-shared`);
    const shared = await toggleState(`w-${type}-shared`);
    check(
        `${type}: Schalter gesperrt neben anderem Widget`,
        shared.state?.disabled === true,
        JSON.stringify(shared.state && { disabled: shared.state.disabled }),
    );
    await closeModal();

    await goto(type);
    const alone = await toggleState(`w-${type}`);
    check(`${type}: Schalter bedienbar als einziges Widget`, alone.state?.disabled === false);
    check(`${type}: Schalter unter Optik`, /^optik$/i.test(alone.state?.section ?? ''), alone.state?.section);
    if (alone.state) {
        await alone.state.btn.click();
        await page.waitForTimeout(200);
        const opts = await page.evaluate((id) => window.__auraShot.widgetOptions(id), `w-${type}`);
        check(`${type}: Ausschalten entfernt fillTab`, !opts?.fillTab, JSON.stringify(opts?.fillTab));
    }
    await closeModal();
}

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
