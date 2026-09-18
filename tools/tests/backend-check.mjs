// Verifies the backend self-check: which instance aura talks to, and what it
// says when that choice is wrong.
//
//   node tools/tests/backend-check.mjs
//
// The module takes the objects map, the alive flags and the HTTP probe results
// as arguments, so every misconfiguration people actually hit in the forum can
// be reproduced here without a running ioBroker: a socket port that matches no
// instance, a socketio instance where a web instance was meant (#519), the
// HTTPS checkbox out of sync, a login-protected web instance, an instance that
// is enabled but not running.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const {
    listBackends,
    resolveTarget,
    staticFindings,
    probeFindings,
    serverFindings,
    worstLevel,
    formatReport,
} = require(join(process.cwd(), 'lib', 'backendCheck.js'));

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) => check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const has = (findings, id) => findings.some((f) => f.id === id);
const byId = (findings, id) => findings.find((f) => f.id === id);

const instance = (name, no, native, enabled = true) => ({
    [`system.adapter.${name}.${no}`]: { common: { name, enabled }, native },
});
// The situation from the forum report: web runs on 8089, aura still points at
// the default 8082, and a socketio instance happens to answer there.
const REPORTED = {
    ...instance('web', 0, { port: 8089, bind: '0.0.0.0', secure: false }),
    ...instance('socketio', 0, { port: 8082, bind: '0.0.0.0', secure: false }),
};

// ── 1. Reading the instance list ────────────────────────────────────────────
{
    const list = listBackends({
        ...REPORTED,
        ...instance('history', 0, { port: 8083 }),
        ...instance('web', 1, { port: 8090 }, false),
    });
    eq('only web/socketio instances are candidates', list.length, 3);
    eq('ids are short', list.map((c) => c.id).join(','), 'socketio.0,web.0,web.1');
    eq('a disabled instance is listed, but marked', list[2].enabled, false);
    eq('the port is a number', list[1].port, 8089);
}

// ── 2. Resolving: port mode vs. picked instance ─────────────────────────────
{
    const wrong = resolveTarget({ objects: REPORTED, socketPort: 8082 });
    eq('the default port finds socketio.0', wrong.id, 'socketio.0');
    eq('a wildcard bind becomes localhost', wrong.host, '127.0.0.1');

    const right = resolveTarget({ objects: REPORTED, socketPort: 8089 });
    eq('the web port finds web.0', right.id, 'web.0');

    const picked = resolveTarget({ objects: REPORTED, socketPort: 8082, webInstance: 'web.0' });
    eq('a picked instance wins over the port', picked.id, 'web.0');
    eq('and brings its own port', picked.port, 8089);
    eq('the mode is reported', picked.mode, 'instance');

    const bound = resolveTarget({
        objects: instance('web', 0, { port: 8082, bind: '192.168.1.5', secure: true }),
        socketPort: 8082,
    });
    eq('a specific bind address is used as-is', bound.host, '192.168.1.5');
    eq('HTTPS comes from the instance', bound.secure, true);

    const none = resolveTarget({ objects: REPORTED, socketPort: 8099 });
    eq('an unmatched port finds nothing', none.found, false);
    eq('but still knows the candidates', none.candidates.length, 2);

    const twice = resolveTarget({
        objects: { ...instance('web', 0, { port: 8082 }), ...instance('web', 1, { port: 8082 }) },
        socketPort: 8082,
    });
    eq('two instances on one port: the first is used', twice.id, 'web.0');
    eq('and the other is reported as a conflict', twice.conflicts.join(','), 'web.1');
}

// ── 3. The findings people need to read ─────────────────────────────────────
{
    const f = staticFindings({
        target: resolveTarget({ objects: REPORTED, socketPort: 8099 }),
        config: { socketPort: 8099 },
    });
    check('an unmatched port is an error', byId(f, 'port-unmatched')?.level === 'error');
    check(
        'and the hint names the instances that do exist',
        byId(f, 'port-unmatched').hint.includes('web.0 (port 8089)'),
        byId(f, 'port-unmatched').hint,
    );

    const sock = staticFindings({
        target: resolveTarget({ objects: REPORTED, socketPort: 8082 }),
        config: { socketPort: 8082 },
    });
    check('a socketio backend is called out', byId(sock, 'kind-socketio')?.level === 'warn');
    check('the backend itself is confirmed', byId(sock, 'target')?.level === 'ok');

    const https = staticFindings({
        target: resolveTarget({ objects: instance('web', 0, { port: 8082, secure: true }), socketPort: 8082 }),
        config: { socketPort: 8082, socketSecure: false },
    });
    check('an HTTPS mismatch is an error', byId(https, 'https-mismatch')?.level === 'error');
    check('and says which way to flip it', byId(https, 'https-mismatch').hint.includes('on'));

    const matched = staticFindings({
        target: resolveTarget({ objects: instance('web', 0, { port: 8082, secure: true }), socketPort: 8082 }),
        config: { socketPort: 8082, socketSecure: true },
    });
    check('a matching HTTPS flag says nothing', !has(matched, 'https-mismatch'));

    const dead = staticFindings({
        target: resolveTarget({ objects: REPORTED, socketPort: 8089 }),
        config: { socketPort: 8089 },
        alive: { 'web.0': false },
    });
    check('a stopped instance is an error', byId(dead, 'not-alive')?.level === 'error');
    const live = staticFindings({
        target: resolveTarget({ objects: REPORTED, socketPort: 8089 }),
        config: { socketPort: 8089 },
        alive: { 'web.0': true },
    });
    check('a running one is not', !has(live, 'not-alive'));

    const gone = staticFindings({
        target: resolveTarget({ objects: REPORTED, socketPort: 8082, webInstance: 'web.7' }),
        config: { socketPort: 8082, webInstance: 'web.7' },
    });
    check('a picked instance that vanished is an error', byId(gone, 'instance-missing')?.level === 'error');
    check('with the real ones offered', byId(gone, 'instance-missing').hint.includes('web.0'));

    const off = staticFindings({
        target: resolveTarget({
            objects: instance('web', 0, { port: 8082 }, false),
            socketPort: 8082,
            webInstance: 'web.0',
        }),
        config: { socketPort: 8082, webInstance: 'web.0' },
    });
    check('a disabled picked instance is an error', byId(off, 'instance-disabled')?.level === 'error');

    const bind = staticFindings({
        target: resolveTarget({ objects: instance('web', 0, { port: 8082, bind: '192.168.1.5' }), socketPort: 8082 }),
        config: { socketPort: 8082 },
    });
    check('a narrow bind address is worth knowing', byId(bind, 'bind')?.level === 'info');

    const ws = staticFindings({
        target: resolveTarget({
            objects: instance('web', 0, { port: 8082, usePureWebSockets: true }),
            socketPort: 8082,
        }),
        config: { socketPort: 8082 },
    });
    check('pure WebSockets explains the localhost logs', byId(ws, 'pure-ws')?.level === 'info');
}

// ── 4. What the probes add ──────────────────────────────────────────────────
{
    const ok = probeFindings({ socket: { status: 200 }, file: { status: 200 } });
    check('both probes green', has(ok, 'socket-ok') && has(ok, 'file-ok'));
    eq('nothing to report', worstLevel(ok), 'ok');

    const refused = probeFindings({ socket: { status: 0, error: 'connect ECONNREFUSED 127.0.0.1:8082' } });
    check('a refused connection is an error', byId(refused, 'socket-unreachable')?.level === 'error');
    check('and is explained', byId(refused, 'socket-unreachable').hint.includes('Nothing listens there'));

    const tls = probeFindings({ socket: { status: 0, error: 'write EPROTO ... wrong version number' } });
    check(
        'a TLS handshake error points at the HTTPS checkbox',
        byId(tls, 'socket-unreachable').hint.includes('HTTP/HTTPS mismatch'),
    );

    const auth = probeFindings({ socket: { status: 401 } });
    check('a login-protected backend is an error', byId(auth, 'socket-auth')?.level === 'error');
    const redirect = probeFindings({ socket: { status: 302, location: '/login/index.html' } });
    check('a redirect to the login page is a warning', byId(redirect, 'socket-redirect')?.level === 'warn');
    check('naming where it goes', byId(redirect, 'socket-redirect').title.includes('/login/index.html'));

    const notWeb = probeFindings({ socket: { status: 404 } });
    check('a 404 on the socket script is an error', byId(notWeb, 'socket-missing')?.level === 'error');

    const noFiles = probeFindings({ socket: { status: 200 }, file: { status: 404 } });
    check(
        'no adapter files is only info since aura serves them itself',
        byId(noFiles, 'file-missing')?.level === 'info',
    );
    check('and says what is still affected', byId(noFiles, 'file-missing').hint.includes('sonos'));
}

// ── 5. The own server ───────────────────────────────────────────────────────
{
    const up = serverFindings({ port: 8095, https: false, httpsWanted: false, listening: true });
    check('a listening server is confirmed', byId(up, 'own-server')?.level === 'ok');
    const down = serverFindings({ port: 8095, listening: false });
    check('a blocked port is an error', byId(down, 'own-server-down')?.level === 'error');
    const fellBack = serverFindings({ port: 8095, https: false, httpsWanted: true, listening: true });
    check('a silent HTTPS fallback is an error', byId(fellBack, 'https-fallback')?.level === 'error');
}

// ── 6. The report that gets pasted into a forum post ────────────────────────
{
    const findings = [
        ...staticFindings({
            target: resolveTarget({ objects: REPORTED, socketPort: 8082 }),
            config: { socketPort: 8082 },
        }),
        ...probeFindings({ socket: { status: 200 }, file: { status: 404 } }),
    ];
    const text = formatReport(findings, { version: '0.62.0', checkedAt: '2026-09-18 12:00:00' });
    check('the verdict is in the first line', text.split('\n')[0].includes('read the notes'));
    check('the version is carried along', text.includes('adapter 0.62.0'));
    check('every finding is listed', text.includes('[WARN]') && text.includes('[OK  ]'));
    check('hints are indented under their finding', text.includes('\n         → '));
    check('no colour codes or emoji', !text.includes(String.fromCharCode(27)) && !/[\u{1F300}-\u{1FAFF}]/u.test(text));

    const clean = formatReport(
        [
            ...staticFindings({
                target: resolveTarget({ objects: REPORTED, socketPort: 8089 }),
                config: { socketPort: 8089, socketSecure: false },
            }),
            ...probeFindings({ socket: { status: 200 }, file: { status: 200 } }),
        ],
        {},
    );
    check('an all-green run says so', clean.startsWith('aura backend check — Everything checks out.'));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
    process.exit(1);
}
