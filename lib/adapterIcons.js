'use strict';

/**
 * Icons from installed ioBroker icon adapters (#716).
 *
 * ioBroker has a whole family of adapters that exist only to ship graphics —
 * `icons-mfd-svg`, `icons-material-png`, inventwo's `vis-icontwo` … — all
 * marked `common.type: "visualization-icons"`. Their files sit in the adapter's
 * web storage (`<adapter>/…`). Aura does not bundle or re-host any of them: it
 * only offers what the user installed, straight from that storage, so the
 * licence of every set stays between the user and its author.
 *
 *     GET /adapter-icons/sets                   installed sets: id, title, licence, count, folders
 *     GET /adapter-icons/list?set=<adapter>     every icon file of one set (paths below its root)
 *     GET /adapter-icons/file/<adapter>/<path>  the file itself
 *
 * vis-2 icon sets are the second shape (inventwo's `vis-2-widgets-icontwo`):
 * the adapter declares packs in `common.visIconSets`, each a JSON file below
 * the visualisation's `widgets/` folder (`vis-2/widgets/<url>`) that maps an
 * icon name to `{ src: <base64 SVG>, name, words }`. Every pack becomes a
 * folder of its adapter's set, the single icon is cut out of the pack on the
 * server: `/adapter-icons/file/<adapter>/<pack>/<icon>.svg`.
 *
 * The file route answers only for adapters that ARE icon adapters and only for
 * image files — the storage behind it also holds other adapters' data (Aura's
 * own config among it), which must not become readable through a guessed path.
 *
 * The ioBroker side is abstracted as `source`, so the dev server can serve the
 * same routes from a folder on disk:
 *
 *     listIconAdapters() → [{ name, title, license, version, iconSets?: [{ key, name, url }] }]
 *     readDir(ns, dir)   → [{ file, isDir, size }]
 *     readFile(ns, file) → Buffer
 */

const path = require('node:path');

/**
 * What counts as an icon. JPEG is left out on purpose — in these sets it is
 *  backgrounds and photos (vis-icontwo ships 64 of them), not icons.
 */
const ICON_MIME = {
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
};
/** A file this large is a picture, not an icon — and the picker shows hundreds at once. */
const MAX_ICON_BYTES = 512 * 1024;
/** Folder walk guard; the deepest real set nests three levels. */
const MAX_DEPTH = 6;
/** Per set — beyond that the listing is truncated and says so. */
const MAX_ICONS_PER_SET = 20000;
/** Folders of the web storage that belong to the adapter's own UI, not to its icons. */
const SKIP_DIRS = new Set(['admin', 'lib', 'js', 'css', 'node_modules', 'i18n']);
/** How long the adapter list is trusted — installing one should show up quickly. */
const SETS_TTL_MS = 60 * 1000;
/** A set's file list only changes with the adapter's version; this is the safety net. */
const LIST_TTL_MS = 30 * 60 * 1000;
/** Adapter names as ioBroker allows them. */
const ADAPTER_RE = /^[a-z0-9][a-z0-9_-]*$/i;
/** SVGs sampled per set to decide whether it is drawn in one colour. */
const COLOUR_SAMPLES = 8;
/** Where the visualisations keep the widget files an icon pack's `url` points into. */
const PACK_NAMESPACES = ['vis-2', 'vis'];
/** Pack JSONs are a few MB; one that is larger is not an icon pack. */
const MAX_PACK_BYTES = 32 * 1024 * 1024;

/** `vis-2-widgets-icontwo/icon-set-solid.json` → `icon-set-solid`, the pack's folder name. */
function packFolder(url) {
    const base = String(url || '')
        .split('/')
        .pop()
        .replace(/\.json$/i, '');
    const clean = base.replace(/[^A-Za-z0-9_.-]/g, '-');
    return clean && clean !== '.' && clean !== '..' ? clean : null;
}

/** File type of a pack entry's `src` — a data URL, or bare base64 of the file. */
function packSrcExt(src) {
    if (typeof src !== 'string' || !src) {
        return null;
    }
    const data = /^data:image\/(svg\+xml|png|gif|webp)[;,]/i.exec(src);
    if (data) {
        return data[1].toLowerCase() === 'svg+xml' ? 'svg' : data[1].toLowerCase();
    }
    // Base64 of `<?xml` / `<svg` / PNG / GIF magic
    if (src.startsWith('PD94') || src.startsWith('PHN2') || src.startsWith('PCEt')) {
        return 'svg';
    }
    if (src.startsWith('iVBOR')) {
        return 'png';
    }
    if (src.startsWith('R0lG')) {
        return 'gif';
    }
    return null;
}

function decodePackSrc(src) {
    const m = /^data:[^,;]*(;base64)?,(.*)$/s.exec(src);
    if (m) {
        return m[1] ? Buffer.from(m[2], 'base64') : Buffer.from(decodeURIComponent(m[2]));
    }
    return Buffer.from(src, 'base64');
}

/**
 * Distinct paint colours of an SVG — `none`, `currentColor` and gradient refs
 * do not count. More than one means the set is drawn in colour and must not be
 * tinted: a mask would flatten it into a silhouette.
 *
 * @param text
 */
function svgColours(text) {
    const out = new Set();
    // <style> blocks of exported SVGs carry classes nobody uses (inventwo's
    // packs ship a dozen black strokes that no element references).
    text = String(text).replace(/<style[\s\S]*?<\/style>/gi, '');
    const re = /(?:fill|stroke|stop-color|color)\s*[:=]\s*["']?\s*([^"';\s)>]+(?:\([^)]*\))?)/gi;
    let m;
    while ((m = re.exec(text))) {
        const v = m[1].toLowerCase();
        if (
            v === 'none' ||
            v === 'transparent' ||
            v === 'currentcolor' ||
            v === 'inherit' ||
            v === 'freeze' || // SMIL `fill="freeze"`, not a paint
            v === 'remove' ||
            v.startsWith('url(') ||
            /^#[0-9a-f]{6}00$/.test(v) // #RRGGBBAA with alpha 0 paints nothing
        ) {
            continue;
        }
        out.add(normaliseColour(v));
    }
    return out;
}

function normaliseColour(v) {
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
    if (short) {
        return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
    }
    if (v === 'white') {
        return '#ffffff';
    }
    if (v === 'black') {
        return '#000000';
    }
    return v;
}

function sendJson(res, status, body, maxAge = 0) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-cache',
    });
    res.end(JSON.stringify(body));
}

/**
 * `a/b c/d.svg` from the URL, rejecting traversal and encoded NULs.
 *
 * @param raw
 */
function decodeIconPath(raw) {
    let file;
    try {
        file = decodeURIComponent(raw);
    } catch {
        return null;
    }
    if (file.includes('\0') || file.includes('\\')) {
        return null;
    }
    const parts = file.split('/');
    if (parts.some((s) => s === '' || s === '.' || s === '..')) {
        return null;
    }
    return file;
}

/**
 * @param {object} opts
 * @param {{listIconAdapters: Function, readDir: Function, readFile: Function}} opts.source
 * @param {{warn?: Function, debug?: Function}} [opts.log]
 */
function createAdapterIcons({ source, log }) {
    const warn = (msg) => log && log.warn && log.warn(`aura: adapter icons — ${msg}`);

    /** `{ at, adapters: Map(name → meta) }` */
    let adapterCache = null;
    /** name → { at, version, icons, truncated, multicolor, folders } */
    const lists = new Map();
    /** name → Promise of the list, so parallel pickers walk the storage once. */
    const walking = new Map();
    /** name → { version, folders: Map(folder → { label, icons: Map(key → src) }) } */
    const packs = new Map();

    /** Read the vis-2 icon packs an adapter declares; unreadable ones are left out. */
    async function loadPacks(meta) {
        const hit = packs.get(meta.name);
        if (hit && hit.version === meta.version) {
            return hit;
        }
        const folders = new Map();
        for (const set of meta.iconSets || []) {
            const folder = set && packFolder(set.url);
            if (!folder || folders.has(folder)) {
                continue;
            }
            let json = null;
            for (const ns of PACK_NAMESPACES) {
                try {
                    const raw = await source.readFile(ns, `widgets/${set.url}`);
                    if (raw && raw.length <= MAX_PACK_BYTES) {
                        json = JSON.parse(String(raw));
                        break;
                    }
                } catch {
                    /* not in this visualisation */
                }
            }
            if (!json || typeof json !== 'object') {
                warn(`${meta.name}: icon pack ${set.url} not found below ${PACK_NAMESPACES.join('/ or ')}/widgets`);
                continue;
            }
            const icons = new Map();
            for (const [key, entry] of Object.entries(json)) {
                const ext = entry && packSrcExt(entry.src);
                if (!ext || !/^[A-Za-z0-9_.-]+$/.test(key)) {
                    continue;
                }
                const words = Array.isArray(entry.words) ? entry.words.filter((w) => typeof w === 'string') : [];
                icons.set(key, { src: entry.src, ext, title: typeof entry.name === 'string' ? entry.name : '', words });
            }
            if (icons.size) {
                folders.set(folder, { label: set.name || folder, icons });
            }
        }
        const entry = { version: meta.version, folders };
        packs.set(meta.name, entry);
        return entry;
    }

    async function adapters() {
        if (adapterCache && Date.now() - adapterCache.at < SETS_TTL_MS) {
            return adapterCache.adapters;
        }
        const found = new Map();
        for (const a of (await source.listIconAdapters()) || []) {
            if (a && ADAPTER_RE.test(a.name || '')) {
                found.set(a.name, a);
            }
        }
        adapterCache = { at: Date.now(), adapters: found };
        return found;
    }

    async function walk(ns, dir, depth, into) {
        if (depth > MAX_DEPTH || into.length >= MAX_ICONS_PER_SET) {
            return;
        }
        let entries;
        try {
            entries = (await source.readDir(ns, dir)) || [];
        } catch {
            return; // folder vanished or the adapter has no web storage at all
        }
        entries = [...entries].sort((a, b) => String(a.file).localeCompare(String(b.file)));
        for (const e of entries) {
            const name = String(e.file || '');
            if (!name || name.startsWith('.')) {
                continue;
            }
            const rel = dir ? `${dir}/${name}` : name;
            if (e.isDir) {
                if (depth === 0 && SKIP_DIRS.has(name.toLowerCase())) {
                    continue;
                }
                await walk(ns, rel, depth + 1, into);
                continue;
            }
            if (!ICON_MIME[path.extname(name).toLowerCase()]) {
                continue;
            }
            if (typeof e.size === 'number' && e.size > MAX_ICON_BYTES) {
                continue;
            }
            into.push(rel);
            if (into.length >= MAX_ICONS_PER_SET) {
                return;
            }
        }
    }

    async function sampleMulticolor(read, icons) {
        const svgs = icons.filter((f) => f.toLowerCase().endsWith('.svg'));
        if (!svgs.length) {
            return false;
        }
        const step = Math.max(1, Math.floor(svgs.length / COLOUR_SAMPLES));
        let coloured = 0;
        let sampled = 0;
        for (let i = 0; i < svgs.length && sampled < COLOUR_SAMPLES; i += step, sampled++) {
            try {
                const text = String(await read(svgs[i]));
                // Drawn in currentColor = meant to be tinted, whatever else it paints.
                if (!/currentcolor/i.test(text) && svgColours(text).size > 1) {
                    coloured++;
                }
            } catch {
                /* unreadable sample — ignore */
            }
        }
        // Half the samples in colour is a colour set; a stray two-tone icon in a
        // monochrome set is not.
        return coloured * 2 >= sampled && coloured > 0;
    }

    async function listSet(name) {
        const meta = (await adapters()).get(name);
        if (!meta) {
            return null;
        }
        const hit = lists.get(name);
        if (hit && hit.version === meta.version && Date.now() - hit.at < LIST_TTL_MS) {
            return hit;
        }
        if (walking.has(name)) {
            return walking.get(name);
        }
        const task = (async () => {
            const icons = [];
            await walk(name, '', 0, icons);
            const pack = await loadPacks(meta);
            const titles = {};
            const folderLabels = {};
            for (const [folder, p] of pack.folders) {
                folderLabels[folder] = p.label;
                for (const [key, icon] of [...p.icons].sort((x, y) => x[0].localeCompare(y[0]))) {
                    const rel = `${folder}/${key}.${icon.ext}`;
                    icons.push(rel);
                    const title = [icon.title, ...icon.words].filter(Boolean).join(' · ');
                    if (title) {
                        titles[rel] = title;
                    }
                }
            }
            const folders = [...new Set(icons.filter((f) => f.includes('/')).map((f) => f.split('/')[0]))];
            const read = async (rel) => {
                const icon = packIcon(pack, rel);
                return icon ? decodePackSrc(icon.src) : source.readFile(name, rel);
            };
            const entry = {
                at: Date.now(),
                version: meta.version,
                icons,
                titles,
                folderLabels,
                truncated: icons.length >= MAX_ICONS_PER_SET,
                multicolor: await sampleMulticolor(read, icons),
                folders,
            };
            lists.set(name, entry);
            return entry;
        })().finally(() => walking.delete(name));
        walking.set(name, task);
        return task;
    }

    /** The pack entry behind `<pack folder>/<key>.<ext>`, or null for a plain file. */
    function packIcon(pack, rel) {
        const slash = rel.indexOf('/');
        const folder = slash > 0 ? pack.folders.get(rel.slice(0, slash)) : null;
        if (!folder) {
            return null;
        }
        const file = rel.slice(slash + 1);
        const dot = file.lastIndexOf('.');
        const icon = dot > 0 ? folder.icons.get(file.slice(0, dot)) : null;
        return icon && icon.ext === file.slice(dot + 1).toLowerCase() ? icon : null;
    }

    /** Installed sets that hold at least one icon — the picker's and the MCP's view. */
    async function sets() {
        const out = [];
        for (const [name, meta] of await adapters()) {
            const list = await listSet(name);
            // An icon adapter without a single icon is noise.
            if (!list || !list.icons.length) {
                continue;
            }
            out.push({
                id: name,
                title: meta.title || name,
                license: meta.license || '',
                version: meta.version || '',
                count: list.icons.length,
                folders: list.folders,
                folderLabels: list.folderLabels,
                multicolor: list.multicolor,
                raster: !list.icons.some((f) => f.toLowerCase().endsWith('.svg')),
            });
        }
        out.sort((a, b) => a.title.localeCompare(b.title));
        return out;
    }

    async function handleSets(res) {
        sendJson(res, 200, { sets: await sets() });
    }

    async function handleList(res, parsedUrl) {
        const name = parsedUrl.searchParams.get('set') || '';
        const list = ADAPTER_RE.test(name) ? await listSet(name) : null;
        if (!list) {
            return sendJson(res, 404, { error: 'unknown icon set' });
        }
        sendJson(res, 200, {
            set: name,
            icons: list.icons,
            titles: list.titles,
            truncated: list.truncated,
            multicolor: list.multicolor,
        });
    }

    async function handleFile(res, rest) {
        const slash = rest.indexOf('/');
        const name = slash > 0 ? rest.slice(0, slash) : '';
        const file = slash > 0 ? decodeIconPath(rest.slice(slash + 1)) : null;
        const mime = file ? ICON_MIME[path.extname(file).toLowerCase()] : null;
        if (!ADAPTER_RE.test(name) || !file || !mime || !(await adapters()).has(name)) {
            res.writeHead(404);
            res.end();
            return;
        }
        let data;
        const meta = (await adapters()).get(name);
        const icon = meta && meta.iconSets && meta.iconSets.length ? packIcon(await loadPacks(meta), file) : null;
        try {
            data = icon ? decodePackSrc(icon.src) : await source.readFile(name, file);
        } catch {
            data = null;
        }
        if (data === null || data === undefined) {
            res.writeHead(404);
            res.end();
            return;
        }
        const body = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
        res.writeHead(200, {
            'Content-Type': mime,
            // The file changes with an adapter update at most; a day keeps a wall
            // tablet quiet without pinning an old icon for ever.
            'Cache-Control': 'public, max-age=86400',
            // SVGs of third-party sets are shown via <img> / CSS mask only, never
            // inlined — this keeps a crafted one from running script if opened
            // directly.
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
            'X-Content-Type-Options': 'nosniff',
        });
        res.end(body);
    }

    /**
     * @param req
     * @param res
     * @param parsedUrl
     * @returns {boolean} true when the request belonged to this handler
     */
    function handle(req, res, parsedUrl) {
        const p = parsedUrl.pathname;
        if (p !== '/adapter-icons/sets' && p !== '/adapter-icons/list' && !p.startsWith('/adapter-icons/file/')) {
            return false;
        }
        if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { Allow: 'GET' });
            res.end();
            return true;
        }
        const run =
            p === '/adapter-icons/sets'
                ? handleSets(res)
                : p === '/adapter-icons/list'
                  ? handleList(res, parsedUrl)
                  : handleFile(res, p.slice('/adapter-icons/file/'.length));
        run.catch((e) => {
            warn(e.message);
            if (!res.headersSent) {
                sendJson(res, 500, { error: 'adapter icons unavailable' });
            } else {
                res.end();
            }
        });
        return true;
    }

    return {
        handle,
        sets,
        /**
         * @param name
         * @returns {Promise<string[]|null>} every icon file of one set, null for an unknown set
         */
        files: async (name) => (ADAPTER_RE.test(name || '') ? ((await listSet(name)) || {}).icons || null : null),
    };
}

/**
 * Whether an installed adapter ships icons. `visualization-icons` is the
 * current type, but older releases still say `visualisation` — the installed
 * icons-material-png 0.1.0 does — so the family's naming counts as well:
 * `icons-…`, or a web-only package with "icon" in its name (`vis-icontwo`).
 *
 * @param {object} common the adapter object's `common`
 * @param {string} name adapter name
 * @param {object|null} packs `common.visIconSets`
 */
function isIconAdapter(common, name, packs) {
    if (common.type === 'visualization-icons' || packs) {
        return true;
    }
    return /^icons-/.test(name) || (!!common.onlyWWW && /icon/i.test(name));
}

/**
 * `source` backed by the ioBroker adapter API: every installed adapter whose
 * `common.type` is `visualization-icons` (or that is named like one, see
 * isIconAdapter) or that declares vis-2 icon packs (`common.visIconSets`),
 * files from its web storage.
 *
 * @param {object} adapter the running ioBroker adapter instance
 */
function ioBrokerIconSource(adapter) {
    return {
        async listIconAdapters() {
            const objs = await adapter.getForeignObjectsAsync('system.adapter.*', 'adapter');
            const out = [];
            for (const obj of Object.values(objs || {})) {
                const c = obj && obj.common;
                const packs = c && c.visIconSets && typeof c.visIconSets === 'object' ? c.visIconSets : null;
                const name = (c && c.name) || String(obj._id).replace(/^system\.adapter\./, '');
                if (!c || !isIconAdapter(c, name, packs)) {
                    continue;
                }
                const title = (c.titleLang && (c.titleLang.de || c.titleLang.en)) || c.title || name;
                const license = (c.licenseInformation && c.licenseInformation.license) || c.license || '';
                const iconSets = Object.entries(packs || {})
                    .filter(([, v]) => v && typeof v.url === 'string')
                    .map(([key, v]) => ({
                        key,
                        url: v.url,
                        name: String(
                            (v.name && (v.name.de || v.name.en)) || (typeof v.name === 'string' ? v.name : key),
                        ),
                    }));
                out.push({
                    name,
                    title: String(title),
                    license: String(license),
                    version: String(c.version || ''),
                    iconSets,
                });
            }
            return out;
        },
        async readDir(ns, dir) {
            const entries = await adapter.readDirAsync(ns, dir || '');
            return (entries || []).map((e) => ({
                file: e.file,
                isDir: !!e.isDir,
                size: e.stats && typeof e.stats.size === 'number' ? e.stats.size : undefined,
            }));
        },
        async readFile(ns, file) {
            const raw = await adapter.readFileAsync(ns, file);
            // adapter-core resolves either { file, mimeType } or [ data, mimeType ]
            if (Array.isArray(raw)) {
                return raw[0];
            }
            if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) {
                return raw.file;
            }
            return raw;
        },
    };
}

/**
 * `source` backed by a folder: every sub-folder is one "adapter". Used by the
 * dev server and the tests (`tools/fixtures/adapter-icons`).
 *
 * @param {string} root folder holding one sub-folder per set
 */
function folderIconSource(root) {
    const fs = require('node:fs');
    const inside = (ns, rel) => {
        // `_vis-2/…` plays the visualisation's storage the packs live in.
        const own = path.resolve(root, ns);
        const base = fs.existsSync(own) ? own : path.resolve(root, `_${ns}`);
        const abs = path.resolve(base, rel || '.');
        if (abs !== base && !abs.startsWith(base + path.sep)) {
            throw new Error('outside set');
        }
        return abs;
    };
    return {
        async listIconAdapters() {
            let dirs = [];
            try {
                dirs = fs
                    .readdirSync(root, { withFileTypes: true })
                    .filter((d) => d.isDirectory() && !d.name.startsWith('_'));
            } catch {
                return [];
            }
            return dirs.map((d) => {
                let meta = {};
                try {
                    meta = JSON.parse(fs.readFileSync(path.join(root, d.name, '_set.json'), 'utf8'));
                } catch {
                    /* no metadata — folder name is the title */
                }
                return {
                    name: d.name,
                    title: meta.title || d.name,
                    license: meta.license || '',
                    version: meta.version || '0',
                    iconSets: Array.isArray(meta.iconSets) ? meta.iconSets : [],
                };
            });
        },
        async readDir(ns, dir) {
            return fs.readdirSync(inside(ns, dir), { withFileTypes: true }).map((d) => ({
                file: d.name,
                isDir: d.isDirectory(),
                size: d.isDirectory() ? undefined : fs.statSync(path.join(inside(ns, dir), d.name)).size,
            }));
        },
        async readFile(ns, file) {
            return fs.readFileSync(inside(ns, file));
        },
    };
}

module.exports = { createAdapterIcons, ioBrokerIconSource, folderIconSource, svgColours };
