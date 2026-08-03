/**
 * Auto-provisioned control datapoint for panels widgets:
 * aura.0.panels.<widgetId>.activeSlide
 *
 * The adapter pre-creates aura.0.panels as a channel; each panels widget creates
 * its own channel + state, so the datapoint exists — and can be wired to buttons
 * — the moment the widget is added, without the user having to pick or create
 * one. A widget may still point at its own datapoint instead (options.activeDp);
 * the auto datapoint stays as the documented default.
 *
 * The slide list is mirrored into `common.states` ({ "0": "Kitchen", … }), so a
 * select/enum control can offer the slides by name: the Auswahlfeld widget's
 * "import from common.states" reads exactly this map, and ioBroker's admin shows
 * a dropdown instead of a raw number.
 */
import { setObjectDirect, deleteObjectDirect } from '../hooks/useIoBroker';
import { isScreenshotMode } from '../store/persistManager';
import { NS } from './namespace';

const NAMESPACE = `${NS}.panels`;

export function panelChannelId(widgetId: string): string {
    return `${NAMESPACE}.${widgetId}`;
}

export function panelActiveStateId(widgetId: string): string {
    return `${NAMESPACE}.${widgetId}.activeSlide`;
}

// Last published signature per widget, so re-renders don't re-emit setObject.
const published = new Map<string, string>();

/**
 * Create/refresh the widget's channel + activeSlide state. `labels` are the slide
 * names in order; `base` is the value the first slide answers to.
 *
 * The object is written whole rather than extended: ioBroker deep-merges
 * `extendObject`, which would keep `common.states` entries of slides that have
 * since been deleted.
 */
export function publishPanelSlides(widgetId: string, title: string | undefined, labels: string[], base: number): void {
    if (!widgetId || !labels.length) return;
    // The screenshot harness runs against the real instance — never write there.
    if (isScreenshotMode()) return;

    const name = title?.trim() || 'Panels widget';
    const states: Record<string, string> = {};
    labels.forEach((label, i) => {
        states[String(i + base)] = label;
    });

    const signature = JSON.stringify([name, states]);
    if (published.get(widgetId) === signature) return;
    published.set(widgetId, signature);

    setObjectDirect(panelChannelId(widgetId), {
        type: 'channel',
        common: { name },
        native: {},
    });
    setObjectDirect(panelActiveStateId(widgetId), {
        type: 'state',
        common: {
            name: `${name} — active slide`,
            type: 'number',
            // role 'level' (not 'value') because the frontend writes this via socket
            // with ack=false; 'value' requires write:false in the ioBroker role catalogue.
            role: 'level',
            read: true,
            write: true,
            def: base,
            min: base,
            max: base + labels.length - 1,
            states,
        },
        native: {},
    });
}

/** Remove the widget's state + channel objects. Safe to call if they don't exist. */
export async function unpublishPanel(widgetId: string): Promise<void> {
    published.delete(widgetId);
    await deleteObjectDirect(panelActiveStateId(widgetId));
    await deleteObjectDirect(panelChannelId(widgetId));
}
