'use strict';

const utils = require('@iobroker/adapter-core');
const http  = require('node:http');
const https = require('node:https');
const fs    = require('node:fs');
const path  = require('node:path');

// ── Calendar fetch helper ────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15000;

function fetchUrl(url, _depth = 0) {
  if (_depth > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;
    const options = {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      method: 'GET',
      timeout: FETCH_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (ioBroker-Aura)',
        'Accept': 'text/calendar, */*',
      },
    };
    const req = lib.request(options, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        fetchUrl(res.headers.location, _depth + 1).then(v => done(resolve, v)).catch(e => done(reject, e));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => done(resolve, data));
    });
    req.on('timeout', () => { req.destroy(); done(reject, new Error(`Timeout after ${FETCH_TIMEOUT_MS}ms: ${url}`)); });
    req.on('error', (e) => done(reject, e));
    req.end();
  });
}

// ── Proxy helpers ────────────────────────────────────────────────────────────

const STRIP_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'x-content-type-options',
  'x-xss-protection',
  'cross-origin-resource-policy',
  'cross-origin-embedder-policy',
  'cross-origin-opener-policy',
]);

const PROXY_TIMEOUT_MS = 15_000;

function rewriteHtml(html, baseUrl) {
  function toProxy(url) {
    if (!url) return url;
    const trimmed = url.trim();
    if (/^(data:|javascript:|blob:|mailto:|tel:|#)/.test(trimmed)) return url;
    try {
      const abs = new URL(trimmed, baseUrl).toString();
      return '/proxy?url=' + encodeURIComponent(abs);
    } catch { return url; }
  }

  const SKIP_RE = /(<(?:script|style)\b[^>]*>)([\s\S]*?)(<\/(?:script|style)>)/gi;

  function rewriteSegment(seg) {
    let out = seg.replace(/<base\b[^>]*>/gi, '');
    out = out.replace(
      /\b(src|href|action)(\s*=\s*)(["'])([^"']*)\3/gi,
      (_, attr, eq, q, url) => `${attr}${eq}${q}${toProxy(url)}${q}`,
    );
    out = out.replace(/<form\b([^>]*)>/gi, (match, attrs) => {
      if (/\baction\s*=/i.test(attrs)) return match;
      return `<form${attrs} action="${toProxy(baseUrl)}">`;
    });
    out = out.replace(
      /\bsrcset(\s*=\s*)(["'])([^"']*)\2/gi,
      (_, eq, q, val) => {
        const rw = val.replace(/([^,\s]+)(\s*(?:[^,]*))/g, (m, url, rest) => toProxy(url) + rest);
        return `srcset${eq}${q}${rw}${q}`;
      },
    );
    return out;
  }

  const parts = [];
  let last = 0;
  let m;
  SKIP_RE.lastIndex = 0;
  while ((m = SKIP_RE.exec(html)) !== null) {
    parts.push(rewriteSegment(html.slice(last, m.index)));
    parts.push(rewriteSegment(m[1]) + m[2] + m[3]);
    last = m.index + m[0].length;
  }
  parts.push(rewriteSegment(html.slice(last)));
  let out = parts.join('');

  const targetOrigin = new URL(baseUrl).origin;
  const tgtNoProto = targetOrigin.replace(/^https?:/, '');
  const wsProto    = targetOrigin.startsWith('https:') ? 'wss:' : 'ws:';
  const wsSnippet  = `<script>(function(){` +
    `var tgt=${JSON.stringify(targetOrigin)},tgtNP=${JSON.stringify(tgtNoProto)},wsp=${JSON.stringify(wsProto)};` +
    `history.replaceState(history.state,'','/');` +
    `function rw(u){` +
      `try{` +
        `var s=String(u);` +
        `if(s.startsWith('/proxy'))return u;` +
        `if(s.charAt(0)==='/'&&s.charAt(1)!=='/'){` +
          `return '/proxy?url='+encodeURIComponent(tgt+s);` +
        `}` +
        `var a=new URL(s,location.href);` +
        `if((a.origin===location.origin&&!a.pathname.startsWith('/proxy'))||a.origin===tgt){` +
          `return '/proxy?url='+encodeURIComponent(tgt+a.pathname+a.search+a.hash);` +
        `}` +
      `}catch(e){}` +
      `return u;` +
    `}` +
    `var _W=window.WebSocket;` +
    `window.WebSocket=function(u,p){` +
      `try{` +
        `var a=new URL(u.replace(/^wss?:/,'https:'),location.href);` +
        `if(a.pathname==='/proxyws')return new _W(u,p);` +
        `if(a.origin===location.origin||a.origin===tgt){` +
          `u='/proxyws?url='+encodeURIComponent(wsp+tgtNP+a.pathname+(a.search||''));` +
        `}` +
      `}catch(e){}` +
      `return new _W(u,p);` +
    `};` +
    `Object.assign(window.WebSocket,_W);` +
    `var _xo=XMLHttpRequest.prototype.open;` +
    `XMLHttpRequest.prototype.open=function(){` +
      `if(arguments[1])arguments[1]=rw(String(arguments[1]));` +
      `return _xo.apply(this,arguments);` +
    `};` +
    `var _f=window.fetch;` +
    `if(_f)window.fetch=function(r,o){` +
      `if(typeof r==='string')r=rw(r);` +
      `return _f.call(window,r,o);` +
    `};` +
    `try{` +
      `var _lp=Object.getPrototypeOf(location),_hd=Object.getOwnPropertyDescriptor(_lp,'href');` +
      `if(_hd&&_hd.set)Object.defineProperty(_lp,'href',{get:_hd.get,set:function(u){_hd.set.call(this,rw(String(u)));},configurable:true});` +
    `}catch(e){}` +
    `['assign','replace'].forEach(function(m){` +
      `var o=location[m].bind(location);` +
      `try{location[m]=function(u){o(rw(u));};}catch(e){}` +
    `});` +
    `document.addEventListener('click',function(e){` +
      `if(e.defaultPrevented)return;` +
      `var el=e.target;` +
      `while(el&&el.tagName!=='A')el=el.parentElement;` +
      `if(!el)return;` +
      `var h=el.getAttribute('href');` +
      `if(!h)return;` +
      `var rh=rw(h);` +
      `if(rh!==h){e.preventDefault();location.href=rh;}` +
    `},false);` +
    `document.addEventListener('submit',function(e){` +
      `var form=e.target;` +
      `if(!form||form.tagName!=='FORM')return;` +
      `var act=form.getAttribute('action')||'';` +
      `if(act.indexOf('/proxy')===0)return;` +
      `var abs=form.action;` +
      `var rh=rw(abs);` +
      `if(rh!==abs){e.preventDefault();form.setAttribute('action',rh);form.submit();}` +
    `},true);` +
    `try{` +
      `function rwAttr(el,a){var v=el.getAttribute&&el.getAttribute(a);if(v){var r=rw(v);if(r!==v)el.setAttribute(a,r);}}` +
      `function rwTree(n){` +
        `if(n.nodeType!==1)return;` +
        `rwAttr(n,'src');` +
        `try{n.querySelectorAll('[src]').forEach(function(c){rwAttr(c,'src');});}catch(e){}` +
      `}` +
      `var _mo=new MutationObserver(function(muts){` +
        `muts.forEach(function(m){` +
          `if(m.type==='attributes'){rwAttr(m.target,m.attributeName);}` +
          `else{m.addedNodes.forEach(rwTree);}` +
        `});` +
      `});` +
      `_mo.observe(document,{attributes:true,attributeFilter:['src'],childList:true,subtree:true});` +
    `}catch(e){}` +
    `})();</script>`;

  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${wsSnippet}</head>`);
  } else if (/<head>/i.test(out)) {
    out = out.replace(/<head>/i, `<head>${wsSnippet}`);
  } else {
    out = wsSnippet + out;
  }
  return out;
}

function rewriteCss(css, baseUrl) {
  function toProxy(url) {
    const trimmed = url.replace(/^['"]|['"]$/g, '').trim();
    if (!trimmed || /^(data:|#)/.test(trimmed)) return url;
    try {
      return `'${'/proxy?url=' + encodeURIComponent(new URL(trimmed, baseUrl).toString())}'`;
    } catch { return url; }
  }
  return css.replace(/url\(([^)]*)\)/gi, (_, inner) => `url(${toProxy(inner)})`);
}

function bufferResponse(proxyRes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    proxyRes.on('data', c => chunks.push(c));
    proxyRes.on('end', () => resolve(Buffer.concat(chunks)));
    proxyRes.on('error', reject);
  });
}

function buildFwdHeaders(req) {
  const h = {
    'Accept':          req.headers['accept']          || 'text/html,*/*',
    'Accept-Language': req.headers['accept-language'] || 'en',
    'User-Agent':      'Mozilla/5.0 (ioBroker-Aura)',
  };
  for (const k of ['content-type', 'content-length', 'cookie', 'x-csrftoken', 'x-requested-with']) {
    if (req.headers[k]) h[k.split('-').map(p => p[0].toUpperCase() + p.slice(1)).join('-')] = req.headers[k];
  }
  return h;
}

function buildHeaders(incoming) {
  const out = {};
  for (const [key, val] of Object.entries(incoming)) {
    if (!STRIP_HEADERS.has(key.toLowerCase())) out[key] = val;
  }
  return out;
}

function proxyWebSocket(req, socket, targetWsUrl, log) {
  let targetUrl;
  try {
    targetUrl = new URL(targetWsUrl);
    if (!['ws:', 'wss:'].includes(targetUrl.protocol)) throw new Error('Only ws/wss');
  } catch (e) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  const isSecure = targetUrl.protocol === 'wss:';
  const lib = isSecure ? https : http;
  const opts = {
    hostname: targetUrl.hostname,
    port:     targetUrl.port || (isSecure ? 443 : 80),
    path:     targetUrl.pathname + (targetUrl.search || ''),
    method:   'GET',
    headers:  {
      Connection:              'Upgrade',
      Upgrade:                 'websocket',
      Host:                    targetUrl.host,
      'Sec-WebSocket-Version': req.headers['sec-websocket-version'] || '13',
      'Sec-WebSocket-Key':     req.headers['sec-websocket-key'],
    },
    rejectUnauthorized: false,
  };
  if (req.headers['sec-websocket-protocol']) opts.headers['Sec-WebSocket-Protocol'] = req.headers['sec-websocket-protocol'];
  if (req.headers['cookie']) opts.headers['Cookie'] = req.headers['cookie'];

  const proxyReq = lib.request(opts);
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    const lines = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${proxyRes.headers['sec-websocket-accept']}`,
    ];
    if (proxyRes.headers['sec-websocket-protocol']) lines.push(`Sec-WebSocket-Protocol: ${proxyRes.headers['sec-websocket-protocol']}`);
    socket.write(lines.join('\r\n') + '\r\n\r\n');
    if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    proxySocket.on('error', () => socket.destroy());
    socket.on('error',      () => proxySocket.destroy());
  });
  proxyReq.on('error', e => {
    log.debug(`aura: WS proxy error for ${targetWsUrl}: ${e.message}`);
    socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    socket.destroy();
  });
  proxyReq.end();
}

// ── Socket.io backend auto-detection ────────────────────────────────────────

const SOCKET_BACKEND_WILDCARDS = new Set(['0.0.0.0', '::', '::0', '']);

function pickSocketBackend(objectsMap, socketPort) {
  const fallback = { host: '127.0.0.1', secure: false, source: null, found: false, conflicts: [] };
  const port = Number(socketPort);
  if (!Number.isFinite(port) || port <= 0) return fallback;
  const candidates = [];
  for (const [id, obj] of Object.entries(objectsMap || {})) {
    const name = obj?.common?.name;
    if (name !== 'web' && name !== 'socketio') continue;
    if (!obj.common?.enabled) continue;
    const native = obj.native || {};
    if (Number(native.port) !== port) continue;
    candidates.push({ id, native });
  }
  if (!candidates.length) return fallback;
  candidates.sort((a, b) => a.id.localeCompare(b.id));
  const pick = candidates[0];
  const bind = String(pick.native.bind || '').trim();
  const host = SOCKET_BACKEND_WILDCARDS.has(bind) ? '127.0.0.1' : bind;
  const secure = !!pick.native.secure;
  return {
    host,
    secure,
    source: pick.id,
    found: true,
    conflicts: candidates.slice(1).map(c => c.id),
  };
}

function formatHostPort(host, port) {
  return host && host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;
}

// ── Static file serving ──────────────────────────────────────────────────────

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.bmp':  'image/bmp',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.ogv':  'video/ogg',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.ogg':  'audio/ogg',
  '.pdf':  'application/pdf',
  '.txt':  'text/plain; charset=utf-8',
  '.xml':  'text/xml; charset=utf-8',
  '.zip':  'application/zip',
};

const WWW_DIR = path.join(__dirname, 'www');

function serveStatic(pathname, res, host, isSecure, socketUrlOverride) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const abs = path.join(WWW_DIR, rel);
  if (!abs.startsWith(WWW_DIR)) { res.writeHead(403); res.end(); return; }

  const serveIndex = (data) => {
    let socketUrl;
    if (socketUrlOverride) {
      socketUrl = socketUrlOverride;
    } else {
      const proto = isSecure ? 'https' : 'http';
      socketUrl = `${proto}://${host || 'localhost'}`;
    }
    const injection = `<script>window.__AURA_SOCKET_URL__=${JSON.stringify(socketUrl)}</script>`;
    const html = data.toString('utf8').replace('</head>', `${injection}</head>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html, 'utf8');
  };

  fs.readFile(abs, (err, data) => {
    if (err) {
      // Only serve SPA fallback for extension-less paths (React Router navigation).
      // Asset requests (.js, .css, …) that are missing are real 404s — returning
      // index.html would cause the browser to reject them due to wrong MIME type.
      if (path.extname(pathname)) { res.writeHead(404); res.end('Not found'); return; }
      fs.readFile(path.join(WWW_DIR, 'index.html'), (err2, idx) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        serveIndex(idx);
      });
      return;
    }
    if (rel === 'index.html') { serveIndex(data); return; }
    const ct = MIME_TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct });
    res.end(data);
  });
}

// ── Adapter ──────────────────────────────────────────────────────────────────

class Aura extends utils.Adapter {
  constructor(options = {}) {
    super({ ...options, name: 'aura' });
    this.on('ready', this.onReady.bind(this));
    this.on('stateChange', this.onStateChange.bind(this));
    this.on('unload', this.onUnload.bind(this));
    this._httpServer = null;
  }

  // State-based calendar fetch: frontend writes {id, url, ttl?} to calendar.request,
  // adapter checks calendar.cache first, falls back to fetching, writes
  // {id, content|error} to calendar.response.
  async onStateChange(id, state) {
    // Client-side error report (timeout after all retries exhausted)
    if (id.endsWith('calendar.clientError') && state && !state.ack && state.val) {
      this.log.warn(`[calendar] client error: ${String(state.val)}`);
      return;
    }

    // Client register relay: frontend writes {clientId, name} → adapter creates object tree
    if (id.endsWith('clients.register') && state && !state.ack && state.val) {
      let reg;
      try { reg = JSON.parse(String(state.val)); } catch {
        await this.setStateAsync('clients.register', '', true);
        return;
      }
      if (!reg.clientId) { await this.setStateAsync('clients.register', '', true); return; }

      const cId = String(reg.clientId);
      const displayName = reg.name ? String(reg.name) : cId.slice(0, 8);

      await this.setObjectNotExistsAsync(`clients.${cId}`, {
        type: 'channel', common: { name: displayName }, native: {},
      });
      await this.setObjectNotExistsAsync(`clients.${cId}.info`, {
        type: 'channel', common: { name: 'Info' }, native: {},
      });
      await this.setObjectNotExistsAsync(`clients.${cId}.info.name`, {
        type: 'state',
        common: { name: 'Client Name', type: 'string', role: 'text', read: true, write: true, def: displayName },
        native: {},
      });
      await this.setObjectNotExistsAsync(`clients.${cId}.info.lastSeen`, {
        type: 'state',
        common: { name: 'Last Seen', type: 'number', role: 'date', read: true, write: true, def: 0 },
        native: {},
      });
      await this.setObjectNotExistsAsync(`clients.${cId}.navigate`, {
        type: 'channel', common: { name: 'Navigation' }, native: {},
      });
      await this.setObjectNotExistsAsync(`clients.${cId}.navigate.url`, {
        type: 'state',
        common: { name: 'Navigate', type: 'string', role: 'url', read: true, write: true, def: '' },
        native: {},
      });

      await this.setStateAsync(`clients.${cId}.info.name`, { val: displayName, ack: true });
      await this.setStateAsync(`clients.${cId}.info.lastSeen`, { val: Date.now(), ack: true });

      this.log.info(`[clients] registered: ${cId} (${displayName})`);
      await this.setStateAsync('clients.register', '', true);
      return;
    }

    // Client delete relay: frontend writes clientId → adapter deletes all child objects explicitly
    if (id.endsWith('clients.deleteRequest') && state && !state.ack && state.val) {
      const clientId = String(state.val).trim();
      if (clientId) {
        const base = `${this.namespace}.clients.${clientId}`;
        const toDelete = [
          `${base}.info.name`,
          `${base}.info.lastSeen`,
          `${base}.info`,
          `${base}.navigate.url`,
          `${base}.navigate`,
          base,
        ];
        this.log.info(`[clients] deleting client: ${base}`);
        for (const objId of toDelete) {
          try { await this.delForeignObjectAsync(objId); } catch { /* ignore missing */ }
        }
        this.log.info(`[clients] deleted: ${base}`);
      }
      await this.setStateAsync('clients.deleteRequest', '', true);
      return;
    }

    if (!id.endsWith('calendar.request') || !state || state.ack || !state.val) return;
    let req;
    try { req = JSON.parse(String(state.val)); } catch { return; }
    if (!req.url || !req.id) return;

    const ttlMs = (typeof req.ttl === 'number' && req.ttl > 0 ? req.ttl : 900) * 1000;
    const now   = Date.now();

    let cache = {};
    try {
      const cs = await this.getStateAsync('calendar.cache');
      if (cs?.val) cache = JSON.parse(String(cs.val));
    } catch { /* start with empty cache on parse error */ }

    const hit = cache[req.url];
    if (hit && typeof hit.fetchedAt === 'number' && (now - hit.fetchedAt) < ttlMs) {
      this.log.debug(`[calendar] cache hit: url=${req.url} age=${Math.round((now - hit.fetchedAt) / 1000)}s`);
      await this.setStateAsync('calendar.response', JSON.stringify({ id: req.id, content: hit.content }), true);
      return;
    }

    this.log.info(`[calendar] fetch request id=${req.id} url=${req.url}`);
    try {
      const content = await fetchUrl(req.url);
      this.log.info(`[calendar] fetch ok: ${content.length} bytes (id=${req.id})`);
      cache[req.url] = { content, fetchedAt: now };
      await this.setStateAsync('calendar.cache', JSON.stringify(cache), true);
      await this.setStateAsync('calendar.response', JSON.stringify({ id: req.id, content }), true);
    } catch (err) {
      this.log.error(`[calendar] fetch error (id=${req.id}): ${String(err)}`);
      if (hit?.content) {
        this.log.warn(`[calendar] serving stale cache for url=${req.url}`);
        await this.setStateAsync('calendar.response', JSON.stringify({ id: req.id, content: hit.content }), true);
      } else {
        await this.setStateAsync('calendar.response', JSON.stringify({ id: req.id, error: String(err) }), true);
      }
    }
  }

  async resolveSocketBackend(socketPort) {
    let objs;
    try {
      objs = await this.getForeignObjectsAsync('system.adapter.*', 'instance');
    } catch (e) {
      this.log.warn(`aura: socket backend auto-detect failed (${e.message}) — falling back to 127.0.0.1`);
      return { host: '127.0.0.1', secure: false, source: null, found: false, conflicts: [] };
    }
    return pickSocketBackend(objs, socketPort);
  }

  async startHttpServer() {
    const port       = this.config.port       || 8095;
    const socketPort = this.config.socketPort || 8082;
    const useHttps   = !!this.config.secure;

    const backend = await this.resolveSocketBackend(socketPort);
    const socketHost   = backend.host;
    const socketSecure = backend.found ? backend.secure : !!this.config.socketSecure;
    const socketHostPort = formatHostPort(socketHost, socketPort);
    if (backend.found) {
      const proto = socketSecure ? 'https' : 'http';
      const extra = backend.conflicts.length ? ` (other matches ignored: ${backend.conflicts.join(', ')})` : '';
      this.log.info(`aura: socket.io backend ${proto}://${socketHostPort} (via ${backend.source})${extra}`);
    } else {
      this.log.warn(`aura: no enabled web/socketio instance found with port ${socketPort} — proxying to ${socketHostPort}`);
    }

    // ── File-system helpers ──────────────────────────────────────────────────
    const fsRootsConfig = Array.isArray(this.config.fsRoots)
      ? this.config.fsRoots
          .filter(r => r && r.path)
          .map(r => ({ label: String(r.label || r.path), path: path.resolve(String(r.path)) }))
      : [];

    const resolveSafePath = (rawPath) => {
      const abs = path.resolve(rawPath);
      const ok = fsRootsConfig.some(r => abs === r.path || abs.startsWith(r.path + path.sep));
      if (!ok) throw Object.assign(new Error('path outside allowed roots'), { statusCode: 403 });
      return abs;
    };

    const handler = (req, res) => {
      let parsedUrl;
      try { parsedUrl = new URL(req.url, 'http://localhost'); } catch {
        res.writeHead(400); res.end(); return;
      }
      const { pathname } = parsedUrl;

      if (pathname === '/proxy') {
        const urlParam = parsedUrl.searchParams.get('url');
        if (!urlParam) { res.writeHead(400); res.end('Missing url parameter'); return; }

        let targetUrl;
        try {
          targetUrl = new URL(urlParam);
          if (!['http:', 'https:'].includes(targetUrl.protocol)) throw new Error('Only http/https allowed');
        } catch (e) {
          res.writeHead(400); res.end(`Invalid proxy URL: ${e.message}`); return;
        }

        const lib = targetUrl.protocol === 'https:' ? https : http;
        const fwdHeaders = buildFwdHeaders(req);
        fwdHeaders['Referer'] = targetUrl.origin + '/';

        const reqOptions = {
          hostname: targetUrl.hostname,
          port:     targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
          path:     targetUrl.pathname + targetUrl.search,
          method:   req.method,
          timeout:  PROXY_TIMEOUT_MS,
          headers:  fwdHeaders,
          rejectUnauthorized: false,
        };

        const proxyReq = lib.request(reqOptions, (proxyRes) => {
          if ((proxyRes.statusCode === 301 || proxyRes.statusCode === 302) && proxyRes.headers.location) {
            const absLocation = new URL(proxyRes.headers.location, targetUrl.toString()).toString();
            const rh = buildHeaders(proxyRes.headers);
            rh['location'] = `/proxy?url=${encodeURIComponent(absLocation)}`;
            res.writeHead(proxyRes.statusCode, rh);
            res.end();
            return;
          }

          const ct = (proxyRes.headers['content-type'] || '').toLowerCase();
          const isHtml = ct.includes('text/html');
          const isCss  = ct.includes('text/css');

          if (isHtml || isCss) {
            const resHeaders = buildHeaders(proxyRes.headers);
            delete resHeaders['content-length'];
            bufferResponse(proxyRes).then(buf => {
              const charset = (ct.match(/charset=([^\s;]+)/) || [])[1] || 'utf-8';
              const enc = charset.toLowerCase() === 'utf-8' ? 'utf8' : 'latin1';
              let text = buf.toString(enc);
              text = isHtml ? rewriteHtml(text, targetUrl.toString()) : rewriteCss(text, targetUrl.toString());
              res.writeHead(proxyRes.statusCode || 200, resHeaders);
              res.end(text, enc);
            }).catch(e => {
              if (!res.headersSent) res.writeHead(502); res.end(`Proxy rewrite error: ${e.message}`);
            });
          } else {
            res.writeHead(proxyRes.statusCode || 200, buildHeaders(proxyRes.headers));
            proxyRes.pipe(res, { end: true });
          }
        });

        proxyReq.on('timeout', () => { proxyReq.destroy(); if (!res.headersSent) { res.writeHead(504); res.end('Proxy timeout'); } });
        proxyReq.on('error',   e  => { if (!res.headersSent) { res.writeHead(502); res.end(`Proxy error: ${e.message}`); } });
        req.pipe(proxyReq, { end: true });
        return;
      }

      // ── File-system routes ────────────────────────────────────────────────
      if (pathname.startsWith('/fs/')) {
        const fsPath = parsedUrl.searchParams.get('path') || '';

        if (pathname === '/fs/roots') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(fsRootsConfig));
          return;
        }

        if (pathname === '/fs/list') {
          if (!fsPath) { res.writeHead(400); res.end('Missing path parameter'); return; }
          let abs;
          try { abs = resolveSafePath(fsPath); } catch (e) { res.writeHead(e.statusCode || 500); res.end(e.message); return; }
          fs.readdir(abs, { withFileTypes: true }, (err, entries) => {
            if (err) { res.writeHead(err.code === 'ENOENT' ? 404 : 500); res.end(err.message); return; }
            const items = entries.map(ent => {
              let size = null, mtime = null, mime = null;
              if (!ent.isDirectory()) {
                try { const st = fs.statSync(path.join(abs, ent.name)); size = st.size; mtime = st.mtimeMs; } catch { /* ignore */ }
                const rawMime = MIME_TYPES[path.extname(ent.name).toLowerCase()] || 'application/octet-stream';
                mime = rawMime.split(';')[0].trim();
              }
              return { name: ent.name, isDir: ent.isDirectory(), size, mtime, mime };
            });
            items.sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)));
            const parent = fsRootsConfig.some(r => r.path === abs) ? null : path.dirname(abs);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ path: abs, parent, entries: items }));
          });
          return;
        }

        if (pathname === '/fs/read') {
          if (!fsPath) { res.writeHead(400); res.end('Missing path parameter'); return; }
          let abs;
          try { abs = resolveSafePath(fsPath); } catch (e) { res.writeHead(e.statusCode || 500); res.end(e.message); return; }
          const streamFile = (finalPath) => {
            const ct = MIME_TYPES[path.extname(finalPath).toLowerCase()] || 'application/octet-stream';
            const stream = fs.createReadStream(finalPath);
            stream.on('open', () => {
              res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'max-age=30' });
              stream.pipe(res);
            });
            stream.on('error', (e) => {
              if (!res.headersSent) { res.writeHead(e.code === 'ENOENT' ? 404 : 500); res.end(e.message); }
            });
          };
          fs.lstat(abs, (err, lstat) => {
            if (err) { res.writeHead(err.code === 'ENOENT' ? 404 : 500); res.end(err.message); return; }
            if (lstat.isDirectory()) { res.writeHead(400); res.end('path is a directory'); return; }
            if (lstat.isSymbolicLink()) {
              fs.realpath(abs, (err2, real) => {
                if (err2) { res.writeHead(500); res.end(err2.message); return; }
                const ok = fsRootsConfig.some(r => real === r.path || real.startsWith(r.path + path.sep));
                if (!ok) { res.writeHead(403); res.end('symlink outside whitelist'); return; }
                streamFile(real);
              });
            } else {
              streamFile(abs);
            }
          });
          return;
        }

        res.writeHead(404); res.end('Unknown fs endpoint');
        return;
      }

      const webAdapterPrefixes = ['/socket.io', '/echarts', '/lib'];
      if (webAdapterPrefixes.some(p => pathname === p || pathname.startsWith(p + '/'))) {
        const socketLib    = socketSecure ? https : http;
        const proxyReq = socketLib.request({
          hostname: socketHost,
          port: socketPort,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: socketHostPort },
          timeout: 30000,
          rejectUnauthorized: false,
        }, (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        });
        proxyReq.on('timeout', () => { proxyReq.destroy(); if (!res.headersSent) { res.writeHead(504); res.end('Proxy timeout'); } });
        proxyReq.on('error',   e  => { if (!res.headersSent) { res.writeHead(502); res.end(`Proxy error: ${e.message}`); } });
        req.pipe(proxyReq, { end: true });
        return;
      }

      const isSecure = req.socket.encrypted === true || req.headers['x-forwarded-proto'] === 'https';
      serveStatic(pathname, res, req.headers.host, isSecure, this.config.socketUrl || '');
    };

    let server;
    let httpsActive = false;
    if (useHttps) {
      try {
        if (!this.config.certPublic || !this.config.certPrivate) {
          throw new Error('certPublic and certPrivate must be selected in adapter config');
        }
        this.log.debug(`aura: loading certificates — public="${this.config.certPublic}" private="${this.config.certPrivate}" chained="${this.config.certChained || ''}"`);
        let certificates;
        let rawResult;
        if (typeof this.getCertificatesAsync === 'function') {
          rawResult = await this.getCertificatesAsync(
            this.config.certPublic,
            this.config.certPrivate,
            this.config.certChained || '',
          );
          this.log.debug(`aura: getCertificatesAsync raw result keys: ${Object.keys(rawResult || {}).join(', ')}`);
          // Some adapter-core versions resolve with [certificates, letsEncrypt] array
          if (Array.isArray(rawResult)) {
            certificates = rawResult[0];
          } else {
            certificates = rawResult?.certificates ?? rawResult;
          }
        } else {
          certificates = await new Promise((resolve, reject) => {
            this.getCertificates(
              this.config.certPublic,
              this.config.certPrivate,
              this.config.certChained || '',
              (err, certs) => (err ? reject(err) : resolve(certs)),
            );
          });
        }
        this.log.debug(`aura: certificates object keys: ${Object.keys(certificates || {}).join(', ')} | key=${certificates?.key ? `present (${String(certificates.key).length} chars)` : 'MISSING'} cert=${certificates?.cert ? `present (${String(certificates.cert).length} chars)` : 'MISSING'}`);
        if (!certificates?.key || !certificates?.cert) {
          throw new Error(`certificates loaded but key/cert are empty (got keys: ${Object.keys(certificates || {}).join(', ') || 'none'})`);
        }
        server = https.createServer(certificates, handler);
        httpsActive = true;
      } catch (e) {
        this.log.error(`aura: HTTPS startup failed (${e.message}) — falling back to HTTP`);
        server = http.createServer(handler);
      }
    } else {
      server = http.createServer(handler);
    }

    server.on('upgrade', (req, socket, _head) => {
      let parsedUrl;
      try { parsedUrl = new URL(req.url, 'http://localhost'); } catch { return; }
      if (parsedUrl.pathname.startsWith('/socket.io/')) {
        const wsScheme = socketSecure ? 'wss' : 'ws';
        proxyWebSocket(req, socket, `${wsScheme}://${socketHostPort}${req.url}`, this.log);
        return;
      }
      if (parsedUrl.pathname !== '/proxyws') return;
      const targetWsUrl = parsedUrl.searchParams.get('url');
      if (!targetWsUrl) { socket.destroy(); return; }
      proxyWebSocket(req, socket, targetWsUrl, this.log);
    });

    server.on('error', e => this.log.error(`aura: server error: ${e.message}`));

    server.listen(port, () => this.log.info(`aura: ${httpsActive ? 'HTTPS' : 'HTTP'} server listening on port ${port}`));
    this._httpServer = server;
  }

  async onReady() {
    this.log.info('aura adapter started');

    await this.setObjectNotExistsAsync('config', { type: 'channel', common: { name: 'Configuration' }, native: {} });
    await this.setObjectNotExistsAsync('navigate', { type: 'channel', common: { name: 'Navigation' }, native: {} });
    await this.setObjectNotExistsAsync('calendar', { type: 'channel', common: { name: 'Calendar fetch relay' }, native: {} });
    await this.setObjectNotExistsAsync('admin', { type: 'channel', common: { name: 'Admin access' }, native: {} });
    await this.setObjectNotExistsAsync('clients', { type: 'channel', common: { name: 'Connected clients' }, native: {} });

    await this.setObjectNotExistsAsync('config.dashboard', {
      type: 'state',
      common: { name: 'Dashboard configuration', type: 'string', role: 'json', read: true, write: true, def: '{"widgets":[]}' },
      native: {},
    });

    const configStates = [
      { id: 'config.theme',           name: 'Theme configuration' },
      { id: 'config.groups',          name: 'Group configuration' },
      { id: 'config.app-config',      name: 'App configuration' },
      { id: 'config.global-settings', name: 'Global settings' },
      { id: 'config.group-defs',      name: 'Group widget definitions' },
      { id: 'config.popup-config',    name: 'Popup configuration' },
    ];
    for (const s of configStates) {
      await this.setObjectNotExistsAsync(s.id, {
        type: 'state',
        common: { name: s.name, type: 'string', role: 'json', read: true, write: true, def: '' },
        native: {},
      });
    }

    await this.setObjectNotExistsAsync('config.dashboard_backup', {
      type: 'state',
      common: { name: 'Dashboard configuration backup', type: 'string', role: 'json', read: true, write: false, def: '' },
      native: {},
    });

    await this.setObjectNotExistsAsync('navigate.url', {
      type: 'state',
      common: { name: 'Navigate to URL or tab slug', type: 'string', role: 'url', read: true, write: true, def: '' },
      native: {},
    });

    await this.setObjectNotExistsAsync('calendar.cache', {
      type: 'state',
      common: { name: 'Calendar fetch cache (JSON: {url: {content, fetchedAt}})', type: 'string', role: 'json', read: true, write: false, def: '{}' },
      native: {},
    });
    await this.setObjectNotExistsAsync('calendar.request', {
      type: 'state',
      common: { name: 'Calendar fetch request (JSON: {id, url})', type: 'string', role: 'json', read: true, write: true, def: '' },
      native: {},
    });
    await this.setObjectNotExistsAsync('calendar.response', {
      type: 'state',
      common: { name: 'Calendar fetch response (JSON: {id, content|error})', type: 'string', role: 'json', read: true, write: true, def: '' },
      native: {},
    });
    await this.setObjectNotExistsAsync('calendar.clientError', {
      type: 'state',
      common: { name: 'Calendar client error (written by frontend after all retries failed)', type: 'string', role: 'text', read: true, write: true, def: '' },
      native: {},
    });
    await this.setObjectNotExistsAsync('admin.pinHash', {
      type: 'state',
      common: { name: 'Admin PIN hash (FNV-1a, managed by frontend)', type: 'string', role: 'text', read: true, write: true, def: '' },
      native: {},
    });
    await this.setObjectNotExistsAsync('clients.deleteRequest', {
      type: 'state',
      common: { name: 'Client delete request (write clientId to delete that client tree)', type: 'string', role: 'text', read: true, write: true, def: '' },
      native: {},
    });
    await this.setObjectNotExistsAsync('clients.register', {
      type: 'state',
      common: { name: 'Client register relay (write JSON {clientId, name} to create client object tree)', type: 'string', role: 'json', read: true, write: true, def: '' },
      native: {},
    });

    this.subscribeStates('calendar.request');
    this.subscribeStates('calendar.clientError');
    this.subscribeStates('clients.deleteRequest');
    this.subscribeStates('clients.register');

    // Update localLinks to point to the aura HTTP server port
    {
      const base = this.config.customUrl ? this.config.customUrl.replace(/\/+$/, '') : null;
      const port = this.config.port || 8095;
      const langs = ['en','de','ru','pt','nl','fr','it','es','pl','uk','zh-cn'];
      const makeName = (v) => Object.fromEntries(langs.map(l => [l, v]));

      const frontendLink = base ? `${base}/`        : `%protocol%://%ip%:${port}/`;
      const backendLink  = base ? `${base}/#/admin`  : `%protocol%://%ip%:${port}/#/admin`;
      const wantLinks = {
        frontend: { link: frontendLink, name: makeName('Aura Frontend') },
        backend:  { link: backendLink,  name: makeName('Aura Backend')  },
      };
      try {
        const obj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
        if (obj) {
          let changed = false;
          const curLinks = obj.common.localLinks || {};
          if (curLinks?.frontend?.link !== wantLinks.frontend.link ||
              curLinks?.backend?.link  !== wantLinks.backend.link) {
            obj.common.localLinks = wantLinks;
            changed = true;
            this.log.info(`localLinks updated to port ${port}${base ? ` (custom URL: ${base})` : ''}`);
          }
          // Migration: clear legacy webInstance so iobroker.web stops tracking aura
          if (obj.native?.webInstance !== undefined) {
            delete obj.native.webInstance;
            changed = true;
            this.log.info('aura: cleared legacy webInstance — iobroker.web will no longer restart on aura stop');
          }
          if (changed) {
            await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, obj);
          }
        }
      } catch (e) {
        this.log.warn(`Could not update instance object: ${e.message}`);
      }
    }

    await this.startHttpServer();
    this.setState('info.connection', true, true);
    this.log.info('aura ready');
  }

  onUnload(callback) {
    try {
      if (this._httpServer) {
        this._httpServer.close(() => callback());
      } else {
        callback();
      }
    } catch {
      callback();
    }
  }
}

if (require.main !== module) {
  module.exports = (options) => new Aura(options);
} else {
  new Aura();
}
