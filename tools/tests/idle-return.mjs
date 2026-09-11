// Precedence rules of the auto-return timer (issue #638): the scoped dashboard
// setting, a delay/snooze datapoint per device, the same pair for all devices,
// the tab on screen and an open fullscreen overlay all have a say in whether the
// kiosk drives back to its default tab.
//
//   node tools/tests/idle-return.mjs
//
// No dev server needed: utils/idleReturn.ts is pure, so it is bundled with
// esbuild and exercised directly.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-idle-return-${process.pid}.mjs`);
await build({
    stdin: {
        contents:
            "export { toSnoozeMinutes, toDelayOverride, resolveSnooze, resolveDelayOverride, resolveIdleReturn } from './src-vis/utils/idleReturn.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { toSnoozeMinutes, toDelayOverride, resolveSnooze, resolveDelayOverride, resolveIdleReturn } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

const results = [];
const eq = (name, got, want) =>
    results.push({ name, ok: got === want, detail: `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}` });

// ── 1. Datapoint values ──
{
    eq('snooze: 15 minutes', toSnoozeMinutes(15), 15);
    eq('snooze: 0 = no pause', toSnoozeMinutes(0), 0);
    eq('snooze: negative is no pause', toSnoozeMinutes(-5), 0);
    eq('snooze: null is no pause', toSnoozeMinutes(null), 0);
    eq('snooze: text is no pause', toSnoozeMinutes('bogus'), 0);
    eq('snooze: numeric string counts', toSnoozeMinutes('20'), 20);
    eq('snooze: fractions round', toSnoozeMinutes(14.6), 15);

    eq('delay: -1 = not set', toDelayOverride(-1), null);
    eq('delay: 0 = switched off', toDelayOverride(0), 0);
    eq('delay: 60 seconds', toDelayOverride(60), 60);
    eq('delay: null = not set', toDelayOverride(null), null);
    eq('delay: text = not set', toDelayOverride('x'), null);
}

// ── 2. Scope precedence ──
{
    eq('snooze: the longer pause wins', resolveSnooze(5, 20), 20);
    eq('snooze: global alone pauses', resolveSnooze(10, 0), 10);
    eq('snooze: client alone pauses', resolveSnooze(0, 10), 10);
    eq('delay: the client wins', resolveDelayOverride(60, 10), 10);
    eq('delay: global applies when the client is unset', resolveDelayOverride(60, null), 60);
    eq('delay: an explicit client 0 beats a global delay', resolveDelayOverride(60, 0), 0);
    eq('delay: nothing set stays null', resolveDelayOverride(null, null), null);
}

// ── 3. Arming ──
const base = {
    configEnabled: true,
    configDelay: 30,
    delayOverride: null,
    snoozeMinutes: 0,
    tabExempt: false,
    fullscreen: false,
};
{
    eq('configured on → armed', resolveIdleReturn(base).armed, true);
    eq('configured delay is used', resolveIdleReturn(base).delaySec, 30);
    eq('configured off → not armed', resolveIdleReturn({ ...base, configEnabled: false }).armed, false);
    eq('a configured delay of 0 cannot arm', resolveIdleReturn({ ...base, configDelay: 0 }).armed, false);
}

// ── 4. The datapoint is a full override, in both directions ──
{
    const off = resolveIdleReturn({ ...base, delayOverride: 0 });
    eq('delay 0 switches a configured timer off', off.armed, false);
    const on = resolveIdleReturn({ ...base, configEnabled: false, delayOverride: 120 });
    eq('delay > 0 arms a device whose dashboard has it off', on.armed, true);
    eq('the override delay is the one used', on.delaySec, 120);
}

// ── 5. Pause, tab opt-out and fullscreen ──
{
    eq('a running pause disarms', resolveIdleReturn({ ...base, snoozeMinutes: 1 }).armed, false);
    eq('an expired pause re-arms', resolveIdleReturn({ ...base, snoozeMinutes: 0 }).armed, true);
    eq('an exempt tab disarms', resolveIdleReturn({ ...base, tabExempt: true }).armed, false);
    eq('fullscreen disarms', resolveIdleReturn({ ...base, fullscreen: true }).armed, false);
    // A pause outranks an override that would otherwise arm the timer — the
    // person standing at the tablet is the last word.
    eq(
        'a pause beats a delay override',
        resolveIdleReturn({ ...base, configEnabled: false, delayOverride: 120, snoozeMinutes: 5 }).armed,
        false,
    );
    eq(
        'the delay stays readable while paused',
        resolveIdleReturn({ ...base, delayOverride: 120, snoozeMinutes: 5 }).delaySec,
        120,
    );
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? '  ok  ' : '  FAIL'} ${r.name}${r.ok ? '' : ` - ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
}
