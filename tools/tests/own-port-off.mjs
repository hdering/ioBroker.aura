// Aura without a port of its own (#997, steps 8/9).
//
//   node tools/tests/own-port-off.mjs
//
// main.js's real startHttpServer with the adapter stubbed: with `ownPort: false`
// and a web instance on this host the TCP port stays closed and the local socket
// for the web extension is the only way in; without a usable web instance (none
// chosen, another host) or with `ownPort: true` the port opens. And the one-time
// decision for the first start: a running installation keeps its port, a new
// one goes without when a web instance can take over.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';

const require = createRequire(import.meta.url);
const dataRoot = fs.mkdtempSync(join(os.tmpdir(), 'aura-noport-'));

let objects = {};
const logs = [];
const corePath = require.resolve('@iobroker/adapter-core');
require.cache[corePath] = {
    id: corePath,
    filename: corePath,
    loaded: true,
    exports: {
        getAbsoluteDefaultDataDir: () => dataRoot,
        getAbsoluteInstanceDataDir: (a) => join(dataRoot, a.namespace),
        Adapter: class {
            constructor(options) {
                this.name = options?.name;
                this.namespace = 'aura.0';
                this.instance = 0;
                this.host = 'host-a';
                const push = (lvl) => (m) => logs.push(`${lvl}: ${m}`);
                this.log = { info: push('info'), warn: push('warn'), error: push('error'), debug() {} };
            }
            on() {}
            async setObjectNotExistsAsync() {}
            async extendObjectAsync() {}
            async setStateAsync() {}
            setState() {}
            async getStateAsync() {
                return null;
            }
            async getForeignObjectAsync(id) {
                return objects[id] || null;
            }
            async getForeignObjectsAsync(pattern) {
                const re = new RegExp(`^${pattern.replace(/[.]/g, '\\.').replace(/\*/g, '.*')}$`);
                return Object.fromEntries(
                    Object.entries(objects)
                        .filter(([id]) => re.test(id))
                        .map(([id, o]) => [id, { ...o, _id: id }]),
                );
            }
            setTimeout(fn, ms) {
                return setTimeout(fn, ms);
            }
            clearTimeout(t) {
                clearTimeout(t);
            }
            setInterval(fn, ms) {
                return setInterval(fn, ms);
            }
            clearInterval(t) {
                clearInterval(t);
            }
        },
    },
};
const main = require(join(process.cwd(), 'main.js'));
const { ipcPath } = require(join(process.cwd(), 'lib/ipcEndpoint.js'));

const results = [];
const check = (name, ok, detail = '') => {
    results.push(ok);
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail ? ` - ${detail}` : ''}`);
};
const freePort = () =>
    new Promise((resolve) => {
        const s = net.createServer().listen(0, '127.0.0.1', () => {
            const p = s.address().port;
            s.close(() => resolve(p));
        });
    });
const portOpen = (port) =>
    new Promise((resolve) => {
        const c = net.connect(port, '127.0.0.1');
        c.on('connect', () => {
            c.destroy();
            resolve(true);
        });
        c.on('error', () => resolve(false));
    });
const viaSocket = (socketPath, path) =>
    new Promise((resolve) => {
        http.get({ socketPath, path }, (res) => {
            res.resume();
            resolve(res.statusCode);
        }).on('error', (e) => resolve(e.code));
    });
const webObj = (host, enabled = true, port = 8082) => ({
    _id: 'x',
    type: 'instance',
    common: { host, enabled },
    native: { port },
});

async function boot(config) {
    const aura = main({});
    aura.config = { bind: '127.0.0.1', ...config };
    aura.resolveSocketBackend = async () => ({ found: false, host: '127.0.0.1', port: 9, mode: 'port', conflicts: [] });
    aura._noteBackendResponse = () => {};
    aura.runBackendCheck = async () => {};
    await aura.startHttpServer();
    await new Promise((r) => setTimeout(r, 150));
    return aura;
}
const stop = async (aura) => {
    await new Promise((r) => (aura._httpServer ? aura._httpServer.close(() => r()) : r()));
    await new Promise((r) => (aura._ipcServer ? aura._ipcServer.close(() => r()) : r()));
};
const sock = ipcPath('aura.0', dataRoot);

try {
    // ── 1. no own port ───────────────────────────────────────────────────────
    {
        objects = { 'system.adapter.web.0': webObj('host-a') };
        logs.length = 0;
        const port = await freePort();
        const aura = await boot({ port, ownPort: false, webInstance: 'web.0' });
        check('ownPort false + web instance on this host: port stays closed', !(await portOpen(port)));
        check('…the local socket answers', (await viaSocket(sock, '/fs/roots')) === 200);
        check(
            '…says so in the log',
            logs.some((l) => l.includes('no port of its own') && l.includes('web.0')),
        );
        check('…marked for the backend check and the MCP block', aura._noOwnPort === true);
        const base = await aura._frontendBaseOptions();
        check(
            '…links and MCP go through the web instance',
            base.port === 8082 && base.pathPrefix === '/aura',
            JSON.stringify(base),
        );
        await stop(aura);
    }
    // ── 2. switched off, but nothing else could reach Aura ───────────────────
    for (const [label, objs, web] of [
        ['no web instance chosen', {}, ''],
        ['web instance missing', {}, 'web.3'],
        ['web instance on another host', { 'system.adapter.web.0': webObj('host-b') }, 'web.0'],
    ]) {
        objects = objs;
        logs.length = 0;
        const port = await freePort();
        const aura = await boot({ port, ownPort: false, webInstance: web });
        check(`ownPort false, ${label}: port opens anyway`, await portOpen(port));
        check(
            `…with a warning`,
            logs.some((l) => l.startsWith('warn:') && l.includes('opening port')),
        );
        check('…not marked as portless', aura._noOwnPort === false);
        await stop(aura);
    }
    // ── 2b. another Aura instance on the same web instance ───────────────────
    for (const [label, enabled] of [
        ['enabled', true],
        ['disabled', false],
    ]) {
        objects = {
            'system.adapter.web.0': webObj('host-a'),
            'system.adapter.aura.1': { common: { enabled }, native: { webInstance: 'web.0' } },
        };
        logs.length = 0;
        const port = await freePort();
        const aura = await boot({ port, ownPort: false, webInstance: 'web.0' });
        const warned = logs.some((l) => l.startsWith('warn:') && l.includes('also chosen by aura.1'));
        if (enabled) {
            check('web instance shared with a running Aura instance: warning in the log', warned);
            check('…handed to the backend check', aura._webSharedWith === 'aura.1');
        } else {
            check(`…not for a ${label} one (web loads no extension for it)`, !warned && aura._webSharedWith === '');
        }
        await stop(aura);
    }
    // ── 3. own port on: as before, plus the deprecation note ─────────────────
    {
        objects = { 'system.adapter.web.0': webObj('host-a') };
        logs.length = 0;
        const port = await freePort();
        const aura = await boot({ port, ownPort: true, webInstance: 'web.0' });
        check('ownPort true: port opens', await portOpen(port));
        check('…the local socket too', (await viaSocket(sock, '/fs/roots')) === 200);
        check(
            '…the log calls the port deprecated',
            logs.some((l) => l.includes('deprecated')),
        );
        const base = await aura._frontendBaseOptions();
        check('…links keep the own port (bind 127.0.0.1 still goes through web)', base.pathPrefix === '/aura');
        await stop(aura);
    }
    // ── 4. the decision on the first start ──────────────────────────────────
    {
        const aura = main({});
        aura.config = {};
        fs.mkdirSync(join(dataRoot, 'aura.0'), { recursive: true });
        fs.writeFileSync(join(dataRoot, 'aura.0', 'security.json'), '{}');
        aura._vaultCreatedNow = false;
        objects = { 'system.adapter.web.0': webObj('host-a') };
        let d = await aura._decideOwnPort({ port: 8095 });
        check('a running installation keeps its port', d.ownPort === true && !d.webInstance, JSON.stringify(d));
        aura._vaultCreatedNow = true;
        objects = {
            'system.adapter.web.0': webObj('host-b'),
            'system.adapter.web.1': webObj('host-a', false),
            'system.adapter.web.2': webObj('host-a', true),
            'system.adapter.web.10': webObj('host-a', true),
        };
        d = await aura._decideOwnPort({ port: 8095 });
        check(
            'a new one goes without, through an enabled web instance on this host',
            d.ownPort === false && d.webInstance === 'web.2',
            JSON.stringify(d),
        );
        d = await aura._decideOwnPort({ port: 8095, webInstance: 'web.1' });
        check(
            '…a chosen web instance stays the one',
            d.ownPort === false && d.webInstance === 'web.1',
            JSON.stringify(d),
        );
        objects = { 'system.adapter.web.0': webObj('host-b') };
        d = await aura._decideOwnPort({ port: 8095 });
        check('a new one without a web instance on this host keeps the port', d.ownPort === true, JSON.stringify(d));
        // a web instance serves one Aura instance under /aura/
        objects = {
            'system.adapter.web.0': webObj('host-a'),
            'system.adapter.web.1': webObj('host-a'),
            'system.adapter.aura.0': { native: { webInstance: 'web.1' } },
            'system.adapter.aura.1': { native: { webInstance: 'web.0' } },
        };
        d = await aura._decideOwnPort({ port: 8095 });
        check(
            'a second Aura instance skips the web instance the first one uses',
            d.ownPort === false && d.webInstance === 'web.1',
            JSON.stringify(d),
        );
        delete objects['system.adapter.web.1'];
        d = await aura._decideOwnPort({ port: 8095 });
        check('…and keeps its port when no web instance is free', d.ownPort === true, JSON.stringify(d));
        objects['system.adapter.web.1'] = webObj('host-a', true, 8083);
        let list = null;
        aura.sendTo = (_from, _cmd, data) => (list = data);
        await aura.onMessage({ command: 'listWebInstances', from: 'system.adapter.admin.0', callback: { id: 1 } });
        const note = async (webInstance) => {
            let got = null;
            aura.sendTo = (_from, _cmd, data) => (got = data);
            await aura.onMessage({
                command: 'webInstanceNote',
                from: 'system.adapter.admin.0',
                callback: { id: 2 },
                message: { webInstance },
            });
            return got;
        };
        aura._sysLanguage = 'en';
        let n = await note('');
        check(
            'the note under the list names the taken web instance and why (yellow)',
            /Cannot be chosen here: web\.0 \(used by aura\.1\)/.test(n?.text || '') &&
                /one Aura instance/.test(n.text) &&
                /ed6c02/.test(n.style?.borderLeft || ''),
            JSON.stringify(n),
        );
        n = await note('web.0');
        check(
            '…turns red when the taken one is chosen in the form',
            /web\.0 is already used by aura\.1/.test(n?.text || '') && /d32f2f/.test(n.style?.borderLeft || ''),
            JSON.stringify(n),
        );
        aura._sysLanguage = 'de';
        n = await note('');
        check('…in the system language', /Hier nicht wählbar: web\.0 \(nutzt aura\.1\)/.test(n?.text || ''), n?.text);
        const saved = objects['system.adapter.aura.1'];
        delete objects['system.adapter.aura.1'];
        delete objects['system.adapter.aura.0'];
        n = await note('');
        check('…and stays invisible when nothing is taken', n?.text === '' && n.style?.display === 'none');
        objects['system.adapter.aura.1'] = saved;
        aura.sendTo = (_from, _cmd, data) => (list = data);
        const web0 = (list || []).find((o) => o.value === 'web.0');
        check(
            '…the settings list marks a web instance another Aura instance uses',
            /already used by aura\.1/.test(web0?.label || '') &&
                !/already used/.test((list || []).find((o) => o.value === 'web.1')?.label || ''),
            JSON.stringify(list),
        );
    }
    // ── 5. the instance settings: offered only while on, off is final ──────
    {
        const items = JSON.parse(fs.readFileSync(join(process.cwd(), 'admin/jsonConfig.json'), 'utf8')).items;
        const run = (expr, data) => new Function('data', `return (${expr});`)(data);
        const shown = (key, ownPort, webInstance = 'web.0') =>
            !items[key].hidden || !run(items[key].hidden, { ownPort, webInstance });
        check(
            'settings: option and warning only while the port is on',
            ['ownPort', '_ownPortWarning'].every(
                (k) => shown(k, true) && !shown(k, false) && !shown(k, null) && !shown(k, undefined),
            ),
        );
        check(
            '…the warning is a non-closeable warning box',
            items._ownPortWarning.type === 'infoBox' &&
                items._ownPortWarning.boxType === 'warning' &&
                items._ownPortWarning.closeable === false,
        );
        check(
            '…switching off asks first (on the new value), switching on never does',
            run(items.ownPort.confirm.condition, { ownPort: false }) &&
                !run(items.ownPort.confirm.condition, { ownPort: true }),
        );
        check(
            '…port settings go with it',
            !shown('port', false) &&
                !shown('port', null) &&
                shown('port', true) &&
                !shown('socketInstance', false) &&
                !shown('socketInstance', null),
        );
        check(
            '…but stay settable when the fallback opens the port (no web instance), with a note why',
            shown('port', false, '') &&
                shown('socketInstance', false, '') &&
                shown('_ownPortFallback', false, '') &&
                !shown('_ownPortFallback', false) &&
                !shown('_ownPortFallback', true, ''),
        );
        check(
            '…forwarding the old port only offered with the port off and a web instance',
            shown('portRedirect', false) && !shown('portRedirect', true) && !shown('portRedirect', false, ''),
        );
        check(
            '…a not yet started instance explains the first start instead',
            shown('_ownPortPending', null) &&
                shown('_ownPortPending', undefined) &&
                !shown('_ownPortPending', true) &&
                !shown('_ownPortPending', false),
        );
        const alive = (a) => !new Function('_alive', `return (${items._webInstanceNotRunning.hidden});`)(a);
        check('…the web instance list explains itself while the instance is stopped', alive(false) && !alive(true));
        const keys = Object.keys(items);
        const noteItem = items._webInstanceNote;
        check(
            '…and while it runs a note right under the list asks the instance (and follows the choice)',
            keys.indexOf('_webInstanceNote') === keys.indexOf('webInstance') + 1 &&
                noteItem.type === 'textSendTo' &&
                noteItem.command === 'webInstanceNote' &&
                noteItem.alsoDependsOn.includes('webInstance') &&
                noteItem.jsonData.includes('${data.webInstance}'),
        );
    }
} finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
}

const failed = results.filter((r) => !r).length;
console.log(`\nown-port-off: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
