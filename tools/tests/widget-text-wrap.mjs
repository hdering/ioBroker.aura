// Der universelle Textumbruch (Issue #653).
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/widget-text-wrap.mjs
//
// Die Option ist eine einzige CSS-Regel (.aura-textwrap in index.css), die vom
// Karten-Rahmen aus auf jedes abgeschnittene Textfeld greift - deshalb ist der
// Browser der einzige Ort, an dem sich das pruefen laesst. Geprueft wird: dass
// ohne Option weiter abgeschnitten wird, dass die Regel bei mehreren Zeilen
// wirklich mehr Hoehe erzeugt, dass die Zeilenzahl der Deckel ist (sonst liefe
// ein langer Text aus der Karte), dass die Regel ueber Widget-Typen hinweg
// greift, und dass das Optionen-Panel den Schluessel schreibt, den der Rahmen
// liest.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const DESKTOP = { width: 1400, height: 900 };

const LONG = 'Wohnzimmer Deckenbeleuchtung gedimmt auf Abendstimmung warmweiss';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const widget = (id, type, options = {}) => ({
    id,
    type,
    title: LONG,
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 6, h: 6 },
    options,
});

const browser = await chromium.launch();
const pageErrors = [];

const ctx = await browser.newContext({ viewport: DESKTOP, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

async function show(widgets, opts = {}) {
    await page.evaluate(([w, o]) => window.__auraShot.showWidgets(w, o), [widgets, opts]);
    await page.waitForTimeout(450);
}

/** Der Titel - das Textfeld, das jedes Widget hat und jedes abschneidet. */
const title = (id) => page.locator(`[data-aura-widget="${id}"] .aura-widget-title`).first();

const metrics = (loc) =>
    loc.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
            h: el.getBoundingClientRect().height,
            whiteSpace: cs.whiteSpace,
            clamp: cs.webkitLineClamp || cs.lineClamp,
            overflow: cs.overflow,
            // Ueberlaeuft der Text seine Box noch? Ohne Umbruch ja, mit genug Zeilen nicht.
            clipped: el.scrollWidth > el.clientWidth + 1,
        };
    });

// -- 1. Ohne Option bleibt alles, wie es war --------------------------------------------
await show([widget('tw-off', 'value')]);
const off = await metrics(title('tw-off'));
check('ohne Option wird weiter abgeschnitten', off.whiteSpace === 'nowrap', `white-space ${off.whiteSpace}`);
check('ohne Option passt der Text nicht in die Box', off.clipped);

// -- 2. Mit Option bricht der Text um und wird hoeher ------------------------------------
await show([widget('tw-2', 'value', { textLines: 2 })]);
const two = await metrics(title('tw-2'));
check('textLines 2 hebt das nowrap auf', two.whiteSpace !== 'nowrap', `white-space ${two.whiteSpace}`);
check('textLines 2 setzt den Zeilendeckel', String(two.clamp) === '2', `line-clamp ${two.clamp}`);
check('der umgebrochene Text ist hoeher', two.h > off.h * 1.4, `${Math.round(off.h)} -> ${Math.round(two.h)}px`);
check('der Text passt jetzt in die Breite', !two.clipped);

// -- 3. Die Zeilenzahl ist der Deckel, nicht nur ein Vorschlag ---------------------------
await show([widget('tw-3', 'value', { textLines: 3 })]);
const three = await metrics(title('tw-3'));
check('textLines 3 gibt drei Zeilen frei', String(three.clamp) === '3', `line-clamp ${three.clamp}`);
check(
    'drei Zeilen sind nicht niedriger als zwei',
    three.h >= two.h,
    `${Math.round(two.h)} -> ${Math.round(three.h)}px`,
);
check(
    'der Deckel haelt die Hoehe endlich',
    three.h < off.h * 4,
    `${Math.round(three.h)}px bei Zeilenhoehe ${Math.round(off.h)}`,
);
check('ueberstehender Text bleibt verdeckt', three.overflow === 'hidden', `overflow ${three.overflow}`);

// -- 4. Die Regel gilt fuer jeden Typ, nicht nur den einen ------------------------------
// enum ist das Beispiel aus dem Issue; switch und list teilen sich nur die Klasse.
for (const type of ['enum', 'switch', 'list']) {
    await show([widget(`tw-${type}`, type, { textLines: 2 })]);
    const t = await metrics(title(`tw-${type}`));
    check(
        `die Regel greift auch bei "${type}"`,
        t.whiteSpace !== 'nowrap' && String(t.clamp) === '2',
        JSON.stringify(t),
    );
}

// -- 5. Das Panel schreibt den Schluessel, den der Rahmen liest -------------------------
await show([widget('tw-cfg', 'value')], { editMode: true });
await page.click('[data-aura-widget="tw-cfg"] .aura-edit-chrome button:last-child');
await page.waitForTimeout(250);
await page
    .getByRole('button', { name: /Bearbeiten/ })
    .first()
    .click();
await page.waitForTimeout(400);
await page.getByText('Darstellung', { exact: true }).first().click();
await page.waitForTimeout(250);
check('das Panel bietet den Umbruch an', (await page.getByText('Textumbruch', { exact: true }).count()) === 1);

await page.getByRole('button', { name: '3 Zeilen', exact: true }).click();
await page.waitForTimeout(250);
const afterPick = await page.evaluate(() => window.__auraShot.widgetOptions('tw-cfg'));
check('die Chips schreiben textLines', afterPick?.textLines === 3, JSON.stringify(afterPick));

// "aus" darf den Schluessel nicht auf 1 einfrieren - sonst steht er in jedem Export.
await page.getByRole('button', { name: 'aus', exact: true }).click();
await page.waitForTimeout(250);
const afterOff = await page.evaluate(() => window.__auraShot.widgetOptions('tw-cfg'));
check('"aus" raeumt den Schluessel weg', afterOff?.textLines === undefined, JSON.stringify(afterOff));

await ctx.close();
await browser.close();

check('keine JS-Fehler', pageErrors.length === 0, pageErrors.join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\nwidget-text-wrap: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
