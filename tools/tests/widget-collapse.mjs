// Einklappbare Widgets (Issue #676): jedes Widget kann eingeklappt starten.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/widget-collapse.mjs
//
// Geprüft wird, was nur im Browser sichtbar wird: dass die Karte eingeklappt nur
// die Kopfzeile (Icon + Titel) zeigt und im Raster auf wenige Zeilen schrumpft,
// dass das Widget darunter nachrückt, dass ein Tipp auf die Kopfzeile den Inhalt
// ausklappt und der Einklapp-Knopf ihn wieder einklappt, dass die Gruppe ihre
// eigene Kopfzeile behält, dass im Editor nichts eingeklappt ist, dass die Option
// im Bereich „Darstellung" steht (bei der Gruppe genau einmal) und dass die
// Einspaltenansicht die eingeklappte Karte ebenfalls auf die Kopfzeile zieht.
//
// Die reine Regel-/Zeilenrechnung steht in tools/tests/widget-collapse-logic.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const DESKTOP = { width: 1400, height: 900 };
const PHONE = { width: 390, height: 844 };

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const widget = (id, type, options = {}, gridPos = { x: 0, y: 0, w: 20, h: 10 }) => ({
    id,
    type,
    title: 'Klapp-Probe',
    datapoint: 'demo.temp',
    layout: 'default',
    gridPos,
    options,
});

const browser = await chromium.launch();
const pageErrors = [];

/** Öffnet das Dashboard und liefert die Seite. */
async function open(ctxOptions) {
    const ctx = await browser.newContext({ viewport: DESKTOP, ignoreHTTPSErrors: true, ...ctxOptions });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
    await page.evaluate(() => window.__auraShot.mockServerState({ 'demo.temp': { val: 21.5, unit: '°C' } }));
    return { ctx, page };
}

async function show(page, widgets, opts = {}) {
    await page.evaluate(([w, o]) => window.__auraShot.showWidgets(w, o), [widgets, opts]);
    await page.waitForTimeout(500);
}

const box = (page, id) => page.locator(`[data-aura-widget="${id}"]`).first().boundingBox();
const header = (id) => `[data-aura-widget="${id}"] [data-collapsed-header]`;
const toggle = (id) => `[data-aura-widget="${id}"] [data-collapse-toggle]`;

// Standardraster: 20 px Zeile, 10 px Lücke, 16 px Innenabstand. Zehn Zeilen sind 290 px.
const ROW = 20;
const GAP = 10;
const expandedPx = (rows) => rows * ROW + (rows - 1) * GAP;

// ── 1. Maus-Kontext: eingeklappt starten, nachrücken, auf-/zuklappen ──────────────────
{
    const { ctx, page } = await open({});

    await show(page, [
        widget('cl-a', 'value', { defaultCollapsed: true }),
        widget('cl-b', 'value', {}, { x: 0, y: 10, w: 20, h: 4 }),
    ]);

    check('eingeklappt zeigt die Karte die Kopfzeile', (await page.locator(header('cl-a')).count()) === 1);
    check(
        'der Inhalt des Widgets ist nicht gemountet',
        (await page.locator('[data-aura-widget="cl-a"] .aura-widget-value').count()) === 0,
    );
    const titleText = await page.locator(`${header('cl-a')} .aura-widget-title`).textContent();
    check('die Kopfzeile trägt den Titel', titleText?.trim() === 'Klapp-Probe', titleText ?? '');
    check('die Kopfzeile trägt das Icon', (await page.locator(`${header('cl-a')} .aura-widget-icon`).count()) === 1);

    let a = await box(page, 'cl-a');
    let b = await box(page, 'cl-b');
    check('die Karte ist auf wenige Zeilen geschrumpft', a && a.height <= expandedPx(3) + 1, `Höhe ${a?.height}`);
    check(
        'das Widget darunter rückt nach',
        a && b && b.y < a.y + expandedPx(10) - 40,
        a && b ? `b.y ${Math.round(b.y)}, a.y ${Math.round(a.y)}` : 'keine Box',
    );
    check('ausgeklappt gibt es keinen Einklapp-Knopf', (await page.locator(toggle('cl-a')).count()) === 0);

    // Ausklappen per Tipp auf die Kopfzeile
    await page.click(header('cl-a'));
    await page.waitForTimeout(500);
    check('ein Tipp klappt aus: Kopfzeile weg', (await page.locator(header('cl-a')).count()) === 0);
    check(
        'ein Tipp klappt aus: Inhalt gemountet',
        (await page.locator('[data-aura-widget="cl-a"] .aura-widget-value').count()) === 1,
    );
    a = await box(page, 'cl-a');
    b = await box(page, 'cl-b');
    check(
        'ausgeklappt hat die Karte ihre gespeicherte Höhe',
        a && Math.abs(a.height - expandedPx(10)) <= 2,
        `Höhe ${a?.height}, erwartet ${expandedPx(10)}`,
    );
    check(
        'das Widget darunter rückt wieder herunter',
        a && b && b.y >= a.y + expandedPx(10),
        a && b ? `b.y ${Math.round(b.y)}, a.y ${Math.round(a.y)}` : 'keine Box',
    );

    check('ausgeklappt ist der Einklapp-Knopf im DOM', (await page.locator(toggle('cl-a')).count()) === 1);
    // Der Klick hat den Zeiger auf der Karte stehen lassen — erst wegbewegen, sonst
    // misst man den Hover-Zustand statt des Ruhezustands.
    await page.mouse.move(DESKTOP.width - 20, DESKTOP.height - 20);
    await page.waitForTimeout(250);
    const opacity = () => page.locator(toggle('cl-a')).evaluate((el) => Number(getComputedStyle(el).opacity));
    check('mit Maus zunächst unsichtbar', (await opacity()) === 0, `opacity ${await opacity()}`);
    await page.hover('[data-aura-widget="cl-a"]');
    await page.waitForTimeout(250);
    check('erscheint beim Überfahren', (await opacity()) > 0, `opacity ${await opacity()}`);

    // Wieder einklappen über den Knopf
    await page.click(toggle('cl-a'));
    await page.waitForTimeout(500);
    check('der Knopf klappt wieder ein', (await page.locator(header('cl-a')).count()) === 1);
    a = await box(page, 'cl-a');
    check('die Karte ist wieder geschrumpft', a && a.height <= expandedPx(3) + 1, `Höhe ${a?.height}`);

    // ── 2. Ecke: Einklapp-Knopf neben dem Vollbild-Knopf, nicht darauf ─────────────
    await show(page, [widget('cl-fs', 'value', { defaultCollapsed: true, fullscreenWidget: true })]);
    await page.click(header('cl-fs'));
    await page.waitForTimeout(400);
    await page.hover('[data-aura-widget="cl-fs"]');
    await page.waitForTimeout(250);
    const fold = await page.locator(toggle('cl-fs')).boundingBox();
    const full = await page.locator('[data-aura-widget="cl-fs"] [data-fullscreen-open]').boundingBox();
    check('beide Knöpfe sind sichtbar', !!fold && !!full);
    check(
        'sie liegen nebeneinander statt übereinander',
        fold && full && Math.abs(fold.x - full.x) >= 28,
        fold && full ? `Abstand ${Math.round(Math.abs(fold.x - full.x))}px` : 'keine Box',
    );
    check(
        'der Vollbild-Knopf bleibt außen',
        fold && full && full.x > fold.x,
        fold && full ? `fold.x ${Math.round(fold.x)}, full.x ${Math.round(full.x)}` : 'keine Box',
    );

    // Konfigurierte Ecke links oben
    await show(page, [widget('cl-tl', 'value', { defaultCollapsed: true, collapsePosition: 'tl' })]);
    await page.click(header('cl-tl'));
    await page.waitForTimeout(400);
    const card = await box(page, 'cl-tl');
    const tl = await page.locator(toggle('cl-tl')).boundingBox();
    check(
        'collapsePosition "tl" setzt den Knopf links oben',
        card && tl && tl.x - card.x < 20 && tl.y - card.y < 20,
        card && tl ? `dx ${Math.round(tl.x - card.x)}, dy ${Math.round(tl.y - card.y)}` : 'keine Box',
    );

    // ── 3. Die Gruppe behält ihre eigene Kopfzeile ─────────────────────────────────
    await show(page, [widget('cl-grp', 'group', { defaultCollapsed: true }, { x: 0, y: 0, w: 20, h: 8 })]);
    check('die Gruppe zeichnet keine Rahmen-Kopfzeile', (await page.locator(header('cl-grp')).count()) === 0);
    check(
        'die Gruppe zeigt ihren eigenen Titel mit Pfeil',
        (await page.locator('[data-aura-widget="cl-grp"] .aura-widget-title').count()) === 1,
    );
    check('die Gruppe bekommt keinen Einklapp-Knopf', (await page.locator(toggle('cl-grp')).count()) === 0);

    // ── 4. Ausnahmen: Abschnittstitel, Editor ─────────────────────────────────────
    await show(page, [widget('cl-hd', 'header', { defaultCollapsed: true }, { x: 0, y: 0, w: 20, h: 2 })]);
    check('der Abschnittstitel klappt nie ein', (await page.locator(header('cl-hd')).count()) === 0);

    await show(page, [widget('cl-ed', 'value', { defaultCollapsed: true })], { editMode: true });
    check('im Editor ist nichts eingeklappt', (await page.locator(header('cl-ed')).count()) === 0);
    check('im Editor gibt es keinen Einklapp-Knopf', (await page.locator(toggle('cl-ed')).count()) === 0);
    check(
        'im Editor ist der Inhalt sichtbar',
        (await page.locator('[data-aura-widget="cl-ed"] .aura-widget-value').count()) === 1,
    );

    // ── 4b. „Auch im Editor eingeklappt": Kopfzeile, Bedien-Chrome, Höhe, Ausklappen ──
    await show(
        page,
        [
            widget('cl-edc', 'value', { defaultCollapsed: true, collapseInEditor: true }),
            widget('cl-edb', 'value', {}, { x: 0, y: 10, w: 20, h: 4 }),
        ],
        { editMode: true },
    );
    check('mit Editor-Option zeigt der Editor die Kopfzeile', (await page.locator(header('cl-edc')).count()) === 1);
    check(
        'die Kopfzeile ist im Editor die Griff-Fläche (kein nodrag)',
        !(await page.locator(header('cl-edc')).evaluate((el) => el.classList.contains('nodrag'))),
    );
    check(
        'das Bedien-Chrome bleibt erreichbar',
        (await page.locator('[data-aura-widget="cl-edc"] .aura-edit-chrome').count()) === 1,
    );
    let ec = await box(page, 'cl-edc');
    let eb = await box(page, 'cl-edb');
    check('im Editor schrumpft die Karte ebenfalls', ec && ec.height <= expandedPx(3) + 1, `Höhe ${ec?.height}`);
    check(
        'im Editor rückt das Widget darunter nach',
        ec && eb && eb.y < ec.y + expandedPx(10) - 40,
        ec && eb ? `b.y ${Math.round(eb.y)}, a.y ${Math.round(ec.y)}` : 'keine Box',
    );
    await page.click(header('cl-edc'));
    await page.waitForTimeout(500);
    check('ein Klick klappt im Editor zum Bearbeiten aus', (await page.locator(header('cl-edc')).count()) === 0);
    ec = await box(page, 'cl-edc');
    check(
        'ausgeklappt gilt im Editor die gespeicherte Höhe',
        ec && Math.abs(ec.height - expandedPx(10)) <= 2,
        `Höhe ${ec?.height}, erwartet ${expandedPx(10)}`,
    );
    await page.hover('[data-aura-widget="cl-edc"]');
    await page.waitForTimeout(250);
    const edFold = await page.locator(toggle('cl-edc')).boundingBox();
    const edMenu = await page.locator('[data-aura-widget="cl-edc"] .aura-edit-chrome button:last-child').boundingBox();
    check('im Editor gibt es den Einklapp-Knopf', !!edFold);
    check(
        'er liegt links neben dem Bedien-Chrome statt darauf',
        edFold && edMenu && edFold.x + edFold.width <= edMenu.x - 20,
        edFold && edMenu ? `fold ${Math.round(edFold.x + edFold.width)}, chrome ${Math.round(edMenu.x)}` : 'keine Box',
    );

    // ── 5. Das Optionen-Panel: Schalter im Bereich Darstellung ─────────────────────
    await show(page, [widget('cl-cfg', 'value')], { editMode: true });
    await page.click('[data-aura-widget="cl-cfg"] .aura-edit-chrome button:last-child');
    await page.waitForTimeout(250);
    await page
        .getByRole('button', { name: /Bearbeiten/ })
        .first()
        .click();
    await page.waitForTimeout(400);
    await page.getByText('Darstellung', { exact: true }).first().click();
    await page.waitForTimeout(250);
    const label = page.getByText('Standardmäßig eingeklappt', { exact: true });
    check('das Panel bietet den Schalter genau einmal an', (await label.count()) === 1);
    check(
        'der Schalter steht im Bereich Darstellung',
        (await page.locator('details:has-text("Darstellung") [data-collapse-option]').count()) === 1,
    );
    await page.locator('[data-collapse-option]').click();
    await page.waitForTimeout(250);
    const afterToggle = await page.evaluate(() => window.__auraShot.widgetOptions('cl-cfg'));
    check(
        'der Schalter schreibt defaultCollapsed',
        afterToggle?.defaultCollapsed === true,
        JSON.stringify(afterToggle),
    );
    await page.getByRole('button', { name: 'links oben' }).click();
    await page.waitForTimeout(250);
    const afterChip = await page.evaluate(() => window.__auraShot.widgetOptions('cl-cfg'));
    check(
        'die Ecken-Chips schreiben collapsePosition',
        afterChip?.collapsePosition === 'tl',
        JSON.stringify(afterChip),
    );
    check('im Editor bleibt das Widget trotz Option ausgeklappt', (await page.locator(header('cl-cfg')).count()) === 0);
    const edLabel = page.getByText('Auch im Editor eingeklappt', { exact: true });
    check('die Editor-Unteroption erscheint, sobald eingeklappt an ist', (await edLabel.count()) === 1);
    await page.locator('[data-collapse-editor-option]').click();
    await page.waitForTimeout(500);
    const afterEditor = await page.evaluate(() => window.__auraShot.widgetOptions('cl-cfg'));
    check(
        'die Unteroption schreibt collapseInEditor',
        afterEditor?.collapseInEditor === true,
        JSON.stringify(afterEditor),
    );
    check('damit klappt das Widget im Editor sofort ein', (await page.locator(header('cl-cfg')).count()) === 1);
    await page.locator('[data-collapse-option]').click();
    await page.waitForTimeout(250);
    check(
        'ohne „eingeklappt" verschwindet die Unteroption',
        (await page.getByText('Auch im Editor eingeklappt', { exact: true }).count()) === 0,
    );

    // Gruppe: der Schalter ist umgezogen — genau einmal, in Darstellung, ohne Ecken-Chips
    await show(page, [widget('cl-gcfg', 'group', {}, { x: 0, y: 0, w: 20, h: 8 })], { editMode: true });
    await page.click('[data-aura-widget="cl-gcfg"] .aura-edit-chrome button:last-child');
    await page.waitForTimeout(250);
    await page
        .getByRole('button', { name: /Bearbeiten/ })
        .first()
        .click();
    await page.waitForTimeout(400);
    const gLabel = page.getByText('Standardmäßig eingeklappt', { exact: true });
    check('bei der Gruppe steht der Schalter genau einmal', (await gLabel.count()) === 1);
    check(
        'bei der Gruppe steht er im Bereich Darstellung',
        (await page.locator('details:has-text("Darstellung") [data-collapse-option]').count()) === 1,
    );
    await page.getByText('Darstellung', { exact: true }).first().click();
    await page.waitForTimeout(250);
    await page.locator('[data-collapse-option]').click();
    await page.waitForTimeout(250);
    const gAfter = await page.evaluate(() => window.__auraShot.widgetOptions('cl-gcfg'));
    check('der Gruppen-Schalter schreibt defaultCollapsed', gAfter?.defaultCollapsed === true, JSON.stringify(gAfter));
    check(
        'die Gruppe bekommt keine Ecken-Chips',
        (await page.getByRole('button', { name: 'links oben' }).count()) === 0,
    );

    await ctx.close();
}

// ── 6. Einspaltenansicht (Smartphone, Touch): Karte zieht sich auf die Kopfzeile ─────
{
    const { ctx, page } = await open({ viewport: PHONE, hasTouch: true, isMobile: true });
    await show(page, [
        widget('cl-m', 'value', { defaultCollapsed: true }),
        widget('cl-m2', 'value', {}, { x: 0, y: 10, w: 20, h: 4 }),
    ]);
    check('mobil zeigt die Karte die Kopfzeile', (await page.locator(header('cl-m')).count()) === 1);
    let m = await box(page, 'cl-m');
    let m2 = await box(page, 'cl-m2');
    check('mobil hugt der Stapel die Kopfzeile', m && m.height < 100, `Höhe ${m?.height}`);
    check(
        'mobil rückt das nächste Widget direkt nach',
        m && m2 && m2.y - (m.y + m.height) <= GAP + 2,
        m && m2 ? `Lücke ${Math.round(m2.y - (m.y + m.height))}px` : 'keine Box',
    );
    await page.tap(header('cl-m'));
    await page.waitForTimeout(500);
    m = await box(page, 'cl-m');
    check('mobil klappt ein Tipp aus', m && m.height >= 200, `Höhe ${m?.height}`);
    const opacity = await page.locator(toggle('cl-m')).evaluate((el) => Number(getComputedStyle(el).opacity));
    check('ohne Hover-Fähigkeit ist der Einklapp-Knopf dauerhaft sichtbar', opacity > 0, `opacity ${opacity}`);
    await ctx.close();
}

await browser.close();

check('keine JS-Fehler', pageErrors.length === 0, pageErrors.join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\nwidget-collapse: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
