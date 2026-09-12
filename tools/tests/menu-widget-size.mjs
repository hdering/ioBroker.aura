// Elemente im Header-Editor: Groesse des Widget-Slots und die Zeile selbst (#634).
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/menu-widget-size.mjs
//
// Drei Beschwerden aus dem Issue, alle im Admin -> Design -> Header:
//   1. Ein frisch hinzugefuegtes Widget kam winzig an (der Leisten-Fallback
//      120x32), niemand hat darin das eben gewaehlte Widget wiedererkannt. Neu:
//      der Slot startet auf der Box, die der Typ auf einem Dashboard hat.
//   2. Breite und Hoehe waren zwei Zahlenfelder. Neu: an der Ecke der Vorschau
//      ziehen, pixelgenau - die Zahlenfelder gibt es nicht mehr.
//   3. Die Zeile klappte nur ueber den 12px-Pfeil auf, und ein gerade
//      hinzugefuegtes Element war zu.
//
// Laeuft offline: jede Anfrage ans ioBroker-Backend wird abgebrochen, damit der
// gesetzte localStorage-Stand nicht von einer Remote-Konfiguration ueberschrieben
// wird. Es wird keine Instanz angefasst.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

// 'value' ist 8x4 Rasterzellen; mit den Standard-Rastermassen (20px Zelle,
// 10px Abstand) sind das 8*20+7*10 = 230 und 4*20+3*10 = 110 px.
const STD = { w: 230, h: 110 };

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
                        tabs: [
                            {
                                id: 'tab-1',
                                name: 'Dashboard',
                                slug: 'dashboard',
                                widgets: [
                                    {
                                        id: 'akku',
                                        type: 'value',
                                        title: 'Akku',
                                        datapoint: 'demo.battery',
                                        gridPos: { x: 0, y: 0, w: 8, h: 4 },
                                        options: { unit: '%' },
                                    },
                                ],
                            },
                        ],
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, ignoreHTTPSErrors: true });
await ctx.route('**/*', (route) => {
    const url = route.request().url();
    const backend = /socket\.io|[?&]sid=|\/proxy/.test(url);
    return url.startsWith(BASE) && !backend ? route.continue() : route.abort();
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.addInitScript(
    ([dash]) => {
        localStorage.setItem('aura-dashboard', dash);
        // Der Admin haengt an einem Session-Flag - derselbe Weg wie in den
        // anderen Admin-Tests, also ohne Passwort.
        localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 }));
    },
    [dashboard],
);

await page.goto(`${BASE}/#/admin/design?tab=header`, { waitUntil: 'domcontentloaded' });

const addWidget = page.getByRole('button', { name: /^Widget$/ }).first();
await addWidget.waitFor({ state: 'visible', timeout: 30000 });

const row = page.locator('[data-aura-menu-row-head]').first();
const fields = page.locator('[data-aura-menu-row-fields]').first();
const slot = page.locator('.aura-menu-widget').first();
const handle = page.locator('[data-aura-menu-size-handle]').first();

// ── 1. Hinzufuegen klappt das Element auf ────────────────────────────────────
await addWidget.click();
await page.waitForTimeout(400);
check('das neue Element ist offen', await fields.isVisible());

// ── 2. Eigenes Widget startet auf Standardgroesse ────────────────────────────
await page.getByRole('button', { name: 'Eigenes Widget' }).click();
await page.waitForTimeout(500);
const box = await slot.boundingBox();
check(
    'der Slot startet auf der Dashboard-Box des Typs',
    !!box && Math.round(box.width) === STD.w && Math.round(box.height) === STD.h,
    box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'kein Slot',
);

// ── 3. Keine Zahlenfelder, keine Darstellungs-Wahl mehr ──────────────────────
const bodyText = await fields.innerText();
check('kein Breite/Hoehe-Feld mehr', !/Breite \(px\)|H(ö|oe)he \(px\)/.test(bodyText));
check('keine Darstellungs-Wahl mehr', !/Wie im Widget/.test(bodyText));

// ── 4. Ziehen an der Ecke ist pixelgenau ─────────────────────────────────────
// Der Griff sitzt weit unten im Panel - ausserhalb des Viewports kommt keine
// einzige Zeigerbewegung an ihm an.
await handle.scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
const hb = await handle.boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
// In Schritten, damit jedes pointermove wirklich ankommt.
for (let i = 1; i <= 4; i++) {
    await page.mouse.move(hb.x + hb.width / 2 + i * 15, hb.y + hb.height / 2 + i * 5);
    await page.waitForTimeout(60);
}
await page.mouse.up();
await page.waitForTimeout(400);
const dragged = await slot.boundingBox();
check(
    'die Ecke zieht die Box auf die gezogene Groesse',
    Math.abs(dragged.width - (STD.w + 60)) <= 2 && Math.abs(dragged.height - (STD.h + 20)) <= 2,
    `${Math.round(dragged.width)}x${Math.round(dragged.height)}`,
);

// Die gezogene Groesse steht wirklich in der Konfiguration, nicht nur im DOM.
const stored = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('aura-config') || '{}');
    const items = raw.state?.frontend?.headerItems ?? [];
    const w = items[items.length - 1];
    return w ? { w: w.widgetWidth, h: w.widgetHeight } : null;
});
check(
    'die gezogene Groesse ist gespeichert',
    !!stored && Math.abs(stored.w - (STD.w + 60)) <= 2 && Math.abs(stored.h - (STD.h + 20)) <= 2,
    JSON.stringify(stored),
);

// ── 5. Standardgroesse stellt die Box wieder her ─────────────────────────────
await page.getByRole('button', { name: 'Standardgröße' }).click();
await page.waitForTimeout(400);
const reset = await slot.boundingBox();
check(
    'Standardgroesse stellt die Dashboard-Box wieder her',
    Math.round(reset.width) === STD.w && Math.round(reset.height) === STD.h,
    `${Math.round(reset.width)}x${Math.round(reset.height)}`,
);

// ── 6. Die ganze Zeile klappt auf und zu ─────────────────────────────────────
await row.click();
await page.waitForTimeout(300);
check('ein Klick auf die Zeile schliesst sie', !(await fields.isVisible()));
await row.click();
await page.waitForTimeout(300);
check('ein zweiter Klick oeffnet sie wieder', await fields.isVisible());

// Die Bedienelemente auf der Zeile duerfen dabei nicht mitklappen.
const before = await fields.isVisible();
await page.locator('[data-aura-menu-row-head] button').first().click();
await page.waitForTimeout(300);
check('die Knoepfe auf der Zeile klappen sie nicht zu', (await fields.isVisible()) === before);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
