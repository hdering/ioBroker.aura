// User-defined time-range chips of the chart widgets — utils/rangeChips.ts (issue #709).
//
//   node tools/tests/range-chips.mjs
//
// Pure module, driven directly: token parsing, the preset mapping that keeps an unchanged chip
// list fetching exactly like the built-in one, and the calendar maths for months and years.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';

const cache = join(process.cwd(), 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = join(cache, `aura-range-chips-${process.pid}.mjs`);
await build({
    stdin: {
        contents: "export * from './src-vis/utils/rangeChips.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'warning',
});
const { parseRangeToken, parseRangeChips, unitSpanMs, rangeKey } = await import(pathToFileURL(bundle).href);
rmSync(bundle, { force: true });

let n = 0;
const check = (name, fn) => {
    fn();
    n++;
    console.log(`  ok  ${name}`);
};

check('preset tokens stay presets', () => {
    for (const p of ['1h', '6h', '24h', '7d', '30d', '1y']) {
        const c = parseRangeToken(p);
        assert.equal(c.range, p);
        assert.equal(c.value, undefined);
    }
    assert.equal(parseRangeToken('total').range, 'total');
    assert.equal(parseRangeToken('Gesamt').key, 'total');
});

check('other tokens become custom ranges', () => {
    const c = parseRangeToken('3M');
    assert.deepEqual([c.range, c.value, c.unit, c.key, c.label], ['custom', 3, 'M', '3M', '3 Monate']);
    assert.equal(parseRangeToken('2w').label, '2 Wochen');
    assert.equal(parseRangeToken('1M').label, '1 Monat');
    assert.equal(parseRangeToken('12h').label, '12 Std');
    assert.equal(parseRangeToken(' 2y ').label, '2 Jahre');
});

check('captions after "="', () => {
    const c = parseRangeToken('3M=Quartal');
    assert.equal(c.label, 'Quartal');
    assert.equal(c.key, '3M');
    assert.equal(parseRangeToken('24h=Tag').range, '24h');
});

check('invalid tokens are rejected', () => {
    for (const bad of ['', '0d', '5m', '3x', 'M', '1000d', 12, null, '3 Monate']) {
        assert.equal(parseRangeToken(bad), null, String(bad));
    }
});

check('list parsing: array or string, duplicates dropped, order kept', () => {
    assert.deepEqual(
        parseRangeChips(['1M', '2M', 'bad', '1M=Doppelt', 'total']).map((c) => c.key),
        ['1M', '2M', 'total'],
    );
    assert.deepEqual(
        parseRangeChips('1M, 3M;6M\n12M').map((c) => c.key),
        ['1M', '3M', '6M', '12M'],
    );
    assert.deepEqual(parseRangeChips(undefined), []);
    assert.deepEqual(parseRangeChips({}), []);
});

check('rangeKey matches a configured custom range to its chip', () => {
    assert.equal(rangeKey('custom', 24, 'h'), '24h');
    assert.equal(rangeKey('custom', 3, 'M'), parseRangeToken('3M').key);
    assert.equal(rangeKey('7d'), '7d');
    assert.equal(rangeKey('custom', undefined, undefined), '24h');
});

check('fixed units are plain multiples', () => {
    assert.equal(unitSpanMs(5, 'h'), 5 * 3_600_000);
    assert.equal(unitSpanMs(2, 'd'), 2 * 86_400_000);
    assert.equal(unitSpanMs(2, 'w'), 14 * 86_400_000);
});

check('months and years count back on the calendar', () => {
    const at = (y, m, d, h = 13) => new Date(y, m, d, h, 7, 0).getTime();
    const now = at(2026, 8, 24); // 24 Sep 2026
    assert.equal(now - unitSpanMs(3, 'M', now), at(2026, 5, 24)); // → 24 Jun
    assert.equal(now - unitSpanMs(12, 'M', now), at(2025, 8, 24));
    assert.equal(now - unitSpanMs(2, 'y', now), at(2024, 8, 24));
    // 31 Mar − 1 month has no 31 Feb: clamp to the last day, never roll into March.
    const mar31 = at(2026, 2, 31);
    assert.equal(mar31 - unitSpanMs(1, 'M', mar31), at(2026, 1, 28));
    // 29 Feb − 1 year → 28 Feb.
    const leap = at(2028, 1, 29);
    assert.equal(leap - unitSpanMs(1, 'y', leap), at(2027, 1, 28));
    // Stable within a day — the widget uses it as a hook dependency.
    assert.equal(unitSpanMs(3, 'M', now), unitSpanMs(3, 'M', now + 3_600_000));
});

console.log(`range-chips: ${n} checks passed`);
