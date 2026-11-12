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

/** @param {string} ip */
function isBlockedAddress(ip) {
    let a = String(ip || '').toLowerCase();
    if (a.startsWith('[') && a.endsWith(']')) {
        a = a.slice(1, -1);
    }
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) {
        a = mapped[1];
    }
    if (net.isIPv4(a)) {
        const [o1, o2] = a.split('.').map(Number);
        return o1 === 127 || o1 === 0 || (o1 === 169 && o2 === 254);
    }
    if (net.isIPv6(a)) {
        return a === '::1' || a === '::' || /^fe[89ab]/.test(a);
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
