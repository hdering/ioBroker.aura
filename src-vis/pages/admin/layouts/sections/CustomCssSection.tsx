import { useLayoutSetting } from '../shared/useLayoutSetting';
import { LayoutContextSwitcher } from '../shared/LayoutContextSwitcher';
import { useDashboardStore } from '../../../../store/dashboardStore';
import { useT } from '../../../../i18n';

interface CustomCssSectionProps {
    contextId: string | null;
    onContextChange: (id: string | null) => void;
}

export function CustomCssSection({ contextId, onContextChange }: CustomCssSectionProps) {
    const t = useT();
    const { ls, updateFrontend, updateLayoutSettings } = useLayoutSetting(contextId);
    const clearLayoutSettings = useDashboardStore((s) => s.clearLayoutSettings);
    const { frontend } = useLayoutSetting(contextId);

    const cssEnabled = ls?.customCSSEnabled ?? frontend.customCSSEnabled ?? true;
    const cssInEditor = ls?.customCSSInEditor ?? frontend.customCSSInEditor ?? false;
    const cssValue = ls?.customCSS ?? frontend.customCSS ?? '';

    function setCss(patch: Partial<{ customCSS: string; customCSSEnabled: boolean; customCSSInEditor: boolean }>) {
        if (!contextId) updateFrontend(patch as never);
        else updateLayoutSettings(contextId, patch);
    }

    return (
        <div
            className="rounded-xl p-6"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('theme.css.title')}
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                    <LayoutContextSwitcher selectedId={contextId} onChange={onContextChange} />
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {t('theme.css.enabled')}
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={cssEnabled}
                            onClick={() => setCss({ customCSSEnabled: !cssEnabled })}
                            className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
                            style={{ background: cssEnabled ? 'var(--accent)' : 'var(--app-border)' }}
                        >
                            <span
                                className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform m-0.5"
                                style={{ transform: cssEnabled ? 'translateX(16px)' : 'translateX(0)' }}
                            />
                        </button>
                    </label>
                </div>
            </div>
            {contextId &&
                (ls?.customCSS !== undefined ||
                    ls?.customCSSEnabled !== undefined ||
                    ls?.customCSSInEditor !== undefined) && (
                    <div className="flex items-center justify-between mb-2">
                        <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                            style={{
                                background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                                color: 'var(--accent)',
                            }}
                        >
                            Layout-CSS aktiv
                        </span>
                        <button
                            onClick={() => {
                                clearLayoutSettings(contextId, 'customCSS');
                                clearLayoutSettings(contextId, 'customCSSEnabled');
                                clearLayoutSettings(contextId, 'customCSSInEditor');
                            }}
                            className="text-[10px] hover:opacity-70"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            ↩ Auf Global zurücksetzen
                        </button>
                    </div>
                )}
            <label
                className="flex items-center gap-2 cursor-pointer select-none mb-3 text-xs"
                style={{ color: 'var(--text-secondary)' }}
            >
                <button
                    type="button"
                    role="switch"
                    aria-checked={cssInEditor}
                    onClick={() => setCss({ customCSSInEditor: !cssInEditor })}
                    disabled={!cssEnabled}
                    className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40"
                    style={{ background: cssInEditor ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform m-0.5"
                        style={{ transform: cssInEditor ? 'translateX(16px)' : 'translateX(0)' }}
                    />
                </button>
                {t('theme.css.inEditor')}
            </label>
            <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                {t('theme.css.subtitle')}
            </p>
            <textarea
                value={cssValue}
                onChange={(e) => setCss({ customCSS: e.target.value })}
                disabled={!cssEnabled}
                rows={12}
                spellCheck={false}
                placeholder={`/* Beispiele */\n:root { --widget-radius: 0.5rem; }\n.widget-card { transition: transform 0.2s; }\n.widget-card:hover { transform: scale(1.02); }\n@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');\nbody { font-family: 'Inter', sans-serif; }`}
                className="w-full rounded-xl px-4 py-3 text-xs font-mono focus:outline-none resize-none disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--app-border)',
                    lineHeight: 1.7,
                }}
            />
            <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                {cssValue.trim()
                    ? t('theme.css.lines', { count: String(cssValue.split('\n').length) })
                    : t('theme.css.empty')}
            </p>
        </div>
    );
}
