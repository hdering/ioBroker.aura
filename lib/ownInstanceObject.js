'use strict';

/**
 * Everything Aura changes in its own instance object (`system.adapter.aura.N`)
 * while it starts, collected so that main.js writes the object ONCE.
 *
 * Every write to the own instance object makes js-controller restart the
 * instance, and with the web adapter extension on, the web instance restarts
 * with it. One write per start means one such restart instead of up to three
 * (token migration, PIN reset flag, links/masking/migrations each used to
 * write on their own).
 *
 * The function only changes `obj` in place and reports what it did; reading and
 * writing the object stays with the caller.
 */

const { maskClientConfig } = require('./mcp/clientConfig');

/** A generated MCP token: 32 hex characters (see `generateMcpToken` in main.js). */
const PLAIN_MCP_TOKEN = /^[0-9a-f]{32}$/;

/**
 * @param {Record<string, any>} obj the own instance object as stored - `encryptedNative`
 *   NOT decrypted, i.e. as `getForeignObject` returns it
 * @param {object} p what the adapter provides
 * @param {(value: string) => string} p.encrypt the adapter's `encrypt()`
 * @param {boolean} p.clearResetAdminPin the admin PIN reset ran in this start, so the
 *   "reset on next start" flag goes back to false
 * @param {(webInstance: string, ownPort: boolean) => Promise<Record<string, { link: string, name: Record<string, string> }>>} p.localLinks
 *   the links the instance should offer, for the web instance chosen after the migrations below
 * @param {(native: Record<string, any>) => Promise<{ ownPort: boolean, webInstance?: string, reason: string }>} [p.decideOwnPort]
 *   first start with this version (`native.ownPort` not yet true/false): keep the own
 *   port or not, and which web instance takes over (#997)
 * @returns {Promise<{ changed: boolean, reasons: string[], plainMcpToken: string | null, info: string[], debug: string[] }>}
 *   `plainMcpToken` is the real token when it was found in clear text - the
 *   decrypted config of this run holds noise in that case; `info`/`debug` are
 *   log lines for the caller
 */
async function syncOwnInstanceObject(obj, { encrypt, clearResetAdminPin, localLinks, decideOwnPort }) {
    obj.common = obj.common || {};
    obj.native = obj.native || {};
    const native = obj.native;
    const info = [];
    const debug = [];
    let changed = false;
    /** What changed, for the log line of the write - every write restarts the instance. */
    const reasons = [];
    const mark = (what) => {
        changed = true;
        reasons.push(what);
    };
    let plainMcpToken = null;

    // `mcpToken` is listed in io-package's `encryptedNative` since 0.52.3, so
    // js-controller decrypts whatever sits in the instance object - a token
    // written before that move (or straight into the object, past the admin
    // page) comes back as noise. A generated token is 32 hex characters, a clear
    // enough fingerprint to recognise the plain text and store it encrypted. A
    // hand-typed token that does not match has to be entered once more.
    if (typeof native.mcpToken === 'string' && PLAIN_MCP_TOKEN.test(native.mcpToken)) {
        plainMcpToken = native.mcpToken;
        native.mcpToken = encrypt(plainMcpToken);
        mark('native.mcpToken (encrypted)');
        info.push('aura: MCP token was stored in clear text and has been encrypted in place');
    }

    // "Reset admin PIN on next start" is a one-shot switch.
    if (clearResetAdminPin && native.resetAdminPin) {
        native.resetAdminPin = false;
        mark('native.resetAdminPin');
    }

    // `webInstance` switches the web adapter extension (lib/webExtension.js) and
    // names the ONE web instance that loads it. `*` is left over from before
    // 0.9.91, when every web instance loaded the old extension and restarted on
    // every Aura start/stop.
    if (native.webInstance === '*') {
        native.webInstance = '';
        mark('native.webInstance (legacy *)');
        info.push(
            'aura: cleared legacy webInstance "*" — the web adapter extension stays off until a web instance is chosen',
        );
    }
    // The socket backend choice (#519) briefly lived in `webInstance` as well; a
    // socketio/ws instance there can only be that.
    const legacy = String(native.webInstance || '');
    if (legacy && !/^web\.\d+$/.test(legacy)) {
        if (!native.socketInstance) {
            native.socketInstance = legacy;
        }
        native.webInstance = '';
        mark('native.webInstance → socketInstance');
        info.push(`aura: moved socket backend "${legacy}" from webInstance to socketInstance`);
    }

    // The own port is on its way out (#997). Decided once, on the first start
    // with this version: an installation that has been running keeps its port
    // (kiosks, bookmarks, reverse proxies point at it), a new one goes without
    // as soon as a web instance can take over.
    if (typeof native.ownPort !== 'boolean' && decideOwnPort) {
        const d = await decideOwnPort(native);
        native.ownPort = d.ownPort;
        if (d.webInstance && !native.webInstance) {
            native.webInstance = d.webInstance;
        }
        mark('native.ownPort');
        info.push(d.reason);
    }
    // Forwarding the old port once it is switched off (step 10): meant for the
    // devices that knew it - on for a port that is in use, off for a new
    // installation that never had one. Also decided once.
    if (typeof native.ownPort === 'boolean' && typeof native.portRedirect !== 'boolean') {
        native.portRedirect = native.ownPort === true;
        mark('native.portRedirect');
    }
    // A port that is neither served nor forwarded any more is cleared: admin lists
    // `native.port` in the instance list and js-controller 8 registers it as taken,
    // so it would keep showing up - and clash with another adapter on that number.
    // The number goes to `portBefore`, for "Forward the old port" switched on
    // again and for the fallback that opens the port without a usable web instance.
    const portIdle =
        native.ownPort === false &&
        native.portRedirect === false &&
        /^web\.\d+$/.test(String(native.webInstance || ''));
    const port = Number(native.port) || 0;
    if (portIdle && port) {
        native.portBefore = port;
        native.port = 0;
        mark(`native.port (${port} unused → 0)`);
    } else if (!portIdle && !port && Number(native.portBefore)) {
        native.port = Number(native.portBefore);
        mark(`native.port (back to ${native.port})`);
    }

    const want = await localLinks(String(native.webInstance || ''), native.ownPort !== false);
    const cur = obj.common.localLinks || {};
    const differ = ['frontend', 'backend', 'web', 'webBackend'].filter((key) => cur[key]?.link !== want[key]?.link);
    if (differ.length) {
        obj.common.localLinks = want;
        mark(
            `common.localLinks (${differ.map((key) => `${key}: ${cur[key]?.link ?? '-'} → ${want[key]?.link ?? '-'}`).join(', ')})`,
        );
        debug.push(`localLinks updated to ${want.frontend?.link}`);
    }

    // The generated client blocks show the token in full so they can be copied;
    // once stored there is no reason for it to stay readable on every later visit
    // to the config page. Both blocks carry it, so both are masked - leaving one
    // behind would defeat the point. maskClientConfig() returns null when there is
    // nothing to mask, so an already masked block causes no write.
    let maskedAny = false;
    for (const field of ['mcpClientConfig', 'mcpDesktopConfig']) {
        const masked = maskClientConfig(native[field]);
        if (masked) {
            native[field] = masked;
            mark(`native.${field} (masked)`);
            maskedAny = true;
        }
    }
    if (maskedAny) {
        info.push(
            'aura: MCP client configuration stored — token replaced by a placeholder. ' +
                'Generate a new token to see a complete block again.',
        );
    }

    return { changed, reasons, plainMcpToken, info, debug };
}

module.exports = { syncOwnInstanceObject };
