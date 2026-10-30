import { useCallback, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { WidgetConfig, ClickAction } from '../../../types';
import { getWidgetMap } from '../widgetMap';
import { useDashboardStore } from '../../../store/dashboardStore';
import { useConfigStore } from '../../../store/configStore';
import { DEFAULT_POPUP_PADDING } from '../../../store/popupConfigStore';
import { stripRenderOverrides } from '../../../utils/conditionSet';
import { WidgetFrame } from '../../layout/WidgetFrame';

interface Props {
    widget: WidgetConfig;
    action: Extract<ClickAction, { kind: 'popup-widget' }>;
    allWidgets: WidgetConfig[];
    /** Inner padding in px, resolved by WidgetClickPopup (issue #621). */
    padding?: number;
    /** Fullscreen: the widget fills the whole screen edge to edge — no padding, no card frame. */
    fill?: boolean;
}

/** An embedded widget is shown at least this large (its longer side, aspect kept). */
const EMBED_MIN_PX = 500;

const NO_REMOVE = () => undefined;

export function WidgetEmbedBody({ widget, action, allWidgets, padding = DEFAULT_POPUP_PADDING, fill = false }: Props) {
    // By id, not updateWidget: the target may sit on any tab, not the store's active one (#731).
    const updateWidgetById = useDashboardStore((s) => s.updateWidgetById);
    // Grid pitch — read here (before any early return) so the hook order stays stable.
    const cellSize = useConfigStore((s) => s.frontend.gridRowHeight ?? 80);
    const gridGap = useConfigStore((s) => s.frontend.gridGap ?? 10);
    const targetId = action.widgetId;
    const target: WidgetConfig = targetId ? (allWidgets.find((w) => w.id === targetId) ?? widget) : widget;
    // A widget whose click action shows itself would open the same popup again on
    // every click inside it — that action is the popup the user is already looking at.
    const shown = useMemo(() => {
        const own = target.options?.clickAction as ClickAction | undefined;
        if (own?.kind !== 'popup-widget' || (own.widgetId && own.widgetId !== target.id)) return target;
        return { ...target, options: { ...target.options, clickAction: { kind: 'none' } as ClickAction } };
    }, [target]);

    // The frame hands back the config it was given with dual colours, colour bindings
    // and render overrides already restored (#689, #747). Persist only options — the
    // widget's real dashboard position must not change. The trigger may arrive resolved
    // (device card, #845) — strip that against the stored widget so no `{{parent}}` is
    // overwritten.
    const persist = useCallback(
        (next: WidgetConfig) => {
            const stored = allWidgets.find((w) => w.id === target.id);
            const restored =
                shown === target
                    ? next
                    : { ...next, options: { ...next.options, clickAction: target.options?.clickAction } };
            updateWidgetById(target.id, {
                options: (stored && stored !== target ? stripRenderOverrides(restored, stored, target) : restored)
                    .options,
            });
        },
        [allWidgets, target, shown, updateWidgetById],
    );

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
    if (!wm[target.type as keyof typeof wm]) {
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

    // The same WidgetFrame as on the tab: card, own title/icon look, header items,
    // status row, conditions and style overrides all come with it.
    const frame = <WidgetFrame config={shown} editMode={false} onRemove={NO_REMOVE} onConfigChange={persist} />;

    // Fullscreen (WidgetClickPopup only sets this for a widget without a content height):
    // the widget is the screen — no designed box, padding or card frame around it.
    if (fill) {
        return (
            <div className="w-full h-full overflow-auto aura-popup-bare" data-aura-popup-fill="">
                {frame}
            </div>
        );
    }

    // Honour the click-action's configured popup size so the embedded widget fills
    // the popup. The outer popup shell (WidgetClickPopup) already clamps its own box to
    // popupWidth/Height; we subtract a little chrome (scrollbar gutter + header) so no
    // extra scrollbar appears.
    const popupWidth = widget.options?.popupWidth as number | undefined;
    const popupHeight = widget.options?.popupHeight as number | undefined;

    // Without an explicit popup size: the widget's designed pixel size (grid columns/
    // rows × dashboard pitch), scaled up — aspect kept — until its longer side reaches
    // EMBED_MIN_PX. Forcing both sides to the minimum turned a wide, flat widget into a
    // square and broke its layout (media player: the cover filled the box and pushed
    // title and controls out of it).
    const naturalW = target.gridPos.w * (cellSize + gridGap) - gridGap;
    const naturalH = target.gridPos.h * (cellSize + gridGap) - gridGap;
    const scale = Math.max(1, EMBED_MIN_PX / Math.max(naturalW, naturalH, 1));
    const boxW = Math.round(naturalW * scale) + 2 * padding;
    const boxH = Math.round(naturalH * scale) + 2 * padding;

    return (
        <div
            className="box-border"
            style={{
                width: popupWidth ? `min(calc(100vw - 40px), ${popupWidth - 24}px)` : `min(90vw, ${boxW}px)`,
                height: popupHeight ? `min(calc(85vh - 56px), ${popupHeight - 40}px)` : `min(85vh, ${boxH}px)`,
                padding,
                overflow: 'auto',
            }}
        >
            {frame}
        </div>
    );
}
