/**
 * How an iframe widget splits pointer events between its embedded document and
 * the widget's own click action.
 *
 * A cross-document iframe is its own event target: clicks inside it never enter
 * the host document's event path, so the frame-level click action can never fire
 * from a click on the embedded page. The three modes make that trade-off explicit
 * instead of leaving it as a surprising side effect of a boolean. (issue #527)
 *
 * - `action`      transparent blocker over the frame — the click hits host DOM and
 *                 triggers the click action; the embedded page is not operable.
 * - `content`     embedded page is operable, and the frame offers a small host-side
 *                 button that triggers the click action.
 * - `contentOnly` embedded page is operable, no button — click action stays inert.
 */
export type IframeInteractionMode = 'action' | 'content' | 'contentOnly';

export const IFRAME_INTERACTION_MODES: { value: IframeInteractionMode; label: string }[] = [
    { value: 'action', label: 'Nur Klick-Aktion (Inhalt gesperrt)' },
    { value: 'content', label: 'Inhalt bedienbar + Aktions-Button' },
    { value: 'contentOnly', label: 'Nur Inhalt (Klick-Aktion inaktiv)' },
];

/**
 * Resolves the mode from widget options, migrating the legacy `allowInteraction`
 * boolean: `false` was the only setting where the click action worked, so it maps
 * to `action`; everything else becomes `content` — which now gains the button, so
 * existing widgets with interaction enabled get a reachable click action.
 */
export function resolveIframeInteractionMode(opts: Record<string, unknown> | undefined): IframeInteractionMode {
    const stored = opts?.interactionMode;
    if (stored === 'action' || stored === 'content' || stored === 'contentOnly') return stored;
    return opts?.allowInteraction === false ? 'action' : 'content';
}

/**
 * Scrollbar policy for an embedded frame, derived from the interaction mode.
 *
 * An embedded document owns its scrollbars: cross-origin CSS cannot reach them, so
 * the frame's `scrolling` attribute is the only lever the host has. Windows/Chrome
 * desktop paints classic, space-taking scrollbars, so a page that overflows its frame
 * by a few pixels shows a permanent bar at every widget size — while tablets hide the
 * same overflow behind auto-fading overlay scrollbars, which is why this only ever
 * gets reported from desktops. (issue #529)
 *
 * In `action` mode a blocker swallows every pointer event, so the bar is dead chrome
 * and gets suppressed. Both content modes keep the page operable, and scrolling it is
 * part of operating it.
 */
export function iframeScrollingAttr(mode: IframeInteractionMode): 'auto' | 'no' {
    return mode === 'action' ? 'no' : 'auto';
}
