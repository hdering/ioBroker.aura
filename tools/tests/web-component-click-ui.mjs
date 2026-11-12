// Who answers a click on a web component (options.wcClick), and the component's own
// dialog as a popup of the widget:
// - component: the component gets the click and opens
//   its dialog - in the widget's popup, sized by the widget's popup options; the
//   widget's click action stays quiet
// - off (default of every component): the component gets nothing (inert); a click is the
//   widget's - its click action runs if one is set, else nothing happens
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/web-component-click-ui.mjs
//
// The components are served by the browser itself (page.route): no adapter, no ioBroker.
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

// counts its clicks and opens a dialog of the host on each, like the cameras do
const moduleFor = (tag) => `
class ClickDemo extends HTMLElement {
    clicks = 0;
    dialogs = null;
    connectedCallback() {
        this.style.display = 'block';
        this.textContent = 'picture';
        this.addEventListener('click', () => {
            this.clicks++;
            if (!this.dialogs) return;
            const content = document.createElement('div');
            content.textContent = 'large picture';
            content.style.height = '200px';
            this.dialogs.open({ title: 'Groß', element: content, width: 400 });
        });
    }
}
customElements.get('${tag}') || customElements.define('${tag}', ClickDemo);
`;
const manifestFor = (tag) => ({
    manifestVersion: 1,
    tag,
    name: { en: 'Click demo', de: 'Klick-Demo' },
    module: `${tag}.js`,
    size: { width: 220, height: 140 },
    settings: { type: 'panel', items: { camera: { type: 'text', label: 'Camera' } } },
});

const browser = await chromium.launch();

/**
 * @param {Record<string, unknown>} options widget options
 * @param {{ tag?: string, adapter?: string, viewport?: { width: number, height: number } }} [o]
 */
async function openPage(options, o = {}) {
    const tag = o.tag ?? 'aura-click-demo';
    const adapter = o.adapter ?? 'aura-demo';
    const ctx = await browser.newContext({ viewport: o.viewport ?? { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route(`**/adapter/${adapter}/webcomponents/**`, (route) => {
        const url = route.request().url();
        if (new URL(url).pathname.endsWith('.json')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(manifestFor(tag)) });
        }
        return route.fulfill({ contentType: 'text/javascript', body: moduleFor(tag) });
    });
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
    await page.evaluate(
        ({ options, tag, adapter }) => {
            const shot = window.__auraShot;
            shot.mockObject({ 'system.config': { _id: 'system.config', type: 'config', common: { language: 'de' } } });
            shot.mockObjectView({
                instance: [
                    {
                        id: `system.adapter.${adapter}.0`,
                        value: {
                            _id: `system.adapter.${adapter}.0`,
                            common: { version: '9.0.0', webComponents: [`webcomponents/${tag}.json`] },
                        },
                    },
                ],
            });
            shot.showWidgets([
                {
                    id: 'wc-click',
                    type: 'webcomponent',
                    title: 'Kamera',
                    datapoint: '',
                    gridPos: { x: 0, y: 0, w: 12, h: 8 },
                    options: { wcTag: tag, wcAdapter: adapter, ...options },
                },
            ]);
        },
        { options, tag, adapter },
    );
    const el = page.locator('[data-aura-widget="wc-click"]').first().locator(tag);
    await el.waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
    return { ctx, page, errors, el, tag };
}

const clicks = (page, tag) => page.evaluate((t) => document.querySelector(t)?.clicks ?? -1, tag);
const wcDialog = (page) => page.locator('[data-aura-wc-dialog="element"]');
const clickPopup = (page) => page.locator('[data-aura-click-popup]');
// a click right on the element, without Playwright's hit test (an inert element is "covered")
const clickOn = async (page, el) => {
    const box = await el.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(250);
};

// ── component: its own dialog, as a popup of the widget ──────────────────────
{
    const { ctx, page, errors, el, tag } = await openPage({
        wcClick: 'component',
        clickAction: { kind: 'popup-html', html: '<p>aura</p>' },
    });
    eq('component: no inert', await el.getAttribute('inert'), null);
    await clickOn(page, el);
    eq('component: the component got the click', await clicks(page, tag), 1);
    await wcDialog(page).waitFor({ timeout: 5000 });
    eq("component: the widget's click action stays quiet", await clickPopup(page).count(), 0);
    const panel = wcDialog(page).locator('[role="dialog"]');
    eq('component: dialog width as requested', Math.round((await panel.boundingBox()).width), 400);
    eq('component: title of the request', (await panel.textContent())?.includes('Groß'), true);
    await page.keyboard.press('Escape');
    await wcDialog(page).waitFor({ state: 'detached', timeout: 3000 });
    eq('component: no page errors', errors, []);
    await ctx.close();
}
{
    // the widget's popup options shape the dialog like any popup of the widget
    const { ctx, page, el } = await openPage({ wcClick: 'component', popupWidth: 700, popupHideTitle: true });
    await clickOn(page, el);
    const panel = wcDialog(page).locator('[role="dialog"]');
    await panel.waitFor({ timeout: 5000 });
    eq('popup options: popupWidth wins over the request', Math.round((await panel.boundingBox()).width), 700);
    eq('popup options: popupHideTitle hides the heading', (await panel.textContent())?.includes('Groß'), false);
    await ctx.close();
}
{
    const { ctx, page, el } = await openPage({ wcClick: 'component', popupFullscreen: true });
    await clickOn(page, el);
    const panel = wcDialog(page).locator('[role="dialog"]');
    await panel.waitFor({ timeout: 5000 });
    const box = await panel.boundingBox();
    eq('popup options: fullscreen covers the screen', [Math.round(box.width), Math.round(box.height)], [1280, 800]);
    await ctx.close();
}

// ── off: the component inert, a click is the widget's ───────────────────────
{
    const { ctx, page, errors, el, tag } = await openPage({ wcClick: 'off' });
    eq('off: element inert', await el.getAttribute('inert'), '');
    await clickOn(page, el);
    eq('off: the component got no click', await clicks(page, tag), 0);
    eq(
        'off: without a click action nothing opens',
        [await clickPopup(page).count(), await wcDialog(page).count()],
        [0, 0],
    );
    eq('off: no page errors', errors, []);
    await ctx.close();
}
{
    const { ctx, page, el, tag } = await openPage({
        wcClick: 'off',
        clickAction: { kind: 'popup-html', html: '<p>aura</p>' },
    });
    await clickOn(page, el);
    await page.locator('[data-aura-click-popup="popup-html"]').waitFor({ timeout: 5000 });
    eq(
        'off: the click action of the widget runs',
        await page.locator('[data-aura-click-popup="popup-html"]').count(),
        1,
    );
    eq('off: the component still got no click', await clicks(page, tag), 0);
    await ctx.close();
}
{
    // a large copy of itself as click action: a click inside opens no second popup
    const { ctx, page, el } = await openPage({ wcClick: 'off', clickAction: { kind: 'popup-widget', widgetId: '' } });
    await clickOn(page, el);
    const popup = page.locator('[data-aura-click-popup="popup-widget"]');
    await popup.waitFor({ timeout: 5000 });
    await clickOn(page, popup.locator('aura-click-demo'));
    eq('off: a click on the large copy opens no second popup', await clickPopup(page).count(), 1);
    await ctx.close();
}
{
    // the value of an earlier build
    const { ctx, page, el } = await openPage({ wcClick: 'aura' });
    eq('legacy "aura": treated as off', await el.getAttribute('inert'), '');
    await ctx.close();
}

// ── off by default, the cameras as any other ──────────────────────────────────────────────
{
    const { ctx, page, el, tag } = await openPage({}, { tag: 'iob-cameras-rtsp', adapter: 'cameras' });
    eq('camera: inert by default', await el.getAttribute('inert'), '');
    await clickOn(page, el);
    eq('camera: the component got no click', await clicks(page, tag), 0);
    eq(
        'camera: nothing opens without a click action',
        [await clickPopup(page).count(), await wcDialog(page).count()],
        [0, 0],
    );
    await ctx.close();
}
{
    const { ctx, page, el, tag } = await openPage(
        { wcClick: 'component' },
        { tag: 'iob-cameras-rtsp', adapter: 'cameras' },
    );
    await clickOn(page, el);
    eq('camera, component: its own dialog', [await clicks(page, tag), await wcDialog(page).count()], [1, 1]);
    await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
