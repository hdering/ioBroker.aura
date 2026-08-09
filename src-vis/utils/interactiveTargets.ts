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
