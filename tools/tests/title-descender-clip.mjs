// Widget titles must not have their descenders cut off (g, p, y) - #see RELEASE_NOTES.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/title-descender-clip.mjs
//
// The titles clip their own overflow (`truncate` = overflow:hidden), so the line box
// IS the clip box. Tailwind ships text-* with an absolute line-height (text-xs =
// 12px/16px); the frontend font scale used to multiply only the font size, leaving the
// box at 16px - at scale 1.3 a 15.6px title no longer fits and loses its descenders.
//
// Measured, not eyeballed: canvas TextMetrics gives the font's own box and the actual
// ink of the rendered string, both for the element's computed font. Two invariants per
// title: the line box holds the whole font box, and the glyphs' ink descent fits into
// the space below the baseline.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SCALES = [1, 1.15, 1.3, 1.6];
// Descenders in both halves of the string, so a clip shows up wherever the text sits.
const TITLE = 'Gartenpumpe Tagesertrag';

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

const VALUES = { 'demo.t1': 21.5 };
// The chart widgets only reach their real (non-empty) render path with history behind
// the series - the empty state draws a different header.
const HISTORY = Array.from({ length: 24 }, (_, i) => [Date.now() - (23 - i) * 3600e3, 18 + (i % 7)]);
await page.evaluate((rows) => {
    window.__auraShot.enableHistory(true);
    window.__auraShot.mockHistory({ 'demo.t1': rows });
}, HISTORY);

let seq = 0;
async function show(type, options = {}, layout = 'default') {
    const widget = {
        id: `w-desc-${++seq}`,
        type,
        title: TITLE,
        datapoint: 'demo.t1',
        layout,
        gridPos: { x: 0, y: 0, w: 12, h: 6 },
        options,
    };
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mock(vals);
            window.__auraShot.mockServerState(vals);
            window.__auraShot.showWidgets([w]);
        },
        [widget, VALUES],
    );
    // The chart widgets are lazy-loaded (recharts/echarts), so the first mount of one
    // needs longer than a plain widget swap before its header exists.
    await page.waitForTimeout(type === 'chart' || type === 'echart' ? 1500 : 350);
}

const setScale = (s) => page.evaluate((v) => document.documentElement.style.setProperty('--font-scale', v), String(s));

/**
 * Every `.aura-widget-title` on screen, with the numbers that decide whether a
 * descender survives:
 *   need  - the font's own box (ascent + descent) for the computed font
 *   below - room under the baseline inside the line box
 *   ink   - how deep the rendered glyphs actually reach under the baseline
 */
const titleMetrics = () =>
    page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('.aura-widget-title')) {
            const cs = getComputedStyle(el);
            const text = (el.innerText || '').trim();
            if (!text) continue;
            const fontSize = parseFloat(cs.fontSize);
            const lh = cs.lineHeight === 'normal' ? NaN : parseFloat(cs.lineHeight);
            const c = document.createElement('canvas').getContext('2d');
            c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            const m = c.measureText(text);
            const ascent = m.fontBoundingBoxAscent;
            const descent = m.fontBoundingBoxDescent;
            // half-leading may be negative; the baseline sits that far into the box
            const baseline = (lh - (ascent + descent)) / 2 + ascent;
            out.push({
                text,
                fontSize: Math.round(fontSize * 10) / 10,
                lineHeight: Number.isNaN(lh) ? 'normal' : Math.round(lh * 10) / 10,
                clips: cs.overflowY === 'hidden' || cs.overflowX === 'hidden',
                need: Math.round((ascent + descent) * 10) / 10,
                below: Number.isNaN(lh) ? Infinity : Math.round((lh - baseline) * 10) / 10,
                ink: Math.round(m.actualBoundingBoxDescent * 10) / 10,
            });
        }
        return out;
    });

const CASES = [
    ['value (default)', 'value', {}, 'default'],
    ['value (card)', 'value', {}, 'card'],
    ['value (compact)', 'value', {}, 'compact'],
    ['list (statisch)', 'list', { entries: [{ id: 'demo.t1', label: 'Pumpe' }] }, 'default'],
    ['timer', 'timer', { events: [] }, 'default'],
    ['timer (compact)', 'timer', { events: [] }, 'compact'],
    ['chart', 'chart', { series: [{ dp: 'demo.t1', label: 'Pumpe' }] }, 'default'],
    [
        'echart',
        'echart',
        {
            echartMode: 'timeseries',
            echartRange: '24h',
            echartShowCurrent: false,
            echartSeries: [
                { id: 's1', name: 'Pumpe', datapointId: 'demo.t1', chartType: 'line', historyInstance: 'history.0' },
            ],
        },
        'default',
    ],
];

for (const scale of SCALES) {
    await setScale(scale);
    for (const [name, type, options, layout] of CASES) {
        await show(type, options, layout);
        const [m] = await titleMetrics();
        if (!m) {
            check(`${name} @${scale}: title rendered`, false, 'kein .aura-widget-title');
            continue;
        }
        const label = `${name} @${scale}`;
        check(
            `${label}: line box holds the font box`,
            m.lineHeight === 'normal' || m.lineHeight + 0.5 >= m.need,
            `font ${m.fontSize}px, box ${m.lineHeight}px, braucht ${m.need}px`,
        );
        check(
            `${label}: descender fits below the baseline`,
            !m.clips || m.below + 0.5 >= m.ink,
            `unter Grundlinie ${m.below}px, Unterlänge ${m.ink}px ("${m.text}")`,
        );
    }
}
await setScale(1);

check('keine Seitenfehler', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} ok`);
if (failed.length) {
    console.log('\nFehlgeschlagen:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    process.exit(1);
}
