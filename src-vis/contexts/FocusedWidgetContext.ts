import { createContext, useContext } from 'react';

/**
 * Carries the id of a widget that should be visually highlighted (and scrolled
 * into view) on mount. Set by AdminEditor when it sees a ?focus=<id> deep link
 * — typically from the overview's broken-DP / orphan tables — and cleared
 * after a short timeout so the highlight is transient.
 */
export const FocusedWidgetContext = createContext<string | null>(null);

export function useFocusedWidgetId(): string | null {
    return useContext(FocusedWidgetContext);
}
