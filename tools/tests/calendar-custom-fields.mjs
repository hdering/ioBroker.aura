// Verifies the per-event fields of the Kalender custom layout (#608): a custom grid
// must be able to lay out a whole agenda, one grid row per event, not just the next
// one. Every visible event carries a 1-based field set (summary1, timespan2, …) plus
// its own calendar icon (cal-icon2); the unindexed keys stay aliases of event 1.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/calendar-custom-fields.mjs
//
// Uses the screenshot harness (__auraShot): the ical table of the adapter sources is
// served through mockServerState, so no real datapoint is read or written.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

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

const field = (fieldKey) => ({ type: 'field', fieldKey, fontSize: 12, align: 'left', valign: 'middle' });
const component = (componentKey) => ({ type: 'component', componentKey, fontSize: 16 });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

/** Renders one calendar widget in the custom layout with the given grid. */
async function show({ rows: tableRows, sources, grid, options = {} }) {
    scenario += 1;
    const dp = `demo.ical.custom${scenario}.data.table`;
    const widget = {
        id: `w-cal-custom-${scenario}`,
        type: 'calendar',
        title: 'Termine',
        datapoint: '',
        layout: 'custom',
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
                icon: s.icon,
            })),
            maxEvents: 20,
            daysAhead: 60,
            refreshInterval: 0,
            highlightEnabled: false,
            customGrid: grid,
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

/** Text of every grid cell, by cell index. */
const cellTexts = () =>
    page.evaluate(() => {
        const out = {};
        for (const el of document.querySelectorAll('.react-grid-item [class*="aura-custom-cell-"]')) {
            const m = /aura-custom-cell-(\d+)/.exec(el.className);
            if (m) out[m[1]] = (el.textContent ?? '').trim();
        }
        return out;
    });

/** Whether a component cell actually painted something. */
const cellFilled = (index) =>
    page.evaluate((i) => {
        const el = document.querySelector(`.react-grid-item .aura-custom-cell-${i}`);
        return !!el && el.childElementCount > 0;
    }, index);

// ── one grid row per event ───────────────────────────────────────────────────

// Three events, two calendars — only "Familie" carries an icon, so the icon cells
// double as a check that each row reads its OWN event, not the next one.
const threeEvents = [
    row('e1', 'Zahnarzt', day(1, 9, 0), day(1, 10, 30), 'Familie'),
    row('e2', 'Sprint-Review', day(2, 14, 0), day(2, 15, 0), 'Arbeit'),
    row('e3', 'Yoga', day(3, 18, 15), day(3, 19, 15), 'Familie'),
];
const twoSources = [
    { name: 'Familie', calFilter: 'Familie', color: '#3b82f6', icon: 'lucide:home' },
    { name: 'Arbeit', calFilter: 'Arbeit', color: '#ef4444' },
];

// 4×3: KW | calendar icon | title | time span — one row per event.
const agendaGrid = {
    cols: 4,
    rows: 3,
    cells: [
        field('kwnew1'),
        component('cal-icon1'),
        field('summary1'),
        field('timespan1'),
        field('kwnew2'),
        component('cal-icon2'),
        field('summary2'),
        field('timespan2'),
        field('kwnew3'),
        component('cal-icon3'),
        field('summary3'),
        field('timespan3'),
    ],
};

await show({ rows: threeEvents, sources: twoSources, grid: agendaGrid });
let texts = await cellTexts();
eq('row 1 shows the next event', texts['2'], 'Zahnarzt');
eq('row 2 shows the second event', texts['6'], 'Sprint-Review');
eq('row 3 shows the third event', texts['10'], 'Yoga');
eq('the time span of event 1 reads von – bis', texts['3'], '09:00 – 10:30');
eq('the time span of event 2 reads von – bis', texts['7'], '14:00 – 15:00');
eq('the time span of event 3 reads von – bis', texts['11'], '18:15 – 19:15');

check('event 1 paints the icon of its calendar', await cellFilled(1));
check('event 2 has no icon — its calendar carries none', !(await cellFilled(5)));
check('event 3 paints the icon of its calendar', await cellFilled(9));

// ── the unindexed keys stay aliases of event 1 ───────────────────────────────

const legacyGrid = {
    cols: 4,
    rows: 1,
    cells: [field('summary'), field('time'), field('endtime'), field('count')],
};
await show({ rows: threeEvents, sources: twoSources, grid: legacyGrid });
texts = await cellTexts();
eq('summary without a number is still the next event', texts['0'], 'Zahnarzt');
eq('time is the start of the next event', texts['1'], '09:00');
eq('endtime is the end of the next event', texts['2'], '10:30');
eq('count is the total, not a per-event field', texts['3'], '3');

// ── all-day events have no clock times ──────────────────────────────────────

const allDayRows = [
    row('a1', 'Urlaub', day(1), day(2), 'Familie', true),
    row('a2', 'Zahnarzt', day(3, 9, 0), day(3, 9, 45), 'Familie'),
];
const oneSource = [{ name: 'Familie', calFilter: 'Familie', color: '#3b82f6' }];
await show({
    rows: allDayRows,
    sources: oneSource,
    grid: { cols: 2, rows: 2, cells: [field('summary1'), field('timespan1'), field('summary2'), field('timespan2')] },
});
texts = await cellTexts();
eq('the all-day event is first', texts['0'], 'Urlaub');
eq('an all-day event prints no time span', texts['1'] ?? '', '');
eq('the timed event still prints one', texts['3'], '09:00 – 09:45');

// ── kwnew only labels the row that opens a week ─────────────────────────────

const nextMon = (() => {
    const d = day(0);
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); // the coming Monday
    return d;
})();
const off = (base, days, h) => {
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + days);
    d.setHours(h, 0, 0, 0);
    return d;
};
const twoWeeks = [
    row('w1', 'Mo', off(nextMon, 0, 9), off(nextMon, 0, 10), 'Familie'),
    row('w2', 'Mi', off(nextMon, 2, 9), off(nextMon, 2, 10), 'Familie'),
    row('w3', 'Mo+7', off(nextMon, 7, 9), off(nextMon, 7, 10), 'Familie'),
];
await show({
    rows: twoWeeks,
    sources: oneSource,
    grid: {
        cols: 2,
        rows: 3,
        cells: [field('kwnew1'), field('kw1'), field('kwnew2'), field('kw2'), field('kwnew3'), field('kw3')],
    },
});
texts = await cellTexts();
check('kwnew labels the first row of a week', /^KW\s*\d+$/.test(texts['0'] ?? ''), String(texts['0']));
eq('kwnew stays empty inside the same week', texts['2'] ?? '', '');
check('kwnew labels the row that opens the next week', /^KW\s*\d+$/.test(texts['4'] ?? ''), String(texts['4']));
eq('kw always prints, even mid-week', texts['3'], texts['1']);
check('the new week has a different number', texts['5'] !== texts['1'], `${texts['1']} vs ${texts['5']}`);

// ── summary ─────────────────────────────────────────────────────────────────

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.name} - ${f.detail}`);
    process.exit(1);
}
