'use strict';

/**
 * Online voice for devices without one of their own (#834).
 *
 *     GET /speech/tts?text=<up to 200 characters>&lang=<de, en-GB, …>
 *
 * Fully Kiosk runs on the Android WebView, which has no speechSynthesis — text
 * announcements failed there while sound files played. Such a device asks Aura's
 * server instead and plays the answer like any sound file: the server fetches
 * the MP3 from Google Translate's speech endpoint (the one SayIt's "Google"
 * engine uses, no key needed) and keeps it in memory, so a doorbell text that
 * five tablets speak costs one request. The client splits long texts into
 * pieces of at most MAX_TEXT characters, which is also the endpoint's limit.
 *
 * The text leaves the house, hence the instance option `speechOnlineTts`; off
 * answers 403 and the client reports `unsupported`.
 */

const { request } = require('./feedProxy');

const MAX_TEXT = 200;
const MAX_ENTRIES = 128;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const GOOGLE_TTS = 'https://translate.google.com/translate_tts';
const LANG_RE = /^[a-z]{2,3}(?:-[a-z0-9]{2,4})?$/i;

/**
 * Google wants the language, not the locale: `de-DE` → `de`. Chinese is the
 * exception, there the region picks the script (`zh-CN`, `zh-TW`).
 */
function normalizeLang(raw) {
    const l = String(raw || '')
        .trim()
        .replace('_', '-');
    if (!LANG_RE.test(l)) {
        return null;
    }
    const [primary, region] = l.split('-');
    const p = primary.toLowerCase();
    return p === 'zh' ? `zh-${region && /^(tw|hk|hant)$/i.test(region) ? 'TW' : 'CN'}` : p;
}

/**
 * @param {{
 *   enabled?: () => boolean,
 *   log?: { debug?: (msg: string) => void, warn?: (msg: string) => void },
 *   upstream?: string,
 * }} [opts] `upstream` replaces the Google endpoint (tests)
 */
function createTtsProxy(opts = {}) {
    const log = opts.log || {};
    const enabled = opts.enabled || (() => true);
    const upstream = opts.upstream || GOOGLE_TTS;
    /** @type {Map<string, Buffer>} */
    const cache = new Map();
    let cacheBytes = 0;
    /** @type {Map<string, Promise<Buffer>>} */
    const inflight = new Map();

    function remember(key, body) {
        const old = cache.get(key);
        if (old) {
            cacheBytes -= old.length;
            cache.delete(key);
        }
        cache.set(key, body);
        cacheBytes += body.length;
        while (cache.size > MAX_ENTRIES || cacheBytes > MAX_CACHE_BYTES) {
            const first = cache.keys().next().value;
            cacheBytes -= cache.get(first).length;
            cache.delete(first);
        }
    }

    function synthesize(text, lang) {
        const key = `${lang}|${text}`;
        let p = inflight.get(key);
        if (p) {
            return p;
        }
        const url = new URL(upstream);
        url.searchParams.set('ie', 'UTF-8');
        url.searchParams.set('client', 'tw-ob');
        url.searchParams.set('tl', lang);
        url.searchParams.set('q', text);
        p = request(url, { accept: 'audio/mpeg, audio/*' })
            .then((r) => {
                const type = String(r.headers['content-type'] || '');
                if (r.status < 200 || r.status >= 300 || !r.body.length || !/audio|mpeg|octet/i.test(type)) {
                    throw new Error(`HTTP ${r.status} ${type}`.trim());
                }
                remember(key, r.body);
                return r.body;
            })
            .finally(() => inflight.delete(key));
        inflight.set(key, p);
        return p;
    }

    function fail(res, status, msg) {
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(msg);
    }

    function send(res, body) {
        res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Content-Length': body.length,
            'Cache-Control': 'private, max-age=86400',
        });
        res.end(body);
    }

    /** True when the request was a speech request and has been answered. */
    function handle(req, res, parsedUrl) {
        if (parsedUrl.pathname !== '/speech/tts' || (req.method !== 'GET' && req.method !== 'HEAD')) {
            return false;
        }
        if (!enabled()) {
            fail(res, 403, 'Online voice is switched off (instance option speechOnlineTts)');
            return true;
        }
        const text = String(parsedUrl.searchParams.get('text') || '')
            .replace(/\s+/g, ' ')
            .trim();
        const lang = normalizeLang(parsedUrl.searchParams.get('lang') || 'de');
        if (!text || text.length > MAX_TEXT || !lang) {
            fail(res, 400, `text (1-${MAX_TEXT} characters) and lang required`);
            return true;
        }
        if (req.method === 'HEAD') {
            res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
            res.end();
            return true;
        }
        const hit = cache.get(`${lang}|${text}`);
        if (hit) {
            send(res, hit);
            return true;
        }
        synthesize(text, lang).then(
            (body) => send(res, body),
            (err) => {
                log.warn?.(`aura: online voice failed for "${text.slice(0, 40)}" (${lang}) — ${err.message}`);
                fail(res, 502, String(err.message || err));
            },
        );
        return true;
    }

    return { handle };
}

module.exports = { createTtsProxy, normalizeLang, MAX_TEXT };
