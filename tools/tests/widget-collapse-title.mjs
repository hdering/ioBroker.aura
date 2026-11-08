// Klappbare Widgets: Titelzeile aufgeklappt (Issue #941).
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/widget-collapse-title.mjs
//
// Aufgeklappt sieht die Titelzeile aus wie der eingeklappte Kopf: Pfeil vorne,
// Pfeil/Icon/Titel an derselben Stelle, Titel gleich fett. Ein Klick auf die
// Titelzeile klappt ein, ebenso der Pfeil (auch per Tastatur); ein Bedienelement
// in der Zeile behält seinen Klick.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const widget = (id, type, options = {}, extra = {}) => ({
    id,
    type,
    title: 'Klapp-Titel',
    datapoint: 'demo.temp',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 20, h: 10 },
    options: { defaultCollapsed: true, ...options },
    ...extra,
});

const browser = await chromium.launch();
const pageErrors = [];
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.evaluate(() =>
    window.__auraShot.mockServerState({ 'demo.temp': { val: 21.5 }, 'demo.json': { val: '[{"a":1,"b":2}]' } }),
);

const sel = (id) => `[data-aura-widget="${id}"]`;

/** Linke Kante von Pfeil, Icon und Titel(text) plus Schriftstärke des Titels. */
const headPos = (id) =>
    page.evaluate((s) => {
        const w = document.querySelector(s);
        const left = (el) => (el ? Math.round(el.getBoundingClientRect().left * 10) / 10 : null);
        const chevron = w.querySelector('[data-collapsed-header] svg, [data-collapse-chevron]');
        const icon = w.querySelector('.aura-widget-icon');
        const title = w.querySelector('.aura-widget-title');
        let textLeft = null;
        if (title) {
            const r = document.createRange();
            r.selectNodeContents(title);
            textLeft = Math.round(r.getBoundingClientRect().left * 10) / 10;
        }
        return {
            chevron: left(chevron),
            icon: left(icon),
            title: textLeft,
            weight: title ? getComputedStyle(title).fontWeight : null,
        };
    }, sel(id));

const collapsed = (id) =>
    page
        .locator(`${sel(id)} [data-collapsed-header]`)
        .count()
        .then((n) => n > 0);

const cases = [
    ['html', widget('c-html', 'html', { html: '<p>Inhalt</p>' })],
    ['jsontable', widget('c-json', 'jsontable', {}, { datapoint: 'demo.json' })],
    ['adapterstatus', widget('c-adapter', 'adapterstatus')],
    ['universal', widget('c-univ', 'universal')],
    ['value', widget('c-value', 'value')],
];

for (const [name, w] of cases) {
    await page.evaluate((ws) => window.__auraShot.showWidgets(ws), [w]);
    await page.waitForTimeout(500);
    check(`${name}: startet eingeklappt`, await collapsed(w.id));
    const folded = await headPos(w.id);
    await page.locator(`${sel(w.id)} [data-collapsed-header]`).click();
    await page.waitForTimeout(300);
    check(`${name}: Kopf klappt aus`, !(await collapsed(w.id)));
    const open = await headPos(w.id);
    check(`${name}: Pfeil auch aufgeklappt`, open.chevron !== null);
    for (const k of ['chevron', 'icon', 'title']) {
        const d = folded[k] === null || open[k] === null ? 0 : Math.abs(folded[k] - open[k]);
        check(`${name}: ${k} bleibt stehen`, d <= 1, `zu ${folded[k]} / offen ${open[k]}`);
    }
    check(`${name}: Titel gleich fett`, open.weight === folded.weight, `zu ${folded.weight} / offen ${open.weight}`);

    // Klick auf den Titeltext klappt ein.
    await page
        .locator(`${sel(w.id)} .aura-widget-title`)
        .first()
        .click();
    await page.waitForTimeout(300);
    check(`${name}: Titelklick klappt ein`, await collapsed(w.id));

    // Pfeil per Tastatur.
    await page.locator(`${sel(w.id)} [data-collapsed-header]`).click();
    await page.waitForTimeout(300);
    await page.locator(`${sel(w.id)} [data-collapse-chevron]`).focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    check(`${name}: Pfeil per Enter klappt ein`, await collapsed(w.id));
}

// Bedienelement in der Titelzeile (Zeitschaltuhr: Knopf rechts) behält seinen Klick.
{
    const w = widget('c-timer', 'timer');
    await page.evaluate((ws) => window.__auraShot.showWidgets(ws), [w]);
    await page.waitForTimeout(500);
    await page.locator(`${sel(w.id)} [data-collapsed-header]`).click();
    await page.waitForTimeout(300);
    const ctl = page
        .locator(`${sel(w.id)} .aura-title-collapse :is(button, [role="switch"]):not([data-collapse-chevron])`)
        .first();
    if ((await ctl.count()) > 0) {
        await ctl.click();
        await page.waitForTimeout(300);
        check('timer: Bedienelement klappt nicht ein', !(await collapsed(w.id)));
    } else {
        check('timer: Bedienelement in der Titelzeile', false, 'nicht gefunden');
    }
}

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} ok`);
process.exit(failed ? 1 : 0);
