'use strict';

/**
 * Web components of adapters that are not installed, from the active repositories.
 *
 * Since @iobroker/web-components 0.8 an adapter may list its components in
 * `common.webComponents` with a short form of the manifest next to the path
 * (`{ manifest, tag, name, icon, size }`). The repository carries `common`, so
 * the "add widget" dialog can offer such a component before its adapter is
 * installed - with name, picture and size. A plain path has no short form and is
 * left out: without the manifest file there is nothing to show.
 *
 * The repository object is several MB; the frontend gets only this list.
 */

const { usableRepoNames, bestRepoVersion } = require('./adapterUpdates');

/**
 * The admin folder of an adapter on the web, from the `meta` URL of its
 * repository entry (`…/io-package.json` in the root of the repository).
 *
 * @param {unknown} meta
 * @returns {URL | null}
 */
function adminFolderUrl(meta) {
    if (typeof meta !== 'string' || !/\/io-package\.json$/.test(meta)) {
        return null;
    }
    try {
        const url = new URL('admin/', meta);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
    } catch {
        return null;
    }
}

/**
 * A name as the manifest has it: a text, or texts per language
 *
 * @param {unknown} name
 * @returns {string | Record<string, string> | null}
 */
function cleanName(name) {
    if (typeof name === 'string') {
        return name.trim() ? name.trim() : null;
    }
    if (!name || typeof name !== 'object' || Array.isArray(name)) {
        return null;
    }
    /** @type {Record<string, string>} */
    const out = {};
    for (const [lang, text] of Object.entries(name)) {
        if (typeof text === 'string' && text.trim()) {
            out[lang] = text.trim();
        }
    }
    return Object.keys(out).length ? out : null;
}

/**
 * The short forms of one repository entry
 *
 * @param {string} adapter
 * @param {Record<string, any>} entry the adapter in the repository
 * @returns {Array<{ adapter: string, version: string, tag: string, name: string | Record<string, string> | null, iconUrl?: string, size?: { width: number, height: number } }>}
 */
function entryComponents(adapter, entry) {
    const list = Array.isArray(entry?.webComponents) ? entry.webComponents : [];
    const admin = adminFolderUrl(entry?.meta);
    const out = [];
    for (const item of list) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            continue; // a plain path: no short form
        }
        const tag = typeof item.tag === 'string' ? item.tag.trim() : '';
        // a custom element's name: lower case, with a hyphen
        if (!/^[a-z][a-z0-9._]*-[a-z0-9._-]*$/.test(tag)) {
            continue;
        }
        /** @type {{ adapter: string, version: string, tag: string, name: string | Record<string, string> | null, iconUrl?: string, size?: { width: number, height: number } }} */
        const component = { adapter, version: String(entry.version), tag, name: cleanName(item.name) };
        // the icon is relative to the manifest file, the manifest to the admin folder
        if (admin && typeof item.manifest === 'string' && typeof item.icon === 'string' && item.icon) {
            try {
                const icon = new URL(item.icon, new URL(item.manifest, admin));
                if (icon.protocol === 'https:' || icon.protocol === 'http:') {
                    component.iconUrl = icon.href;
                }
            } catch {
                // no icon
            }
        }
        const width = Number(item.size?.width);
        const height = Number(item.size?.height);
        if (width > 0 && height > 0) {
            component.size = { width, height };
        }
        out.push(component);
    }
    return out;
}

/**
 * Every component with a short form in the active repositories, each adapter in
 * the highest version they offer. Only the active repositories count: a stable
 * user sees no component that exists in beta only.
 *
 * @param {{ activeRepo: unknown, repos: Record<string, any> }} input
 * @returns {{ repos: string[], components: ReturnType<typeof entryComponents> } | null}
 *   null when no active repository holds data
 */
function repoWebComponents({ activeRepo, repos }) {
    // only the channel the user has chosen (stable / beta): no fallback to the others
    const names = usableRepoNames(activeRepo, repos, { strict: true });
    if (!names.length) {
        return null;
    }
    const adapters = new Set();
    for (const name of names) {
        for (const [adapter, entry] of Object.entries(repos[name].json)) {
            if (Array.isArray(entry?.webComponents) && entry.webComponents.length) {
                adapters.add(adapter);
            }
        }
    }
    const components = [];
    for (const adapter of [...adapters].sort()) {
        const best = bestRepoVersion(repos, names, adapter);
        if (best) {
            components.push(...entryComponents(adapter, repos[best.repo].json[adapter]));
        }
    }
    return { repos: names, components };
}

module.exports = { repoWebComponents, adminFolderUrl };
