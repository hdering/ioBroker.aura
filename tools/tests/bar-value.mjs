// Verifies value placement and the split bar colours of the fill widget's bar layout
// and the Universal widget's progress cell (issues #719, #720).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/bar-value.mjs
//
// Both bars share one label renderer and one editor block, so the checks run the same
// questions against both: does "inside" put the number into the bar (and widen the
// fill widget's bar, which is what #719 is after), does each part of the bar take its
// own colour, is the upper copy of the label clipped exactly at the fill level — and
// does an untouched progress cell keep its old blended label.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const SHOTS = process.env.AURA_SHOTS ?? '';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

const DP = 'demo.bar.level';
const INK = '#00b7eb';
const TRACK = '#334455';
const ON_FILL = '#111111';
const ON_TRACK = '#eeeeee';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 60000 });
await page.evaluate(() => window.__auraShot.writes(true));

let seq = 0;
const fill = (opts) => ({
    id: `w-fill-${++seq}`,
    type: 'fill',
    title: 'Cyan',
    datapoint: DP,
    layout: 'bar',
    gridPos: { x: 0, y: 0, w: 4, h: 8 },
    options: { unit: '%', decimals: 0, minValue: 0, maxValue: 100, showTicks: false, ...opts },
});
const cell = (props) => ({
    id: `w-cell-${++seq}`,
    type: 'universal',
    title: 'Cyan',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 4, h: 8 },
    options: {
        showTitle: false,
        showIcon: false,
        customGrid: {
            cols: 1,
            rows: 1,
            cells: [
                { type: 'progress', dpId: DP, min: 0, max: 100, decimals: 0, showValue: true, suffix: ' %', ...props },
            ],
        },
    },
});

async function show(cfg, value = 40) {
    await page.evaluate(
        ([w, vals]) => {
            window.__auraShot.mockServerState(vals);
            window.__auraShot.mock(vals);
            window.__auraShot.showWidgets([w]);
        },
        [cfg, { [DP]: value }],
    );
    await page.waitForTimeout(500);
    if (SHOTS) {
        const el = await page.$('.react-grid-item');
        await el?.screenshot({ path: `${SHOTS}/${cfg.id}.png` });
    }
}

/** What the bar on screen looks like: box, colours, both label copies. */
const read = (barSel) =>
    page.evaluate((sel) => {
        const bar = document.querySelector(sel);
        const box = bar?.getBoundingClientRect();
        const layer = (k) => {
            const el = document.querySelector(`[data-aura-bar-value="${k}"]`);
            if (!el) return null;
            const cs = getComputedStyle(el);
            return {
                color: cs.color,
                clip: cs.clipPath,
                inBar: !!bar?.contains(el),
                text: el.textContent,
            };
        };
        const fillEl = bar?.querySelector('[data-aura-fill-level], .absolute:not([data-aura-bar-value])');
        const legacy = bar ? [...bar.querySelectorAll('div')].find((d) => d.style.mixBlendMode === 'difference') : null;
        return {
            exists: !!bar,
            width: box?.width ?? 0,
            height: box?.height ?? 0,
            track: bar ? getComputedStyle(bar).backgroundColor : '',
            fill: fillEl ? getComputedStyle(fillEl).backgroundColor : '',
            empty: layer('empty'),
            filled: layer('filled'),
            outside: layer('outside'),
            legacy: !!legacy,
            gridText: document.querySelector('.react-grid-item')?.innerText ?? '',
        };
    }, barSel);

/** inset() edges of a computed clip-path; the browser drops trailing repeats. */
const insetEdges = (clip) => {
    const m = /inset\(([^)]*)\)/.exec(clip ?? '');
    if (!m) return null;
    const v = m[1]
        .trim()
        .split(/\s+/)
        .map((x) => parseFloat(x));
    return [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? v[1] ?? v[0]];
};
const clipTop = (clip) => insetEdges(clip)?.[0];
const clipRight = (clip) => insetEdges(clip)?.[1];

const rgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

// ── Fill widget, bar layout ─────────────────────────────────────────────────
console.log('Fill widget (bar layout)');
await show(fill({}));
let r = await read('[data-aura-fill]');
check('outside is the default: no label inside the bar', r.exists && !r.empty && !r.filled, JSON.stringify(r.empty));
check('outside keeps the slim pill', r.width > 0 && r.width <= 34, `width ${r.width}`);
check('value still printed beside the bar', r.gridText.includes('40'), r.gridText);
const slim = r.width;

await show(
    fill({
        valuePlacement: 'inside',
        fillColor: INK,
        trackColor: TRACK,
        valueFilledColor: ON_FILL,
        valueEmptyColor: ON_TRACK,
    }),
);
r = await read('[data-aura-fill]');
check('inside: both label copies sit in the bar', !!r.empty?.inBar && !!r.filled?.inBar);
check('inside: bar uses the width the label gave up (#719)', r.width > slim * 1.5, `${slim} -> ${r.width}`);
check('fill colour applies', r.fill === rgb(INK), r.fill);
check('track colour applies', r.track === rgb(TRACK), r.track);
check('text colour over the fill', r.filled?.color === rgb(ON_FILL), r.filled?.color);
check('text colour over the track', r.empty?.color === rgb(ON_TRACK), r.empty?.color);
check('filled copy clipped at 40 % from the bottom', clipTop(r.filled?.clip) === 60, r.filled?.clip);

await show(fill({ valuePlacement: 'inside', orientation: 'horizontal' }), 25);
r = await read('[data-aura-fill]');
check('horizontal inside: clipped from the right', clipRight(r.filled?.clip) === 75, r.filled?.clip);
check('horizontal inside: bar tall enough for the digits', r.height >= 20, `height ${r.height}`);

await show(fill({ valuePlacement: 'inside', showValue: false }));
r = await read('[data-aura-fill]');
check('inside without showValue prints nothing', !r.empty && !r.filled);

// ── Universal widget, progress cell ─────────────────────────────────────────
console.log('Universal widget (progress cell)');
await show(cell({ orientation: 'vertical', color: INK }));
r = await read('[data-aura-progress-bar]');
check('untouched cell keeps the blended label', r.legacy && !r.empty, `legacy ${r.legacy}`);

await show(
    cell({
        orientation: 'vertical',
        color: INK,
        trackColor: TRACK,
        valueFilledColor: ON_FILL,
        valueEmptyColor: ON_TRACK,
    }),
);
r = await read('[data-aura-progress-bar]');
check('split colours replace the blend', !r.legacy && !!r.empty && !!r.filled);
check('cell: fill colour', r.fill === rgb(INK), r.fill);
check('cell: track colour (#720)', r.track === rgb(TRACK), r.track);
check('cell: text over the fill', r.filled?.color === rgb(ON_FILL), r.filled?.color);
check('cell: text over the track', r.empty?.color === rgb(ON_TRACK), r.empty?.color);
check('cell: clipped at 40 %', clipTop(r.filled?.clip) === 60, r.filled?.clip);
const fullWidth = r.width;

await show(cell({ orientation: 'vertical', color: INK, valuePlacement: 'outside' }));
r = await read('[data-aura-progress-bar]');
check('cell outside: label beside the bar', !!r.outside && !r.outside.inBar && !r.empty, r.outside?.text);
check('cell outside: bar narrower than with the label inside', r.width < fullWidth, `${fullWidth} -> ${r.width}`);

// ── Editors ─────────────────────────────────────────────────────────────────
console.log('Editors');
const cfgEd = fill({ valuePlacement: 'inside' });
await show(cfgEd);
await page.evaluate(() => window.__auraShot.setEditMode(true));
await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
await page.waitForTimeout(600);
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.locator('[data-aura-bar-placement]').first().waitFor({ timeout: 10000 });
const edText = await dlg.innerText();
check(
    'fill editor offers placement and all four colours',
    (await dlg.locator('[data-aura-bar-placement]').count()) === 2 &&
        [
            'Farbe Fortschritt',
            'Farbe ungefüllte Fläche',
            'Schrift im Fortschritt',
            'Schrift in ungefüllter Fläche',
        ].every((s) => edText.includes(s)),
);
await dlg.locator('[data-aura-bar-placement="outside"]').click();
await page.waitForTimeout(300);
const written = await page.evaluate((id) => window.__auraShot.widgetOptions(id), cfgEd.id);
check('placement button writes the option', written?.valuePlacement === 'outside', written?.valuePlacement);
check('text colours hide once the value sits outside', !(await dlg.innerText()).includes('Schrift im Fortschritt'));
if (SHOTS) await dlg.screenshot({ path: `${SHOTS}/editor-fill.png` });
await page.keyboard.press('Escape');

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
