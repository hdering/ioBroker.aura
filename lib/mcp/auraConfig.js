'use strict';

/**
 * Reading and writing the AURA dashboard configuration from inside the adapter.
 *
 * The dashboard lives in `<ns>.config.dashboard` as a zustand-persist snapshot
 * (`{ version, state: { layouts: [...] } }`); group/panels children live in a
 * SEPARATE state, `<ns>.config.group-defs`. Every read and every write has to
 * treat the two as one unit — a group written without its defs renders empty.
 *
 * Running inside the adapter means no socket, no URL, no auth: `getStateAsync`
 * and `getObjectViewAsync` are already connected.
 */

const DEFAULT_GRID = { rowHeight: 20, snapX: 20, gap: 10 };

/** Config blobs are owned values, so they land acknowledged — as the frontend writes them. */
const WRITE_ACK = true;

async function readJsonState(adapter, key) {
    const state = await adapter.getStateAsync(`config.${key}`);
    const raw = state && state.val;
    if (typeof raw !== 'string' || raw.length < 3) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch (e) {
        throw new Error(`${adapter.namespace}.config.${key} enthält kein gültiges JSON: ${e.message}`);
    }
}

/** The full persist envelope, so a write can put the layouts back where they came from. */
async function readDashboardEnvelope(adapter) {
    const parsed = await readJsonState(adapter, 'dashboard');
    if (parsed && parsed.state && Array.isArray(parsed.state.layouts)) {
        return parsed;
    }
    return null;
}

async function readDashboard(adapter) {
    const env = await readDashboardEnvelope(adapter);
    return env ? env.state.layouts : [];
}

async function readGroupDefs(adapter) {
    const parsed = await readJsonState(adapter, 'group-defs');
    // Both shapes occur: the zustand persist envelope and a plain { defs }.
    const defs = (parsed && parsed.state && parsed.state.defs) || (parsed && parsed.defs);
    return defs && typeof defs === 'object' ? defs : {};
}

async function readGrid(adapter) {
    const parsed = await readJsonState(adapter, 'app-config');
    const f = (parsed && parsed.state && parsed.state.frontend) || {};
    return {
        rowHeight: f.gridRowHeight != null ? f.gridRowHeight : DEFAULT_GRID.rowHeight,
        snapX: f.gridSnapX != null ? f.gridSnapX : f.gridRowHeight != null ? f.gridRowHeight : DEFAULT_GRID.snapX,
        gap: f.gridGap != null ? f.gridGap : DEFAULT_GRID.gap,
    };
}

/**
 * How many columns to design for.
 *
 * The running dashboard derives its column count from the grid's pixel width,
 * which the adapter cannot know. What it CAN know is how wide this dashboard is
 * already authored: the largest x + w across every widget. Staying inside that
 * stays inside the layout the user already has.
 */
function designColumns(layouts) {
    let max = 0;
    for (const tab of allTabs(layouts)) {
        for (const w of tab.widgets || []) {
            const gp = w && w.gridPos;
            if (gp && Number.isInteger(gp.x) && Number.isInteger(gp.w)) {
                max = Math.max(max, gp.x + gp.w);
            }
        }
    }
    return max || 48;
}

/** Flattened view of every tab with its layout and section, for addressing. */
function allTabs(layouts) {
    const out = [];
    for (const layout of layouts || []) {
        for (const section of layout.sections || []) {
            for (const tab of section.tabs || []) {
                out.push({
                    layoutId: layout.id,
                    layoutName: layout.name,
                    layoutSlug: layout.slug,
                    sectionId: section.id,
                    sectionName: section.name,
                    sectionSlug: section.slug,
                    id: tab.id,
                    name: tab.name,
                    slug: tab.slug,
                    disabled: !!tab.disabled,
                    widgets: tab.widgets || [],
                });
            }
        }
    }
    return out;
}

/**
 * Find one tab by name, slug or id. Ambiguity is reported rather than guessed:
 * several sections may hold a tab called "Licht", and silently picking the first
 * would put widgets somewhere the user never asked for.
 */
function findTab(layouts, opts) {
    const needle = String((opts && opts.tab) || '').toLowerCase();
    let hits = allTabs(layouts).filter(
        (t) =>
            (t.name || '').toLowerCase() === needle ||
            (t.slug || '').toLowerCase() === needle ||
            t.id === (opts && opts.tab),
    );
    if (opts && opts.layout) {
        const l = String(opts.layout).toLowerCase();
        hits = hits.filter((t) => (t.layoutName || '').toLowerCase() === l || (t.layoutSlug || '').toLowerCase() === l);
    }
    if (opts && opts.section) {
        const s = String(opts.section).toLowerCase();
        hits = hits.filter(
            (t) => (t.sectionName || '').toLowerCase() === s || (t.sectionSlug || '').toLowerCase() === s,
        );
    }
    if (hits.length === 0) {
        return { error: `Kein Tab "${opts && opts.tab}" gefunden.` };
    }
    if (hits.length > 1) {
        const where = hits.map((c) => `${c.layoutName} / ${c.sectionName}`).join('; ');
        return { error: `"${opts.tab}" gibt es mehrfach (${where}) — layout und/oder section mitgeben.` };
    }
    return { tab: hits[0] };
}

/** The group-def ids a widget tree references, so a slice can carry its children. */
function collectDefIds(widgets, defs, into) {
    const acc = into || new Set();
    for (const w of widgets || []) {
        const id = w && w.options && w.options.defId;
        if (typeof id === 'string' && defs[id] && !acc.has(id)) {
            acc.add(id);
            collectDefIds(defs[id], defs, acc);
        }
    }
    return acc;
}

// ── Writing ───────────────────────────────────────────────────────────────────

/**
 * Snapshot both config states into the adapter's backup namespace before a write.
 *
 * `<ns>.backups` already exists for the frontend's own auto-backups; this drops a
 * plainly named file next to them so a bad generated tab can be undone without
 * digging through ioBroker states.
 */
async function writeBackup(adapter) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `mcp-${stamp}.json`;
    // All three states every write path can touch — a backup that covers only the
    // dashboard is useless the moment a popup is edited.
    const [dashboard, groupDefs, popups] = await Promise.all([
        adapter.getStateAsync('config.dashboard'),
        adapter.getStateAsync('config.group-defs'),
        adapter.getStateAsync('config.popup-config'),
    ]);
    const payload = {
        _type: 'aura-mcp-backup',
        _ts: Date.now(),
        dashboard: (dashboard && dashboard.val) || null,
        'group-defs': (groupDefs && groupDefs.val) || null,
        'popup-config': (popups && popups.val) || null,
    };
    await adapter.writeFileAsync(`${adapter.namespace}.backups`, name, JSON.stringify(payload));
    return name;
}

/**
 * Write layouts (and optionally group-defs) back, preserving the persist envelope.
 *
 * Both states are written in one go. They cannot be made truly atomic across two
 * ioBroker states, so group-defs goes FIRST: a widget referencing a defId that
 * already exists renders correctly, while the reverse — a defId written after the
 * widget that points at it — shows an empty group in the window between them.
 */
async function writeGroupDefs(adapter, groupDefs) {
    const current = (await readJsonState(adapter, 'group-defs')) || { state: {}, version: 0 };
    const nextDefs = Object.assign({}, await readGroupDefs(adapter), groupDefs);
    const envelope = current.state ? current : { state: {}, version: 0 };
    envelope.state = Object.assign({}, envelope.state, { defs: nextDefs, hydrated: true });
    await adapter.setStateAsync('config.group-defs', { val: JSON.stringify(envelope), ack: WRITE_ACK });
}

async function writeDashboard(adapter, layouts, groupDefs) {
    const env = (await readDashboardEnvelope(adapter)) || { state: {}, version: 0 };
    if (groupDefs) {
        await writeGroupDefs(adapter, groupDefs);
    }
    env.state = Object.assign({}, env.state, { layouts });
    await adapter.setStateAsync('config.dashboard', { val: JSON.stringify(env), ack: WRITE_ACK });
}

// ── Popup views ───────────────────────────────────────────────────────────────

/**
 * Popup views live in `<ns>.config.popup-config`, again behind a persist envelope.
 * The other keys in that state (typeDefaults, deletedBuiltinIds) must survive a
 * write, so the envelope is read back rather than rebuilt.
 */
async function readPopupViews(adapter) {
    const parsed = await readJsonState(adapter, 'popup-config');
    const views = (parsed && parsed.state && parsed.state.views) || (parsed && parsed.views);
    return Array.isArray(views) ? views : [];
}

async function writePopupViews(adapter, views) {
    const current = (await readJsonState(adapter, 'popup-config')) || { state: {}, version: 0 };
    const envelope = current.state ? current : { state: {}, version: 0 };
    envelope.state = Object.assign({}, envelope.state, { views });
    await adapter.setStateAsync('config.popup-config', { val: JSON.stringify(envelope), ack: WRITE_ACK });
}

/**
 * Find one popup view by name or id, refusing to guess on ambiguity — same rule
 * as findTab, for the same reason.
 */
function findPopupView(views, needle) {
    const n = String(needle || '').toLowerCase();
    const hits = views.filter((v) => v.id === needle || (v.name || '').toLowerCase() === n);
    if (hits.length === 0) {
        return { error: `Kein Popup "${needle}" gefunden.` };
    }
    if (hits.length > 1) {
        return { error: `"${needle}" gibt es mehrfach — die Id angeben.` };
    }
    return { view: hits[0] };
}

// ── Creating a tab ────────────────────────────────────────────────────────────

function slugify(name) {
    return (
        String(name)
            .toLowerCase()
            .replace(/ä/g, 'ae')
            .replace(/ö/g, 'oe')
            .replace(/ü/g, 'ue')
            .replace(/ß/g, 'ss')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'tab'
    );
}

/** Mirrors uniqueTabSlug in dashboardStore: the slug is part of the tab's URL. */
function uniqueSlug(base, taken) {
    const seen = new Set(taken);
    let slug = base;
    let i = 2;
    while (seen.has(slug)) {
        slug = `${base}-${i++}`;
    }
    return slug;
}

/**
 * Pick the section a new tab goes into. With exactly one section anywhere the
 * choice is obvious; otherwise it has to be named, because putting a tab in the
 * wrong section is invisible until someone goes looking for it.
 */
function findSection(layouts, opts) {
    const all = [];
    for (const layout of layouts || []) {
        for (const section of layout.sections || []) {
            all.push({ layout, section });
        }
    }
    let hits = all;
    if (opts && opts.layout) {
        const l = String(opts.layout).toLowerCase();
        hits = hits.filter(
            (h) => (h.layout.name || '').toLowerCase() === l || (h.layout.slug || '').toLowerCase() === l,
        );
    }
    if (opts && opts.section) {
        const sec = String(opts.section).toLowerCase();
        hits = hits.filter(
            (h) => (h.section.name || '').toLowerCase() === sec || (h.section.slug || '').toLowerCase() === sec,
        );
    }
    if (hits.length === 0) {
        return { error: 'Kein passender Bereich gefunden.' };
    }
    if (hits.length > 1) {
        const where = hits.map((h) => `${h.layout.name} / ${h.section.name}`).join('; ');
        return { error: `Mehrere Bereiche möglich (${where}) — layout und/oder section angeben.` };
    }
    return { layout: hits[0].layout, section: hits[0].section };
}

/** Find one layout by name, slug or id — same no-guessing rule as findTab. */
function findLayout(layouts, needle) {
    const n = String(needle || '').toLowerCase();
    const hits = (layouts || []).filter(
        (l) => l.id === needle || (l.name || '').toLowerCase() === n || (l.slug || '').toLowerCase() === n,
    );
    if (hits.length === 0) {
        return { error: `Kein Layout "${needle}" gefunden.` };
    }
    if (hits.length > 1) {
        return { error: `"${needle}" gibt es mehrfach — die Id angeben.` };
    }
    return { layout: hits[0] };
}

/**
 * A fresh section, complete with one tab.
 *
 * The frontend does the same when the user adds one: a section without tabs has
 * nothing to show and no activeTabId to point at.
 */
function makeSection(name, takenSlugs) {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const tabId = `tab-${stamp}`;
    return {
        id: `section-${stamp}`,
        name,
        slug: uniqueSlug(slugify(name), takenSlugs),
        tabs: [{ id: tabId, name: 'Dashboard', slug: 'dashboard', widgets: [] }],
        activeTabId: tabId,
    };
}

/** Append a new layout with one section and one tab. */
function insertLayout(layouts, name) {
    const section = makeSection('Standard', []);
    const layout = {
        id: `layout-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        slug: uniqueSlug(
            slugify(name),
            (layouts || []).map((l) => l.slug),
        ),
        sections: [section],
        activeSectionId: section.id,
    };
    return { layouts: [...(layouts || []), layout], layout, section };
}

/** Append a new section (with one tab) to the given layout. */
function insertSection(layouts, layoutId, name) {
    let created = null;
    const next = (layouts || []).map((layout) => {
        if (layout.id !== layoutId) {
            return layout;
        }
        created = makeSection(
            name,
            (layout.sections || []).map((sec) => sec.slug),
        );
        return { ...layout, sections: [...(layout.sections || []), created] };
    });
    return { layouts: next, section: created };
}

/** Insert a new tab, returning the new layout tree and the created tab. */
function insertTab(layouts, sectionId, name, widgets) {
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let created = null;
    const next = layouts.map((layout) => ({
        ...layout,
        sections: (layout.sections || []).map((section) => {
            if (section.id !== sectionId) {
                return section;
            }
            const slug = uniqueSlug(
                slugify(name),
                (section.tabs || []).map((t) => t.slug),
            );
            created = { id, name, slug, widgets: widgets || [] };
            return { ...section, tabs: [...(section.tabs || []), created] };
        }),
    }));
    return { layouts: next, tab: created };
}

/** Replace one tab's widget list inside the layout tree, returning a new tree. */
function replaceTabWidgets(layouts, tabId, widgets) {
    return layouts.map((layout) => ({
        ...layout,
        sections: (layout.sections || []).map((section) => ({
            ...section,
            tabs: (section.tabs || []).map((tab) => (tab.id === tabId ? { ...tab, widgets } : tab)),
        })),
    }));
}

/** Every state id in the installation, aliases included. */
async function listStateIds(adapter) {
    const [plain, aliases] = await Promise.all([
        adapter.getObjectViewAsync('system', 'state', { startkey: '', endkey: '香' }),
        // getObjectView('state') does NOT return alias objects. Without this second
        // range query an alias-only installation validates as "datapoint does not
        // exist" for every widget.
        adapter.getObjectViewAsync('system', 'state', { startkey: 'alias.', endkey: 'alias.香' }),
    ]);
    const ids = new Set();
    for (const rows of [plain && plain.rows, aliases && aliases.rows]) {
        for (const row of rows || []) {
            if (row && row.id) {
                ids.add(row.id);
            }
        }
    }
    return ids;
}

module.exports = {
    allTabs,
    findLayout,
    insertLayout,
    insertSection,
    findPopupView,
    findSection,
    insertTab,
    readPopupViews,
    slugify,
    uniqueSlug,
    writeGroupDefs,
    writePopupViews,
    collectDefIds,
    designColumns,
    findTab,
    listStateIds,
    readDashboard,
    readGrid,
    readGroupDefs,
    replaceTabWidgets,
    writeBackup,
    writeDashboard,
};
