import { createContext, useContext } from 'react';

/**
 * The z-index that leaf overlays (colour picker popover, icon picker) must render
 * at inside the current overlay context.
 *
 * Tier map:
 *   9999   CenteredModal (widget edit dialog, no backdrop), leaf pickers by default
 *   10000  ConfigModal (sub-editor dialogs) - HAS a 60% backdrop
 *   10040  leaf pickers opened from inside a ConfigModal
 *   10050  DatapointPicker (always opened from within some overlay)
 *
 * Why this exists: the widget edit dialog has no backdrop, so a leaf picker at the
 * same z-index still works - it simply mounts later in the DOM. A ConfigModal does
 * have a backdrop, so a picker opened from its content would disappear behind it.
 * ConfigModal therefore raises the tier for everything it renders. React context
 * flows through createPortal, so the pickers pick it up even though they portal out
 * of their own subtree. Outside a ConfigModal the default keeps every existing call
 * site unchanged.
 */
export const OverlayZContext = createContext<number>(9999);

export function useOverlayZ(): number {
    return useContext(OverlayZContext);
}
