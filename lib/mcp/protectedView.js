'use strict';

/**
 * What the MCP may see and change inside a PIN-protected section/tab.
 *
 * The adapter keeps protected content in the server-side vault and leaves an empty
 * stub in `config.dashboard` (lib/security/dashboardVault.js). This server runs
 * INSIDE the adapter, so the vault is reachable in-process — but "can open the
 * file" is not "may hand it out". Two gates, both of them here:
 *
 *   1. STRUCTURE WITHOUT CONTENT, always: a locked tab answers with id, type and
 *      gridPos per widget — enough to correct heights, tidy positions and unify
 *      layouts — and never with options, datapoints or titles. Measurements are
 *      computed from the REAL content server-side and only their numbers come out,
 *      which is why aura_measure keeps working on a locked tab.
 *   2. WRITING NEEDS A RELEASE, made in AURA itself: an admin switches „über MCP
 *      bearbeitbar“ on for that view in the editor, and it is stored in the vault
 *      next to the PIN hash. So no PIN is ever typed into a chat, and what was
 *      released stays visible in the editor and in aura_dashboard.
 *
 * aura_write_tab is refused even on a released view: it replaces the whole tab,
 * and here that would mean replacing what nobody in the conversation has seen.
 *
 * Releases live in the vault (0600, admin-only API) and NOT in the config state on
 * purpose: `config.dashboard` is writable by any connected socket client, so a
 * release stored there would be a release anybody could grant.
 */

/** Marker hydrateReleased puts on a tab whose widget list is the vault content. */
const HYDRATED = '_mcpHydrated';

/** Only ever the adapter's own vault — never a path from a request. */
function vaultOf(adapter) {
    return adapter && adapter.vault ? adapter.vault : null;
}

/** The vault's section map, or `{}` when there is no vault (dev, tests). */
function vaultSections(adapter) {
    const vault = vaultOf(adapter);
    if (!vault) {
        return {};
    }
    try {
        const data = vault.load();
        return (data && data.sections) || {};
    } catch {
        return {};
    }
}

/**
 * The vault key a locked tab's content sits under, plus where inside the entry.
 *
 * A section PIN subsumes the tabs inside it (splitDashboard), so a tab locked by
 * its section is addressed by the SECTION key and found by id in `content.tabs`.
 *
 * @param {object} tab an `allTabs` entry (carries pinScope + sectionId)
 */
function viewKeyOf(tab) {
    if (!tab || !tab.pinLocked) {
        return null;
    }
    return tab.pinScope === 'section'
        ? { key: `section:${tab.sectionId}`, scope: 'section', tabId: tab.id }
        : { key: `tab:${tab.sectionId}:${tab.id}`, scope: 'tab', tabId: tab.id };
}

/** True when an admin released this view for MCP editing. */
function isReleased(entry) {
    return !!(entry && entry.mcpWrite === true);
}

/**
 * Everything this server knows about one locked tab.
 *
 * `available` false means the vault has no entry for it — the view is protected and
 * nothing more can be said, which is the honest answer for a dev server without an
 * adapter or a vault that was reset.
 *
 * @returns {{available: boolean, key: string|null, scope: string|null, tabId: string|null,
 *            released: boolean, widgets: object[], missing?: boolean}}
 */
function lockedView(adapter, tab) {
    const at = viewKeyOf(tab);
    const none = {
        available: false,
        key: at && at.key,
        scope: at && at.scope,
        tabId: at && at.tabId,
        released: false,
        widgets: [],
    };
    if (!at) {
        return none;
    }
    const entry = vaultSections(adapter)[at.key];
    if (!entry || !entry.content) {
        return none;
    }
    let widgets = null;
    if (at.scope === 'tab') {
        widgets = entry.content.widgets;
    } else {
        const inner = (entry.content.tabs || []).find((t) => t && t.id === at.tabId);
        if (!inner) {
            // The section is in the vault, this tab is not: it exists only as a
            // stub (created next to the vault by an older MCP, or by a tool that
            // wrote the stub alone). With a release it is simply an empty tab the
            // next write puts into the vault (flushHydrated); without one it is a
            // gap worth naming — „nicht freigegeben“ sent the caller looking for
            // a switch that was already on.
            return isReleased(entry)
                ? { ...none, available: true, released: true, missing: true }
                : { ...none, missing: true };
        }
        widgets = inner.widgets;
    }
    if (!Array.isArray(widgets)) {
        return none;
    }
    return { available: true, key: at.key, scope: at.scope, tabId: at.tabId, released: isReleased(entry), widgets };
}

/**
 * Whether a tab may be created in (or moved into) `section`.
 *
 * A section PIN keeps the section's tabs in the vault, and the stub's tab list is
 * only the menu. A tab that lands in the stub alone shows up in the frontend's tab
 * bar with nothing behind it, is missing from the editor (which takes the vault's
 * list) and is gone after the next editor save or „PIN entfernen“ — reported from
 * use. So: with a release the tab goes into the vault too (flushHydrated does
 * that on the write), without one the tool refuses before anything is written.
 *
 * @returns {null|{key: string, known: boolean, released: boolean}} null = no section PIN
 */
function sectionGate(adapter, section) {
    if (!section || !section.pinProtected) {
        return null;
    }
    const key = `section:${section.id}`;
    const entry = vaultSections(adapter)[key];
    return { key, known: !!(entry && entry.content), released: isReleased(entry) };
}

/**
 * id, type and gridPos — nothing else, ever.
 *
 * Deliberately a whitelist: an "everything except options" filter would hand out
 * `datapoint`, `title` and whatever field a widget grows next. Positions and sizes
 * are what the geometry work needs and they say nothing about what is displayed.
 */
function skeletonOf(widgets) {
    return (Array.isArray(widgets) ? widgets : [])
        .filter((w) => w && typeof w === 'object')
        .map((w) => {
            const out = { id: w.id, type: w.type };
            if (w.gridPos && typeof w.gridPos === 'object') {
                const gp = w.gridPos;
                out.gridPos = { x: gp.x, y: gp.y, w: gp.w, h: gp.h };
            }
            // A group's children live in a separate definition, so the group widget
            // is the only place where the skeleton would otherwise lose the fact
            // that there IS something nested here.
            if (w.options && typeof w.options.defId === 'string') {
                out.groupChildren = true;
            }
            return out;
        });
}

/**
 * Write widgets back into a locked view's vault entry.
 *
 * Keeps ONE undo copy in the vault itself (`contentPrev`): the normal backup path
 * writes into the adapter's files namespace, which every socket client can read, so
 * protected content must not go there — and without any undo a bad write into a
 * view nobody can see would be unrecoverable.
 *
 * An unlocked frontend re-reads the view when the vault changes (info.vaultRevision
 * → /pin/content), so the change shows there without a reload.
 *
 * @param {object} adapter
 * @param {{key: string, scope: string, tabId: string}} at from lockedView
 * @param {object[]} widgets
 */
function writeLockedWidgets(adapter, at, widgets) {
    const vault = vaultOf(adapter);
    if (!vault) {
        throw new Error('Kein PIN-Tresor vorhanden — geschützte Inhalte lassen sich hier nicht schreiben.');
    }
    const data = vault.load();
    const entry = data.sections && data.sections[at.key];
    if (!entry || !entry.content) {
        throw new Error(`Der PIN-Tresor kennt „${at.key}“ nicht (mehr).`);
    }
    entry.contentPrev = JSON.parse(JSON.stringify(entry.content));
    if (at.scope === 'tab') {
        entry.content.widgets = widgets;
    } else {
        entry.content.tabs = (entry.content.tabs || []).map((t) =>
            t && t.id === at.tabId ? Object.assign({}, t, { widgets }) : t,
        );
    }
    vault.save(data);
}

/**
 * Put the real widgets of every RELEASED protected view into `layouts`, in place.
 *
 * This is the only door: a tool that works on the model (locateWidget and the
 * widget tools behind it) sees a released view like any other tab and nothing at
 * all of one that was not released — the fail-closed default is "the stub stays
 * empty", so a tool that never heard of PINs cannot change protected content.
 *
 * @returns {{key: string, scope: string, tabId: string, label: string}[]} what was filled in
 */
function hydrateReleased(adapter, layouts) {
    const sections = vaultSections(adapter);
    if (!Object.keys(sections).length) {
        return [];
    }
    const filled = [];
    for (const layout of layouts || []) {
        for (const section of layout.sections || []) {
            const secEntry = section.pinProtected ? sections[`section:${section.id}`] : null;
            for (const tab of section.tabs || []) {
                const entry = secEntry || (tab.pinProtected ? sections[`tab:${section.id}:${tab.id}`] : null);
                if (!entry || !isReleased(entry) || !entry.content) {
                    continue;
                }
                let widgets = entry.content.widgets;
                if (secEntry) {
                    const inner = (entry.content.tabs || []).find((t) => t && t.id === tab.id);
                    // A stub-only tab of a released section is an empty tab here; the
                    // next write puts it into the vault (flushHydrated).
                    widgets = inner ? inner.widgets : [];
                }
                if (!Array.isArray(widgets)) {
                    continue;
                }
                tab.widgets = JSON.parse(JSON.stringify(widgets));
                // Tells flushHydrated (and the lock checks) that this list IS the
                // content — so an emptied tab is written as empty instead of being
                // read as an untouched stub. Never reaches the state: flush strips it.
                tab[HYDRATED] = true;
                filled.push({
                    key: secEntry ? `section:${section.id}` : `tab:${section.id}:${tab.id}`,
                    scope: secEntry ? 'section' : 'tab',
                    tabId: tab.id,
                    label: `${layout.name} / ${section.name} / ${tab.name}`,
                });
            }
        }
    }
    return filled;
}

/** Tab fields the menu stub carries and the vault copy must follow (a rename, a new icon). */
const TAB_DISPLAY_FIELDS = ['name', 'slug', 'icon', 'hideLabel', 'hidden', 'disabled'];

/** A stub tab without the hydration marker and without its widgets. */
function bareStub(tab) {
    const out = { ...tab, widgets: [] };
    delete out[HYDRATED];
    return out;
}

/**
 * The vault's tab list for a released section, made to match the stub.
 *
 * The stub's order and display fields win (a rename, a reorder, a new tab); the
 * content of a tab comes from the stub only when it was hydrated or is new, and
 * from the vault otherwise. A tab that only the vault has is kept at the end —
 * the tools refuse deletes in a locked section, so such a tab is not a deletion,
 * and losing protected content to a stale stub is the one thing this must not do.
 */
function syncedSectionTabs(contentTabs, stubTabs) {
    const inner = new Map((contentTabs || []).filter((t) => t && t.id).map((t) => [t.id, t]));
    const seen = new Set();
    const out = (stubTabs || []).map((stub) => {
        seen.add(stub.id);
        const prev = inner.get(stub.id);
        if (!prev) {
            const fresh = bareStub(stub);
            fresh.widgets = JSON.parse(JSON.stringify(stub.widgets || []));
            for (const f of ['pin', 'pinProtected', 'pinLength', 'pinRelock', 'pinFrom', 'pinCode']) {
                delete fresh[f];
            }
            return fresh;
        }
        const next = { ...prev };
        for (const f of TAB_DISPLAY_FIELDS) {
            if (stub[f] !== undefined) {
                next[f] = stub[f];
            } else {
                delete next[f];
            }
        }
        if (stub[HYDRATED] || (stub.widgets || []).length) {
            next.widgets = JSON.parse(JSON.stringify(stub.widgets || []));
        }
        return next;
    });
    for (const t of contentTabs || []) {
        if (t && t.id && !seen.has(t.id)) {
            out.push(t);
        }
    }
    return out;
}

/** Replace a section entry's tab list in the vault, keeping one undo copy. */
function writeSectionTabs(adapter, key, tabs) {
    const vault = vaultOf(adapter);
    if (!vault) {
        throw new Error('Kein PIN-Tresor vorhanden — geschützte Inhalte lassen sich hier nicht schreiben.');
    }
    const data = vault.load();
    const entry = data.sections && data.sections[key];
    if (!entry || !entry.content) {
        throw new Error(`Der PIN-Tresor kennt „${key}“ nicht (mehr).`);
    }
    entry.contentPrev = JSON.parse(JSON.stringify(entry.content));
    entry.content.tabs = tabs;
    vault.save(data);
}

/**
 * The counterpart, called by writeDashboard for EVERY write: a protected stub goes
 * into the socket-readable state empty, and the widgets it picked up on the way
 * (a released view someone edited) go into the vault instead.
 *
 * Being in the one write path rather than in each tool is the point — a write path
 * that forgets this would either leak protected widgets into the state or drop the
 * change on the floor. Widgets on a stub that is NOT released are dropped without
 * a vault write: nothing legitimate puts them there.
 *
 * A released SECTION is synced as a whole: its tab list in the vault follows the
 * stub (new tabs, order, names). Before, only widgets of tabs the vault already
 * knew were written — a tab created by aura_create_tab lost its widgets here and
 * lived on as a stub the editor never saw.
 *
 * @returns {{layouts: object[], flushed: string[], refused: string[]}}
 */
function flushHydrated(adapter, layouts) {
    const sections = vaultSections(adapter);
    const flushed = [];
    const refused = [];
    let touched = false;
    const strip = (tab) => {
        touched = true;
        return bareStub(tab);
    };
    const out = (layouts || []).map((layout) => ({
        ...layout,
        sections: (layout.sections || []).map((section) => {
            if (section.pinProtected) {
                const key = `section:${section.id}`;
                const entry = sections[key];
                const stubTabs = section.tabs || [];
                const dirty = stubTabs.some((t) => t[HYDRATED] || (t.widgets || []).length);
                if (!entry || !isReleased(entry) || !entry.content) {
                    if (stubTabs.some((t) => (t.widgets || []).length)) {
                        refused.push(key);
                    }
                    return dirty ? { ...section, tabs: stubTabs.map(strip) } : section;
                }
                const nextTabs = syncedSectionTabs(entry.content.tabs, stubTabs);
                if (JSON.stringify(nextTabs) !== JSON.stringify(entry.content.tabs || [])) {
                    writeSectionTabs(adapter, key, nextTabs);
                    flushed.push(key);
                }
                return dirty ? { ...section, tabs: stubTabs.map(strip) } : section;
            }
            return {
                ...section,
                tabs: (section.tabs || []).map((tab) => {
                    const key = tab.pinProtected ? `tab:${section.id}:${tab.id}` : null;
                    if (!key || !(tab[HYDRATED] || (tab.widgets || []).length)) {
                        return tab;
                    }
                    const entry = sections[key];
                    if (!entry || !isReleased(entry) || !entry.content) {
                        if ((tab.widgets || []).length) {
                            refused.push(key);
                        }
                        return strip(tab);
                    }
                    const at = { key, scope: 'tab', tabId: tab.id };
                    if (JSON.stringify(entry.content.widgets) !== JSON.stringify(tab.widgets || [])) {
                        writeLockedWidgets(adapter, at, tab.widgets || []);
                        flushed.push(key);
                    }
                    return strip(tab);
                }),
            };
        }),
    }));
    return { layouts: touched ? out : layouts, flushed, refused };
}

/** True when `tab` (a model tab) carries hydrated vault content. */
function isHydrated(tab) {
    return !!(tab && tab[HYDRATED]);
}

/** Turn the release for one view on or off. Used by the admin API, not by a tool. */
function setRelease(vault, key, enabled) {
    const data = vault.load();
    const entry = data.sections && data.sections[key];
    if (!entry) {
        return { error: `Der PIN-Tresor kennt „${key}“ nicht.` };
    }
    if (enabled) {
        entry.mcpWrite = true;
    } else {
        delete entry.mcpWrite;
    }
    vault.save(data);
    return { key, mcpWrite: isReleased(entry) };
}

/**
 * Said once per answer that shows a skeleton, so the gap is never a guess.
 *
 * It used to name aura_compact among the things that „go“ here, which is wrong in
 * the one direction that costs time: aura_compact writes, so it is refused on a
 * view without a release, and the note sent callers straight into that refusal.
 * Reading and measuring is what the structure is good for.
 */
const STRUCTURE_NOTE =
    'Nur die Struktur: Id, Typ und gridPos. Optionen, Titel und Datenpunkte bleiben im PIN-Tresor — dieser ' +
    'Payload ist deshalb NICHT als Eingabe für aura_write_tab geeignet. Lesen und messen geht damit ' +
    '(aura_tab-Struktur, aura_measure, aura_rendered); jeder Schreibzugriff braucht die Freigabe, ' +
    'aura_compact eingeschlossen.';

/** The refusal a write gets while the view is not released. */
function releaseHint(label) {
    return (
        `${label} ist PIN-geschützt und nicht für den MCP freigegeben. Schreiben ist hier absichtlich ` +
        'gesperrt: der Inhalt liegt im Tresor, und ein Schreibzugriff würde etwas ersetzen, das in diesem ' +
        'Gespräch niemand gesehen hat.\n' +
        'Freigeben in AURA selbst — im Admin-Editor beim Bereich/Tab den Schalter „Über MCP bearbeitbar“ ' +
        'einschalten (nur mit Admin-Anmeldung, gilt bis er wieder aus ist). Die PIN wird dafür nicht ' +
        'gebraucht und gehört nicht in den Chat.\n' +
        'Ohne Freigabe geht die Struktur: aura_tab zeigt Id, Typ und gridPos, aura_measure und aura_rendered ' +
        'rechnen damit.'
    );
}

/**
 * The locked view a widget id sits in — asked when the model does not have it.
 *
 * Every widget tool looks an id up in the model, and there a protected view is an
 * empty stub: the lookup failed with „Kein Widget mit der id …“ for an id that
 * aura_tab had just printed itself, which is wrong twice over. The id exists, and
 * the reason is the lock. Reported from use; aura_compact got it right because it
 * addresses a tab by name and hits `releaseHint` on the way in.
 *
 * Released views are hydrated before any lookup (hydrateReleased), so they are
 * found the ordinary way and never reach this — anything answered here is a view
 * without a release.
 *
 * @param {object[]} tabs an `allTabs` list (carries pinLocked, pinScope, sectionId)
 * @returns {{label: string, key: string}|null}
 */
function lockedHostOf(adapter, tabs, widgetId) {
    for (const tab of tabs || []) {
        // A stub that carries widgets is a released view: not this case.
        if (!tab || !tab.pinLocked || tab[HYDRATED] || (tab.widgets || []).length) {
            continue;
        }
        const lv = lockedView(adapter, tab);
        if (!lv.available || !lv.widgets.some((w) => w && w.id === widgetId)) {
            continue;
        }
        return { label: `${tab.layoutName} / ${tab.sectionName} / ${tab.name}`, key: lv.key };
    }
    return null;
}

/**
 * A tab of a PIN-protected section that has no vault entry of its own, while the
 * section has no release. Not „nicht freigegeben“ alone: the release may well be
 * on somewhere else — the gap is this tab's missing content.
 */
function missingContentHint(label) {
    return (
        `${label}: dieser Tab hat keinen Tresor-Inhalt — er steht nur in der Tab-Leiste (vermutlich über den ` +
        'MCP außerhalb des Tresors angelegt). Im Frontend ist er nach dem Entsperren leer, der Editor zeigt ihn ' +
        'erst nach dem nächsten Laden. Abhilfe: im Admin-Editor beim Bereich „Über MCP bearbeitbar“ ' +
        'einschalten — dann nimmt der nächste Schreibzugriff den Tab in den Tresor auf — oder ihn im Editor ' +
        'befüllen und speichern.'
    );
}

/** aura_write_tab, on a locked view, is refused even after a release. */
function writeTabRefusal(label) {
    return (
        `${label} ist PIN-geschützt — aura_write_tab bleibt hier gesperrt, auch mit Freigabe: es ersetzt den ` +
        'ganzen Tab auf einmal, und was dabei wegfällt, ist genau der Inhalt, der hier nicht zu sehen ist. ' +
        'Einzelne Widgets ändern (aura_update_widget / aura_update_widgets), Positionen mit aura_compact — ' +
        'das trifft nur, was benannt wurde.'
    );
}

module.exports = {
    STRUCTURE_NOTE,
    flushHydrated,
    hydrateReleased,
    isHydrated,
    isReleased,
    lockedHostOf,
    lockedView,
    missingContentHint,
    releaseHint,
    sectionGate,
    syncedSectionTabs,
    setRelease,
    skeletonOf,
    vaultSections,
    viewKeyOf,
    writeLockedWidgets,
    writeTabRefusal,
};
