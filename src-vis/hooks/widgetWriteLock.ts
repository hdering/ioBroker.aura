import { createContext, useContext } from 'react';

/**
 * True while a widget body is rendered in the admin editor with the control lock
 * on (issue #655). Every write a widget makes on the user's behalf must check it:
 * the editor is a design surface, so a stray click — or an effect that syncs a
 * datapoint on mount — must never reach the real house.
 *
 * The pointer lock in WidgetFrame already swallows clicks, but it cannot cover
 * the two remaining paths: widget types that stay interactive while editing
 * (group, panels — their children must remain selectable) and writes that run
 * from an effect without any click at all. This context is that second line.
 *
 * `useIoBroker().setState` honours it for free. Widgets that write through the
 * hook-free helpers (setStateDirect, sendToDirect) must read it themselves.
 */
export const WidgetWriteLockContext = createContext(false);

/** True when the surrounding widget must not write anything (see the context). */
export function useWidgetWriteLock(): boolean {
    return useContext(WidgetWriteLockContext);
}
