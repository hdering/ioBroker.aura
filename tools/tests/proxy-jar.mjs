// Cookie jar and capability keys of sandboxed /proxy pages (lib/proxyJar.js, #997).
//
//   node tools/tests/proxy-jar.mjs
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { createProxyJar, parseSetCookie, readCookie, foreignCookies, targetOrigin } = require(
    join(process.cwd(), 'lib/proxyJar.js'),
);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
    if (ok) pass++;
    else fail++;
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail ? ` - ${detail}` : ''}`);
};

let now = 1_000_000;
const jar = createProxyJar({ secret: Buffer.alloc(32, 7), now: () => now });
const id = jar.newJarId();
const u = (s) => new URL(s);

// ── origins and keys ────────────────────────────────────────────────────────
check('origin: ws maps to http', targetOrigin('ws://cam.local:81/x') === 'http://cam.local:81');
check('origin: wss maps to https', targetOrigin('wss://cam.local/x') === 'https://cam.local');
const k = jar.key(id, 'http://cam.local');
check('key verifies for its origin', jar.verifyKey(k, 'http://cam.local') === id);
check('key refused for another origin', jar.verifyKey(k, 'http://router.local') === null);
check('key refused for another port', jar.verifyKey(k, 'http://cam.local:8080') === null);
check('forged mac refused', jar.verifyKey(`${id}.${'A'.repeat(22)}`, 'http://cam.local') === null);
check('garbage refused', jar.verifyKey('x', 'http://cam.local') === null && jar.verifyKey(null, 'x') === null);
const other = createProxyJar({ secret: Buffer.alloc(32, 8) });
check('key of another secret (restart) refused', other.verifyKey(k, 'http://cam.local') === null);
check('jar cookie round-trips', jar.jarFromCookieValue(jar.jarCookieValue(id)) === id);
check('jar cookie with a wrong mac refused', jar.jarFromCookieValue(`${id}.${'B'.repeat(22)}`) === null);
check('a key is no jar cookie', jar.jarFromCookieValue(k) === null);

// ── Set-Cookie parsing ──────────────────────────────────────────────────────
const p = parseSetCookie('a=1; Path=/app; HttpOnly; Secure; Max-Age=60', u('https://x.local/app/page'), now);
check('parse: name/value/path/flags', p.name === 'a' && p.value === '1' && p.path === '/app' && p.httpOnly && p.secure);
check('parse: max-age → expiry', p.expires === now + 60_000);
check('parse: default path is the directory', parseSetCookie('b=2', u('http://x.local/a/b/c')).path === '/a/b');
check(
    'parse: domain of a parent accepted',
    parseSetCookie('c=3; Domain=.local.lan', u('http://x.local.lan/')).hostOnly === false,
);
check('parse: foreign domain rejected', parseSetCookie('c=3; Domain=evil.com', u('http://x.local/')) === null);
check('parse: nameless rejected', parseSetCookie('=3', u('http://x.local/')) === null);

// ── store / header ──────────────────────────────────────────────────────────
jar.store(id, u('http://cam.local/login'), ['sid=s1; Path=/; HttpOnly', 'ui=dark; Path=/', 'deep=1; Path=/admin']);
check('header: host + path match', jar.header(id, u('http://cam.local/x')) === 'sid=s1; ui=dark');
check('header: longer path first', jar.header(id, u('http://cam.local/admin/y')) === 'deep=1; sid=s1; ui=dark');
check(
    'header: path is a segment match, not a prefix',
    jar.header(id, u('http://cam.local/administrator')) === 'sid=s1; ui=dark',
);
check('header: other host gets nothing', jar.header(id, u('http://router.local/')) === '');
check('script cookies leave HttpOnly out', jar.scriptCookies(id, u('http://cam.local/')) === 'ui=dark');
jar.store(id, u('http://cam.local/'), 'ui=light; Path=/');
check('same cookie is replaced', jar.header(id, u('http://cam.local/x')) === 'sid=s1; ui=light');
jar.store(id, u('http://cam.local/'), 'ui=; Path=/; Max-Age=0');
check('max-age 0 deletes', jar.header(id, u('http://cam.local/x')) === 'sid=s1');
jar.store(id, u('https://cam.local/'), 'sec=1; Path=/; Secure');
check('secure cookie not sent over http', !jar.header(id, u('http://cam.local/')).includes('sec=1'));
check('secure cookie sent over https/wss', jar.header(id, u('wss://cam.local/ws')).includes('sec=1'));
jar.store(id, u('http://cam.local/'), 'short=1; Path=/; Max-Age=10');
now += 11_000;
check('expired cookie dropped', !jar.header(id, u('http://cam.local/')).includes('short=1'));
check('another jar sees none of it', jar.header(jar.newJarId(), u('http://cam.local/')) === '');
check('invalid jar id stores nothing', (jar.store('bad', u('http://cam.local/'), 'z=1'), jar.size() === 1));

// ── browser cookies on Aura's own port ──────────────────────────────────────
check(
    'foreignCookies drops web session and Aura cookies',
    foreignCookies('connect.sid=a; aura_admin_0=b; aura_pj=c; aura-device=e; io=d; own=1; other=2') === 'own=1; other=2',
);
check('foreignCookies: empty stays empty', foreignCookies(undefined) === '');
check('readCookie finds a cookie', readCookie({ headers: { cookie: 'a=1; aura_pj=xyz' } }, 'aura_pj') === 'xyz');
check('readCookie: missing → null', readCookie({ headers: {} }, 'aura_pj') === null);

console.log(`\nproxy-jar: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
