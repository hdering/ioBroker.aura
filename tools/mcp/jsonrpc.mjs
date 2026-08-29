// Minimal MCP server over stdio, without @modelcontextprotocol/sdk.
//
// The SDK pulls 95 packages (express, hono, jose, ajv, zod …) — 24 MB on disk —
// into an adapter that never executes any of them. What we actually use is three
// methods over newline-delimited JSON-RPC 2.0, so that is what this implements.
// The SDK stays a devDependency: the smoke test drives this server with the real
// client, which is what keeps the hand-written protocol honest.
//
// Transport rules that matter (MCP stdio):
//   - one JSON message per line, UTF-8, no embedded newlines
//   - a chunk may hold several messages, or half of one
//   - stdout carries nothing but protocol (see stdio-guard.mjs)

/** Newest version this server speaks, plus the older ones it accepts. */
export const LATEST_PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = [LATEST_PROTOCOL_VERSION, '2025-06-18', '2025-03-26', '2024-11-05'];

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

/**
 * Serve MCP on stdin/stdout.
 *
 * @param {object} opts
 * @param {{name: string, version: string}} opts.serverInfo
 * @param {Array<object>} opts.tools Tool descriptors as returned by tools/list.
 * @param {(name: string, args: object) => Promise<object>} opts.callTool
 * @returns {Promise<void>} resolves when stdin closes
 */
export function serveStdio({ serverInfo, tools, callTool }) {
    const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
    const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
    const replyError = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

    async function handle(msg) {
        // Notifications carry no id and must never be answered — replying to
        // notifications/initialized makes strict clients drop the connection.
        const isNotification = msg.id === undefined || msg.id === null;
        const { method, params = {} } = msg;

        if (isNotification) {
            return;
        }

        switch (method) {
            case 'initialize': {
                const asked = params.protocolVersion;
                return reply(msg.id, {
                    protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(asked) ? asked : LATEST_PROTOCOL_VERSION,
                    capabilities: { tools: {} },
                    serverInfo,
                });
            }
            case 'ping':
                return reply(msg.id, {});
            case 'tools/list':
                return reply(msg.id, { tools });
            case 'tools/call': {
                const name = params.name;
                if (!name || !tools.some((t) => t.name === name)) {
                    return replyError(msg.id, METHOD_NOT_FOUND, `Unbekanntes Werkzeug: ${name}`);
                }
                try {
                    // A failing TOOL is a normal result carrying isError, not a
                    // JSON-RPC error — the model is meant to read and act on it.
                    return reply(msg.id, await callTool(name, params.arguments ?? {}));
                } catch (e) {
                    return reply(msg.id, {
                        content: [{ type: 'text', text: String(e?.message ?? e) }],
                        isError: true,
                    });
                }
            }
            default:
                return replyError(msg.id, METHOD_NOT_FOUND, `Unbekannte Methode: ${method}`);
        }
    }

    return new Promise((resolve) => {
        let buffer = '';
        process.stdin.setEncoding('utf8');

        process.stdin.on('data', (chunk) => {
            buffer += chunk;
            let nl;
            while ((nl = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, nl).trim();
                buffer = buffer.slice(nl + 1);
                if (!line) {
                    continue;
                }
                let msg;
                try {
                    msg = JSON.parse(line);
                } catch {
                    send({ jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'Parse error' } });
                    continue;
                }
                if (msg?.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
                    // A response to something we sent — we send no requests, so ignore.
                    if (msg && (msg.result !== undefined || msg.error !== undefined)) {
                        continue;
                    }
                    send({
                        jsonrpc: '2.0',
                        id: msg?.id ?? null,
                        error: { code: INVALID_REQUEST, message: 'Invalid request' },
                    });
                    continue;
                }
                // Never let one bad message take the server down.
                void handle(msg).catch((e) => {
                    if (msg.id !== undefined && msg.id !== null) {
                        replyError(msg.id, INTERNAL_ERROR, String(e?.message ?? e));
                    }
                });
            }
        });

        process.stdin.on('end', resolve);
        process.stdin.on('close', resolve);
    });
}
