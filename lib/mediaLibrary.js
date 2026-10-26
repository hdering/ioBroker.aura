'use strict';

/**
 * Media lists for the slideshow widget (#848).
 *
 *     GET /fs/media?path=<folder>&recursive=1
 *
 * answers a flat list of the images and videos in a folder below one of the
 * allowed roots (`fsRoots`), each with its capture date. The browser could walk
 * `/fs/list` itself, but ten wall tablets would then each scan the same photo
 * folder and nobody would know the capture dates - those need the file content
 * (see mediaDate.js), which is read here once and remembered on disk.
 *
 * The list is answered right away. Dates not known yet are filled in in the
 * background (a few files at a time) and the answer carries `pending` so the
 * widget asks again a little later; until then the file date stands in.
 */

const fs = require('node:fs');
const path = require('node:path');
const { readMediaDate } = require('./mediaDate');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp']);
const VIDEO_EXT = new Set(['.mp4', '.m4v', '.webm', '.mov', '.ogv']);
/** Folders NAS systems and OSes litter photo shares with. */
const SKIP_DIRS = new Set([
    '@eadir',
    '#recycle',
    '#snapshot',
    '$recycle.bin',
    'system volume information',
    'lost+found',
]);
const MAX_DEPTH = 6;
const MAX_FILES = 5000;
/** A folder listing is reused this long - every tablet in the house asks. */
const LIST_TTL_MS = 60 * 1000;
/** Files whose date is read at the same time. */
const DATE_CONCURRENCY = 8;
/** Entries kept in the date cache file. */
const MAX_CACHE_ENTRIES = 50000;
const CACHE_FILE = 'media-dates.json';
const SAVE_DELAY_MS = 5000;

/**
 * @param {string} name file name
 * @returns {'image'|'video'|null} media kind by extension
 */
function mediaKind(name) {
    const ext = path.extname(name).toLowerCase();
    if (IMAGE_EXT.has(ext)) {
        return 'image';
    }
    if (VIDEO_EXT.has(ext)) {
        return 'video';
    }
    return null;
}

/**
 * @param {string} name entry name
 * @returns {boolean} true for hidden entries and NAS housekeeping folders
 */
function isSkipped(name) {
    return name.startsWith('.') || SKIP_DIRS.has(name.toLowerCase());
}

/**
 * A media file found by the scan: absolute path, file name, kind, size in bytes, file date in ms.
 *
 * @typedef {{path: string, name: string, kind: 'image'|'video', size: number, mtime: number}} MediaFile
 */

/**
 * Collect the media files below `dir`.
 *
 * @param {string} dir absolute folder, already checked against the roots
 * @param {object} opts options
 * @param {boolean} opts.recursive descend into subfolders
 * @param {(real: string) => boolean} opts.isAllowed true when a resolved symlink target stays inside the roots
 * @param {number} [opts.maxDepth] subfolder depth limit
 * @param {number} [opts.maxFiles] file count limit
 * @returns {Promise<{files: MediaFile[], truncated: boolean}>} the files, sorted by path
 */
async function scanFolder(dir, { recursive, isAllowed, maxDepth = MAX_DEPTH, maxFiles = MAX_FILES }) {
    const files = [];
    const seen = new Set();
    let truncated = false;

    const walk = async (folder, depth) => {
        let real;
        try {
            real = await fs.promises.realpath(folder);
        } catch {
            return;
        }
        if (seen.has(real)) {
            return;
        } // symlink loop
        seen.add(real);
        let entries;
        try {
            entries = await fs.promises.readdir(folder, { withFileTypes: true });
        } catch {
            return;
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        for (const ent of entries) {
            if (files.length >= maxFiles) {
                truncated = true;
                return;
            }
            if (isSkipped(ent.name)) {
                continue;
            }
            const abs = path.join(folder, ent.name);
            let isDir = ent.isDirectory();
            let isFile = ent.isFile();
            if (ent.isSymbolicLink()) {
                let target;
                try {
                    target = await fs.promises.realpath(abs);
                } catch {
                    continue;
                }
                if (!isAllowed(target)) {
                    continue;
                }
                try {
                    const st = await fs.promises.stat(target);
                    isDir = st.isDirectory();
                    isFile = st.isFile();
                } catch {
                    continue;
                }
            }
            if (isDir) {
                if (recursive && depth < maxDepth) {
                    await walk(abs, depth + 1);
                }
                continue;
            }
            if (!isFile) {
                continue;
            }
            const kind = mediaKind(ent.name);
            if (!kind) {
                continue;
            }
            try {
                const st = await fs.promises.stat(abs);
                files.push({ path: abs, name: ent.name, kind, size: st.size, mtime: Math.round(st.mtimeMs) });
            } catch {
                /* vanished between readdir and stat */
            }
        }
    };
    await walk(dir, 0);
    return { files, truncated };
}

/**
 * Parse an HTTP `Range` header for a file of `size` bytes. Only one range is
 * served (what `<video>` and Safari ask for); a multi-range request is treated
 * as no range, which the spec allows.
 *
 * @param {string|undefined} header Range header value
 * @param {number} size file size
 * @returns {{start: number, end: number}|null|'unsatisfiable'} the range, null for "send everything"
 */
function parseRange(header, size) {
    if (!header) {
        return null;
    }
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
    if (!m) {
        return null;
    }
    const [, a, b] = m;
    if (a === '' && b === '') {
        return null;
    }
    let start;
    let end;
    if (a === '') {
        // suffix: the last N bytes
        const n = Number(b);
        if (n === 0) {
            return 'unsatisfiable';
        }
        start = Math.max(0, size - n);
        end = size - 1;
    } else {
        start = Number(a);
        end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
    }
    if (start >= size || start > end) {
        return 'unsatisfiable';
    }
    return { start, end };
}

/**
 * @param {object} opts options
 * @param {string} opts.dataDir instance data dir for the date cache
 * @param {(real: string) => boolean} opts.isAllowed symlink target check
 * @param {{debug: Function, warn: Function}} [opts.log] adapter log
 * @param {(abs: string) => Promise<number|null>} [opts.readDate] date reader (tests)
 * @returns {{list: (dir: string, recursive: boolean) => Promise<object>, flush: () => Promise<void>, idle: () => Promise<void>}} the library
 */
function createMediaLibrary({ dataDir, isAllowed, log, readDate = readMediaDate }) {
    const cacheFile = path.join(dataDir, CACHE_FILE);
    /** path → [size, mtime, taken|null] */
    let dates = new Map();
    try {
        const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (raw && typeof raw === 'object') {
            for (const [k, v] of Object.entries(raw)) {
                if (Array.isArray(v) && v.length === 3) {
                    dates.set(k, v);
                }
            }
        }
    } catch {
        /* no cache yet */
    }

    const listings = new Map();
    const queue = [];
    const queued = new Set();
    let running = 0;
    const idleWaiters = new Set();
    let saveTimer = null;

    const known = (f) => {
        const e = dates.get(f.path);
        return e && e[0] === f.size && e[1] === f.mtime ? e : null;
    };

    const save = async () => {
        saveTimer = null;
        if (dates.size > MAX_CACHE_ENTRIES) {
            dates = new Map([...dates].slice(dates.size - MAX_CACHE_ENTRIES));
        }
        try {
            await fs.promises.mkdir(dataDir, { recursive: true });
            await fs.promises.writeFile(cacheFile, JSON.stringify(Object.fromEntries(dates)));
        } catch (e) {
            log?.warn(`aura: media date cache not written - ${e.message}`);
        }
    };
    const scheduleSave = () => {
        if (!saveTimer) {
            saveTimer = setTimeout(save, SAVE_DELAY_MS);
        }
    };

    const pump = () => {
        while (running < DATE_CONCURRENCY && queue.length) {
            const f = queue.shift();
            running++;
            readDate(f.path)
                .catch(() => null)
                .then((taken) => {
                    dates.delete(f.path); // re-insert at the end: newest entries survive the cap
                    dates.set(f.path, [f.size, f.mtime, taken ?? null]);
                    scheduleSave();
                })
                .finally(() => {
                    running--;
                    queued.delete(f.path);
                    pump();
                    if (!running && !queue.length) {
                        for (const w of idleWaiters) {
                            w();
                        }
                        idleWaiters.clear();
                    }
                });
        }
    };

    /**
     * @param {string} dir absolute folder inside the roots
     * @param {boolean} recursive descend into subfolders
     * @returns {Promise<object>} the answer of /fs/media
     */
    const list = async (dir, recursive) => {
        const key = `${recursive ? 1 : 0}|${dir}`;
        let entry = listings.get(key);
        if (!entry || Date.now() - entry.at > LIST_TTL_MS) {
            const { files, truncated } = await scanFolder(dir, { recursive, isAllowed });
            entry = { at: Date.now(), files, truncated };
            listings.set(key, entry);
            if (listings.size > 50) {
                listings.delete(listings.keys().next().value);
            }
        }
        let pending = 0;
        const items = entry.files.map((f) => {
            const e = known(f);
            if (!e) {
                pending++;
                if (!queued.has(f.path)) {
                    queued.add(f.path);
                    queue.push(f);
                }
            }
            const taken = e ? e[2] : null;
            return {
                path: f.path,
                name: f.name,
                kind: f.kind,
                size: f.size,
                time: taken ?? f.mtime,
                dateSource: taken ? 'exif' : 'mtime',
            };
        });
        pump();
        return { path: dir, items, truncated: entry.truncated, pending };
    };

    return {
        list,
        /** Write the date cache now (unload). */
        flush: async () => {
            if (saveTimer) {
                clearTimeout(saveTimer);
                await save();
            }
        },
        /** Resolves once no date is being read (tests). */
        idle: () =>
            running || queue.length ? new Promise((resolve) => idleWaiters.add(() => resolve())) : Promise.resolve(),
    };
}

module.exports = { createMediaLibrary, scanFolder, parseRange, mediaKind };
