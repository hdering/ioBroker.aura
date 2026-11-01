import type React from 'react';

/**
 * Condition effect "deaktivieren" on a single element — a list row, a row's value
 * or a custom-grid cell (issue #889). The widget-wide counterpart (`disableWidget`)
 * has a veil and a write-lock context; an element has neither, because its
 * controls get their `setState` handed down from the widget, above any context a
 * row could set. So the lock sits on the DOM instead:
 *
 *   - `.aura-cond-el-disabled` greys the element and drops the pointer events of
 *     everything inside it, so a slider or switch never becomes the event target;
 *   - the capture handlers stop what still reaches the element itself — a click on
 *     the row (popup, click action), a key press on a focused control — before any
 *     handler below or above it runs. Tab stays free, so focus can move on.
 *
 * `contents` keeps the wrapper out of the layout (display: contents) for spots
 * where a plain element would break the surrounding flex or grid.
 */
const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
};

const stopKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') return;
    stop(e);
};

const LOCK_HANDLERS = {
    onClickCapture: stop,
    onDoubleClickCapture: stop,
    onPointerDownCapture: stop,
    onMouseDownCapture: stop,
    onKeyDownCapture: stopKey,
    onChangeCapture: stop,
    onContextMenuCapture: stop,
};

export function condDisabledProps(disabled: boolean | undefined, className = '') {
    if (!disabled) return className ? { className } : {};
    return {
        className: `${className} aura-cond-el-disabled`.trim(),
        'aria-disabled': true,
        ...LOCK_HANDLERS,
    };
}

/** Wrap an element that has no box of its own to carry the lock (see above). */
export const COND_DISABLED_CONTENTS = 'aura-cond-el-disabled-contents';
