// Abschnittstitel: Untertitel in allen Stilen, Akzentstrich über den ganzen Textblock,
// Stil "framed" als vollwertige Widget-Karte.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/header-subtitle.mjs
//
// Zwei Fehlerbilder, beide hier festgenagelt:
//   1. Der Akzentstrich lag im "default"-Stil INNERHALB der Titelzeile, der Untertitel
//      war deren Geschwister — der Strich endete also über dem Untertitel.
//   2. "compact" und "minimal" rendern den Untertitel gar nicht, obwohl der Editor das
//      Feld und den Schalter "Untertitel" für jeden Stil anbietet.
// Dazu der neue Stil "framed": WidgetFrame nimmt dem Abschnittstitel sonst Karte,
// Rahmen und Innenabstand weg — bei "framed" muss genau das erhalten bleiben.
//
// Gemessen statt geschätzt: Rechtecke von Strich, Titel und Untertitel, und für die
// Karte die berechneten Stile gegen ein echtes Widget statt gegen feste Pixelwerte.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';
const SUBTITLE = 'Erdgeschoss';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
// The edit dialog folds every section; this test fills in settings, so open them all.
await page.evaluate(() => window.__auraShot.unfoldSections());

async function show({ layout, subtitle, titleAlign = 'left', showSubtitle = true, rows = 4, extra = {} }) {
    await page.evaluate(
        ([layout, subtitle, titleAlign, showSubtitle, rows, extra]) => {
            window.__auraShot.showWidgets([
                {
                    id: 'hdr',
                    type: 'header',
                    title: 'Wohnzimmer',
                    layout,
                    gridPos: { x: 0, y: 0, w: 12, h: rows },
                    options: { titleAlign, showSubtitle, ...(subtitle ? { subtitle } : {}), ...extra },
                },
            ]);
        },
        [layout, subtitle, titleAlign, showSubtitle, rows, extra],
    );
    await page.waitForTimeout(300);
}

const geometry = () =>
    page.evaluate(() => {
        const widget = document.querySelector('.aura-widget-type-header');
        const row = widget?.querySelector('.aura-widget-row');
        const rule = row?.querySelector('.rounded-full');
        const title = widget?.querySelector('.aura-widget-title');
        const sub = widget?.querySelector('.aura-widget-value');
        if (!widget || !row) return null;
        const r1 = (n) => Math.round(n * 10) / 10;
        const rect = (el) => {
            if (!el) return null;
            const b = el.getBoundingClientRect();
            return { top: r1(b.top), bottom: r1(b.bottom), left: r1(b.left), right: r1(b.right) };
        };
        return {
            widget: rect(widget),
            rule: rect(rule),
            title: rect(title),
            sub: rect(sub),
            subText: sub ? (sub.textContent || '').trim() : null,
            // Der sichtbare Textblock: alles, was in der Zeile gezeichnet wird, ohne den Strich.
            titleAlignCss: sub ? getComputedStyle(sub).textAlign : null,
        };
    });

// ── 1. Der Untertitel erscheint in jedem Stil ─────────────────────────────────────────
for (const layout of ['default', 'compact', 'minimal', 'framed']) {
    await show({ layout, subtitle: SUBTITLE });
    const g = await geometry();
    check(`${layout}: Untertitel wird angezeigt`, g?.subText === SUBTITLE, `gefunden: ${JSON.stringify(g?.subText)}`);
    check(
        `${layout}: Untertitel steht unter dem Titel`,
        !!g?.sub && !!g?.title && g.sub.top >= g.title.bottom - 1,
        `Titel bis ${g?.title?.bottom}, Untertitel ab ${g?.sub?.top}`,
    );
    check(
        `${layout}: Untertitel liegt im Widget`,
        !!g?.sub && g.sub.bottom <= g.widget.bottom + 0.5 && g.sub.top >= g.widget.top - 0.5,
        `Widget ${g?.widget?.top}..${g?.widget?.bottom}, Untertitel ${g?.sub?.top}..${g?.sub?.bottom}`,
    );

    // Der Schalter muss ihn weiterhin ausblenden können.
    await show({ layout, subtitle: SUBTITLE, showSubtitle: false });
    const off = await geometry();
    check(`${layout}: "Untertitel anzeigen" aus blendet ihn aus`, off?.sub === null);

    // Und ohne Text bleibt es beim reinen Titel.
    await show({ layout, subtitle: '' });
    const empty = await geometry();
    check(`${layout}: ohne Untertiteltext bleibt es beim Titel`, empty?.sub === null);
}

// ── 2. Der Akzentstrich umfasst Titel UND Untertitel ──────────────────────────────────
for (const layout of ['default', 'compact', 'framed']) {
    await show({ layout, subtitle: SUBTITLE });
    const g = await geometry();
    check(`${layout}: Akzentstrich vorhanden`, !!g?.rule);
    check(
        `${layout}: Strich reicht bis unter den Untertitel`,
        !!g?.rule && !!g?.sub && g.rule.bottom + 0.5 >= g.sub.bottom,
        `Strich bis ${g?.rule?.bottom}, Untertitel bis ${g?.sub?.bottom}`,
    );
    check(
        `${layout}: Strich beginnt nicht unter dem Titel`,
        !!g?.rule && !!g?.title && g.rule.top <= g.title.top + 0.5,
        `Strich ab ${g?.rule?.top}, Titel ab ${g?.title?.top}`,
    );
    check(
        `${layout}: Strich steht links vom Text`,
        !!g?.rule && !!g?.title && g.rule.right <= g.title.left,
        `Strich endet bei ${g?.rule?.right}, Titel ab ${g?.title?.left}`,
    );
}

// Ohne Untertitel darf der Strich im default-Stil nicht plötzlich länger sein als der Titel.
await show({ layout: 'default', subtitle: '' });
const bare = await geometry();
check(
    'default ohne Untertitel: Strich bleibt auf Titelhöhe',
    !!bare?.rule && !!bare?.title && Math.abs(bare.rule.bottom - bare.title.bottom) <= 1,
    `Strich bis ${bare?.rule?.bottom}, Titel bis ${bare?.title?.bottom}`,
);

// ── 3. Titelausrichtung: nur der default-Stil kennt sie, dort folgt der Untertitel ─────
for (const align of ['center', 'right']) {
    await show({ layout: 'default', subtitle: SUBTITLE, titleAlign: align });
    const g = await geometry();
    check(`default/${align}: Untertitel folgt der Ausrichtung`, g?.titleAlignCss === align, `${g?.titleAlignCss}`);
    check(`default/${align}: kein Akzentstrich`, g?.rule === null);
}
// compact/minimal zeichnen den Titel immer links — ein zentrierter Untertitel darunter
// wäre nur schief, die Option greift dort nicht.
for (const layout of ['compact', 'minimal']) {
    await show({ layout, subtitle: SUBTITLE, titleAlign: 'center' });
    const g = await geometry();
    check(`${layout}: Ausrichtung wirkt nicht auf den Untertitel`, g?.titleAlignCss === 'start', `${g?.titleAlignCss}`);
}

// ── 4. Der Stil "framed" sieht aus wie ein normales Widget ────────────────────────────
// Gegen ein echtes Widget gemessen, nicht gegen feste Pixelwerte: Karte, Rahmen, Radius,
// Schatten und Innenabstand müssen identisch sein, sonst fällt der Abschnitt aus der Reihe.
const cardStyle = () =>
    page.evaluate(() => {
        const el = document.querySelector('.aura-widget');
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
            background: cs.backgroundColor,
            borderWidth: cs.borderTopWidth,
            borderColor: cs.borderTopColor,
            radius: cs.borderTopLeftRadius,
            shadow: cs.boxShadow,
            padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
            padVar: cs.getPropertyValue('--aura-widget-pad').trim(),
        };
    });

const showPlainWidget = async () => {
    await page.evaluate(() => {
        window.__auraShot.mock({ 'demo.t1': 21.5 });
        window.__auraShot.mockServerState({ 'demo.t1': 21.5 });
        window.__auraShot.showWidgets([
            {
                id: 'hdr',
                type: 'value',
                title: 'Wohnzimmer',
                datapoint: 'demo.t1',
                gridPos: { x: 0, y: 0, w: 12, h: 5 },
                options: {},
            },
        ]);
    });
    await page.waitForTimeout(300);
};

for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => window.__auraShot.setTheme(t), theme);
    await showPlainWidget();
    const plain = await cardStyle();
    await show({ layout: 'framed', subtitle: SUBTITLE, rows: 5 });
    const framed = await cardStyle();
    for (const key of ['background', 'borderWidth', 'borderColor', 'radius', 'shadow', 'padding', 'padVar']) {
        check(
            `framed/${theme}: ${key} wie ein normales Widget`,
            framed?.[key] === plain?.[key],
            `${framed?.[key]} vs ${plain?.[key]}`,
        );
    }

    // Und die anderen Stile bleiben rahmenlos.
    await show({ layout: 'default', subtitle: SUBTITLE, rows: 5 });
    const bare = await cardStyle();
    check(
        `default/${theme}: weiterhin ohne Karte`,
        bare?.borderWidth === '0px' && bare?.shadow === 'none',
        `${bare?.borderWidth} / ${bare?.shadow}`,
    );
}
await page.evaluate(() => window.__auraShot.setTheme('light'));

// ── 5. Der Strich ist ausblendbar und faerbbar ────────────────────────────────────────
// "Strich" ist je Stil ein anderes Element: der Akzentbalken (default/compact/framed)
// bzw. die Trennlinie rechts vom Titel (minimal). Ein Schalter deckt beide ab, also
// wird hier auch beides gemessen.
const ruleInfo = () =>
    page.evaluate(() => {
        const row = document.querySelector('.aura-widget-type-header .aura-widget-row');
        const el = row?.querySelector('.rounded-full') ?? row?.querySelector('.h-px');
        return { present: !!el, bg: el ? getComputedStyle(el).backgroundColor : null };
    });

for (const layout of ['default', 'compact', 'minimal', 'framed']) {
    await show({ layout, subtitle: SUBTITLE });
    const on = await ruleInfo();
    check(`${layout}: Strich ist standardmaessig da`, on.present);

    await show({ layout, subtitle: SUBTITLE, extra: { showAccent: false } });
    const off = await ruleInfo();
    check(`${layout}: Strich ausgeblendet`, !off.present);

    await show({ layout, subtitle: SUBTITLE, extra: { accentColor: '#ff0000' } });
    const col = await ruleInfo();
    check(`${layout}: Strichfarbe wirkt`, col.bg === 'rgb(255, 0, 0)', `${col.bg}`);
}

// ── 6. Textfarbe und Textgroesse ──────────────────────────────────────────────────────
const textInfo = () =>
    page.evaluate(() => {
        const w = document.querySelector('.aura-widget-type-header');
        const read = (sel) => {
            const el = w?.querySelector(sel);
            if (!el) return null;
            const cs = getComputedStyle(el);
            const b = el.getBoundingClientRect();
            return {
                color: cs.color,
                size: Math.round(parseFloat(cs.fontSize) * 10) / 10,
                height: Math.round(b.height * 10) / 10,
            };
        };
        return { title: read('.aura-widget-title'), sub: read('.aura-widget-value'), icon: read('.aura-widget-icon') };
    });

// Ohne Angabe bleibt es bei der Groesse des Stils …
const STYLE_TITLE_PX = { default: 20, framed: 20, compact: 16, minimal: 12 };
for (const [layout, expected] of Object.entries(STYLE_TITLE_PX)) {
    await show({ layout, subtitle: SUBTITLE });
    const g = await textInfo();
    check(`${layout}: Titelgroesse des Stils unveraendert`, g.title?.size === expected, `${g.title?.size}`);
    check(`${layout}: Untertitel bleibt 12 px`, g.sub?.size === 12, `${g.sub?.size}`);
}

// … und mit Angabe gilt der px-Wert, in jedem Stil, samt eigener Zeilenhoehe (sonst
// schneidet die Zeile die Unterlaengen des groesseren Textes ab).
for (const layout of ['default', 'compact', 'minimal', 'framed']) {
    await show({
        layout,
        subtitle: SUBTITLE,
        rows: 6,
        extra: { titleColor: '#ff0000', subtitleColor: '#00ff00', titleSize: 32, subtitleSize: 18 },
    });
    const g = await textInfo();
    check(`${layout}: Titelfarbe wirkt`, g.title?.color === 'rgb(255, 0, 0)', `${g.title?.color}`);
    check(`${layout}: Icon folgt der Titelfarbe`, g.icon?.color === 'rgb(255, 0, 0)', `${g.icon?.color}`);
    check(`${layout}: Untertitelfarbe wirkt`, g.sub?.color === 'rgb(0, 255, 0)', `${g.sub?.color}`);
    check(`${layout}: Titelgroesse wirkt`, g.title?.size === 32, `${g.title?.size}`);
    check(`${layout}: Untertitelgroesse wirkt`, g.sub?.size === 18, `${g.sub?.size}`);
    check(
        `${layout}: Titelzeile waechst mit der Schrift`,
        (g.title?.height ?? 0) >= 32,
        `${g.title?.height} bei 32 px Schrift`,
    );
    check(
        `${layout}: Untertitelzeile waechst mit der Schrift`,
        (g.sub?.height ?? 0) >= 18,
        `${g.sub?.height} bei 18 px Schrift`,
    );
}

// ── 7. Bindings im Untertitel ─────────────────────────────────────────────────────────
// Dieselbe Ebene wie im HTML-Widget: `{id}` fuer einen Datenpunkt, `{{ … }}` fuer einen
// Ausdruck. Ein String-Datenpunkt und eine reine Rechnung, damit kein Zahlenformat der
// Instanz das Ergebnis verschiebt.
await page.evaluate(() => {
    window.__auraShot.mock({ '0_userdata.0.Etage': 'Erdgeschoss' });
    window.__auraShot.mockServerState({ '0_userdata.0.Etage': 'Erdgeschoss' });
});

await show({ layout: 'default', subtitle: '{0_userdata.0.Etage}' });
const bound = await geometry();
check('Untertitel: {id} zeigt den Wert', bound?.subText === 'Erdgeschoss', `${bound?.subText}`);

await show({ layout: 'default', subtitle: 'Etage: {0_userdata.0.Etage} · {{ 2 * 3 }} Raeume' });
const mixed = await geometry();
check(
    'Untertitel: {{ … }} rechnet, Text bleibt stehen',
    mixed?.subText === 'Etage: Erdgeschoss · 6 Raeume',
    `${mixed?.subText}`,
);

// Die Popup-Ebene benutzt dieselben doppelten Klammern und muss unangetastet
// durchlaufen — sonst wuerde ein Popup-Untertitel im Editor leer aussehen.
await show({ layout: 'default', subtitle: '{{parent}}' });
const popupToken = await geometry();
check('Untertitel: {{parent}} bleibt der Popup-Ebene', popupToken?.subText === '{{parent}}', `${popupToken?.subText}`);

// ── 8. Der Editor: alles steht im Widget-Bereich "Abschnittstitel" ────────────────────
// Der Untertitel lag frueher oben bei Name/Typ; er gehoert in den widget-eigenen
// Einstellungsbereich, zusammen mit Strich, Farben und Groessen.
await page.evaluate(() => {
    window.__auraShot.showWidgets(
        [
            {
                id: 'hdr',
                type: 'header',
                title: 'Wohnzimmer',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 12, h: 4 },
                options: {},
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
});
const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('hdr'));

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.locator('input[placeholder="z.B. Erdgeschoss"]').waitFor({ timeout: 10000 });
// The visible fields start folded - unfold every section.
await page.evaluate(() =>
    document
        .querySelectorAll('.aura-widget-edit-modal details[data-aura-config-section]')
        .forEach((d) => (d.open = true)),
);

// Der Bereich traegt den Widget-Namen und enthaelt die Felder — nicht der Kopf des Dialogs.
const box = dlg.locator('div:has(> p:text-is("Abschnittstitel"))').last();
check(
    'der Bereich "Abschnittstitel" fuehrt den Untertitel',
    (await box.locator('input[placeholder="z.B. Erdgeschoss"]').count()) > 0,
);
check('… und den Schalter fuer den Strich', (await box.locator('span:text-is("Strich")').count()) > 0);

await dlg.locator('input[placeholder="z.B. Erdgeschoss"]').fill('Erdgeschoss');
await page.waitForTimeout(300);
check('Untertitel wird geschrieben', (await opts()).subtitle === 'Erdgeschoss', `${(await opts()).subtitle}`);

const ruleRow = dlg
    .locator('div.flex.items-center.justify-between')
    .filter({ has: page.locator('span:text-is("Strich")') })
    .first();
await ruleRow.locator('button').first().click();
await page.waitForTimeout(300);
check('Strich-Schalter schreibt showAccent=false', (await opts()).showAccent === false);
// Aus heisst auch: kein Farbfeld fuer einen Strich, der nicht gezeichnet wird.
check('ohne Strich verschwindet das Farbfeld', (await box.locator('label:text-is("Farbe")').count()) === 0);
await ruleRow.locator('button').first().click();
await page.waitForTimeout(300);
check('… und wieder an', (await opts()).showAccent === true);
check('Farbfeld ist zurueck', (await box.locator('label:text-is("Farbe")').count()) > 0);

// Die drei Farbfelder in ihrer Reihenfolge: Strich, Titel, Untertitel.
const colorInputs = box.locator('input[placeholder="auto"]');
check('drei Farbfelder', (await colorInputs.count()) === 3, `${await colorInputs.count()}`);
await colorInputs.nth(0).fill('#ff0000');
await colorInputs.nth(1).fill('#00ff00');
await colorInputs.nth(2).fill('#0000ff');
await page.waitForTimeout(300);
const afterColors = await opts();
check('Strichfarbe wird geschrieben', afterColors.accentColor === '#ff0000', `${afterColors.accentColor}`);
check('Titelfarbe wird geschrieben', afterColors.titleColor === '#00ff00', `${afterColors.titleColor}`);
check('Untertitelfarbe wird geschrieben', afterColors.subtitleColor === '#0000ff', `${afterColors.subtitleColor}`);

const sizeInputs = box.locator('input[type="number"]');
check('zwei Groessenfelder', (await sizeInputs.count()) === 2, `${await sizeInputs.count()}`);
await sizeInputs.nth(0).fill('28');
await sizeInputs.nth(1).fill('16');
await page.waitForTimeout(300);
const afterSizes = await opts();
check('Titelgroesse wird geschrieben', afterSizes.titleSize === 28, `${afterSizes.titleSize}`);
check('Untertitelgroesse wird geschrieben', afterSizes.subtitleSize === 16, `${afterSizes.subtitleSize}`);

// Der Untertitel steht nicht mehr oben beim Typ: genau ein Feld dafuer im Dialog.
check(
    'der Untertitel steht nur noch an einer Stelle',
    (await dlg.locator('input[placeholder="z.B. Erdgeschoss"]').count()) === 1,
);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
if (failed.length) {
    console.log('\nFehlgeschlagen:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    process.exit(1);
}
