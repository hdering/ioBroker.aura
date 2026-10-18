// Verifies the three Kalender additions of #618 in the rendered widget:
//   1. own CSS classes for the parts of an event row (.aura-cal-name, -summary,
//      -date, -location, -dot, -bar), so custom CSS no longer has to grab .flex-1,
//   2. `showCalDot` hides the coloured marker (dot in Default, bar in Agenda),
//   3. `calNameAlign` aligns the calendar name and `calIconSize` sizes the
//      per-calendar icon.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/calendar-name-style.mjs
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
const row = (id, event, start, end, calName, location = '') => ({
    event,
    _date: iso(start),
    _end: iso(end),
    _IDID: id,
    _calName: calName,
    _allDay: false,
    location,
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

/** Renders one calendar widget over a mocked ical table. */
async function show({ layout = 'default', rows: tableRows, sources, options = {}, awaitIcon = false } = {}) {
    scenario += 1;
    const dp = `demo.ical.style${scenario}.data.table`;
    const widget = {
        id: `w-calstyle-${scenario}`,
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
    if (awaitIcon) {
        await page.waitForSelector('.react-grid-item .aura-cal-source-icon', { timeout: 15000 }).catch(() => {});
    }
}

/** How many elements of a class the widget renders, and the text of the first one. */
const cls = (selector) =>
    page.evaluate((sel) => {
        const els = [...document.querySelectorAll(`.react-grid-item ${sel}`)];
        return { count: els.length, text: els[0]?.textContent ?? '' };
    }, selector);

/** Computed style of the first match. */
const style = (selector, prop) =>
    page.evaluate(
        ([sel, p]) => {
            const el = document.querySelector(`.react-grid-item ${sel}`);
            return el ? getComputedStyle(el)[p] : null;
        },
        [selector, prop],
    );

const twoEvents = [
    row('a1', 'Zahnarzt', day(1, 9), day(1, 10), 'Familie', 'Praxis Mitte'),
    row('a2', 'Sprint-Review', day(2, 14), day(2, 15), 'Familie'),
];
const oneSource = [{ name: 'Familie', calFilter: 'Familie', color: '#3b82f6', icon: 'lucide:home' }];

// ── 1. own classes per part of the row ───────────────────────────────────────

await show({ layout: 'default', rows: twoEvents, sources: oneSource, options: { calNameAlways: true } });
check('default: .aura-cal-name marks the calendar name', (await cls('.aura-cal-name')).text === 'Familie');
check('default: .aura-cal-summary marks the event title', (await cls('.aura-cal-summary')).text === 'Zahnarzt');
check('default: .aura-cal-date marks the date', /./.test((await cls('.aura-cal-date')).text));
check('default: .aura-cal-location marks the location', (await cls('.aura-cal-location')).text === 'Praxis Mitte');
check('default: .aura-cal-dot marks the coloured dot', (await cls('.aura-cal-dot')).count === 2);

await show({ layout: 'agenda', rows: twoEvents, sources: oneSource });
// On auto width the cell stacks an invisible sizer of every name behind the real
// one, so its text repeats — the class still marks exactly the name cell.
check('agenda: .aura-cal-name marks the calendar name', (await cls('.aura-cal-name')).text.includes('Familie'));
check('agenda: .aura-cal-summary marks the event title', (await cls('.aura-cal-summary')).text === 'Zahnarzt');
check('agenda: .aura-cal-bar marks the coloured bar', (await cls('.aura-cal-bar')).count === 2);

for (const layout of ['card', 'compact']) {
    await show({ layout, rows: twoEvents, sources: oneSource });
    check(`${layout}: .aura-cal-name marks the calendar name`, (await cls('.aura-cal-name')).text === 'Familie');
    check(`${layout}: .aura-cal-summary marks the event title`, (await cls('.aura-cal-summary')).text === 'Zahnarzt');
}

// The name class must not sit on anything else — that was the whole point of #618.
await show({ layout: 'default', rows: twoEvents, sources: oneSource, options: { calNameAlways: true } });
const nameCount = await cls('.aura-cal-name');
check('default: one name element per event, nothing else', nameCount.count === 2, JSON.stringify(nameCount));

// ── 2. showCalDot ────────────────────────────────────────────────────────────

await show({ layout: 'default', rows: twoEvents, sources: oneSource, options: { showCalDot: false } });
const noDot = await cls('.aura-cal-dot');
check('default: showCalDot=false removes the dot', noDot.count === 0, JSON.stringify(noDot));
check('default: the event survives without its dot', (await cls('.aura-cal-summary')).text === 'Zahnarzt');

await show({ layout: 'agenda', rows: twoEvents, sources: oneSource, options: { showCalDot: false } });
check('agenda: showCalDot=false removes the bar', (await cls('.aura-cal-bar')).count === 0);

// ── 3. calNameAlign and calIconSize ──────────────────────────────────────────

await show({
    layout: 'default',
    rows: twoEvents,
    sources: oneSource,
    options: { calNameAlways: true, calNameAlign: 'right' },
});
check('default: calNameAlign=right right-aligns the name', (await style('.aura-cal-name', 'textAlign')) === 'right');
check(
    'default: the summary keeps its own alignment',
    (await style('.aura-cal-summary', 'textAlign')) !== 'right',
    String(await style('.aura-cal-summary', 'textAlign')),
);

await show({
    layout: 'default',
    rows: twoEvents,
    sources: oneSource,
    options: { calNameAlways: true, calNameAlign: 'center' },
});
check('default: calNameAlign=center centers the name', (await style('.aura-cal-name', 'textAlign')) === 'center');

await show({
    layout: 'agenda',
    rows: twoEvents,
    sources: oneSource,
    options: { calNameWidth: 30, calNameAlign: 'right' },
});
check(
    'agenda: calNameAlign=right right-aligns the fixed name column',
    (await style('.aura-cal-name', 'textAlign')) === 'right',
    String(await style('.aura-cal-name', 'textAlign')),
);

await show({ layout: 'default', rows: twoEvents, sources: oneSource, awaitIcon: true });
const autoSize = await style('.aura-cal-source-icon', 'width');
check('default: the icon keeps its layout size by default', autoSize === '12px', String(autoSize));

await show({ layout: 'default', rows: twoEvents, sources: oneSource, options: { calIconSize: 24 }, awaitIcon: true });
const bigSize = await style('.aura-cal-source-icon', 'width');
check('default: calIconSize=24 resizes the calendar icon', bigSize === '24px', String(bigSize));

await show({ layout: 'compact', rows: twoEvents, sources: oneSource, options: { calIconSize: 24 }, awaitIcon: true });
const bigCompact = await style('.aura-cal-source-icon', 'width');
check('compact: calIconSize reaches the single-event layouts', bigCompact === '24px', String(bigCompact));

// ── 4. the editor writes those options ───────────────────────────────────────

await page.evaluate(() => {
    window.__auraShot.showWidgets(
        [
            {
                id: 'w-cal-edit',
                type: 'calendar',
                title: 'Termine',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 8, h: 10 },
                options: { calendars: [] },
            },
        ],
        { editMode: true },
    );
    window.__auraShot.setEditMode(true);
});
const opts = () => page.evaluate(() => window.__auraShot.widgetOptions('w-cal-edit'));

await page.locator('.aura-edit-chrome button').first().click();
await page.locator('button:text-is("Bearbeiten")').click();
const dlg = page.locator('.aura-widget-edit-modal');
await dlg.waitFor({ timeout: 10000 });
// The visible fields start folded - unfold every section.
await page.evaluate(() =>
    document
        .querySelectorAll('.aura-widget-edit-modal details[data-aura-config-section]')
        .forEach((d) => (d.open = true)),
);

// Alignment lives in the calendar block, the title alignment in "Darstellung" —
// scope by the row label so the two pill rows never mix up.
const alignRow = dlg.locator('div:has(> span:text-is("Kalendername ausrichten"))').last();
await alignRow.waitFor({ timeout: 10000 });
await alignRow.locator('button:text-is("Rechts")').click();
await page.waitForTimeout(300);
check('the editor writes calNameAlign', (await opts()).calNameAlign === 'right', String((await opts()).calNameAlign));

const sizeRow = dlg.locator('div:has(> div > label:text-is("Größe Kalender-Icon"))').last();
await sizeRow.locator('input[type="range"]').fill('18');
await page.waitForTimeout(300);
check('the editor writes calIconSize', (await opts()).calIconSize === 18, String((await opts()).calIconSize));

// The visibility toggles sit in "Sichtbare Felder" (unfolded above).
const dotSwitch = dlg.locator('[data-aura-vis-key="showCalDot"] button[role="switch"]');
await dotSwitch.waitFor({ timeout: 10000 });
await dotSwitch.click();
await page.waitForTimeout(300);
check('the editor writes showCalDot', (await opts()).showCalDot === false, String((await opts()).showCalDot));

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exit(1);
