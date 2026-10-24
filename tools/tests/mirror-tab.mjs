// The "Spiegel" widget showing a whole tab (options.sourceKind 'tab') against the dev server.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/mirror-tab.mjs
//
// Pins: the source tab's widgets render inside the mirror, scaled to the box width
// ('width') or unscaled ('none'); a mirror never shows the tab it sits on, nor a tab
// behind a PIN; the copy measures under its own runtime scope, so the original tab
// keeps its auto-height while the mirror is mounted; the editor shows the tab name.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const value = (id, x, y, title) => ({
    id,
    type: 'value',
    title,
    datapoint: 'demo.0.value',
    gridPos: { x, y, w: 10, h: 4 },
    options: {},
});
const mirror = (id, options, gridPos = { x: 0, y: 0, w: 20, h: 12 }) => ({
    id,
    type: 'mirror',
    title: 'Spiegel',
    datapoint: '',
    gridPos,
    options: { sourceKind: 'tab', ...options },
});
const tab = (id, name, widgets, extra = {}) => ({ id, name, slug: id, widgets, ...extra });

const layoutWith = (mirrorTabWidgets, extraTabs = []) => ({
    id: 'lay-front',
    name: 'Frontend',
    slug: 'front',
    activeSectionId: 'sec',
    sections: [
        {
            id: 'sec',
            name: 'Bereich',
            slug: 'eins',
            activeTabId: 'tab-home',
            tabs: [
                tab('tab-home', 'Start', mirrorTabWidgets),
                tab('tab-src', 'Quelle', [value('v-a', 0, 0, 'QUELLE-A'), value('v-b', 10, 0, 'QUELLE-B')], {
                    hidden: true,
                }),
                ...extraTabs,
            ],
        },
    ],
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const open = async (layout, hash = '#/view/front/s/eins') => {
    await page.goto(`${BASE}/?shot=1${hash}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.evaluate(() => window.__auraShot.mock({ 'demo.0.value': { val: 21.5, unit: '°C' } }));
    await page.evaluate(([l]) => window.__auraShot.seed({ layouts: [l] }), [layout]);
    await page.waitForTimeout(1500);
};
const mirrorText = (id) =>
    page
        .locator(`.aura-widget-${id}`)
        .first()
        .innerText()
        .catch(() => '');

// ── 1. Fit to width: the tab renders inside, scaled ─────────────────────────
await open(layoutWith([mirror('m-fit', { targetTabId: 'tab-src' })]));
const fitText = await mirrorText('m-fit');
check(
    'fit: source widgets render in the mirror',
    fitText.includes('QUELLE-A') && fitText.includes('QUELLE-B'),
    fitText.replace(/\s+/g, ' ').trim(),
);
const fit = await page.evaluate(() => {
    const box = document.querySelector('[data-aura-tab-mirror="tab-src"]');
    const inner = box?.firstElementChild;
    return box && inner
        ? { boxW: box.clientWidth, innerW: inner.offsetWidth, transform: getComputedStyle(inner).transform }
        : null;
});
const scale = fit ? Number(/matrix\(([^,]+)/.exec(fit.transform)?.[1] ?? 1) : 0;
check(
    'fit: scaled to the box width',
    !!fit && Math.abs(fit.innerW * scale - fit.boxW) < 2,
    JSON.stringify({ ...fit, scale }),
);
const nested = await page.evaluate(() => document.querySelectorAll('[data-aura-tab-mirror] .aura-widget-v-a').length);
check('fit: copy sits inside the mirror box', nested === 1, `${nested}`);

// ── 2. Original size: no transform ──────────────────────────────────────────
await open(layoutWith([mirror('m-none', { targetTabId: 'tab-src', tabFit: 'none' })]));
const noneTransform = await page.evaluate(() => {
    const inner = document.querySelector('[data-aura-tab-mirror="tab-src"]')?.firstElementChild;
    return inner ? getComputedStyle(inner).transform : 'missing';
});
check('none: unscaled', noneTransform === 'none', noneTransform);
check('none: source widgets render', (await mirrorText('m-none')).includes('QUELLE-A'));

// ── 3. Guards ────────────────────────────────────────────────────────────────
await open(layoutWith([mirror('m-self', { targetTabId: 'tab-home' })]));
const selfText = await mirrorText('m-self');
check('guard: own tab is refused', selfText.includes('enthält diesen Spiegel selbst'), selfText.trim());

// Two tabs mirroring each other: the copy of the other tab stops at this one.
await open(
    layoutWith(
        [mirror('m-ping', { targetTabId: 'tab-pong' })],
        [tab('tab-pong', 'Pong', [mirror('m-pong', { targetTabId: 'tab-home' })])],
    ),
);
const pingText = await mirrorText('m-ping');
check(
    'guard: mutual mirrors stop after one level',
    pingText.includes('enthält diesen Spiegel selbst'),
    pingText.trim(),
);

await open(
    layoutWith(
        [mirror('m-pin', { targetTabId: 'tab-pin' })],
        [tab('tab-pin', 'Tresor', [value('v-secret', 0, 0, 'GEHEIM')], { pin: '1234' })],
    ),
);
const pinText = await mirrorText('m-pin');
check('guard: PIN tab is refused', pinText.includes('PIN-geschützte') && !pinText.includes('GEHEIM'), pinText.trim());

await open(layoutWith([mirror('m-gone', { targetTabId: 'tab-nope' })]));
check('guard: missing tab', (await mirrorText('m-gone')).includes('existiert nicht mehr'));

// ── 4. Runtime scope: original and copy measure apart ─────────────────────
// Auto-height list on the source tab: visit it, then the mirror tab — the original's
// box must keep its height although the copy (other width) measures as well.
const list = {
    id: 'l-auto',
    type: 'list',
    title: 'LISTE',
    datapoint: '',
    gridPos: { x: 0, y: 4, w: 10, h: 3 },
    options: {
        autoHeight: true,
        entries: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, label: `Zeile ${i}`, datapoint: 'demo.0.value' })),
    },
};
const scoped = layoutWith([mirror('m-scope', { targetTabId: 'tab-src' }, { x: 0, y: 0, w: 14, h: 12 })]);
scoped.sections[0].tabs[1].widgets.push(list);
await open(scoped, '#/view/front/s/eins/tab/tab-src');
const heightOf = () =>
    page.evaluate(() => {
        const el = [...document.querySelectorAll('.aura-widget-l-auto')].find(
            (e) => !e.closest('[data-aura-tab-mirror]'),
        );
        return el ? Math.round(el.getBoundingClientRect().height) : -1;
    });
const before = await heightOf();
// In-app navigation: both tabs stay mounted (visited tabs are kept), copy and original.
await page.evaluate(() => (window.location.hash = '#/view/front/s/eins/tab/tab-home'));
await page.waitForTimeout(1200);
const mirrored = await page.evaluate(
    () => document.querySelectorAll('[data-aura-tab-mirror] .aura-widget-l-auto').length,
);
check('scope: list renders in the mirror too', mirrored === 1, `${mirrored}`);
await page.evaluate(() => (window.location.hash = '#/view/front/s/eins/tab/tab-src'));
await page.waitForTimeout(1200);
const after = await heightOf();
check(
    'scope: original auto-height unaffected by the copy',
    before > 0 && Math.abs(after - before) <= 1,
    `${before} → ${after}`,
);

// ── 4b. Contain: a tall tab fits the box completely, nothing scrolls ───────
const tall = layoutWith([
    mirror('m-contain', { targetTabId: 'tab-src', tabFit: 'contain' }, { x: 0, y: 0, w: 30, h: 8 }),
]);
for (let i = 0; i < 6; i++) tall.sections[0].tabs[1].widgets.push(value(`v-row${i}`, 0, 4 + i * 4, `ZEILE-${i}`));
await open(tall, '#/view/front/s/eins/tab/tab-home');
const contain = await page.evaluate(() => {
    const box = document.querySelector('[data-aura-tab-mirror="tab-src"]');
    const scroller = box?.querySelector('.aura-scroll');
    const last = box?.querySelector('.aura-widget-v-row5');
    if (!box || !scroller || !last) return null;
    const b = box.getBoundingClientRect();
    const l = last.getBoundingClientRect();
    return {
        overflow: scroller.scrollHeight - scroller.clientHeight,
        lastBottom: Math.round(l.bottom - b.top),
        boxH: Math.round(b.height),
        lastRight: Math.round(l.right - b.left),
        boxW: Math.round(b.width),
    };
});
check(
    'contain: the whole tab fits the box height',
    !!contain && contain.overflow <= 1 && contain.lastBottom <= contain.boxH,
    JSON.stringify(contain),
);
check(
    'contain: centred, narrower than the box',
    !!contain && contain.lastRight < contain.boxW,
    JSON.stringify(contain),
);

// ── 4c. English UI ─────────────────────────────────────────────────────────
await open(layoutWith([mirror('m-en', { targetTabId: 'tab-home' })]), '#/view/front/s/eins/tab/tab-home');
await page.evaluate(() => window.__auraShot.setFrontend({ language: 'en' }));
await page.waitForTimeout(500);
const enText = await mirrorText('m-en');
check('english: notice translated', enText.includes('The tab contains this mirror itself'), enText.trim());
await page.evaluate(() => window.__auraShot.setFrontend({ language: 'de' }));

// ── 5. Editor: badge names the tab, the copy takes no clicks ──────────────
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
await page.goto(`${BASE}/?shot=1#/admin/editor`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(
    ([l]) => window.__auraShot.seed({ layouts: [l], activeLayoutId: 'lay-front', editMode: true }),
    [layoutWith([mirror('m-edit', { targetTabId: 'tab-src' })])],
);
await page.waitForTimeout(1500);
const editText = await mirrorText('m-edit');
check('editor: badge names the tab', editText.includes('Spiegel: Tab Quelle'), editText.replace(/\s+/g, ' ').trim());
const pe = await page.evaluate(() => {
    const inner = document.querySelector('[data-aura-tab-mirror="tab-src"]')?.firstElementChild;
    return inner ? getComputedStyle(inner).pointerEvents : 'missing';
});
check('editor: copy ignores pointer events', pe === 'none', pe);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
