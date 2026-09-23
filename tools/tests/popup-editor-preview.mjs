// Popup-view editor: charts preview a real datapoint instead of sample curves.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/popup-editor-preview.mjs
//
// Why: the editor rendered every {{dp}} unresolved, so a chart in a popup view always
// showed a made-up curve with a "Vorschau" badge — which read like real data. The editor
// now resolves the placeholders for the rendered copy against a widget that opens the
// view (default: the first one found) or a hand-picked datapoint. Asserted:
//
//   1. the trigger widget is offered and preselected — no sample badge on either chart;
//   2. the rendered chart points at the trigger's datapoint (it is asked for over the socket);
//   3. "Beispieldaten" brings the sample curve back;
//   4. the stored view keeps its {{dp}} placeholders throughout.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const VIEW_ID = 'pv-preview-test';
const DP = 'demo.previewTemp';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const view = {
    id: VIEW_ID,
    name: 'Vorschau-Test',
    widgets: [
        {
            id: 'pw-chart',
            type: 'chart',
            title: 'Verlauf {{name}}',
            datapoint: '{{dp}}',
            gridPos: { x: 0, y: 0, w: 6, h: 4 },
            options: {},
        },
        {
            id: 'pw-echart',
            type: 'echart',
            title: 'Erweitert',
            datapoint: '',
            gridPos: { x: 6, y: 0, w: 6, h: 4 },
            options: { echartSeries: [{ id: 's1', datapointId: '{{dp}}', name: 'Wert' }] },
        },
    ],
};

const trigger = {
    id: 'w-trigger',
    type: 'value',
    title: 'Temperatur',
    datapoint: DP,
    gridPos: { x: 0, y: 0, w: 2, h: 2 },
    options: { clickAction: { kind: 'popup-view', viewId: VIEW_ID } },
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
// Whether anything is asked about the trigger's datapoint (object lookup for the
// history adapter, history itself) — proof the chart points at it, not at {{dp}}.
let askedForDp = false;
page.on('websocket', (ws) =>
    ws.on('framesent', (f) => {
        if (typeof f.payload === 'string' && f.payload.includes(DP)) askedForDp = true;
    }),
);

// The admin area needs a session; the dev server takes any. It is read at boot, so
// the editor route is loaded fresh afterwards and seeded there.
await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() =>
    localStorage.setItem('aura-auth', JSON.stringify({ state: { sessionActive: true }, version: 0 })),
);
await page.goto('about:blank');
await page.goto(`${BASE}/?shot=1#/admin/popups/${VIEW_ID}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });
await page.waitForTimeout(700);
await page.evaluate(
    ([t, v, dp]) => {
        window.__auraShot.mock({ [dp]: { val: 21.5, unit: '°C' } });
        window.__auraShot.showWidgets([t]);
        window.__auraShot.popupViews([v]);
    },
    [trigger, view, DP],
);
await page.waitForTimeout(1500);
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

const select = page.locator('select').filter({ hasText: 'Beispieldaten' });
check('Vorschau-Auswahl vorhanden', (await select.count()) === 1);
const selected = await select.evaluate((el) => el.options[el.selectedIndex]?.textContent ?? '');
check('auslösendes Widget ist vorausgewählt', selected.includes(DP), selected);

const badges = () => page.locator('.aura-widget span', { hasText: /^Vorschau$/ }).count();
check('keine Beispielkurve bei aufgelöstem Datenpunkt', (await badges()) === 0, `${await badges()} Badges`);
const titleText = await page.locator('.aura-widget-pw-chart').innerText();
check('Titel-Platzhalter aufgelöst', titleText.includes('Verlauf previewTemp'), titleText.split('\n')[0]);
check('Diagramm fragt den echten Datenpunkt an', askedForDp);

await select.selectOption('');
await page.waitForTimeout(800);
check('Beispieldaten zeigen wieder die Beispielkurve', (await badges()) === 2, `${await badges()} Badges`);

const stored = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem('aura-popup-config') ?? '{}')?.state?.views?.find((v) => v.id === id),
    VIEW_ID,
);
const storedDps = stored
    ? [stored.widgets[0].datapoint, stored.widgets[1].options.echartSeries[0].datapointId, stored.widgets[0].title]
    : null;
check(
    'gespeicherte View behält die Platzhalter',
    !!storedDps && storedDps[0] === '{{dp}}' && storedDps[1] === '{{dp}}' && storedDps[2].includes('{{name}}'),
    JSON.stringify(storedDps),
);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
process.exit(failed.length ? 1 : 0);
