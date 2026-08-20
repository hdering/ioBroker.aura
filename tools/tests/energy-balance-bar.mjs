// Verifies the stacked bar of the Energiebilanz widget fills its full height (issue #560).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/energy-balance-bar.mjs
//
// The bar sizes its segments with flex-grow. CSS only distributes `sum(flex-grow)` of the
// free space while that sum stays below 1, so a bar fed with small kWh readings
// (0.01 + 0.04 + 0.02) used to collapse to 7 % of its height — segments a few pixels tall,
// their percentages clipped away. Checked here: segment heights add up to the bar height
// for small AND large totals, the shares stay proportional, and every share above the
// label threshold prints its percentage.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

// Every case gets its own datapoint ids so a previous case's mocked value can never bleed
// into the next render.
const ENTRY_DEFS = [
    { key: 'feed', label: 'Einspeisung', color: '#22c55e', icon: 'mdi:transmission-tower-import' },
    { key: 'bat', label: 'Speicher laden', color: '#3b82f6', icon: 'mdi:battery-arrow-down' },
    { key: 'home', label: 'Hausverbrauch', color: '#f59e0b', icon: 'mdi:home-import-outline' },
];

/** One bar with `aggregate: 'last'` entries, i.e. values read straight from the state. */
function makeCase(caseKey, values) {
    const entries = ENTRY_DEFS.slice(0, values.length).map((d) => ({
        id: `${caseKey}-${d.key}`,
        datapointId: `demo.eb.${caseKey}.${d.key}`,
        label: d.label,
        color: d.color,
        icon: d.icon,
        aggregate: 'last',
    }));
    const mocks = Object.fromEntries(entries.map((e, i) => [e.datapointId, values[i]]));
    const widget = {
        id: `w-energy-${caseKey}`,
        type: 'energiebilanz',
        title: 'Energiebilanz',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 6, h: 14 },
        options: {
            unit: 'kWh',
            decimals: 2,
            lockRange: true,
            range: '24h',
            legendFormat: 'icon-value',
            bars: [{ id: `bar-${caseKey}`, title: 'Produktion', legendSide: 'left', entries }],
        },
    };
    return { widget, mocks };
}

/** Renders one case and reports the bar box plus every segment box. */
async function render(caseKey, values) {
    const { widget, mocks } = makeCase(caseKey, values);
    await page.evaluate(
        ([widgetCfg, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([widgetCfg]);
        },
        [widget, mocks],
    );
    // The values arrive via getState, so wait for the laid-out bar rather than the mount:
    // "stack" once a segment has height, "empty" for the all-zero placeholder.
    try {
        await page.waitForFunction(
            () =>
                document.querySelector('[data-aura-energy-bar="empty"]') ||
                [...document.querySelectorAll('[data-aura-energy-segment]')].some(
                    (el) => el.getBoundingClientRect().height > 1,
                ),
            { timeout: 15000 },
        );
    } catch {
        /* fall through — the measurements below report the empty render */
    }
    await page.waitForTimeout(300);
    const out = await page.evaluate(() => {
        const bar = document.querySelector('[data-aura-energy-bar]');
        return {
            kind: bar ? bar.getAttribute('data-aura-energy-bar') : null,
            barHeight: bar ? bar.getBoundingClientRect().height : 0,
            segs: [...document.querySelectorAll('[data-aura-energy-segment]')].map((el) => ({
                id: el.getAttribute('data-aura-energy-segment'),
                height: el.getBoundingClientRect().height,
                text: el.textContent.trim(),
            })),
        };
    });
    out.filled = out.segs.reduce((a, s) => a + s.height, 0);
    out.share = (id) => (out.segs.find((s) => s.id === id)?.height ?? 0) / (out.filled || 1);
    out.dump = () => out.segs.map((s) => `${s.id}=${((s.height / (out.filled || 1)) * 100).toFixed(0)}%`).join(' ');
    out.id = (key) => `${caseKey}-${key}`;
    return out;
}

// ── 1. The reported case: fractional kWh values summing well below 1 ─────────
{
    const r = await render('small', [0.01, 0.04, 0.02]);
    check('bar renders three segments', r.segs.length === 3, `got ${r.segs.length}`);
    check('bar is tall enough to measure', r.barHeight > 80, `${Math.round(r.barHeight)}px`);
    check(
        'segments fill the whole bar although the values sum to 0.07',
        Math.abs(r.filled - r.barHeight) < 2,
        `${r.filled.toFixed(1)}px of ${r.barHeight.toFixed(1)}px`,
    );
    check(
        'shares stay proportional (1 : 4 : 2)',
        Math.abs(r.share(r.id('feed')) - 1 / 7) < 0.02 &&
            Math.abs(r.share(r.id('bat')) - 4 / 7) < 0.02 &&
            Math.abs(r.share(r.id('home')) - 2 / 7) < 0.02,
        r.dump(),
    );
    check(
        'every segment prints its percentage',
        r.segs.length === 3 && r.segs.every((s) => /%/.test(s.text)),
        r.segs.map((s) => `${s.id}:"${s.text}"`).join(' '),
    );
}

// ── 2. Values above 1 kept working before and still do ───────────────────────
{
    const r = await render('large', [11.11, 6.51, 10.36]);
    check(
        'large values fill the bar',
        Math.abs(r.filled - r.barHeight) < 2,
        `${r.filled.toFixed(1)}px of ${r.barHeight.toFixed(1)}px`,
    );
    check(
        'large-value shares are proportional',
        Math.abs(r.share(r.id('feed')) - 11.11 / 27.98) < 0.02 && Math.abs(r.share(r.id('bat')) - 6.51 / 27.98) < 0.02,
        r.dump(),
    );
}

// ── 3. A single tiny reading still paints a full bar ─────────────────────────
{
    const r = await render('one', [0.003]);
    check(
        'a lone 0.003 kWh segment fills the bar',
        r.segs.length === 1 && Math.abs(r.filled - r.barHeight) < 2,
        `${r.segs.length} seg, ${r.filled.toFixed(1)}px of ${r.barHeight.toFixed(1)}px`,
    );
}

// ── 4. Mixed magnitudes: a share below the label threshold has no percentage ─
{
    const r = await render('mixed', [0.001, 0.4, 0.2]);
    check(
        'mixed magnitudes fill the bar',
        Math.abs(r.filled - r.barHeight) < 2,
        `${r.filled.toFixed(1)}px of ${r.barHeight.toFixed(1)}px`,
    );
    const tiny = r.segs.find((s) => s.id === r.id('feed'));
    check('a <8 % share drops its percentage label', !!tiny && !/%/.test(tiny.text), `"${tiny?.text}"`);
}

// ── 5. All-zero values keep the empty placeholder ────────────────────────────
{
    const r = await render('zero', [0, 0, 0]);
    check('an all-zero bar shows the placeholder', r.kind === 'empty', `kind=${r.kind}`);
    check('an all-zero bar renders no segments', r.segs.length === 0, `got ${r.segs.length}`);
}

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
