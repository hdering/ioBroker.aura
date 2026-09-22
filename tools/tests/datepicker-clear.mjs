// ─────────────────────────────────────────────────────────────────────────────
// Datumswähler — emptying a field must empty the datapoint (issue #695)
// ─────────────────────────────────────────────────────────────────────────────
// Every date field carries a way to clear it: the native panels bring their own
// "Leeren" button, a free-text pattern field can simply be deleted. That cleared
// the INPUT only — the widget wrote nothing, so the old value came straight back
// on the next reload.
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/datepicker-clear.mjs
//
// Runs against the screenshot harness (__auraShot): values live in the in-memory
// cache and writes are logged instead of sent, so no datapoint is ever touched.
import { chromium } from 'playwright';

const BASE = process.env.AURA_BASE ?? 'http://localhost:5174';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${BASE}/?shot=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__auraShot?.ready, { timeout: 20000 });

const DP = 'demo.date';
/** 2025-01-15 13:30 local — the value every field starts from. */
const TS = new Date(2025, 0, 15, 13, 30, 0, 0).getTime();

// Every render gets its own widget id: the harness keeps a widget it has already
// shown mounted, and a mounted picker holds the field state it started with —
// only a fresh mount reads a new datapoint value (issue #683).
let seq = 0;
const nextId = (prefix) => `${prefix}-${++seq}`;

/** The widget from the issue report: a datepicker on a string datapoint. */
function datepicker(options, layout = 'default') {
    return {
        id: nextId('w-dp'),
        type: 'datepicker',
        title: 'Geöffnet am',
        datapoint: DP,
        layout,
        gridPos: { x: 0, y: 0, w: 16, h: 6 },
        options: { showCurrentValue: true, ...options },
    };
}

/** Same picker as a cell of a custom-layout widget — "im Universal" in the report. */
function universal(cell) {
    return {
        id: nextId('w-uni'),
        type: 'universal',
        title: 'Universal',
        datapoint: '',
        layout: 'custom',
        gridPos: { x: 0, y: 0, w: 16, h: 6 },
        options: { customGrid: { cols: 1, rows: 1, cells: [{ type: 'datepicker', dpId: DP, ...cell }] } },
    };
}

/** Same picker as a row of a list widget. */
function list(entry) {
    return {
        id: nextId('w-list'),
        type: 'list',
        title: 'Liste',
        datapoint: '',
        layout: 'default',
        gridPos: { x: 0, y: 0, w: 24, h: 6 },
        options: { entries: [{ id: DP, label: 'Termin', role: 'value', displayType: 'datepicker', ...entry }] },
    };
}

/** Renders one widget on `value` and arms a fresh write log. */
async function show(widget, value) {
    await page.evaluate(
        ([w, v, dp]) => {
            window.__auraShot.writes(true); // arm + reset the write log
            window.__auraShot.mock({ [dp]: v });
            window.__auraShot.showWidgets([w]);
        },
        [widget, value, DP],
    );
    await page.waitForTimeout(400);
    // The first widget of a session subscribes after its first paint — push once more.
    await page.evaluate(([v, dp]) => window.__auraShot.mock({ [dp]: v }), [value, DP]);
    await page.waitForTimeout(300);
}

/** Field state plus the widget's own "Gesetzt: …" line. */
function fields() {
    const of = (t) => document.querySelector(`.aura-widget input[type="${t}"]`);
    return {
        kinds: [...document.querySelectorAll('.aura-widget input')].map((i) => i.type),
        date: of('date')?.value ?? null,
        time: of('time')?.value ?? null,
        month: of('month')?.value ?? null,
        text: of('text')?.value ?? null,
        widgetText: document.querySelector('.aura-widget')?.innerText?.trim() ?? '',
    };
}

/** Empties a native field the way its picker's "Leeren" button does. */
async function clearNative(kind) {
    await page.locator(`.aura-widget input[type="${kind}"]`).first().fill('');
    await page.waitForTimeout(250);
    return page.evaluate(() => window.__auraShot?.lastWrite ?? null);
}

/** Empties a free-text pattern field and commits it (blur). */
async function clearText() {
    const f = page.locator('.aura-widget input[type="text"]').first();
    await f.fill('');
    await f.blur();
    await page.waitForTimeout(250);
    return page.evaluate(() => window.__auraShot?.lastWrite ?? null);
}

// ── 1. The reported case: custom output format on a string datapoint ─────────
await show(datepicker({ outputFormat: 'custom', outputPattern: 'dd.MM.yyyy' }), '15.01.2025');
const wroteCustom = await clearNative('date');
check(
    'clearing the date field empties a string datapoint',
    wroteCustom?.id === DP && wroteCustom?.val === '',
    JSON.stringify(wroteCustom),
);

// …and an emptied datapoint reads back as empty — what the reload showed wrong.
await show(datepicker({ outputFormat: 'custom', outputPattern: 'dd.MM.yyyy' }), '');
const afterClear = await page.evaluate(fields);
check('an empty datapoint leaves the field empty', afterClear.date === '', JSON.stringify(afterClear));
check('an empty datapoint reads "Gesetzt: –"', afterClear.widgetText.includes('–'), afterClear.widgetText);

// ── 2. A timestamp datapoint is a number — it cannot hold '' ────────────────
await show(datepicker({ outputFormat: 'timestamp_ms' }), TS);
const wroteTs = await clearNative('date');
check('clearing a timestamp datapoint writes 0', wroteTs?.val === 0, JSON.stringify(wroteTs));

await show(datepicker({ outputFormat: 'timestamp_ms' }), 0);
const afterZero = await page.evaluate(fields);
check(
    'a zero timestamp reads as empty, not as 1970',
    afterZero.date === '' && afterZero.widgetText.includes('–'),
    JSON.stringify(afterZero),
);

// ── 3. Extra time field: clearing either one clears the datapoint ───────────
await show(datepicker({ outputFormat: 'de_datetime', showTime: true }), '15.01.2025 13:30');
const wroteDate = await clearNative('date');
check('date+time: clearing the date clears the value', wroteDate?.val === '', JSON.stringify(wroteDate));

// A cleared TIME beside a date is midnight — the value must not stay on 13:30.
await show(datepicker({ outputFormat: 'de_datetime', showTime: true }), '15.01.2025 13:30');
const wroteMidnight = await clearNative('time');
check(
    'date+time: clearing the time falls back to midnight',
    wroteMidnight?.val === '15.01.2025 00:00',
    JSON.stringify(wroteMidnight),
);

// ── 4. Time only ────────────────────────────────────────────────────────────
await show(datepicker({ outputFormat: 'time_hhmm', timeOnly: true }), '13:30');
const wroteTimeOnly = await clearNative('time');
check('clearing a time-only field empties the datapoint', wroteTimeOnly?.val === '', JSON.stringify(wroteTimeOnly));

// ── 5. Custom input patterns — native field and free text ───────────────────
await show(
    datepicker({ inputFormat: 'custom', inputPattern: 'MM.yyyy', outputFormat: 'custom', outputPattern: 'MM.yyyy' }),
    '01.2025',
);
const wroteMonth = await clearNative('month');
check('clearing a month field empties the datapoint', wroteMonth?.val === '', JSON.stringify(wroteMonth));

await show(
    datepicker({ inputFormat: 'custom', inputPattern: 'yyyy', outputFormat: 'custom', outputPattern: 'yyyy' }),
    '2025',
);
const wroteText = await clearText();
check('clearing a pattern text field empties the datapoint', wroteText?.val === '', JSON.stringify(wroteText));

// ── 6. The same picker inside the other two hosts ───────────────────────────
await show(universal({ dateOutputFormat: 'custom', dateOutputPattern: 'dd.MM.yyyy' }), '15.01.2025');
const wroteUni = await clearNative('date');
check('universal cell: clearing empties the datapoint', wroteUni?.val === '', JSON.stringify(wroteUni));

await show(list({ dateOutputFormat: 'custom', dateOutputPattern: 'dd.MM.yyyy' }), '15.01.2025');
const wroteList = await clearNative('date');
check('list entry: clearing empties the datapoint', wroteList?.val === '', JSON.stringify(wroteList));

// ── 7. An already empty datapoint must not be written again ────────────────
await show(datepicker({ outputFormat: 'custom', outputPattern: 'dd.MM.yyyy' }), '');
await page.locator('.aura-widget input[type="date"]').first().fill('');
await page.waitForTimeout(250);
const idleWrites = await page.evaluate(() => window.__auraShot.writes().length);
check('clearing an already empty field writes nothing', idleWrites === 0, `writes=${idleWrites}`);

check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
