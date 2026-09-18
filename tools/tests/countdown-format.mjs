// Digit formatting of the Countdown widget (#675): rounding up to whole seconds,
// the four formats, the day prefix, preset labels and the duration parser.
//
//   node tools/tests/countdown-format.mjs
//
// No dev server needed: the util is pure, so it is bundled with esbuild and run directly.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-countdown-format-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { formatCountdown, remainingSeconds, formatPreset, parseDurationText, splitDuration } from './src-vis/utils/countdownFormat.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { formatCountdown, remainingSeconds, formatPreset, parseDurationText, splitDuration } = await import(
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

const H = 3600_000;
const M = 60_000;

// ── 1. Rounding: a countdown shows the second still to come ──
{
    eq('59.4 s → 60 whole seconds', remainingSeconds(59_400), 60);
    eq('exactly 59 s stays 59', remainingSeconds(59_000), 59);
    eq('1 ms → 1 s (not 0)', remainingSeconds(1), 1);
    eq('0 → 0', remainingSeconds(0), 0);
    eq('negative → 0', remainingSeconds(-5000), 0);
    eq('NaN → 0', remainingSeconds(NaN), 0);
}

// ── 2. auto: mm:ss below one hour, hh:mm:ss from one hour on ──
{
    eq('auto 14:59', formatCountdown(14 * M + 59_000), '14:59');
    eq('auto 59.4 s reads 01:00', formatCountdown(59_400), '01:00');
    eq('auto 0', formatCountdown(0), '00:00');
    eq('auto exactly 1 h', formatCountdown(H), '01:00:00');
    eq('auto 1 h 00 m 00.5 s → 01:00:01', formatCountdown(H + 500), '01:00:01');
    eq('auto 25 h keeps counting hours', formatCountdown(25 * H + 4 * M + 5_000), '25:04:05');
}

// ── 3. hms / ms / hm ──
{
    eq('hms below an hour pads hours', formatCountdown(5 * M, 'hms'), '00:05:00');
    eq('ms total minutes', formatCountdown(90 * M, 'ms'), '90:00');
    eq('ms 1 h 30 m 5 s', formatCountdown(90 * M + 5_000, 'ms'), '90:05');
    eq('hm rounds seconds up to the next minute', formatCountdown(H + 5 * M + 1_000, 'hm'), '01:06');
    eq('hm exact minute stays', formatCountdown(H + 5 * M, 'hm'), '01:05');
    eq('hm 0', formatCountdown(0, 'hm'), '00:00');
}

// ── 4. showDays ──
{
    eq('2 d 03:04:05', formatCountdown(2 * 24 * H + 3 * H + 4 * M + 5_000, 'auto', true), '2d 03:04:05');
    eq('exactly one day', formatCountdown(24 * H, 'auto', true), '1d 00:00:00');
    eq('below a day: no prefix', formatCountdown(23 * H, 'auto', true), '23:00:00');
    eq('days + ms format', formatCountdown(24 * H + 90 * M, 'ms', true), '1d 90:00');
    eq('below an hour with showDays stays mm:ss', formatCountdown(5 * M, 'auto', true), '05:00');
}

// ── 5. preset labels ──
{
    eq('45 s', formatPreset(45), '45 s');
    eq('5 min', formatPreset(300), '5 min');
    eq('1:30', formatPreset(90), '1:30');
    eq('1 h', formatPreset(3600), '1 h');
    eq('1:30 h', formatPreset(5400), '1:30 h');
    eq('invalid → empty', formatPreset(0), '');
}

// ── 6. duration parser (config panel + presets) ──
{
    eq('plain seconds', parseDurationText('90'), 90);
    eq('m:s', parseDurationText('1:30'), 90);
    eq('h:m:s', parseDurationText('1:00:00'), 3600);
    eq('5m', parseDurationText('5m'), 300);
    eq('1h', parseDurationText('1h'), 3600);
    eq('1h30m', parseDurationText('1h30m'), 5400);
    eq('1h 30m 15s', parseDurationText('1h 30m 15s'), 5415);
    eq('45s', parseDurationText('45s'), 45);
    eq('15min', parseDurationText('15min'), 900);
    eq('garbage → null', parseDurationText('soon'), null);
    eq('empty → null', parseDurationText('  '), null);
}

// ── 7. split ──
{
    eq('split 5415', splitDuration(5415), { h: 1, m: 30, s: 15 });
    eq('split 0', splitDuration(0), { h: 0, m: 0, s: 0 });
    eq('split negative → 0', splitDuration(-3), { h: 0, m: 0, s: 0 });
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
