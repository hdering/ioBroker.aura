/**
 * Carousel Widget — horizontally scrollable strip of chip-style items.
 *
 * Each item has its own datapoint and click behavior:
 *   • Default: write `value` to the configured DP (like ChipsWidget)
 *   • Or: open a popup (popup-widget / popup-view) or jump to a tab (link-tab)
 *
 * Swipe-scroll with mouse (drag) or touch (native). Optional shake-on-open hint
 * when content overflows. Optional auto-rotate, per-item colors, per-item
 * active/inactive values, per-item last-change timestamp.
 */
import { useEffect, useRef, useState } from 'react';
import { Zap, GalleryHorizontal } from 'lucide-react';
import { useDatapoint } from '../../hooks/useDatapoint';
import { useIoBroker } from '../../hooks/useIoBroker';
import { useDashboardStore } from '../../store/dashboardStore';
import { useNavigationStore } from '../../store/navigationStore';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { useT } from '../../i18n';
import { formatLastChange } from '../../utils/formatLastChange';
import { ConfirmOverlay } from './ConfirmOverlay';
import { WidgetClickPopup } from './popup/WidgetClickPopup';
import type { WidgetProps, ClickAction } from '../../types';

export type CarouselItem = {
  id: string;
  label: string;
  icon?: string;
  /** Per-item icon size in px; when undefined the size is auto-derived from the
   *  chip height (and grows when last-change is shown so the icon visually
   *  matches the two-line text block). */
  iconSize?: number;
  dp: string;
  value?: string | number | boolean;
  activeValue?: string | number | boolean;
  inactiveValue?: string | number | boolean;
  clickAction?: ClickAction;
  /** Background color while the item is active (DP matches activeValue / value). */
  bgColor?: string;
  /** Text color while the item is active. */
  textColor?: string;
  /** Background color while the item is inactive. */
  bgColorInactive?: string;
  /** Text color while the item is inactive. */
  textColorInactive?: string;
  showConfirm?: boolean;
  confirmText?: string;
  showLastChange?: boolean;
};

// A real drag must exceed this distance before we suppress the chip onClick.
// Below the threshold, the click still fires (tap-to-toggle still works).
const DRAG_CLICK_THRESHOLD = 6;

export function CarouselWidget({ config, editMode }: WidgetProps) {
  const o = config.options ?? {};
  const t = useT();
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
  const autoRotate    = o.autoRotate === true;
  // px/s — 30 ≈ slow ticker. Clamped to [5, 400] to keep behavior sane.
  const autoRotateSpeed = Math.max(5, Math.min(400, (o.autoRotateSpeed as number) || 30));

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
  // Auto-rotate rAF; cancelled when paused or unmounted.
  const rotateRafRef = useRef<number | null>(null);
  // True while the pointer is over the strip or being dragged — auto-rotate
  // pauses so the user can interact without fighting the scroll.
  const [paused, setPaused] = useState(false);
  // Shake animation — applied once on mount via class toggle.
  const [shaking, setShaking] = useState(false);

  // Cancel inertia + rotate on unmount so no stale rAF runs against an unmounted node.
  useEffect(() => () => {
    if (inertiaRafRef.current !== null) window.cancelAnimationFrame(inertiaRafRef.current);
    if (rotateRafRef.current  !== null) window.cancelAnimationFrame(rotateRafRef.current);
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

  // ── Auto-rotate ─────────────────────────────────────────────────────────────
  // Slow continuous scroll. Loops back to start when reaching the right edge.
  // Pauses while the user hovers / drags so it doesn't fight pointer input.
  // Disabled in editMode to avoid scroll surprises while configuring.
  useEffect(() => {
    if (!autoRotate || paused || editMode) return;
    let last = performance.now();
    const tick = (now: number) => {
      const el = stripRef.current;
      if (!el) { rotateRafRef.current = null; return; }
      // With auto-rotate ON we render items twice (see render below). The strip
      // contains 2 copies → scrollWidth = 2 × originalWidth. When scrollLeft
      // crosses one copy's width, snap back by exactly that width: the visible
      // viewport content is identical at both positions, so the rollover is
      // invisible and rotation looks endless.
      const halfWidth = el.scrollWidth / 2;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) { rotateRafRef.current = null; return; }
      const dt = Math.min(48, now - last);
      last = now;
      let next = el.scrollLeft + (autoRotateSpeed * dt) / 1000;
      if (next >= halfWidth) next -= halfWidth;
      el.scrollLeft = next;
      rotateRafRef.current = window.requestAnimationFrame(tick);
    };
    rotateRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rotateRafRef.current !== null) window.cancelAnimationFrame(rotateRafRef.current);
      rotateRafRef.current = null;
    };
  }, [autoRotate, autoRotateSpeed, paused, editMode, items.length]);

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
          onMouseEnter={autoRotate ? () => setPaused(true) : undefined}
          onMouseLeave={autoRotate ? () => setPaused(false) : undefined}
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
          {/* When auto-rotate is on we render items twice. The auto-rotate tick
              wraps scrollLeft by exactly halfWidth = scrollWidth/2 so the
              rollover lands on the duplicate copy, which shows the same content
              at the same viewport position — visually seamless. */}
          {(autoRotate && items.length > 0 ? [...items, ...items] : items).map((item, idx) => {
            const ItemIcon = item.icon ? getWidgetIcon(item.icon, Zap) : null;
            const isDup = autoRotate && idx >= items.length;
            return (
              <CarouselItemButton
                key={isDup ? `${item.id}__dup` : item.id}
                item={item}
                ItemIcon={ItemIcon}
                checkDp={checkDp}
                checkValue={checkValue}
                t={t}
                h={h}
                fs={fs}
                px={px}
                iconSz={iconSz}
                snap={snap}
                defaultBg={defaultBg}
                defaultColor={defaultColor}
                chipBorder={chipBorder}
                onClick={() => handleClick(item)}
              />
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

// ── Per-item button component ────────────────────────────────────────────────
// Lives in its own component so we can call useDatapoint(item.dp) per item.
// Computes active state by reading the item's own DP against activeValue /
// inactiveValue. Falls back to the shared checkDp comparison when the item
// hasn't been given explicit active values.

interface CarouselItemButtonProps {
  item: CarouselItem;
  ItemIcon: import('lucide-react').LucideIcon | null;
  checkDp: string;
  checkValue: unknown;
  t: ReturnType<typeof useT>;
  h: number;
  fs: string;
  px: string;
  iconSz: number;
  snap: boolean;
  defaultBg: (active: boolean) => string;
  defaultColor: (active: boolean) => string;
  chipBorder: (active: boolean, customBg: string | undefined) => string;
  onClick: () => void;
}

function CarouselItemButton({
  item, ItemIcon, checkDp, checkValue, t, h, fs, px, iconSz, snap,
  defaultBg, defaultColor, chipBorder, onClick,
}: CarouselItemButtonProps) {
  // Subscribe to item's own DP only when the item actually needs its own state
  // (active/inactive value comparison or last-change display). Empty id is
  // harmless — useDatapoint short-circuits when id is empty.
  const needsOwnDp = !!(item.dp && (
    item.activeValue !== undefined || item.inactiveValue !== undefined || item.showLastChange
  ));
  const { state: itemState } = useDatapoint(needsOwnDp ? item.dp : '');

  // Periodic redraw for the relative-time string. Only ticks when at least one
  // item is showing last-change to avoid a global interval.
  const [, forceRedraw] = useState(0);
  useEffect(() => {
    if (!item.showLastChange) return;
    const iv = window.setInterval(() => forceRedraw((n) => n + 1), 10_000);
    return () => window.clearInterval(iv);
  }, [item.showLastChange]);

  // Active-state resolution:
  //   • If activeValue/inactiveValue defined → compare against item's own DP
  //   • Else if shared checkDp set → compare against checkValue (scene mode)
  //   • Else → never active
  let active = false;
  if (needsOwnDp && (item.activeValue !== undefined || item.inactiveValue !== undefined)) {
    const v = itemState?.val ?? null;
    if (item.activeValue !== undefined) {
      // eslint-disable-next-line eqeqeq
      active = v == item.activeValue;
    } else if (item.inactiveValue !== undefined) {
      // Only inactiveValue defined: item is active when DP is NOT the inactive
      // value (and DP has actually delivered a value).
      // eslint-disable-next-line eqeqeq
      active = v !== null && v != item.inactiveValue;
    }
  } else if (checkDp) {
    const compareTo = item.activeValue !== undefined ? item.activeValue : item.value;
    if (compareTo !== undefined) {
      // eslint-disable-next-line eqeqeq
      active = checkValue == compareTo;
    }
  }

  // Pick the color override matching the current state. Each side falls back
  // to the chip-style default (defaultBg/defaultColor) when no override is set,
  // so users can colour only the active state, only the inactive state, or both.
  const customBg = active ? item.bgColor : item.bgColorInactive;
  const customText = active ? item.textColor : item.textColorInactive;
  const bg = customBg ?? defaultBg(active);
  const color = customText ?? defaultColor(active);

  const ts = itemState ? (itemState.lc > 0 ? itemState.lc : itemState.ts) : 0;
  const lastChangeText = item.showLastChange && ts > 0
    ? formatLastChange(t as (k: string, v?: Record<string, string | number>) => string, ts)
    : '';

  const lcFontSize = Math.max(8, Math.round(h * 0.22));

  // Icon sizing:
  //   • Explicit per-item override wins.
  //   • Otherwise, when last-change is shown the icon spans both lines (label
  //     line-height ≈ chipHeight × 0.5 + lc line-height ≈ chipHeight × 0.3 + gap).
  //     We approximate that as h × 0.7.
  //   • Single-line: keep the existing h × 0.4 sizing.
  const effectiveIconSz = item.iconSize
    ? Math.max(8, Math.min(200, item.iconSize))
    : item.showLastChange
      ? Math.round(h * 0.7)
      : iconSz;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full whitespace-nowrap hover:opacity-80 transition-opacity shrink-0"
      style={{
        background: bg,
        color,
        border: chipBorder(active, customBg),
        fontSize: fs,
        height: item.showLastChange ? 'auto' : `${h}px`,
        minHeight: `${h}px`,
        paddingLeft: px,
        paddingRight: px,
        paddingTop: item.showLastChange ? `${Math.round(h * 0.15)}px` : undefined,
        paddingBottom: item.showLastChange ? `${Math.round(h * 0.15)}px` : undefined,
        scrollSnapAlign: snap ? 'start' : undefined,
        lineHeight: 1.1,
      }}
    >
      {ItemIcon && <ItemIcon size={effectiveIconSz} />}
      <span className="flex flex-col items-start" style={{ lineHeight: 1.1 }}>
        <span>{item.label}</span>
        {item.showLastChange && lastChangeText && (
          <span
            className="aura-last-change opacity-60"
            style={{ fontSize: `${lcFontSize}px`, marginTop: 1 }}
          >
            {lastChangeText}
          </span>
        )}
      </span>
    </button>
  );
}
