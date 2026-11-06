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
 * @param {(webInstance: string) => Promise<Record<string, { link: string, name: Record<string, string> }>>} p.localLinks
 *   the links the instance should offer, for the web instance chosen after the migrations below
 * @returns {Promise<{ changed: boolean, plainMcpToken: string | null, info: string[], debug: string[] }>}
 *   `plainMcpToken` is the real token when it was found in clear text - the
 *   decrypted config of this run holds noise in that case; `info`/`debug` are
 *   log lines for the caller
 */
async function syncOwnInstanceObject(obj, { encrypt, clearResetAdminPin, localLinks }) {
    obj.common = obj.common || {};
    obj.native = obj.native || {};
    const native = obj.native;
    const info = [];
    const debug = [];
    let changed = false;
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
        changed = true;
        info.push('aura: MCP token was stored in clear text and has been encrypted in place');
    }

    // "Reset admin PIN on next start" is a one-shot switch.
    if (clearResetAdminPin && native.resetAdminPin) {
        native.resetAdminPin = false;
        changed = true;
    }

    // `webInstance` switches the web adapter extension (lib/webExtension.js) and
    // names the ONE web instance that loads it. `*` is left over from before
    // 0.9.91, when every web instance loaded the old extension and restarted on
    // every Aura start/stop.
    if (native.webInstance === '*') {
        native.webInstance = '';
        changed = true;
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
        changed = true;
        info.push(`aura: moved socket backend "${legacy}" from webInstance to socketInstance`);
    }

    const want = await localLinks(String(native.webInstance || ''));
    const cur = obj.common.localLinks || {};
    if (['frontend', 'backend', 'web', 'webBackend'].some((key) => cur[key]?.link !== want[key]?.link)) {
        obj.common.localLinks = want;
        changed = true;
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
            changed = true;
            maskedAny = true;
        }
    }
    if (maskedAny) {
        info.push(
            'aura: MCP client configuration stored — token replaced by a placeholder. ' +
                'Generate a new token to see a complete block again.',
        );
    }

    return { changed, plainMcpToken, info, debug };
}

module.exports = { syncOwnInstanceObject };
