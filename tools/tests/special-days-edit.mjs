// Holiday / vacation lists edited from the timer's frontend popup (#785) — the pure part.
//
//   node tools/tests/special-days-edit.mjs
//
// No dev server needed: utils/specialDays.ts is bundled with esbuild. Checks that the
// frontend reads every format the adapter (lib/specialDays.js) understands, that a
// flag DP is never treated as an editable list, and that writing back keeps foreign
// entries and is read by the adapter exactly as shown in the popup.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { parseSpecialDays } = require('../../lib/specialDays.js');

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-special-days-${process.pid}.mjs`);
await build({
    entryPoints: ['src-vis/utils/specialDays.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { parseSpecialDaysValue, makeEntry, serializeEntries, hasEntry, todayKey } = await import(
    pathToFileURL(bundle).href
);
rmSync(bundle, { force: true });

let failed = 0;
const check = (name, ok, detail = '') => {
    if (ok) console.log(`  ok   ${name}`);
    else {
        failed++;
        console.log(`  FAIL ${name} ${detail}`);
    }
};

// ── Formats ─────────────────────────────────────────────────────────────────
const p1 = parseSpecialDaysValue('["2026-12-24", "2026-12-27/2027-01-03", {"from":"2027-2-1","to":"2027-02-03"}]');
check('JSON string list', p1.kind === 'list' && p1.entries.length === 3, JSON.stringify(p1));
check('range from "A/B"', p1.entries[1].from === '2026-12-27' && p1.entries[1].to === '2027-01-03');
check('{from,to} padded', p1.entries[2].from === '2027-02-01' && p1.entries[2].to === '2027-02-03');
check('raw kept', typeof p1.entries[2].raw === 'object');

check('empty string = empty list', parseSpecialDaysValue('').kind === 'list');
check('null = empty list', parseSpecialDaysValue(null).kind === 'list');
check('"[]" = empty list', parseSpecialDaysValue('[]').kind === 'list');
check('bare day = list', parseSpecialDaysValue('2026-05-01').kind === 'list');
check('reversed range swapped', parseSpecialDaysValue('["2026-05-03/2026-05-01"]').entries[0].from === '2026-05-01');

// ── Flags are never lists ───────────────────────────────────────────────────
for (const v of [true, false, 'true', 'FALSE', ' true ']) {
    const p = parseSpecialDaysValue(v);
    check(`flag ${JSON.stringify(v)}`, p.kind === 'flag', JSON.stringify(p));
}
check('number is invalid', parseSpecialDaysValue(42).kind === 'invalid');
check('garbage text is invalid', parseSpecialDaysValue('hello').kind === 'invalid');

// ── Writing back ────────────────────────────────────────────────────────────
const p2 = parseSpecialDaysValue('["2027-01-10", "kaputt", {"from":"2026-08-01","to":"2026-08-14"}]');
check('malformed entry skipped', p2.entries.length === 2 && p2.skipped.length === 1);
const added = makeEntry('2026-10-20', '2026-10-24');
check('makeEntry range raw', added.raw === '2026-10-20/2026-10-24');
check('makeEntry single raw', makeEntry('2026-10-20', '').raw === '2026-10-20');
check('makeEntry swaps', makeEntry('2026-10-24', '2026-10-20').from === '2026-10-20');
check('makeEntry rejects empty', makeEntry('', '') === null);
check('hasEntry dup', hasEntry(p2.entries, makeEntry('2027-01-10')));

const out = serializeEntries([...p2.entries, added], p2.skipped);
const arr = JSON.parse(out);
check(
    'sorted, object kept, skipped kept at end',
    JSON.stringify(arr) ===
        JSON.stringify([{ from: '2026-08-01', to: '2026-08-14' }, '2026-10-20/2026-10-24', '2027-01-10', 'kaputt']),
    out,
);

// ── Adapter reads what the popup shows ──────────────────────────────────────
const m = parseSpecialDays(out);
for (const [k, want] of [
    ['2026-08-01', true],
    ['2026-08-14', true],
    ['2026-08-15', false],
    ['2026-10-22', true],
    ['2027-01-10', true],
    ['2027-01-11', false],
]) {
    check(`adapter has(${k}) = ${want}`, m.has(k) === want);
}

check(
    'todayKey padded',
    /^\d{4}-\d{2}-\d{2}$/.test(todayKey(new Date(2026, 0, 5))) && todayKey(new Date(2026, 0, 5)) === '2026-01-05',
);

if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
}
console.log('\nspecial-days-edit: all checks passed');
