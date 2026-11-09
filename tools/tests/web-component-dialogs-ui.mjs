// Host dialogs of ioBroker web components in the dashboard: a test component
// (fixtures/web-components/aura-dialog-demo.js, bundled here with the base class of
// the package) asks for a form and for an element dialog through openDialog();
// Aura shows both in its own look and resolves them as the contract says.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/web-component-dialogs-ui.mjs
//   SHOTS=<folder> node tools/tests/web-component-dialogs-ui.mjs   - also save screenshots
//
// The component is served by the browser itself (page.route), so no adapter and no
// ioBroker are needed: the instance list is mocked with __auraShot.mockObjectView.
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { join } from 'node:path';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOTS = process.env.SHOTS;

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

const bundled = await build({
    entryPoints: [join(process.cwd(), 'tools/tests/fixtures/web-components/aura-dialog-demo.js')],
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'warning',
});
const moduleJs = bundled.outputFiles[0].text;
const manifest = {
    manifestVersion: 1,
    tag: 'aura-dialog-demo',
    name: { en: 'Dialog demo', de: 'Dialog-Demo' },
    module: 'aura-dialog-demo.js',
    size: { width: 220, height: 140 },
    // the settings editor renders these with the same fields as the form dialog
    settings: {
        type: 'panel',
        items: {
            size: { type: 'number', label: { en: 'Size', de: 'Größe' }, min: 1, max: 9, default: 3 },
            frame: { type: 'checkbox', label: { en: 'Frame', de: 'Rahmen' } },
            look: {
                type: 'select',
                label: 'Look',
                options: [
                    { value: 'flat', label: 'Flat' },
                    { value: 'raised', label: 'Raised' },
                ],
                default: 'flat',
            },
            note: { type: 'text', label: 'Note', hidden: '!data.frame' },
        },
    },
};

const browser = await chromium.launch();

async function openPage(viewport, theme = 'light') {
    const ctx = await browser.newContext({ viewport, ignoreHTTPSErrors: true, hasTouch: viewport.width < 640 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/adapter/aura-demo/webcomponents/**', (route) => {
        const url = route.request().url();
        if (url.endsWith('.json')) {
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify(manifest) });
        }
        return route.fulfill({ contentType: 'text/javascript', body: moduleJs });
    });
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.evaluate((th) => {
        const shot = window.__auraShot;
        shot.setTheme(th);
        shot.mockObject({ 'system.config': { _id: 'system.config', type: 'config', common: { language: 'de' } } });
        shot.mockObjectView({
            instance: [
                {
                    id: 'system.adapter.aura-demo.0',
                    value: {
                        _id: 'system.adapter.aura-demo.0',
                        common: { version: '1.0.0', webComponents: ['webcomponents/aura-dialog-demo.json'] },
                    },
                },
            ],
        });
        shot.showWidgets([
            {
                id: 'wc-dialogs',
                type: 'webcomponent',
                title: 'Dialog demo',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 12, h: 8 },
                options: { wcTag: 'aura-dialog-demo', wcAdapter: 'aura-demo' },
            },
        ]);
    }, theme);
    await page.locator('aura-dialog-demo button#form').waitFor({ timeout: 15000 });
    return { ctx, page, errors };
}

const lastResult = (page) => page.evaluate(() => document.querySelector('aura-dialog-demo').lastResult);
const waitResult = (page) =>
    page.waitForFunction(() => document.querySelector('aura-dialog-demo').lastResult !== undefined);
// the result resolves before React has taken the dialog away
const gone = (locator) =>
    locator.waitFor({ state: 'detached', timeout: 3000 }).then(
        () => true,
        () => false,
    );
const reset = (page) => page.evaluate(() => (document.querySelector('aura-dialog-demo').lastResult = undefined));

// ── desktop ─────────────────────────────────────────────────────────────────
{
    const { ctx, page, errors } = await openPage({ width: 1280, height: 800 });
    const form = page.locator('[data-aura-wc-dialog="form"]');
    const element = page.locator('[data-aura-wc-dialog="element"]');

    // form: Aura's dialog, not the browser's
    await page.locator('aura-dialog-demo button#form').click();
    await form.waitFor({ timeout: 5000 });
    check('form: opens in Aura, not as <dialog>', (await page.locator('dialog').count()) === 0);
    eq(
        'form: title in the frontend language',
        await form.locator('[role="dialog"] span').first().textContent(),
        'Grenzen',
    );
    eq('form: own OK text', await form.locator('[data-action="ok"]').textContent(), 'Übernehmen');
    eq('form: data overrides the default', await form.locator('[data-wc-field="max"] input').inputValue(), '42');
    eq('form: default where data has none', await form.locator('[data-wc-field="mode"] select').inputValue(), 'auto');
    check('form: shown field (on)', (await form.locator('[data-wc-field="unit"]').count()) === 1);
    check('form: header, static text and divider', (await form.locator('text=Bereich').count()) === 1);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'wc-dialog-form.png') });
    // hidden expression follows the values
    await form.locator('[data-wc-field="on"] button[role="switch"]').click();
    check('form: hidden follows data', (await form.locator('[data-wc-field="unit"]').count()) === 0);
    await form.locator('[data-wc-field="on"] button[role="switch"]').click();
    await form.locator('[data-wc-field="max"] input').fill('55');
    await form.locator('[data-wc-field="unit"] input').fill('W');
    await form.locator('[data-wc-field="mode"] select').selectOption('manual');
    await form.locator('[data-action="ok"]').click();
    await waitResult(page);
    eq('form: OK resolves the typed values', await lastResult(page), {
        max: 55,
        step: 2,
        on: true,
        unit: 'W',
        mode: 'manual',
        color: '#ff8800',
    });
    check('form: closed after OK', await gone(form));

    // cancel, Escape, backdrop -> null
    for (const [how, act] of [
        ['Cancel', () => form.locator('[data-action="cancel"]').click()],
        ['Escape', () => page.keyboard.press('Escape')],
        ['close button', () => form.locator('button[aria-label="Schließen"]').click()],
        ['backdrop', () => form.click({ position: { x: 10, y: 10 } })],
    ]) {
        await reset(page);
        await page.locator('aura-dialog-demo button#form').click();
        await form.waitFor({ timeout: 5000 });
        await act();
        await waitResult(page);
        eq(`form: ${how} resolves null`, await lastResult(page), null);
        check(`form: ${how} closes it`, await gone(form));
    }

    // element dialog
    await reset(page);
    await page.locator('aura-dialog-demo button#element').click();
    await element.waitFor({ timeout: 5000 });
    check('element: the content is moved into the frame', (await element.locator('.aura-demo-content').count()) === 1);
    const vars = await element.evaluate((root) => {
        const body = root.querySelector('.aura-demo-content').parentElement;
        const css = getComputedStyle(body);
        return { primary: css.getPropertyValue('--iob-primary').trim(), scheme: css.colorScheme };
    });
    check('element: the content gets the theme as --iob-* variables', !!vars.primary, JSON.stringify(vars));
    const width = await element.locator('[role="dialog"]').evaluate((el) => el.getBoundingClientRect().width);
    eq('element: the frame takes the width it asks for', Math.round(width), 560);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'wc-dialog-element.png') });
    await element.locator('.aura-demo-content button#done').click();
    await waitResult(page);
    eq('element: iob-dialog-close resolves its detail', await lastResult(page), 'done');
    check('element: closed', await gone(element));

    // a second request replaces the first, which resolves null
    await reset(page);
    await page.locator('aura-dialog-demo button#form').click();
    await form.waitFor({ timeout: 5000 });
    const second = page.evaluate(() =>
        document
            .querySelector('aura-dialog-demo')
            .openDialog({ title: 'Second', element: document.createElement('div') }),
    );
    await waitResult(page);
    eq('one at a time: the first resolves null', await lastResult(page), null);
    check('one at a time: the second is shown', (await element.count()) === 1 && (await form.count()) === 0);
    await page.keyboard.press('Escape');
    eq('one at a time: the second resolves null on Escape', await second, null);

    // edit mode: nothing opens
    await page.evaluate(() => window.__auraShot.setEditMode(true));
    await page.waitForTimeout(300);
    const inEdit = await page.evaluate(() =>
        document.querySelector('aura-dialog-demo').dialogs.open({ title: 'x', element: document.createElement('div') }),
    );
    eq('edit mode: dialogs.open resolves null', inEdit, null);
    check('edit mode: nothing is shown', (await page.locator('[data-aura-wc-dialog]').count()) === 0);

    check('desktop: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
}

// ── phone, dark ─────────────────────────────────────────────────────────────
{
    const { ctx, page, errors } = await openPage({ width: 390, height: 844 }, 'dark');
    await page.locator('aura-dialog-demo button#form').tap();
    const form = page.locator('[data-aura-wc-dialog="form"]');
    await form.waitFor({ timeout: 5000 });
    const box = await form.locator('[role="dialog"]').evaluate((el) => el.getBoundingClientRect().width);
    eq('phone: the form spans the screen', Math.round(box), 390 - 16);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'wc-dialog-form-phone-dark.png') });
    await form.locator('[data-action="ok"]').tap();
    await waitResult(page);
    eq('phone: OK by tap', (await lastResult(page))?.max, 42);

    await reset(page);
    await page.locator('aura-dialog-demo button#element').tap();
    const element = page.locator('[data-aura-wc-dialog="element"]');
    await element.waitFor({ timeout: 5000 });
    const w = await element.locator('[role="dialog"]').evaluate((el) => el.getBoundingClientRect().width);
    eq('phone: the element dialog spans the screen', Math.round(w), 390 - 16);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'wc-dialog-element-phone-dark.png') });
    await element.locator('.aura-demo-content button#done').tap();
    await waitResult(page);
    eq('phone: Done by tap', await lastResult(page), 'done');
    check('phone: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
}

// ── the settings editor uses the same fields ────────────────────────────────
{
    const { ctx, page, errors } = await openPage({ width: 1600, height: 1200 });
    await page.evaluate(() => {
        window.__auraShot.setEditMode(true);
        // before the dialog mounts: its sections read the flag once
        window.__auraShot.unfoldSections();
    });
    await page.waitForTimeout(400);
    await page.locator('.aura-edit-chrome button').first().click();
    await page.locator('button:text-is("Bearbeiten")').click();
    const dlg = page.locator('.aura-widget-edit-modal');
    await dlg.waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
    const size = dlg.locator('[data-wc-field="size"] input');
    eq('settings: number field with the manifest default', await size.inputValue(), '3');
    check('settings: hidden expression', (await dlg.locator('[data-wc-field="note"]').count()) === 0);
    await size.fill('5');
    await dlg.locator('[data-wc-field="frame"] button[role="switch"]').click();
    await dlg.locator('[data-wc-field="look"] select').selectOption('raised');
    check('settings: the hidden field appears', (await dlg.locator('[data-wc-field="note"]').count()) === 1);
    await dlg.locator('[data-wc-field="note"] input').fill('hi');
    await page.waitForTimeout(300);
    const opts = await page.evaluate(() => window.__auraShot.widgetOptions('wc-dialogs'));
    eq('settings: stored in wcSettings', opts?.wcSettings, { size: 5, frame: true, look: 'raised', note: 'hi' });
    if (SHOTS) await dlg.screenshot({ path: join(SHOTS, 'wc-settings-editor.png') });
    check('settings: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
