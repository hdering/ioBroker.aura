'use strict';

/**
 * Unit tests for the timer special-day lists (issue #738): single days, ranges
 * ("A/B" and {from,to}), mixed lists, boolean DPs and the legacy day-only format.
 */

const assert = require('assert');
const { parseSpecialDays } = require('../lib/specialDays');

let n = 0;
const test = (name, fn) => {
    fn();
    n++;
    console.log(`  ok  ${name}`);
};

test('legacy JSON list of single days', () => {
    const s = parseSpecialDays('["2026-01-01","2026-12-25"]');
    assert.ok(s.has('2026-01-01'));
    assert.ok(s.has('2026-12-25'));
    assert.ok(!s.has('2026-12-24'));
});

test('array value (already parsed) works too', () => {
    assert.ok(parseSpecialDays(['2026-01-01']).has('2026-01-01'));
});

test('ISO interval "A/B" is inclusive on both ends', () => {
    const s = parseSpecialDays('["2026-07-20/2026-08-07"]');
    assert.ok(s.has('2026-07-20'));
    assert.ok(s.has('2026-07-31'));
    assert.ok(s.has('2026-08-07'));
    assert.ok(!s.has('2026-07-19'));
    assert.ok(!s.has('2026-08-08'));
});

test('object range {from,to} and year boundary', () => {
    const s = parseSpecialDays(JSON.stringify([{ from: '2026-12-28', to: '2027-01-02' }]));
    assert.ok(s.has('2026-12-31'));
    assert.ok(s.has('2027-01-01'));
    assert.ok(!s.has('2027-01-03'));
});

test('mixed list of days and ranges', () => {
    const s = parseSpecialDays(
        JSON.stringify(['2026-05-15', '2026-07-20/2026-07-24', { from: '2026-10-26', to: '2026-10-30' }]),
    );
    assert.ok(s.has('2026-05-15'));
    assert.ok(s.has('2026-07-22'));
    assert.ok(s.has('2026-10-28'));
    assert.ok(!s.has('2026-09-01'));
});

test('reversed range is swapped, unpadded dates are normalized', () => {
    const s = parseSpecialDays('["2026-8-7/2026-7-20", "2026-1-6"]');
    assert.ok(s.has('2026-07-25'));
    assert.ok(s.has('2026-01-06'));
});

test('single entry without array, also without JSON quotes', () => {
    assert.ok(parseSpecialDays('"2026-07-20/2026-07-24"').has('2026-07-21'));
    assert.ok(parseSpecialDays('2026-07-20/2026-07-24').has('2026-07-21'));
    assert.ok(parseSpecialDays('2026-07-20').has('2026-07-20'));
});

test('boolean DP: true = today is special, false = not', () => {
    assert.ok(parseSpecialDays(true).has('2026-03-03'));
    assert.ok(!parseSpecialDays(false).has('2026-03-03'));
    assert.ok(parseSpecialDays('true').has('2026-03-03'));
    assert.ok(!parseSpecialDays('false').has('2026-03-03'));
});

test('empty, null and garbage never match', () => {
    for (const v of [null, undefined, '', '[]', 'kaputt', '["2026-13"]', 42, '[{"to":"2026-01-01"}]']) {
        assert.ok(!parseSpecialDays(v).has('2026-01-01'), String(v));
    }
});

console.log(`special-days: ${n} tests passed`);
