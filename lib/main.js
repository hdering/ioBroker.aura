'use strict';

const utils = require('@iobroker/adapter-core');
const http = require('http');
const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;
    const options = {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (ioBroker-Aura)',
        'Accept': 'text/calendar, */*',
      },
    };
    const req = lib.request(options, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
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
    this.on('message', this.onMessage.bind(this));
    this.on('unload', this.onUnload.bind(this));
  }

  onMessage(obj) {
    if (!obj || obj.command !== 'fetchUrl') return;
    const url = obj.message && obj.message.url;
    if (!url) {
      obj.callback && this.sendTo(obj.from, obj.command, { error: 'No URL provided' }, obj.callback);
      return;
    }
    fetchUrl(url)
      .then((content) => {
        obj.callback && this.sendTo(obj.from, obj.command, { content }, obj.callback);
      })
      .catch((err) => {
        obj.callback && this.sendTo(obj.from, obj.command, { error: String(err) }, obj.callback);
      });
  }

  async onReady() {
    this.log.info('aura adapter started');

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

    // Navigation-Datenpunkt: Wert auf Tab-Slug oder externe URL setzen,
    // um das Tablet auf diese Seite zu navigieren.
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
