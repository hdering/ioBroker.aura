// Elemente in Header, Tableiste und Bereichs-Menü (#634) — inklusive des neuen
// Typs "widget", mit dem ein beliebiges Widget in einem Menü steht.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/menu-items.mjs
//
// Drei Dinge werden festgenagelt:
//   1. Der Header hat eine Elementliste wie die anderen beiden Chromes — vorher
//      kannte er genau einen Uhr- und einen Datenpunkt-Slot, und genau das war
//      der Grund für #634 (der eine Datenpunkt war schon vergeben).
//   2. Alte Konfigurationen ohne `headerItems` verlieren nichts: die beiden
//      Alt-Felder werden auf die Liste projiziert (deriveHeaderItems).
//   3. Ein Widget im Menü rendert wirklich als Widget — mit seinen Bedingungen
//      und ohne Karte, solange `widgetCard` nicht gesetzt ist — und eine tote
//      Referenz sagt das, statt lautlos nichts zu zeigen.
//
// Gemessen statt geschätzt: Rechtecke und berechnete Stile aus dem echten DOM.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5173';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

// One dashboard widget the menu items can point at.
const TARGET = {
    id: 'akku',
    type: 'value',
    title: 'Akku',
    datapoint: 'demo.battery',
    gridPos: { x: 0, y: 0, w: 6, h: 4 },
    options: { unit: '%', icon: 'BatteryFull' },
};

async function arrange(frontend, widgets = [TARGET]) {
    await page.evaluate(
        ([frontend, widgets]) => {
            const values = { 'demo.battery': 87, 'demo.temp': 21.5 };
            window.__auraShot.mock(values);
            // Conditions resolve their first value through getState, not the cache —
            // without this the rule never fires and the check goes green for the
            // wrong reason.
            window.__auraShot.mockServerState(values);
            window.__auraShot.showWidgets(widgets);
            window.__auraShot.setFrontend({ showHeader: true, ...frontend });
        },
        [frontend, widgets],
    );
    await page.waitForTimeout(350);
}

const headerText = () =>
    page.evaluate(() => {
        const h = document.querySelector('header.aura-header');
        return h ? (h.textContent || '').replace(/\s+/g, ' ').trim() : null;
    });

// ── 1. Mehrere Elemente im Header ────────────────────────────────────────────
// Der Kern von #634: mehr als ein Datenpunkt, und Uhr daneben.
{
    await arrange({
        headerItems: [
            { id: 'a', type: 'datapoint', position: 'right', datapointId: 'demo.battery', datapointTemplate: '{dp} %' },
            { id: 'b', type: 'datapoint', position: 'right', datapointId: 'demo.temp', datapointTemplate: '{dp} C' },
            { id: 'c', type: 'text', position: 'left', text: 'Flur' },
        ],
    });
    const txt = await headerText();
    check('zwei Datenpunkte gleichzeitig im Header', /87 %/.test(txt) && /21\.5 C/.test(txt), `Header: ${txt}`);
    check('Text-Element im Header', /Flur/.test(txt), `Header: ${txt}`);

    const order = await page.evaluate(() => {
        const h = document.querySelector('header.aura-header');
        const title = h.querySelector('.aura-titel').getBoundingClientRect();
        const flur = [...h.querySelectorAll('div')].find((d) => d.textContent.trim() === 'Flur');
        const dp = [...h.querySelectorAll('div')].find((d) => d.textContent.trim() === '87 %');
        return {
            titleRight: Math.round(title.right),
            flurLeft: flur ? Math.round(flur.getBoundingClientRect().left) : null,
            dpLeft: dp ? Math.round(dp.getBoundingClientRect().left) : null,
        };
    });
    check(
        'position=left steht direkt neben dem Titel',
        order.flurLeft !== null && order.flurLeft >= order.titleRight,
        JSON.stringify(order),
    );
    check(
        'position=right steht weiter rechts als das linke Element',
        order.dpLeft !== null && order.flurLeft !== null && order.dpLeft > order.flurLeft,
        JSON.stringify(order),
    );
}

// ── 2. Leere Liste heißt leer, nicht "Alt-Felder" ────────────────────────────
{
    await arrange({ headerItems: [], headerClockEnabled: true, headerDatapoint: 'demo.temp' });
    const txt = await headerText();
    check('eine leere Liste zeigt keine Extras', !/21\.5/.test(txt), `Header: ${txt}`);
}

// ── 3. Migration: ohne headerItems gelten die Alt-Felder weiter ──────────────
// Der Upgrade-Pfad. Vorher stand hier hart verdrahtetes Markup; wenn die
// Projektion fehlt, verliert jede bestehende Installation ihre Header-Uhr.
{
    await arrange({
        headerItems: undefined,
        headerClockEnabled: true,
        headerClockDisplay: 'time',
        headerDatapoint: 'demo.temp',
        headerDatapointTemplate: '{dp} Grad',
    });
    const txt = await headerText();
    check('Alt-Datenpunkt erscheint weiter', /21\.5 Grad/.test(txt), `Header: ${txt}`);
    check('Alt-Uhr erscheint weiter', /\d{1,2}:\d{2}/.test(txt), `Header: ${txt}`);
}

// ── 4. Ein Widget im Header ──────────────────────────────────────────────────
{
    await arrange({
        headerItems: [{ id: 'w1', type: 'widget', position: 'right', widgetId: 'akku', widgetWidth: 140 }],
    });
    const slot = await page.evaluate(() => {
        const h = document.querySelector('header.aura-header');
        const box = h?.querySelector('.aura-menu-widget');
        const frame = box?.querySelector('.aura-widget');
        if (!box || !frame) return null;
        const cs = getComputedStyle(frame);
        return {
            width: Math.round(box.getBoundingClientRect().width),
            height: Math.round(box.getBoundingClientRect().height),
            type: [...frame.classList].find((c) => c.startsWith('aura-widget-type-')),
            bg: cs.backgroundColor,
            borderWidth: cs.borderTopWidth,
            text: (frame.textContent || '').replace(/\s+/g, ' ').trim(),
        };
    });
    check('das Widget rendert im Header', !!slot, 'kein .aura-menu-widget gefunden');
    check('es ist wirklich das Ziel-Widget', slot?.type === 'aura-widget-type-value', JSON.stringify(slot?.type));
    check('es zeigt seinen Wert', /87/.test(slot?.text ?? ''), `Text: ${slot?.text}`);
    check('die konfigurierte Breite gilt', slot?.width === 140, `Breite ${slot?.width}`);
    check(
        'ohne widgetCard ist der Slot kartenlos',
        slot?.bg === 'rgba(0, 0, 0, 0)' || slot?.bg === 'transparent',
        `Hintergrund ${slot?.bg}`,
    );
}

// ── 4b. Ein Widget darf die Leiste nicht aufblasen ───────────────────────────
// Ein Widget bringt eine Dashboard-Höhe mit (ein Wert-Widget will ~90 px). Als
// normales Flex-Kind drückt es Header und Tableiste genau so weit auf — der
// Header wuchs von 57 auf 123 px. Der Slot bekommt deshalb eine feste Höhe.
{
    const bare = await (async () => {
        // showSingle: sonst blendet sich die Leiste bei einem einzigen Tab ganz aus.
        await arrange({ headerItems: [], tabBar: { showSingle: true, items: [] } });
        return page.evaluate(() => ({
            header: Math.round(document.querySelector('header.aura-header').getBoundingClientRect().height),
            tabs: Math.round(document.querySelector('.aura-tabs').getBoundingClientRect().height),
        }));
    })();
    await arrange({
        headerItems: [{ id: 'w1', type: 'widget', position: 'right', widgetId: 'akku' }],
        tabBar: { showSingle: true, items: [{ id: 't1', type: 'widget', position: 'right', widgetId: 'akku' }] },
    });
    const withW = await page.evaluate(() => {
        const box = document.querySelector('header.aura-header .aura-menu-widget');
        const tabBox = document.querySelector('.aura-tabs .aura-menu-widget');
        return {
            header: Math.round(document.querySelector('header.aura-header').getBoundingClientRect().height),
            tabs: Math.round(document.querySelector('.aura-tabs').getBoundingClientRect().height),
            slot: box ? Math.round(box.getBoundingClientRect().height) : null,
            tabSlot: tabBox ? Math.round(tabBox.getBoundingClientRect().height) : null,
        };
    });
    check(
        'der Header wächst höchstens um ein paar Pixel',
        withW.header - bare.header <= 12,
        `ohne ${bare.header}, mit ${withW.header}`,
    );
    check(
        'die Tableiste wächst höchstens um ein paar Pixel',
        withW.tabs - bare.tabs <= 12,
        `ohne ${bare.tabs}, mit ${withW.tabs}`,
    );
    check('der Slot hat die Standard-Leistenhöhe', withW.slot === 32, `Höhe ${withW.slot}`);
    check('auch in der Tableiste', withW.tabSlot === 32, `Höhe ${withW.tabSlot}`);
}

// ── 5. Mit Karte ─────────────────────────────────────────────────────────────
{
    await arrange({
        headerItems: [
            { id: 'w1', type: 'widget', position: 'right', widgetId: 'akku', widgetWidth: 140, widgetCard: true },
        ],
    });
    const bg = await page.evaluate(() => {
        const frame = document.querySelector('header.aura-header .aura-menu-widget .aura-widget');
        return frame ? getComputedStyle(frame).backgroundColor : null;
    });
    check('widgetCard zeichnet den Karten-Hintergrund', bg !== 'rgba(0, 0, 0, 0)' && bg !== null, `Hintergrund ${bg}`);
}

// ── 6. Die Karten-Unterdrückung darf das Quell-Widget nicht anfassen ─────────
// Ein kartenloser Slot setzt `transparent` nur auf der gerenderten Kopie; würde
// er es zurückschreiben, verschwände die Karte auch auf dem Dashboard.
{
    await arrange({
        headerItems: [{ id: 'w1', type: 'widget', position: 'right', widgetId: 'akku' }],
    });
    const opts = await page.evaluate(() => window.__auraShot.widgetOptions('akku'));
    check('das Quell-Widget bleibt undurchsichtig', !opts?.transparent, JSON.stringify(opts));
}

// ── 7. Tote Referenz ─────────────────────────────────────────────────────────
{
    await arrange({
        headerItems: [{ id: 'w1', type: 'widget', position: 'right', widgetId: 'gibtesnicht' }],
    });
    const txt = await headerText();
    check('eine tote Referenz nennt die gesuchte ID', /gibtesnicht/.test(txt ?? ''), `Header: ${txt}`);
}

// ── 8. Dasselbe Element in der Tableiste ─────────────────────────────────────
{
    await arrange({
        headerItems: [],
        tabBar: {
            items: [{ id: 't1', type: 'widget', position: 'right', widgetId: 'akku', widgetWidth: 120 }],
        },
    });
    const slot = await page.evaluate(() => {
        const bar = document.querySelector('.aura-tabs');
        const box = bar?.querySelector('.aura-menu-widget');
        if (!box) return null;
        const r = box.getBoundingClientRect();
        const barR = bar.getBoundingClientRect();
        return {
            width: Math.round(r.width),
            insideBar: r.top >= barR.top - 1 && r.bottom <= barR.bottom + 1,
            text: (box.textContent || '').replace(/\s+/g, ' ').trim(),
        };
    });
    check('das Widget rendert in der Tableiste', !!slot, 'kein .aura-menu-widget in .aura-tabs');
    check('es bleibt in der Leiste', slot?.insideBar === true, JSON.stringify(slot));
    check('es zeigt seinen Wert', /87/.test(slot?.text ?? ''), `Text: ${slot?.text}`);
}

// ── 9. Dasselbe Element im Bereichs-Menü (Balken-Variante) ───────────────────
{
    await arrange({
        headerItems: [],
        tabBar: {},
        layoutDrawerEnabled: true,
        layoutDrawerPlacement: 'top',
        layoutDrawerShowSingle: true,
        layoutDrawerItems: [{ id: 'd1', type: 'widget', position: 'top', widgetId: 'akku', widgetWidth: 110 }],
    });
    const slot = await page.evaluate(() => {
        const bar = document.querySelector('.aura-section-bar');
        const box = bar?.querySelector('.aura-menu-widget');
        if (!box) return null;
        return {
            width: Math.round(box.getBoundingClientRect().width),
            text: (box.textContent || '').replace(/\s+/g, ' ').trim(),
        };
    });
    check('das Widget rendert im Bereichs-Balken', !!slot, 'kein .aura-menu-widget in .aura-section-bar');
    check('die konfigurierte Breite gilt auch dort', slot?.width === 110, `Breite ${slot?.width}`);
}

// ── 10. Ein Element mit eigener Widget-Instanz braucht kein Dashboard-Widget ─
{
    await arrange(
        {
            headerItems: [
                {
                    id: 'w1',
                    type: 'widget',
                    position: 'right',
                    widgetWidth: 150,
                    widget: {
                        id: 'eigen',
                        type: 'value',
                        title: '',
                        datapoint: 'demo.temp',
                        gridPos: { x: 0, y: 0, w: 3, h: 2 },
                        options: { unit: '°C', showTitle: false },
                    },
                },
            ],
        },
        [],
    );
    const txt = await page.evaluate(() => {
        const box = document.querySelector('header.aura-header .aura-menu-widget');
        return box ? (box.textContent || '').replace(/\s+/g, ' ').trim() : null;
    });
    check('eine item-eigene Instanz rendert ohne Dashboard-Widget', /21\.5/.test(txt ?? ''), `Slot: ${txt}`);
}

// ── 11. Bedingungen gelten wie auf dem Dashboard ─────────────────────────────
// Der Grund, warum der Slot durch WidgetFrame rendert und nicht bar über die
// Widget-Map: sonst wären Bedingungen, Badges und Klick-Aktionen im Menü tot.
{
    await arrange(
        {
            headerItems: [{ id: 'w1', type: 'widget', position: 'right', widgetId: 'versteckt', widgetWidth: 120 }],
        },
        [
            {
                ...TARGET,
                id: 'versteckt',
                options: {
                    ...TARGET.options,
                    conditions: [
                        {
                            id: 'c1',
                            logic: 'AND',
                            clauses: [{ datapoint: 'demo.battery', operator: '>', value: '50' }],
                            style: {},
                            hideWidget: true,
                            visibilityMode: 'hideOnMatch',
                        },
                    ],
                },
            },
        ],
    );
    const vis = await page.evaluate(() => {
        const frame = document.querySelector('header.aura-header .aura-menu-widget .aura-widget');
        return frame ? getComputedStyle(frame).visibility : null;
    });
    check('eine "verstecken"-Bedingung greift auch im Menü', vis === 'hidden', `visibility: ${vis}`);
}

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
