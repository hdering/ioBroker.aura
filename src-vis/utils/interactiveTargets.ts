/**
 * Shared "is this click owned by a control?" test.
 *
 * Interactive elements (buttons, inputs, links, ...) must be able to act alone:
 * a click on the switch inside a list row toggles the datapoint and must NOT also
 * open a popup. `data-no-popup` marks a subtree that swallows the popup explicitly
 * (a list row that opens its own popup uses it so the surrounding widget frame
 * stays quiet), `data-allow-popup` is the escape hatch that re-enables the popup
 * inside an otherwise interactive subtree.
 *
 * Used by WidgetFrame (widget click action) and by the list widgets (row click).
 */
export const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, [data-widget-interactive], [data-no-popup]';

/**
 * Walks up from `target` to (but excluding) `container` - closest match wins.
 * Returns true when a control claims the click and the popup must be suppressed.
 */
export function isInteractiveTarget(target: EventTarget | null, container: HTMLElement): boolean {
    let el = target as HTMLElement | null;
    while (el && el !== container) {
        if (typeof el.matches !== 'function') break;
        if (el.matches('[data-allow-popup]')) return false;
        if (el.matches(INTERACTIVE_SELECTOR)) return true;
        el = el.parentElement;
    }
    return false;
}

/**
 * Swallows the `click` the browser fires after a pointer drag.
 *
 * A drag handle only sees pointerdown/pointerup. The click that follows is
 * dispatched on the common ancestor of both targets, so as soon as the pointer
 * leaves the handle that ancestor is the surrounding card - and inside a group
 * with a click action the release opened its popup (issue #619). Marking the
 * handle interactive only covers releases that land back on it, so a drag
 * additionally eats the next click in the capture phase. The timeout is the
 * escape hatch for releases that produce no click at all (pointercancel, or a
 * release outside the window).
 */
export function suppressNextClick(windowMs = 400): void {
    if (typeof window === 'undefined') return;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), windowMs);
    window.addEventListener(
        'click',
        (e) => {
            e.stopPropagation();
            clearTimeout(timer);
            ctl.abort();
        },
        { capture: true, signal: ctl.signal },
    );
}
