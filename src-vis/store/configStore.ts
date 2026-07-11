import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';
import type { TabBarSettings, LayoutMenuItem } from './dashboardStore';

export interface FrontendSettings {
    customCSS: string;
    customCSSEnabled: boolean;
    customCSSInEditor: boolean;
    customJS: string;
    customJSEnabled: boolean;
    customJSInEditor: boolean;
    showHeader: boolean;
    headerTitle: string;
    showConnectionBadge: boolean;
    showAdminLink: boolean;
    // Header clock
    headerClockEnabled: boolean;
    headerClockDisplay: 'time' | 'date' | 'datetime';
    headerClockShowSeconds: boolean;
    headerClockDateLength: 'short' | 'long';
    headerClockCustomFormat: string;
    // Header datapoint
    headerDatapoint: string;
    headerDatapointTemplate: string;
    gridRowHeight: number;
    gridSnapX: number;
    gridGap: number;
    widgetPadding: number;
    // Tab bar appearance & items — global defaults; layouts may override per-field
    tabBar: TabBarSettings;
    wizardMaxDatapoints: number;
    fontScale: number;
    mobileBreakpoint: number;
    language: 'de' | 'en';
    // Guidelines overlay
    guidelinesEnabled: boolean;
    guidelinesWidth: number;
    guidelinesHeight: number;
    guidelinesShowInFrontend: boolean;
    /** Show a live badge with the current device viewport resolution (window inner size). */
    guidelinesShowResolution: boolean;
    // Layout drawer (hamburger) — global toggle
    layoutDrawerEnabled: boolean;
    layoutDrawerSize: 'sm' | 'md' | 'lg';
    /** Floating button auto-hides; reveals near top edge (mouse) or top-touch (touch). */
    layoutDrawerAutoHide: boolean;
    /**
     * floating/tabbar: hamburger trigger opening an overlay (only when header is hidden).
     * sidebar: permanently docked left menu (no overlay), always visible — works with or without header.
     */
    layoutDrawerPlacement: 'floating' | 'tabbar' | 'sidebar';
    /** Width in px of the docked sidebar (placement='sidebar'). */
    layoutDrawerWidth: number;
    /** Top offset in px of the docked sidebar menu content (placement='sidebar'). */
    layoutDrawerTopOffset: number;
    /** Show the menu title/header row. */
    layoutDrawerShowTitle: boolean;
    /** Drawer header title; empty falls back to the localized default ("Layouts"). */
    layoutDrawerTitle: string;
    /** Extra space in px above the menu title row. */
    layoutDrawerTitleMarginTop: number;
    /** Extra space in px below the menu title row. */
    layoutDrawerTitleMarginBottom: number;
    /** How entries are shown in the drawer list. */
    layoutDrawerEntryStyle: 'iconAndName' | 'iconOnly' | 'nameOnly' | 'bulletAndName';
    /** Min height in px of each menu entry. */
    layoutDrawerEntryHeight: number;
    /** Selected-entry indicator style — mirrors the tab-bar indicator styles. */
    layoutDrawerIndicatorStyle: 'text' | 'underline' | 'filled' | 'pills';
    /** Entry text font size in px. */
    layoutDrawerFontSize: number;
    /** Entry icon size in px. */
    layoutDrawerIconSize: number;
    /** Extra elements (clock/datapoint/text) rendered above/below the layout list. */
    layoutDrawerItems: LayoutMenuItem[];
    // Idle return — auto-switch back to default tab after inactivity
    idleReturnEnabled: boolean;
    /** Seconds of inactivity before returning to the default tab. */
    idleReturnDelay: number;
    /**
     * Optimistic writes: reflect a setState locally the instant it is sent,
     * instead of waiting for ioBroker to push the change back. Fixes stale UI
     * for datapoints that never echo an ack:false write (e.g. plain
     * 0_userdata variables with no adapter). Default true.
     */
    optimisticUpdates: boolean;
    // Super-admin access (empty = feature disabled)
    superAdminKey: string;
    /**
     * Base URL prepended to relative ioBroker admin paths (e.g. "/meteoalarm.admin/icons/...")
     * encountered in JSON-rendered images. Empty → auto-derive from current host on port 8081.
     * Example: "http://192.168.188.168:8081"
     */
    adminBaseUrl: string;
    /**
     * Global per-device battery-type assignments (resolved deviceId → type + optional quantity).
     * Overrides library auto-detection. Edited on the Admin → Batterien page, read by the
     * Statusübersicht widget. A device's battery type is a property of the device, not of a widget.
     */
    batteryTypeOverrides: Record<string, { type: string; quantity?: number }>;
    /**
     * Battery devices to ignore everywhere (inventory, low-battery warnings, stats).
     * Stored as resolved device ids (same key as batteryTypeOverrides). For false
     * positives or devices the user does not want tracked. Managed on Admin → Batterien.
     */
    batteryHiddenDevices: string[];
    /**
     * Reachability escape hatch for the Statusübersicht widget (global, applies to all such
     * widgets). Extra datapoint id patterns (text or /regex/) to treat as offline indicators
     * when the built-in heuristic misses them; `offlineInvert` flips the semantics for those
     * DPs (value FALSE means offline).
     */
    offlineExtraPatterns: string;
    offlineInvert: boolean;
}

interface ConfigState {
    frontend: FrontendSettings;
    /** Per-type size overrides. If missing, the registry defaultW/H is used. */
    widgetDefaults: Record<string, { w: number; h: number }>;
    updateFrontend: (patch: Partial<FrontendSettings>) => void;
    setWidgetDefault: (type: string, w: number, h: number) => void;
    resetWidgetDefault: (type: string) => void;
}

export const DEFAULT_FRONTEND: FrontendSettings = {
    customCSS: '',
    customCSSEnabled: true,
    customCSSInEditor: false,
    customJS: '',
    customJSEnabled: false,
    customJSInEditor: false,
    showHeader: true,
    headerTitle: 'Aura',
    showConnectionBadge: true,
    showAdminLink: false,
    headerClockEnabled: false,
    headerClockDisplay: 'time',
    headerClockShowSeconds: false,
    headerClockDateLength: 'short',
    headerClockCustomFormat: '',
    headerDatapoint: '',
    headerDatapointTemplate: '',
    gridRowHeight: 20,
    gridSnapX: 20,
    gridGap: 10,
    widgetPadding: 16,
    tabBar: {},
    wizardMaxDatapoints: 500,
    fontScale: 1,
    mobileBreakpoint: 600,
    language: 'de',
    // Fresh installs show the guidelines + resolution readout in the frontend so
    // users immediately see their device's viewport size (with a dismissible hint
    // explaining how to switch it off). Existing installs keep their persisted
    // values — zustand-persist rehydration overrides these defaults.
    guidelinesEnabled: true,
    guidelinesWidth: 1280,
    guidelinesHeight: 800,
    guidelinesShowInFrontend: true,
    guidelinesShowResolution: true,
    layoutDrawerEnabled: false,
    layoutDrawerSize: 'md',
    layoutDrawerAutoHide: false,
    layoutDrawerPlacement: 'floating',
    layoutDrawerWidth: 240,
    layoutDrawerTopOffset: 0,
    layoutDrawerShowTitle: true,
    layoutDrawerTitle: '',
    layoutDrawerTitleMarginTop: 0,
    layoutDrawerTitleMarginBottom: 0,
    layoutDrawerEntryStyle: 'iconAndName',
    layoutDrawerEntryHeight: 48,
    layoutDrawerIndicatorStyle: 'filled',
    layoutDrawerFontSize: 14,
    layoutDrawerIconSize: 16,
    layoutDrawerItems: [],
    idleReturnEnabled: false,
    idleReturnDelay: 30,
    optimisticUpdates: true,
    superAdminKey: '',
    adminBaseUrl: '',
    batteryTypeOverrides: {},
    batteryHiddenDevices: [],
    offlineExtraPatterns: '',
    offlineInvert: false,
};

export const useConfigStore = create<ConfigState>()(
    persist(
        (set) => ({
            frontend: DEFAULT_FRONTEND,
            widgetDefaults: {},
            updateFrontend: (patch) => set((s) => ({ frontend: { ...s.frontend, ...patch } })),
            setWidgetDefault: (type, w, h) =>
                set((s) => ({ widgetDefaults: { ...s.widgetDefaults, [type]: { w, h } } })),
            resetWidgetDefault: (type) =>
                set((s) => {
                    const next = { ...s.widgetDefaults };
                    delete next[type];
                    return { widgetDefaults: next };
                }),
        }),
        {
            name: 'aura-config',
            storage: createJSONStorage(() => managedStorage),
            // Deep-merge persisted `frontend` onto DEFAULT_FRONTEND so configs saved
            // before a new setting was added still get its default (zustand's default
            // merge is shallow and would drop newly-added keys → undefined at runtime).
            merge: (persisted, current) => {
                const p = (persisted ?? {}) as Partial<ConfigState>;
                const pf: Partial<FrontendSettings> = p.frontend ?? {};
                const frontend = { ...DEFAULT_FRONTEND, ...pf };
                // The resolution badge is independent of the guideline lines and defaults ON,
                // but only for fresh installs. An existing install (persisted frontend present)
                // that predates this key must NOT get the badge switched on by the upgrade —
                // otherwise every existing client would suddenly show it. Absence of the key in
                // a persisted frontend = existing install → keep it off until explicitly enabled.
                if (p.frontend && pf.guidelinesShowResolution === undefined) {
                    frontend.guidelinesShowResolution = false;
                }
                return {
                    ...current,
                    ...p,
                    frontend,
                    widgetDefaults: p.widgetDefaults ?? current.widgetDefaults,
                };
            },
        },
    ),
);
