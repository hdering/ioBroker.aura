// Verifies the calendar option "Höhe automatisch an Inhalt anpassen" (autoHeight):
// the widget grows with its entries and the grid item is sized to the measured
// content instead of the stored gridPos.h — the same mechanism the status overview
// uses. The custom layout keeps its fixed box (CustomGridView is height:100%).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/calendar-auto-height.mjs
//
// Uses the screenshot harness (__auraShot): the ical table of the adapter source is
// served through mockServerState, so no real datapoint is read or written.
// Checked: the fixed box scrolls internally, autoHeight grows a too-short box and
// shrinks a too-tall one, the list then has no inner scrollbar, agenda behaves like
// default, the height follows the entry count, and layout=custom ignores the option.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';
const ROW = 20; // gridRowHeight of the harness layout
const GAP = 10;
const boxPx = (rows) => rows * ROW + (rows - 1) * GAP;

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};

// The widget caches its fetched events, so every scenario gets its own widget id and
// table datapoint — that remounts the component instead of reading a stale event list.
let scenario = 0;

/** ical-adapter table rows: `count` events, one per day starting tomorrow. */
function table(count) {
    const rows = [];
    const base = new Date();
    base.setHours(9, 0, 0, 0);
    for (let i = 0; i < count; i++) {
        const start = new Date(base.getTime() + (i + 1) * 86400000);
        const end = new Date(start.getTime() + 3600000);
        rows.push({
            event: `Termin ${i + 1}`,
            _date: start.toISOString(),
            _end: end.toISOString(),
            _IDID: `ev-${i}`,
            _calName: 'Familie',
            location: 'Zuhause',
        });
    }
    return JSON.stringify(rows);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

async function show({ layout = 'default', rows = 10, autoHeight = false, events = 5, maxEvents = 5 } = {}) {
    scenario += 1;
    const dp = `demo.ical.${scenario}.data.table`;
    const widget = {
        id: `w-cal-${scenario}`,
        type: 'calendar',
        title: 'Termine',
        datapoint: '',
        layout,
        gridPos: { x: 0, y: 0, w: 6, h: rows },
        options: {
            calendars: [
                {
                    id: 'c1',
                    type: 'adapter',
                    url: '',
                    datapoint: dp,
                    name: 'Familie',
                    color: '#3b82f6',
                    showName: true,
                },
            ],
            maxEvents,
            daysAhead: 30,
            refreshInterval: 0,
            autoHeight,
            // the custom layout needs a cell so the grid view renders something
            cells:
                layout === 'custom'
                    ? [{ id: 'c', row: 0, col: 0, type: 'value', field: 'summary', align: 'left' }]
                    : undefined,
        },
    };
    await page.evaluate(
        ([w, dp, val]) => {
            window.__auraShot.mockServerState({ [dp]: val });
            window.__auraShot.showWidgets([w]);
        },
        [widget, dp, table(events)],
    );
    // one paint for the fetch, one for the ResizeObserver report
    await page.waitForTimeout(800);
}

const itemHeight = () =>
    page.evaluate(() => {
        const el = document.querySelector('.react-grid-item');
        return el ? Math.round(el.getBoundingClientRect().height) : -1;
    });

/** Height of the widget's own root (the measured content) and whether it scrolls. */
const contentInfo = () =>
    page.evaluate(() => {
        const el = document.querySelector('.react-grid-item .aura-widget-row');
        if (!el) return null;
        const scroller = [...el.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 1);
        return {
            h: Math.round(el.getBoundingClientRect().height),
            scrolls: !!scroller,
            entries: el.querySelectorAll('[data-calendar-event]').length,
        };
    });

// ── 1. fixed height: the box wins, the list scrolls ─────────────────────────
await show({ rows: 4, autoHeight: false, events: 8, maxEvents: 8 });
const fixedH = await itemHeight();
const fixedInfo = await contentInfo();
check('fixed height keeps the stored box', fixedH === boxPx(4), `${fixedH}px, expected ${boxPx(4)}px`);
check('fixed height scrolls internally', fixedInfo?.scrolls === true, JSON.stringify(fixedInfo));

// ── 2. autoHeight in a too-short box: grows, no inner scrollbar ─────────────
await show({ rows: 4, autoHeight: true, events: 8, maxEvents: 8 });
const grownH = await itemHeight();
const grownInfo = await contentInfo();
check('autoHeight grows a too-short box', grownH > boxPx(4), `${grownH}px vs box ${boxPx(4)}px`);
check('autoHeight shows every entry', grownInfo?.entries === 8, String(grownInfo?.entries));
check('autoHeight has no inner scrollbar', grownInfo?.scrolls === false, JSON.stringify(grownInfo));
check(
    'grid item covers the measured content',
    !!grownInfo && grownH >= grownInfo.h,
    `item ${grownH}px, content ${grownInfo?.h}px`,
);
// Content + frame chrome, rounded up to whole grid rows — one row of slack.
check(
    'grid item is not padded beyond one row',
    !!grownInfo && grownH - grownInfo.h < ROW + GAP + 24,
    `item ${grownH}px, content ${grownInfo?.h}px`,
);

// ── 3. autoHeight in a too-tall box: shrinks to the content ────────────────
await show({ rows: 20, autoHeight: true, events: 3, maxEvents: 8 });
const shrunkH = await itemHeight();
const shrunkInfo = await contentInfo();
check('autoHeight shrinks a too-tall box', shrunkH < boxPx(20), `${shrunkH}px vs box ${boxPx(20)}px`);
check('autoHeight keeps all 3 entries', shrunkInfo?.entries === 3, String(shrunkInfo?.entries));

// ── 4. the height follows the entry count ──────────────────────────────────
await show({ rows: 20, autoHeight: true, events: 6, maxEvents: 8 });
const sixH = await itemHeight();
check('more entries → taller item', sixH > shrunkH, `6 entries ${sixH}px vs 3 entries ${shrunkH}px`);

// ── 5. agenda layout behaves the same ──────────────────────────────────────
await show({ layout: 'agenda', rows: 20, autoHeight: true, events: 4, maxEvents: 8 });
const agendaH = await itemHeight();
const agendaInfo = await contentInfo();
check('agenda shrinks to its content', agendaH < boxPx(20), `${agendaH}px vs box ${boxPx(20)}px`);
check('agenda has no inner scrollbar', agendaInfo?.scrolls === false, JSON.stringify(agendaInfo));

// ── 6. custom layout ignores the option (needs a definite height) ──────────
await show({ layout: 'custom', rows: 8, autoHeight: true, events: 4 });
const customH = await itemHeight();
check('custom layout keeps the stored box', customH === boxPx(8), `${customH}px, expected ${boxPx(8)}px`);

// ── 7. turning the option off restores the fixed box ───────────────────────
await show({ rows: 20, autoHeight: false, events: 3, maxEvents: 8 });
const backH = await itemHeight();
check('switching autoHeight off restores the box', backH === boxPx(20), `${backH}px, expected ${boxPx(20)}px`);

// ── 8. mobile stack: the option grows the stacked cell too ─────────────────
// Below the mobile breakpoint the dashboard stacks the widgets and gives each one a
// fixed gridPos.h box; auto-height widgets get no height at all and size to content.
const mobile = await ctx.newPage();
mobile.on('pageerror', (e) => pageErrors.push(`mobile: ${e.message}`));
await mobile.setViewportSize({ width: 420, height: 900 });
await mobile.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await mobile.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

async function showMobile(autoHeight) {
    scenario += 1;
    const dp = `demo.ical.${scenario}.data.table`;
    await mobile.evaluate(
        ([w, dpid, val]) => {
            window.__auraShot.mockServerState({ [dpid]: val });
            window.__auraShot.showWidgets([w]);
        },
        [
            {
                id: `w-cal-m${scenario}`,
                type: 'calendar',
                title: 'Termine',
                datapoint: '',
                layout: 'default',
                gridPos: { x: 0, y: 0, w: 6, h: 3 },
                options: {
                    calendars: [
                        { id: 'c1', type: 'adapter', url: '', datapoint: dp, name: 'Familie', color: '#3b82f6' },
                    ],
                    maxEvents: 8,
                    daysAhead: 30,
                    refreshInterval: 0,
                    autoHeight,
                },
            },
            dp,
            table(8),
        ],
    );
    await mobile.waitForTimeout(800);
    return mobile.evaluate(() => {
        const el = document.querySelector('.aura-widget-row');
        if (!el) return null;
        const scroller = [...el.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 1);
        return { h: Math.round(el.getBoundingClientRect().height), scrolls: !!scroller };
    });
}

const mobileFixed = await showMobile(false);
const mobileAuto = await showMobile(true);
check('mobile stack is stacked, not a grid', await mobile.evaluate(() => !document.querySelector('.react-grid-item')));
check('mobile fixed height scrolls internally', mobileFixed?.scrolls === true, JSON.stringify(mobileFixed));
check(
    'mobile autoHeight grows instead of scrolling',
    mobileAuto?.scrolls === false && !!mobileFixed && mobileAuto.h > mobileFixed.h,
    `auto ${JSON.stringify(mobileAuto)} vs fixed ${JSON.stringify(mobileFixed)}`,
);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
