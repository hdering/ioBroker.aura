import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage, withSuppressedDirty } from './persistManager';
import type { ClickAction, ConditionClause, WidgetConfig, WidgetLayout } from '../types';

/**
 * Popup appearance defaults. Both values are percentages and follow the same
 * semantics as the per-widget `transparency` option: 0 = fully opaque popup,
 * 100 = invisible. The dialog is clamped to MAX_POPUP_TRANSPARENCY so a popup
 * can never become completely unclickable-invisible.
 */
export const DEFAULT_POPUP_TRANSPARENCY = 0;
export const MAX_POPUP_TRANSPARENCY = 95;
/** Backdrop dim in percent black behind the popup — matches the historical rgba(0,0,0,.6). */
export const DEFAULT_BACKDROP_DIM = 60;

/** Percent input → stored value; empty (or garbage) clears the override back to "inherit". */
export function pctOrUndefined(raw: string): number | undefined {
    if (raw === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export interface PopupView {
    id: string;
    name: string;
    widgets: WidgetConfig[];
    // Per-view auto-close: undefined = inherit global, 0 = explicit off, >0 = seconds
    autoCloseSec?: number;
    // Per-view appearance: undefined = inherit the global setting (percent, 0-100)
    transparency?: number;
    backdropDim?: number;
    // Built-in shipping version. Bump in code when a built-in's contents change;
    // ensureBuiltins() then overwrites any persisted copy with a lower version.
    // Only meaningful for entries with an id from BUILTIN_VIEW_IDS.
    version?: number;
    // Creation timestamp (ms epoch) for user-created/imported/copied views.
    // Absent on built-ins and on views persisted before this field existed —
    // use viewCreatedAt() instead of reading it directly.
    createdAt?: number;
    // Set on a built-in as soon as the user changes anything about it. Such a
    // view is never overwritten by the version migration in ensureBuiltins() —
    // an update would otherwise silently throw the customisation away. The
    // "reset" button in Admin → Popups clears the flag and pulls the shipped
    // content on demand. Meaningless on custom views.
    userEdited?: boolean;
}

/**
 * A datapoint-driven popup rule: when `clause` turns true, the popup described by
 * `host.options.clickAction` opens — no widget click involved (issue #523).
 *
 * `host` is a *headless* WidgetConfig. Keeping the whole config (instead of just a
 * ClickAction) means ClickActionEditor edits it unchanged and WidgetClickPopup
 * renders it unchanged, so popupTitle / popupWidth / popupHeight /
 * popupAutoCloseSec and the `{{dp}}` substitution in popup views all work for
 * free. `host.datapoint` mirrors `clause.datapoint` so a single popup view can
 * serve many triggers via its `{{dp}}` placeholders.
 */
export interface PopupTrigger {
    id: string;
    name: string;
    enabled: boolean;
    clause: ConditionClause;
    host: WidgetConfig;
    /** Write `resetValue` back to the trigger DP after opening ("button mode"). */
    resetDp: boolean;
    /** Value written on reset. Empty/undefined = boolean false. */
    resetValue?: string;
    /** Close an open popup again as soon as the clause no longer matches. */
    closeOnFalse?: boolean;
    /** Restrict to these client ids (aura.0.clients.<id>). Empty/undefined = all clients. */
    clientIds?: string[];
    /** Restrict to one layout — and optionally one tab inside it. */
    layoutId?: string;
    tabId?: string;
    createdAt?: number;
}

export function newTriggerHost(): WidgetConfig {
    return {
        id: `ptw-${Date.now()}`,
        type: 'value',
        title: '',
        datapoint: '',
        gridPos: { x: 0, y: 0, w: 1, h: 1 },
        // A trigger only ever opens a popup; the navigation kinds need a click to
        // act on and would just render an empty overlay. Starts unconfigured
        // (no viewId) — the runtime skips a rule until a target is picked.
        options: { clickAction: { kind: 'popup-view', viewId: '' } satisfies ClickAction },
    };
}

/**
 * Creation time of a view for sorting purposes. Falls back to the timestamp
 * embedded in legacy `pv-<ms>` ids; built-ins sort as oldest.
 */
export function viewCreatedAt(view: PopupView): number {
    if (typeof view.createdAt === 'number') return view.createdAt;
    const m = /^pv-(\d+)$/.exec(view.id);
    return m ? Number(m[1]) : 0;
}

// ── Builtin predefined views ──────────────────────────────────────────────────
// Built-ins live as one JSON file per view under src-vis/data/builtinPopups/.
// To ship a new/updated built-in: drop a JSON file in that folder; Vite picks
// it up automatically at build time. See data/builtinPopups/README.md.
//
// JSON shape: { id, name, version, widgets[], autoCloseSec? }
//   - id: stable `pv-builtin-<slug>` — used as the migration slot.
//   - version: bump when shipping a content update; ensureBuiltins() then
//     overwrites any persisted copy with a lower version.
//   - widgets use `{{dp}}` (and similar) placeholders, replaced at popup-open.

const _builtinModules = import.meta.glob<PopupView>('../data/builtinPopups/*.json', { eager: true, import: 'default' });
export const BUILTIN_VIEWS: PopupView[] = Object.keys(_builtinModules)
    .sort()
    .map((k) => _builtinModules[k]);

const BUILTIN_TYPE_DEFAULTS: Record<string, string> = {
    dimmer: 'pv-builtin-dimmer',
    thermostat: 'pv-builtin-thermostat',
    switch: 'pv-builtin-switch',
    shutter: 'pv-builtin-shutter',
    mediaplayer: 'pv-builtin-mediaplayer',
};

export const BUILTIN_VIEW_IDS = new Set(BUILTIN_VIEWS.map((v) => v.id));
const BUILTIN_VIEW_BY_ID = new Map(BUILTIN_VIEWS.map((v) => [v.id, v] as const));

function freshBuiltin(viewId: string): PopupView | undefined {
    const code = BUILTIN_VIEW_BY_ID.get(viewId);
    if (!code) return undefined;
    return {
        ...code,
        widgets: code.widgets.map((w) => ({ ...w, gridPos: { ...w.gridPos }, options: { ...w.options } })),
    };
}

/**
 * Apply `fn` to the view with `viewId`. Editing a built-in also flags it as
 * user-edited so the next shipped-version bump leaves it alone instead of
 * discarding the customisation.
 */
function patchView(views: PopupView[], viewId: string, fn: (v: PopupView) => PopupView): PopupView[] {
    return views.map((v) => {
        if (v.id !== viewId) return v;
        const next = fn(v);
        return BUILTIN_VIEW_IDS.has(v.id) ? { ...next, userEdited: true } : next;
    });
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface PopupConfigState {
    typeDefaults: Record<string, string>; // WidgetType → viewId
    typeDefaultLayouts: Record<string, WidgetLayout[]>; // WidgetType → allowed layouts (empty = all)
    views: PopupView[];
    deletedBuiltinIds: string[]; // builtin IDs the user explicitly deleted
    removedBuiltinTypeDefaults: string[]; // builtin widget types whose default was explicitly removed
    // Global auto-close fallback: undefined = no auto-close, >0 = seconds
    globalAutoCloseSec?: number;
    // Global appearance fallback (percent): undefined = DEFAULT_POPUP_TRANSPARENCY / DEFAULT_BACKDROP_DIM
    globalPopupTransparency?: number;
    globalBackdropDim?: number;
    // Datapoint-driven popups (issue #523)
    triggers: PopupTrigger[];

    // Type defaults
    setTypeDefault: (widgetType: string, viewId: string) => void;
    setTypeDefaultLayouts: (widgetType: string, layouts: WidgetLayout[]) => void;
    removeTypeDefault: (widgetType: string) => void;

    // Views
    addView: (name: string) => string;
    addImportedView: (view: PopupView) => string;
    removeView: (viewId: string) => void;
    updateViewName: (viewId: string, name: string) => void;
    setViewAutoCloseSec: (viewId: string, sec: number | undefined) => void;
    setViewTransparency: (viewId: string, pct: number | undefined) => void;
    setViewBackdropDim: (viewId: string, pct: number | undefined) => void;
    addWidgetToView: (viewId: string, widget: WidgetConfig) => void;
    removeWidgetFromView: (viewId: string, widgetId: string) => void;
    updateWidgetInView: (viewId: string, widgetId: string, patch: Partial<WidgetConfig>) => void;

    // Global
    setGlobalAutoCloseSec: (sec: number | undefined) => void;
    setGlobalPopupTransparency: (pct: number | undefined) => void;
    setGlobalBackdropDim: (pct: number | undefined) => void;

    // DP triggers
    addTrigger: (name: string) => string;
    updateTrigger: (triggerId: string, patch: Partial<PopupTrigger>) => void;
    removeTrigger: (triggerId: string) => void;
    copyTrigger: (triggerId: string) => string;

    // Builtins
    ensureBuiltins: () => void;
    restoreBuiltin: (viewId: string) => void;
    resetBuiltin: (viewId: string) => void;
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
            globalPopupTransparency: undefined,
            globalBackdropDim: undefined,
            triggers: [],

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
                        removedBuiltinTypeDefaults:
                            isBuiltin && !s.removedBuiltinTypeDefaults.includes(widgetType)
                                ? [...s.removedBuiltinTypeDefaults, widgetType]
                                : s.removedBuiltinTypeDefaults,
                    };
                }),

            addView: (name) => {
                const id = `pv-${Date.now()}`;
                set((s) => ({ views: [...s.views, { id, name, widgets: [], createdAt: Date.now() }] }));
                return id;
            },

            addImportedView: (view) => {
                // Defensive: ensure built-in slot ids cannot be overwritten via import.
                const id = BUILTIN_VIEW_IDS.has(view.id) ? `pv-${Date.now()}` : view.id;
                const next: PopupView = {
                    ...view,
                    id,
                    // Custom views never carry a version; that field is reserved for built-ins.
                    version: undefined,
                    createdAt: Date.now(),
                };
                set((s) => ({ views: [...s.views, next] }));
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
                set((s) => ({ views: patchView(s.views, viewId, (v) => ({ ...v, name })) })),

            setViewAutoCloseSec: (viewId, sec) =>
                set((s) => ({ views: patchView(s.views, viewId, (v) => ({ ...v, autoCloseSec: sec })) })),

            setViewTransparency: (viewId, pct) =>
                set((s) => ({ views: patchView(s.views, viewId, (v) => ({ ...v, transparency: pct })) })),

            setViewBackdropDim: (viewId, pct) =>
                set((s) => ({ views: patchView(s.views, viewId, (v) => ({ ...v, backdropDim: pct })) })),

            setGlobalAutoCloseSec: (sec) => set({ globalAutoCloseSec: sec }),

            setGlobalPopupTransparency: (pct) => set({ globalPopupTransparency: pct }),

            setGlobalBackdropDim: (pct) => set({ globalBackdropDim: pct }),

            addTrigger: (name) => {
                const id = `pt-${Date.now()}`;
                set((s) => ({
                    triggers: [
                        ...s.triggers,
                        {
                            id,
                            name,
                            enabled: true,
                            // 'true' is the operator the issue asks for: DP goes true → popup opens.
                            clause: { datapoint: '', operator: 'true', value: '' },
                            host: newTriggerHost(),
                            resetDp: true,
                            createdAt: Date.now(),
                        },
                    ],
                }));
                return id;
            },

            updateTrigger: (triggerId, patch) =>
                set((s) => ({
                    triggers: s.triggers.map((t) => (t.id === triggerId ? { ...t, ...patch } : t)),
                })),

            removeTrigger: (triggerId) => set((s) => ({ triggers: s.triggers.filter((t) => t.id !== triggerId) })),

            copyTrigger: (triggerId) => {
                const newId = `pt-${Date.now()}`;
                set((s) => {
                    const source = s.triggers.find((t) => t.id === triggerId);
                    if (!source) return s;
                    return {
                        triggers: [
                            ...s.triggers,
                            {
                                ...source,
                                id: newId,
                                name: `${source.name} (Kopie)`,
                                clause: { ...source.clause },
                                host: { ...source.host, id: `ptw-${Date.now()}`, options: { ...source.host.options } },
                                clientIds: source.clientIds ? [...source.clientIds] : undefined,
                                createdAt: Date.now(),
                            },
                        ],
                    };
                });
                return newId;
            },

            addWidgetToView: (viewId, widget) =>
                set((s) => ({
                    views: patchView(s.views, viewId, (v) => ({ ...v, widgets: [...v.widgets, widget] })),
                })),

            removeWidgetFromView: (viewId, widgetId) =>
                set((s) => ({
                    views: patchView(s.views, viewId, (v) => ({
                        ...v,
                        widgets: v.widgets.filter((w) => w.id !== widgetId),
                    })),
                })),

            updateWidgetInView: (viewId, widgetId, patch) =>
                set((s) => ({
                    views: patchView(s.views, viewId, (v) => ({
                        ...v,
                        widgets: v.widgets.map((w) => (w.id === widgetId ? { ...w, ...patch } : w)),
                    })),
                })),

            copyView: (sourceId) => {
                const newId = `pv-${Date.now()}`;
                set((s) => {
                    const source =
                        s.views.find((v) => v.id === sourceId) ?? BUILTIN_VIEWS.find((v) => v.id === sourceId);
                    if (!source) return s;
                    const copy: PopupView = {
                        id: newId,
                        name: `${source.name} (Kopie)`,
                        widgets: source.widgets.map((w, i) => ({ ...w, id: `pw-${Date.now()}-${i}` })),
                        autoCloseSec: source.autoCloseSec,
                        transparency: source.transparency,
                        backdropDim: source.backdropDim,
                        createdAt: Date.now(),
                    };
                    return { views: [...s.views, copy] };
                });
                return newId;
            },

            ensureBuiltins: () =>
                set((s) => {
                    const existingIds = new Set(s.views.map((v) => v.id));
                    const deletedSet = new Set(s.deletedBuiltinIds);

                    // Migrate persisted built-ins whose shipped version has advanced.
                    // Aggressive policy: code wins, local edits are discarded.
                    let viewsChanged = false;
                    const migrated = s.views.map((v) => {
                        const code = BUILTIN_VIEW_BY_ID.get(v.id);
                        if (!code) return v;
                        const persistedVer = v.version ?? 0;
                        const codeVer = code.version ?? 1;
                        if (persistedVer < codeVer) {
                            viewsChanged = true;
                            // A built-in the user has customised keeps its content —
                            // only the version marker moves up, so the migration does
                            // not retry on every load. Admin → Popups → "reset" still
                            // pulls the new shipped content when the user wants it.
                            return v.userEdited ? { ...v, version: codeVer } : freshBuiltin(v.id)!;
                        }
                        return v;
                    });

                    const missingViews = BUILTIN_VIEWS.filter(
                        (v) => !existingIds.has(v.id) && !deletedSet.has(v.id),
                    ).map((v) => freshBuiltin(v.id)!);

                    const removedTypeSet = new Set(s.removedBuiltinTypeDefaults);
                    const defaultsToAdd: Record<string, string> = {};
                    for (const [type, viewId] of Object.entries(BUILTIN_TYPE_DEFAULTS)) {
                        if (!s.typeDefaults[type] && !deletedSet.has(viewId) && !removedTypeSet.has(type)) {
                            defaultsToAdd[type] = viewId;
                        }
                    }
                    if (!viewsChanged && missingViews.length === 0 && Object.keys(defaultsToAdd).length === 0) return s;
                    return {
                        views: [...migrated, ...missingViews],
                        typeDefaults: { ...defaultsToAdd, ...s.typeDefaults },
                    };
                }),

            restoreBuiltin: (viewId) =>
                set((s) => {
                    const builtin = freshBuiltin(viewId);
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
                        removedBuiltinTypeDefaults: s.removedBuiltinTypeDefaults.filter(
                            (t) => !restoredTypes.includes(t),
                        ),
                    };
                }),

            resetBuiltin: (viewId) =>
                set((s) => {
                    const builtin = freshBuiltin(viewId);
                    if (!builtin) return s;
                    return {
                        views: s.views.map((v) => (v.id === viewId ? builtin : v)),
                    };
                }),
        }),
        {
            name: 'aura-popup-config',
            storage: createJSONStorage(() => managedStorage),
            onRehydrateStorage: () => (state) => {
                // ensureBuiltins() is a purely local, code-derived normalisation — it
                // adds built-ins this bundle ships and migrates their version. It is
                // NOT a user edit, so it must not set the _dirty flag: dirty means
                // "this device has unsaved edits", which makes loadConfigFromIoBroker
                // skip the pull for aura-popup-config and makes the next save push
                // this device's frozen copy over everyone else's popups. A device
                // that then failed to complete one ACK'd write stayed marked forever
                // and silently rolled the popup config back on every admin open.
                withSuppressedDirty(() => state?.ensureBuiltins());
            },
        },
    ),
);
