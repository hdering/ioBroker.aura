/**
 * Carousel Widget — horizontally scrollable strip of chip-style items.
 *
 * Each item has its own datapoint and click behavior:
 *   • Default: write `value` to the configured DP (like ChipsWidget)
 *   • Or: open a popup (popup-widget / popup-view) or jump to a tab (link-tab)
 *
 * Swipe-scroll with mouse (drag) or touch (native). Optional shake-on-open hint
 * when content overflows. Optional per-item override colors (bg, text).
 */
import { useEffect, useRef, useState } from 'react';
import { Zap, GalleryHorizontal } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useDashboardStore } from '../../store/dashboardStore';
import { useNavigationStore } from '../../store/navigationStore';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { ConfirmOverlay } from './ConfirmOverlay';
import { WidgetClickPopup } from './popup/WidgetClickPopup';
import type { WidgetProps, ClickAction } from '../../types';

export type CarouselItem = {
  id: string;
  label: string;
  icon?: string;
  dp: string;
  value?: string | number | boolean;
  activeValue?: string | number | boolean;
  clickAction?: ClickAction;
  bgColor?: string;
  textColor?: string;
  showConfirm?: boolean;
  confirmText?: string;
};

// A real drag must exceed this distance before we suppress the chip onClick.
// Below the threshold, the click still fires (tap-to-toggle still works).
const DRAG_CLICK_THRESHOLD = 6;

export function CarouselWidget({ config }: WidgetProps) {
  const o = config.options ?? {};
  const { setState } = useIoBroker();
  const [pendingItem, setPendingItem] = useState<CarouselItem | null>(null);
  const [popupAction, setPopupAction] = useState<ClickAction | null>(null);

  const WidgetIcon = getWidgetIcon(o.icon as string | undefined, GalleryHorizontal);
  const iconSize   = (o.iconSize   as number) || 20;
  const showTitle  = o.showTitle !== false;
  const showIcon   = o.showIcon  !== false;
  const titleAlign = (o.titleAlign as string) ?? 'left';

  const items     = (o.items     as CarouselItem[] | undefined) ?? [];
  const checkDp   = (o.checkDp   as string) ?? '';
  const chipSizeRaw = o.chipSize as string | number | undefined;
  const chipStyle = (o.chipStyle as string) ?? 'outlined';
  const gap       = (o.gap       as number) ?? 8;
  const align     = (o.align     as string) ?? 'start';
  const valign    = (o.valign    as string) ?? 'middle';
  // Snap is opt-in: with snap on, the scroll position must always land on a
  // snap point, which prevents small nudges (3–4 px) and makes the inertia feel
  // jumpy. Off = free pixel-precise scrolling.
  const snap      = o.snap === true;
  const hideScrollbar = o.hideScrollbar === true;
  const shakeOnOpen   = o.shakeOnOpen === true;

  const { value: checkValue } = useDatapoint(checkDp);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const stripRef = useRef<HTMLDivElement>(null);
  // Pointer-drag state (mouse swipe). Touch uses native overflow scroll.
  // lastX/lastT + vx track velocity for the post-release inertia animation.
  const dragRef = useRef<{
    startX: number; startScroll: number; moved: number;
    lastX: number; lastT: number; vx: number;
  } | null>(null);
  // Set briefly after a real drag so the synthesized button click is swallowed.
  const justDraggedRef = useRef(false);
  // Running inertia rAF; cancelled when a new drag starts or on unmount.
  const inertiaRafRef = useRef<number | null>(null);
  // Shake animation — applied once on mount via class toggle.
  const [shaking, setShaking] = useState(false);

  // Cancel inertia on unmount so no stale rAF runs against an unmounted node.
  useEffect(() => () => {
    if (inertiaRafRef.current !== null) window.cancelAnimationFrame(inertiaRafRef.current);
  }, []);

  // ── Shake on tab open ───────────────────────────────────────────────────────
  // Runs on mount: when the tab containing this widget becomes active, the
  // widget remounts (Dashboard only renders the active tab's widgets), so
  // mount = "tab opened" for this purpose. Only triggers when content actually
  // overflows — no point hinting at hidden items that don't exist.
  useEffect(() => {
    if (!shakeOnOpen) return;
    const id = window.requestAnimationFrame(() => {
      const el = stripRef.current;
      if (!el) return;
      if (el.scrollWidth <= el.clientWidth + 2) return;
      setShaking(true);
      window.setTimeout(() => setShaking(false), 650);
    });
    return () => window.cancelAnimationFrame(id);
  }, [shakeOnOpen]);

  // ── Action dispatch ─────────────────────────────────────────────────────────
  const dispatchAction = (item: CarouselItem) => {
    const a = item.clickAction;
    if (!a || a.kind === 'none') {
      if (item.dp) setState(item.dp, item.value !== undefined ? item.value : true);
      return;
    }
    if (a.kind === 'link-tab') {
      const tab = useDashboardStore.getState().layouts
        .find((l) => l.id === a.layoutId)?.tabs.find((t) => t.id === a.tabId);
      if (tab?.disabled) return;
      useNavigationStore.getState().navigateTo(a.layoutId, a.tabId);
      return;
    }
    setPopupAction(a);
  };

  const handleClick = (item: CarouselItem) => {
    if (justDraggedRef.current) return; // pointer-drag swipe — not a click
    if (item.showConfirm) { setPendingItem(item); return; }
    dispatchAction(item);
  };

  const isActive = (item: CarouselItem): boolean => {
    if (!checkDp) return false;
    const compareTo = item.activeValue !== undefined ? item.activeValue : item.value;
    if (compareTo === undefined) return false;
    // eslint-disable-next-line eqeqeq
    return checkValue == compareTo;
  };

  // ── Pointer drag handlers (mouse swipe) ─────────────────────────────────────
  const cancelInertia = () => {
    if (inertiaRafRef.current !== null) {
      window.cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Touch already scrolls via overflow:auto; intercepting it would break
    // momentum-scroll on mobile. Only handle mouse here.
    if (e.pointerType !== 'mouse') return;
    if (e.button !== 0) return;
    const el = stripRef.current;
    if (!el) return;
    cancelInertia();
    const now = performance.now();
    dragRef.current = {
      startX: e.clientX, startScroll: el.scrollLeft, moved: 0,
      lastX: e.clientX, lastT: now, vx: 0,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const el = stripRef.current;
    if (!el) return;
    const dx = e.clientX - drag.startX;
    drag.moved = Math.max(drag.moved, Math.abs(dx));
    if (drag.moved > 2) {
      el.scrollLeft = drag.startScroll - dx;
    }
    // Velocity smoothing (px / ms). Low-pass filter dampens jitter from a
    // single jumpy pointermove that would otherwise launch a runaway inertia.
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) {
      const instV = (e.clientX - drag.lastX) / dt;
      drag.vx = 0.7 * drag.vx + 0.3 * instV;
      drag.lastX = e.clientX;
      drag.lastT = now;
    }
  };

  // Friction per frame at ~60fps. 0.92^60 ≈ 0.007, so a half-second toss
  // decays to ~10% strength — feels like a touch fling, not a teleport.
  const startInertia = (initialVx: number) => {
    const el = stripRef.current;
    if (!el) return;
    let vx = initialVx; // px / ms, sign-matched to dx (right-drag = positive)
    let last = performance.now();
    const tick = (now: number) => {
      const node = stripRef.current;
      if (!node) { inertiaRafRef.current = null; return; }
      const dt = Math.min(48, now - last); // clamp big frames so resume doesn't jump
      last = now;
      // scrollLeft moves opposite to drag direction (drag right ⇒ scroll left).
      const before = node.scrollLeft;
      node.scrollLeft = before - vx * dt;
      // Stop at edges so we don't burn rAF spinning against the boundary.
      if (node.scrollLeft === before) { inertiaRafRef.current = null; return; }
      vx *= Math.pow(0.92, dt / 16);
      if (Math.abs(vx) < 0.02) { inertiaRafRef.current = null; return; }
      inertiaRafRef.current = window.requestAnimationFrame(tick);
    };
    inertiaRafRef.current = window.requestAnimationFrame(tick);
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.moved > DRAG_CLICK_THRESHOLD) {
      // Suppress the click that fires after pointerup at the end of a drag.
      justDraggedRef.current = true;
      window.setTimeout(() => { justDraggedRef.current = false; }, 50);
      // Hand off any remaining velocity to the inertia loop. Threshold is in
      // px/ms — below it the gesture was effectively a slow drop, no glide.
      if (Math.abs(drag.vx) > 0.15) startInertia(drag.vx);
    }
  };

  // ── Style maths ─────────────────────────────────────────────────────────────
  const h =
    typeof chipSizeRaw === 'number' ? Math.max(16, Math.min(500, chipSizeRaw))
    : chipSizeRaw === 'sm' ? 28
    : chipSizeRaw === 'lg' ? 42
    : 36;
  const fs     = `${Math.round(h * 0.35)}px`;
  const px     = `${Math.round(h * 0.4)}px`;
  const iconSz = Math.round(h * 0.4);

  const justify =
    align === 'end' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
  const valignJustify =
    valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center';

  const defaultBg = (active: boolean) =>
    chipStyle === 'filled' ? (active ? 'var(--accent)' : 'var(--app-bg)')
    : chipStyle === 'ghost' ? (active ? 'var(--accent)22' : 'transparent')
    : (active ? 'var(--accent)22' : 'var(--app-bg)');

  const defaultColor = (active: boolean) =>
    active ? (chipStyle === 'filled' ? '#fff' : 'var(--accent)') : 'var(--text-primary)';

  const chipBorder = (active: boolean, customBg: string | undefined) =>
    chipStyle === 'ghost' ? 'none'
    : `1px solid ${active ? 'var(--accent)44' : customBg ? 'transparent' : 'var(--app-border)'}`;

  const stripClass = [
    'nodrag',
    hideScrollbar ? 'aura-no-scrollbar' : '',
    shaking ? 'aura-carousel-shake' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="aura-widget-row relative w-full h-full flex flex-col gap-1.5">
      {(showTitle || showIcon) && (
        <div className="flex items-center gap-1.5 shrink-0 min-w-0">
          {showIcon && <WidgetIcon className="aura-widget-icon" size={iconSize} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
          {showTitle && <p className="aura-widget-title text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-secondary)', textAlign: titleAlign as React.CSSProperties['textAlign'] }}>{config.title}</p>}
        </div>
      )}
      <div className="aura-widget-action nodrag flex-1 flex flex-col min-h-0" style={{ justifyContent: valignJustify }}>
        <div
          ref={stripRef}
          className={stripClass}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={endDrag}
          style={{
            display: 'flex',
            gap: `${gap}px`,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: hideScrollbar ? 'none' : 'thin',
            scrollSnapType: snap ? 'x proximity' : undefined,
            paddingBottom: hideScrollbar ? undefined : '2px',
            justifyContent: justify,
            WebkitOverflowScrolling: 'touch',
            cursor: 'grab',
            userSelect: 'none',
          }}
        >
          {items.map((item) => {
            const active = isActive(item);
            const ItemIcon = item.icon ? getWidgetIcon(item.icon, Zap) : null;
            const bg = item.bgColor ?? defaultBg(active);
            const color = item.textColor ?? defaultColor(active);
            return (
              <button
                key={item.id}
                onClick={() => handleClick(item)}
                className="flex items-center gap-1.5 rounded-full whitespace-nowrap hover:opacity-80 transition-opacity shrink-0"
                style={{
                  background: bg,
                  color,
                  border: chipBorder(active, item.bgColor),
                  fontSize: fs,
                  height: `${h}px`,
                  paddingLeft: px,
                  paddingRight: px,
                  scrollSnapAlign: snap ? 'start' : undefined,
                }}
              >
                {ItemIcon && <ItemIcon size={iconSz} />}
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {pendingItem && (
        <ConfirmOverlay
          text={pendingItem.confirmText || undefined}
          onConfirm={() => { dispatchAction(pendingItem); setPendingItem(null); }}
          onCancel={() => setPendingItem(null)}
        />
      )}

      {popupAction && (
        <WidgetClickPopup
          widget={config}
          action={popupAction}
          onClose={() => setPopupAction(null)}
          allWidgets={useDashboardStore.getState().layouts.flatMap((l) => l.tabs.flatMap((t) => t.widgets))}
        />
      )}
    </div>
  );
}
