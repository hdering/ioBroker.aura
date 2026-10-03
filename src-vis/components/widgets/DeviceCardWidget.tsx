import { useCallback, useMemo } from 'react';
import type { WidgetConfig, WidgetProps } from '../../types';
import { GroupWidget } from './GroupWidget';
import { RenderTransformContext, RuntimeScopeContext } from '../../contexts/RenderTransformContext';
import { deviceCardColor, deviceCardTransform, deviceCardVars } from '../../utils/deviceCard';
import { subAll } from '../../utils/popupPlaceholders';
import { useDeviceCardShareCount } from '../../hooks/useDeviceCardShareCount';
import { useT } from '../../i18n';

/**
 * "Gerätekarte" (#743) — a group whose children are built once and reused for any
 * number of identical devices. The children use `{{dp}}`, `{{parent}}`, `{{name}}` …
 * and resolve against this card's datapoint; every copy of the card shares them
 * (same `options.defId`), so a change to the layout applies to all cards.
 *
 * The group machinery is reused as is: this component only puts two contexts
 * around GroupWidget. WidgetFrame reads them for every child — the transform for
 * the copy the body renders (the edit dialog keeps the placeholders), the scope
 * for the registries keyed by widget id (conditions, heights, reload, collapse).
 */
export function DeviceCardWidget(props: WidgetProps) {
    const { config, editMode, onConfigChange } = props;
    const t = useT();
    const vars = useMemo(() => deviceCardVars(config), [config]);
    // Stable while the resolved table is the same — a new transform remounts nothing,
    // but it re-derives every child's render config.
    const varsKey = JSON.stringify(vars);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const transform = useMemo(() => deviceCardTransform(vars, config.id), [varsKey, config.id]);

    // The card's own title may carry tokens as well ("{{name}}"). Only the rendered
    // copy is resolved; a write that hands it back unchanged keeps the raw one.
    const shownTitle = config.title ? subAll(config.title, vars) : config.title;
    const shown = useMemo<WidgetConfig>(
        () => (shownTitle === config.title ? config : { ...config, title: shownTitle }),
        [config, shownTitle],
    );
    const onShownChange = useCallback(
        (next: WidgetConfig) =>
            onConfigChange(
                next.title === shownTitle && shownTitle !== config.title ? { ...next, title: config.title } : next,
            ),
        [onConfigChange, shownTitle, config.title],
    );

    const defId = config.options?.defId as string | undefined;
    const shareCount = useDeviceCardShareCount(defId, editMode);
    // Editor only: linked cards share a colour (frame + badge), so it is visible
    // which cards belong together when several sets sit on one tab.
    const linked = editMode && shareCount > 1;
    const linkColor = deviceCardColor(defId);

    return (
        <div className="relative h-full w-full">
            <RuntimeScopeContext.Provider value={config.id}>
                <RenderTransformContext.Provider value={transform}>
                    <GroupWidget {...props} config={shown} onConfigChange={onShownChange} />
                </RenderTransformContext.Provider>
            </RuntimeScopeContext.Provider>
            {linked && (
                <div
                    className="aura-devicecard-link absolute inset-0 z-10 pointer-events-none"
                    style={{ border: `2px solid ${linkColor}`, borderRadius: 'var(--widget-radius)' }}
                    data-aura-devicecard-link={linkColor}
                />
            )}
            {linked && (
                <div
                    className="aura-devicecard-badge absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 leading-none px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap pointer-events-none"
                    style={{ background: linkColor, color: '#fff' }}
                    data-aura-devicecard-badge=""
                >
                    {shareCount === 2
                        ? t('devicecard.badge.sharedOne')
                        : t('devicecard.badge.shared', { count: shareCount - 1 })}
                </div>
            )}
        </div>
    );
}
