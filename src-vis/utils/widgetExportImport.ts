import type { WidgetConfig } from '../types';
import type { Tab } from '../store/dashboardStore';
import type { PopupView } from '../store/popupConfigStore';
import { useGroupDefsStore, newGroupDefId } from '../store/groupDefsStore';

function collectGroupDefs(
  widgets: WidgetConfig[],
  allDefs: Record<string, WidgetConfig[]>,
  out: Record<string, WidgetConfig[]>,
): void {
  for (const w of widgets) {
    if (w.type === 'group' && w.options?.defId) {
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

export function exportWidget(config: WidgetConfig) {
  const payload: Record<string, unknown> = { ...config };

  if (config.type === 'group' && config.options?.defId) {
    const allDefs = useGroupDefsStore.getState().defs;
    const groupDefs: Record<string, WidgetConfig[]> = {};
    collectGroupDefs([config], allDefs, groupDefs);
    if (Object.keys(groupDefs).length > 0) {
      payload.groupDefs = groupDefs;
    }
  }

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aura-widget-${config.type}-${(config.title || config.id).replace(/[^a-z0-9]/gi, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Remaps all defIds from the imported groupDefs to fresh IDs, loads them into
 * the store, and returns the config updated with the new root defId.
 */
export function importGroupDefs(
  config: WidgetConfig,
  importedDefs: Record<string, WidgetConfig[]>,
): WidgetConfig {
  if (!config.options?.defId || Object.keys(importedDefs).length === 0) return config;

  const idMap: Record<string, string> = {};
  for (const oldId of Object.keys(importedDefs)) {
    idMap[oldId] = newGroupDefId();
  }

  function remapChildren(children: WidgetConfig[]): WidgetConfig[] {
    return children.map((child) => {
      if (child.type === 'group' && child.options?.defId) {
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

export function exportTab(tab: Tab) {
  const allDefs = useGroupDefsStore.getState().defs;
  const groupDefs: Record<string, WidgetConfig[]> = {};
  collectGroupDefs(tab.widgets, allDefs, groupDefs);

  const payload = {
    _type: 'aura-tab' as const,
    _version: 1,
    tab,
    ...(Object.keys(groupDefs).length > 0 ? { groupDefs } : {}),
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aura-tab-${tab.name.replace(/[^a-z0-9]/gi, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
      if (w.type === 'group' && w.options?.defId) {
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

  const { name, slug, icon, hideLabel, disabled, conditions } = tab;
  return {
    name,
    slug: slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    widgets: remapWidgets(tab.widgets),
    ...(icon ? { icon } : {}),
    ...(hideLabel !== undefined ? { hideLabel } : {}),
    ...(disabled !== undefined ? { disabled } : {}),
    ...(conditions ? { conditions } : {}),
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

export function exportPopupView(view: PopupView) {
  const payload: PopupView = {
    id: view.id,
    name: view.name,
    ...(view.version !== undefined ? { version: view.version } : {}),
    ...(view.autoCloseSec !== undefined ? { autoCloseSec: view.autoCloseSec } : {}),
    widgets: view.widgets,
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aura-popup-${view.name.replace(/[^a-z0-9]/gi, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
