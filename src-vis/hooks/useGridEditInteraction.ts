import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

// ── Arranging widgets on touch devices (#699) ────────────────────────────────
// On a touch-primary device a tap meant to open a widget's menu easily registers
// as a grid drag; the grid then compacts the whole tab and persists new positions
// for every widget. So the grids stay locked on touch until the user switches on
// the "arrange" mode in the editor toolbar. Inside it a widget is moved only by
// its grip and resized only by its corner handle — both shown on the selected
// widget — and a swipe anywhere else keeps scrolling the page.

/** Class of the touch grip — the only drag handle while arranging on touch. */
export const TOUCH_DRAG_HANDLE = 'aura-drag-handle';
/** Root class while arranging on touch (CSS shows grips and handles). */
export const TOUCH_ARRANGE_CLASS = 'aura-touch-arrange';
/** A drag shorter than this is a tap that wobbled, never a move. */
const MIN_TOUCH_DRAG_PX = 8;
/** Distance to the scroller edge where a drag starts scrolling it along. */
const AUTO_SCROLL_EDGE_PX = 40;
const AUTO_SCROLL_STEP_PX = 14;

interface TouchArrangeState {
    arrange: boolean;
    setArrange: (arrange: boolean) => void;
}

/** Not persisted: every editor visit starts locked again. */
export const useTouchArrangeStore = create<TouchArrangeState>()((set) => ({
    arrange: false,
    setArrange: (arrange) => set({ arrange }),
}));

function coarseNow(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches
    );
}

/** Primary pointer is coarse (touch). Follows a change (tablet keyboard dock). */
export function useCoarsePointer(): boolean {
    const [coarse, setCoarse] = useState(coarseNow);
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
        const mq = window.matchMedia('(pointer: coarse)');
        const onChange = () => setCoarse(mq.matches);
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, []);
    return coarse;
}

type AnyEvent = Event | null | undefined;

function pointOf(e: AnyEvent): { x: number; y: number } | null {
    if (!e) return null;
    const te = e as TouchEvent;
    const touch = te.touches?.[0] ?? te.changedTouches?.[0];
    if (touch) return { x: touch.clientX, y: touch.clientY };
    const me = e as MouseEvent;
    return typeof me.clientX === 'number' ? { x: me.clientX, y: me.clientY } : null;
}

function scrollerOf(node: HTMLElement | null | undefined): HTMLElement | null {
    let el = node?.parentElement ?? null;
    while (el) {
        const { overflowX, overflowY } = getComputedStyle(el);
        if (/(auto|scroll)/.test(overflowX + overflowY)) return el;
        el = el.parentElement;
    }
    return null;
}

/** Scroll the grid's scroller along when a touch drag nears its edge. */
function autoScroll(e: AnyEvent, node: HTMLElement | null | undefined) {
    const p = pointOf(e);
    const scroller = scrollerOf(node);
    if (!p || !scroller) return;
    const r = scroller.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (p.x < r.left + AUTO_SCROLL_EDGE_PX) dx = -AUTO_SCROLL_STEP_PX;
    else if (p.x > r.right - AUTO_SCROLL_EDGE_PX) dx = AUTO_SCROLL_STEP_PX;
    if (p.y < r.top + AUTO_SCROLL_EDGE_PX) dy = -AUTO_SCROLL_STEP_PX;
    else if (p.y > r.bottom - AUTO_SCROLL_EDGE_PX) dy = AUTO_SCROLL_STEP_PX;
    if (dx || dy) scroller.scrollBy(dx, dy);
}

export interface GridEditInteraction {
    /** Primary pointer is touch. */
    coarse: boolean;
    /** Touch device with the arrange mode on: grip-only drags. */
    touchArrange: boolean;
    /** The grid may be dragged and resized at all. */
    editable: boolean;
    /** RGL `draggableHandle`: the grip while arranging on touch, else the whole item. */
    draggableHandle: string | undefined;
    /** Call from RGL onDragStart / onResizeStart with the event. */
    onInteractStart: (e: AnyEvent) => void;
    /** Call from RGL onDrag / onResize with the event and the item node. */
    onInteract: (e: AnyEvent, node?: HTMLElement | null) => void;
    /** Call from RGL onDragStop / onResizeStop: false = do not persist. */
    mayPersist: (e: AnyEvent) => boolean;
}

/** One source of truth for every react-grid-layout that edits widgets
 *  (dashboard, group, popup view, preset dialog). */
export function useGridEditInteraction(editMode: boolean): GridEditInteraction {
    const coarse = useCoarsePointer();
    const arrange = useTouchArrangeStore((s) => s.arrange);
    const touchArrange = coarse && arrange;
    const editable = editMode && (!coarse || arrange);
    const start = useRef<{ x: number; y: number } | null>(null);
    const far = useRef(false);

    const track = useCallback((e: AnyEvent) => {
        if (far.current || !start.current) return;
        const p = pointOf(e);
        if (p && Math.hypot(p.x - start.current.x, p.y - start.current.y) >= MIN_TOUCH_DRAG_PX) far.current = true;
    }, []);
    const onInteractStart = useCallback((e: AnyEvent) => {
        start.current = pointOf(e);
        far.current = false;
    }, []);
    const onInteract = useCallback(
        (e: AnyEvent, node?: HTMLElement | null) => {
            if (!touchArrange) return;
            track(e);
            autoScroll(e, node);
        },
        [touchArrange, track],
    );
    const mayPersist = useCallback(
        (e: AnyEvent) => {
            if (!editable) return false;
            if (!touchArrange) return true;
            track(e);
            // No start point (event without coordinates): rely on the grid's own
            // moved-check rather than dropping a real drag.
            return far.current || !start.current;
        },
        [editable, touchArrange, track],
    );

    return {
        coarse,
        touchArrange,
        editable,
        draggableHandle: touchArrange ? `.${TOUCH_DRAG_HANDLE}` : undefined,
        onInteractStart,
        onInteract,
        mayPersist,
    };
}

let domUsers = 0;

function clearSelection() {
    document.querySelectorAll('[data-aura-selected]').forEach((el) => el.removeAttribute('data-aura-selected'));
}

function onArrangePointerDown(e: PointerEvent) {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const item = target.closest('.react-grid-item');
    if (!item) {
        // Empty grid area deselects; toolbars, menus and dialogs keep the selection.
        if (target.closest('.react-grid-layout')) clearSelection();
        return;
    }
    if (item.hasAttribute('data-aura-selected')) return;
    clearSelection();
    item.setAttribute('data-aura-selected', '');
    item.querySelector('.aura-widget')?.setAttribute('data-aura-selected', '');
}

/** Mount once in the editor: root class + tap-to-select while arranging on touch.
 *  Selection is a DOM attribute on the grid item and its widget frame, so a tap
 *  re-renders nothing — the same in every nested grid. */
export function useTouchArrangeDom(active: boolean) {
    useEffect(() => (active ? attachTouchArrangeDom() : undefined), [active]);
}

/** Root class + selection listener; returns the detach. Ref-counted: the editor
 *  toolbar and a dialog above it may both hold it (also used by the test harness). */
export function attachTouchArrangeDom(): () => void {
    if (typeof document === 'undefined') return () => {};
    if (domUsers++ === 0) {
        document.documentElement.classList.add(TOUCH_ARRANGE_CLASS);
        document.addEventListener('pointerdown', onArrangePointerDown, true);
    }
    let done = false;
    return () => {
        if (done) return;
        done = true;
        if (--domUsers > 0) return;
        document.removeEventListener('pointerdown', onArrangePointerDown, true);
        document.documentElement.classList.remove(TOUCH_ARRANGE_CLASS);
        clearSelection();
    };
}
