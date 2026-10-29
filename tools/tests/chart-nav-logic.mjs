// Paging a chart by its active range — utils/chartNav.ts (issue #871).
//
//   node tools/tests/chart-nav-logic.mjs
//
// Pure module, driven directly with a fixed "now": windows for both anchors, stepping by the
// chip's span (calendar months included), chip switches that keep the date, the forward limit,
// and the datapoint formats. Runs in Europe/Berlin so the DST switch days are real.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

if (process.env.TZ !== 'Europe/Berlin') {
    const r = spawnSync(process.execPath, process.argv.slice(1), {
        stdio: 'inherit',
        env: { ...process.env, TZ: 'Europe/Berlin' },
    });
    process.exit(r.status ?? 1);
}

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-chart-nav-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/chartNav.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const nav = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let n = 0;
const check = (name, fn) => {
    fn();
    n++;
    console.log(`  ok  ${name}`);
};

const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const fmt = (ms) => {
    const d = new Date(ms);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const win = (w) => `${fmt(w.start)} → ${fmt(w.end)}`;
// Tue 28 Oct 2025, 14:30 — three days after the autumn DST switch.
const NOW = at(2025, 10, 28, 14, 30);
const DAY = nav.navSpan('24h');
const WEEK = nav.navSpan('7d');
const MONTH = nav.navSpan('custom', 1, 'M');
const SIX_H = nav.navSpan('6h');

check('spans: presets, custom hours as days, total has none', () => {
    assert.deepEqual(DAY, { value: 1, unit: 'd' });
    assert.deepEqual(WEEK, { value: 7, unit: 'd' });
    assert.deepEqual(nav.navSpan('custom', 48, 'h'), { value: 2, unit: 'd' });
    assert.deepEqual(nav.navSpan('custom', 3, 'M'), { value: 3, unit: 'M' });
    assert.equal(nav.navSpan('total'), null);
});

check('"today" is the window ending with today — for both anchors', () => {
    for (const anchor of ['end', 'start']) {
        const ref = nav.todayRef(DAY, anchor, NOW);
        assert.equal(win(nav.navWindow(DAY, ref, anchor)), '2025-10-28 00:00 → 2025-10-29 00:00');
        const wref = nav.todayRef(WEEK, anchor, NOW);
        assert.equal(win(nav.navWindow(WEEK, wref, anchor)), '2025-10-22 00:00 → 2025-10-29 00:00');
        assert.ok(nav.isTodayRef(wref, WEEK, anchor, NOW));
    }
    const h = nav.todayRef(SIX_H, 'end', NOW);
    assert.equal(win(nav.navWindow(SIX_H, h, 'end')), '2025-10-28 09:00 → 2025-10-28 15:00');
});

check('picked day: end anchor ends with it, start anchor starts on it', () => {
    const day = at(2025, 10, 3, 12);
    const e = nav.refFromDay(day, 'end');
    assert.equal(win(nav.navWindow(WEEK, e, 'end')), '2025-09-27 00:00 → 2025-10-04 00:00');
    const s = nav.refFromDay(day, 'start');
    assert.equal(win(nav.navWindow(WEEK, s, 'start')), '2025-10-03 00:00 → 2025-10-10 00:00');
    assert.equal(nav.isoDay(nav.dayOfRef(e, 'end')), '2025-10-03');
    assert.equal(nav.isoDay(nav.dayOfRef(s, 'start')), '2025-10-03');
});

check('24 h on the DST day is the whole calendar day (25 h)', () => {
    const ref = nav.refFromDay(at(2025, 10, 26), 'end');
    const w = nav.navWindow(DAY, ref, 'end');
    assert.equal(win(w), '2025-10-26 00:00 → 2025-10-27 00:00');
    assert.equal(w.end - w.start, 25 * 3_600_000);
});

check('stepping moves by the chip span; from rolling a step back is the previous window', () => {
    const today = nav.todayRef(WEEK, 'end', NOW);
    const back = nav.stepRef(null, WEEK, -1, 'end', NOW);
    assert.equal(win(nav.navWindow(WEEK, back, 'end')), '2025-10-15 00:00 → 2025-10-22 00:00');
    assert.equal(nav.stepRef(back, WEEK, 1, 'end', NOW), today);
    const m = nav.stepRef(nav.todayRef(MONTH, 'end', NOW), MONTH, -1, 'end', NOW);
    assert.equal(win(nav.navWindow(MONTH, m, 'end')), '2025-08-29 00:00 → 2025-09-29 00:00');
});

check('forward stops where the next window would start in the future', () => {
    const today = nav.todayRef(DAY, 'end', NOW);
    assert.equal(nav.canStepForward(today, DAY, 'end', NOW), false);
    assert.equal(nav.stepRef(today, DAY, 1, 'end', NOW), today);
    const yesterday = nav.stepRef(today, DAY, -1, 'end', NOW);
    assert.equal(nav.canStepForward(yesterday, DAY, 'end', NOW), true);
    assert.equal(nav.canStepForward(null, DAY, 'end', NOW), false);
    // start anchor: a week from yesterday may reach into the future, the next one may not.
    const s = nav.refFromDay(at(2025, 10, 27), 'start');
    assert.equal(nav.normalizeRef(s, WEEK, 'start', NOW), s);
    assert.equal(nav.canStepForward(s, WEEK, 'start', NOW), false);
});

check('chip switch keeps the date; today stays today', () => {
    const oct3 = nav.refFromDay(at(2025, 10, 3), 'end');
    const r = nav.switchRef(oct3, DAY, WEEK, 'end', NOW);
    assert.equal(win(nav.navWindow(WEEK, r, 'end')), '2025-09-27 00:00 → 2025-10-04 00:00');
    const todayStart = nav.todayRef(WEEK, 'start', NOW);
    const r2 = nav.switchRef(todayStart, WEEK, DAY, 'start', NOW);
    assert.equal(win(nav.navWindow(DAY, r2, 'start')), '2025-10-28 00:00 → 2025-10-29 00:00');
    // Hours → days snaps to the day boundary instead of an 18:00–18:00 window.
    const h = nav.stepRef(nav.todayRef(SIX_H, 'end', NOW), SIX_H, -1, 'end', at(2025, 10, 28, 23, 50));
    const snapped = nav.switchRef(h, SIX_H, DAY, 'end', at(2025, 10, 28, 23, 50));
    assert.equal(fmt(snapped), '2025-10-29 00:00');
});

check('datapoint date: parse and format round-trip', () => {
    assert.equal(nav.parseNavDate(null, 'end'), undefined);
    assert.equal(nav.parseNavDate('', 'end'), null);
    assert.equal(nav.parseNavDate(0, 'end'), null);
    assert.equal(nav.parseNavDate('now', 'end'), null);
    assert.equal(nav.parseNavDate('kaputt', 'end'), undefined);
    const e = nav.parseNavDate('2025-10-03', 'end');
    assert.equal(fmt(e), '2025-10-04 00:00');
    assert.equal(nav.formatNavDate(e, 'end', false), '2025-10-03');
    assert.equal(nav.formatNavDate(nav.parseNavDate('2025-10-03', 'start'), 'start', false), '2025-10-03');
    assert.equal(nav.formatNavDate(e, 'end', true), e);
    assert.equal(nav.parseNavDate(e, 'end'), e);
    assert.equal(nav.parseNavDate(String(e), 'end'), e);
    const t = at(2025, 10, 28, 15);
    assert.equal(nav.formatNavDate(t, 'end', false), '2025-10-28T15:00');
    assert.equal(nav.parseNavDate('2025-10-28T15:00', 'end'), t);
    assert.equal(nav.formatNavDate(null, 'end', false), '');
    assert.equal(nav.formatNavDate(null, 'end', true), 0);
});

check('commands', () => {
    assert.equal(nav.parseNavCommand('prev'), 'prev');
    assert.equal(nav.parseNavCommand('Next'), 'next');
    assert.equal(nav.parseNavCommand('heute'), 'today');
    assert.equal(nav.parseNavCommand('now'), 'now');
    assert.equal(nav.parseNavCommand(-1), 'prev');
    assert.equal(nav.parseNavCommand(1), 'next');
    assert.equal(nav.parseNavCommand(''), null);
    assert.equal(nav.parseNavCommand(true), null);
});

// ── Forecasts: windows in the future ──────────────────────────────────────────────────────────

check('without a horizon nothing changes: ▶ off from rolling and from today', () => {
    for (const anchor of ['end', 'start']) {
        assert.equal(nav.canStepForward(null, WEEK, anchor, NOW), false);
        assert.equal(nav.canStepForward(nav.todayRef(WEEK, anchor, NOW), WEEK, anchor, NOW), false);
        assert.equal(nav.canStepForward(null, WEEK, anchor, NOW, { horizon: NOW }), false);
    }
});

check('fixed horizon: ▶ pages into the future up to the limit', () => {
    const f = nav.parseNavFuture('16d');
    assert.deepEqual(f, { kind: 'fixed', span: { value: 16, unit: 'd' } });
    const lim = { horizon: nav.futureHorizon(f, undefined, NOW) };
    // From rolling: the window after today's.
    let ref = nav.stepRef(null, DAY, 1, 'start', NOW, lim);
    assert.equal(win(nav.navWindow(DAY, ref, 'start')), '2025-10-29 00:00 → 2025-10-30 00:00');
    let steps = 1;
    while (nav.canStepForward(ref, DAY, 'start', NOW, lim)) {
        ref = nav.stepRef(ref, DAY, 1, 'start', NOW, lim);
        steps++;
    }
    // The last window starts before now + 16 d (13 Nov 14:30): 13 Nov.
    assert.equal(win(nav.navWindow(DAY, ref, 'start')), '2025-11-13 00:00 → 2025-11-14 00:00');
    assert.equal(steps, 16);
    // Back still works as before.
    assert.equal(nav.stepRef(ref, DAY, -1, 'start', NOW, lim), at(2025, 11, 12));
});

check('data horizon: ▶ while a point lies past the window end', () => {
    const f = nav.parseNavFuture('data');
    const newest = at(2025, 11, 2, 12); // last forecast point: 2 Nov 12:00
    const lim = { horizon: nav.futureHorizon(f, newest, NOW) };
    // Window 1 Nov – 2 Nov holds no point past its end? It ends 2 Nov 00:00, the point is later.
    assert.equal(nav.canStepForward(at(2025, 11, 1), DAY, 'start', NOW, lim), true);
    // Window 2 Nov holds the last point — nothing behind it.
    assert.equal(nav.canStepForward(at(2025, 11, 2), DAY, 'start', NOW, lim), false);
    // No future data at all = no future.
    assert.equal(nav.futureHorizon(f, null, NOW), NOW);
    // Unknown yet: any future window is accepted (a date datapoint on mount).
    assert.equal(nav.futureHorizon(f, undefined, NOW), Infinity);
    assert.equal(nav.futureHorizon(nav.parseNavFuture('none'), newest, NOW), NOW);
    assert.equal(nav.parseNavFuture('x').kind, 'none');
});

check('picked day / datapoint date in the future: kept below the horizon, else today', () => {
    const lim = { horizon: at(2025, 11, 13, 14, 30) };
    assert.equal(nav.normalizeRef(at(2025, 11, 5), WEEK, 'start', NOW, lim), at(2025, 11, 5));
    assert.equal(nav.normalizeRef(at(2025, 11, 20), WEEK, 'start', NOW, lim), nav.todayRef(WEEK, 'start', NOW, lim));
    // Without a horizon the old rule: a future start falls back to today.
    assert.equal(nav.normalizeRef(at(2025, 11, 5), WEEK, 'start', NOW), nav.todayRef(WEEK, 'start', NOW));
});

check('current window "starts-today": today and the days after it', () => {
    const lim = { current: 'starts-today' };
    const two = nav.navSpan('custom', 2, 'd');
    for (const anchor of ['end', 'start']) {
        const ref = nav.todayRef(two, anchor, NOW, lim);
        assert.equal(win(nav.navWindow(two, ref, anchor)), '2025-10-28 00:00 → 2025-10-30 00:00');
        assert.ok(nav.isTodayRef(ref, two, anchor, NOW, lim));
        const w = nav.todayRef(WEEK, anchor, NOW, lim);
        assert.equal(win(nav.navWindow(WEEK, w, anchor)), '2025-10-28 00:00 → 2025-11-04 00:00');
    }
    const h = nav.todayRef(SIX_H, 'start', NOW, lim);
    assert.equal(win(nav.navWindow(SIX_H, h, 'start')), '2025-10-28 14:00 → 2025-10-28 20:00');
    // A chip switch keeps "today" today under the same rule.
    const ref = nav.switchRef(nav.todayRef(two, 'start', NOW, lim), two, WEEK, 'start', NOW, lim);
    assert.equal(ref, nav.todayRef(WEEK, 'start', NOW, lim));
});

check('lead tokens', () => {
    assert.equal(nav.parseLead('36h', NOW), 36 * 3_600_000);
    assert.equal(nav.parseLead('0h', NOW), 0);
    assert.equal(nav.parseLead('1d', NOW), 86_400_000);
    assert.equal(nav.parseLead('', NOW), null);
    assert.equal(nav.parseLead(undefined, NOW), null);
});

console.log(`chart-nav-logic: ${n} checks passed`);
