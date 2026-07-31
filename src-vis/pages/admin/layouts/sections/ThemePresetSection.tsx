import { useThemeStore } from '../../../../store/themeStore';
import { useLayoutSetting } from '../shared/useLayoutSetting';
import { ResetDefaultsButton } from '../shared/ResetDefaultsButton';
import { THEMES, DEFAULT_THEME_ID } from '../../../../themes';
import { useT } from '../../../../i18n';

interface ThemePresetSectionProps {
    contextId: string | null;
}

export function ThemePresetSection({ contextId }: ThemePresetSectionProps) {
    const t = useT();
    const { themeId, applyThemePreset } = useThemeStore();
    const { ls, setPatch, clear } = useLayoutSetting(contextId);

    const effectiveThemeId = ls?.themeId ?? themeId;
    const canReset = contextId ? ls?.themeId !== undefined : themeId !== DEFAULT_THEME_ID;

    return (
        <div
            className="rounded-xl p-6"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('theme.preset.title')}
                </h2>
                <ResetDefaultsButton
                    onReset={() => (contextId ? clear('themeId') : applyThemePreset(DEFAULT_THEME_ID))}
                    disabled={!canReset}
                    scoped={contextId !== null}
                />
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
                                applyThemePreset(theme.id);
                            } else setPatch({ themeId: theme.id, customVars: undefined });
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
        </div>
    );
}
