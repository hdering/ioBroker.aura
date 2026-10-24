import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { WidgetConfig, ClickAction, PopupCountdownPosition } from '../../../types';
import { usePortalTarget } from '../../../contexts/PortalTargetContext';
import {
    usePopupConfigStore,
    DEFAULT_POPUP_TRANSPARENCY,
    MAX_POPUP_TRANSPARENCY,
    DEFAULT_BACKDROP_DIM,
    DEFAULT_POPUP_BACKGROUND,
    DEFAULT_POPUP_BORDER,
    DEFAULT_POPUP_PADDING,
    MAX_POPUP_PADDING,
} from '../../../store/popupConfigStore';
import { buildPopupSubMap, popupMainDp, subAll } from '../../../utils/popupPlaceholders';
import { useDpNameVars } from '../../../hooks/useDpNameVars';
import { DynamicTitle } from '../DynamicTitle';
import { DimmerPopupBody } from './DimmerPopupBody';
import { SwitchPopupBody } from './SwitchPopupBody';
import { ShutterPopupBody } from './ShutterPopupBody';
import { MediaplayerPopupBody } from './MediaplayerPopupBody';
import { ImagePopupBody } from './ImagePopupBody';
import { IframePopupBody } from './IframePopupBody';
import { JsonPopupBody } from './JsonPopupBody';
import { HtmlPopupBody } from './HtmlPopupBody';
import { WidgetEmbedBody } from './WidgetEmbedBody';
import { DeviceDpsBody } from './DeviceDpsBody';
import { TabEmbedBody } from './TabEmbedBody';
import { PopupCountdown } from './PopupCountdown';
import { BackgroundImageLayer, BG_IMAGE_HOST_STYLE } from '../../common/BackgroundImageLayer';
import { activeBgImage } from '../../../utils/backgroundImage';
import { useEscapeLayer } from '../../../utils/escapeStack';
import {
    MAX_POPUP_DEPTH,
    PopupLayerContext,
    usePopupLayer,
    type PopupContent,
    type PopupLayer,
} from '../../../contexts/PopupLayerContext';

function normalizeAction(action: ClickAction): ClickAction {
    switch (action.kind) {
        case 'popup-dimmer':
            return { kind: 'popup-view', viewId: 'pv-builtin-dimmer' };
        case 'popup-thermostat':
            return { kind: 'popup-view', viewId: 'pv-builtin-thermostat' };
        case 'popup-switch':
            return { kind: 'popup-view', viewId: 'pv-builtin-switch' };
        case 'popup-shutter':
            return { kind: 'popup-view', viewId: 'pv-builtin-shutter' };
        case 'popup-mediaplayer':
            return { kind: 'popup-view', viewId: 'pv-builtin-mediaplayer' };
        default:
            return action;
    }
}

/** Numeric option (percent or px) → clamped number; non-numeric/undefined falls back to `fallback`. */
function clampPct(value: number | undefined, max: number, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(max, n));
}

interface Props {
    widget: WidgetConfig;
    action: ClickAction;
    onClose: () => void;
    allWidgets?: WidgetConfig[];
    /** Overrides the popup heading — e.g. the carousel item's label so the popup
     *  shows the element name instead of the (shared) carousel widget name. */
    titleOverride?: string;
}

function getTitle(widget: WidgetConfig, action: ClickAction, titleOverride?: string): string {
    // The most-specific caller-supplied heading wins (per-element label).
    if (titleOverride) return titleOverride;
    const custom = widget.options?.popupTitle as string | undefined;
    if (custom) return custom;
    if (widget.title) return widget.title;
    switch (action.kind) {
        case 'popup-dimmer':
            return 'Dimmer';
        case 'popup-thermostat':
            return 'Thermostat';
        case 'popup-switch':
            return 'Schalter';
        case 'popup-shutter':
            return 'Rolladen';
        case 'popup-mediaplayer':
            return 'Mediaplayer';
        case 'popup-image':
            return 'Bild';
        case 'popup-iframe':
            return 'Webseite';
        case 'popup-json':
            return 'JSON';
        case 'popup-html':
            return 'HTML';
        case 'popup-widget':
            return 'Widget';
        case 'popup-dps':
            return 'Datenpunkte';
        case 'popup-view':
            return widget.title || '';
        default:
            return '';
    }
}

export function WidgetClickPopup(props: Props) {
    const parent = usePopupLayer();
    // Past the depth cap the topmost popup shows this one instead (issue #829).
    if (parent && parent.depth >= MAX_POPUP_DEPTH) return <ReplaceTopPopup layer={parent} content={props} />;
    return <PopupDialog {...props} />;
}

/** Hands its content to the topmost layer. That swap remounts the layer's body
 *  and with it whoever rendered this, so it fires once and never draws. */
function ReplaceTopPopup({ layer, content }: { layer: PopupLayer; content: PopupContent }) {
    const done = useRef(false);
    useEffect(() => {
        if (done.current) return;
        done.current = true;
        layer.replace(content);
    }, [layer, content]);
    return null;
}

function PopupDialog({ onClose, ...initial }: Props) {
    const parent = usePopupLayer();
    // Content swapped in by a popup opened past the depth cap (see ReplaceTopPopup);
    // `swaps` keys the body so the swapped-in view starts from a clean state.
    const [swapped, setSwapped] = useState<{ content: PopupContent; n: number } | null>(null);
    const { widget, action: rawAction, allWidgets = [], titleOverride } = swapped?.content ?? initial;
    const action = normalizeAction(rawAction);
    const layer = useMemo<PopupLayer>(
        () => ({
            depth: (parent?.depth ?? 0) + 1,
            closeAll: parent?.closeAll ?? onClose,
            replace: (content) => setSwapped((cur) => ({ content, n: (cur?.n ?? 0) + 1 })),
        }),
        [parent, onClose],
    );
    // Prefer the frontend container so the popup inherits per-layout scoped CSS vars.
    // Falls back to the portal target (admin context) or document.body.
    const adminTarget = usePortalTarget();
    const portalTarget = document.querySelector('[data-aura-app="frontend"]') ?? adminTarget;

    // Everything below resolves through the same three levels:
    // click action > popup-view setting > global default; undefined = inherit next level.
    const view = usePopupConfigStore((s) =>
        action.kind === 'popup-view' ? s.views.find((v) => v.id === action.viewId) : undefined,
    );

    // Auto-close. Tri-state: undefined = inherit, 0 = explicit off, >0 = seconds.
    const actionAutoClose = widget.options?.popupAutoCloseSec as number | undefined;
    const globalAutoClose = usePopupConfigStore((s) => s.globalAutoCloseSec);
    const effectiveAutoCloseSec = actionAutoClose ?? view?.autoCloseSec ?? globalAutoClose ?? 0;
    // Countdown corner, same three levels; only shown while an auto-close is pending.
    const globalCountdown = usePopupConfigStore((s) => s.globalAutoCloseCountdown);
    const countdownPos =
        (widget.options?.popupAutoCloseCountdown as PopupCountdownPosition | undefined) ??
        view?.autoCloseCountdown ??
        globalCountdown ??
        'off';
    const countdown = effectiveAutoCloseSec > 0 && countdownPos !== 'off' ? countdownPos : null;

    // Appearance, both in percent.
    const globalTransparency = usePopupConfigStore((s) => s.globalPopupTransparency);
    const globalBackdropDim = usePopupConfigStore((s) => s.globalBackdropDim);
    const transparency = clampPct(
        (widget.options?.popupTransparency as number | undefined) ?? view?.transparency ?? globalTransparency,
        MAX_POPUP_TRANSPARENCY,
        DEFAULT_POPUP_TRANSPARENCY,
    );
    const backdropDim = clampPct(
        (widget.options?.popupBackdropDim as number | undefined) ?? view?.backdropDim ?? globalBackdropDim,
        100,
        DEFAULT_BACKDROP_DIM,
    );

    // Surface colour (issue #611): same three levels, then the `--popup-bg` theme
    // var, then the historical `--app-surface`. A custom colour keeps the popup
    // distinguishable from the widget cards it contains.
    const globalBackground = usePopupConfigStore((s) => s.globalPopupBackground);
    const background =
        (widget.options?.popupBackground as string | undefined) ??
        view?.background ??
        globalBackground ??
        DEFAULT_POPUP_BACKGROUND;

    // Background image (issue #442): same three levels. An image of its own on a
    // level wins; an empty level inherits — there is no "no image" override yet.
    const globalBackgroundImage = usePopupConfigStore((s) => s.globalPopupBackgroundImage);
    const backgroundImage =
        activeBgImage(widget.options?.popupBackgroundImage) ??
        activeBgImage(view?.backgroundImage) ??
        activeBgImage(globalBackgroundImage);

    // Inner padding between the popup edge and the widgets inside (issue #621):
    // same three levels, then the historical 12px. Handed to every body that draws
    // a box around embedded widgets.
    const globalPadding = usePopupConfigStore((s) => s.globalPopupPadding);
    const padding = clampPct(
        (widget.options?.popupPadding as number | undefined) ?? view?.padding ?? globalPadding,
        MAX_POPUP_PADDING,
        DEFAULT_POPUP_PADDING,
    );

    // Escape closes only the topmost popup of a stack, not every one at once.
    useEscapeLayer(onClose);

    // Auto-close timer, reset on pointer activity inside the popup body.
    const timerRef = useRef<number | null>(null);
    // Seeded on mount so the countdown's first paint already shows the full time.
    const deadlineRef = useRef(Date.now() + effectiveAutoCloseSec * 1000);
    const armTimer = () => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        if (effectiveAutoCloseSec > 0) {
            deadlineRef.current = Date.now() + effectiveAutoCloseSec * 1000;
            timerRef.current = window.setTimeout(onClose, effectiveAutoCloseSec * 1000);
        }
    };
    useEffect(() => {
        armTimer();
        return () => {
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveAutoCloseSec, onClose]);

    const isIframe = action.kind === 'popup-iframe';
    const hideTitle = !!widget.options?.popupHideTitle;
    // The heading gets both placeholder layers, exactly like the widgets inside a popup
    // view: `{{parent}}` & co. resolved here against the popup's main datapoint (for a
    // list row that is the clicked row), `[[dp]]` resolved live by DynamicTitle below.
    const mainDp = popupMainDp(widget, action.kind === 'popup-view' ? action.dp : undefined);
    const nameVars = useDpNameVars(mainDp);
    const title = subAll(getTitle(widget, action, titleOverride), {
        ...nameVars,
        ...buildPopupSubMap(widget, mainDp),
    });
    const customWidth = widget.options?.popupWidth as number | undefined;
    const customHeight = widget.options?.popupHeight as number | undefined;
    // Fullscreen: the dialog covers the whole viewport — no margin, corners or frame.
    // Width/height are ignored then; the screensaver popup (#822) is the use case.
    const fullscreen = !!widget.options?.popupFullscreen;
    // A web page has no size of its own, so in fullscreen it has to be stretched.
    const fillBody = fullscreen && isIframe;
    // Without a configured width the dialog sizes to its body: popup views and embedded
    // widgets report their designed grid width, the device/media bodies their own fixed
    // width. Only free-flowing HTML keeps a reading cap — its paragraphs would otherwise
    // stretch to one line across the whole screen.
    const autoMaxWidth = action.kind === 'popup-html' ? 'min(calc(100vw - 16px), 600px)' : 'calc(100vw - 16px)';

    // The scrollbar lane is only reserved while the body really scrolls (issue #621).
    // `stable both-edges` keeps a long popup view centred and clear of the scrollbar, but
    // it also costs two scrollbar widths (~30 px) in every popup that fits — space a phone
    // does not have. The toggle settles after one frame: reserving the lane can only make
    // the content taller (so it keeps scrolling), releasing it only shorter (so it keeps
    // fitting).
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const [scrolls, setScrolls] = useState(false);
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || isIframe) return;
        const measure = () => setScrolls(el.scrollHeight - el.clientHeight > 1);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);
        return () => ro.disconnect();
    }, [isIframe]);

    const body = (() => {
        switch (action.kind) {
            case 'popup-dimmer':
                return <DimmerPopupBody widget={widget} />;
            case 'popup-switch':
                return <SwitchPopupBody widget={widget} />;
            case 'popup-shutter':
                return <ShutterPopupBody widget={widget} />;
            case 'popup-mediaplayer':
                return <MediaplayerPopupBody widget={widget} />;
            case 'popup-image':
                return <ImagePopupBody action={action} />;
            case 'popup-iframe':
                return <IframePopupBody action={action} width={customWidth} height={customHeight} fill={fullscreen} />;
            case 'popup-json':
                return <JsonPopupBody action={action} />;
            case 'popup-html':
                return <HtmlPopupBody action={action} />;
            case 'popup-widget':
                return <WidgetEmbedBody widget={widget} action={action} allWidgets={allWidgets} padding={padding} />;
            case 'popup-dps':
                return <DeviceDpsBody widget={widget} action={action} padding={padding} />;
            case 'popup-view':
                return (
                    <TabEmbedBody
                        viewId={action.viewId}
                        triggerWidget={widget}
                        dpOverride={action.dp}
                        padding={padding}
                    />
                );
            default:
                return null;
        }
    })();

    return createPortal(
        <div
            data-aura-click-popup={action.kind}
            className={`fixed inset-0 flex items-center justify-center z-[300] ${fullscreen ? 'p-0' : 'p-4'}`}
            style={{ background: `rgba(0,0,0,${backdropDim / 100})` }}
            onClick={onClose}
        >
            <div
                className={`relative flex flex-col overflow-hidden ${fullscreen ? '' : 'rounded-2xl shadow-2xl'}`}
                style={{
                    background,
                    ...(backgroundImage ? BG_IMAGE_HOST_STYLE : {}),
                    border: fullscreen ? 'none' : `1px solid ${DEFAULT_POPUP_BORDER}`,
                    // Element opacity (not just a translucent surface) so the embedded
                    // widgets — which paint their own --widget-bg cards — turn see-through
                    // together with the dialog chrome instead of staying solid.
                    opacity: transparency > 0 ? 1 - transparency / 100 : undefined,
                    ...(fullscreen
                        ? { width: '100vw', height: '100dvh' }
                        : {
                              width: isIframe
                                  ? undefined
                                  : customWidth
                                    ? `min(calc(100vw - 16px), ${customWidth}px)`
                                    : undefined,
                              maxWidth: isIframe ? undefined : customWidth ? undefined : autoMaxWidth,
                              maxHeight: isIframe
                                  ? undefined
                                  : customHeight
                                    ? `min(85dvh, ${customHeight}px)`
                                    : '85dvh',
                          }),
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={armTimer}
                onPointerMove={effectiveAutoCloseSec > 0 ? armTimer : undefined}
                onKeyDown={armTimer}
            >
                {backgroundImage && <BackgroundImageLayer image={backgroundImage} />}
                {/* Close button — always absolute top-right of popup */}
                <button
                    onClick={onClose}
                    className="absolute top-2.5 right-2.5 z-20 w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-70 transition-opacity"
                    style={{
                        color: 'var(--text-secondary)',
                        background: 'var(--app-bg)',
                        border: `1px solid ${DEFAULT_POPUP_BORDER}`,
                    }}
                >
                    <X size={13} />
                </button>

                {countdown && <PopupCountdown position={countdown} deadlineRef={deadlineRef} />}

                {/* Optional title header — keeps clear of a countdown in a top corner */}
                {!hideTitle && title && (
                    <div
                        className={`shrink-0 py-3 ${countdown === 'top-left' ? 'pl-20' : 'pl-5'} ${countdown === 'top-right' ? 'pr-28' : 'pr-12'}`}
                        style={{ borderBottom: `1px solid ${DEFAULT_POPUP_BORDER}` }}
                    >
                        <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                            <DynamicTitle text={title} />
                        </span>
                    </div>
                )}

                {/* Body */}
                {/* Centering uses margin:auto (not flex items-/justify-center) so a popup
                    view taller/wider than the viewport stays fully scrollable. Flex
                    alignment centers overflowing content and clips its top/left edge
                    beyond the scroll origin, hiding the first widgets unreachably.
                    scrollbar-gutter reserves a dedicated lane for the vertical scrollbar
                    (both-edges keeps the content centered) so a long popup-view's scrollbar
                    no longer overlaps the rightmost widgets. */}
                <div
                    ref={scrollRef}
                    className="overflow-auto flex"
                    style={{
                        flex: isIframe && !fillBody ? 'none' : '1 1 auto',
                        minHeight: 0,
                        scrollbarGutter: !isIframe && scrolls ? 'stable both-edges' : undefined,
                    }}
                >
                    <div key={swapped?.n ?? 0} className={fillBody ? 'w-full h-full' : 'm-auto'}>
                        <PopupLayerContext.Provider value={layer}>{body}</PopupLayerContext.Provider>
                    </div>
                </div>
            </div>
        </div>,
        portalTarget,
    );
}
