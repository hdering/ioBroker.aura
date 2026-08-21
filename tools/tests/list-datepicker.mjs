// Verifies the "Datumswähler" display type of the list widgets.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/list-datepicker.mjs
//
// Uses the screenshot harness (__auraShot) so datapoint values live in the
// in-memory cache only - no socket write, no real datapoint is touched.
// Checked: the fields render in every layout that has a value column, the mode
// options (time only / extra time field / custom pattern) pick the right native
// field, picking a value writes it in the configured output format, and the
// badges layout falls back to the formatted text.
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

/** 2025-01-15 13:30 local — the value every entry starts from. */
const TS = new Date(2025, 0, 15, 13, 30, 0, 0).getTime();

/** Renders one list widget holding a single 'datepicker' entry, reports its fields. */
async function show(type, layout, entryPatch = {}, value = TS) {
    const widget = {
        id: 'w-list',
        type,
        title: 'Testliste',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        options: {
            entries: [{ id: 'demo.date', label: 'Termin', role: 'value', displayType: 'datepicker', ...entryPatch }],
        },
    };
    await page.evaluate(
        ([w, values]) => {
            window.__auraShot.writes(true); // arm + reset the write log
            window.__auraShot.mock(values);
            window.__auraShot.showWidgets([w]);
        },
        [widget, { 'demo.date': value }],
    );
    await page.waitForTimeout(400);
    // Push the value once more: the very first widget shown in a session subscribes
    // after its first paint, so only a pushed update reaches it there.
    await page.evaluate((values) => window.__auraShot.mock(values), { 'demo.date': value });
    await page.waitForTimeout(300);
    return page.evaluate(() => {
        const of = (t) => document.querySelector(`.aura-widget input[type="${t}"]`);
        const kinds = [...document.querySelectorAll('.aura-widget input')].map((i) => i.type);
        return {
            kinds,
            date: of('date')?.value ?? null,
            time: of('time')?.value ?? null,
            month: of('month')?.value ?? null,
            text: of('text')?.value ?? null,
            /** The widget's own text — the badges layout prints the value here. */
            rowText: document.querySelector('.aura-widget')?.innerText?.trim() ?? '',
        };
    });
}

/** Sets a native field and returns the datapoint value the widget wrote. */
async function pick(kind, value) {
    const f = page.locator(`.aura-widget input[type="${kind}"]`).first();
    await f.fill(value);
    await page.waitForTimeout(250);
    return page.evaluate(() => window.__auraShot?.lastWrite ?? null);
}

// ── 1. Every layout with a value column renders the date field ───────────────
for (const type of ['list', 'autolist']) {
    for (const layout of ['default', 'card', 'compact']) {
        const dom = await show(type, layout);
        check(`${type}/${layout} renders the date field`, dom.date === '2025-01-15', JSON.stringify(dom));
        check(`${type}/${layout} has no time field by default`, dom.time === null, `kinds=${dom.kinds}`);
    }
    // Badges have no room for fields — they print the value instead.
    const minimal = await show(type, 'minimal');
    check(`${type}/minimal renders no field`, minimal.kinds.length === 0, `kinds=${minimal.kinds}`);
    check(`${type}/minimal prints the formatted value`, minimal.rowText.includes('15.01.2025'), minimal.rowText);
}

// ── 2. Mode options pick the fields ─────────────────────────────────────────
const withTime = await show('list', 'default', { dateShowTime: true });
check(
    'dateShowTime adds the time field',
    withTime.date === '2025-01-15' && withTime.time === '13:30',
    JSON.stringify(withTime),
);

const timeOnly = await show('list', 'default', { dateTimeOnly: true });
check(
    'dateTimeOnly renders only a time field',
    timeOnly.date === null && timeOnly.time === '13:30',
    JSON.stringify(timeOnly),
);

// ── 3. Custom pattern picks the matching native field ───────────────────────
const month = await show('list', 'default', { dateInputFormat: 'custom', dateInputPattern: 'MM.yyyy' });
check('MM.yyyy renders a month field', month.month === '2025-01', JSON.stringify(month));

const free = await show('list', 'default', { dateInputFormat: 'custom', dateInputPattern: 'yyyy' });
check('a pattern no field covers falls back to text', free.text === '2025', JSON.stringify(free));

const dateTime = await show('list', 'default', {
    dateInputFormat: 'custom',
    dateInputPattern: 'dd.MM.yyyy HH:mm',
});
check(
    'dd.MM.yyyy HH:mm renders one datetime field',
    dateTime.kinds.join() === 'datetime-local',
    JSON.stringify(dateTime),
);

// ── 4. Picking writes the datapoint in the configured output format ─────────
await show('list', 'default');
const wroteMs = await pick('date', '2025-03-04');
check(
    'default output writes a ms timestamp',
    wroteMs?.id === 'demo.date' && wroteMs?.val === new Date(2025, 2, 4).getTime(),
    JSON.stringify(wroteMs),
);

await show('list', 'default', { dateOutputFormat: 'de_date' });
const wroteDe = await pick('date', '2025-03-04');
check('de_date output writes the German date', wroteDe?.val === '04.03.2025', JSON.stringify(wroteDe));

await show('list', 'default', { dateOutputFormat: 'timestamp_s' });
const wroteS = await pick('date', '2025-03-04');
check(
    'timestamp_s output writes seconds',
    wroteS?.val === Math.floor(new Date(2025, 2, 4).getTime() / 1000),
    JSON.stringify(wroteS),
);

await show('list', 'default', { dateTimeOnly: true, dateOutputFormat: 'time_hhmm' }, '13:30');
const wroteTime = await pick('time', '07:45');
check('time_hhmm output writes HH:mm', wroteTime?.val === '07:45', JSON.stringify(wroteTime));

await show('list', 'default', { dateOutputFormat: 'custom', dateOutputPattern: 'yyyy-MM' });
const wroteCustom = await pick('date', '2025-03-04');
check('custom output follows the pattern', wroteCustom?.val === '2025-03', JSON.stringify(wroteCustom));

// ── 5. A card cell stacks the fields but keeps them usable ─────────────────
const card = await show('autolist', 'card', { dateShowTime: true });
check('card layout renders both fields', card.date === '2025-01-15' && card.time === '13:30', JSON.stringify(card));

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
