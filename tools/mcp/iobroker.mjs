// Minimal ioBroker client for the MCP server.
//
// The connection is LAZY on purpose: the schema and validation tools work with
// no ioBroker at all, so a misconfigured URL must not make the whole server
// useless — it may only fail the tools that genuinely need live config.
//
// @iobroker/ws is browser-shaped: its ESM build exports nothing and instead
// assigns globalThis.io. Node 22+ supplies the WebSocket global it expects.

import '@iobroker/ws';

const DEFAULT_URL = 'http://127.0.0.1:8095';

let socket = null;
let connecting = null;
/** Until when a failed connect keeps failing fast, ms since epoch. */
let cooldownUntil = 0;

const COOLDOWN_MS = 30000;

export function auraNamespace() {
    return process.env.AURA_NAMESPACE ?? 'aura.0';
}

export function ioBrokerUrl() {
    return process.env.AURA_IOBROKER_URL ?? DEFAULT_URL;
}

/**
 * Connect once and reuse. Rejects with a message that names the URL, because a
 * wrong URL is by far the most likely cause and the error otherwise reads as a
 * bare socket failure.
 */
export function getSocket() {
    if (socket?.connected) {
        return Promise.resolve(socket);
    }
    if (connecting) {
        return connecting;
    }

    const url = ioBrokerUrl();
    const unreachable = () =>
        new Error(
            `Keine Verbindung zu ioBroker unter ${url}. AURA_IOBROKER_URL prüfen ` +
                '(Adresse von Auras eigenem Server, Standardport 8095).',
        );

    // A wrong URL would otherwise start a fresh reconnect loop on every single
    // tool call, each retrying forever in the background.
    if (Date.now() < cooldownUntil) {
        return Promise.reject(unreachable());
    }

    connecting = new Promise((resolve, reject) => {
        const client = globalThis.io.connect(url, { name: 'aura-mcp', connectTimeout: 8000 });
        const timeout = setTimeout(
            () => {
                connecting = null;
                cooldownUntil = Date.now() + COOLDOWN_MS;
                // @iobroker/ws reconnects on its own until told to stop.
                try {
                    client.destroy();
                } catch {
                    /* nothing to clean up */
                }
                reject(unreachable());
            },
            Number(process.env.AURA_CONNECT_TIMEOUT ?? 12000),
        );

        client.on('connect', () => {
            clearTimeout(timeout);
            socket = client;
            connecting = null;
            cooldownUntil = 0;
            resolve(client);
        });
    });
    return connecting;
}

function emit(name, ...args) {
    return getSocket().then(
        (s) =>
            new Promise((resolve, reject) => {
                s.emit(name, ...args, (err, res) => (err ? reject(new Error(String(err))) : resolve(res)));
            }),
    );
}

export function getState(id) {
    return emit('getState', id);
}

export function getObject(id) {
    return emit('getObject', id);
}

/** Range query over the object database, e.g. ('state', 'alias.', 'alias.香'). */
export function getObjectView(type, startkey = '', endkey = '香') {
    return emit('getObjectView', 'system', type, { startkey, endkey });
}

/**
 * All state ids, including aliases.
 *
 * getObjectView('state') does NOT return alias objects, so a dashboard built on
 * an alias-only installation would validate as "datapoint does not exist" for
 * every single widget. The second range query is not optional.
 */
export async function listStateIds() {
    const [plain, aliases] = await Promise.all([getObjectView('state'), getObjectView('state', 'alias.', 'alias.香')]);
    const ids = new Set();
    for (const row of plain?.rows ?? []) {
        if (row?.id) ids.add(row.id);
    }
    for (const row of aliases?.rows ?? []) {
        if (row?.id) ids.add(row.id);
    }
    return ids;
}

export function closeSocket() {
    try {
        socket?.close();
    } catch {
        /* already gone */
    }
    socket = null;
}
