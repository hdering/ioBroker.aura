// Verifies the status overview option "Höhe automatisch an Inhalt anpassen"
// (autoHeight): the widget reports its rendered height to autoHeightStore and the
// dashboard sizes the grid item to it instead of the stored gridPos.h.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/status-overview-auto-height.mjs
//
// Every scenario uses a FRESH widget id on purpose: that is the case an extra
// unmount effect used to break — it cleared the store height the freshly attached
// ref had just reported (StrictMode double-invoke), leaving the item at its stored
// height. Only the ref callback may touch the store.
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

let scenario = 0;

/** Renders one status overview and returns the grid item + measured content height. */
async function show({ rows, autoHeight, layout = 'default' }) {
    scenario += 1;
    await page.evaluate(
        ([w]) => window.__auraShot.showWidgets([w]),
        [
            {
                id: `w-so-${scenario}`,
                type: 'statusoverview',
                title: 'Statusübersicht',
                datapoint: '',
                layout,
                gridPos: { x: 0, y: 0, w: 6, h: rows },
                options: { autoHeight },
            },
        ],
    );
    // one paint for the datapoint scan, one for the ResizeObserver report
    await page.waitForTimeout(1000);
    return page.evaluate(() => {
        const item = document.querySelector('.react-grid-item');
        // The widget root is the first child of the frame's padding box.
        const root = item?.querySelector('div[class*="flex flex-col"]');
        return {
            item: item ? Math.round(item.getBoundingClientRect().height) : -1,
            content: root ? Math.round(root.getBoundingClientRect().height) : -1,
        };
    });
}

// ── 1. option off: the stored box wins ─────────────────────────────────────
const off = await show({ rows: 20, autoHeight: false });
check('fixed height keeps the stored box', off.item === boxPx(20), `${off.item}px, expected ${boxPx(20)}px`);

// ── 2. option on, too-tall box: shrinks to the content ─────────────────────
const tall = await show({ rows: 20, autoHeight: true });
check('autoHeight shrinks a too-tall box', tall.item < boxPx(20), `${tall.item}px vs box ${boxPx(20)}px`);
check(
    'grid item covers the measured content',
    tall.item >= tall.content,
    `item ${tall.item}px, content ${tall.content}px`,
);
// Content + frame chrome, rounded up to whole grid rows — one row of slack.
check(
    'grid item is not padded beyond one row',
    tall.item - tall.content < ROW + GAP + 24,
    `item ${tall.item}px, content ${tall.content}px`,
);

// ── 3. option on, too-short box: grows past it ─────────────────────────────
const short = await show({ rows: 2, autoHeight: true });
check('autoHeight grows a too-short box', short.item > boxPx(2), `${short.item}px vs box ${boxPx(2)}px`);
check('same content → same height in any box', short.item === tall.item, `${short.item}px vs ${tall.item}px`);

// ── 4. option off again: back to the stored box ────────────────────────────
const back = await show({ rows: 20, autoHeight: false });
check('switching autoHeight off restores the box', back.item === boxPx(20), `${back.item}px, expected ${boxPx(20)}px`);

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
