import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '../../../../store/themeStore';
import { useLayoutSetting } from '../shared/useLayoutSetting';
import { ResetDefaultsButton } from '../shared/ResetDefaultsButton';
import { InactiveNotice } from '../shared/InactiveNotice';
import { useThemeModeDp } from '../../../../hooks/useThemeModeDp';
import { BROWSER_SYNC_ANCHOR } from './BrowserThemeSyncSection';
import { THEMES, DEFAULT_THEME_ID, getTheme } from '../../../../themes';
import { useT } from '../../../../i18n';

interface ThemePresetSectionProps {
    contextId: string | null;
}

export function ThemePresetSection({ contextId }: ThemePresetSectionProps) {
    const t = useT();
    const navigate = useNavigate();
    const { themeId, applyThemePreset } = useThemeStore();
    const followBrowser = useThemeStore((s) => s.followBrowser);
    const browserDarkThemeId = useThemeStore((s) => s.browserDarkThemeId);
    const browserLightThemeId = useThemeStore((s) => s.browserLightThemeId);
    const { ls, setPatch, clear } = useLayoutSetting(contextId);
    const { mode, clear: clearMode } = useThemeModeDp();

    const effectiveThemeId = ls?.themeId ?? themeId;
    const canReset = contextId ? ls?.themeId !== undefined : themeId !== DEFAULT_THEME_ID;

    // While the theme follows the browser, the picked preset is overwritten on
    // every page load — say so and point at the switch instead of letting the
    // user click a choice that never shows up in the frontend (#573).
    const jumpToBrowserSync = () => {
        if (contextId) navigate('/admin/design?ctx=global&tab=theme');
        window.setTimeout(
            () => document.getElementById(BROWSER_SYNC_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
            contextId ? 120 : 0,
        );
    };

    // A dark/light-mode datapoint replaces designs of the opposite brightness
    // (a dark design stays put in dark mode) — only worth mentioning while the
    // selected design actually clashes with the mode.
    const modeTheme = mode === 'dark' ? getTheme(browserDarkThemeId) : getTheme(browserLightThemeId);
    const modeClashes = mode !== null && getTheme(effectiveThemeId).dark !== (mode === 'dark');

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
            {followBrowser && (
                <InactiveNotice
                    text={t('theme.preset.browserActive')}
                    actionLabel={t('theme.preset.browserAction')}
                    onAction={jumpToBrowserSync}
                />
            )}
            {!followBrowser && modeClashes && (
                <InactiveNotice
                    text={t(mode === 'dark' ? 'theme.preset.modeDark' : 'theme.preset.modeLight', {
                        theme: modeTheme.name,
                    })}
                    actionLabel={t('theme.preset.modeAction')}
                    onAction={clearMode}
                />
            )}
            <div
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
                style={followBrowser ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
            >
                {THEMES.map((theme) => (
                    <button
                        key={theme.id}
                        disabled={followBrowser}
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
