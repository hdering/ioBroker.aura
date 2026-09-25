// Der Vollbild-Knopf am Widget-Rahmen (Issue #644).
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/widget-fullscreen.mjs
//
// Geprüft wird, was nur im Browser sichtbar wird: dass der Knopf ohne die Option
// gar nicht existiert, dass er auf Touch-Geräten dauerhaft sichtbar ist und mit
// Maus erst beim Überfahren (sonst läge er dauerhaft auf dem Wert, den viele
// Widgets in dieselbe Ecke zeichnen), dass das Overlay den Bildschirm füllt und
// sich wieder schließt, und dass er sich die rechte obere Ecke mit dem
// Aktions-Knopf aus #527 teilt, statt auf ihm zu liegen.
//
// Die reine Platzierungsrechnung steht in tools/tests/widget-fullscreen-logic.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const DESKTOP = { width: 1400, height: 900 };

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const widget = (id, type, options = {}) => ({
    id,
    type,
    title: 'Vollbild-Probe',
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 20, h: 10 },
    options,
});

const browser = await chromium.launch();
const pageErrors = [];

/** Öffnet das Dashboard mit den übergebenen Widgets und liefert die Seite. */
async function open(ctxOptions) {
    const ctx = await browser.newContext({ viewport: DESKTOP, ignoreHTTPSErrors: true, ...ctxOptions });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    return { ctx, page };
}

async function show(page, widgets, opts = {}) {
    await page.evaluate(([w, o]) => window.__auraShot.showWidgets(w, o), [widgets, opts]);
    await page.waitForTimeout(450);
}

const btn = '[data-fullscreen-open]';
const overlay = '[data-widget-fullscreen]';

// ── 1. Maus-Kontext: ohne Option kein Knopf, mit Option erst beim Überfahren ──────────
{
    const { ctx, page } = await open({});

    await show(page, [widget('fs-plain', 'value')]);
    check('ohne Option kein Knopf', (await page.locator(btn).count()) === 0);

    await show(page, [widget('fs-on', 'value', { fullscreenWidget: true })]);
    check('mit Option ist der Knopf im DOM', (await page.locator(btn).count()) === 1);

    const opacity = () => page.locator(btn).evaluate((el) => Number(getComputedStyle(el).opacity));
    check('mit Maus zunächst unsichtbar', (await opacity()) === 0, `opacity ${await opacity()}`);

    await page.hover('[data-aura-widget="fs-on"]');
    await page.waitForTimeout(250);
    const hovered = await opacity();
    check('erscheint beim Überfahren des Widgets', hovered > 0, `opacity ${hovered}`);

    // ── 2. Öffnen, Größe, Schließen ──────────────────────────────────────────────────
    await page.click(btn);
    await page.waitForTimeout(400);
    check('Klick öffnet das Overlay', (await page.locator(overlay).count()) === 1);

    const box = await page.locator(`${overlay} .aura-widget`).first().boundingBox();
    check(
        'das Widget füllt den Bildschirm',
        box && box.height > DESKTOP.height * 0.8 && box.width > DESKTOP.width * 0.8,
        box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'keine Box',
    );
    check('im Overlay gibt es keinen zweiten Vollbild-Knopf', (await page.locator(`${overlay} ${btn}`).count()) === 0);

    await page.click('[data-widget-fullscreen-close]');
    await page.waitForTimeout(300);
    check('das Kreuz schließt', (await page.locator(overlay).count()) === 0);

    await page.hover('[data-aura-widget="fs-on"]');
    await page.click(btn);
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('Esc schließt', (await page.locator(overlay).count()) === 0);

    // ── 3. Ecke ──────────────────────────────────────────────────────────────────────
    await show(page, [widget('fs-tl', 'value', { fullscreenWidget: true, fullscreenPosition: 'tl' })]);
    await page.hover('[data-aura-widget="fs-tl"]');
    await page.waitForTimeout(200);
    const card = await page.locator('[data-aura-widget="fs-tl"] .aura-widget').first().boundingBox();
    const left = await page.locator(btn).boundingBox();
    check(
        '"links oben" setzt den Knopf an den linken Rand',
        left && card && left.x - card.x < card.width / 2,
        left && card ? `Knopf x=${Math.round(left.x)}, Karte x=${Math.round(card.x)}` : 'keine Box',
    );

    // ── 4. Editor und ausgenommene Typen ─────────────────────────────────────────────
    await show(page, [widget('fs-edit', 'value', { fullscreenWidget: true })], { editMode: true });
    check('im Editor kein Knopf', (await page.locator(btn).count()) === 0);

    await show(page, [
        widget('fs-iframe', 'iframe', { fullscreenWidget: true, iframeUrl: 'about:blank' }),
        widget('fs-cam', 'camera', { fullscreenWidget: true }),
    ]);
    check('iframe und camera bekommen keinen Knopf', (await page.locator(btn).count()) === 0);

    // ── 5. Geteilte Ecke mit dem Aktions-Knopf aus #527 ──────────────────────────────
    await show(page, [
        widget('fs-html', 'html', {
            fullscreenWidget: true,
            htmlContent: '<div style="height:100%">Inhalt</div>',
            clickAction: { kind: 'link-external', url: 'https://example.invalid', newTab: true },
        }),
    ]);
    await page.hover('[data-aura-widget="fs-html"]');
    await page.waitForTimeout(250);
    const action = await page.locator('[data-embed-action]').boundingBox();
    const full = await page.locator(btn).boundingBox();
    check('beide Knöpfe sind sichtbar', !!action && !!full);
    check(
        'sie liegen nebeneinander statt übereinander',
        action && full && Math.abs(action.x - full.x) >= 28,
        action && full ? `Abstand ${Math.round(Math.abs(action.x - full.x))}px` : 'keine Box',
    );

    // ── 6. Das Optionen-Panel schreibt die beiden Schlüssel, die der Rahmen liest ─────
    await show(page, [widget('fs-cfg', 'value')], { editMode: true });
    await page.click('[data-aura-widget="fs-cfg"] .aura-edit-chrome button:last-child');
    await page.waitForTimeout(250);
    await page
        .getByRole('button', { name: /Bearbeiten/ })
        .first()
        .click();
    await page.waitForTimeout(400);
    await page.getByText('Darstellung', { exact: true }).first().click();
    await page.waitForTimeout(250);
    const fsLabel = page.getByText('Vollbild-Knopf', { exact: true });
    check('das Panel bietet den Schalter an', (await fsLabel.count()) === 1);
    await fsLabel.locator('xpath=following-sibling::button[1]').click();
    await page.waitForTimeout(250);
    const afterToggle = await page.evaluate(() => window.__auraShot.widgetOptions('fs-cfg'));
    check(
        'der Schalter schreibt fullscreenWidget',
        afterToggle?.fullscreenWidget === true,
        JSON.stringify(afterToggle),
    );
    await page.getByRole('button', { name: 'rechts unten' }).click();
    await page.waitForTimeout(250);
    const afterChip = await page.evaluate(() => window.__auraShot.widgetOptions('fs-cfg'));
    check(
        'die Ecken-Chips schreiben fullscreenPosition',
        afterChip?.fullscreenPosition === 'br',
        JSON.stringify(afterChip),
    );

    const scrToggle = page.locator('[data-fullscreen-screen-toggle]');
    check('der Bildschirm-Schalter erscheint mit dem Knopf', (await scrToggle.count()) === 1);
    await scrToggle.click();
    await page.waitForTimeout(250);
    const afterScr = await page.evaluate(() => window.__auraShot.widgetOptions('fs-cfg'));
    check('der Schalter schreibt fullscreenScreen', afterScr?.fullscreenScreen === true, JSON.stringify(afterScr));

    await ctx.close();
}

// ── 6b. Bildschirmfüllend über die Fullscreen-API des Browsers (Issue #711) ──────────
{
    const { ctx, page } = await open({});
    const fsEl = () => page.evaluate(() => !!document.fullscreenElement);
    const openFs = async (id) => {
        await page.hover(`[data-aura-widget="${id}"]`);
        await page.click(btn);
        await page.waitForTimeout(400);
    };

    await show(page, [widget('fs-win', 'value', { fullscreenWidget: true })]);
    await openFs('fs-win');
    check('ohne Option kein Browser-Vollbild', !(await fsEl()));
    await page.click('[data-widget-fullscreen-close]');
    await page.waitForTimeout(300);

    await show(page, [widget('fs-scr', 'value', { fullscreenWidget: true, fullscreenScreen: true })]);
    await openFs('fs-scr');
    check('mit Option geht die Seite ins Browser-Vollbild', await fsEl());
    check('das Overlay ist offen', (await page.locator(overlay).count()) === 1);
    await page.click('[data-widget-fullscreen-close]');
    await page.waitForTimeout(400);
    check('das Kreuz beendet auch das Browser-Vollbild', !(await fsEl()));

    // Esc im echten Vollbild nimmt der Browser selbst — nachgestellt über exitFullscreen.
    await openFs('fs-scr');
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForTimeout(400);
    check('Verlassen des Browser-Vollbilds schließt das Overlay', (await page.locator(overlay).count()) === 0);

    // War die Seite schon im Vollbild (F11/Kiosk), bleibt sie es nach dem Schließen.
    await page.evaluate(() => {
        const b = document.createElement('button');
        b.id = 'pre-fs';
        b.textContent = 'fs';
        b.style.cssText = 'position:fixed;left:0;bottom:0;z-index:99999';
        b.onclick = () => document.documentElement.requestFullscreen();
        document.body.appendChild(b);
    });
    await page.click('#pre-fs');
    await page.waitForTimeout(400);
    await page.evaluate(() => document.getElementById('pre-fs').remove());
    check('Vorbedingung: Seite schon im Vollbild', await fsEl());
    await openFs('fs-scr');
    await page.click('[data-widget-fullscreen-close]');
    await page.waitForTimeout(400);
    check('fremdes Vollbild bleibt nach dem Schließen', await fsEl());
    await page.evaluate(() => document.exitFullscreen());

    await ctx.close();
}

// ── 7. Touch-Kontext: dauerhaft sichtbar ─────────────────────────────────────────────
{
    const { ctx, page } = await open({ hasTouch: true, isMobile: true });
    await show(page, [widget('fs-touch', 'value', { fullscreenWidget: true })]);
    const opacity = await page.locator(btn).evaluate((el) => Number(getComputedStyle(el).opacity));
    check('ohne Hover-Fähigkeit dauerhaft sichtbar', opacity > 0, `opacity ${opacity}`);
    await ctx.close();
}

await browser.close();

check('keine JS-Fehler', pageErrors.length === 0, pageErrors.join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\nwidget-fullscreen: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
