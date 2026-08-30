'use strict';

/**
 * Builds the block a user pastes into their AI client, and the address it points at.
 *
 * Lives here rather than in main.js so the test exercises the real thing. A copy
 * of this logic inside the test would pass forever while main.js drifted away
 * from it — and the one value that must not be wrong is the URL.
 */

const os = require('node:os');
const dgram = require('node:dgram');

const PRIVATE_V4 = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];

/**
 * The address the OS would use to talk to other networks.
 *
 * Picking by interface name or by "is it private" does not work: a machine with
 * VMware or Hyper-V has several private addresses and the host-only adapter
 * (192.168.171.1) looks exactly as good as the real LAN one (192.168.188.235).
 * Asking the routing table settles it.
 *
 * connect() on a UDP socket sends nothing — it only fixes the default peer, which
 * makes the kernel choose a source address. No packet leaves the machine.
 */
function outboundAddress(timeoutMs = 300) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value, socket) => {
            if (settled) {
                return;
            }
            settled = true;
            try {
                socket && socket.close();
            } catch {
                /* already closed */
            }
            resolve(value);
        };
        let socket;
        try {
            socket = dgram.createSocket('udp4');
        } catch {
            resolve(null);
            return;
        }
        // Never hold the process open, and never be the reason a shutdown asserts
        // inside libuv: the socket is unref'd, so an abandoned detection cannot
        // keep the adapter alive or die noisily on exit.
        try {
            socket.unref();
        } catch {
            /* older runtimes */
        }
        const timer = setTimeout(() => finish(null, socket), timeoutMs);
        socket.on('error', () => {
            clearTimeout(timer);
            finish(null, socket);
        });
        try {
            socket.connect(53, '8.8.8.8', () => {
                clearTimeout(timer);
                let addr = null;
                try {
                    const a = socket.address();
                    addr = a && a.address && a.address !== '0.0.0.0' ? a.address : null;
                } catch {
                    /* no route */
                }
                finish(addr, socket);
            });
        } catch {
            clearTimeout(timer);
            finish(null, socket);
        }
    });
}

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
    const ip = o.hostIp || hostAddresses(o.interfaces || os.networkInterfaces())[0];
    return `${scheme}://${ip || '<ioBroker-IP>'}:${port}`;
}

/** baseUrl, but asking the routing table first. Use this at runtime. */
async function resolveBaseUrl(opts) {
    const o = opts || {};
    if (o.customUrl) {
        return baseUrl(o);
    }
    return baseUrl({ ...o, hostIp: o.hostIp || (await outboundAddress()) });
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

/** clientConfig with the routed address resolved. */
async function resolveClientConfig(opts, token) {
    const url = await resolveBaseUrl(opts);
    return clientConfig({ customUrl: url }, token);
}

/** What replaces the token once the block has been stored. */
const TOKEN_PLACEHOLDER = '<Token aus dem Feld darüber>';

/**
 * Replace a real token in a stored client block with the placeholder.
 *
 * The block has to show the token in full right after it is generated — that is
 * the moment the user copies it into their client. It should NOT still be
 * readable when the configuration page is opened again weeks later for some
 * unrelated setting, so the adapter masks it on the next start.
 *
 * As a side effect the block can no longer go stale: it carries no token, so a
 * manually changed one does not silently leave a wrong value behind.
 *
 * Returns null when there is nothing to mask, so the caller can skip the write.
 */
function maskClientConfig(block) {
    if (typeof block !== 'string' || !block) {
        return null;
    }
    const masked = block.replace(/"Bearer\s+[^"]+"/g, `"Bearer ${TOKEN_PLACEHOLDER}"`);
    return masked === block ? null : masked;
}

module.exports = {
    TOKEN_PLACEHOLDER,
    baseUrl,
    clientConfig,
    hostAddresses,
    maskClientConfig,
    outboundAddress,
    resolveBaseUrl,
    resolveClientConfig,
};
