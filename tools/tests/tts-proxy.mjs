/**
 * lib/ttsProxy.js — the online voice for devices without speechSynthesis (#834).
 *
 *   node tools/tests/tts-proxy.mjs
 *
 * A local HTTP server plays Google. Checked: text and language reach the
 * upstream as q / tl (locale cut to the language, Chinese keeps the script),
 * the MP3 comes back as audio/mpeg, a repeated or concurrent text costs one
 * upstream request, the instance option answers 403, bad input 400, an upstream
 * failure 502, and HEAD answers without asking the upstream.
 */
import { createRequire } from 'node:module';
import http from 'node:http';

const require = createRequire(import.meta.url);
const { createTtsProxy, normalizeLang } = require('../../lib/ttsProxy.js');

let pass = 0;
const fails = [];
function check(name, cond, detail = '') {
    if (cond) pass++;
    else fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

const MP3 = Buffer.from([0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4]);
const upstream = { hits: 0, last: null, fail: false, html: false, delay: 0 };
const google = http.createServer((req, res) => {
    upstream.hits++;
    upstream.last = new URL(req.url, 'http://x').searchParams;
    setTimeout(() => {
        if (upstream.fail) {
            res.writeHead(429);
            res.end('Too many requests');
        } else if (upstream.html) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<html>captcha</html>');
        } else {
            res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
            res.end(MP3);
        }
    }, upstream.delay);
});
await new Promise((r) => google.listen(0, '127.0.0.1', r));

let enabled = true;
const proxy = createTtsProxy({
    upstream: `http://127.0.0.1:${google.address().port}/translate_tts`,
    enabled: () => enabled,
    log: {},
});
const aura = http.createServer((req, res) => {
    if (!proxy.handle(req, res, new URL(req.url, 'http://localhost'))) {
        res.writeHead(404);
        res.end();
    }
});
await new Promise((r) => aura.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${aura.address().port}`;
const tts = (text, lang = 'de-DE', method = 'GET') =>
    fetch(`${base}/speech/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(text)}`, { method });

try {
    check('lang de-DE', normalizeLang('de-DE') === 'de', normalizeLang('de-DE'));
    check('lang en_GB', normalizeLang('en_GB') === 'en');
    check('lang zh-TW', normalizeLang('zh-TW') === 'zh-TW');
    check('lang zh', normalizeLang('zh') === 'zh-CN');
    check('lang junk', normalizeLang('de;rm') === null);

    let r = await tts('Es hat an der Haustür geklingelt');
    const body = Buffer.from(await r.arrayBuffer());
    check('200', r.status === 200, String(r.status));
    check('audio/mpeg', r.headers.get('content-type') === 'audio/mpeg');
    check('bytes untouched', body.equals(MP3));
    check('q upstream', upstream.last?.get('q') === 'Es hat an der Haustür geklingelt', upstream.last?.get('q'));
    check('tl upstream', upstream.last?.get('tl') === 'de', upstream.last?.get('tl'));
    check('client tw-ob', upstream.last?.get('client') === 'tw-ob');

    await tts('Es hat an der Haustür geklingelt');
    check('cached', upstream.hits === 1, String(upstream.hits));

    upstream.delay = 100;
    const before = upstream.hits;
    await Promise.all([tts('Gleichzeitig'), tts('Gleichzeitig'), tts('Gleichzeitig')]);
    check('concurrent share one fetch', upstream.hits === before + 1, String(upstream.hits - before));
    upstream.delay = 0;

    r = await tts('Kopf', 'de', 'HEAD');
    check('HEAD 200', r.status === 200);
    check('HEAD does not fetch', upstream.hits === before + 1);

    r = await tts('x'.repeat(201));
    check('too long 400', r.status === 400, String(r.status));
    r = await tts('   ');
    check('empty 400', r.status === 400, String(r.status));

    upstream.fail = true;
    r = await tts('Fehlschlag');
    check('upstream 429 → 502', r.status === 502, String(r.status));
    upstream.fail = false;
    upstream.html = true;
    r = await tts('Captcha-Seite');
    check('upstream html → 502', r.status === 502, String(r.status));
    upstream.html = false;

    enabled = false;
    r = await tts('Aus');
    check('disabled 403', r.status === 403, String(r.status));
    r = await tts('Aus', 'de', 'HEAD');
    check('disabled HEAD 403', r.status === 403, String(r.status));
} finally {
    aura.close();
    google.close();
}

if (fails.length) {
    console.error(`tts-proxy: ${fails.length} failed, ${pass} passed`);
    for (const f of fails) console.error(`  ✗ ${f}`);
    process.exit(1);
}
console.log(`tts-proxy: ${pass} checks passed`);
