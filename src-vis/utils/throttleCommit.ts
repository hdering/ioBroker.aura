/**
 * Rate limiter for values that a dragging control emits far faster than the app can
 * absorb them.
 *
 * The case it was written for: the colour picker. `<input type="color">` and the
 * alpha slider fire `input` on every pointer move, and each of those runs the full
 * config path — updateWidget rebuilds the layout tree, zustand-persist serializes
 * the WHOLE dashboard (~250 kB in a mid-size setup, ~3 ms just for stringify plus
 * the synchronous localStorage write) and every store subscriber re-renders. At
 * ~60 events/s the main thread never catches up, so the page and the native picker
 * itself stutter.
 *
 * Shape: the first value is applied immediately (a single click stays instant),
 * anything arriving inside the window is coalesced to the newest one and delivered
 * by the trailing run, and `flush()` hands over whatever is still pending — call it
 * when the interaction ends (pointer released, field left, popover closed, unmount)
 * so the final value is never the throttled-away one.
 */
export interface ThrottledCommit<T> {
    /** Feed a value; safe to call on every pointer move. */
    push: (value: T) => void;
    /** Deliver the pending value now and cancel the trailing run. */
    flush: () => void;
}

export function createThrottle<T>(apply: (value: T) => void, ms: number): ThrottledCommit<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: { value: T } | null = null;

    const flush = () => {
        if (timer) {
            clearTimeout(timer);
            timer = undefined;
        }
        if (!pending) return;
        const { value } = pending;
        pending = null;
        apply(value);
    };

    const push = (value: T) => {
        if (timer) {
            // Inside the window — the trailing run delivers the newest value.
            pending = { value };
            return;
        }
        apply(value);
        timer = setTimeout(() => {
            timer = undefined;
            flush();
        }, ms);
    };

    return { push, flush };
}
