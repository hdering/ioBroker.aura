// lib/proxyGuard.js: which proxy targets and requests are refused.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isBlockedAddress, isBlockedHost, guardedLookup, isCrossSite } = require('../../lib/proxyGuard.js');

let pass = 0;
const fails = [];
const check = (name, ok, info = '') => (ok ? pass++ : fails.push(`${name} ${info}`));

for (const ip of [
    '127.0.0.1',
    '127.1.2.3',
    '0.0.0.0',
    '169.254.169.254',
    '::1',
    '::',
    '::ffff:127.0.0.1',
    'fe80::1',
    '[::1]',
]) {
    check(`blocked ${ip}`, isBlockedAddress(ip));
}
for (const ip of ['192.168.1.10', '10.0.0.1', '172.16.0.5', '8.8.8.8', 'fd00::1', '2001:db8::1']) {
    check(`allowed ${ip}`, !isBlockedAddress(ip));
}
check('localhost name', isBlockedHost('localhost') && isBlockedHost('app.localhost'));
check('lan host name passes the literal check', !isBlockedHost('nas.fritz.box'));

const lookup = (host, opts) =>
    new Promise((resolve) => guardedLookup(host, opts, (err, address) => resolve({ err, address })));
const r1 = await lookup('localhost', {});
check('lookup localhost refused', r1.err && r1.err.code === 'EAURABLOCKED', String(r1.err && r1.err.code));
const r2 = await lookup('localhost', { all: true });
check('lookup all:true refused', r2.err && r2.err.code === 'EAURABLOCKED');
const r3 = await lookup('192.168.1.10', {});
check('lookup lan ip passes', !r3.err && r3.address === '192.168.1.10');

check('cross-site', isCrossSite({ headers: { 'sec-fetch-site': 'cross-site' } }));
for (const v of ['same-origin', 'same-site', 'none', undefined]) {
    check(`not cross-site: ${v}`, !isCrossSite({ headers: v ? { 'sec-fetch-site': v } : {} }));
}

console.log(`proxy-guard: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`  FAIL ${f}`);
process.exit(fails.length ? 1 : 0);
