// ─────────────────────────────────────────────────────────────────────────────
// Datumswähler — dropdown-style native fields (Chrome on Android, issue #920)
// ─────────────────────────────────────────────────────────────────────────────
// Chrome on Android paints date/time inputs as a menu button: arrow on the
// right, a minimum width of its own, no picker indicator. DateTimeInput found
// nothing to replace there and left the field alone — too wide in a list row,
// with an arrow instead of a clock. Such fields now get `.aura-dt-dropdown`
// (plain look, value width) and our picker button.
//
// Desktop Chromium has no Android theme, so the test plays it. The real engine
// reports `appearance: auto` for those fields (the theme paints the arrow), so
// the main case is an Android user agent with only a wide minimum and the arrow
// gap injected — the appearance probe alone missed exactly that (0.104.0). A
// second case keeps the menulist appearance on a desktop agent, a third context
// without either checks that desktop fields stay as they were.
//
//   npm run dev                       (or set AURA_BASE)
//   node tools/tests/datepicker-dropdown.mjs
//
// Injected demo state with screenshotMode on — no ioBroker state is touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const ANDROID_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

// What Chrome on Android lays out: a wide field, room on the right for the arrow.
const ANDROID_FIELD = `:where(input[type='time'], input[type='date']) { min-width: 220px; }
:where(input)::-webkit-date-and-time-value { margin: 1px 24px 1px 4px; }`;

const MENULIST = `:where(input[type='time'], input[type='date']) {
    -webkit-appearance: menulist-button;
    appearance: menulist-button;
    min-width: 220px;
}`;

const widget = {
    id: 'w-dp',
    type: 'datepicker',
    title: 'Zeit',
    datapoint: 'demo.time',
    layout: 'compact',
    gridPos: { x: 0, y: 0, w: 8, h: 2 },
    options: { showTitle: true, showIcon: false, showCurrentValue: false, timeOnly: true, outputFormat: 'time_hhmm' },
};

// The list entry from the issue.
const list = {
    id: 'w-list',
    type: 'list',
    title: 'Liste',
    datapoint: '',
    gridPos: { x: 0, y: 0, w: 8, h: 3 },
    options: {
        showTitle: false,
        entries: [
            {
                id: 'demo.time',
                label: 'Laden fertig bis',
                displayType: 'datepicker',
                dateTimeOnly: true,
                dateShowTime: true,
                dateOutputFormat: 'time_hhmm',
            },
        ],
    },
};

const FIELD = () => {
    const el = document.querySelector('input[type="time"]');
    if (!el) return null;
    const wrap = el.parentElement;
    return {
        width: Math.round(el.getBoundingClientRect().width),
        appearance: getComputedStyle(el).appearance,
        dropdown: el.classList.contains('aura-dt-dropdown'),
        button: !!wrap?.querySelector('button'),
    };
};

async function open(browser, css, userAgent) {
    const ctx = await browser.newContext({
        viewport: { width: 400, height: 700 },
        ...(userAgent ? { userAgent } : {}),
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE}/?shot=1#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });
    if (css) await page.addStyleTag({ content: css });
    return { ctx, page, errors };
}

async function measure(page, wd) {
    await page.evaluate((w) => {
        window.__auraShot.mock({ 'demo.time': '05:30' });
        window.__auraShot.showWidgets([w], { editMode: false });
    }, wd);
    await page.waitForTimeout(450);
    return page.evaluate(FIELD);
}

const browser = await chromium.launch();
try {
    for (const [variant, css, ua] of [
        ['android (appearance auto)', ANDROID_FIELD, ANDROID_UA],
        ['menulist appearance', MENULIST, undefined],
    ]) {
        const android = await open(browser, css, ua);
        for (const [name, wd] of [
            ['widget', widget],
            ['list entry', list],
        ]) {
            const f = await measure(android.page, wd);
            const d = JSON.stringify(f);
            check(`${variant} ${name}: dropdown field taken over`, !!f && f.dropdown && f.appearance === 'none', d);
            check(`${variant} ${name}: sized to its value, not the engine minimum`, !!f && f.width < 120, d);
            check(`${variant} ${name}: own picker button`, !!f?.button, d);
        }
        check(`${variant}: no page errors`, android.errors.length === 0, android.errors.join(' | '));
        await android.ctx.close();
    }

    const desktop = await open(browser, null);
    const f = await measure(desktop.page, list);
    check(
        'desktop: field keeps its normal look',
        !!f && !f.dropdown && f.appearance === 'auto' && f.button,
        JSON.stringify(f),
    );
    check('desktop: no page errors', desktop.errors.length === 0, desktop.errors.join(' | '));
    await desktop.ctx.close();
} finally {
    await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
