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
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

// Loose equality that also matches across types. The Aktiv-/Inaktiv-Wert
// inputs are <input type="text"> → always strings, while DP values can be
// boolean / number / string. Native `==` fails on e.g. `true == "true"`, so
// we fall back to a case-insensitive string compare when needed.
function eqLoose(a: unknown, b: unknown): boolean {
  // eslint-disable-next-line eqeqeq
  if (a == b) return true;
  if (a == null || b == null) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

export function CarouselWidget({ config, editMode }: WidgetProps) {
  const o = config.options ?? {};
  const t = useT();
  const { setState } = useIoBroker();
  const [pendingItem, setPendingItem] = useState<{ item: CarouselItem; isActive: boolean } | null>(null);
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
  // Two layout modes:
  //   'carousel' (default) — multiple items visible at once, free scroll
  //   'single'             — one item fills the viewport width, swipe paginates
  const mode      = (o.mode as 'carousel' | 'single') ?? 'carousel';
  const isSingle  = mode === 'single';
  // Snap is opt-in for carousel mode. For single mode it's forced on (mandatory)
  // so each scroll/swipe always lands on a clean item boundary.
  const snap      = o.snap === true;
  const hideScrollbar = o.hideScrollbar === true;
  const shakeOnOpen   = o.shakeOnOpen === true;
  const autoRotate    = o.autoRotate === true;
  // Carousel mode: px/s of continuous scroll. Clamped to [5, 400].
  const autoRotateSpeed = Math.max(5, Math.min(400, (o.autoRotateSpeed as number) || 30));
  // Single mode: seconds between discrete steps. Clamped to [1, 60].
  const autoRotateInterval = Math.max(1, Math.min(60, (o.autoRotateInterval as number) || 4));
  // Optional cap on a chip's width. Labels wider than the available text area
  // marquee-scroll horizontally instead of overflowing the chip. 0 / undefined
  // = no cap, chip grows to fit the label naturally.
  const maxItemWidth = (o.maxItemWidth as number | undefined) || 0;
  // Where the label (and last-change line) sits within the chip. Defaults
  // preserve previous behaviour: centred in single mode, left in carousel mode.
  const labelAlign = (o.labelAlign as 'left' | 'center' | 'right' | undefined)
    ?? (mode === 'single' ? 'center' : 'left');

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
  // True when the single (un-duplicated) item set is wider than the viewport.
  // Gates the duplicate render: without overflow, showing items twice makes
  // both copies visible side-by-side, which reads as ghosted/doubled chips.
  const [hasOverflow, setHasOverflow] = useState(false);
  const hasOverflowRef = useRef(false);
  hasOverflowRef.current = hasOverflow;
  // Shake animation — applied once on mount via class toggle.
  const [shaking, setShaking] = useState(false);

  // Cancel inertia + rotate on unmount so no stale rAF runs against an unmounted node.
  useEffect(() => () => {
    if (inertiaRafRef.current !== null) window.cancelAnimationFrame(inertiaRafRef.current);
    if (rotateRafRef.current  !== null) window.cancelAnimationFrame(rotateRafRef.current);
  }, []);

  // Decide whether to duplicate items for the seamless auto-rotate wrap. We
  // only want duplicates when the original set is wider than the viewport;
  // otherwise both copies would be visible at once and look ghosted. Read
  // hasOverflow via a ref so the effect itself isn't a dep (avoiding bounce).
  //
  // useLayoutEffect runs synchronously after each DOM commit but BEFORE paint,
  // so the duplicate-render settles invisibly to the user — no transient
  // first-paint with the wrong period. Without this the rotation was running
  // for several cycles against the wrong wrap distance before things settled.
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      // Skip measurements while layout isn't settled — would produce a wrong
      // signal (e.g. "everything overflows" because cw=0) that we'd then flip
      // back, visible as flicker.
      if (cw === 0) return;
      if (items.length === 0) return;
      const total = el.scrollWidth;
      // When duplicated, scrollWidth is exactly 2 × original.
      const origW = hasOverflowRef.current ? total / 2 : total;
      // Hysteresis: require a 20 px margin to flip OFF, so a 1-px wobble at
      // the border doesn't oscillate the duplicate render in and out.
      const wantOn  = origW > cw + 1;
      const wantOff = origW < cw - 20;
      const next = hasOverflowRef.current ? !wantOff : wantOn;
      if (next !== hasOverflowRef.current) setHasOverflow(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length, autoRotate, gap, chipSizeRaw, maxItemWidth, isSingle]);

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

  // ── Auto-rotate — continuous scroll (carousel mode) ─────────────────────────
  // Slow continuous scroll. Loops back to start when reaching the right edge.
  // Pauses while the user hovers / drags so it doesn't fight pointer input.
  // Disabled in editMode to avoid scroll surprises while configuring.
  useEffect(() => {
    if (isSingle) return; // single mode uses the discrete stepper below
    if (!autoRotate || paused || editMode) return;
    // Wait for the measurement pass to confirm overflow (and thus that the
    // duplicate copy is in the DOM). Starting before that, the wrap-distance
    // probe `el.children[items.length]` is undefined and we fall back to
    // scrollWidth/2 — which, with no duplicates rendered, equals only half
    // the original set's width. The strip would cycle at the wrong period for
    // the first few seconds until the re-render lands. Gating on hasOverflow
    // makes the very first frame use the correct period.
    if (!hasOverflow) return;
    let last = performance.now();
    // Sub-pixel accumulator. At 30 px/s ≈ 0.5 px/frame; without this, the
    // round-trip through el.scrollLeft (which browsers round to integer px)
    // would drop the fractional increment every frame and the strip would
    // barely move at low speeds.
    const startEl = stripRef.current;
    let scrollPos = startEl ? startEl.scrollLeft : 0;
    const tick = (now: number) => {
      const el = stripRef.current;
      if (!el) { rotateRafRef.current = null; return; }
      // DOM-consistency guard: if for any reason the duplicate isn't in the DOM
      // yet (one render behind), DON'T compute a wrong period — skip this frame
      // and stay scheduled. Without this the tick would briefly wrap at
      // scrollWidth/2 (half of single-set width), producing a hard visible jump.
      const expected = items.length * 2;
      if (el.children.length < expected) {
        last = now;
        rotateRafRef.current = window.requestAnimationFrame(tick);
        return;
      }
      // Re-sync with the real scrollLeft when an external change (drag,
      // inertia, single-mode snap) moves it. Tolerance > 1 px to ignore the
      // browser's integer rounding of our writes.
      if (Math.abs(el.scrollLeft - scrollPos) > 1) {
        scrollPos = el.scrollLeft;
      }
      // Precise wrap distance: position of the first duplicate child. That
      // offsetLeft includes the gap between original and duplicate sets, so
      // wrapping by it lands on identical content — pixel-perfect seamless.
      const firstDup = el.children[items.length] as HTMLElement | undefined;
      const period = firstDup ? firstDup.offsetLeft : 0;
      const max = el.scrollWidth - el.clientWidth;
      const dt = Math.min(48, now - last);
      last = now;
      if (max > 0 && period > 0) {
        scrollPos += (autoRotateSpeed * dt) / 1000;
        if (scrollPos >= period) scrollPos -= period;
        el.scrollLeft = scrollPos;
      }
      rotateRafRef.current = window.requestAnimationFrame(tick);
    };
    rotateRafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rotateRafRef.current !== null) window.cancelAnimationFrame(rotateRafRef.current);
      rotateRafRef.current = null;
    };
  }, [isSingle, autoRotate, autoRotateSpeed, paused, editMode, items.length, hasOverflow]);

  // ── Auto-rotate — discrete stepper (single mode) ────────────────────────────
  // Every `autoRotateInterval` seconds advance by one viewport width with a
  // smooth scroll. When the next position crosses into the duplicate copy,
  // wait for the smooth animation to finish and silently reset by halfWidth.
  useEffect(() => {
    if (!isSingle) return;
    if (!autoRotate || paused || editMode) return;
    if (items.length < 2) return;
    const stepMs = autoRotateInterval * 1000;
    const iv = window.setInterval(() => {
      const el = stripRef.current;
      if (!el) return;
      const viewportW = el.clientWidth;
      if (viewportW === 0) return;
      el.scrollTo({ left: el.scrollLeft + viewportW, behavior: 'smooth' });
      // After the smooth-scroll completes, if we crossed into the duplicate
      // half, jump back invisibly so the next step starts within the original.
      window.setTimeout(() => {
        const node = stripRef.current;
        if (!node) return;
        const halfWidth = node.scrollWidth / 2;
        if (halfWidth > 0 && node.scrollLeft >= halfWidth - 1) {
          node.scrollLeft = node.scrollLeft - halfWidth;
        }
      }, 550);
    }, stepMs);
    return () => window.clearInterval(iv);
  }, [isSingle, autoRotate, autoRotateInterval, paused, editMode, items.length]);

  // ── Action dispatch ─────────────────────────────────────────────────────────
  const dispatchAction = (item: CarouselItem, isActive: boolean) => {
    const a = item.clickAction;
    if (!a || a.kind === 'none') {
      if (!item.dp) return;
      // Switch-style toggle: when both active and inactive values are defined,
      // a click writes the opposite of the current state. With only activeValue,
      // we write that (idempotent — same as before). Falling back to `true`
      // matches the original default for items without explicit values.
      const activeT = item.activeValue !== undefined ? item.activeValue : item.value;
      if (item.inactiveValue !== undefined && activeT !== undefined) {
        const next = isActive ? item.inactiveValue : activeT;
        setState(item.dp, next);
      } else {
        setState(item.dp, activeT !== undefined ? activeT : true);
      }
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

  const handleClick = (item: CarouselItem, isActive: boolean) => {
    if (justDraggedRef.current) return; // pointer-drag swipe — not a click
    if (item.showConfirm) { setPendingItem({ item, isActive }); return; }
    dispatchAction(item, isActive);
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
      // In single mode, snap to the nearest (or velocity-implied next) item
      // instead of free-gliding — each release lands on one full item.
      if (isSingle) {
        const el = stripRef.current;
        if (!el) return;
        const viewportW = el.clientWidth;
        if (viewportW === 0) return;
        const currentIdx = Math.round(el.scrollLeft / viewportW);
        // Right-drag (vx > 0) = previous item; left-drag = next item.
        let targetIdx = currentIdx;
        if (Math.abs(drag.vx) > 0.3) {
          targetIdx = drag.vx > 0 ? currentIdx - 1 : currentIdx + 1;
        }
        // Clamp to the rendered range (twice items.length when autoRotate dup is on).
        const maxIdx = Math.max(0, Math.floor((el.scrollWidth - 1) / viewportW));
        targetIdx = Math.max(0, Math.min(maxIdx, targetIdx));
        el.scrollTo({ left: targetIdx * viewportW, behavior: 'smooth' });
        return;
      }
      // Carousel mode: hand off any remaining velocity to the inertia loop.
      // Threshold in px/ms — below it the gesture was effectively a slow drop.
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
            gap: isSingle ? 0 : `${gap}px`,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: hideScrollbar ? 'none' : 'thin',
            // Single mode forces mandatory snap so each release lands on an
            // item boundary. Carousel mode keeps snap opt-in via the toggle.
            scrollSnapType: isSingle ? 'x mandatory' : (snap && !autoRotate ? 'x proximity' : undefined),
            paddingBottom: hideScrollbar ? undefined : '2px',
            // In single mode each item fills the viewport — justify has no effect.
            justifyContent: isSingle ? undefined : justify,
            WebkitOverflowScrolling: 'touch',
            cursor: 'grab',
            userSelect: 'none',
          }}
        >
          {/* When auto-rotate is on AND the original set overflows the viewport,
              we render items twice. The auto-rotate tick wraps scrollLeft by
              exactly halfWidth = scrollWidth/2 so the rollover lands on the
              duplicate copy, which shows the same content at the same viewport
              position — visually seamless. Without overflow we skip duplication
              so both copies wouldn't be visible at once. */}
          {(autoRotate && hasOverflow && items.length > 0 ? [...items, ...items] : items).map((item, idx) => {
            const ItemIcon = item.icon ? getWidgetIcon(item.icon, Zap) : null;
            const isDup = autoRotate && hasOverflow && idx >= items.length;
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
                snap={(snap && !autoRotate) || isSingle}
                fullWidth={isSingle}
                maxWidth={maxItemWidth}
                labelAlign={labelAlign}
                defaultBg={defaultBg}
                defaultColor={defaultColor}
                chipBorder={chipBorder}
                onClick={(isActive) => handleClick(item, isActive)}
              />
            );
          })}
        </div>
      </div>

      {pendingItem && (
        <ConfirmOverlay
          text={pendingItem.item.confirmText || undefined}
          onConfirm={() => { dispatchAction(pendingItem.item, pendingItem.isActive); setPendingItem(null); }}
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
  /** When true the chip fills the strip viewport (single-item mode). */
  fullWidth: boolean;
  /** Max chip width in px; 0 = uncapped. Triggers marquee on overflowing labels. */
  maxWidth: number;
  /** Horizontal alignment of the label / last-change text inside the chip. */
  labelAlign: 'left' | 'center' | 'right';
  defaultBg: (active: boolean) => string;
  defaultColor: (active: boolean) => string;
  chipBorder: (active: boolean, customBg: string | undefined) => string;
  onClick: (isActive: boolean) => void;
}

function CarouselItemButton({
  item, ItemIcon, checkDp, checkValue, t, h, fs, px, iconSz, snap, fullWidth, maxWidth, labelAlign,
  defaultBg, defaultColor, chipBorder, onClick,
}: CarouselItemButtonProps) {
  // Subscribe to the item's own DP whenever any state-dependent feature needs
  // the live value: an active comparison target (value / activeValue), an
  // inactive comparison target, or the last-change timestamp. Without this,
  // the chip wouldn't repaint when the DP flips and the colours would stick.
  const activeTarget = item.activeValue !== undefined ? item.activeValue : item.value;
  const needsOwnDp = !!(item.dp && (
    activeTarget !== undefined || item.inactiveValue !== undefined || item.showLastChange
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
  //   • If a target value (value / activeValue) or inactiveValue is set →
  //     compare against the item's own DP.
  //   • Else if a shared checkDp is configured → compare against checkValue
  //     (scene-style highlighting).
  //   • Else → never active.
  let active = false;
  if (needsOwnDp && (activeTarget !== undefined || item.inactiveValue !== undefined)) {
    const v = itemState?.val ?? null;
    if (activeTarget !== undefined) {
      active = eqLoose(v, activeTarget);
    } else if (item.inactiveValue !== undefined) {
      // Only inactiveValue defined: item is active whenever DP is NOT the
      // inactive value (and the DP has actually delivered a value).
      active = v !== null && !eqLoose(v, item.inactiveValue);
    }
  } else if (checkDp) {
    if (activeTarget !== undefined) {
      active = eqLoose(checkValue, activeTarget);
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

  // In single mode the button is full-width and we drop the pill-shape so a
  // wide-stretched chip doesn't read awkwardly; carousel mode keeps the pill.
  return (
    <button
      onClick={() => onClick(active)}
      // Suppress the browser's "scroll focused element into view" reflex on
      // mouse click. Buttons get focus on mousedown by default; if the clicked
      // chip is partially scrolled off, the browser nudges the strip a few
      // pixels to fully reveal it — that's the 3-6 px right-jump the user saw
      // on first interaction. Re-applying focus with preventScroll on
      // mousedown blocks the auto-scroll while keeping focus for keyboard
      // accessibility.
      onMouseDown={(e) => {
        // Prevent the default mousedown → focus path so the browser doesn't
        // auto-scroll the partially-visible chip into view (3-6 px shift seen
        // on the very first click after a tab is opened). preventDefault still
        // lets onClick fire normally; only the implicit focus is suppressed.
        // Keyboard tab-to-focus is unaffected.
        e.preventDefault();
      }}
      // No `transition-opacity` here: during auto-rotate, chips slide under the
      // cursor and each `:hover` flip pulses the chip in/out → reads as flicker
      // synchronised to the rotation. Instant opacity feedback is fine for
      // chip-style buttons.
      className={`flex items-center gap-1.5 ${fullWidth ? 'rounded-xl justify-center' : 'rounded-full'} whitespace-nowrap hover:opacity-80 shrink-0`}
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
        scrollSnapStop: fullWidth ? 'always' : undefined,
        // Single mode: lock each item to one viewport-width
        flex: fullWidth ? '0 0 100%' : undefined,
        width: fullWidth ? '100%' : undefined,
        // Per-item max width — only applied in carousel mode; in single mode
        // the chip already spans the viewport width.
        maxWidth: !fullWidth && maxWidth > 0 ? `${maxWidth}px` : undefined,
        lineHeight: 1.3,
        overflow: maxWidth > 0 || fullWidth ? 'hidden' : undefined,
      }}
    >
      {ItemIcon && (
        // Lock the icon to a fixed flex slot so the row's flex algorithm can't
        // shrink it when the chip width is constrained (narrow widget / long
        // label). Without this, the icon's box can be squeezed below its SVG
        // size, oscillating visibly as labels marquee or the strip rotates.
        <span
          aria-hidden
          style={{
            flex: '0 0 auto',
            width: `${effectiveIconSz}px`,
            height: `${effectiveIconSz}px`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ItemIcon size={effectiveIconSz} />
        </span>
      )}
      {/* The text block only switches to constrained / marquee-capable layout
          when the chip itself has a definite width (maxWidth or fullWidth).
          Otherwise it stays inline-natural — without this guard, an unconstrained
          MarqueeText with width:100% collapses the chip and auto-rotate sees no
          overflow to scroll through. */}
      {(() => {
        const itemsClass = labelAlign === 'right' ? 'items-end'
          : labelAlign === 'center' ? 'items-center'
          : 'items-start';
        const textAlign: React.CSSProperties['textAlign'] = labelAlign;
        if (maxWidth > 0 || fullWidth) {
          return (
            <span className={`flex flex-col min-w-0 ${itemsClass}`} style={{ lineHeight: 1.3, flex: '1 1 auto', textAlign }}>
              <MarqueeText text={item.label} style={{ textAlign }} />
              {item.showLastChange && lastChangeText && (
                <MarqueeText
                  text={lastChangeText}
                  className="aura-last-change opacity-60"
                  style={{ fontSize: `${lcFontSize}px`, marginTop: 1, textAlign }}
                />
              )}
            </span>
          );
        }
        return (
          <span className={`flex flex-col ${itemsClass}`} style={{ lineHeight: 1.3, textAlign }}>
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
        );
      })()}
    </button>
  );
}

// ── MarqueeText ──────────────────────────────────────────────────────────────
// Renders `text` in an overflow-hidden container. Measures (via ResizeObserver)
// whether the natural text width exceeds the container; when it does, switches
// to a two-copy track that linearly translates -50% on loop — landing the
// second copy exactly where the first started, so the cycle is seamless. The
// animation duration is sized to a constant pixel-per-second speed so longer
// labels just take proportionally longer to traverse.

const MARQUEE_SPEED_PXPS = 35;
const MARQUEE_GAP_CHARS = '      ';

function MarqueeText({
  text, className, style,
}: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [duration, setDuration] = useState(10);

  useEffect(() => {
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return;
    const check = () => {
      const textW = measure.scrollWidth;
      const slot  = wrap.clientWidth;
      const isOverflowing = textW > slot + 1;
      setOverflow(isOverflowing);
      if (isOverflowing) {
        setDuration(Math.max(4, Math.round(textW / MARQUEE_SPEED_PXPS)));
      }
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(wrap);
    ro.observe(measure);
    return () => ro.disconnect();
  }, [text]);

  return (
    <span
      ref={wrapRef}
      className={`block overflow-hidden whitespace-nowrap relative ${className ?? ''}`}
      style={{ width: '100%', maxWidth: '100%', ...style }}
    >
      {/* Hidden width probe — always rendered with the raw text, never animated.
          Positioned absolutely so it doesn't contribute to layout flow. */}
      <span
        ref={measureRef}
        aria-hidden
        className="invisible pointer-events-none"
        style={{ position: 'absolute', whiteSpace: 'nowrap', left: 0, top: 0 }}
      >
        {text}
      </span>
      {overflow ? (
        <span
          className="aura-marquee-track"
          style={{ ['--marquee-duration' as never]: `${duration}s` }}
        >
          <span>{text}{MARQUEE_GAP_CHARS}</span>
          <span aria-hidden>{text}{MARQUEE_GAP_CHARS}</span>
        </span>
      ) : (
        <span>{text}</span>
      )}
    </span>
  );
}
