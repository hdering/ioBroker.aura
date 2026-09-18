// Verifies how the fill widget reads its two optional status datapoints (#671):
// "is it charging" and "is it still connected".
//
//   node tools/tests/fill-status-logic.mjs
//
// No dev server needed — the rule that turns a datapoint value into a yes/no is pure
// and is bundled with esbuild. What matters here: the four conditions (flag, inverted
// flag, positive and negative power), and that a value which has not arrived yet never
// lights up a bolt and never declares a device offline.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-fill-status-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export { conditionMet, resolveFillStatus, FILL_CONDITIONS } from './src-vis/utils/fillStatus.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { conditionMet, resolveFillStatus, FILL_CONDITIONS } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let failed = 0;
const check = (label, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
    if (!ok) failed++;
};
const eq = (label, actual, expected) =>
    check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);

// ── the four conditions ───────────────────────────────────────────────────
check('all four conditions are offered', JSON.stringify(FILL_CONDITIONS) === '["true","false","gt0","lt0"]');

check('true: a boolean flag', conditionMet(true, 'true') === true);
check('true: a cleared flag is not a match', conditionMet(false, 'true') === false);
check('true: 1 counts', conditionMet(1, 'true') === true);
check('true: 0 does not', conditionMet(0, 'true') === false);
check('true: a charge power counts as charging', conditionMet(1200, 'true') === true);
check('true: the string "true" counts', conditionMet('true', 'true') === true);
check('true: the string "ON" counts', conditionMet('ON', 'true') === true);

// UNREACH is the classic inverted flag: true means gone.
check('false: an inverted flag matches on false', conditionMet(false, 'false') === true);
check('false: and not on true', conditionMet(true, 'false') === false);
check('false: 0 matches', conditionMet(0, 'false') === true);
check('false: a non-zero number does not', conditionMet(-3, 'false') === false);

check('gt0: charging power', conditionMet(750, 'gt0') === true);
check('gt0: feeding back is not charging', conditionMet(-750, 'gt0') === false);
check('gt0: standing still is not charging', conditionMet(0, 'gt0') === false);
check('lt0: feeding back matches', conditionMet(-750, 'lt0') === true);
check('lt0: charging does not', conditionMet(750, 'lt0') === false);

// ── nothing known is never a statement ────────────────────────────────────
for (const cond of FILL_CONDITIONS) {
    check(`${cond}: undefined is no match`, conditionMet(undefined, cond) === false);
    check(`${cond}: null is no match`, conditionMet(null, cond) === false);
    check(`${cond}: an empty string is no match`, conditionMet('', cond) === false);
    check(`${cond}: text is no match`, conditionMet('kaputt', cond) === false);
}
check('the default condition is "true"', conditionMet(true) === true && conditionMet(0) === false);

// ── the widget's view of both datapoints ──────────────────────────────────
const CH = 'hm.0.dev.CHARGING';
const UN = 'hm.0.dev.UNREACH';

eq('without datapoints nothing is claimed', resolveFillStatus({}, {}), {
    charging: false,
    connected: null,
    offline: false,
    effect: 'none',
});
eq(
    'a charging battery with the blink effect',
    resolveFillStatus({ chargeDatapoint: CH, chargeEffect: 'blink' }, { [CH]: true }),
    { charging: true, connected: null, offline: false, effect: 'blink' },
);
eq(
    'the effect stops as soon as the charging stops',
    resolveFillStatus({ chargeDatapoint: CH, chargeEffect: 'scan' }, { [CH]: false }),
    { charging: false, connected: null, offline: false, effect: 'none' },
);
eq(
    'an UNREACH datapoint read as "false = connected"',
    resolveFillStatus({ connectedDatapoint: UN, connectedCondition: 'false' }, { [UN]: false }),
    { charging: false, connected: true, offline: false, effect: 'none' },
);
eq(
    'and the same datapoint when the device is gone',
    resolveFillStatus({ connectedDatapoint: UN, connectedCondition: 'false' }, { [UN]: true }),
    { charging: false, connected: false, offline: true, effect: 'none' },
);
// A reload must not grey out every battery for the seconds before the states arrive.
eq('a connection datapoint without a value yet is not "offline"', resolveFillStatus({ connectedDatapoint: UN }, {}), {
    charging: false,
    connected: null,
    offline: false,
    effect: 'none',
});
eq(
    'both at once: a PV storage charging while reachable',
    resolveFillStatus(
        {
            chargeDatapoint: CH,
            chargeCondition: 'gt0',
            chargeEffect: 'scan',
            connectedDatapoint: UN,
            connectedCondition: 'false',
        },
        { [CH]: 2400, [UN]: false },
    ),
    { charging: true, connected: true, offline: false, effect: 'scan' },
);
eq(
    'a datapoint of a different widget in the map changes nothing',
    resolveFillStatus({ chargeDatapoint: CH }, { 'other.dp': true }),
    { charging: false, connected: null, offline: false, effect: 'none' },
);

console.log(failed === 0 ? '\nAll fill-status checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed ? 1 : 0);
