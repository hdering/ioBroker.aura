// Verifies the two Kalender list additions of #608:
//   1. `showEndTime` appends the "bis" time of a timed event to its date,
//   2. `calNameAlways` shows the calendar name in Default even with one calendar.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/calendar-end-time.mjs
//
// Uses the screenshot harness (__auraShot): the ical table of the adapter sources is
// served through mockServerState, so no real datapoint is read or written. The clock
// arithmetic itself is covered headless by tools/tests/calendar-events.mjs.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

// Every scenario gets its own widget id and table datapoint: the widget caches its
// fetched events, so a fresh id remounts it instead of showing a stale list.
let scenario = 0;

const iso = (d) => new Date(d).toISOString();
/** Local midnight `days` from today, plus an optional time of day. */
const day = (days, h = 0, mi = 0) => {
    const d = new Date();
    d.setHours(h, mi, 0, 0);
    d.setDate(d.getDate() + days);
    return d;
};

/** One ical-adapter table row. */
const row = (id, event, start, end, calName, allDay = false) => ({
    event,
    _date: iso(start),
    _end: iso(end),
    _IDID: id,
    _calName: calName,
    _allDay: allDay,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

async function show({ layout = 'default', rows: tableRows, sources, options = {} }) {
    scenario += 1;
    const dp = `demo.ical.end${scenario}.data.table`;
    const widget = {
        id: `w-cal-end-${scenario}`,
        type: 'calendar',
        title: 'Termine',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 10, h: 20 },
        options: {
            calendars: sources.map((s, i) => ({
                id: `c${i}`,
                type: 'adapter',
                url: '',
                datapoint: dp,
                color: s.color ?? '#3b82f6',
                showName: true,
                calFilter: s.calFilter,
                name: s.name,
            })),
            maxEvents: 20,
            daysAhead: 60,
            refreshInterval: 0,
            showLocation: false,
            highlightEnabled: false,
            ...options,
        },
    };
    await page.evaluate(
        ([w, d, val]) => {
            window.__auraShot.mockServerState({ [d]: val });
            window.__auraShot.showWidgets([w]);
        },
        [widget, dp, JSON.stringify(tableRows)],
    );
    await page.waitForTimeout(700);
}

/** Text of every event row. */
const rowTexts = () =>
    page.evaluate(() =>
        [...document.querySelectorAll('.react-grid-item [data-calendar-event]')].map((el) => el.textContent ?? ''),
    );

const oneSource = [{ name: 'Familie', calFilter: 'Familie', color: '#3b82f6' }];
const twoSources = [
    { name: 'Familie', calFilter: 'Familie', color: '#3b82f6' },
    { name: 'Arbeit', calFilter: 'Arbeit', color: '#ef4444' },
];

// ── 1. the "bis" time ────────────────────────────────────────────────────────

// A timed event, an all-day one and a timed multi-day run — only the first may
// ever grow a clock-time span.
const mixed = [
    row('t1', 'Zahnarzt', day(1, 9, 0), day(1, 10, 30), 'Familie'),
    row('t2', 'Urlaub', day(3), day(4), 'Familie', true),
    row('t3', 'Messe', day(5, 8, 0), day(7, 17, 0), 'Familie'),
];

for (const layout of ['default', 'agenda']) {
    await show({ layout, rows: mixed, sources: oneSource });
    const off = await rowTexts();
    check(`${layout}: the date is the start time by default`, off[0]?.includes('09:00'), String(off[0]));
    check(`${layout}: no end time without the option`, !off[0]?.includes('10:30'), String(off[0]));

    await show({ layout, rows: mixed, sources: oneSource, options: { showEndTime: true } });
    const on = await rowTexts();
    check(`${layout}: showEndTime appends the bis time`, on[0]?.includes('09:00 – 10:30'), String(on[0]));
    check(`${layout}: an all-day event stays untouched`, !/\d{2}:\d{2}/.test(on[1] ?? ''), String(on[1]));
    // The multi-day run prints its span (start day – end day) as before; the clock
    // time of the end belongs to another day and must not be appended on top.
    check(
        `${layout}: a multi-day run keeps its span, without a clock span`,
        (on[2] ?? '').includes('–') && !(on[2] ?? '').includes('08:00 – 17:00'),
        String(on[2]),
    );
}

// The single-event layouts read the same label, so they follow along.
for (const layout of ['card', 'compact']) {
    await show({ layout, rows: mixed, sources: oneSource, options: { showEndTime: true } });
    const text = await page.evaluate(() => document.querySelector('.react-grid-item')?.textContent ?? '');
    check(`${layout}: the next event shows its bis time too`, text.includes('09:00 – 10:30'), text.slice(0, 120));
}

// ── 2. the calendar name of a single calendar ────────────────────────────────

const oneEvent = [row('n1', 'Zahnarzt', day(1, 9, 0), day(1, 10, 30), 'Familie')];

await show({ layout: 'default', rows: oneEvent, sources: oneSource });
let texts = await rowTexts();
check('default: one calendar hides its name by default', !texts[0]?.includes('Familie'), String(texts[0]));

await show({ layout: 'default', rows: oneEvent, sources: oneSource, options: { calNameAlways: true } });
texts = await rowTexts();
check('default: calNameAlways shows it anyway', texts[0]?.includes('Familie'), String(texts[0]));

// showCalName stays the master switch — it must still win over calNameAlways.
await show({
    layout: 'default',
    rows: oneEvent,
    sources: oneSource,
    options: { calNameAlways: true, showCalName: false },
});
texts = await rowTexts();
check('default: showCalName=false still wins', !texts[0]?.includes('Familie'), String(texts[0]));

// Two calendars print the name with or without the option, as before.
const twoCalEvents = [
    row('m1', 'Zahnarzt', day(1, 9, 0), day(1, 10, 30), 'Familie'),
    row('m2', 'Sprint-Review', day(2, 14, 0), day(2, 15, 0), 'Arbeit'),
];
await show({ layout: 'default', rows: twoCalEvents, sources: twoSources });
texts = await rowTexts();
check(
    'default: two calendars name themselves unchanged',
    texts[0]?.includes('Familie') && texts[1]?.includes('Arbeit'),
    JSON.stringify(texts),
);

// Agenda never gated the name — one calendar is enough there, before and after.
await show({ layout: 'agenda', rows: oneEvent, sources: oneSource });
texts = await rowTexts();
check('agenda: one calendar already names itself', texts[0]?.includes('Familie'), String(texts[0]));

// ── summary ─────────────────────────────────────────────────────────────────

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.name} - ${f.detail}`);
    process.exit(1);
}
