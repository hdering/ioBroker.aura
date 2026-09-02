// Verifies the datapoint bindings in a marker's label text: the plain
// `{0_userdata.0.X}` token, `{dp}` for the widget's own datapoint, the operation
// chain, the `{{ … }}` expression — and that the marker follows the value live.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/badge-label-bindings.mjs
//
// Runs against the real app rather than the pure util (utils/badgeLabel), because
// the part that can break is the wiring: useBadges resolves the label through a
// SECOND subscription set (useTemplateStates), and a label whose datapoint nobody
// else subscribes to stays a raw '{id}' on screen if that set is not collected.
//
// Uses the screenshot harness (__auraShot) so the values live in the in-memory
// cache only — no socket write, no real datapoint is touched. mockServerState
// answers the initial getState round-trip for the fictional ids.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

// Global defaults: decimals 2, number format 'plain'.
const VALUES = {
    'demo.pool.maxrun': 12, // an integer must not become '12.00'
    'demo.pool.temp': 21.456,
    'demo.netz': -1234.6,
    'demo.pumpe': true,
};

/** One value widget with the given marker, and the marker's rendered text. */
async function badgeText(badge, { datapoint = '', values = VALUES } = {}) {
    await page.evaluate(
        ([b, dp, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([
                {
                    id: 'w-badge',
                    type: 'value',
                    title: 'Marker',
                    datapoint: dp,
                    gridPos: { x: 0, y: 0, w: 8, h: 5 },
                    options: { badges: [{ id: 'b1', corner: 'top-right', ...b }] },
                },
            ]);
        },
        [badge, datapoint, values],
    );
    await page.waitForTimeout(350);
    return page.evaluate(() => {
        const el = document.querySelector('.aura-badge-corner');
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : 'NO BADGE';
    });
}

const label = (text) => ({ style: 'label', label: text });

// ── 1. A datapoint in the text shows its value ────────────────────────────────
// The case this was built for: a runtime next to the widget, without a widget.
eq('a plain datapoint token is replaced', await badgeText(label('{demo.pool.maxrun} min')), '12 min');
eq('the global decimals are a maximum, not a fixed width', await badgeText(label('{demo.pool.temp} °C')), '21.46 °C');
eq('two tokens in one label', await badgeText(label('{demo.pool.maxrun}/{demo.pool.temp}')), '12/21.46');
eq('a boolean reads as its raw value', await badgeText(label('{demo.pumpe}')), 'true');

// ── 2. {dp} is the widget's own datapoint ─────────────────────────────────────
eq('{dp} resolves the main datapoint', await badgeText(label('{dp} °C'), { datapoint: 'demo.pool.temp' }), '21.46 °C');
eq('{dp} without a main datapoint stays verbatim', await badgeText(label('{dp} °C')), '{dp} °C');

// ── 3. The calculating forms ──────────────────────────────────────────────────
eq('an operation chain runs', await badgeText(label('{demo.netz;round(0)} W')), '-1235 W');
eq('an expression runs', await badgeText(label('{{ demo.pool.maxrun * 2 }} min')), '24 min');

// ── 4. What must NOT be touched ───────────────────────────────────────────────
eq('a label without a token is untouched', await badgeText(label('Achtung')), 'Achtung');
eq('an unknown variable stays visible', await badgeText(label('{unbekannt} min')), '{unbekannt} min');
eq('braces with whitespace are no token', await badgeText(label('{ 1 } min')), '{ 1 } min');
eq('a datapoint with no value reads as a dash', await badgeText(label('{demo.fehlt.wert} min')), '– min');
eq('the count style is unaffected', await badgeText({ style: 'count', dp: 'demo.pool.maxrun' }), '12');

// ── 5. The marker follows the value ───────────────────────────────────────────
// The subscription, not the first paint: a badge that renders once and then sits
// on a stale number is the failure this catches.
await badgeText(label('{demo.pool.maxrun} min'));
await page.evaluate(() => window.__auraShot.mock({ 'demo.pool.maxrun': 7 }));
await page.waitForTimeout(350);
eq(
    'a new value updates the marker',
    await page.evaluate(() => document.querySelector('.aura-badge-corner')?.innerText.trim()),
    '7 min',
);

// ── 6. A tab marker has no own datapoint, but takes ids ───────────────────────
// Tabs and sections pass no source context, so `{dp}` cannot resolve there —
// an explicit id still has to.
await page.evaluate(
    ([vals]) => {
        window.__auraShot.mock(vals);
        window.__auraShot.mockServerState(vals);
        window.__auraShot.seed({
            layouts: [
                {
                    id: 'l-badge',
                    name: 'Marker',
                    slug: 'marker',
                    activeSectionId: 's1',
                    sections: [
                        {
                            id: 's1',
                            name: 'Bereich',
                            slug: 'bereich',
                            activeTabId: 't1',
                            tabs: [
                                {
                                    id: 't1',
                                    name: 'Pool',
                                    slug: 'pool',
                                    widgets: [],
                                    badges: [
                                        {
                                            id: 'tb1',
                                            style: 'label',
                                            corner: 'top-right',
                                            label: '{demo.pool.maxrun} min',
                                        },
                                    ],
                                },
                                { id: 't2', name: 'Garten', slug: 'garten', widgets: [] },
                            ],
                        },
                    ],
                },
            ],
        });
    },
    [VALUES],
);
await page.waitForTimeout(400);
eq(
    'a tab marker resolves an explicit datapoint',
    await page.evaluate(() => {
        const el = document.querySelector('.aura-tab-bar .aura-badge-corner, .aura-badge-corner');
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : 'NO BADGE';
    }),
    '12 min',
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\nbadge-label-bindings: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
