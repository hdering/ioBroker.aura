import { createContext, useContext } from 'react';

/**
 * Are we inside an off-screen probe render? (components/layout/RenderProbe.tsx)
 *
 * Its own module so the widgets that have to know can ask without importing the
 * probe — which imports Dashboard, which imports the widgets.
 *
 * Two kinds of consumer:
 *   - a widget with a side effect on mount: a camera starts a stream and, with a
 *     wake-up datapoint, writes SLEEP again when it unmounts. A probe must never
 *     touch a device somebody else is watching, so those draw a plain box (their
 *     height is the box in any case — they fill whatever they get).
 *   - the render report itself, so the answer can say the measurement comes from
 *     a tab nobody had open rather than from a screen somebody was looking at.
 */
export const ProbeContext = createContext(false);

export function useIsProbe(): boolean {
    return useContext(ProbeContext);
}

/**
 * A probe that fills the runtime lists to their cap (aura_rendered fill=true).
 *
 * "Nothing cut off" from a status overview only says something about the entries
 * that happened to be there: three open windows fit where ten would scroll.
 * In a fill probe the widgets whose rows appear at runtime draw `maxRows` entries
 * plus one (so the „+N weitere“ line shows where it would) with long names — the
 * worst case the cap allows instead of the current state.
 */
export const ProbeFillContext = createContext(false);

export function useProbeFill(): boolean {
    return useContext(ProbeFillContext);
}

/** A device name long enough to wrap in a narrow tile — the fill probe's worst case. */
export const PROBE_FILL_NAME = 'Fensterkontakt Wohnzimmer Terrassentür links oben';

/**
 * Types a probe render replaces with an empty box.
 *
 * A camera starts a stream on mount and — with a wake-up datapoint — writes
 * SLEEP on unmount, so a measurement would switch off a camera somebody else is
 * watching. An iframe would fetch a foreign page for nothing. Both fill whatever
 * box the grid gives them, so the box IS their height: replacing them costs the
 * measurement nothing.
 */
export const PROBE_SKIP_TYPES = new Set(['camera', 'iframe']);

/** Stands in for a skipped widget: the card, and nothing inside it. */
export function ProbeBox() {
    return <div className="w-full h-full" style={{ background: 'var(--app-bg)' }} />;
}
