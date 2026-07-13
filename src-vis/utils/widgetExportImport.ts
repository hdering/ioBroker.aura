import type { WidgetConfig } from '../types';
import type { Tab, Section, DashboardLayout } from '../store/dashboardStore';
import type { PopupView } from '../store/popupConfigStore';
import { useGroupDefsStore, newGroupDefId } from '../store/groupDefsStore';
import { anonymizePayload, anyAnonymize, type AnonymizeOptions } from './anonymizeExport';

export type { AnonymizeOptions } from './anonymizeExport';

// Serialises a payload (optionally anonymised) and triggers a browser download.
// When any anonymisation is active, `-anon` is appended to the filename; when
// titles are anonymised the descriptive part of the name is dropped too so the
// filename itself cannot leak a real title.
function downloadJson(payload: unknown, base: string, descriptive: string, anon?: AnonymizeOptions): void {
    const scrubbed = anyAnonymize(anon) ? anonymizePayload(payload, anon!) : payload;
    const namePart = anon?.titles ? '' : `-${descriptive.replace(/[^a-z0-9]/gi, '_')}`;
    const suffix = anyAnonymize(anon) ? '-anon' : '';
    const json = JSON.stringify(scrubbed, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}${namePart}${suffix}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function collectGroupDefs(
    widgets: WidgetConfig[],
    allDefs: Record<string, WidgetConfig[]>,
    out: Record<string, WidgetConfig[]>,
): void {
    for (const w of widgets) {
        if ((w.type === 'group' || w.type === 'panels') && w.options?.defId) {
            const defId = w.options.defId as string;
            if (!(defId in out) && allDefs[defId]) {
                out[defId] = allDefs[defId];
                collectGroupDefs(allDefs[defId], allDefs, out);
            }
        }
    }
}

let _widgetCounter = 0;
function freshWidgetId(): string {
    return `w-${Date.now()}-${(++_widgetCounter).toString(36)}`;
}

export function exportWidget(config: WidgetConfig, anon?: AnonymizeOptions) {
    const payload: Record<string, unknown> = { ...config };

    if ((config.type === 'group' || config.type === 'panels') && config.options?.defId) {
        const allDefs = useGroupDefsStore.getState().defs;
        const groupDefs: Record<string, WidgetConfig[]> = {};
        collectGroupDefs([config], allDefs, groupDefs);
        if (Object.keys(groupDefs).length > 0) {
            payload.groupDefs = groupDefs;
        }
    }

    downloadJson(payload, `aura-widget-${config.type}`, config.title || config.id, anon);
}

/**
 * Remaps all defIds from the imported groupDefs to fresh IDs, loads them into
 * the store, and returns the config updated with the new root defId.
 */
export function importGroupDefs(config: WidgetConfig, importedDefs: Record<string, WidgetConfig[]>): WidgetConfig {
    if (!config.options?.defId || Object.keys(importedDefs).length === 0) return config;

    const idMap: Record<string, string> = {};
    for (const oldId of Object.keys(importedDefs)) {
        idMap[oldId] = newGroupDefId();
    }

    function remapChildren(children: WidgetConfig[]): WidgetConfig[] {
        return children.map((child) => {
            if ((child.type === 'group' || child.type === 'panels') && child.options?.defId) {
                const oldDefId = child.options.defId as string;
                const newDefId = idMap[oldDefId] ?? oldDefId;
                return { ...child, options: { ...child.options, defId: newDefId } };
            }
            return child;
        });
    }

    const { setDef } = useGroupDefsStore.getState();
    for (const [oldId, children] of Object.entries(importedDefs)) {
        setDef(idMap[oldId], remapChildren(children));
    }

    const newRootDefId = idMap[config.options.defId as string] ?? (config.options.defId as string);
    return { ...config, options: { ...config.options, defId: newRootDefId } };
}

// ── Tab export / import ───────────────────────────────────────────────────────

export function exportTab(tab: Tab, anon?: AnonymizeOptions) {
    const allDefs = useGroupDefsStore.getState().defs;
    const groupDefs: Record<string, WidgetConfig[]> = {};
    collectGroupDefs(tab.widgets, allDefs, groupDefs);

    const payload = {
        _type: 'aura-tab' as const,
        _version: 1,
        tab,
        ...(Object.keys(groupDefs).length > 0 ? { groupDefs } : {}),
    };

    downloadJson(payload, 'aura-tab', tab.name, anon);
}

/**
 * Parses and validates a tab import file.
 * Remaps all widget IDs and groupDef IDs to fresh values,
 * registers the groupDefs in the store, and returns the ready-to-add tab data.
 * Returns null if the file is not a valid aura-tab export.
 */
export function importTab(raw: unknown): Omit<Tab, 'id'> | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if (obj._type !== 'aura-tab' || !obj.tab) return null;
    const tab = obj.tab as Tab;
    if (!tab.name || !Array.isArray(tab.widgets)) return null;

    const importedDefs = (obj.groupDefs ?? {}) as Record<string, WidgetConfig[]>;

    const defIdMap: Record<string, string> = {};
    for (const oldId of Object.keys(importedDefs)) {
        defIdMap[oldId] = newGroupDefId();
    }

    function remapWidgets(widgets: WidgetConfig[]): WidgetConfig[] {
        return widgets.map((w) => {
            const newId = freshWidgetId();
            if ((w.type === 'group' || w.type === 'panels') && w.options?.defId) {
                const newDefId = defIdMap[w.options.defId as string] ?? (w.options.defId as string);
                return { ...w, id: newId, options: { ...w.options, defId: newDefId } };
            }
            return { ...w, id: newId };
        });
    }

    const { setDef } = useGroupDefsStore.getState();
    for (const [oldId, children] of Object.entries(importedDefs)) {
        setDef(defIdMap[oldId], remapWidgets(children as WidgetConfig[]));
    }

    const { name, slug, icon, hideLabel, disabled, conditions, badges, badgeAggregate } = tab;
    return {
        name,
        slug: slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        widgets: remapWidgets(tab.widgets),
        ...(icon ? { icon } : {}),
        ...(hideLabel !== undefined ? { hideLabel } : {}),
        ...(disabled !== undefined ? { disabled } : {}),
        ...(conditions ? { conditions } : {}),
        ...(badges ? { badges } : {}),
        ...(badgeAggregate ? { badgeAggregate } : {}),
    };
}

// ── groupDef remap helper (shared by section/layout import) ─────────────────────

/** Register imported groupDefs under fresh ids and return a widget-remapper that
 *  assigns fresh widget ids and rewrites group/panels defId references. */
function makeGroupDefRemapper(
    importedDefs: Record<string, WidgetConfig[]>,
): (widgets: WidgetConfig[]) => WidgetConfig[] {
    const defIdMap: Record<string, string> = {};
    for (const oldId of Object.keys(importedDefs)) {
        defIdMap[oldId] = newGroupDefId();
    }
    function remapWidgets(widgets: WidgetConfig[]): WidgetConfig[] {
        return widgets.map((w) => {
            const newId = freshWidgetId();
            if ((w.type === 'group' || w.type === 'panels') && w.options?.defId) {
                const newDefId = defIdMap[w.options.defId as string] ?? (w.options.defId as string);
                return { ...w, id: newId, options: { ...w.options, defId: newDefId } };
            }
            return { ...w, id: newId };
        });
    }
    const { setDef } = useGroupDefsStore.getState();
    for (const [oldId, children] of Object.entries(importedDefs)) {
        setDef(defIdMap[oldId], remapWidgets(children as WidgetConfig[]));
    }
    return remapWidgets;
}

// ── Section export / import ─────────────────────────────────────────────────────
//
// A section export carries a whole Section (all tabs, all widgets, per-section
// settings) plus the groupDefs referenced by any GROUP widget across its tabs.
// Import remaps every tab id, widget id and groupDef id to fresh values so the
// section can be added alongside existing ones without collisions.
//
// Legacy `aura-layout` exports (from before the Section level was introduced) are
// accepted here too, since a pre-v3 layout is field-compatible with a Section.

export function exportSection(section: Section, anon?: AnonymizeOptions) {
    const allDefs = useGroupDefsStore.getState().defs;
    const groupDefs: Record<string, WidgetConfig[]> = {};
    for (const tab of section.tabs) {
        collectGroupDefs(tab.widgets, allDefs, groupDefs);
    }
    const payload = {
        _type: 'aura-section' as const,
        _version: 1,
        section,
        ...(Object.keys(groupDefs).length > 0 ? { groupDefs } : {}),
    };
    downloadJson(payload, 'aura-section', section.name, anon);
}

export function importSection(raw: unknown): Omit<Section, 'id'> | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    // Accept both the new section export and legacy layout exports.
    const src = (obj._type === 'aura-section' ? obj.section : obj._type === 'aura-layout' ? obj.layout : null) as
        | (Section & { defaultTabId?: string })
        | null;
    if (!src || !src.name || !Array.isArray(src.tabs)) return null;

    const remapWidgets = makeGroupDefRemapper((obj.groupDefs ?? {}) as Record<string, WidgetConfig[]>);

    const tsBase = Date.now();
    const tabs: Tab[] = src.tabs.map((tab, i) => ({
        ...tab,
        id: `tab-${tsBase}-${i}`,
        widgets: remapWidgets(tab.widgets),
    }));

    const defaultTabId =
        src.defaultTabId !== undefined
            ? (tabs[src.tabs.findIndex((t) => t.id === src.defaultTabId)]?.id ?? tabs[0]?.id)
            : undefined;

    return {
        name: src.name,
        slug: src.slug || src.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        tabs,
        activeTabId: tabs[0]?.id ?? '',
        ...(defaultTabId !== undefined ? { defaultTabId } : {}),
        ...(src.icon ? { icon: src.icon } : {}),
        ...(src.settings ? { settings: src.settings } : {}),
    };
}

// ── Layout export / import ────────────────────────────────────────────────────
//
// A full layout export carries the whole DashboardLayout (all sections → tabs →
// widgets) plus every referenced groupDef. Legacy `aura-layout` files (a single
// layout with tabs, pre-v3) are wrapped into one section on import.

export function exportLayout(layout: DashboardLayout, anon?: AnonymizeOptions) {
    const allDefs = useGroupDefsStore.getState().defs;
    const groupDefs: Record<string, WidgetConfig[]> = {};
    for (const section of layout.sections) {
        for (const tab of section.tabs) collectGroupDefs(tab.widgets, allDefs, groupDefs);
    }

    const payload = {
        _type: 'aura-layout' as const,
        _version: 2,
        layout,
        ...(Object.keys(groupDefs).length > 0 ? { groupDefs } : {}),
    };

    downloadJson(payload, 'aura-layout', layout.name, anon);
}

/**
 * Parses and validates a layout import file. Remaps all groupDef ids, tab ids and
 * widget ids to fresh values, registers the groupDefs in the store, and returns
 * the ready-to-add layout data (id assigned by the store). Accepts both the new
 * (sections[]) and legacy (tabs[]) layout export shapes.
 * Returns null if the file is not a valid aura-layout export.
 */
export function importLayout(raw: unknown): Omit<DashboardLayout, 'id'> | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if (obj._type !== 'aura-layout' || !obj.layout) return null;
    const layout = obj.layout as DashboardLayout & { tabs?: Tab[]; activeTabId?: string };
    if (!layout.name) return null;

    const remapWidgets = makeGroupDefRemapper((obj.groupDefs ?? {}) as Record<string, WidgetConfig[]>);
    const tsBase = Date.now();

    // Legacy layout (tabs[]) → wrap into a single section.
    const srcSections: Section[] = Array.isArray(layout.sections)
        ? layout.sections
        : [
              {
                  id: `section-${tsBase}`,
                  name: layout.name,
                  slug: 'default',
                  tabs: layout.tabs ?? [],
                  activeTabId: layout.activeTabId ?? layout.tabs?.[0]?.id ?? 'default',
                  defaultTabId: (layout as { defaultTabId?: string }).defaultTabId,
                  icon: layout.icon,
                  settings: layout.settings,
              },
          ];

    const sections: Section[] = srcSections.map((sec, si) => {
        const tabs: Tab[] = sec.tabs.map((tab, ti) => ({
            ...tab,
            id: `tab-${tsBase}-${si}-${ti}`,
            widgets: remapWidgets(tab.widgets),
        }));
        const defaultTabId =
            sec.defaultTabId !== undefined
                ? (tabs[sec.tabs.findIndex((t) => t.id === sec.defaultTabId)]?.id ?? tabs[0]?.id)
                : undefined;
        return {
            ...sec,
            id: `section-${tsBase}-${si}`,
            tabs,
            activeTabId: tabs[0]?.id ?? '',
            ...(defaultTabId !== undefined ? { defaultTabId } : {}),
        };
    });

    return {
        name: layout.name,
        slug: layout.slug || layout.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        sections,
        activeSectionId: sections[0]?.id ?? '',
        ...(layout.icon ? { icon: layout.icon } : {}),
        ...(layout.settings ? { settings: layout.settings } : {}),
    };
}

// ── Popup-view export / import ────────────────────────────────────────────────
//
// Export emits the raw PopupView shape (no wrapper). The same JSON can be
// dropped into src-vis/data/builtinPopups/ to ship as a default for all
// installations — see data/builtinPopups/README.md.
//
// Import always creates a fresh custom view (new id, new widget ids). Built-in
// slot ids cannot be overwritten via import; that path is reserved for the
// adapter-update / version-migration mechanism in popupConfigStore.

export function exportPopupView(view: PopupView, anon?: AnonymizeOptions) {
    const payload: PopupView = {
        id: view.id,
        name: view.name,
        ...(view.version !== undefined ? { version: view.version } : {}),
        ...(view.autoCloseSec !== undefined ? { autoCloseSec: view.autoCloseSec } : {}),
        widgets: view.widgets,
    };

    downloadJson(payload, 'aura-popup', view.name, anon);
}

/**
 * Parses a JSON payload and returns a ready-to-add PopupView with fresh
 * id and fresh widget ids. Returns null if the shape isn't a popup view.
 */
export function importPopupView(raw: unknown): PopupView | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    // Reject tab/widget shapes
    if (obj._type === 'aura-tab') return null;
    if (typeof obj.type === 'string') return null;
    // Require popup-view shape
    if (typeof obj.name !== 'string') return null;
    if (!Array.isArray(obj.widgets)) return null;

    const newId = `pv-${Date.now()}`;
    const tsBase = Date.now();
    const widgets = (obj.widgets as WidgetConfig[]).map((w, i) => ({
        ...w,
        id: `pw-${tsBase}-${i}`,
    }));

    const view: PopupView = {
        id: newId,
        name: obj.name,
        widgets,
        ...(typeof obj.autoCloseSec === 'number' ? { autoCloseSec: obj.autoCloseSec } : {}),
    };
    return view;
}
