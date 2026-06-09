import { useDashboardStore, type LayoutSettings } from '../../../../store/dashboardStore';
import { useConfigStore, type FrontendSettings } from '../../../../store/configStore';

type SharedKey = keyof LayoutSettings & keyof FrontendSettings;

export function useLayoutSetting(contextId: string | null) {
    const { frontend, updateFrontend } = useConfigStore();
    const layouts = useDashboardStore((s) => s.layouts);
    const updateLayoutSettings = useDashboardStore((s) => s.updateLayoutSettings);
    const clearLayoutSettings = useDashboardStore((s) => s.clearLayoutSettings);

    const ls = contextId ? layouts.find((l) => l.id === contextId)?.settings : undefined;

    function eff<K extends SharedKey>(key: K): [FrontendSettings[K], boolean] {
        const ov = ls?.[key];
        return [(ov !== undefined ? ov : frontend[key]) as FrontendSettings[K], contextId !== null && ov !== undefined];
    }

    function set<K extends SharedKey>(key: K, v: FrontendSettings[K]) {
        if (!contextId) updateFrontend({ [key]: v } as Partial<FrontendSettings>);
        else updateLayoutSettings(contextId, { [key]: v } as Partial<LayoutSettings>);
    }

    function clear(key: keyof LayoutSettings) {
        if (contextId) clearLayoutSettings(contextId, key);
    }

    return { eff, set, clear, ls, frontend, updateFrontend, updateLayoutSettings };
}
