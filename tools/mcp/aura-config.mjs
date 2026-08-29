// Reads and interprets the AURA config datapoints.
//
// The dashboard lives in `<ns>.config.dashboard` as a zustand-persist snapshot
// (`{ version, state: { layouts: [...] } }`), and group/panels children live in
// a SEPARATE state, `<ns>.config.group-defs`. Anything that reads or writes a
// widget tree has to know about both — a group read without its defs looks
// empty, and that has bitten this project before.

import { getState, auraNamespace } from './iobroker.mjs';

const DEFAULT_GRID = { rowHeight: 20, snapX: 20, gap: 10 };

async function readJsonState(key) {
    const ns = auraNamespace();
    const state = await getState(`${ns}.config.${key}`);
    const raw = state?.val;
    if (typeof raw !== 'string' || raw.length < 3) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch (e) {
        throw new Error(`${ns}.config.${key} enthält kein gültiges JSON: ${e.message}`);
    }
}

/** The persisted layout tree, or an empty one when nothing is configured yet. */
export async function readDashboard() {
    const parsed = await readJsonState('dashboard');
    const layouts = parsed?.state?.layouts;
    return Array.isArray(layouts) ? layouts : [];
}

export async function readGroupDefs() {
    const parsed = await readJsonState('group-defs');
    // Both shapes occur: the zustand persist envelope and a plain { defs }.
    // Anything else counts as empty rather than being read as defs itself.
    const defs = parsed?.state?.defs ?? parsed?.defs;
    return defs && typeof defs === 'object' ? defs : {};
}

/** Grid geometry from the app config, falling back to the frontend's defaults. */
export async function readGrid() {
    const parsed = await readJsonState('app-config');
    const f = parsed?.state?.frontend ?? {};
    return {
        rowHeight: f.gridRowHeight ?? DEFAULT_GRID.rowHeight,
        snapX: f.gridSnapX ?? f.gridRowHeight ?? DEFAULT_GRID.snapX,
        gap: f.gridGap ?? DEFAULT_GRID.gap,
    };
}

/**
 * How many columns to design for.
 *
 * The running dashboard derives its column count from the grid's pixel width,
 * which no server can know. What it CAN know is how wide this dashboard is
 * already authored: the largest x + w across every widget. New widgets that stay
 * inside that stay inside the layout the user already has — and since the
 * frontend widens the grid to fit the widest widget, it is also a real bound.
 */
export function designColumns(layouts) {
    let max = 0;
    for (const tab of allTabs(layouts)) {
        for (const w of tab.widgets ?? []) {
            const gp = w?.gridPos;
            if (gp && Number.isInteger(gp.x) && Number.isInteger(gp.w)) {
                max = Math.max(max, gp.x + gp.w);
            }
        }
    }
    return max || 48;
}

/** Flattened view of every tab with its layout and section for addressing. */
export function allTabs(layouts) {
    const out = [];
    for (const layout of layouts) {
        for (const section of layout.sections ?? []) {
            for (const tab of section.tabs ?? []) {
                out.push({
                    layoutName: layout.name,
                    layoutSlug: layout.slug,
                    sectionName: section.name,
                    sectionSlug: section.slug,
                    name: tab.name,
                    slug: tab.slug,
                    id: tab.id,
                    disabled: !!tab.disabled,
                    widgets: tab.widgets ?? [],
                });
            }
        }
    }
    return out;
}

/**
 * Find one tab by name, slug or id. Ambiguity is reported rather than guessed —
 * several sections may hold a tab called "Licht", and silently picking the first
 * would put widgets somewhere the user did not ask for.
 */
export function findTab(layouts, { tab, layout, section }) {
    const needle = String(tab ?? '').toLowerCase();
    let candidates = allTabs(layouts).filter(
        (t) => t.name.toLowerCase() === needle || t.slug?.toLowerCase() === needle || t.id === tab,
    );
    if (layout) {
        const l = String(layout).toLowerCase();
        candidates = candidates.filter((t) => t.layoutName.toLowerCase() === l || t.layoutSlug?.toLowerCase() === l);
    }
    if (section) {
        const s = String(section).toLowerCase();
        candidates = candidates.filter((t) => t.sectionName.toLowerCase() === s || t.sectionSlug?.toLowerCase() === s);
    }
    if (candidates.length === 0) {
        return { error: `Kein Tab "${tab}" gefunden.` };
    }
    if (candidates.length > 1) {
        const where = candidates.map((c) => `${c.layoutName} / ${c.sectionName}`).join('; ');
        return { error: `"${tab}" gibt es mehrfach (${where}) — layout und/oder section mitgeben.` };
    }
    return { tab: candidates[0] };
}

/** The group-def ids a widget tree references, so a slice can carry its children. */
export function collectDefIds(widgets, defs, into = new Set()) {
    for (const w of widgets ?? []) {
        const id = w?.options?.defId;
        if (typeof id === 'string' && defs[id] && !into.has(id)) {
            into.add(id);
            collectDefIds(defs[id], defs, into);
        }
    }
    return into;
}
