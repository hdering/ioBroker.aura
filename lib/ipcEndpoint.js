'use strict';

/**
 * The local IPC endpoint between Aura's daemon and the web adapter extension
 * (lib/webExtension.js) - a Unix domain socket, on Windows a named pipe (#997).
 *
 * Aura listens there in addition to its TCP port; the extension prefers it and
 * falls back to TCP when it is missing (older Aura, Aura on another host, no
 * permission, Aura not started yet). No port, nothing reachable from outside.
 *
 * Both processes derive the path from the same inputs - the ioBroker data
 * directory and the instance namespace - so no setting and no state has to
 * carry it. The extension stays loaded in the web adapter until web restarts:
 * the derivation must not change between versions, or an old extension keeps
 * looking for a socket a new daemon no longer opens (it then just uses TCP).
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Unix socket paths are limited to 108 bytes on Linux and 104 on macOS - stay below both. */
const UNIX_PATH_MAX = 100;

/**
 * The ioBroker data directory (`…/iobroker-data`), or null when it cannot be found.
 *
 * @returns {string|null} the directory
 */
function defaultDataRoot() {
    try {
        const utils = require('@iobroker/adapter-core');
        const dir = typeof utils.getAbsoluteDefaultDataDir === 'function' ? utils.getAbsoluteDefaultDataDir() : '';
        return dir || null;
    } catch {
        return null;
    }
}

/**
 * Where an Aura instance listens locally.
 *
 * - Windows: `\\.\pipe\iobroker-<hash>-aura.0` - pipes share one namespace per
 *   machine, the hash of the data directory keeps two ioBroker installations apart.
 * - elsewhere: `<data>/aura.0/aura.sock`, or `<tmp>/iobroker-<hash>-aura.0.sock`
 *   when that path is too long for a Unix socket.
 *
 * @param {string} namespace the instance, e.g. `aura.0`
 * @param {string|null} dataRoot the ioBroker data directory
 * @param {string} [platform] `process.platform`
 * @param {string} [tmpDir] fallback directory for over-long paths
 * @returns {string|null} the path, or null when it cannot be derived
 */
function ipcPath(namespace, dataRoot, platform = process.platform, tmpDir = os.tmpdir()) {
    const ns = String(namespace || '').trim();
    if (!/^[A-Za-z0-9._-]+$/.test(ns) || !dataRoot) {
        return null;
    }
    const p = platform === 'win32' ? path.win32 : path.posix;
    const root = p.resolve(String(dataRoot));
    const tag = crypto
        .createHash('sha1')
        .update(platform === 'win32' ? root.toLowerCase() : root)
        .digest('hex')
        .slice(0, 8);
    if (platform === 'win32') {
        return `\\\\.\\pipe\\iobroker-${tag}-${ns}`;
    }
    const inData = p.join(root, ns, 'aura.sock');
    if (Buffer.byteLength(inData) <= UNIX_PATH_MAX) {
        return inData;
    }
    return p.join(tmpDir, `iobroker-${tag}-${ns}.sock`);
}

/**
 * Whether the endpoint is a Windows named pipe (no file, no modes, no directory).
 *
 * @param {string|null} socketPath the endpoint
 * @returns {boolean} true for `\\.\pipe\…`
 */
function isPipe(socketPath) {
    return typeof socketPath === 'string' && socketPath.startsWith('\\\\.\\pipe\\');
}

/**
 * Clears what a crashed daemon left behind: a socket file that nobody listens on
 * makes `listen` fail with EADDRINUSE. Only a socket is removed, never a file
 * that happens to have the name. Named pipes vanish with their process.
 *
 * @param {string} socketPath the endpoint
 */
function removeStaleSocket(socketPath) {
    if (!socketPath || isPipe(socketPath)) {
        return;
    }
    try {
        if (fs.lstatSync(socketPath).isSocket()) {
            fs.unlinkSync(socketPath);
        }
    } catch {
        /* not there */
    }
}

module.exports = { ipcPath, defaultDataRoot, removeStaleSocket, isPipe, UNIX_PATH_MAX };
