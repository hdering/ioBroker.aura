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

const { designCanvas } = require('./canvas.js');

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

/** The frontend half of the app config — grid, frame and guidelines all live here. */
async function readFrontendConfig(adapter) {
    const parsed = await readJsonState(adapter, 'app-config');
    return (parsed && parsed.state && parsed.state.frontend) || {};
}

async function readGrid(adapter) {
    const f = await readFrontendConfig(adapter);
    return {
        rowHeight: f.gridRowHeight != null ? f.gridRowHeight : DEFAULT_GRID.rowHeight,
        snapX: f.gridSnapX != null ? f.gridSnapX : f.gridRowHeight != null ? f.gridRowHeight : DEFAULT_GRID.snapX,
        gap: f.gridGap != null ? f.gridGap : DEFAULT_GRID.gap,
    };
}

/**
 * The target screen for a tab: what the user drew with the guidelines, converted
 * into columns and rows (lib/mcp/canvas.js).
 *
 * Grid and guidelines are overridable per layout and per section, so a wall-panel
 * layout and a desktop layout in the same installation get different budgets —
 * hence the target, not just the global settings.
 */
async function readCanvas(adapter, target) {
    const frontend = await readFrontendConfig(adapter);
    const t = target || {};
    const tabCount = Number.isFinite(t.tabCount)
        ? t.tabCount
        : t.section && Array.isArray(t.section.tabs)
          ? t.section.tabs.length
          : undefined;
    return designCanvas({ frontend, layout: t.layout, section: t.section, tabCount });
}

/** Finds the layout/section a tab id belongs to, for readCanvas. */
function hostOf(layouts, tabId) {
    for (const layout of layouts || []) {
        for (const section of layout.sections || []) {
            for (const tab of section.tabs || []) {
                if (tab.id === tabId) {
                    return { layout, section, tabCount: (section.tabs || []).length };
                }
            }
        }
    }
    return {};
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
    // Every state a write path can touch — a backup that covers only the dashboard
    // is useless the moment a popup is edited or a preset overwritten.
    const [dashboard, groupDefs, popups, presets] = await Promise.all([
        adapter.getStateAsync('config.dashboard'),
        adapter.getStateAsync('config.group-defs'),
        adapter.getStateAsync('config.popup-config'),
        adapter.getStateAsync('config.widget-presets'),
    ]);
    const payload = {
        _type: 'aura-mcp-backup',
        _ts: Date.now(),
        dashboard: (dashboard && dashboard.val) || null,
        'group-defs': (groupDefs && groupDefs.val) || null,
        'popup-config': (popups && popups.val) || null,
        'widget-presets': (presets && presets.val) || null,
    };
    await adapter.writeFileAsync(`${adapter.namespace}.backups`, name, JSON.stringify(payload));
    return name;
}

/** The backups this server wrote, newest first. */
async function listBackups(adapter) {
    const files = await adapter.readDirAsync(`${adapter.namespace}.backups`, '');
    return (files || [])
        .map((f) => (typeof f === 'string' ? f : f.file))
        .filter((name) => typeof name === 'string' && name.startsWith('mcp-') && name.endsWith('.json'))
        .sort()
        .reverse();
}

/**
 * Put a backup back.
 *
 * Writing a backup on every change is only half a safety net — without a way to
 * put one back, a bad generated tab still has to be repaired by hand. A snapshot
 * is taken of the CURRENT state first, so restoring the wrong one is itself
 * undoable.
 *
 * Only the states the backup actually holds are written: an older file may
 * predate popup support, and writing `null` over the live popups would turn a
 * restore into a second accident.
 */
async function restoreBackup(adapter, name) {
    if (!/^mcp-[\w.-]+\.json$/.test(String(name || ''))) {
        return { error: `"${name}" ist kein Sicherungsname aus diesem Server.` };
    }
    let payload;
    try {
        const raw = await adapter.readFileAsync(`${adapter.namespace}.backups`, name);
        const text = raw && raw.file !== undefined ? raw.file : raw;
        payload = JSON.parse(Buffer.isBuffer(text) ? text.toString('utf8') : String(text));
    } catch (e) {
        return { error: `Sicherung "${name}" nicht lesbar: ${e.message}` };
    }
    if (!payload || payload._type !== 'aura-mcp-backup') {
        return { error: `"${name}" ist keine Sicherung dieses Servers.` };
    }

    const safety = await writeBackup(adapter);
    const written = [];
    for (const key of ['dashboard', 'group-defs', 'popup-config', 'widget-presets']) {
        if (typeof payload[key] === 'string' && payload[key]) {
            await adapter.setStateAsync(`config.${key}`, { val: payload[key], ack: WRITE_ACK });
            written.push(key);
        }
    }
    return { written, safety, ts: payload._ts };
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

/**
 * Write the group definitions EXACTLY as given, dropping what is not in them.
 *
 * writeGroupDefs merges, which is right for adding — but pruning needs to be able
 * to remove, and a merge can never remove.
 */
async function replaceGroupDefs(adapter, defs) {
    const current = (await readJsonState(adapter, 'group-defs')) || { state: {}, version: 0 };
    const envelope = current.state ? current : { state: {}, version: 0 };
    envelope.state = Object.assign({}, envelope.state, { defs, hydrated: true });
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

// ── Widget presets ────────────────────────────────────────────────────────────

/**
 * Saved widget blueprints from the widget designer, in `<ns>.config.widget-presets`.
 * A preset carries the widget AND the group definitions it references, so a whole
 * composite can be dropped in somewhere else.
 */
async function readPresets(adapter) {
    const parsed = await readJsonState(adapter, 'widget-presets');
    const presets = (parsed && parsed.state && parsed.state.presets) || (parsed && parsed.presets);
    return Array.isArray(presets) ? presets : [];
}

async function writePresets(adapter, presets) {
    const current = (await readJsonState(adapter, 'widget-presets')) || { state: {}, version: 0 };
    const envelope = current.state ? current : { state: {}, version: 0 };
    envelope.state = Object.assign({}, envelope.state, { presets });
    await adapter.setStateAsync('config.widget-presets', { val: JSON.stringify(envelope), ack: WRITE_ACK });
}

function findPreset(presets, needle) {
    const n = String(needle || '').toLowerCase();
    const hits = presets.filter((p) => p.id === needle || (p.name || '').toLowerCase() === n);
    if (hits.length === 0) {
        return { error: `Keine Vorlage "${needle}" gefunden.` };
    }
    if (hits.length > 1) {
        return { error: `"${needle}" gibt es mehrfach — die Id angeben.` };
    }
    return { preset: hits[0] };
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

/**
 * Locate one widget by id across every tab.
 *
 * Widget ids are meant to be unique, but an id that was copied rather than
 * regenerated does occur — reporting both places beats editing whichever came
 * first.
 */
function findWidget(layouts, widgetId) {
    const hits = [];
    for (const tab of allTabs(layouts)) {
        const index = (tab.widgets || []).findIndex((w) => w && w.id === widgetId);
        if (index >= 0) {
            hits.push({ tab, index });
        }
    }
    if (hits.length === 0) {
        return { error: `Kein Widget mit der id "${widgetId}" in einem Tab gefunden.` };
    }
    if (hits.length > 1) {
        const where = hits.map((h) => `${h.tab.layoutName} / ${h.tab.sectionName} / ${h.tab.name}`).join('; ');
        return { error: `Die id "${widgetId}" kommt mehrfach vor (${where}).` };
    }
    return hits[0];
}

/**
 * Merge a patch onto a widget.
 *
 * `options` and `gridPos` are merged rather than replaced, because those are the
 * fields a caller almost always means to adjust one key of. An explicit null
 * removes a key — the only way to take an option away again without resending
 * the whole widget.
 *
 * `gridPos` used to be replaced, and the tool description said "the patch is
 * merged" without excepting it: `{"gridPos":{"h":17}}` — a height change, the
 * commonest single edit there is — came back as "gridPos.x muss eine ganze Zahl
 * sein", which reads like a complaint about a value the caller never sent.
 * A null inside gridPos is refused rather than honoured: x/y/w/h are all
 * required, so removing one only produces that same error one step later.
 */
function mergeWidget(widget, patch) {
    const next = { ...widget };
    for (const [key, value] of Object.entries(patch || {})) {
        if (value === null) {
            delete next[key];
        } else if (
            (key === 'options' || key === 'gridPos') &&
            value &&
            typeof value === 'object' &&
            !Array.isArray(value)
        ) {
            const merged = { ...(widget[key] || {}) };
            for (const [k, v] of Object.entries(value)) {
                if (v === null && key === 'options') {
                    delete merged[k];
                } else {
                    merged[k] = v;
                }
            }
            next[key] = merged;
        } else {
            next[key] = value;
        }
    }
    return next;
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

/**
 * The properties each navigation node accepts, beyond its structure.
 *
 * Deliberately different per kind, because they genuinely are: only a tab button
 * carries conditions, and a layout has neither badges nor an aggregate. Setting
 * `conditions` on a section would otherwise be stored and silently ignored — the
 * exact failure this whole schema effort exists to prevent.
 *
 * `name` is NOT here: renaming has its own permission level, and accepting it
 * through a property patch would let the write level bypass that gate. id, slug
 * and the child lists are absent because structure has its own tools, and the
 * slug has to stay put for URLs and navigate datapoints to keep working.
 */
const NODE_FIELDS = {
    layout: ['icon', 'hidden', 'defaultSectionId', 'settings'],
    section: ['icon', 'hidden', 'defaultTabId', 'badges', 'badgeAggregate', 'settings'],
    tab: ['icon', 'hideLabel', 'disabled', 'hidden', 'conditions', 'badges', 'badgeAggregate'],
};

/** Which navigation properties are currently set — for the dashboard overview. */
function nodeMarkers(node) {
    const marks = [];
    if (node.icon) {
        marks.push('Icon');
    }
    if (node.hidden) {
        marks.push('ausgeblendet');
    }
    if (node.disabled) {
        marks.push('deaktiviert');
    }
    if (Array.isArray(node.conditions) && node.conditions.length) {
        marks.push(`${node.conditions.length} Bedingung(en)`);
    }
    if (Array.isArray(node.badges) && node.badges.length) {
        marks.push(`${node.badges.length} Marker`);
    }
    if (node.badgeAggregate && node.badgeAggregate.enabled) {
        marks.push('Aggregat-Anzahl');
    }
    return marks;
}

/**
 * Merge a property patch into one layout, section or tab.
 *
 * Merged rather than replaced, for the same reason as widgets: a caller adjusting
 * one field should not have to resend the others and risk dropping them. A field
 * set to null is removed. badgeAggregate is merged key by key, being an object.
 */
function updateNode(layouts, kind, id, patch) {
    const allowed = NODE_FIELDS[kind];
    if (!allowed) {
        return { error: `Unbekannte Art "${kind}".` };
    }
    const unknown = Object.keys(patch || {}).filter((k) => !allowed.includes(k));
    if (unknown.length) {
        return {
            error:
                `Ein ${kind} kennt ${unknown.map((k) => `"${k}"`).join(', ')} nicht — ` +
                `erlaubt: ${allowed.join(', ')}. Zum Umbenennen aura_rename verwenden.`,
        };
    }

    const apply = (node) => {
        const next = { ...node };
        for (const [key, value] of Object.entries(patch || {})) {
            if (value === null) {
                delete next[key];
            } else if (key === 'badgeAggregate' && value && typeof value === 'object') {
                next.badgeAggregate = { ...(node.badgeAggregate || {}), ...value };
            } else {
                next[key] = value;
            }
        }
        return next;
    };

    let done = false;
    const next = (layouts || []).map((layout) => {
        if (kind === 'layout') {
            if (layout.id !== id) {
                return layout;
            }
            done = true;
            return apply(layout);
        }
        return {
            ...layout,
            sections: (layout.sections || []).map((section) => {
                if (kind === 'section') {
                    if (section.id !== id) {
                        return section;
                    }
                    done = true;
                    return apply(section);
                }
                return {
                    ...section,
                    tabs: (section.tabs || []).map((tab) => {
                        if (tab.id !== id) {
                            return tab;
                        }
                        done = true;
                        return apply(tab);
                    }),
                };
            }),
        };
    });
    return done ? { layouts: next } : { error: `Nichts mit der id "${id}" gefunden.` };
}

/**
 * Rename a layout, section or tab. The SLUG is deliberately left alone, exactly
 * as the editor does it: the slug is part of the URL, and of the navigate targets
 * the adapter publishes, so changing it on a rename would break bookmarks and
 * scripts for a cosmetic edit.
 */
function renameNode(layouts, kind, id, name) {
    let done = false;
    const next = (layouts || []).map((layout) => {
        if (kind === 'layout') {
            if (layout.id !== id) {
                return layout;
            }
            done = true;
            return { ...layout, name };
        }
        return {
            ...layout,
            sections: (layout.sections || []).map((section) => {
                if (kind === 'section') {
                    if (section.id !== id) {
                        return section;
                    }
                    done = true;
                    return { ...section, name };
                }
                return {
                    ...section,
                    tabs: (section.tabs || []).map((tab) => {
                        if (tab.id !== id) {
                            return tab;
                        }
                        done = true;
                        return { ...tab, name };
                    }),
                };
            }),
        };
    });
    return done ? { layouts: next } : { error: `Nichts mit der id "${id}" gefunden.` };
}

/**
 * Remove a layout, section or tab.
 *
 * Mirrors the editor's guards: the last layout and the last section of a layout
 * stay, and a section that would end up without tabs gets a fresh one — a section
 * with no tabs has nothing to render and no activeTabId to point at. The editor
 * silently declines; here it is an error, because a caller that asked for a
 * deletion deserves to hear that it did not happen.
 */
function removeNode(layouts, kind, id) {
    const list = layouts || [];
    if (kind === 'layout') {
        if (!list.some((l) => l.id === id)) {
            return { error: `Kein Layout mit der id "${id}".` };
        }
        if (list.length <= 1) {
            return { error: 'Das letzte Layout kann nicht gelöscht werden.' };
        }
        return { layouts: list.filter((l) => l.id !== id) };
    }

    let found = false;
    let refused = null;
    const next = list.map((layout) => {
        if (kind === 'section') {
            if (!(layout.sections || []).some((s) => s.id === id)) {
                return layout;
            }
            found = true;
            if ((layout.sections || []).length <= 1) {
                refused = `„${layout.name}“ hat nur diesen einen Bereich — er kann nicht gelöscht werden.`;
                return layout;
            }
            const sections = layout.sections.filter((s) => s.id !== id);
            return {
                ...layout,
                sections,
                activeSectionId: layout.activeSectionId === id ? sections[0].id : layout.activeSectionId,
            };
        }
        return {
            ...layout,
            sections: (layout.sections || []).map((section) => {
                if (!(section.tabs || []).some((t) => t.id === id)) {
                    return section;
                }
                found = true;
                const tabs = section.tabs.filter((t) => t.id !== id);
                if (tabs.length === 0) {
                    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                    tabs.push({ id: `tab-${stamp}`, name: 'Dashboard', slug: 'dashboard', widgets: [] });
                }
                return {
                    ...section,
                    tabs,
                    activeTabId: section.activeTabId === id ? tabs[0].id : section.activeTabId,
                };
            }),
        };
    });
    if (refused) {
        return { error: refused };
    }
    return found ? { layouts: next } : { error: `Nichts mit der id "${id}" gefunden.` };
}

/**
 * Reorder a list of layouts, sections or tabs.
 *
 * The caller gives the complete new order by name or id, not a from/to index
 * pair: an index is meaningless to someone who read the dashboard as a list of
 * names, and an off-by-one silently moves the wrong entry. Demanding the whole
 * set also makes omission impossible — leaving something out would otherwise
 * read as "delete it".
 */
function reorderNodes(list, order, label) {
    const byKey = new Map();
    for (const item of list) {
        byKey.set(item.id, item);
        byKey.set(String(item.name || '').toLowerCase(), item);
        if (item.slug) {
            byKey.set(String(item.slug).toLowerCase(), item);
        }
    }
    const picked = [];
    for (const key of order || []) {
        const item = byKey.get(key) || byKey.get(String(key).toLowerCase());
        if (!item) {
            return { error: `"${key}" gibt es unter den ${label} nicht.` };
        }
        if (picked.includes(item)) {
            return { error: `"${key}" kommt in der Reihenfolge mehrfach vor.` };
        }
        picked.push(item);
    }
    const missing = list.filter((item) => !picked.includes(item));
    if (missing.length) {
        return {
            error:
                `Die Reihenfolge muss alle ${label} enthalten — es fehlen: ` +
                `${missing.map((m) => `"${m.name}"`).join(', ')}.`,
        };
    }
    return { ordered: picked };
}

/**
 * Deep-rewrite `widgetId` references inside a copied set.
 *
 * Click actions carry them (`popup-widget`, `link-widget`) at many depths —
 * widget options, list entries, carousel items — so the walk is generic rather
 * than enumerating shapes. A reference to something outside the copied set is
 * left alone: it still points at a widget that exists. Mirrors
 * src-vis/utils/widgetCopy.ts, which does the same for copies made in the editor.
 */
function remapWidgetRefs(value, idMap) {
    if (!idMap || !idMap.size) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => remapWidgetRefs(item, idMap));
    }
    if (value && typeof value === 'object') {
        const next = {};
        for (const [key, val] of Object.entries(value)) {
            next[key] =
                key === 'widgetId' && typeof val === 'string' && idMap.has(val)
                    ? idMap.get(val)
                    : remapWidgetRefs(val, idMap);
        }
        return next;
    }
    return value;
}

/**
 * Clone a list of widgets: fresh ids, cloned group children, references inside
 * the copy pointing at the copy. Returns the new list; `newDefs` collects the
 * group definitions the copy created.
 */
function cloneWidgets(widgets, defs, newDefs, suffix) {
    const idMap = new Map();
    const copies = (widgets || []).map((w) => cloneWidget(w, defs, newDefs, suffix, idMap));
    for (const key of Object.keys(newDefs)) {
        newDefs[key] = remapWidgetRefs(newDefs[key], idMap);
    }
    return remapWidgetRefs(copies, idMap);
}

/** A tab with a new id, a slug free in its new home, and cloned widgets. */
function cloneTab(tab, defs, newDefs, suffix, takenSlugs, name) {
    const label = name || tab.name;
    return {
        id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: label,
        slug: uniqueSlug(slugify(label), takenSlugs),
        widgets: cloneWidgets(tab.widgets || [], defs, newDefs, suffix),
        ...(tab.icon ? { icon: tab.icon } : {}),
    };
}

/** A section with a new id and cloned tabs. */
function cloneSection(section, defs, newDefs, suffix, takenSlugs, name) {
    const label = name || section.name;
    const taken = [];
    const tabs = (section.tabs || []).map((t) => {
        const copy = cloneTab(t, defs, newDefs, suffix, taken);
        taken.push(copy.slug);
        return copy;
    });
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return {
        id: `section-${stamp}`,
        name: label,
        slug: uniqueSlug(slugify(label), takenSlugs),
        tabs,
        activeTabId: tabs.length ? tabs[0].id : undefined,
        ...(section.icon ? { icon: section.icon } : {}),
    };
}

/** Put a prepared section into a layout. */
function attachSection(layouts, layoutId, section) {
    return (layouts || []).map((l) => (l.id === layoutId ? { ...l, sections: [...(l.sections || []), section] } : l));
}

/** Put a prepared tab into a section. */
function attachTab(layouts, sectionId, tab) {
    return (layouts || []).map((l) => ({
        ...l,
        sections: (l.sections || []).map((s) => (s.id === sectionId ? { ...s, tabs: [...(s.tabs || []), tab] } : s)),
    }));
}

/** Take a tab out of whichever section holds it. */
function detachTab(layouts, tabId) {
    return (layouts || []).map((l) => ({
        ...l,
        sections: (l.sections || []).map((s) => ({ ...s, tabs: (s.tabs || []).filter((t) => t.id !== tabId) })),
    }));
}

/** Take a section out of whichever layout holds it. */
function detachSection(layouts, sectionId) {
    return (layouts || []).map((l) => ({ ...l, sections: (l.sections || []).filter((s) => s.id !== sectionId) }));
}

/**
 * Copy or move one widget into another tab.
 *
 * A copied widget needs a new id, and a copied GROUP needs new group-def ids too:
 * sharing a defId would make the copy and the original the same children, so
 * editing one would change the other with nothing to suggest why.
 */
function cloneWidget(widget, defs, newDefs, suffix, idMap) {
    const copy = JSON.parse(JSON.stringify(widget));
    copy.id = `${widget.id}-${suffix}`;
    if (idMap) {
        idMap.set(widget.id, copy.id);
    }
    const oldDefId = copy.options && copy.options.defId;
    if (typeof oldDefId === 'string' && defs[oldDefId]) {
        const nextDefId = `${oldDefId}-${suffix}`;
        copy.options.defId = nextDefId;
        newDefs[nextDefId] = (defs[oldDefId] || []).map((child) => cloneWidget(child, defs, newDefs, suffix, idMap));
    }
    return copy;
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

/**
 * The logging adapters switched on for a datapoint, from `common.custom`.
 *
 * Exactly the rule the frontend uses (detectHistoryAdapters in
 * hooks/useChartHistory.ts): an entry counts when it is enabled and its instance
 * belongs to history, influxdb or sql. A chart on a datapoint with none of them
 * has nothing to draw and stays empty forever — which is the one chart mistake
 * that looks like a working configuration from every angle.
 *
 * @param {object} custom the object's common.custom
 * @returns {string[]} instance ids, e.g. ['influxdb.0']
 */
function loggingInstances(custom) {
    if (!custom || typeof custom !== 'object') {
        return [];
    }
    return Object.entries(custom)
        .filter(([key, val]) => val && val.enabled && /^(history|influxdb|sql)\./.test(key))
        .map(([key]) => key);
}

/**
 * The logging adapter instances this installation has.
 *
 * Needed twice over: a datapoint may name an instance that was uninstalled (its
 * `custom` entry survives), and nothing anywhere lists what IS available — so a
 * model configuring a chart has to guess the instance name. A query against a
 * missing instance does not fail either; `sendTo` waits for an answer nobody will
 * send, and the client eventually times out.
 *
 * @param {object} adapter ioBroker adapter instance
 * @returns {Promise<string[]>} instance ids, e.g. ['influxdb.0']
 */
async function readLoggingInstances(adapter) {
    try {
        const view = await adapter.getObjectViewAsync('system', 'instance', {
            startkey: 'system.adapter.',
            endkey: 'system.adapter.香',
        });
        return (view && view.rows ? view.rows : [])
            .map((row) => String((row && row.id) || '').replace('system.adapter.', ''))
            .filter((id) => /^(history|influxdb|sql)\.\d+$/.test(id))
            .sort();
    } catch {
        // A failed lookup must not turn into "no instance installed" — that would
        // report every logged datapoint as recorded by a ghost.
        return null;
    }
}

/**
 * What the objects behind a handful of datapoints declare.
 *
 * Only the fields a check can act on, and only for the ids actually referenced —
 * the object view would hand over every state in the installation, which for the
 * question "does this state accept a write" is thousands of times more data than
 * the answer needs.
 *
 * @param {object} adapter ioBroker adapter instance
 * @param {Iterable<string>} ids the datapoint ids to look up
 * @param {number} [max] safety cap; beyond it the rest is skipped
 * @returns {Promise<Map<string, object>>} id → { type, role, write, min, max, unit, states, name, logging }
 */
async function readStateMeta(adapter, ids, max = 400) {
    const wanted = [...new Set([...ids])].slice(0, max);
    const meta = new Map();
    const chunk = 40;
    for (let i = 0; i < wanted.length; i += chunk) {
        const slice = wanted.slice(i, i + chunk);
        const objs = await Promise.all(slice.map((id) => adapter.getForeignObjectAsync(id).catch(() => null)));
        slice.forEach((id, n) => {
            const common = objs[n] && objs[n].common;
            if (!common) {
                return;
            }
            meta.set(id, {
                type: common.type,
                role: common.role,
                write: common.write,
                min: common.min,
                max: common.max,
                unit: common.unit,
                states: common.states,
                name: typeof common.name === 'string' ? common.name : undefined,
                logging: loggingInstances(common.custom),
            });
        });
    }
    return meta;
}

/**
 * The last value and its timestamp for the given ids.
 *
 * The question a grown dashboard needs answered is not "does this state exist"
 * but "is anything still writing to it": five generations of datapoints for the
 * same heat pump all exist, and only one of them is alive.
 *
 * @param {object} adapter ioBroker adapter instance
 * @param {Iterable<string>} ids the datapoint ids to read
 * @param {number} [max] safety cap
 * @returns {Promise<Map<string, {val: any, ts: number, ack: boolean}|null>>}
 */
async function readStateValues(adapter, ids, max = 400) {
    const wanted = [...new Set([...ids])].slice(0, max);
    const out = new Map();
    const chunk = 40;
    for (let i = 0; i < wanted.length; i += chunk) {
        const slice = wanted.slice(i, i + chunk);
        const states = await Promise.all(slice.map((id) => adapter.getForeignStateAsync(id).catch(() => null)));
        slice.forEach((id, n) => {
            const s = states[n];
            out.set(id, s ? { val: s.val, ts: s.ts, ack: s.ack } : null);
        });
    }
    return out;
}

module.exports = {
    loggingInstances,
    readLoggingInstances,
    readStateMeta,
    readStateValues,
    allTabs,
    findLayout,
    findWidget,
    mergeWidget,
    NODE_FIELDS,
    nodeMarkers,
    removeNode,
    renameNode,
    insertLayout,
    insertSection,
    findPopupView,
    findPreset,
    findSection,
    insertTab,
    readPopupViews,
    readPresets,
    slugify,
    uniqueSlug,
    writeGroupDefs,
    replaceGroupDefs,
    writePopupViews,
    writePresets,
    cloneWidget,
    cloneWidgets,
    cloneSection,
    cloneTab,
    attachSection,
    attachTab,
    detachSection,
    detachTab,
    remapWidgetRefs,
    collectDefIds,
    designColumns,
    hostOf,
    readCanvas,
    readFrontendConfig,
    findTab,
    listBackups,
    listStateIds,
    readDashboard,
    readGrid,
    readGroupDefs,
    reorderNodes,
    replaceTabWidgets,
    restoreBackup,
    updateNode,
    writeBackup,
    writeDashboard,
};
