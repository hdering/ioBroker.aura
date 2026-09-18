'use strict';

/**
 * Backend self-check.
 *
 * Almost every "aura does not work" report in the forum comes down to the same
 * thing: the socket port is a number somebody typed, nothing verifies it, and
 * the consequence shows up somewhere else entirely — a blank dashboard, a
 * widget with "load error", weather icons that stay empty (#519). Aura already
 * knows at startup that the port does not match any enabled web instance; it
 * just says so in a log line nobody reads.
 *
 * This module turns that knowledge into a verdict. It is deliberately free of
 * I/O: the objects map, the alive flags and the HTTP probe results are handed
 * in, so every branch is unit-testable without a running ioBroker (see
 * tools/tests/backend-check.mjs). main.js wires it to the real world at startup
 * and behind the "Check backend" button in the instance configuration.
 *
 * Findings carry a level: `ok` (worth confirming), `info` (worth knowing),
 * `warn` (works, but will bite) and `error` (broken now). The report text is
 * English on purpose — it ends up in GitHub issues and forum posts.
 */

const LEVEL_ORDER = { ok: 0, info: 1, warn: 2, error: 3 };
const LEVEL_MARK = { ok: 'OK  ', info: 'INFO', warn: 'WARN', error: 'FAIL' };

const WILDCARD_BINDS = new Set(['0.0.0.0', '::', '::0', '']);

/**
 * A finding, in the shape the report and the log lines are built from.
 *
 * @param {string} id stable identifier, so a test can assert on it
 * @param {string} level `ok`, `info`, `warn` or `error`
 * @param {string} title one sentence, what is the case
 * @param {string} [hint] one sentence, what to do about it
 * @returns {object} the finding
 */
function finding(id, level, title, hint) {
    return hint ? { id, level, title, hint } : { id, level, title };
}

/**
 * Every enabled web/socketio instance in the objects map, newest-sorted by id,
 * with the bits that matter for reaching it.
 *
 * @param {object} objects `system.adapter.*` instance objects, keyed by id
 * @returns {Array<object>} candidates as `{ id, kind, port, bind, secure, pureWs, enabled }`
 */
function listBackends(objects) {
    const out = [];
    for (const [id, obj] of Object.entries(objects || {})) {
        const kind = obj?.common?.name;
        if (kind !== 'web' && kind !== 'socketio') {
            continue;
        }
        const native = obj.native || {};
        out.push({
            id: id.replace(/^system\.adapter\./, ''),
            kind,
            port: Number(native.port) || 0,
            bind: String(native.bind || '').trim(),
            secure: !!native.secure,
            pureWs: !!native.usePureWebSockets,
            enabled: !!obj.common?.enabled,
        });
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Which instance aura actually talks to. An explicitly configured instance wins
 * over the port — that is the whole point of choosing one: the port, the bind
 * address and the HTTPS flag then come from the instance object instead of
 * being typed a second time.
 *
 * @param {object} p parameters
 * @param {object} p.objects `system.adapter.*` instance objects
 * @param {number} p.socketPort the configured port (fallback when no instance is chosen)
 * @param {string} [p.webInstance] the configured instance, e.g. `web.0`
 * @returns {object} `{ mode, id, kind, port, host, secure, pureWs, found, candidates, conflicts }`
 */
function resolveTarget({ objects, socketPort, webInstance }) {
    const all = listBackends(objects);
    const port = Number(socketPort) || 0;
    const chosen = String(webInstance || '').trim();
    const base = { candidates: all, conflicts: [], found: false, id: null, kind: null };

    if (chosen) {
        const hit = all.find((c) => c.id === chosen);
        if (!hit) {
            return { ...base, mode: 'instance', wanted: chosen, port, host: '127.0.0.1', secure: false };
        }
        return {
            ...base,
            mode: 'instance',
            wanted: chosen,
            found: hit.enabled,
            id: hit.id,
            kind: hit.kind,
            port: hit.port || port,
            host: WILDCARD_BINDS.has(hit.bind) ? '127.0.0.1' : hit.bind,
            bind: hit.bind,
            secure: hit.secure,
            pureWs: hit.pureWs,
            enabled: hit.enabled,
        };
    }

    const matches = all.filter((c) => c.enabled && c.port === port);
    if (!matches.length) {
        return { ...base, mode: 'port', port, host: '127.0.0.1', secure: false };
    }
    const pick = matches[0];
    return {
        ...base,
        mode: 'port',
        found: true,
        id: pick.id,
        kind: pick.kind,
        port: pick.port,
        host: WILDCARD_BINDS.has(pick.bind) ? '127.0.0.1' : pick.bind,
        bind: pick.bind,
        secure: pick.secure,
        pureWs: pick.pureWs,
        enabled: true,
        conflicts: matches.slice(1).map((c) => c.id),
    };
}

/**
 * `web.0 (port 8089)` — how a candidate is named in a hint.
 *
 * @param {object} c a candidate from listBackends
 * @returns {string} the label
 */
function describe(c) {
    return `${c.id} (port ${c.port || '?'}${c.secure ? ', HTTPS' : ''}${c.enabled ? '' : ', disabled'})`;
}

/**
 * Everything that can be decided from the objects DB alone — no network. This
 * is where the common misconfigurations are named, each with the one sentence
 * that says what to do about it.
 *
 * @param {object} p parameters
 * @param {object} p.target result of resolveTarget
 * @param {object} p.config the instance config (`socketPort`, `socketSecure`, `webInstance`)
 * @param {object} [p.alive] `{ 'web.0': true }` — alive flags, where known
 * @returns {Array<object>} findings
 */
function staticFindings({ target, config, alive = {} }) {
    const out = [];
    const others = target.candidates.filter((c) => c.enabled);

    if (target.mode === 'instance' && !target.id) {
        out.push(
            finding(
                'instance-missing',
                'error',
                `The configured instance ${target.wanted} does not exist`,
                others.length
                    ? `Pick one of: ${others.map(describe).join(', ')}.`
                    : 'No enabled web or socketio instance exists at all — install and start iobroker.web first.',
            ),
        );
        return out;
    }
    if (target.mode === 'instance' && target.id && !target.enabled) {
        out.push(
            finding(
                'instance-disabled',
                'error',
                `The configured instance ${target.id} is disabled`,
                'Enable it in the instance list, or choose a different one here.',
            ),
        );
    }
    if (target.mode === 'port' && !target.found) {
        out.push(
            finding(
                'port-unmatched',
                'error',
                `No enabled web or socketio instance listens on port ${target.port}`,
                others.length
                    ? `Found instead: ${others.map(describe).join(', ')} — set the socket port to the one you mean, or pick the instance above.`
                    : 'No enabled web or socketio instance exists at all — install and start iobroker.web first.',
            ),
        );
        return out;
    }

    if (target.found) {
        out.push(finding('target', 'ok', `Backend is ${target.id} on ${target.host}:${target.port}`));
    }
    if (target.conflicts.length) {
        out.push(
            finding(
                'conflicts',
                'warn',
                `More than one instance listens on port ${target.port}: ${[target.id, ...target.conflicts].join(', ')}`,
                `${target.id} is used. Pick the instance explicitly above so this is not decided alphabetically.`,
            ),
        );
    }
    if (target.kind === 'socketio') {
        out.push(
            finding(
                'kind-socketio',
                'warn',
                `${target.id} is a socketio instance, not a web instance`,
                'It serves the socket connection but no files. Adapter assets are read from the file storage directly, but anything else a widget loads relative (e.g. sonos cover art) will 404. A web instance is the safer choice.',
            ),
        );
    }
    if (target.found && !!config.socketSecure !== !!target.secure) {
        out.push(
            finding(
                'https-mismatch',
                'error',
                `"Web adapter uses HTTPS" is ${config.socketSecure ? 'on' : 'off'}, but ${target.id} runs ${target.secure ? 'HTTPS' : 'plain HTTP'}`,
                `Turn the checkbox ${target.secure ? 'on' : 'off'} — with the wrong setting the connection fails at the handshake.`,
            ),
        );
    }
    if (target.found && target.bind && !WILDCARD_BINDS.has(target.bind) && target.bind !== '127.0.0.1') {
        out.push(
            finding(
                'bind',
                'info',
                `${target.id} is bound to ${target.bind} only`,
                'Aura connects to exactly that address. If aura runs on another host or in another container, that address has to be reachable from there.',
            ),
        );
    }
    // Socket transport mode of the web/socketio instance:
    //  - usePureWebSockets (@iobroker/ws): the client connects at the root path
    //    (/?sid=) and the server only accepts the connection as a trusted session
    //    when it appears to come from localhost. Forwarding X-Forwarded-For makes
    //    the backend see the real remote IP, drop the trust, and log
    //    "No sid found" on every keepalive ping — so main.js must NOT forward it.
    //  - classic socket.io (default) / forceWebSockets: engine.io establishes the
    //    session inline during the handshake, independent of the source IP, so
    //    X-Forwarded-For is safe and gives honest backend logs.
    if (target.found && target.pureWs) {
        out.push(
            finding(
                'pure-ws',
                'info',
                `${target.id} uses pure WebSockets (@iobroker/ws)`,
                'Aura does not forward X-Forwarded-For to it, otherwise the backend logs "No sid found" on every ping. Its log therefore shows localhost as the client.',
            ),
        );
    }
    const aliveKnown = target.id && Object.prototype.hasOwnProperty.call(alive, target.id);
    if (aliveKnown && !alive[target.id]) {
        out.push(
            finding(
                'not-alive',
                'error',
                `${target.id} is enabled but not running`,
                'Start the instance — aura has nothing to talk to while it is down.',
            ),
        );
    }
    return out;
}

/**
 * Findings from the two HTTP probes against the backend. `probes.socket` asks
 * for socket.io's client script, `probes.file` for an adapter asset — together
 * they separate "wrong port" from "right port, wrong kind of instance" from
 * "right instance, but it wants a login".
 *
 * Each probe is `{ status, error, location }`, as produced by main.js.
 *
 * @param {object} probes `{ socket, file }`
 * @returns {Array<object>} findings
 */
function probeFindings(probes) {
    const out = [];
    const socket = probes?.socket;
    const file = probes?.file;

    if (socket) {
        if (socket.error) {
            out.push(
                finding(
                    'socket-unreachable',
                    'error',
                    `The backend did not answer: ${socket.error}`,
                    /wrong version number|EPROTO|SSL|TLS/i.test(socket.error)
                        ? 'That is the signature of an HTTP/HTTPS mismatch — flip "Web adapter uses HTTPS".'
                        : /ECONNREFUSED/i.test(socket.error)
                          ? 'Nothing listens there. Check the port and whether the instance runs.'
                          : 'Check host, port and whether a firewall sits in between.',
                ),
            );
        } else if (socket.status === 200) {
            out.push(finding('socket-ok', 'ok', 'socket.io client script is served'));
        } else if (socket.status === 401 || socket.status === 403) {
            out.push(
                finding(
                    'socket-auth',
                    'error',
                    `The backend answered ${socket.status} — it requires a login`,
                    'Allow anonymous access in the web instance, or aura cannot reach it: aura forwards the browser cookies, but its own origin has no session with the web adapter.',
                ),
            );
        } else if (socket.status >= 300 && socket.status < 400) {
            out.push(
                finding(
                    'socket-redirect',
                    'warn',
                    `The backend redirects to ${socket.location || 'another page'}`,
                    'That is usually a login page. Allow anonymous access in the web instance.',
                ),
            );
        } else {
            out.push(
                finding(
                    'socket-missing',
                    'error',
                    `The backend answered ${socket.status} for the socket.io client script`,
                    'Something answers on this port, but it is not a web/socketio instance. Check the port.',
                ),
            );
        }
    }

    if (file) {
        if (file.status === 200) {
            out.push(finding('file-ok', 'ok', 'Adapter files are served (/adapter/…)'));
        } else if (!file.error && file.status) {
            out.push(
                finding(
                    'file-missing',
                    'info',
                    `The backend answered ${file.status} for an adapter file`,
                    'Aura reads adapter assets from the ioBroker file storage itself, so widget images still work. Other relative asset paths (e.g. sonos cover art) do go through this backend and would fail.',
                ),
            );
        }
    }
    return out;
}

/**
 * The own HTTP server, as reported by main.js after it came up.
 *
 * @param {object} [server] `{ port, https, httpsWanted, listening }`
 * @returns {Array<object>} findings
 */
function serverFindings(server) {
    if (!server) {
        return [];
    }
    const out = [];
    if (server.listening) {
        out.push(
            finding(
                'own-server',
                'ok',
                `Aura serves the frontend on port ${server.port}${server.https ? ' (HTTPS)' : ''}`,
            ),
        );
    } else {
        out.push(
            finding(
                'own-server-down',
                'error',
                `Aura could not listen on port ${server.port}`,
                'The port is taken by something else. Pick a free one.',
            ),
        );
    }
    if (server.httpsWanted && !server.https) {
        out.push(
            finding(
                'https-fallback',
                'error',
                'HTTPS is enabled but the certificates could not be loaded — running plain HTTP',
                'Check the certificate selection; the adapter log holds the reason.',
            ),
        );
    }
    return out;
}

/**
 * The worst level in a list of findings.
 *
 * @param {Array<object>} findings the findings
 * @returns {string} the highest level present
 */
function worstLevel(findings) {
    return findings.reduce((acc, f) => (LEVEL_ORDER[f.level] > LEVEL_ORDER[acc] ? f.level : acc), 'ok');
}

/**
 * Render findings as the block the config dialog shows and the user pastes into
 * a forum post. Deliberately plain text, no colours, no emoji.
 *
 * @param {Array<object>} findings findings to render
 * @param {object} [meta] `{ version, checkedAt }` header data
 * @returns {string} the report
 */
function formatReport(findings, meta = {}) {
    const level = worstLevel(findings);
    const head =
        level === 'ok'
            ? 'Everything checks out.'
            : level === 'error'
              ? 'Something is wrong — see FAIL below.'
              : 'Works, but read the notes below.';
    const lines = [`aura backend check — ${head}`];
    if (meta.version) {
        lines.push(`adapter ${meta.version}${meta.checkedAt ? `, ${meta.checkedAt}` : ''}`);
    }
    lines.push('');
    for (const f of findings) {
        lines.push(`[${LEVEL_MARK[f.level]}] ${f.title}`);
        if (f.hint) {
            lines.push(`         → ${f.hint}`);
        }
    }
    return lines.join('\n');
}

/**
 * The whole check in one call. `probe` is injected so the network stays out of
 * this module: `probe({ host, port, secure, path })` resolves to
 * `{ status, error, location }`.
 *
 * @param {object} p parameters
 * @param {object} p.objects `system.adapter.*` instance objects
 * @param {object} p.config the instance config
 * @param {object} [p.alive] alive flags by instance id
 * @param {object} [p.server] own server state `{ port, https, httpsWanted, listening }`
 * @param {(at: object) => Promise<object>} [p.probe] async HTTP probe; skipped when absent
 * @param {object} [p.meta] `{ version, checkedAt }`
 * @returns {Promise<object>} `{ level, findings, text, target }`
 */
async function runBackendCheck({ objects, config, alive, server, probe, meta }) {
    const target = resolveTarget({
        objects,
        socketPort: config.socketPort || 8082,
        webInstance: config.webInstance,
    });
    const findings = staticFindings({ target, config, alive });

    if (probe && target.port) {
        const at = { host: target.host, port: target.port, secure: target.secure };
        const socket = await probe({ ...at, path: '/socket.io/socket.io.js' });
        const file = socket && !socket.error ? await probe({ ...at, path: '/adapter/aura/aura.png' }) : null;
        findings.push(...probeFindings({ socket, file }));
    }
    findings.push(...serverFindings(server));

    return { level: worstLevel(findings), findings, target, text: formatReport(findings, meta) };
}

module.exports = {
    listBackends,
    resolveTarget,
    staticFindings,
    probeFindings,
    serverFindings,
    worstLevel,
    formatReport,
    runBackendCheck,
};
