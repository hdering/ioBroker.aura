// ─────────────────────────────────────────────────────────────────────────────
// Datumswähler — field alignment and no overflow in narrow frames (issue #917)
// ─────────────────────────────────────────────────────────────────────────────
// Compact without a title kept an empty flex-1 spacer in front of the fields;
// spacer + row gap pushed the native date input past the right inner edge of a
// w4 tile. The fields now take the free width themselves and `fieldAlign`
// places them left / center / right in every layout.
//
//   npm run dev                       (or set AURA_BASE)
//   node tools/tests/datepicker-align.mjs
//
// Injected demo state with screenshotMode on — no ioBroker state is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

function datepicker(layout, options, w = 4) {
    return {
        id: 'w-dp',
        type: 'datepicker',
        title: 'Datum',
        datapoint: 'demo.date',
        layout,
        gridPos: { x: 0, y: 0, w, h: 2 },
        options: { showTitle: false, showIcon: false, showCurrentValue: false, outputFormat: 'date_de', ...options },
    };
}

/** Field group vs. the row it lives in: left/right gaps in px (negative = overflow). */
const MEASURE = () => {
    const row = document.querySelector('.aura-widget-row');
    const field = row?.querySelector('input');
    if (!row || !field) return null;
    const r = row.getBoundingClientRect();
    const f = field.getBoundingClientRect();
    const cs = getComputedStyle(row);
    const innerL = r.left + parseFloat(cs.paddingLeft);
    const innerR = r.right - parseFloat(cs.paddingRight);
    return { left: Math.round(f.left - innerL), right: Math.round(innerR - f.right) };
};

async function measure(page, widget) {
    await page.evaluate((wd) => {
        window.__auraShot.mock({ 'demo.date': '15.01.2025' });
        window.__auraShot.showWidgets([wd], { editMode: false });
    }, widget);
    await page.waitForTimeout(450);
    return page.evaluate(MEASURE);
}

const browser = await chromium.launch();
try {
    // The tablet kiosk from the issue.
    const ctx = await browser.newContext({ viewport: { width: 1138, height: 710 } });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

    const near = (a, b) => Math.abs(a - b) <= 1;
    const fits = (m) => !!m && m.left >= 0 && m.right >= 0;

    // The issue's case: the field is a few px narrower than the tile (here w5 ≈ 113 px,
    // field ≈ 111 px at 11 px) — the old spacer + 8 px gap pushed it past the right edge.
    const m = await measure(page, datepicker('compact', { fontSize: 11 }, 5));
    check('compact, no title, field just fits: inside the row', fits(m), JSON.stringify(m));
    check('compact, no title: right-aligned by default', !!m && m.right <= 1, JSON.stringify(m));

    // A field wider than the tile cannot fit; it overflows on the right so the date stays readable.
    const o = await measure(page, datepicker('compact', {}, 4));
    check('compact, field wider than the tile: left edge stays visible', !!o && o.left === 0, JSON.stringify(o));

    const wide = 8;
    const cases = [
        ['compact', 'left', (m) => m.left <= 1],
        ['compact', 'center', (m) => near(m.left, m.right)],
        ['compact', 'right', (m) => m.right <= 1],
        ['default', undefined, (m) => m.left <= 1],
        ['default', 'right', (m) => m.right <= 1],
        ['card', undefined, (m) => near(m.left, m.right)],
        ['card', 'left', (m) => m.left <= 1],
        ['minimal', 'right', (m) => m.right <= 1],
    ];
    for (const [layout, align, ok] of cases) {
        const m = await measure(page, datepicker(layout, align ? { fieldAlign: align } : {}, wide));
        check(`${layout} fieldAlign=${align ?? '(auto)'}`, !!m && fits(m) && ok(m), JSON.stringify(m));
    }

    // With a title the title fills the row; the field stays right.
    const t = await measure(page, datepicker('compact', { showTitle: true, fieldAlign: 'left' }, wide));
    check('compact with title: field stays right', !!t && t.right <= 1, JSON.stringify(t));

    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
