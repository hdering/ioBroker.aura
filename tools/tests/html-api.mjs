// Verifies the HTML widget's write API in the running frontend (issue #649) — the
// part the pure test (html-bridge.mjs) cannot see: does a click inside the sandboxed
// frame actually reach ioBroker, and does it still work when the sandbox forbids
// same-origin access?
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/html-api.mjs
//
// Writes are read back through the screenshot harness' write log, so nothing is sent
// to a real instance.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 30000 });

const mock = (map) => page.evaluate((m) => window.__auraShot.mock(m), map);
const show = async (widgets) => {
    await page.evaluate((w) => window.__auraShot.showWidgets(w), widgets);
    await page.waitForTimeout(900);
};
const armWrites = () => page.evaluate(() => window.__auraShot.writes(true));
const writes = () => page.evaluate(() => window.__auraShot.writes());
const frame = (id) => page.frameLocator(`.aura-widget-${id} iframe`);

const STATES = {
    '0_userdata.0.Licht': false,
    '0_userdata.0.Dimmer': 40,
    '0_userdata.0.Temperatur': 21.4,
};
await mock(STATES);
// mock() only seeds the local cache; a round trip (toggle on a datapoint nobody
// subscribed, getState) asks the server, so it needs an answer too.
await page.evaluate((m) => window.__auraShot.mockServerState(m), STATES);

const CONTENT = [
    '<button id="on" onclick="aura.setState(\'0_userdata.0.Licht\', true)">An</button>',
    '<button id="tgl" onclick="aura.toggle(\'0_userdata.0.Licht\')">Um</button>',
    '<button id="dim" onclick="aura.setState(\'0_userdata.0.Dimmer\', 75)">75</button>',
    '<button id="bad" onclick="aura.setState(\'kaputt/id\', 1).catch(function (e) { document.title = e.message; })">X</button>',
    '<span id="live">–</span>',
    '<script>aura.subscribe("0_userdata.0.Temperatur", function (v) { document.getElementById("live").textContent = String(v); });</script>',
].join('\n');

const widget = (id, options) => ({
    id,
    type: 'html',
    title: 'API',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 14, h: 10 },
    options: { htmlContent: CONTENT, showTitle: true, ...options },
});

// ── default: standard sandbox ─────────────────────────────────────────────────

await show([widget('api-std', {})]);
await armWrites();

await frame('api-std').locator('#on').click();
await page.waitForTimeout(400);
let log = await writes();
check(
    'setState reaches ioBroker',
    log.some((w) => w.id === '0_userdata.0.Licht' && w.val === true),
    JSON.stringify(log),
);

await armWrites();
await frame('api-std').locator('#dim').click();
await page.waitForTimeout(400);
log = await writes();
check(
    'numbers stay numbers',
    log.some((w) => w.id === '0_userdata.0.Dimmer' && w.val === 75),
    JSON.stringify(log),
);

// Toggle reads before it writes, so both directions are worth one click each. The
// value is pinned in cache AND on the server first: a datapoint nobody subscribed
// goes stale after a few seconds and is then re-fetched, and both answers have to
// say the same thing for the check to mean anything.
for (const [now, want] of [
    [true, false],
    [false, true],
]) {
    await mock({ '0_userdata.0.Licht': now });
    await page.evaluate((v) => window.__auraShot.mockServerState({ '0_userdata.0.Licht': v }), now);
    await armWrites();
    await frame('api-std').locator('#tgl').click();
    await page.waitForTimeout(600);
    log = await writes();
    check(
        `toggle turns ${now} into ${want}`,
        log.some((w) => w.id === '0_userdata.0.Licht' && w.val === want),
        JSON.stringify(log),
    );
}
await page.evaluate((m) => window.__auraShot.mockServerState(m), STATES);

// A live subscription — the point of it is that the frame is NOT rebuilt, so the
// span must fill without the document reloading.
check('subscribe delivered the current value', (await frame('api-std').locator('#live').textContent()) === '21.4');
await mock({ '0_userdata.0.Temperatur': 23.8 });
await page.waitForTimeout(600);
check(
    'subscribe follows a change',
    (await frame('api-std').locator('#live').textContent()) === '23.8',
    await frame('api-std').locator('#live').textContent(),
);

// An id the socket layer would choke on is rejected with an error, not swallowed.
await armWrites();
await frame('api-std').locator('#bad').click();
await page.waitForTimeout(400);
log = await writes();
check('invalid id writes nothing', log.length === 0, JSON.stringify(log));
check(
    'invalid id rejects the promise',
    (await frame('api-std')
        .locator('body')
        .evaluate(() => document.title)) === 'invalid datapoint id',
);

// ── minimal sandbox: no same-origin, so only postMessage can work ─────────────

await show([widget('api-min', { sandboxPreset: 'minimal' })]);
await armWrites();
await frame('api-min').locator('#on').click();
await page.waitForTimeout(400);
log = await writes();
check(
    'works without allow-same-origin',
    log.some((w) => w.id === '0_userdata.0.Licht' && w.val === true),
    JSON.stringify(log),
);

// ── switched off ──────────────────────────────────────────────────────────────

await show([widget('api-off', { htmlApi: false })]);
const srcdoc = await page.evaluate(
    () => document.querySelector('.aura-widget-api-off iframe')?.getAttribute('srcdoc') ?? '',
);
check('option off: no api in the document', !srcdoc.includes('aura:call'), srcdoc.slice(0, 120));
check('option off: the markup is still there', srcdoc.includes('id="on"'), srcdoc.slice(0, 120));

await armWrites();
await frame('api-off').locator('#on').click();
await page.waitForTimeout(400);
log = await writes();
check('option off: a click writes nothing', log.length === 0, JSON.stringify(log));

// A sandbox without scripts cannot run the API either — and must not pretend to.
await show([widget('api-nojs', { sandboxPreset: 'custom', sandboxCustom: 'allow-forms' })]);
const nojs = await page.evaluate(
    () => document.querySelector('.aura-widget-api-nojs iframe')?.getAttribute('srcdoc') ?? '',
);
check('sandbox without scripts: no api injected', !nojs.includes('aura:call'), nojs.slice(0, 120));

// ── the frame may not be the only one heard ──────────────────────────────────
// A foreign frame on the page must not be able to use the channel.

const stolen = await page.evaluate(async () => {
    const f = document.createElement('iframe');
    f.srcdoc =
        "<script>parent.postMessage({source:'aura:call',id:1,method:'setState',args:['0_userdata.0.Fremd',1]},'*');<" +
        '/script>';
    document.body.appendChild(f);
    await new Promise((r) => setTimeout(r, 500));
    f.remove();
    return window.__auraShot.writes();
});
check('a foreign frame is ignored', !stolen.some((w) => w.id === '0_userdata.0.Fremd'), JSON.stringify(stolen));

// ── the editor side ───────────────────────────────────────────────────────────
// The API is only useful if it is findable: a toggle to turn it off and snippets
// that write themselves into the content.

await page.evaluate(() => {
    window.__auraShot.showWidgets(
        [
            {
                id: 'api-cfg',
                type: 'html',
                title: 'HTML',
                datapoint: '',
                gridPos: { x: 0, y: 0, w: 8, h: 6 },
                options: { htmlContent: '<b>x</b>' },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
});
await page.waitForTimeout(600);
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.waitForTimeout(800);

const options = () => page.evaluate(() => window.__auraShot.widgetOptions('api-cfg'));
check('panel offers the switch', (await page.getByText('Datenpunkte schreiben erlauben').count()) === 1);

await page.getByText('Beispiele zum Einfügen').click();
await page.waitForTimeout(400);
const snippets = page.locator('button:text-is("Einfügen")');
check('panel offers examples', (await snippets.count()) >= 4, String(await snippets.count()));

await snippets.first().click();
await page.waitForTimeout(500);
const content = (await options()).htmlContent;
check('an example lands in the content', content.includes('aura.setState('), JSON.stringify(content));
check('the example is appended, not substituted', content.startsWith('<b>x</b>'), JSON.stringify(content));

// The label is text next to the switch, not a <label for>, exactly like the
// "Scrollen erlauben" row above it — so the switch itself is what gets clicked.
await page.locator('div:has(> label:text-is("Datenpunkte schreiben erlauben")) > button').click();
await page.waitForTimeout(400);
check('the switch writes htmlApi', (await options()).htmlApi === false, JSON.stringify(await options()));

// ── summary ───────────────────────────────────────────────────────────────────

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
