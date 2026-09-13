import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '../../../../store/themeStore';
import { useLayoutSetting } from '../shared/useLayoutSetting';
import { ResetDefaultsButton } from '../shared/ResetDefaultsButton';
import { InactiveNotice } from '../shared/InactiveNotice';
import { BrightnessTabs } from '../shared/BrightnessTabs';
import { useThemeModeDp } from '../../../../hooks/useThemeModeDp';
import { useAllThemes } from '../../../../hooks/useAllThemes';
import { BROWSER_SYNC_ANCHOR } from './BrowserThemeSyncSection';
import { DEFAULT_THEME_ID, getTheme, isUserThemeId, type Theme } from '../../../../themes';
import { useT } from '../../../../i18n';

interface ThemePresetSectionProps {
    contextId: string | null;
}

export function ThemePresetSection({ contextId }: ThemePresetSectionProps) {
    const t = useT();
    const navigate = useNavigate();
    const themes = useAllThemes();
    const { themeId, applyThemePreset } = useThemeStore();
    const followBrowser = useThemeStore((s) => s.followBrowser);
    const browserDarkThemeId = useThemeStore((s) => s.browserDarkThemeId);
    const browserLightThemeId = useThemeStore((s) => s.browserLightThemeId);
    const setBrowserDarkThemeId = useThemeStore((s) => s.setBrowserDarkThemeId);
    const setBrowserLightThemeId = useThemeStore((s) => s.setBrowserLightThemeId);
    const { ls, setPatch, clear } = useLayoutSetting(contextId);
    const { mode, clear: clearMode } = useThemeModeDp();

    // While the theme follows the browser, the global scope no longer picks ONE
    // design — it picks the pair. The grid stays usable and writes to whichever
    // half this tab shows (#640); before, it was greyed out and the pair could
    // only be changed through two dropdowns that offered built-ins only.
    const pairMode = followBrowser && contextId === null;
    const [pairScope, setPairScope] = useState<'light' | 'dark'>(() =>
        window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    );

    const effectiveThemeId = pairMode
        ? pairScope === 'dark'
            ? browserDarkThemeId
            : browserLightThemeId
        : (ls?.themeId ?? themeId);
    const canReset = contextId ? ls?.themeId !== undefined : themeId !== DEFAULT_THEME_ID;

    // A scoped override really is ignored while the browser sync runs — say so
    // and point at the switch instead of letting the user click a choice that
    // never shows up in the frontend (#573).
    const scopedAndInert = followBrowser && contextId !== null;
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

    // In pair mode only designs of the shown brightness can be picked — a light
    // theme as the dark half would make the sync a no-op.
    const shown: Theme[] = pairMode ? themes.filter((th) => th.dark === (pairScope === 'dark')) : themes;

    const pickTheme = (id: string) => {
        if (pairMode) {
            if (pairScope === 'dark') setBrowserDarkThemeId(id);
            else setBrowserLightThemeId(id);
            return;
        }
        if (!contextId) applyThemePreset(id);
        else setPatch({ themeId: id, customVars: undefined, customVarsLight: undefined, customVarsDark: undefined });
    };

    return (
        <div
            data-aura-theme-presets
            className="rounded-xl p-6"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('theme.preset.title')}
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                    {pairMode && (
                        <BrightnessTabs
                            value={pairScope}
                            onChange={(s) => setPairScope(s === 'dark' ? 'dark' : 'light')}
                            scopes={['light', 'dark']}
                        />
                    )}
                    {!pairMode && (
                        <ResetDefaultsButton
                            onReset={() => (contextId ? clear('themeId') : applyThemePreset(DEFAULT_THEME_ID))}
                            disabled={!canReset}
                            scoped={contextId !== null}
                        />
                    )}
                </div>
            </div>
            <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {pairMode ? t('theme.preset.pairDesc') : t('theme.preset.desc')}
            </p>
            {scopedAndInert && (
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
                style={scopedAndInert ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
            >
                {shown.map((theme) => (
                    <button
                        key={theme.id}
                        data-aura-theme-preset={theme.id}
                        disabled={scopedAndInert}
                        onClick={() => pickTheme(theme.id)}
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
                            <p
                                className="text-sm font-semibold flex items-center gap-1.5"
                                style={{ color: 'var(--text-primary)' }}
                            >
                                <span className="truncate">{theme.name}</span>
                                {isUserThemeId(theme.id) && (
                                    <span
                                        className="text-[9px] px-1 py-0.5 rounded font-medium shrink-0"
                                        style={{
                                            background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                                            color: 'var(--accent)',
                                        }}
                                    >
                                        {t('theme.user.badge')}
                                    </span>
                                )}
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
