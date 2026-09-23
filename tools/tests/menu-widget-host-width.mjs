// Vorschau eines Widget-Elements im Bereichs-Menü: so breit wie das Menü.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/menu-widget-host-width.mjs
//
// Die Vorschau lief über die ganze Breite des Editors; ein Widget, das dort nur
// wenig kleiner aussah, kam im Frontend viel zu groß an. Neu:
//   - Seitenleiste: die Vorschau ist so breit wie der Platz in der Leiste
//     (layoutDrawerWidth minus Rand und Innenabstand), Ziehen endet dort.
//   - Schwebendes Menü: dieselbe Rechnung mit der Drawer-Breite (320 px).
//   - Leiste oben/unten: Balken-Slot wie in der Tableiste, kein Spaltenrahmen.
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
                ],
                activeSectionId: 'section-1',
            },
        ],
        activeLayoutId: 'layout-default',
        editMode: false,
    },
    version: 0,
});

const item = {
    id: 'm1',
    type: 'widget',
    position: 'top',
    widget: {
        id: 'eigen',
        type: 'value',
        title: 'Akku',
        datapoint: 'demo.battery',
        gridPos: { x: 0, y: 0, w: 8, h: 4 },
        options: {},
    },
    widgetHeight: 80,
};

const browser = await chromium.launch();
const pageErrors = [];

async function open(frontend) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, ignoreHTTPSErrors: true });
    await ctx.route('**/*', (route) => {
        const url = route.request().url();
        const backend = /socket\.io|[?&]sid=|\/proxy/.test(url);
        return url.startsWith(BASE) && !backend ? route.continue() : route.abort();
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    const config = JSON.stringify({
        state: { frontend: { layoutDrawerEnabled: true, layoutDrawerItems: [item], ...frontend } },
        version: 0,
    });
    await page.addInitScript(
        ([dash, cfg]) => {
            localStorage.setItem('aura-dashboard', dash);
            localStorage.setItem('aura-config', cfg);
            localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
        },
        [dashboard, config],
    );
    await page.goto(`${BASE}/#/admin/design?tab=menu`, { waitUntil: 'domcontentloaded' });
    const head = page.getByText('Widget', { exact: true }).first();
    await head.waitFor({ state: 'visible', timeout: 30000 });
    await head.click();
    await page.locator('.aura-menu-widget').first().waitFor({ state: 'visible', timeout: 10000 });
    return { ctx, page };
}

const measure = (page) =>
    page.evaluate(() => {
        const slot = document.querySelector('.aura-menu-widget');
        const host = slot?.closest('[data-aura-menu-host]');
        const hostFramed = host && getComputedStyle(host).display !== 'contents';
        return {
            slot: Math.round(slot?.getBoundingClientRect().width ?? -1),
            host: hostFramed ? Math.round(host.getBoundingClientRect().width) : null,
            // The dashed preview area around the column — as wide as the editor.
            editor: Math.round(slot?.closest('.rounded-lg.p-4')?.getBoundingClientRect().width ?? -1),
        };
    });

// ── 1. Feste Seitenleiste, 200 px breit ──────────────────────────────────────
{
    const { ctx, page } = await open({ layoutDrawerPlacement: 'sidebar', layoutDrawerWidth: 200 });
    const m = await measure(page);
    check('Seitenleiste: Rahmen so breit wie der Platz im Menü', m.host === 167, JSON.stringify(m));
    check('Seitenleiste: Widget füllt die Spalte, nicht den Editor', m.slot === 167, JSON.stringify(m));
    check('Seitenleiste: der Editor ist deutlich breiter', m.editor > 300, JSON.stringify(m));

    // Erst schmaler ziehen, dann weit über den Spaltenrand hinaus: endet am Rand.
    const handle = page.locator('[data-aura-menu-size-handle]').first();
    const drag = async (dx) => {
        await handle.scrollIntoViewIfNeeded();
        const hb = await handle.boundingBox();
        await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
        await page.mouse.down();
        await page.mouse.move(hb.x + hb.width / 2 + dx, hb.y + hb.height / 2, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(250);
        return measure(page);
    };
    const narrow = await drag(-60);
    check('Seitenleiste: schmaler ziehen geht', narrow.slot > 90 && narrow.slot < 130, JSON.stringify(narrow));
    const wide = await drag(400);
    check('Seitenleiste: Ziehen endet am Menürand', wide.slot === 167, JSON.stringify(wide));
    await ctx.close();
}

// ── 2. Schwebendes Menü ──────────────────────────────────────────────────────
{
    const { ctx, page } = await open({ layoutDrawerPlacement: 'floating' });
    const m = await measure(page);
    check('Schwebend: Rahmen = Drawer-Breite minus Innenabstand', m.host === 287, JSON.stringify(m));
    await ctx.close();
}

// ── 3. Leiste oben: Balken-Slot, kein Spaltenrahmen ──────────────────────────
{
    const { ctx, page } = await open({ layoutDrawerPlacement: 'top' });
    const m = await measure(page);
    check('Leiste oben: kein Spaltenrahmen', m.host === null, JSON.stringify(m));
    check('Leiste oben: Slot hat die Balken-Standardbreite', m.slot === 120, JSON.stringify(m));
    await ctx.close();
}

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
