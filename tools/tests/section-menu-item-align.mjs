// Ausrichtung der Elemente im Bereichs-Menü (Seitenleiste): links / mittig / rechts.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/section-menu-item-align.mjs
//
// Text-, Datenpunkt- und schmale Widget-Elemente saßen immer linksbündig in der
// Spalte. Jedes Element hat jetzt `align`; ohne Wert bleibt es links.
//
// Läuft offline, fasst keine Instanz an.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const dashboard = JSON.stringify({
    state: {
        layouts: [
            {
                id: 'layout-default',
                name: 'Tablet',
                slug: 'default',
                sections: [
                    {
                        id: 'section-1',
                        name: 'Home',
                        slug: 'home',
                        tabs: [{ id: 'tab-1', name: 'Dashboard', slug: 'dashboard', widgets: [] }],
                        activeTabId: 'tab-1',
                    },
                    {
                        id: 'section-2',
                        name: 'Keller',
                        slug: 'keller',
                        tabs: [{ id: 'tab-2', name: 'Dashboard', slug: 'dashboard', widgets: [] }],
                        activeTabId: 'tab-2',
                    },
                ],
                activeSectionId: 'section-1',
            },
        ],
        activeLayoutId: 'layout-default',
        editMode: false,
    },
    version: 0,
});

const widget = (id) => ({
    id,
    type: 'value',
    title: 'Akku',
    datapoint: 'demo.battery',
    gridPos: { x: 0, y: 0, w: 4, h: 3 },
    options: {},
});
const items = [
    { id: 'tl', type: 'text', text: 'LINKS', position: 'top' },
    { id: 'tc', type: 'text', text: 'MITTE', position: 'top', align: 'center' },
    { id: 'tr', type: 'text', text: 'RECHTS', position: 'top', align: 'right' },
    { id: 'wl', type: 'widget', position: 'bottom', widget: widget('w1'), widgetWidth: 80, widgetHeight: 40 },
    {
        id: 'wc',
        type: 'widget',
        position: 'bottom',
        widget: widget('w2'),
        widgetWidth: 80,
        widgetHeight: 40,
        align: 'center',
    },
    {
        id: 'wr',
        type: 'widget',
        position: 'bottom',
        widget: widget('w3'),
        widgetWidth: 80,
        widgetHeight: 40,
        align: 'right',
    },
];

const browser = await chromium.launch();
const pageErrors = [];
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
await ctx.route('**/*', (route) => {
    const url = route.request().url();
    const backend = /socket\.io|[?&]sid=|\/proxy/.test(url);
    return url.startsWith(BASE) && !backend ? route.continue() : route.abort();
});
const page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));
const config = JSON.stringify({
    state: {
        frontend: {
            layoutDrawerEnabled: true,
            layoutDrawerPlacement: 'sidebar',
            layoutDrawerWidth: 240,
            layoutDrawerItems: items,
        },
    },
    version: 0,
});
await page.addInitScript(
    ([dash, cfg]) => {
        localStorage.setItem('aura-dashboard', dash);
        localStorage.setItem('aura-config', cfg);
    },
    [dashboard, config],
);
await page.goto(`${BASE}/#/`, { waitUntil: 'domcontentloaded' });
await page.getByText('RECHTS', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
await page.locator('.aura-menu-widget').nth(2).waitFor({ state: 'visible', timeout: 10000 });

const boxes = await page.evaluate(() => {
    const rel = (el) => {
        const col = el.closest('.px-4').getBoundingClientRect();
        const r = el.getBoundingClientRect();
        // Abstand links / rechts zur Innenkante der Spalte (px-4 = 16).
        return { left: Math.round(r.left - col.left - 16), right: Math.round(col.right - 16 - r.right) };
    };
    const texts = ['LINKS', 'MITTE', 'RECHTS'].map((s) =>
        rel([...document.querySelectorAll('div')].find((d) => d.textContent === s && !d.children.length)),
    );
    const widgets = [...document.querySelectorAll('.aura-menu-widget')].map(rel);
    return { texts, widgets };
});

const near = (a, b) => Math.abs(a - b) <= 1;
for (const [kind, [l, c, r]] of [
    ['Text', boxes.texts],
    ['Widget', boxes.widgets],
]) {
    // Linker Text bleibt ein Block über die ganze Spalte — nur die linke Kante zählt.
    check(
        `${kind} links: bündig an der linken Kante`,
        l.left === 0 && (kind === 'Text' || l.right > 0),
        JSON.stringify(l),
    );
    check(`${kind} mittig: gleicher Abstand beidseits`, c.left > 0 && near(c.left, c.right), JSON.stringify(c));
    check(`${kind} rechts: bündig an der rechten Kante`, r.right === 0 && r.left > 0, JSON.stringify(r));
}

await page.screenshot({ path: process.env.SHOT ?? 'node_modules/.cache/section-menu-item-align.png' });
check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
