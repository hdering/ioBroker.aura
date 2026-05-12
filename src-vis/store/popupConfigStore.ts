import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';
import type { WidgetConfig, WidgetLayout } from '../types';

export interface PopupView {
  id: string;
  name: string;
  widgets: WidgetConfig[];
  // Per-view auto-close: undefined = inherit global, 0 = explicit off, >0 = seconds
  autoCloseSec?: number;
}

// ── Builtin predefined views ──────────────────────────────────────────────────
// Use {{dp}} as placeholder for the triggering widget's main datapoint.
// Stable IDs ensure ensureBuiltins() is idempotent across app updates.

function bw(
  id: string,
  type: WidgetConfig['type'],
  title: string,
  x: number, y: number, w: number, h: number,
  options: Record<string, unknown> = {},
): WidgetConfig {
  return { id, type, title, datapoint: '{{dp}}', gridPos: { x, y, w, h }, options };
}

export const BUILTIN_VIEWS: PopupView[] = [
  {
    id: 'pv-builtin-dimmer',
    name: 'Standard: Dimmer',
    widgets: [
      bw('pw-bi-dimmer-1', 'value',  'Helligkeit', 0, 0, 12, 3),
      bw('pw-bi-dimmer-2', 'dimmer', '',           0, 3, 12, 5),
    ],
  },
  {
    id: 'pv-builtin-thermostat',
    name: 'Standard: Thermostat',
    widgets: [
      bw('pw-bi-thermo-1', 'value',      'Temperatur', 0, 0, 12, 3),
      bw('pw-bi-thermo-2', 'thermostat', '',           0, 3, 12, 6, { setpointDp: '{{dp}}' }),
    ],
  },
  {
    id: 'pv-builtin-switch',
    name: 'Standard: Schalter',
    widgets: [
      bw('pw-bi-switch-1', 'switch', '', 0, 0, 12, 4),
    ],
  },
  {
    id: 'pv-builtin-shutter',
    name: 'Standard: Rolladen',
    widgets: [
      bw('pw-bi-shutter-1', 'value',   'Position', 0, 0, 12, 3),
      bw('pw-bi-shutter-2', 'shutter', '',          0, 3, 12, 6, {
        activityDp:  '{{activityDp}}',
        directionDp: '{{directionDp}}',
        stopDp:      '{{stopDp}}',
        batteryDp:   '{{batteryDp}}',
        unreachDp:   '{{unreachDp}}',
      }),
    ],
  },
  {
    id: 'pv-builtin-mediaplayer',
    name: 'Standard: Mediaplayer',
    widgets: [
      bw('pw-bi-media-1', 'mediaplayer', '', 0, 0, 12, 8),
    ],
  },
];

const BUILTIN_TYPE_DEFAULTS: Record<string, string> = {
  dimmer:      'pv-builtin-dimmer',
  thermostat:  'pv-builtin-thermostat',
  switch:      'pv-builtin-switch',
  shutter:     'pv-builtin-shutter',
  mediaplayer: 'pv-builtin-mediaplayer',
};

export const BUILTIN_VIEW_IDS = new Set(BUILTIN_VIEWS.map((v) => v.id));

// ── Store ─────────────────────────────────────────────────────────────────────

interface PopupConfigState {
  typeDefaults: Record<string, string>;              // WidgetType → viewId
  typeDefaultLayouts: Record<string, WidgetLayout[]>; // WidgetType → allowed layouts (empty = all)
  views: PopupView[];
  deletedBuiltinIds: string[];           // builtin IDs the user explicitly deleted
  removedBuiltinTypeDefaults: string[];  // builtin widget types whose default was explicitly removed
  // Global auto-close fallback: undefined = no auto-close, >0 = seconds
  globalAutoCloseSec?: number;

  // Type defaults
  setTypeDefault: (widgetType: string, viewId: string) => void;
  setTypeDefaultLayouts: (widgetType: string, layouts: WidgetLayout[]) => void;
  removeTypeDefault: (widgetType: string) => void;

  // Views
  addView: (name: string) => string;
  removeView: (viewId: string) => void;
  updateViewName: (viewId: string, name: string) => void;
  setViewAutoCloseSec: (viewId: string, sec: number | undefined) => void;
  addWidgetToView: (viewId: string, widget: WidgetConfig) => void;
  removeWidgetFromView: (viewId: string, widgetId: string) => void;
  updateWidgetInView: (viewId: string, widgetId: string, patch: Partial<WidgetConfig>) => void;

  // Global
  setGlobalAutoCloseSec: (sec: number | undefined) => void;

  // Builtins
  ensureBuiltins: () => void;
  restoreBuiltin: (viewId: string) => void;
  copyView: (sourceId: string) => string;
}

export const usePopupConfigStore = create<PopupConfigState>()(
  persist(
    (set) => ({
      typeDefaults: {},
      typeDefaultLayouts: {},
      views: [],
      deletedBuiltinIds: [],
      removedBuiltinTypeDefaults: [],
      globalAutoCloseSec: undefined,

      setTypeDefault: (widgetType, viewId) =>
        set((s) => ({ typeDefaults: { ...s.typeDefaults, [widgetType]: viewId } })),

      setTypeDefaultLayouts: (widgetType, layouts) =>
        set((s) => ({ typeDefaultLayouts: { ...s.typeDefaultLayouts, [widgetType]: layouts } })),

      removeTypeDefault: (widgetType) =>
        set((s) => {
          const next = { ...s.typeDefaults };
          delete next[widgetType];
          const nextLayouts = { ...s.typeDefaultLayouts };
          delete nextLayouts[widgetType];
          const isBuiltin = widgetType in BUILTIN_TYPE_DEFAULTS;
          return {
            typeDefaults: next,
            typeDefaultLayouts: nextLayouts,
            removedBuiltinTypeDefaults: isBuiltin && !s.removedBuiltinTypeDefaults.includes(widgetType)
              ? [...s.removedBuiltinTypeDefaults, widgetType]
              : s.removedBuiltinTypeDefaults,
          };
        }),

      addView: (name) => {
        const id = `pv-${Date.now()}`;
        set((s) => ({ views: [...s.views, { id, name, widgets: [] }] }));
        return id;
      },

      removeView: (viewId) =>
        set((s) => ({
          views: s.views.filter((v) => v.id !== viewId),
          typeDefaults: Object.fromEntries(
            Object.entries(s.typeDefaults).filter(([, vid]) => vid !== viewId),
          ),
          // Remember deleted builtins so ensureBuiltins doesn't re-add them
          deletedBuiltinIds: BUILTIN_VIEW_IDS.has(viewId)
            ? [...s.deletedBuiltinIds, viewId]
            : s.deletedBuiltinIds,
        })),

      updateViewName: (viewId, name) =>
        set((s) => ({
          views: s.views.map((v) => (v.id === viewId ? { ...v, name } : v)),
        })),

      setViewAutoCloseSec: (viewId, sec) =>
        set((s) => ({
          views: s.views.map((v) => (v.id === viewId ? { ...v, autoCloseSec: sec } : v)),
        })),

      setGlobalAutoCloseSec: (sec) => set({ globalAutoCloseSec: sec }),

      addWidgetToView: (viewId, widget) =>
        set((s) => ({
          views: s.views.map((v) =>
            v.id === viewId ? { ...v, widgets: [...v.widgets, widget] } : v,
          ),
        })),

      removeWidgetFromView: (viewId, widgetId) =>
        set((s) => ({
          views: s.views.map((v) =>
            v.id === viewId
              ? { ...v, widgets: v.widgets.filter((w) => w.id !== widgetId) }
              : v,
          ),
        })),

      updateWidgetInView: (viewId, widgetId, patch) =>
        set((s) => ({
          views: s.views.map((v) =>
            v.id === viewId
              ? { ...v, widgets: v.widgets.map((w) => (w.id === widgetId ? { ...w, ...patch } : w)) }
              : v,
          ),
        })),

      copyView: (sourceId) => {
        const newId = `pv-${Date.now()}`;
        set((s) => {
          const source = s.views.find((v) => v.id === sourceId)
                      ?? BUILTIN_VIEWS.find((v) => v.id === sourceId);
          if (!source) return s;
          const copy: PopupView = {
            id: newId,
            name: `${source.name} (Kopie)`,
            widgets: source.widgets.map((w, i) => ({ ...w, id: `pw-${Date.now()}-${i}` })),
          };
          return { views: [...s.views, copy] };
        });
        return newId;
      },

      ensureBuiltins: () =>
        set((s) => {
          const existingIds = new Set(s.views.map((v) => v.id));
          const deletedSet  = new Set(s.deletedBuiltinIds);
          const missingViews = BUILTIN_VIEWS.filter(
            (v) => !existingIds.has(v.id) && !deletedSet.has(v.id),
          );
          const removedTypeSet = new Set(s.removedBuiltinTypeDefaults);
          const defaultsToAdd: Record<string, string> = {};
          for (const [type, viewId] of Object.entries(BUILTIN_TYPE_DEFAULTS)) {
            if (!s.typeDefaults[type] && !deletedSet.has(viewId) && !removedTypeSet.has(type)) {
              defaultsToAdd[type] = viewId;
            }
          }
          if (missingViews.length === 0 && Object.keys(defaultsToAdd).length === 0) return s;
          return {
            views: [...s.views, ...missingViews],
            typeDefaults: { ...defaultsToAdd, ...s.typeDefaults },
          };
        }),

      restoreBuiltin: (viewId) =>
        set((s) => {
          const builtin = BUILTIN_VIEWS.find((v) => v.id === viewId);
          if (!builtin) return s;
          const defaultsToRestore: Record<string, string> = {};
          for (const [type, vid] of Object.entries(BUILTIN_TYPE_DEFAULTS)) {
            if (vid === viewId && !s.typeDefaults[type]) defaultsToRestore[type] = viewId;
          }
          const restoredTypes = Object.keys(defaultsToRestore);
          return {
            views: [...s.views, builtin],
            deletedBuiltinIds: s.deletedBuiltinIds.filter((id) => id !== viewId),
            typeDefaults: { ...defaultsToRestore, ...s.typeDefaults },
            removedBuiltinTypeDefaults: s.removedBuiltinTypeDefaults.filter((t) => !restoredTypes.includes(t)),
          };
        }),
    }),
    {
      name: 'aura-popup-config',
      storage: createJSONStorage(() => managedStorage),
      onRehydrateStorage: () => (state) => {
        state?.ensureBuiltins();
      },
    },
  ),
);
