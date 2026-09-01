// Verifies the three Kalender additions of #608 in the rendered widget:
//   1. an optional icon per calendar source,
//   2. an optional calendar week, printed at the first entry of each week,
//   3. "Mehrtägige Termine → Jeden Tag einzeln".
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/calendar-icon-week.mjs
//
// Uses the screenshot harness (__auraShot): the ical table of the adapter sources is
// served through mockServerState, so no real datapoint is read or written. The day
// arithmetic itself is covered headless by tools/tests/calendar-events.mjs — this test
// only checks that the options reach the DOM, in every layout that renders them.
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

/**
 * Renders one calendar widget. `sources` are merged onto a shared adapter default,
 * every source reads the same mocked table and filters it by its calendar name.
 */
async function show({ layout = 'default', rows: tableRows, sources, options = {}, awaitIcon = false } = {}) {
    scenario += 1;
    const dp = `demo.ical.${scenario}.data.table`;
    const widget = {
        id: `w-cal-${scenario}`,
        type: 'calendar',
        title: 'Termine',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 8, h: 20 },
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
            showLocation: false,
            // The highlight would add a second icon to the row and blur what we count.
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
    // Iconify fetches an icon it has not seen before, so the very first render with
    // one paints without it. Wait for it instead of guessing a timeout.
    if (awaitIcon) {
        await page.waitForSelector('.react-grid-item .aura-cal-source-icon', { timeout: 15000 }).catch(() => {});
    }
}

/** Per event row: its title, whether it carries a source icon, and its week label. */
const rowInfo = () =>
    page.evaluate(() =>
        [...document.querySelectorAll('.react-grid-item [data-calendar-event]')].map((el) => ({
            text: el.textContent ?? '',
            icons: el.querySelectorAll('.aura-cal-source-icon').length,
            week: el.querySelector('.aura-cal-week')?.getAttribute('data-calendar-week') ?? null,
            weekText: el.querySelector('.aura-cal-week')?.textContent ?? null,
        })),
    );

// ── 1. per-calendar icon ─────────────────────────────────────────────────────

// One source has an icon, the other has none — the icon must be per calendar.
const twoCals = [
    row('a1', 'Zahnarzt', day(1, 9), day(1, 10), 'Familie'),
    row('b1', 'Sprint-Review', day(2, 14), day(2, 15), 'Arbeit'),
];
const twoSources = [
    { name: 'Familie', calFilter: 'Familie', color: '#3b82f6', icon: 'lucide:home' },
    { name: 'Arbeit', calFilter: 'Arbeit', color: '#ef4444' },
];

for (const layout of ['default', 'agenda']) {
    await show({ layout, rows: twoCals, sources: twoSources, awaitIcon: true });
    const info = await rowInfo();
    check(`${layout}: both events render`, info.length === 2, JSON.stringify(info.map((r) => r.icons)));
    check(
        `${layout}: only the source with an icon shows one`,
        info.length === 2 && info[0].icons === 1 && info[1].icons === 0,
        JSON.stringify(info.map((r) => r.icons)),
    );
}

await show({ layout: 'default', rows: twoCals, sources: twoSources, options: { showCalIcon: false } });
const iconsOff = await rowInfo();
check(
    'showCalIcon=false hides the icon everywhere',
    iconsOff.length === 2 && iconsOff.every((r) => r.icons === 0),
    JSON.stringify(iconsOff.map((r) => r.icons)),
);

// The single-event layouts carry it too.
for (const layout of ['compact', 'card']) {
    await show({ layout, rows: twoCals, sources: twoSources, awaitIcon: true });
    const n = await page.evaluate(() => document.querySelectorAll('.react-grid-item .aura-cal-source-icon').length);
    check(`${layout}: the next event shows its calendar icon`, n === 1, String(n));
}

// ── 2. calendar week at the first entry of a week ────────────────────────────

// Four events across two ISO weeks: the label belongs on entries 1 and 3.
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
    row('w4', 'Di+8', off(nextMon, 8, 9), off(nextMon, 8, 10), 'Familie'),
];
const oneSource = [{ name: 'Familie', calFilter: 'Familie', color: '#3b82f6' }];

await show({ layout: 'default', rows: twoWeeks, sources: oneSource });
const noWeek = await rowInfo();
check(
    'the week column is off by default',
    noWeek.length === 4 && noWeek.every((r) => r.week === null),
    JSON.stringify(noWeek.map((r) => r.week)),
);

for (const layout of ['default', 'agenda']) {
    await show({ layout, rows: twoWeeks, sources: oneSource, options: { showWeek: true } });
    const info = await rowInfo();
    check(
        `${layout}: only the first entry of each week is labelled`,
        info.length === 4 && JSON.stringify(info.map((r) => r.week)) === '["first","repeat","first","repeat"]',
        JSON.stringify(info.map((r) => r.week)),
    );
    const labels = info.map((r) => r.weekText);
    check(
        `${layout}: entries of one week share their KW label`,
        labels[0] === labels[1] && labels[2] === labels[3] && labels[0] !== labels[2],
        JSON.stringify(labels),
    );
    check(`${layout}: the label reads "KW nn"`, /^KW\s*\d+$/.test(labels[0] ?? ''), String(labels[0]));
}

// ── 3. multi-day: one entry per day ──────────────────────────────────────────

// A three-day all-day run — iCal DTEND is exclusive, so it ends on day 4.
const run = [row('r1', 'Urlaub', day(1), day(4), 'Familie', true)];

await show({ layout: 'default', rows: run, sources: oneSource });
const unsplit = await rowInfo();
check('a multi-day run is one row by default', unsplit.length === 1, JSON.stringify(unsplit.map((r) => r.text)));

for (const layout of ['default', 'agenda']) {
    await show({ layout, rows: run, sources: oneSource, options: { multiDaySplit: true } });
    const info = await rowInfo();
    check(`${layout}: the run becomes one row per day`, info.length === 3, String(info.length));
    check(
        `${layout}: every day keeps the event title`,
        info.length === 3 && info.every((r) => r.text.includes('Urlaub')),
        JSON.stringify(info.map((r) => r.text)),
    );
    check(
        `${layout}: the badge numbers the days of the run`,
        info.length === 3 && info.every((r, i) => r.text.includes(`Tag ${i + 1}/3`)),
        JSON.stringify(info.map((r) => r.text)),
    );
}

// The day parts must not re-trigger the span/running display of a multi-day event.
await show({
    layout: 'default',
    rows: run,
    sources: oneSource,
    options: { multiDaySplit: true, multiDayDisplay: 'span' },
});
const spanned = await rowInfo();
check(
    'a day part shows a single date, not a span',
    spanned.length === 3 && spanned.every((r) => !r.text.includes('–')),
    JSON.stringify(spanned.map((r) => r.text)),
);

// Splitting and the week column work together — 3 days from a Sunday cross a week.
const sunday = (() => {
    const d = day(0);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); // the coming Sunday
    return d;
})();
await show({
    layout: 'agenda',
    rows: [row('r2', 'Reise', sunday, off(sunday, 3, 0), 'Familie', true)],
    sources: oneSource,
    options: { multiDaySplit: true, showWeek: true },
});
const crossing = await rowInfo();
check(
    'a run split across a week boundary opens the new week',
    crossing.length === 3 && JSON.stringify(crossing.map((r) => r.week)) === '["first","first","repeat"]',
    JSON.stringify(crossing.map((r) => r.week)),
);

// ── 4. custom layout gets the new field and the icon component ───────────────

scenario += 1;
const customDp = `demo.ical.${scenario}.data.table`;
await page.evaluate(
    ([dp, val]) => {
        window.__auraShot.mockServerState({ [dp]: val });
        window.__auraShot.showWidgets([
            {
                id: 'w-cal-custom',
                type: 'calendar',
                title: 'Termine',
                datapoint: '',
                layout: 'custom',
                gridPos: { x: 0, y: 0, w: 8, h: 10 },
                options: {
                    calendars: [
                        {
                            id: 'c0',
                            type: 'adapter',
                            url: '',
                            datapoint: dp,
                            color: '#3b82f6',
                            showName: true,
                            name: 'Familie',
                            icon: 'lucide:home',
                        },
                    ],
                    maxEvents: 20,
                    daysAhead: 60,
                    refreshInterval: 0,
                    customGrid: {
                        cols: 2,
                        rows: 1,
                        cells: [
                            { type: 'component', componentKey: 'cal-icon', row: 0, col: 0 },
                            { type: 'field', fieldKey: 'kw', row: 0, col: 1 },
                        ],
                    },
                },
            },
        ]);
    },
    [customDp, JSON.stringify([row('c1', 'Zahnarzt', day(1, 9), day(1, 10), 'Familie')])],
);
await page.waitForTimeout(700);
const custom = await page.evaluate(() => {
    const el = document.querySelector('.react-grid-item .aura-custom-grid');
    return {
        icons: el ? el.querySelectorAll('svg').length : -1,
        text: el?.textContent ?? '',
    };
});
check('custom layout renders the cal-icon component', custom.icons >= 1, JSON.stringify(custom));
check('custom layout renders the kw field', /KW\s*\d+/.test(custom.text), JSON.stringify(custom));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
