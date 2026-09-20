import { Suspense } from 'react';
import type { CSSProperties } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { WidgetConfig, ClickAction } from '../../../types';
import { getWidgetMap } from '../widgetMap';
import { useDashboardStore } from '../../../store/dashboardStore';
import { useConfigStore } from '../../../store/configStore';
import { useWidgetRefreshNonce } from '../../../store/widgetRefreshStore';
import { useResolvedTitle } from '../DynamicTitle';
import { DEFAULT_POPUP_PADDING } from '../../../store/popupConfigStore';
import { resolveDualDeep, restoreDualDeep } from '../../../utils/dualColor';
import { useIsDarkTheme } from '../../../contexts/BrightnessContext';

interface Props {
    widget: WidgetConfig;
    action: Extract<ClickAction, { kind: 'popup-widget' }>;
    allWidgets: WidgetConfig[];
    /** Inner padding in px, resolved by WidgetClickPopup (issue #621). */
    padding?: number;
}

export function WidgetEmbedBody({ widget, action, allWidgets, padding = DEFAULT_POPUP_PADDING }: Props) {
    const updateWidget = useDashboardStore((s) => s.updateWidget);
    // Grid pitch — read here (before any early return) so the hook order stays stable.
    const cellSize = useConfigStore((s) => s.frontend.gridRowHeight ?? 80);
    const gridGap = useConfigStore((s) => s.frontend.gridGap ?? 10);
    const targetId = action.widgetId;
    const target: WidgetConfig = targetId ? (allWidgets.find((w) => w.id === targetId) ?? widget) : widget;
    // `[[dp]]` in the title resolves at every render boundary (same as WidgetFrame).
    const resolvedTitle = useResolvedTitle(target.title);
    // Follows the *source* widget's reload rules — this is the same widget, embedded.
    // Read before the early returns below so the hook order stays stable (issue #537).
    const refreshNonce = useWidgetRefreshNonce(target.id);
    // Light/dark colour pairs (#689): the embed renders the widget without a
    // WidgetFrame, which is where they are normally collapsed. Also read before
    // the early returns, for the same hook-order reason.
    const dark = useIsDarkTheme();

    if (targetId && !allWidgets.find((w) => w.id === targetId)) {
        return (
            <div
                className="flex flex-col items-center justify-center h-48 gap-2"
                style={{ color: 'var(--text-secondary)' }}
            >
                <AlertTriangle size={24} style={{ color: 'var(--accent-red, #ef4444)' }} />
                <span className="text-sm">Ziel-Widget existiert nicht mehr</span>
                <span className="text-xs opacity-60 font-mono">{targetId}</span>
            </div>
        );
    }

    const wm = getWidgetMap();
    const Widget = wm[target.type as keyof typeof wm];

    if (!Widget) {
        return (
            <div
                className="flex flex-col items-center justify-center h-48 gap-2"
                style={{ color: 'var(--text-secondary)' }}
            >
                <AlertTriangle size={24} />
                <span className="text-sm">Unbekannter Widget-Typ: {target.type}</span>
            </div>
        );
    }

    const embedConfig: WidgetConfig = resolveDualDeep(
        {
            ...target,
            title: resolvedTitle,
            gridPos: { x: 0, y: 0, w: 6, h: 6 },
        },
        dark,
    );

    // Honour the click-action's configured popup size so the embedded widget fills
    // the popup instead of collapsing to the 500px default. The outer popup shell
    // (WidgetClickPopup) already clamps its own box to popupWidth/Height; we subtract
    // a little chrome (scrollbar gutter + header) so no extra scrollbar appears.
    const popupWidth = widget.options?.popupWidth as number | undefined;
    const popupHeight = widget.options?.popupHeight as number | undefined;

    // Without an explicit popup size, fall back to the target widget's own designed
    // pixel size (grid columns/rows × dashboard pitch) instead of a flat 500px box.
    // This keeps wide widgets — notably groups, whose column count is derived from
    // the rendered width — from re-squeezing their children when no popupWidth is set.
    // Small widgets still get the comfortable 500px minimum via max().
    const EMBED_PAD = 2 * padding; // this box's own padding on both sides
    const naturalW = target.gridPos.w * (cellSize + gridGap) - gridGap + EMBED_PAD;
    const naturalH = target.gridPos.h * (cellSize + gridGap) - gridGap + EMBED_PAD;

    // A widget that opts into transparency (e.g. a group used purely as a click-action
    // container) must keep its transparent look inside the popup too. Without this the
    // wrapper's opaque --widget-bg + border overrides it, unlike the dashboard/tab view
    // (mirrors cardStyleFor in TabEmbedBody).
    const isTransparent = !!target.options?.transparent;
    const strength = isTransparent ? Math.max(0, Math.min(100, Number(target.options?.transparency ?? 100))) : 100;
    const cardStyle: CSSProperties = isTransparent
        ? {
              background:
                  strength >= 100
                      ? 'transparent'
                      : `color-mix(in srgb, var(--widget-bg) ${100 - strength}%, transparent)`,
          }
        : {
              background: 'var(--widget-bg)',
              borderRadius: 'var(--widget-radius)',
              border: '1px solid var(--app-border)',
          };

    return (
        <div
            style={{
                width: popupWidth
                    ? `min(calc(100vw - 40px), ${popupWidth - 24}px)`
                    : `min(90vw, ${Math.max(500, naturalW)}px)`,
                height: popupHeight
                    ? `min(calc(85vh - 56px), ${popupHeight - 40}px)`
                    : `min(85vh, ${Math.max(500, naturalH)}px)`,
                padding,
                overflow: 'auto',
                ...cardStyle,
            }}
        >
            <Suspense fallback={<div className="h-full w-full" style={{ opacity: 0.3 }} />}>
                <Widget
                    key={`r${refreshNonce}`}
                    config={embedConfig}
                    editMode={false}
                    onConfigChange={(next) => {
                        // Persist only options — embedConfig overrides gridPos for the
                        // popup layout, so writing the whole config back would clobber
                        // the widget's real dashboard position. restoreDualDeep puts
                        // the light/dark pairs back: the body spreads the RESOLVED
                        // config, so without it the other half would be lost (#689).
                        updateWidget(target.id, { options: restoreDualDeep(next, target).options });
                    }}
                />
            </Suspense>
        </div>
    );
}
