'use strict';

const utils = require('@iobroker/adapter-core');
const http = require('http');
const https = require('https');

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

  // State-based calendar fetch: frontend writes {id, url} to calendar.request,
  // adapter fetches and writes {id, content|error} to calendar.response.
  async onStateChange(id, state) {
    if (!id.endsWith('calendar.request') || !state || state.ack || !state.val) return;
    let req;
    try { req = JSON.parse(String(state.val)); } catch { return; }
    if (!req.url || !req.id) return;
    this.log.info(`[calendar] fetch request id=${req.id} url=${req.url}`);
    try {
      const content = await fetchUrl(req.url);
      this.log.info(`[calendar] fetch ok: ${content.length} bytes (id=${req.id})`);
      await this.setStateAsync('calendar.response', JSON.stringify({ id: req.id, content }), true);
    } catch (err) {
      this.log.error(`[calendar] fetch error (id=${req.id}): ${String(err)}`);
      await this.setStateAsync('calendar.response', JSON.stringify({ id: req.id, error: String(err) }), true);
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
    this.subscribeStates('calendar.request');

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
