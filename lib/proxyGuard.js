'use strict';

/**
 * Guards for Aura's outgoing proxy routes (`/proxy`, `/feed`) and the file routes (`/fs/*`).
 *
 * LAN targets stay allowed on purpose — iframes, HTTP request widgets and camera
 * pages point at devices in the home network. What is blocked:
 *  - targets on the ioBroker host itself (loopback) and link-local addresses
 *    (169.254.x.x incl. cloud metadata, fe80::), checked on the resolved address
 *    so a host name or DNS rebinding cannot sneak around it;
 *  - requests a browser marks as cross-site (`Sec-Fetch-Site: cross-site`), so a
 *    foreign web page cannot drive the proxy or read files through a visitor's browser.
 */

const dns = require('node:dns');
const net = require('node:net');

/** @param {string} a IPv4 address */
function isBlockedV4(a) {
    const [o1, o2] = a.split('.').map(Number);
    return o1 === 127 || o1 === 0 || (o1 === 169 && o2 === 254);
}

/**
 * The eight 16-bit groups of an IPv6 address (dotted IPv4 tail allowed).
 *
 * @param {string} a valid IPv6 address
 * @returns {number[]}
 */
function ipv6Groups(a) {
    let s = a;
    const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (tail) {
        const o = tail[1].split('.').map(Number);
        s = `${s.slice(0, -tail[1].length)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
    }
    const [head, rest] = s.split('::');
    const h = head ? head.split(':') : [];
    const r = rest !== undefined && rest !== '' ? rest.split(':') : [];
    const fill = rest !== undefined ? new Array(8 - h.length - r.length).fill('0') : [];
    return [...h, ...fill, ...r].map((g) => parseInt(g, 16));
}

/** @param {string} ip */
function isBlockedAddress(ip) {
    let a = String(ip || '').toLowerCase();
    if (a.startsWith('[') && a.endsWith(']')) {
        a = a.slice(1, -1);
    }
    a = a.replace(/%.*$/, ''); // zone id (fe80::1%eth0)
    if (net.isIPv4(a)) {
        return isBlockedV4(a);
    }
    if (net.isIPv6(a)) {
        const g = ipv6Groups(a);
        // IPv4-mapped (::ffff:a.b.c.d, also written ::ffff:7f00:1) and IPv4-compatible
        // (::a.b.c.d, incl. :: and ::1) addresses carry an IPv4 address in the last 32 bits.
        if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
            return isBlockedV4(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
        }
        return (g[0] & 0xffc0) === 0xfe80; // link-local fe80::/10
    }
    return false;
}

/**
 * `lookup` for http(s).request: resolves like dns.lookup, fails when an address is blocked.
 *
 * @param {string} hostname
 * @param {any} options
 * @param {Function} callback
 */
function guardedLookup(hostname, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    const opts = typeof options === 'number' ? { family: options } : options || {};
    dns.lookup(hostname, opts, (err, address, family) => {
        if (err) {
            return callback(err);
        }
        const list = Array.isArray(address) ? address : [{ address, family }];
        const bad = list.find((e) => isBlockedAddress(e.address));
        if (bad) {
            const e = /** @type {NodeJS.ErrnoException} */ (new Error(`Target address ${bad.address} is not allowed`));
            e.code = 'EAURABLOCKED';
            return callback(e);
        }
        callback(null, address, family);
    });
}

/**
 * Literal IP targets bypass `lookup` in Node — check them up front.
 *
 * @param {string} hostname
 */
function isBlockedHost(hostname) {
    const h = String(hostname || '').toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost')) {
        return true;
    }
    return isBlockedAddress(h);
}

/** @param {import('http').IncomingMessage} req */
function isCrossSite(req) {
    return String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site';
}

module.exports = { isBlockedAddress, isBlockedHost, guardedLookup, isCrossSite };
