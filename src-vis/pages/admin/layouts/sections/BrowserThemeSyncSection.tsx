import { useThemeStore } from '../../../../store/themeStore';
import { THEMES } from '../../../../themes';

export function BrowserThemeSyncSection() {
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
            className="rounded-xl p-4 space-y-3"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Theme folgt Browser
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Wechselt automatisch je nach System-Einstellung (Hell/Dunkel)
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
                <div className="flex gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Dunkel-Theme
                        </label>
                        <select
                            value={browserDarkThemeId}
                            style={selSty}
                            className="w-full focus:outline-none"
                            onChange={(e) => setBrowserDarkThemeId(e.target.value)}
                        >
                            {THEMES.filter((t) => t.dark).map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-0">
                        <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                            Hell-Theme
                        </label>
                        <select
                            value={browserLightThemeId}
                            style={selSty}
                            className="w-full focus:outline-none"
                            onChange={(e) => setBrowserLightThemeId(e.target.value)}
                        >
                            {THEMES.filter((t) => !t.dark).map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}
        </div>
    );
}
