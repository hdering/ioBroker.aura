import { useThemeStore } from '../../../../store/themeStore';
import { useAllThemes } from '../../../../hooks/useAllThemes';
import { useT } from '../../../../i18n';

/** Anchor id so other cards can point the user at this switch. */
export const BROWSER_SYNC_ANCHOR = 'browser-theme-sync';

export function BrowserThemeSyncSection() {
    const t = useT();
    const themes = useAllThemes();
    const {
        followBrowser,
        browserDarkThemeId,
        browserLightThemeId,
        setFollowBrowser,
        setBrowserDarkThemeId,
        setBrowserLightThemeId,
    } = useThemeStore();

    const selSty = {
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--app-border)',
        borderRadius: 8,
        padding: '4px 8px',
        fontSize: 12,
    };

    return (
        <div
            id={BROWSER_SYNC_ANCHOR}
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {t('theme.browserSync.title')}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {t('theme.browserSync.subtitle')}
                    </p>
                </div>
                <button
                    onClick={() => setFollowBrowser(!followBrowser)}
                    className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                    style={{ background: followBrowser ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                        style={{ left: followBrowser ? '18px' : '2px' }}
                    />
                </button>
            </div>
            {followBrowser && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--accent-yellow)' }}>
                    {t('theme.browserSync.overrides')}
                </p>
            )}
            {followBrowser && (
                <div className="flex gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            {t('theme.browserSync.darkTheme')}
                        </label>
                        <select
                            value={browserDarkThemeId}
                            style={selSty}
                            className="w-full focus:outline-none"
                            onChange={(e) => setBrowserDarkThemeId(e.target.value)}
                        >
                            {themes
                                .filter((th) => th.dark)
                                .map((th) => (
                                    <option key={th.id} value={th.id}>
                                        {th.name}
                                    </option>
                                ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-0">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            {t('theme.browserSync.lightTheme')}
                        </label>
                        <select
                            value={browserLightThemeId}
                            style={selSty}
                            className="w-full focus:outline-none"
                            onChange={(e) => setBrowserLightThemeId(e.target.value)}
                        >
                            {themes
                                .filter((th) => !th.dark)
                                .map((th) => (
                                    <option key={th.id} value={th.id}>
                                        {th.name}
                                    </option>
                                ))}
                        </select>
                    </div>
                </div>
            )}
        </div>
    );
}
