'use strict';

const utils = require('@iobroker/adapter-core');
const http = require('node:http');
const https = require('node:https');

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

class Aura extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: 'aura',
    });
    this.on('ready', this.onReady.bind(this));
    this.on('stateChange', this.onStateChange.bind(this));
    this.on('unload', this.onUnload.bind(this));
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
        // Delete leaves first, then channels, then root channel
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

    // ── Check cache ────────────────────────────────────────────────────────
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

    // ── Fetch ──────────────────────────────────────────────────────────────
    this.log.info(`[calendar] fetch request id=${req.id} url=${req.url}`);
    try {
      const content = await fetchUrl(req.url);
      this.log.info(`[calendar] fetch ok: ${content.length} bytes (id=${req.id})`);
      cache[req.url] = { content, fetchedAt: now };
      await this.setStateAsync('calendar.cache', JSON.stringify(cache), true);
      await this.setStateAsync('calendar.response', JSON.stringify({ id: req.id, content }), true);
    } catch (err) {
      this.log.error(`[calendar] fetch error (id=${req.id}): ${String(err)}`);
      // On error, serve stale cache if available rather than failing completely
      if (hit?.content) {
        this.log.warn(`[calendar] serving stale cache for url=${req.url}`);
        await this.setStateAsync('calendar.response', JSON.stringify({ id: req.id, content: hit.content }), true);
      } else {
        await this.setStateAsync('calendar.response', JSON.stringify({ id: req.id, error: String(err) }), true);
      }
    }
  }

  async onReady() {
    this.log.info('aura adapter started');

    // Channel objects (intermediate nodes in the object tree)
    await this.setObjectNotExistsAsync('config', {
      type: 'channel',
      common: { name: 'Configuration' },
      native: {},
    });
    await this.setObjectNotExistsAsync('navigate', {
      type: 'channel',
      common: { name: 'Navigation' },
      native: {},
    });
    await this.setObjectNotExistsAsync('calendar', {
      type: 'channel',
      common: { name: 'Calendar fetch relay' },
      native: {},
    });
    await this.setObjectNotExistsAsync('clients', {
      type: 'channel',
      common: { name: 'Connected clients' },
      native: {},
    });

    // Dashboard-Konfiguration als Datenpunkt anlegen
    await this.setObjectNotExistsAsync('config.dashboard', {
      type: 'state',
      common: {
        name: 'Dashboard configuration',
        type: 'string',
        role: 'json',
        read: true,
        write: true,
        def: '{"widgets":[]}',
      },
      native: {},
    });

    // Navigation-Datenpunkt
    await this.setObjectNotExistsAsync('navigate.url', {
      type: 'state',
      common: {
        name: 'Navigate to URL or tab slug',
        type: 'string',
        role: 'url',
        read: true,
        write: true,
        def: '',
      },
      native: {},
    });

    // Calendar fetch relay states
    await this.setObjectNotExistsAsync('calendar.cache', {
      type: 'state',
      common: {
        name: 'Calendar fetch cache (JSON: {url: {content, fetchedAt}})',
        type: 'string',
        role: 'json',
        read: true,
        write: false,
        def: '{}',
      },
      native: {},
    });
    await this.setObjectNotExistsAsync('calendar.request', {
      type: 'state',
      common: {
        name: 'Calendar fetch request (JSON: {id, url})',
        type: 'string',
        role: 'json',
        read: true,
        write: true,
        def: '',
      },
      native: {},
    });
    await this.setObjectNotExistsAsync('calendar.response', {
      type: 'state',
      common: {
        name: 'Calendar fetch response (JSON: {id, content|error})',
        type: 'string',
        role: 'json',
        read: true,
        write: true,
        def: '',
      },
      native: {},
    });
    await this.setObjectNotExistsAsync('calendar.clientError', {
      type: 'state',
      common: {
        name: 'Calendar client error (written by frontend after all retries failed)',
        type: 'string',
        role: 'text',
        read: true,
        write: true,
        def: '',
      },
      native: {},
    });
    await this.setObjectNotExistsAsync('clients.deleteRequest', {
      type: 'state',
      common: {
        name: 'Client delete request (write clientId to delete that client tree)',
        type: 'string',
        role: 'text',
        read: true,
        write: true,
        def: '',
      },
      native: {},
    });

    await this.setObjectNotExistsAsync('clients.register', {
      type: 'state',
      common: {
        name: 'Client register relay (write JSON {clientId, name} to create client object tree)',
        type: 'string',
        role: 'json',
        read: true,
        write: true,
        def: '',
      },
      native: {},
    });

    this.subscribeStates('calendar.request');
    this.subscribeStates('calendar.clientError');
    this.subscribeStates('clients.deleteRequest');
    this.subscribeStates('clients.register');

    // NOTE: The block below modifies system.adapter.aura.X via setForeignObjectAsync
    // to keep localLinks (overview tile URLs) up-to-date when a custom URL is configured.
    // This is under review by the ioBroker core team – see developer feedback.
    // Only writes when the value actually changed to avoid restart loops.
    {
      const base = this.config.customUrl ? this.config.customUrl.replace(/\/+$/, '') : null;
      const frontendLink = base ? `${base}/aura/` : '%protocol%://%ip%:8082/aura/';
      const backendLink  = base ? `${base}/aura/#/admin` : '%protocol%://%ip%:8082/aura/#/admin';
      const langs = ['en','de','ru','pt','nl','fr','it','es','pl','uk','zh-cn'];
      const makeName = (v) => Object.fromEntries(langs.map(l => [l, v]));
      const wantLinks = {
        frontend: { link: frontendLink, name: makeName('Aura Frontend') },
        backend:  { link: backendLink,  name: makeName('Aura Backend')  },
      };
      try {
        const obj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
        if (obj) {
          const curLinks = obj.common.localLinks || {};
          if (JSON.stringify(curLinks) !== JSON.stringify(wantLinks)) {
            obj.common.localLinks = wantLinks;
            await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, obj);
            this.log.info(`localLinks updated${base ? ` to custom URL: ${base}` : ' to defaults'}`);
          }
        }
      } catch (e) {
        this.log.warn(`Could not update localLinks: ${e.message}`);
      }
    }

    this.setState('info.connection', true, true);
    this.log.info('aura ready – serving frontend from www/');
  }

  onUnload(callback) {
    try {
      callback();
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
