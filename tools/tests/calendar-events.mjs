// Verifies the day arithmetic behind the Kalender widget — utils/calendarEvents.ts.
//
//   node tools/tests/calendar-events.mjs
//
// No dev server needed: the module is pure (its only import is the equally pure
// utils/timeDisplay), so esbuild bundles it and the test drives it directly.
//
// Covered: "Mehrtägige Termine → Jeden Tag einzeln" (#608) must produce exactly one
// entry per calendar day, each of them single-day again — otherwise the span and the
// running badge would keep firing on every part — and the calendar-week column must
// label the first entry of each week, across a year boundary too.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-calendar-events-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { splitMultiDay, isMultiDay, eventEndDay, sameDay, firstOfWeekFlags, clockLabel, endClockLabel, timeSpanLabel } from './src-vis/utils/calendarEvents.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { splitMultiDay, isMultiDay, firstOfWeekFlags, clockLabel, endClockLabel, timeSpanLabel } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

const d = (y, m, day, h = 0, mi = 0) => new Date(y, m - 1, day, h, mi);
/** "YYYY-MM-DD HH:mm" of a local date — readable enough to diff in the output. */
const stamp = (x) =>
    x == null
        ? null
        : `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')} ` +
          `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;

// ── all-day run: iCal DTEND is exclusive ──────────────────────────────────────

// Mon 7 Sep – Wed 9 Sep 2026 as an all-day event, i.e. DTEND = Thu 10 Sep.
const allDayRun = { uid: 'a', summary: 'Urlaub', start: d(2026, 9, 7), end: d(2026, 9, 10), allDay: true };

check('all-day run is multi-day before the split', isMultiDay(allDayRun) === true);

const allDayParts = splitMultiDay([allDayRun]);
eq('all-day run yields one entry per day', allDayParts.length, 3);
eq(
    'all-day parts start on consecutive days',
    allDayParts.map((p) => stamp(p.start)),
    ['2026-09-07 00:00', '2026-09-08 00:00', '2026-09-09 00:00'],
);
eq(
    'all-day parts keep the exclusive next-midnight end',
    allDayParts.map((p) => stamp(p.end)),
    ['2026-09-08 00:00', '2026-09-09 00:00', '2026-09-10 00:00'],
);
check(
    'no all-day part is multi-day any more',
    allDayParts.every((p) => isMultiDay(p) === false),
);
eq(
    'all-day parts are numbered',
    allDayParts.map((p) => `${p.dayIndex}/${p.dayCount}`),
    ['1/3', '2/3', '3/3'],
);
eq('all-day parts get distinct uids', new Set(allDayParts.map((p) => p.uid)).size, 3);
check(
    'all-day parts keep the other event fields',
    allDayParts.every((p) => p.summary === 'Urlaub' && p.allDay === true),
);

// ── timed run: only the first part keeps its clock time ───────────────────────

// Fri 4 Sep 14:00 – Sun 6 Sep 10:00 2026.
const timedRun = { uid: 'b', summary: 'Messe', start: d(2026, 9, 4, 14, 0), end: d(2026, 9, 6, 10, 0), allDay: false };

const timedParts = splitMultiDay([timedRun]);
eq('timed run yields one entry per day', timedParts.length, 3);
eq(
    'timed run keeps the start time only on day 1',
    timedParts.map((p) => stamp(p.start)),
    ['2026-09-04 14:00', '2026-09-05 00:00', '2026-09-06 00:00'],
);
eq(
    'the follow-up days of a timed run read as all-day',
    timedParts.map((p) => p.allDay),
    [false, true, true],
);
check(
    'no timed part is multi-day any more',
    timedParts.every((p) => isMultiDay(p) === false),
);
eq('the last timed part keeps the real end', stamp(timedParts[2].end), '2026-09-06 10:00');

// ── events that must pass through untouched ───────────────────────────────────

const single = { uid: 'c', summary: 'Termin', start: d(2026, 9, 4, 9, 0), end: d(2026, 9, 4, 10, 0), allDay: false };
const noEnd = { uid: 'd', summary: 'Offen', start: d(2026, 9, 4, 9, 0), allDay: false };
const oneDayAllDay = { uid: 'e', summary: 'Feiertag', start: d(2026, 10, 3), end: d(2026, 10, 4), allDay: true };
const untouched = splitMultiDay([single, noEnd, oneDayAllDay]);
eq('single-day events are not split', untouched.length, 3);
check(
    'single-day events keep their identity and carry no day counter',
    untouched[0] === single && untouched[1] === noEnd && untouched[2] === oneDayAllDay,
);
eq(
    'a mixed list keeps its order',
    splitMultiDay([single, allDayRun, noEnd]).map((p) => p.uid),
    ['c', 'a#d0', 'a#d1', 'a#d2', 'd'],
);

// ── calendar week column ──────────────────────────────────────────────────────

// Mon 31 Aug (KW 36) · Fri 4 Sep (KW 36) · Mon 7 Sep (KW 37) · Tue 8 Sep (KW 37)
eq(
    'only the first entry of a week is flagged',
    firstOfWeekFlags([d(2026, 8, 31), d(2026, 9, 4), d(2026, 9, 7), d(2026, 9, 8)]),
    [true, false, true, false],
);
eq('an empty list has no flags', firstOfWeekFlags([]), []);
eq('a single entry always opens its week', firstOfWeekFlags([d(2026, 9, 4)]), [true]);

// Thu 31 Dec 2026 is ISO week 53 of 2026, Fri 1 Jan 2027 still is — one week, not two.
eq(
    'a week spanning the year boundary is not split',
    firstOfWeekFlags([d(2026, 12, 31), d(2027, 1, 1), d(2027, 1, 4)]),
    [true, false, true],
);
// 1 Jan 2029 is a Monday, i.e. ISO week 1 — the previous days belong to week 52 of 2028.
eq('week 52 and week 1 stay apart across the year boundary', firstOfWeekFlags([d(2028, 12, 29), d(2029, 1, 1)]), [
    true,
    true,
]);

// ── clock labels: the "bis" time of the custom layout ─────────────────────

const timed = { uid: 't', summary: 'Zahnarzt', start: d(2026, 9, 4, 9, 0), end: d(2026, 9, 4, 10, 30), allDay: false };
eq('clockLabel pads to HH:MM', clockLabel(d(2026, 9, 4, 9, 5)), '09:05');
eq('endClockLabel is the end of a timed event', endClockLabel(timed), '10:30');
eq('timeSpanLabel reads von – bis', timeSpanLabel(timed), '09:00 – 10:30');

// An all-day event has no clock time to print — "00:00 – 00:00" would be noise.
eq('an all-day event has no end time', endClockLabel(allDayRun), '');
eq('an all-day event has no time span', timeSpanLabel(allDayRun), '');

// Sources that send no DTEND, or one that is not after the start, leave it empty.
eq(
    'a timed event without an end has no end time',
    endClockLabel({ uid: 'n', start: d(2026, 9, 4, 9, 0), allDay: false }),
    '',
);
eq(
    'a timed event without an end still spans its start',
    timeSpanLabel({ uid: 'n', start: d(2026, 9, 4, 9, 0), allDay: false }),
    '09:00',
);
eq(
    'an end at the start is not a span',
    timeSpanLabel({ uid: 'z', start: d(2026, 9, 4, 9, 0), end: d(2026, 9, 4, 9, 0), allDay: false }),
    '09:00',
);

// ── summary ──────────────────────────────────────────────────────────────────

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.name} - ${f.detail}`);
    process.exit(1);
}
