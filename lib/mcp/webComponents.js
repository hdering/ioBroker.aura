'use strict';

/**
 * The ioBroker web components installed on this system, for aura_web_components.
 *
 * A "webcomponent" widget names its component by tag (wcTag) and stores the
 * settings that component declares (wcSettings). Neither comes from AURA's widget
 * schema - they come with the adapters (`common.webComponents`), so a model cannot
 * know them without this list. The manifests are read from the file storage
 * (`<adapter>.admin`) with the helpers of `@iobroker/web-components`; no code of a
 * component runs for that.
 *
 * The package is an ES module and this backend is CommonJS, so it is imported
 * dynamically, once.
 */

let pkgPromise = null;

function webComponentsPackage() {
    if (!pkgPromise) {
        pkgPromise = import('@iobroker/web-components');
        // a failed import (package missing) is tried again next time
        pkgPromise.catch(() => (pkgPromise = null));
    }
    return pkgPromise;
}

/**
 * Text of what readFileAsync resolves: `{ file, mimeType }`, `[data, mimeType]` or the data
 *
 * @param {unknown} raw the answer of readFileAsync
 */
function fileText(raw) {
    let data = raw;
    if (Array.isArray(raw)) {
        data = raw[0];
    } else if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw) && 'file' in raw) {
        data = raw.file;
    }
    if (Buffer.isBuffer(data)) {
        return data.toString('utf8');
    }
    return data === undefined || data === null ? '' : String(data);
}

/**
 * The manifests per ioBroker adapter object: adapter name -> what was read for which
 * version. An adapter is read again only when its version or its list of files changes.
 *
 */
const manifestCache = new WeakMap();

/**
 * The manifests of every installed component, by the instances that list them
 *
 * @param {object} adapter ioBroker adapter instance
 * @returns {Promise<Array<{ file: { adapter: string, version: string, id: string, fileName: string }, manifest: any }>>}
 */
async function readInstalledWebComponents(adapter) {
    const view = await adapter.getObjectViewAsync('system', 'instance', {
        startkey: 'system.adapter.',
        endkey: 'system.adapter.香',
    });
    const instances = ((view && view.rows) || [])
        .map((row) => row && row.value)
        .filter(
            (obj) =>
                obj &&
                typeof obj._id === 'string' &&
                obj.common &&
                Array.isArray(obj.common.webComponents) &&
                obj.common.webComponents.length,
        );
    if (!instances.length) {
        return [];
    }
    const { getWebComponentFiles, readWebComponentManifests } = await webComponentsPackage();
    const byAdapter = new Map();
    for (const file of getWebComponentFiles(instances)) {
        if (!byAdapter.has(file.adapter)) {
            byAdapter.set(file.adapter, []);
        }
        byAdapter.get(file.adapter).push(file);
    }
    let cache = manifestCache.get(adapter);
    if (!cache) {
        cache = new Map();
        manifestCache.set(adapter, cache);
    }
    const log = {
        error: (message) => adapter.log && adapter.log.warn(`[mcp] ${message}`),
    };
    const out = [];
    for (const [name, files] of byAdapter) {
        const key = `${files[0].version}|${files.map((f) => f.fileName).join('|')}`;
        let entry = cache.get(name);
        if (!entry || entry.key !== key) {
            const manifests = await readWebComponentManifests(
                files,
                async (id, fileName) => fileText(await adapter.readFileAsync(id, fileName)),
                log,
            );
            entry = { key, manifests };
            // a file that could not be read (an upload still running) is asked for again next time
            if (manifests.length === files.length) {
                cache.set(name, entry);
            } else {
                cache.delete(name);
            }
        }
        out.push(...entry.manifests);
    }
    for (const name of [...cache.keys()]) {
        if (!byAdapter.has(name)) {
            cache.delete(name);
        }
    }
    return out;
}

/**
 * The type of the value a setting gets, as the component receives it
 *
 * @param type
 */
function valueType(type) {
    if (type === 'number' || type === 'slider') {
        return 'number';
    }
    if (type === 'checkbox') {
        return 'boolean';
    }
    return 'string';
}

/**
 * One line per setting a component takes in wcSettings
 *
 * @param {string} key the name of the setting
 * @param {any} item its JSON-Config item
 * @param {(text: unknown) => string} t translation into the system language
 */
function describeSetting(key, item, t) {
    const type = String(item.type || 'text');
    const parts = [];
    const label = t(item.label);
    if (label && label !== key) {
        parts.push(`„${label}“`);
    }
    if (type === 'number' || type === 'slider') {
        const range = [item.min, item.max].map((v) => (Number.isFinite(v) ? v : '')).join(' … ');
        if (range !== ' … ') {
            parts.push(range);
        }
        if (Number.isFinite(item.step)) {
            parts.push(`Schritt ${item.step}`);
        }
    }
    if (type === 'select' && Array.isArray(item.options)) {
        parts.push(
            `Werte ${item.options
                .map((o) => {
                    const optionLabel = t(o && o.label);
                    const value = JSON.stringify(o && o.value);
                    return optionLabel && optionLabel !== String(o && o.value) ? `${value} (${optionLabel})` : value;
                })
                .join(', ')}`,
        );
    }
    if (type === 'objectId') {
        const types = item.types ? [].concat(item.types).join('/') : 'state';
        parts.push(`Objekt-ID vom Typ ${types}${item.root ? ` unter ${item.root}` : ''}`);
    }
    if (type === 'instance') {
        const of = item.adapter ? String(item.adapter) : '';
        parts.push(`Instanz${of ? ` des Adapters ${of}` : ''}, z. B. "${of || '<adapter>'}.0"`);
    }
    if (type === 'text' && Number(item.minRows) > 1) {
        parts.push('mehrzeilig');
    }
    if (type === 'color') {
        parts.push('CSS-Farbe');
    }
    if (item.default !== undefined) {
        parts.push(`Standard ${JSON.stringify(item.default)}`);
    }
    const help = t(item.help);
    if (help) {
        parts.push(help);
    }
    if (item.hidden) {
        parts.push(`ausgeblendet, wenn ${item.hidden}`);
    }
    if (item.disabled) {
        parts.push(`gesperrt, wenn ${item.disabled}`);
    }
    return `- ${key}: ${valueType(type)} (${type})${parts.length ? ` — ${parts.join('; ')}` : ''}`;
}

/**
 * Grid cells for a component's preferred size - the formula of the "new widget"
 * dialog (utils/webComponentHost webComponentGridSize).
 *
 * @param {{ width: number, height: number } | undefined} size in px
 * @param {{ rowHeight: number, snapX: number, gap: number, padding: number }} grid
 */
function gridSizeOf(size, grid) {
    if (!size || !(Number(size.width) > 0) || !(Number(size.height) > 0)) {
        return null;
    }
    const cells = (px, cell) =>
        Math.max(2, Math.round((px + 2 * grid.padding + grid.gap) / (Math.max(1, cell) + grid.gap)));
    return { w: cells(Number(size.width), grid.snapX), h: cells(Number(size.height), grid.rowHeight) };
}

/**
 * The answer of aura_web_components
 *
 * @param {Array<{ file: { adapter: string, version: string }, manifest: any }>} components
 * @param {object} opts
 * @param {string} opts.lang the system language
 * @param {{ rowHeight: number, snapX: number, gap: number, padding: number }} opts.grid the dashboard grid
 * @param {(text: unknown, lang: string) => string} opts.getText the package's getText
 * @param {(manifest: any) => Array<{ name: string, label?: unknown, panel: { items?: object } }>} opts.getSettingsGroups
 * @param {string} [opts.tag] only this tag
 * @param {string} [opts.adapter] only this adapter
 */
function renderWebComponents(components, opts) {
    const { lang, grid, getText, getSettingsGroups } = opts;
    const t = (text) => (text === undefined || text === null || text === '' ? '' : getText(text, lang));
    const list = components.filter(
        (c) => (!opts.tag || c.manifest.tag === opts.tag) && (!opts.adapter || c.file.adapter === opts.adapter),
    );
    if (!components.length) {
        return (
            'Keine Web-Komponenten installiert: kein Adapter meldet in io-package.json common.webComponents an. ' +
            'Ein Widget vom Typ "webcomponent" bliebe leer.'
        );
    }
    if (!list.length) {
        const all = components.map((c) => `${c.manifest.tag} (${c.file.adapter})`).join(', ');
        return `Keine Web-Komponente${opts.tag ? ` "${opts.tag}"` : ''}${opts.adapter ? ` des Adapters "${opts.adapter}"` : ''}. Installiert: ${all}.`;
    }
    const tagCount = new Map();
    for (const c of components) {
        tagCount.set(c.manifest.tag, (tagCount.get(c.manifest.tag) || 0) + 1);
    }
    const out = [
        `Installierte Web-Komponenten: ${list.length}${list.length < components.length ? ` von ${components.length}` : ''}`,
        '',
        'Als Widget vom Typ "webcomponent" — ohne datapoint, die Komponente liest und schreibt ihre Datenpunkte selbst:',
        '{ "type": "webcomponent", "options": { "wcTag": "<tag>", "wcAdapter": "<adapter>", "wcSettings": { "<schlüssel>": <wert> } } }',
        'wcSettings nimmt nur die Schlüssel unten, im genannten Typ; nur was vom Standard abweicht. ' +
            'Ein objectId-Feld will eine Objekt-ID (aus dem ioBroker-MCP), ein instance-Feld eine Instanz wie "flow.0". ' +
            'showTitle/showIcon sind bei diesem Typ standardmäßig aus.',
    ];
    for (const c of list) {
        const m = c.manifest;
        const nameEn = (m.name ? getText(m.name, 'en') : '') || m.tag;
        const nameLocal = t(m.name);
        out.push('', `### ${m.tag} — ${nameEn}${nameLocal && nameLocal !== nameEn ? ` / ${nameLocal}` : ''}`);
        const facts = [`Adapter ${c.file.adapter}${c.file.version ? ` ${c.file.version}` : ''} (wcAdapter)`];
        const size = m.size;
        const cells = gridSizeOf(size, grid);
        if (cells) {
            facts.push(
                `Größe ${size.width} × ${size.height} px → gridPos w ${cells.w}, h ${cells.h} im globalen Raster${
                    size.noResize ? ' — feste Größe, nicht ändern' : ''
                }`,
            );
        }
        if ((tagCount.get(m.tag) || 0) > 1) {
            facts.push('derselbe Tag kommt von mehreren Adaptern: wcAdapter angeben');
        }
        out.push(facts.join(' · '));
        const descEn = m.description ? getText(m.description, 'en') : '';
        const descLocal = t(m.description);
        if (descEn) {
            out.push(descLocal && descLocal !== descEn ? `${descEn} / ${descLocal}` : descEn);
        }
        const groups = getSettingsGroups(m);
        const lines = [];
        for (const group of groups) {
            const items = (group.panel && group.panel.items) || {};
            const keys = Object.keys(items);
            if (!keys.length) {
                continue;
            }
            if (groups.length > 1) {
                lines.push(`Reiter „${t(group.label) || group.name}“:`);
            }
            for (const key of keys) {
                const item = items[key] || {};
                if (item.type === 'divider') {
                    continue;
                }
                if (item.type === 'header' || item.type === 'staticText') {
                    const note = t(item.text) || t(item.label);
                    if (note) {
                        lines.push(`  (${note})`);
                    }
                    continue;
                }
                lines.push(describeSetting(key, item, t));
            }
        }
        out.push(lines.length ? 'Einstellungen (wcSettings):' : 'Keine Einstellungen.');
        out.push(...lines);
    }
    return out.join('\n');
}

/**
 * aura_web_components: read and describe
 *
 * @param {object} adapter ioBroker adapter instance
 * @param {{ rowHeight: number, snapX: number, gap: number, padding: number }} grid the dashboard grid
 * @param {{ tag?: string, adapter?: string }} args the tool arguments
 */
async function listWebComponents(adapter, grid, args) {
    const [components, pkg, sys] = await Promise.all([
        readInstalledWebComponents(adapter),
        webComponentsPackage(),
        adapter.getForeignObjectAsync('system.config').catch(() => null),
    ]);
    const lang = (sys && sys.common && sys.common.language) || 'en';
    return renderWebComponents(components, {
        lang,
        grid,
        getText: pkg.getText,
        getSettingsGroups: pkg.getSettingsGroups,
        tag: typeof args.tag === 'string' ? args.tag.trim() : '',
        adapter: typeof args.adapter === 'string' ? args.adapter.trim() : '',
    });
}

module.exports = { fileText, gridSizeOf, listWebComponents, readInstalledWebComponents, renderWebComponents };
