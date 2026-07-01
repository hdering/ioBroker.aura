import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { managedStorage } from './persistManager';
import type { TabBarSettings } from './dashboardStore';

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
    // Layout drawer (hamburger) — global toggle
    layoutDrawerEnabled: boolean;
    layoutDrawerSize: 'sm' | 'md' | 'lg';
    /** Floating button auto-hides; reveals near top edge (mouse) or top-touch (touch). */
    layoutDrawerAutoHide: boolean;
    /** When header is hidden: render hamburger as a floating top-left button, or inline in the TabBar. */
    layoutDrawerPlacement: 'floating' | 'tabbar';
    /** Drawer header title; empty falls back to the localized default ("Layouts"). */
    layoutDrawerTitle: string;
    /** How entries are shown in the drawer list. */
    layoutDrawerEntryStyle: 'iconAndName' | 'iconOnly' | 'nameOnly';
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
    guidelinesEnabled: false,
    guidelinesWidth: 1280,
    guidelinesHeight: 800,
    guidelinesShowInFrontend: false,
    layoutDrawerEnabled: false,
    layoutDrawerSize: 'md',
    layoutDrawerAutoHide: false,
    layoutDrawerPlacement: 'floating',
    layoutDrawerTitle: '',
    layoutDrawerEntryStyle: 'iconAndName',
    idleReturnEnabled: false,
    idleReturnDelay: 30,
    optimisticUpdates: true,
    superAdminKey: '',
    adminBaseUrl: '',
    batteryTypeOverrides: {},
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
                return {
                    ...current,
                    ...p,
                    frontend: { ...DEFAULT_FRONTEND, ...(p.frontend ?? {}) },
                    widgetDefaults: p.widgetDefaults ?? current.widgetDefaults,
                };
            },
        },
    ),
);
