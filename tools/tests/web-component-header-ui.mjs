// Title row of a webcomponent widget: Aura draws it, the component never a second one.
// A test component with a text setting "title" (like the cameras' RTSP picture) must
// not get that setting; with wcTitleSource / wcIconSource "component" the row shows
// what the component reports (event iob-header), else the manifest's picture. The
// editor greys the setting out and offers a title the component kept for the widget.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/web-component-header-ui.mjs
//
// The component is served by the browser itself (page.route): no adapter, no ioBroker.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

// draws its own title if it gets one - the way the camera components do
const moduleJs = `
class AuraHeaderDemo extends HTMLElement {
    #settings = {};
    set settings(v) { this.#settings = v || {}; this.received = { ...this.#settings }; this.render(); }
    get settings() { return this.#settings; }
    connectedCallback() {
        this.render();
        if (window.__wcHeader) {
            this.dispatchEvent(new CustomEvent('iob-header', { detail: window.__wcHeader, bubbles: true, composed: true }));
        }
    }
    render() { this.textContent = this.#settings.title ? 'OWN:' + this.#settings.title : 'picture'; }
}
customElements.get('aura-header-demo') || customElements.define('aura-header-demo', AuraHeaderDemo);
`;
const manifest = {
    manifestVersion: 1,
    tag: 'aura-header-demo',
    name: { en: 'Header demo', de: 'Kopf-Demo' },
    icon: 'demo.svg',
    module: 'aura-header-demo.js',
    size: { width: 220, height: 140 },
    settings: {
        type: 'panel',
        items: {
            camera: { type: 'text', label: 'Camera' },
            title: { type: 'text', label: { en: 'Name', de: 'Name' } },
        },
    },
};
const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>';

const browser = await chromium.launch();

async function openPage(options, header) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/adapter/aura-demo/webcomponents/**', (route) => {
        const url = route.request().url();
        if (url.endsWith('.json')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(manifest) });
        }
        if (url.endsWith('.svg')) return route.fulfill({ contentType: 'image/svg+xml', body: svg });
        return route.fulfill({ contentType: 'text/javascript', body: moduleJs });
    });
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
    await page.evaluate(
        ({ options, header }) => {
            window.__wcHeader = header;
            const shot = window.__auraShot;
            shot.mockObject({ 'system.config': { _id: 'system.config', type: 'config', common: { language: 'de' } } });
            shot.mockObjectView({
                instance: [
                    {
                        id: 'system.adapter.aura-demo.0',
                        value: {
                            _id: 'system.adapter.aura-demo.0',
                            common: { version: '1.0.0', webComponents: ['webcomponents/aura-header-demo.json'] },
                        },
                    },
                ],
            });
            shot.showWidgets([
                {
                    id: 'wc-header',
                    type: 'webcomponent',
                    title: 'Kamera',
                    datapoint: '',
                    gridPos: { x: 0, y: 0, w: 12, h: 8 },
                    options: { wcTag: 'aura-header-demo', wcAdapter: 'aura-demo', ...options },
                },
            ]);
        },
        { options, header },
    );
    await page.locator('aura-header-demo').waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
    return { ctx, page, errors };
}

const card = (page) => page.locator('[data-aura-widget="wc-header"]').first();
const titleText = (page) => card(page).locator('.aura-widget-title').first().textContent();
const iconSrc = (page) =>
    card(page)
        .locator('img.aura-widget-icon')
        .first()
        .getAttribute('src')
        .catch(() => null);

// ── Aura's title, the component's own one dropped ────────────────────────────
{
    const { ctx, page, errors } = await openPage({ wcSettings: { camera: 'cam1', title: 'Einfahrt' } }, null);
    eq('aura: widget title in the title row', await titleText(page), 'Kamera');
    eq(
        'aura: the component never gets its "title" setting',
        await page.evaluate(() => document.querySelector('aura-header-demo').received),
        { camera: 'cam1' },
    );
    eq('aura: the component draws no own title', await page.locator('aura-header-demo').textContent(), 'picture');
    eq('aura: Aura icon, not a picture', await card(page).locator('img.aura-widget-icon').count(), 0);
    eq('aura: no page errors', errors, []);

    // editor: the setting greyed out with its reason, the kept name offered for the widget
    await page.evaluate(() => {
        window.__auraShot.unfoldSections();
        window.__auraShot.setEditMode(true);
    });
    await card(page).locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const dlg = page.locator('.aura-widget-edit-modal');
    const covered = dlg.locator('[data-wc-host-setting="title"]');
    await covered.waitFor({ timeout: 10000 });
    eq('editor: "title" greyed out', await covered.locator('fieldset[disabled]').count(), 1);
    check(
        'editor: with the reason',
        ((await covered.textContent()) ?? '').includes('Widget-Titel'),
        (await covered.textContent()) ?? '',
    );
    const old = dlg.locator('[data-wc-old-title]');
    check('editor: kept name offered', ((await old.textContent()) ?? '').includes('Einfahrt'));
    await old.locator('[data-action="take"]').click();
    const after = await page.evaluate(() => window.__auraShot.widgetConfig('wc-header'));
    eq('editor: taken as widget title', after?.title, 'Einfahrt');
    eq('editor: removed from the component settings', after?.options?.wcSettings, { camera: 'cam1' });
    eq('editor: hint gone', await old.count(), 0);
    await ctx.close();
}

// ── title and icon from the component ───────────────────────────────────────
{
    const { ctx, page, errors } = await openPage(
        { wcTitleSource: 'component', wcIconSource: 'component', wcSettings: { camera: 'cam1' } },
        { title: 'Einfahrt (Adapter)', icon: 'demo.svg' },
    );
    eq('component: reported title', await titleText(page), 'Einfahrt (Adapter)');
    check(
        'component: reported icon, relative to the manifest',
        ((await iconSrc(page)) ?? '').endsWith('/adapter/aura-demo/webcomponents/demo.svg'),
        String(await iconSrc(page)),
    );
    // a later report replaces it
    await page.evaluate(() =>
        document
            .querySelector('aura-header-demo')
            .dispatchEvent(
                new CustomEvent('iob-header', { detail: { title: 'Garten' }, bubbles: true, composed: true }),
            ),
    );
    await page.waitForTimeout(150);
    eq('component: follows a new report', await titleText(page), 'Garten');
    check(
        'component: icon falls back to the manifest picture',
        ((await iconSrc(page)) ?? '').endsWith('/demo.svg'),
        String(await iconSrc(page)),
    );
    eq('component: no page errors', errors, []);
    await ctx.close();
}

// ── source "component" without any report ───────────────────────────────────
{
    const { ctx, page } = await openPage({ wcTitleSource: 'component', wcIconSource: 'aura' }, null);
    eq('silent component: widget title', await titleText(page), 'Kamera');
    eq(
        'silent component: icon source aura keeps the Aura icon',
        await card(page).locator('img.aura-widget-icon').count(),
        0,
    );
    await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
