'use strict';
/**
 * Where Aura's own server listens (`native.bind`) and what follows from it.
 *
 * Empty = every interface, as before. `127.0.0.1` = this machine only: the port
 * cannot be reached from the network, Aura is used through the web adapter
 * extension (`<web-port>/aura/`), which forwards to `127.0.0.1:<port>` anyway.
 *
 * The key is `bind` on purpose: js-controller 8 lists `native.port` plus
 * `native.bind` of every instance as an occupied TCP port in
 * `system.host.<host>.usedResources.tcpPort` (doc/used-resources.md of
 * js-controller), so the registry shows the address Aura really listens on
 * without any code of Aura's.
 */

/**
 * The address to hand to `server.listen`, or undefined for every interface.
 *
 * @param {unknown} bind `native.bind`
 * @returns {string|undefined} the address
 */
function listenAddress(bind) {
    const b = typeof bind === 'string' ? bind.trim() : '';
    return b && b !== '0.0.0.0' && b !== '::' ? b : undefined;
}

/**
 * Whether the server only answers on this machine.
 *
 * @param {unknown} bind `native.bind`
 * @returns {boolean} true for 127.x.x.x, ::1 and localhost
 */
function isLoopbackOnly(bind) {
    const b = listenAddress(bind);
    return !!b && (b === '::1' || b === 'localhost' || /^127\.\d+\.\d+\.\d+$/.test(b));
}

/**
 * What stands in the way of a server that only answers on this machine - it is
 * then reachable through the web adapter extension only, and that has to run on
 * the same host.
 *
 * @param {object} o the situation
 * @param {unknown} o.bind `native.bind`
 * @param {string} [o.webInstance] the web instance of the extension, e.g. `web.0` (empty = off)
 * @param {string} [o.webHost] the host that web instance runs on (`common.host`)
 * @param {string} [o.auraHost] the host this Aura instance runs on
 * @returns {string[]} the problems, empty when there are none
 */
function loopbackProblems(o) {
    if (!isLoopbackOnly(o.bind)) {
        return [];
    }
    const web = String(o.webInstance || '').trim();
    if (!web) {
        return [
            `the server only listens on ${listenAddress(o.bind)}, but no web instance is set for "Also reachable via web instance" - Aura can only be opened on the ioBroker machine itself`,
        ];
    }
    if (o.webHost && o.auraHost && o.webHost !== o.auraHost) {
        return [
            `the server only listens on ${listenAddress(o.bind)}, but ${web} runs on host "${o.webHost}" and Aura on "${o.auraHost}" - the web instance cannot reach it; pick a web instance on "${o.auraHost}" or listen on all interfaces`,
        ];
    }
    return [];
}

/**
 * The options for the MCP client block (lib/mcp/clientConfig): a configured base
 * URL wins; a server that only answers on this machine is reached through the
 * web instance's `/aura/mcp`; otherwise the own port.
 *
 * @param {object} o the situation
 * @param {string} [o.customUrl] `native.customUrl`
 * @param {number} [o.port] the own port
 * @param {boolean} [o.https] whether the own server speaks HTTPS
 * @param {unknown} o.bind `native.bind`
 * @param {{ port?: number, secure?: boolean } | null} [o.web] native of the web instance of the extension
 * @returns {{ customUrl?: string, port?: number, https?: boolean, pathPrefix?: string }} options for resolveBothConfigs
 */
function mcpBaseOptions(o) {
    if (o.customUrl) {
        return { customUrl: o.customUrl, port: o.port, https: o.https };
    }
    if (isLoopbackOnly(o.bind) && o.web) {
        return { port: Number(o.web.port) || 8082, https: !!o.web.secure, pathPrefix: '/aura' };
    }
    return { port: o.port, https: o.https };
}

/**
 * The other instances holding a port, as js-controller 8 answers `checkUsedResource`.
 * Only running instances count (`isBlocked`); this instance itself is left out.
 *
 * @param {unknown} conflicts the answer of `checkUsedResource('tcpPort', …)`
 * @param {string} self this instance, e.g. `aura.0`
 * @returns {string[]} instance names, each once
 */
function portHolders(conflicts, self) {
    if (!Array.isArray(conflicts)) {
        return [];
    }
    const names = [];
    for (const c of conflicts) {
        const inst = c && typeof c === 'object' ? /** @type {{ instance?: unknown, isBlocked?: unknown }} */ (c) : null;
        if (!inst || typeof inst.instance !== 'string' || inst.instance === self || inst.isBlocked === false) {
            continue;
        }
        if (!names.includes(inst.instance)) {
            names.push(inst.instance);
        }
    }
    return names;
}

/**
 * js-controller 8's question "who holds this resource?", or null on an older
 * controller. The installed typings do not know the API yet.
 *
 * @param {object} adapter the adapter instance
 * @returns {((type: string, data: object) => Promise<unknown>) | null} checkUsedResource bound to the adapter
 */
function usedResourceCheck(adapter) {
    const a =
        /** @type {{ supportsFeature?: (feature: string) => boolean, checkUsedResource?: (type: string, data: object) => Promise<unknown> }} */ (
            adapter
        );
    if (
        !a ||
        typeof a.supportsFeature !== 'function' ||
        typeof a.checkUsedResource !== 'function' ||
        !a.supportsFeature('CONTROLLER_USED_RESOURCES')
    ) {
        return null;
    }
    const check = a.checkUsedResource;
    return (type, data) => check.call(a, type, data);
}

module.exports = { listenAddress, isLoopbackOnly, loopbackProblems, mcpBaseOptions, portHolders, usedResourceCheck };
