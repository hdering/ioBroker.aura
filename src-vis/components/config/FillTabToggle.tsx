/**
 * FillTabToggle — "Fill tab" switch for embed-like widgets (iframe, image, slideshow).
 * The Dashboard renders a `fillTab` widget as an overlay over the whole tab area, a
 * popup view stretches it over the popup body (#865). Either way it only makes sense
 * as the single widget there: greyed out while others share the tab or view.
 */
import type { WidgetConfig } from '../../types';
import { useActiveSection } from '../../store/dashboardStore';
import { usePopupConfigStore } from '../../store/popupConfigStore';
import { useT } from '../../i18n';

interface Props {
    config: WidgetConfig;
    set: (patch: Record<string, unknown>) => void;
}

export function FillTabToggle({ config, set }: Props) {
    const t = useT();
    const section = useActiveSection();
    const popupView = usePopupConfigStore((s) => s.views.find((v) => v.widgets.some((w) => w.id === config.id)));
    const currentTab = section?.tabs.find((tab) => tab.widgets?.some((w) => w.id === config.id));
    const siblings = popupView?.widgets ?? currentTab?.widgets;
    const otherCount = (siblings?.length ?? 1) - 1;
    const isEnabled = !!config.options?.fillTab;
    const usable = otherCount === 0 || isEnabled;
    return (
        <div className="flex items-start justify-between gap-2" data-aura-fill-tab="">
            <div style={{ opacity: usable ? 1 : 0.5 }}>
                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    {t('cfg.fillTab')}
                </label>
                <p className="text-[10px]" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                    {!usable
                        ? t(popupView ? 'cfg.fillTabBlockedPopup' : 'cfg.fillTabBlocked', { n: otherCount })
                        : t(popupView ? 'cfg.fillTabHintPopup' : 'cfg.fillTabHint')}
                </p>
            </div>
            <button
                type="button"
                onClick={() => {
                    if (usable) set({ fillTab: isEnabled ? undefined : true });
                }}
                disabled={!usable}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: isEnabled ? 'var(--accent)' : 'var(--app-border)' }}
            >
                <span
                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                    style={{ left: isEnabled ? '18px' : '2px' }}
                />
            </button>
        </div>
    );
}
