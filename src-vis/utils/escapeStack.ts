/**
 * Escape handling for overlays that stack on top of each other.
 *
 * The editor routinely has several layers open at once: the widget edit dialog,
 * a sub-editor inside it, and on top of that a picker (datapoint, icon, colour).
 * When every layer registers its own `keydown` listener, one Escape reaches all
 * of them — `stopPropagation()` does not help, because listeners attached to the
 * SAME node (`document`) all run regardless. The result was the reported bug:
 * Escape in the datapoint picker closed the dialog behind it instead.
 *
 * This module keeps one listener for the whole app plus a stack of open layers
 * in mount order. Escape is delivered to the topmost layer only, and stopped
 * there, so nothing below reacts. A layer that is mounted but currently inactive
 * passes `enabled: false` and is skipped.
 */
import { useEffect, useRef } from 'react';

interface EscapeLayer {
    close: () => void;
}

const stack: EscapeLayer[] = [];
let listening = false;

function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    const top = stack[stack.length - 1];
    if (!top) return;
    // Capture phase: the event is swallowed before it reaches any element
    // handler below, so only the topmost layer acts on it.
    e.stopPropagation();
    top.close();
}

function pushLayer(layer: EscapeLayer) {
    stack.push(layer);
    if (!listening) {
        document.addEventListener('keydown', onKeyDown, true);
        listening = true;
    }
}

function removeLayer(layer: EscapeLayer) {
    const i = stack.indexOf(layer);
    if (i >= 0) stack.splice(i, 1);
    if (stack.length === 0 && listening) {
        document.removeEventListener('keydown', onKeyDown, true);
        listening = false;
    }
}

/**
 * Closes this overlay on Escape — but only while it is the topmost open one.
 *
 * @param onClose  Called when Escape reaches this layer.
 * @param enabled  Set false while the layer is mounted but not the active one
 *                 (e.g. a popover whose `open` state is false).
 */
export function useEscapeLayer(onClose: () => void, enabled = true) {
    // Keep the layer identity stable across re-renders: re-pushing on every new
    // callback would move the layer back to the top of the stack.
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useEffect(() => {
        if (!enabled) return;
        const layer: EscapeLayer = { close: () => closeRef.current() };
        pushLayer(layer);
        return () => removeLayer(layer);
    }, [enabled]);
}

/** Test hook: number of currently open Escape layers. */
export function escapeLayerCount(): number {
    return stack.length;
}
