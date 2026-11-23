// While the Aura adapter does not answer (restarting after an update, busy), the
// Statusübersicht must keep asking it — and must NOT fall back to downloading the whole
// object DB. That fallback, on every open dashboard at once, stalled a large ioBroker
// for minutes during an update (tools/tests/controller-load-repro.mjs reproduces it).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/status-overview-adapter-silent.mjs
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

await page.evaluate(() => {
    // Count every object view the page asks for, per type.
    window.__views = {};
    const counting = new Proxy(
        {},
        {
            get(_t, type) {
                if (typeof type === 'string') window.__views[type] = (window.__views[type] ?? 0) + 1;
                return [];
            },
            has: () => true,
        },
    );
    window.__auraShot.mockObjectView(counting);
    // The adapter stays silent: sendToDirect's timeout result, at once.
    window.__auraShot.mockSendTo({ statusDiscover: { __timeout: true } });
    window.__auraShot.showWidgets([
        {
            id: 'w-so-silent',
            type: 'statusoverview',
            title: 'Statusübersicht',
            datapoint: '',
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 6, h: 20 },
            options: {},
        },
    ]);
});

// First ask at once, the retry 5 s later.
await page.waitForTimeout(7000);
let s = await page.evaluate(() => ({
    views: { ...window.__views },
    asks: window.__auraShot.sendToCalls().filter((c) => c.command === 'statusDiscover').length,
    text: document.body.innerText,
}));
check('no full state view while the adapter is silent', !s.views.state, JSON.stringify(s.views));
check('no channel/device view either', !s.views.channel && !s.views.device, JSON.stringify(s.views));
check('the adapter is asked again', s.asks >= 2, `${s.asks} asks`);
check('the widget does not claim "all clear" meanwhile', !s.text.includes('Alles in Ordnung'));

// The adapter is back: the next retry (10 s after the second) gets the answer.
await page.evaluate(() => window.__auraShot.mockSendTo({ statusDiscover: { ok: true, candidates: [], devices: [] } }));
await page
    .waitForFunction(() => document.body.innerText.includes('Alles in Ordnung'), { timeout: 15000 })
    .catch(() => {});
s = await page.evaluate(() => ({ views: { ...window.__views }, text: document.body.innerText }));
check('the answer of the returning adapter is shown', s.text.includes('Alles in Ordnung'), s.text.slice(0, 200));
check('still no full state view', !s.views.state, JSON.stringify(s.views));

// An explicit refusal (permission, error) still lets the widget discover on its own.
const page2 = await ctx.newPage();
await page2.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page2.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
await page2.evaluate(() => {
    window.__views = {};
    window.__auraShot.mockObjectView(
        new Proxy(
            {},
            {
                get(_t, type) {
                    if (typeof type === 'string') window.__views[type] = (window.__views[type] ?? 0) + 1;
                    return [];
                },
                has: () => true,
            },
        ),
    );
    window.__auraShot.mockSendTo({ statusDiscover: { ok: false, error: 'boom' } });
    window.__auraShot.showWidgets([
        {
            id: 'w-so-refused',
            type: 'statusoverview',
            title: 'Statusübersicht',
            datapoint: '',
            layout: 'default',
            gridPos: { x: 0, y: 0, w: 6, h: 20 },
            options: {},
        },
    ]);
});
await page2.waitForFunction(() => (window.__views.state ?? 0) > 0, { timeout: 15000 }).catch(() => {});
const v2 = await page2.evaluate(() => ({ ...window.__views }));
check('an explicit refusal falls back to the own discovery', (v2.state ?? 0) > 0, JSON.stringify(v2));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} FAILED` : '\nall passed');
process.exit(failed.length ? 1 : 0);
