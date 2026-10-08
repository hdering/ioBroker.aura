// Verifies the history table widget (issue #760).
//
//   npm run dev            (or set AURA_BASE)
//   node tools/tests/history-table.mjs
//
// Checked: "last N values" shows exactly N rows, newest first — also when the adapter ignores
// `returnNewestEntries` and hands out the oldest rows (the hook pages forward); the time-window
// mode only shows rows inside the window; combined vs. split time columns; date/time patterns;
// value texts from `valueLabels` and from `common.states`; booleans and strings survive (the chart
// hook drops them); repeats fold away with hideDuplicates; ascending order; the notice when no
// history adapter is enabled for the datapoint.
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
await page.waitForFunction(() => !!window.__auraShot?.ready, null, { timeout: 60000 });

const now = Date.now();
const MIN = 60_000;
// 50 readings, one every 10 minutes; value = index, so row contents tell which ones came back.
const numeric = Array.from({ length: 50 }, (_, i) => [now - (49 - i) * 10 * MIN, i + 0.25]);

let n = 0;
/**
 * Mounts one table (fresh widget AND datapoint id each time — the harness keeps known widgets
 * mounted and the object cache keeps the first object per id) and returns its cells.
 */
async function render(points, options, { common = {}, logged = true, mockOpts = {}, expectRows = true } = {}) {
    n++;
    const id = `w-histtable-${n}`;
    const dp = `demo.histtable${n}`;
    await page.evaluate(
        ([id, dp, points, options, common, logged, mockOpts]) => {
            const a = window.__auraShot;
            a.mockHistory({ [dp]: points }, mockOpts);
            a.mockObject({
                [dp]: {
                    type: 'state',
                    common: {
                        type: 'mixed',
                        ...(logged ? { custom: { 'history.0': { enabled: true } } } : {}),
                        ...common,
                    },
                },
            });
            const last = points.length ? points[points.length - 1][1] : null;
            a.mock({ [dp]: last });
            a.mockServerState({ [dp]: last });
            a.showWidgets([
                {
                    id,
                    type: 'historytable',
                    title: 'Verlauf',
                    datapoint: dp,
                    layout: 'default',
                    gridPos: { x: 0, y: 0, w: 30, h: 30 },
                    options,
                },
            ]);
        },
        [id, dp, points, options, common, logged, mockOpts],
    );
    const sel = `.aura-widget-${id}`;
    if (expectRows) {
        await page
            .waitForFunction((s) => document.querySelectorAll(`${s} tbody tr`).length > 1, sel, { timeout: 15000 })
            .catch(() => {});
    } else {
        await page.waitForTimeout(1500);
    }
    return page.evaluate((s) => {
        const root = document.querySelector(s);
        if (!root) return null;
        return {
            head: [...root.querySelectorAll('thead th')].map((th) => th.textContent.trim()),
            rows: [...root.querySelectorAll('tbody tr')].map((tr) => [...tr.cells].map((c) => c.textContent.trim())),
            text: root.textContent,
        };
    }, sel);
}

const DT = /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/;

// ── last N values ───────────────────────────────────────────────────────────────
{
    const r = await render(numeric, { historyInstance: 'history.0', historyCount: 5, decimals: 2, unit: 'W' });
    check('count: exactly N rows', r?.rows.length === 5, JSON.stringify(r?.rows.length));
    check(
        'count: newest first',
        r?.rows[0]?.[1] === '49.25 W' && r?.rows[4]?.[1] === '45.25 W',
        JSON.stringify(r?.rows),
    );
    check('count: combined time column reads dd.MM.yyyy HH:mm:ss', DT.test(r?.rows[0]?.[0] ?? ''), r?.rows[0]?.[0]);
    check(
        'count: two columns with default titles',
        JSON.stringify(r?.head) === '["Zeitpunkt","Wert"]',
        JSON.stringify(r?.head),
    );
}
{
    const r = await render(
        numeric,
        { historyInstance: 'history.0', historyCount: 5, decimals: 2 },
        { mockOpts: { ignoreNewest: true } },
    );
    check(
        'count: adapter without returnNewestEntries still yields the newest N',
        r?.rows.length === 5 && r?.rows[0]?.[1] === '49.25' && r?.rows[4]?.[1] === '45.25',
        JSON.stringify(r?.rows.map((x) => x[1])),
    );
}
{
    const r = await render(numeric, { historyInstance: 'history.0', historyCount: 3, decimals: 2, sortOrder: 'asc' });
    check(
        'sortOrder asc: oldest of the N on top',
        r?.rows[0]?.[1] === '47.25' && r?.rows[2]?.[1] === '49.25',
        JSON.stringify(r?.rows),
    );
}

// ── time window ───────────────────────────────────────────────────────────────
{
    // 1 h window over 10-minute readings: the ones at 0, 10 … 50 minutes ago (6), not 60+.
    const r = await render(numeric, {
        historyInstance: 'history.0',
        historyMode: 'range',
        historyRange: '1h',
        decimals: 0,
    });
    const vals = r?.rows.map((x) => x[1]) ?? [];
    check(
        'range: only rows inside the window',
        vals.length >= 6 && vals.length <= 7 && !vals.includes('42'),
        JSON.stringify(vals),
    );
}

// ── split columns + patterns ──────────────────────────────────────────────────
{
    const r = await render(numeric, {
        historyInstance: 'history.0',
        historyCount: 2,
        timeColumns: 'split',
        dateFormat: 'dd.MM.',
        timeFormat: 'HH:mm',
        colValueLabel: 'Leistung',
    });
    check('split: three columns', r?.head.length === 3 && r?.head[2] === 'Leistung', JSON.stringify(r?.head));
    check(
        'split: date and time patterns apply',
        /^\d{2}\.\d{2}\.$/.test(r?.rows[0]?.[0] ?? '') && /^\d{2}:\d{2}$/.test(r?.rows[0]?.[1] ?? ''),
        JSON.stringify(r?.rows[0]),
    );
}

// ── value texts, booleans, strings, repeats ───────────────────────────────────
const bools = [true, true, false, false, false, true, false, true, true, true].map((v, i) => [
    now - (9 - i) * 30 * MIN,
    v,
]);
{
    const r = await render(bools, { historyInstance: 'history.0', historyCount: 10, valueLabels: '0=Aus; 1=An' });
    const vals = r?.rows.map((x) => x[1]) ?? [];
    check(
        'booleans kept and labelled',
        vals.length === 10 && vals[0] === 'An' && vals[3] === 'Aus',
        JSON.stringify(vals),
    );
}
{
    const r = await render(bools, { historyInstance: 'history.0', historyCount: 10, hideDuplicates: true });
    const vals = r?.rows.map((x) => x[1]) ?? [];
    // true true | false false false | true | false | true true true → 5 changes
    check('hideDuplicates folds repeats into the moment of change', vals.length === 5, JSON.stringify(vals));
}
{
    const modes = ['AUTO', 'AUTO', 'MANU', 'BOOST'].map((v, i) => [now - (3 - i) * 60 * MIN, v]);
    const r = await render(
        modes,
        { historyInstance: 'history.0', historyCount: 10 },
        { common: { states: { AUTO: 'Automatik', MANU: 'Manuell' } } },
    );
    const vals = r?.rows.map((x) => x[1]) ?? [];
    check(
        'strings kept, common.states texts applied',
        JSON.stringify(vals) === '["BOOST","Manuell","Automatik","Automatik"]',
        JSON.stringify(vals),
    );
}

// ── no history adapter ────────────────────────────────────────────────────────
{
    const r = await render(numeric, { historyCount: 5 }, { logged: false, expectRows: false });
    check(
        'no adapter: notice instead of a table',
        !!r && r.rows.length === 0 && /History-Adapter/.test(r.text),
        r?.text?.slice(0, 120),
    );
}

check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
