'use strict';

/**
 * MCP over HTTP, served by Aura's own server at POST /mcp.
 *
 * Why HTTP rather than a stdio process: the user's MCP client configuration
 * becomes a single URL — no file path into node_modules, no local install, and
 * reachable from any machine that can reach Aura. It is also the cheaper option
 * for the adapter, because running inside the adapter means the ioBroker
 * connection already exists; no socket client, no credentials, no reconnect.
 *
 * JSON-RPC 2.0 is spoken directly. The official SDK would have pulled 95 packages
 * (express, hono, jose, ajv, zod — 24 MB) into an adapter that executes none of
 * them, for four methods: initialize, tools/list, tools/call and ping.
 *
 * A token is REQUIRED. Aura's server has no authentication of its own, so an
 * unprotected endpoint would hand every reader on the network the dashboard
 * configuration and every writer the ability to change it.
 */

const fs = require('node:fs');
const path = require('node:path');

const { INSTRUCTIONS, TOOLS, callTool, levelIndex, toolsFor } = require('./tools');

const LATEST_PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = [LATEST_PROTOCOL_VERSION, '2025-06-18', '2025-03-26', '2024-11-05'];

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

/** Requests are small (a tab payload at most); anything larger is not a real client. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const SCHEMA_CANDIDATES = [
    path.join(__dirname, '../../public/ai/aura-widget-schema.json'),
    path.join(__dirname, '../../www/ai/aura-widget-schema.json'),
];

const METRICS_CANDIDATES = [
    path.join(__dirname, '../../public/ai/aura-widget-metrics.json'),
    path.join(__dirname, '../../www/ai/aura-widget-metrics.json'),
];

const THEME_CANDIDATES = [
    path.join(__dirname, '../../public/ai/aura-theme-tokens.json'),
    path.join(__dirname, '../../www/ai/aura-theme-tokens.json'),
];

let schemaCache = null;
let metricsCache;
let themeCache;

function loadSchema() {
    if (schemaCache) {
        return schemaCache;
    }
    for (const file of SCHEMA_CANDIDATES) {
        if (fs.existsSync(file)) {
            schemaCache = JSON.parse(fs.readFileSync(file, 'utf8'));
            return schemaCache;
        }
    }
    throw new Error('Widget-Schema nicht gefunden — gehört als public/ai/aura-widget-schema.json ins Paket.');
}

/**
 * The measured height metrics. Optional, unlike the schema: without them
 * aura_measure still answers the grid arithmetic, which is the exact half.
 */
function loadMetrics() {
    if (metricsCache !== undefined) {
        return metricsCache;
    }
    metricsCache = null;
    for (const file of METRICS_CANDIDATES) {
        if (fs.existsSync(file)) {
            try {
                metricsCache = JSON.parse(fs.readFileSync(file, 'utf8'));
            } catch {
                metricsCache = null;
            }
            break;
        }
    }
    return metricsCache;
}

/**
 * The theme palette. Optional like the metrics: without it the colour block is
 * left out rather than guessed.
 */
function loadThemeTokens() {
    if (themeCache !== undefined) {
        return themeCache;
    }
    themeCache = null;
    for (const file of THEME_CANDIDATES) {
        if (fs.existsSync(file)) {
            try {
                themeCache = JSON.parse(fs.readFileSync(file, 'utf8'));
            } catch {
                themeCache = null;
            }
            break;
        }
    }
    return themeCache;
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (c) => {
            size += c.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('Anfrage zu groß'));
                req.destroy();
                return;
            }
            chunks.push(c);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

/** Bearer token, or the bare token — clients differ in what they send. */
function presentedToken(req) {
    const header = req.headers.authorization || '';
    const bearer = header.match(/^Bearer\s+(.+)$/i);
    if (bearer) {
        return bearer[1].trim();
    }
    if (header) {
        return header.trim();
    }
    const alt = req.headers['x-aura-token'];
    return typeof alt === 'string' ? alt.trim() : '';
}

/** Length-independent comparison, so a wrong token leaks nothing by timing. */
function tokensMatch(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a.length) {
        return false;
    }
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

/** Told to the model on connect, so it does not plan work it may not carry out. */
function modeNote(mode) {
    switch (String(mode || 'read')) {
        case 'delete':
            return 'Permission: delete — everything, including removing tabs, sections, layouts and popups. Ask the user before deleting anything.';
        case 'rename':
            return 'Permission: rename — reading, writing and renaming. Deleting is NOT allowed; say so instead of working around it.';
        case 'write':
            return 'Permission: write — reading, creating and changing. Renaming and deleting are NOT allowed; say so instead of working around it.';
        default:
            return 'Permission: read only. You can inspect and validate, but nothing can be changed. Offer the JSON for the user to import by hand instead.';
    }
}

async function dispatch(msg, ctx) {
    const { method, params = {} } = msg;

    switch (method) {
        case 'initialize':
            return {
                protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(params.protocolVersion)
                    ? params.protocolVersion
                    : LATEST_PROTOCOL_VERSION,
                capabilities: { tools: {} },
                serverInfo: { name: 'aura', version: ctx.version || '1.0.0' },
                // Read by the model on connect: what this server is for, and that
                // datapoints come from the ioBroker MCP server, not from here.
                instructions: `${INSTRUCTIONS}

${modeNote(ctx.mode)}`,
            };
        case 'ping':
            return {};
        case 'tools/list':
            // Only what the configured level allows. Advertising a tool and then
            // refusing it wastes a round trip and leaves the model guessing why.
            return { tools: toolsFor(ctx.mode) };
        case 'tools/call': {
            const name = params.name;
            const tool = TOOLS.find((t) => t.name === name);
            if (!name || !tool) {
                return { __rpcError: { code: METHOD_NOT_FOUND, message: `Unbekanntes Werkzeug: ${name}` } };
            }
            // The list is already filtered, but a client may have cached an older
            // one — the gate has to sit on the call, not only on the listing.
            if (levelIndex(tool.level) > levelIndex(ctx.mode)) {
                return {
                    content: [
                        {
                            type: 'text',
                            text:
                                `"${name}" braucht die Berechtigung "${tool.level}", eingestellt ist "${ctx.mode || 'read'}". ` +
                                'Zu ändern in der Adapter-Konfiguration unter „KI-Zugriff (MCP)“.',
                        },
                    ],
                    isError: true,
                };
            }
            try {
                return await callTool(name, params.arguments || {}, {
                    adapter: ctx.adapter,
                    schema: loadSchema(),
                    metrics: loadMetrics(),
                    themeTokens: loadThemeTokens(),
                });
            } catch (e) {
                // A failing TOOL is a normal result carrying isError — the model is
                // meant to read it and correct itself, not to see a transport error.
                return { content: [{ type: 'text', text: String((e && e.message) || e) }], isError: true };
            }
        }
        default:
            return { __rpcError: { code: METHOD_NOT_FOUND, message: `Unbekannte Methode: ${method}` } };
    }
}

/**
 * Handle one request to /mcp. Returns true when it took responsibility for `res`.
 *
 * @param {object} req
 * @param {object} res
 * @param {object} ctx { adapter, token, version }
 */
async function handleMcpRequest(req, res, ctx) {
    const send = (status, body) => {
        const payload = JSON.stringify(body);
        res.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(payload),
            'Cache-Control': 'no-store',
        });
        res.end(payload);
    };

    // Refusing to serve without a token is the point: Aura's server has no
    // authentication of its own, so "no token" would mean "no protection".
    if (!ctx.token) {
        return send(503, {
            error: 'MCP ist aktiviert, aber es ist kein Token gesetzt. In der Adapter-Konfiguration eintragen.',
        });
    }
    if (!tokensMatch(presentedToken(req), ctx.token)) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'WWW-Authenticate': 'Bearer' });
        res.end(JSON.stringify({ error: 'Ungültiger oder fehlender Token.' }));
        return true;
    }

    if (req.method !== 'POST') {
        return send(405, { error: 'Nur POST.' });
    }

    let raw;
    try {
        raw = await readBody(req);
    } catch (e) {
        return send(413, { error: String((e && e.message) || e) });
    }

    let msg;
    try {
        msg = JSON.parse(raw);
    } catch {
        return send(200, { jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'Parse error' } });
    }

    // A batch is legal JSON-RPC; clients send one message at a time, but handling
    // both costs three lines and avoids a puzzling failure if one ever does.
    const batch = Array.isArray(msg) ? msg : [msg];
    const out = [];
    for (const one of batch) {
        if (!one || one.jsonrpc !== '2.0' || typeof one.method !== 'string') {
            out.push({
                jsonrpc: '2.0',
                id: (one && one.id) ?? null,
                error: { code: INVALID_REQUEST, message: 'Invalid request' },
            });
            continue;
        }
        // Notifications carry no id and get no answer.
        const isNotification = one.id === undefined || one.id === null;
        let result;
        try {
            result = await dispatch(one, ctx);
        } catch (e) {
            if (!isNotification) {
                out.push({
                    jsonrpc: '2.0',
                    id: one.id,
                    error: { code: INTERNAL_ERROR, message: String((e && e.message) || e) },
                });
            }
            continue;
        }
        if (isNotification) {
            continue;
        }
        if (result && result.__rpcError) {
            out.push({ jsonrpc: '2.0', id: one.id, error: result.__rpcError });
        } else {
            out.push({ jsonrpc: '2.0', id: one.id, result });
        }
    }

    if (!out.length) {
        // Nothing but notifications — 202 with no body, as the transport expects.
        res.writeHead(202);
        res.end();
        return true;
    }
    return send(200, Array.isArray(msg) ? out : out[0]);
}

module.exports = { handleMcpRequest, LATEST_PROTOCOL_VERSION };
