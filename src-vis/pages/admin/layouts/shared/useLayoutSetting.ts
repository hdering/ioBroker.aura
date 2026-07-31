import { useDashboardStore, type LayoutSettings } from '../../../../store/dashboardStore';
import { useConfigStore, DEFAULT_FRONTEND, type FrontendSettings } from '../../../../store/configStore';
import { useEffectiveSettings } from '../../../../hooks/useEffectiveSettings';

type SharedKey = keyof LayoutSettings & keyof FrontendSettings;

/** Structural compare — settings values are plain JSON (numbers, strings, objects, arrays). */
function sameValue(a: unknown, b: unknown) {
    return a === b || JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Reads/writes a design setting at one of three scopes, chosen by `contextId`:
 *   - `null`        → global (configStore.frontend)
 *   - a layout id   → `layout.settings`   (per-layout override)
 *   - a section id  → `section.settings`  (parent layout resolved internally)
 *
 * Reads fall back through the cascade parent (section → layout → global,
 * layout → global) so an unset value shows the inherited effective value, and
 * the returned "overridden" flag is true only when *this* scope sets the key.
 */
export function useLayoutSetting(contextId: string | null) {
    const { frontend, updateFrontend } = useConfigStore();
    const layouts = useDashboardStore((s) => s.layouts);
    const updateLayoutSettings = useDashboardStore((s) => s.updateLayoutSettings);
    const clearLayoutSettings = useDashboardStore((s) => s.clearLayoutSettings);
    const updateSectionSettings = useDashboardStore((s) => s.updateSectionSettings);
    const clearSectionSettings = useDashboardStore((s) => s.clearSectionSettings);

    // Resolve the context id to a scope level and locate its settings object.
    let level: 'global' | 'layout' | 'section' = 'global';
    let layoutId: string | undefined;
    let sectionId: string | undefined;
    let ls: LayoutSettings | undefined;
    if (contextId) {
        const asLayout = layouts.find((l) => l.id === contextId);
        if (asLayout) {
            level = 'layout';
            layoutId = asLayout.id;
            ls = asLayout.settings;
        } else {
            for (const l of layouts) {
                const sec = l.sections.find((x) => x.id === contextId);
                if (sec) {
                    level = 'section';
                    layoutId = l.id;
                    sectionId = sec.id;
                    ls = sec.settings;
                    break;
                }
            }
        }
    }

    // Inherited base = effective settings of the parent scope. A section inherits
    // from its layout (global → layout); a layout / global inherits from global.
    const inherited = useEffectiveSettings(level === 'section' ? layoutId : undefined);

    function eff<K extends SharedKey>(key: K): [FrontendSettings[K], boolean] {
        const ov = ls?.[key];
        const base = level === 'global' ? frontend[key] : inherited[key];
        return [(ov !== undefined ? ov : base) as FrontendSettings[K], level !== 'global' && ov !== undefined];
    }

    function set<K extends SharedKey>(key: K, v: FrontendSettings[K]) {
        setPatch({ [key]: v } as Partial<LayoutSettings>);
    }

    /** Apply a multi-key patch to the current scope. */
    function setPatch(patch: Partial<LayoutSettings>) {
        if (level === 'section' && layoutId && sectionId) updateSectionSettings(layoutId, sectionId, patch);
        else if (level === 'layout' && layoutId) updateLayoutSettings(layoutId, patch);
        else updateFrontend(patch as Partial<FrontendSettings>);
    }

    function clear(key: keyof LayoutSettings) {
        if (level === 'section' && layoutId && sectionId) clearSectionSettings(layoutId, sectionId, key);
        else if (level === 'layout' && layoutId) clearLayoutSettings(layoutId, key);
    }

    /**
     * "Auf Standard" for a group of keys: at global scope the shipped defaults are
     * written back, at layout/section scope this scope's overrides are dropped so
     * the values inherit again.
     */
    function resetKeys(keys: readonly (keyof LayoutSettings)[]) {
        if (level !== 'global') {
            keys.forEach((k) => clear(k));
            return;
        }
        const defaults = DEFAULT_FRONTEND as unknown as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        for (const k of keys) {
            if (k in defaults) patch[k] = defaults[k];
        }
        updateFrontend(patch as Partial<FrontendSettings>);
    }

    /** True when `resetKeys` would actually change something (drives the button's disabled state). */
    function isDirty(keys: readonly (keyof LayoutSettings)[]) {
        if (level !== 'global') return keys.some((k) => ls?.[k] !== undefined);
        const defaults = DEFAULT_FRONTEND as unknown as Record<string, unknown>;
        const current = frontend as unknown as Record<string, unknown>;
        return keys.some((k) => k in defaults && !sameValue(current[k], defaults[k]));
    }

    return { eff, set, setPatch, clear, resetKeys, isDirty, ls, layoutId, sectionId, level, frontend, updateFrontend };
}
