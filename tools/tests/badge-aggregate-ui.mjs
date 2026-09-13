// Die Aggregat-Anzahl eines Tabs, im laufenden Frontend gezählt.
//
//   npm run dev            (oder AURA_BASE setzen)
//   node tools/tests/badge-aggregate-ui.mjs
//
// Die Rechnung selbst prüft tools/tests/badge-aggregate.mjs (rein, ohne Browser).
// Hier geht es um die Verdrahtung, die dort niemand sieht: dass der Modus vom Tab
// bis zum Hook durchgereicht wird, dass die Marker-Datenpunkte auch dann abonniert
// werden, wenn der Tab gar nicht aktiv ist, und dass eine Null keinen leeren
// Marker stehen lässt.
//
// Dashboard und Werte kommen aus dem Screenshot-Harness — keine echte
// Konfiguration, kein Datenpunkt wird angefasst.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const VALUES = {
    'demo.alarm': true, // eine erfüllte Bedingung
    'demo.ruhe': false, // eine nicht erfüllte
    'demo.offen': 2,
    'demo.zahl': 3.5,
};

let wn = 0;
const widget = (badges) => ({
    id: `w-agg-${++wn}`,
    type: 'info',
    title: `W${wn}`,
    datapoint: '',
    layout: 'default',
    gridPos: { x: 0, y: 0, w: 10, h: 6 },
    options: { showTitle: true, badges },
});

let bn = 0;
const badge = (b) => ({ id: `ab${++bn}`, style: 'dot', corner: 'top-right', visibility: 'always', ...b });
const text = (extra = {}) => badge({ style: 'label', label: 'Info', ...extra });
const cond = (dp) => badge({ visibility: 'condition', clauses: [{ datapoint: dp, operator: 'active', value: '' }] });
const count = (dp, extra = {}) => badge({ style: 'count', dp, ...extra });

const tab = (id, name, slug, aggregate, widgets) => ({ id, name, slug, badgeAggregate: aggregate, widgets });

const LAYOUT = {
    id: 'l-agg',
    name: 'Aggregat',
    slug: 'aggregat',
    activeSectionId: 'sec-agg',
    sections: [
        {
            id: 'sec-agg',
            name: 'Aggregat',
            slug: 'agg',
            activeTabId: 't-legacy',
            tabs: [
                // Ohne Modus = der gespeicherte Stand: jedes Widget mit Marker zählt.
                tab('t-legacy', 'Alt', 'alt', { enabled: true }, [widget([text()]), widget([cond('demo.alarm')])]),
                // Derselbe Aufbau, aber nur Marker mit Bedingung zählen.
                tab('t-cond', 'Bedingt', 'bedingt', { enabled: true, mode: 'conditional' }, [
                    widget([text()]),
                    widget([cond('demo.alarm')]),
                    widget([cond('demo.ruhe')]),
                ]),
                // Summe: Freitext und Punkt tragen nichts bei.
                tab('t-sum', 'Summe', 'summe', { enabled: true, mode: 'sum' }, [
                    widget([count('demo.offen')]),
                    widget([count('demo.zahl')]),
                    widget([text()]),
                ]),
                // Ein einzelner Marker, der nicht mitzählen soll — die Anzahl bleibt
                // bei 0, und eine 0 zeigt gar keinen Marker.
                tab('t-off', 'Aus', 'aus', { enabled: true, mode: 'sum' }, [
                    widget([count('demo.offen', { countInAggregate: false })]),
                ]),
                // Gegenprobe: Schalter aus, obwohl Marker da sind.
                tab('t-plain', 'Ohne', 'ohne', undefined, [widget([cond('demo.alarm')])]),
            ],
        },
    ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
// mock() allein wird beim Remount aus getState überschrieben — mockServerState
// beantwortet die erste Runde für die erfundenen Ids.
await page.evaluate((vals) => {
    window.__auraShot.mock(vals);
    window.__auraShot.mockServerState(vals);
}, VALUES);
await page.evaluate((layout) => window.__auraShot.seed({ layouts: [layout] }), LAYOUT);
await page.evaluate(() => {
    window.location.hash = '#/view/aggregat/s/agg/tab/alt';
});
await page.waitForTimeout(900);

/** Der Aggregat-Marker am Reiter mit diesem Namen ('' = kein Marker).
 *  Der Reiter ist ein div, kein button — deshalb über den Namen im span. */
const tabBadge = (name) =>
    page.evaluate((n) => {
        const tab = [...document.querySelectorAll('.aura-tabs .group')].find(
            (el) => el.querySelector('span')?.textContent?.trim() === n,
        );
        if (!tab) return '__kein Reiter__';
        return tab.querySelector('.aura-badge-corner')?.textContent?.trim() ?? '';
    }, name);

check('die Tableiste rendert', (await page.locator('.aura-tabs').count()) === 1);

eq('ohne Modus zählen beide Widgets', await tabBadge('Alt'), '2');
eq('nur Marker mit Bedingung: der Freitext fällt raus', await tabBadge('Bedingt'), '1');
eq('Summe der Anzahl-Marker', await tabBadge('Summe'), '5.5');
eq('ausgeschlossener Marker: kein Aggregat', await tabBadge('Aus'), '');
eq('Schalter aus: kein Aggregat', await tabBadge('Ohne'), '');

// Live: der bedingte Marker geht aus, die Zahl muss folgen — auch auf Reitern,
// die gerade nicht offen sind.
await page.evaluate(() => window.__auraShot.mock({ 'demo.alarm': false }));
await page.waitForTimeout(400);
eq('erfüllte Bedingung fällt weg (alt)', await tabBadge('Alt'), '1');
eq('erfüllte Bedingung fällt weg (bedingt)', await tabBadge('Bedingt'), '');

await page.evaluate(() => window.__auraShot.mock({ 'demo.zahl': 10 }));
await page.waitForTimeout(400);
eq('die Summe folgt dem Wert', await tabBadge('Summe'), '12');

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length} checks, ${failed.length} failed`);
if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.name} — ${f.detail}`);
    process.exit(1);
}
