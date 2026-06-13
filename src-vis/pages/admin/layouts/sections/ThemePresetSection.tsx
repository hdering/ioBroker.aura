import { useThemeStore } from '../../../../store/themeStore';
import { useDashboardStore } from '../../../../store/dashboardStore';
import { THEMES } from '../../../../themes';
import { useT } from '../../../../i18n';

interface ThemePresetSectionProps {
    contextId: string | null;
}

export function ThemePresetSection({ contextId }: ThemePresetSectionProps) {
    const t = useT();
    const { themeId, setTheme, resetCustom } = useThemeStore();
    const layouts = useDashboardStore((s) => s.layouts);
    const updateLayoutSettings = useDashboardStore((s) => s.updateLayoutSettings);
    const clearLayoutSettings = useDashboardStore((s) => s.clearLayoutSettings);

    const ls = contextId ? layouts.find((l) => l.id === contextId)?.settings : undefined;
    const effectiveThemeId = ls?.themeId ?? themeId;

    return (
        <div
            className="rounded-xl p-6"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('theme.preset.title')}
                </h2>
            </div>
            <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {t('theme.preset.desc')}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {THEMES.map((theme) => (
                    <button
                        key={theme.id}
                        onClick={() => {
                            if (!contextId) {
                                setTheme(theme.id);
                                resetCustom();
                            } else updateLayoutSettings(contextId, { themeId: theme.id, customVars: undefined });
                        }}
                        className="rounded-xl p-3 text-left transition-opacity hover:opacity-80 space-y-2.5"
                        style={{
                            // Always use the (opaque) admin surface so the theme name stays
                            // readable — transparent/glass theme surfaces rendered over the
                            // dark admin background made the labels invisible (#307).
                            background: 'var(--app-surface)',
                            border: `2px solid ${effectiveThemeId === theme.id ? 'var(--accent)' : 'var(--app-border)'}`,
                        }}
                    >
                        {/* Preview strip: the theme's own background + its palette dots */}
                        <div
                            className="flex items-center gap-1.5 rounded-lg px-2.5 h-9"
                            style={{
                                background: theme.vars['--app-bg'],
                                border: `1px solid ${theme.vars['--app-border']}`,
                            }}
                        >
                            {(['--widget-bg', '--accent', '--accent-green', '--accent-yellow'] as const).map((k) => (
                                <div
                                    key={k}
                                    className="w-3.5 h-3.5 rounded-full shrink-0"
                                    style={{
                                        background: theme.vars[k],
                                        border: `1px solid ${theme.vars['--app-border']}`,
                                    }}
                                />
                            ))}
                        </div>
                        <div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {theme.name}
                            </p>
                            {effectiveThemeId === theme.id && (
                                <p className="text-xs mt-0.5" style={{ color: 'var(--accent)' }}>
                                    {t('theme.preset.active')}
                                </p>
                            )}
                        </div>
                    </button>
                ))}
            </div>
            {contextId && ls?.themeId && (
                <button
                    onClick={() => clearLayoutSettings(contextId, 'themeId')}
                    className="mt-3 text-xs hover:opacity-70"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    ↩ Auf Global zurücksetzen
                </button>
            )}
        </div>
    );
}
