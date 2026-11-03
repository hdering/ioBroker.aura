/**
 * Swipe navigation (#908): a finger swipe across the dashboard switches tab or
 * section. The pure parts live here — gesture classification, the next target,
 * and the "does something under the finger own this gesture?" test — so the hook
 * in useSwipeNavigation only wires events.
 */

export type SwipeAction = 'tabs' | 'sections' | 'off';
export type SwipeDir = 'left' | 'right' | 'up' | 'down';

/** A swipe this long always counts. */
export const SWIPE_MIN_PX = 60;
/** A shorter, fast flick counts too — from this distance on ... */
export const SWIPE_FLICK_PX = 30;
/** ... at this speed (px/ms). */
export const SWIPE_FLICK_SPEED = 0.5;
/** The main axis has to beat the other one by this factor. */
export const SWIPE_DOMINANCE = 1.5;
/** Slower drags are reading / scrolling, not a swipe. */
export const SWIPE_MAX_MS = 1000;
/** Horizontal swipes starting this close to the screen edge belong to the OS back gesture. */
export const SWIPE_EDGE_PX = 20;

/** Direction the finger moved, or null when the movement is no swipe. */
export function classifySwipe(dx: number, dy: number, ms: number): SwipeDir | null {
    if (ms > SWIPE_MAX_MS) return null;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const horizontal = ax >= ay;
    const main = horizontal ? ax : ay;
    const cross = horizontal ? ay : ax;
    if (main < cross * SWIPE_DOMINANCE) return null;
    const fast = ms > 0 && main / ms >= SWIPE_FLICK_SPEED;
    if (main < SWIPE_MIN_PX && !(fast && main >= SWIPE_FLICK_PX)) return null;
    if (horizontal) return dx < 0 ? 'left' : 'right';
    return dy < 0 ? 'up' : 'down';
}

/**
 * Finger to the left / up = forward (like turning a page), right / down = back.
 */
export function swipeStep(dir: SwipeDir): 1 | -1 {
    return dir === 'left' || dir === 'up' ? 1 : -1;
}

/**
 * The entry `step` places away from `currentId` among the reachable ones.
 * Returns null at the end of the list (unless `wrap`) or when nothing else is reachable.
 * An unreachable current entry (e.g. a hidden tab opened by URL) counts from its
 * position in the full list.
 */
export function stepTarget<T extends { id: string }>(
    all: T[],
    reachable: (item: T) => boolean,
    currentId: string | undefined,
    step: 1 | -1,
    wrap: boolean,
): T | null {
    const n = all.length;
    const cur = all.findIndex((it) => it.id === currentId);
    if (n < 2) return null;
    // Not in the list: start just outside it, so the first step lands on the first / last entry.
    let i = cur >= 0 ? cur : step === 1 ? -1 : n;
    for (let k = 0; k < n; k++) {
        i += step;
        if (i < 0 || i >= n) {
            if (!wrap) return null;
            i = (i + n) % n;
        }
        if (all[i].id !== currentId && reachable(all[i])) return all[i];
    }
    return null;
}

/** Controls that keep every gesture for themselves. */
const OWN_GESTURE_SELECTOR = 'input[type="range"], textarea, select, [contenteditable="true"], [data-swipe-ignore]';

export interface SwipeStartInfo {
    /** Something under the finger handles horizontal drags itself. */
    blockX: boolean;
    /** Something under the finger handles vertical drags itself. */
    blockY: boolean;
    /** Every scroller under the finger may not scroll further in that direction. */
    atLeft: boolean;
    atRight: boolean;
    atTop: boolean;
    atBottom: boolean;
}

const SCROLLING = /(auto|scroll|overlay)/;

/**
 * What the element tree under the finger allows, read once at touchstart (the
 * scroll positions change while the finger moves — the start is what counts).
 *
 * `touch-action` is the signal widgets already set for their own drags (slider,
 * dimmer, knob, panels, slideshow, map …): `pan-y` means "horizontal is mine",
 * `pan-x` the other way round, `none` both. A scroller that can still move in
 * the swipe direction gets the gesture as well — the swipe only switches views
 * once the content has reached its edge.
 */
export function inspectSwipeStart(target: EventTarget | null, host: HTMLElement): SwipeStartInfo {
    const info: SwipeStartInfo = {
        blockX: false,
        blockY: false,
        atLeft: true,
        atRight: true,
        atTop: true,
        atBottom: true,
    };
    let el = target instanceof Element ? (target as HTMLElement) : null;
    while (el) {
        if (el.matches(OWN_GESTURE_SELECTOR)) {
            info.blockX = info.blockY = true;
            return info;
        }
        const cs = getComputedStyle(el);
        const ta = cs.touchAction;
        if (ta && ta !== 'auto' && ta !== 'manipulation') {
            if (ta === 'none' || !/pan-(x|left|right)/.test(ta)) info.blockX = true;
            if (ta === 'none' || !/pan-(y|up|down)/.test(ta)) info.blockY = true;
        }
        if (SCROLLING.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
            if (el.scrollTop > 1) info.atTop = false;
            if (el.scrollTop + el.clientHeight < el.scrollHeight - 2) info.atBottom = false;
        }
        if (SCROLLING.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
            // scrollLeft is negative in RTL scrollers — compare magnitudes.
            const left = Math.abs(el.scrollLeft);
            if (left > 1) info.atLeft = false;
            if (left + el.clientWidth < el.scrollWidth - 2) info.atRight = false;
        }
        if (el === host) break;
        el = el.parentElement;
    }
    return info;
}

/** May a swipe in `dir` act, given what lay under the finger at its start? */
export function swipeAllowed(dir: SwipeDir, info: SwipeStartInfo): boolean {
    switch (dir) {
        // Finger moves left = content would scroll right.
        case 'left':
            return !info.blockX && info.atRight;
        case 'right':
            return !info.blockX && info.atLeft;
        case 'up':
            return !info.blockY && info.atBottom;
        case 'down':
            return !info.blockY && info.atTop;
    }
}
