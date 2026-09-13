// Verifies the timestamp mode of a list entry's second line: which of the two
// ioBroker timestamps a slot reads, which format it prints, when the list needs a
// repeating re-render, and that the dynamic list's template passes the id-less
// timestamp slot through.
//
//   node tools/tests/subdp-stamp.mjs
//
// Static list, dynamic list and the list-wide template all go through these
// helpers, so the rules are pinned once here. No dev server needed - the utils are
// pure and are bundled with esbuild.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-subdp-stamp-${process.pid}.mjs`);
await build({
    stdin: {
        contents: [
            "export { isStampSub, stampTs, stampFormat, subDpsNeedTick } from './src-vis/utils/subDpStamp.ts';",
            "export { resolveSubDpTemplate } from './src-vis/utils/subDpTemplate.ts';",
            "export { formatTimeDisplay, TIME_DISPLAY_PRESETS } from './src-vis/utils/timeDisplay.ts';",
            "export { formatLastChange } from './src-vis/utils/formatLastChange.ts';",
        ].join('\n'),
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { isStampSub, stampTs, stampFormat, subDpsNeedTick, resolveSubDpTemplate, formatTimeDisplay } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({
        name,
        ok: JSON.stringify(got) === JSON.stringify(want),
        detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    });
const ok = (name, cond, detail = '') => results.push({ name, ok: !!cond, detail });

// The widgets hand `t` straight through; a stand-in is enough to tell the branches
// apart without pulling the i18n bundle in.
const t = (key, vars) => (vars && vars.n !== undefined ? `${key}:${vars.n}` : vars?.span ? `${key}:${vars.span}` : key);

// ── 1. Which slots are timestamp slots ──
ok('a plain datapoint is not a timestamp slot', !isStampSub({ id: 'a.b' }));
ok('an explicit value source is not one either', !isStampSub({ id: 'a.b', source: 'value' }));
ok('lastChange is a timestamp slot', isStampSub({ id: 'a.b', source: 'lastChange' }));
ok('lastUpdate is a timestamp slot', isStampSub({ id: 'a.b', source: 'lastUpdate' }));
ok('nothing at all is not a timestamp slot', !isStampSub(undefined));

// ── 2. lc versus ts ──
// The whole point of offering both: a sensor that keeps reporting the same value
// has a fresh ts and a stale lc, and only lastUpdate shows that it still answers.
const stale = { ts: 1_700_000_900_000, lc: 1_700_000_000_000 };
eq('lastChange reads lc', stampTs({ id: 'a', source: 'lastChange' }, stale), 1_700_000_000_000);
eq('lastUpdate reads ts', stampTs({ id: 'a', source: 'lastUpdate' }, stale), 1_700_000_900_000);
eq('a value slot reads no timestamp', stampTs({ id: 'a' }, stale), 0);
// A state that never changed since the adapter started carries lc 0 on some
// adapters - "-" would read as "no datapoint" rather than "not changed yet".
eq('lastChange falls back to ts when lc is 0', stampTs({ id: 'a', source: 'lastChange' }, { ts: 42, lc: 0 }), 42);
eq('no state yet yields 0', stampTs({ id: 'a', source: 'lastChange' }, null), 0);
eq('an empty state yields 0', stampTs({ id: 'a', source: 'lastChange' }, {}), 0);

// ── 3. Format defaults to the relative text ──
eq('an unset format means relative', stampFormat({ id: 'a', source: 'lastChange' }), 'relative');
eq(
    'an explicit none means relative too',
    stampFormat({ id: 'a', source: 'lastChange', valueTimeFormat: 'none' }),
    'relative',
);
eq('a picked format wins', stampFormat({ id: 'a', source: 'lastChange', valueTimeFormat: 'datetime' }), 'datetime');

// ── 4. Only a relative text needs the repeating re-render ──
ok('a list of plain values needs no tick', !subDpsNeedTick([{ id: 'a' }, { id: 'b' }]));
ok('a relative timestamp needs a tick', subDpsNeedTick([{ id: 'a' }, { id: 'b', source: 'lastChange' }]));
ok(
    'an absolute timestamp needs none',
    !subDpsNeedTick([{ id: 'b', source: 'lastChange', valueTimeFormat: 'datetime' }]),
);
ok('an empty list needs none', !subDpsNeedTick([]));
ok('an undefined list needs none', !subDpsNeedTick(undefined));

// ── 5. The relative preset ──
// Fixed reference date, so the test says the same thing in a year.
const now = new Date('2026-09-13T12:00:00');
const rel = (msAgo) => formatTimeDisplay(now.getTime() - msAgo, 'relative', t, undefined, now);
eq('a fresh change reads as just now', rel(3_000), 'lc.lessThan10s');
eq('five minutes ago counts minutes', rel(5 * 60_000), 'lc.nMin:5');
eq('three hours ago counts hours', rel(3 * 3_600_000), 'lc.nHours:3');
eq('yesterday counts a day', rel(26 * 3_600_000), 'lc.1Day');
// A datapoint can hold a due date just as well as a last change - the same preset
// has to read forwards too, or "next sunrise" would print "gerade eben".
ok(
    'a future moment reads forwards',
    formatTimeDisplay(now.getTime() + 3 * 3_600_000, 'relative', t, undefined, now).startsWith('clock.rel.in'),
);

// The absolute formats stay untouched by the new preset.
eq('the time format still prints a clock time', formatTimeDisplay(now.getTime(), 'time', t, undefined, now), '12:00');
eq('an unset format still prints nothing', formatTimeDisplay(now.getTime(), undefined, t, undefined, now), null);
eq(
    'an unreadable value still prints nothing',
    formatTimeDisplay('kein Zeitpunkt', 'relative', t, undefined, now),
    null,
);

// ── 6. The list-wide template passes the id-less timestamp slot through ──
// Without this the dynamic list's template would silently drop the most common
// configuration of all: "show me when each discovered row last changed".
const tpl = [{ id: '{{parent}}.BATTERY' }, { id: '', source: 'lastChange' }, { id: '' }, { id: '{{parent9}}.NOPE' }];
const resolved = resolveSubDpTemplate(tpl, 'hm-rpc.0.ABC123.1.STATE');
eq(
    'the template resolves tokens and keeps the id-less timestamp',
    resolved.map((s) => `${s.id}|${s.source ?? ''}`),
    ['hm-rpc.0.ABC123.1.BATTERY|', '|lastChange'],
);
eq('an id-less value slot is still dropped', resolved.filter((s) => !s.id && !s.source).length, 0);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
console.log(`\nsubdp-stamp: ${results.length - failed.length}/${results.length} passed\n`);
process.exit(failed.length ? 1 : 0);
