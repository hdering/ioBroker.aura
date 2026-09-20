import { useMemo } from 'react';
import { resolveDualDeep } from '../utils/dualColor';
import { useIsDarkTheme } from '../contexts/BrightnessContext';

/**
 * A config (or any part of one) with its light/dark colour pairs collapsed to the
 * half that applies right now (#689).
 *
 * WidgetFrame does this inline, inside the useMemo that already derives the
 * render config. This hook is for the handful of places that render a widget
 * WITHOUT a frame around it — the mirror widget and the two popup embeds build
 * their own config and hand it straight to the widget component.
 *
 * Keeps the input reference while nothing changes, so it does not defeat the
 * memoisation of whatever it is fed into.
 */
export function useDualResolved<T>(value: T): T {
    const dark = useIsDarkTheme();
    return useMemo(() => resolveDualDeep(value, dark), [value, dark]);
}
