'use strict';

/**
 * Builds the block a user pastes into their AI client, and the address it points at.
 *
 * Lives here rather than in main.js so the test exercises the real thing. A copy
 * of this logic inside the test would pass forever while main.js drifted away
 * from it — and the one value that must not be wrong is the URL.
 */

const os = require('node:os');

const PRIVATE_V4 = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];

/** Non-internal IPv4 addresses of this host, private ranges first. */
function hostAddresses(interfaces) {
    const found = [];
    for (const addrs of Object.values(interfaces || {})) {
        for (const a of addrs || []) {
            // Node reports family as 'IPv4' (string) or 4 (number), depending on version.
            const isV4 = a.family === 'IPv4' || a.family === 4;
            if (isV4 && !a.internal && a.address) {
                found.push(a.address);
            }
        }
    }
    // A VPN or container bridge often sits on the first interface; a LAN address
    // is what other machines in the house can actually reach.
    const isPrivate = (ip) => PRIVATE_V4.some((re) => re.test(ip));
    const ordered = [...found.filter(isPrivate), ...found.filter((ip) => !isPrivate(ip))];
    return ordered.filter((ip, i) => ordered.indexOf(ip) === i);
}

/**
 * Base URL a client would use to reach this instance.
 *
 * A configured base URL wins: it is the only thing that knows about a reverse
 * proxy or a hostname. Otherwise the host's own LAN address — the adapter runs ON
 * the ioBroker host, so its non-internal IPv4 is the address other machines use.
 * If nothing looks usable, a visible placeholder is left in rather than a
 * confidently wrong host.
 *
 * @param {object} opts { customUrl, port, https, interfaces }
 */
function baseUrl(opts) {
    const o = opts || {};
    if (o.customUrl) {
        return String(o.customUrl).replace(/\/+$/, '');
    }
    const scheme = o.https ? 'https' : 'http';
    const port = o.port || 8095;
    const ip = hostAddresses(o.interfaces || os.networkInterfaces())[0];
    return `${scheme}://${ip || '<ioBroker-IP>'}:${port}`;
}

/** The ready-to-paste mcpServers block. */
function clientConfig(opts, token) {
    return JSON.stringify(
        {
            mcpServers: {
                aura: {
                    type: 'http',
                    url: `${baseUrl(opts)}/mcp`,
                    headers: { Authorization: `Bearer ${token}` },
                },
            },
        },
        null,
        2,
    );
}

module.exports = { baseUrl, clientConfig, hostAddresses };
