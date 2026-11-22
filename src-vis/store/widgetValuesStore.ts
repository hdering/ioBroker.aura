/**
 * Values a widget computes at runtime and hands to its header items (#1011).
 *
 * Header items normally derive everything from the stored config plus live states
 * (utils/headerItems), because the widget body is not mounted while folded. Some
 * numbers only exist in the body, though — the status overview's hint and device
 * counts come out of object discovery, the battery gate, remembered and ignored
 * hints. The body publishes them here under its widget id; the frame reads them.
 *
 * The last published values stay after the body unmounts, so a widget folded after
 * it was open keeps showing them. A widget folded from the start has none yet.
 */
import { useCallback, useSyncExternalStore } from 'react';

export type WidgetValues = Readonly<Record<string, number | null>>;

const values = new Map<string, WidgetValues>();
const listeners = new Map<string, Set<() => void>>();

function same(a: WidgetValues | undefined, b: WidgetValues): boolean {
    if (!a) return false;
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length) return false;
    return ka.every((k) => a[k] === b[k]);
}

/** Publish the widget's current values; listeners only hear about a real change. */
export function publishWidgetValues(widgetId: string, next: WidgetValues): void {
    if (!widgetId || same(values.get(widgetId), next)) return;
    values.set(widgetId, next);
    listeners.get(widgetId)?.forEach((l) => l());
}

export function getWidgetValues(widgetId: string): WidgetValues | undefined {
    return values.get(widgetId);
}

function subscribe(widgetId: string, listener: () => void): () => void {
    let set = listeners.get(widgetId);
    if (!set) listeners.set(widgetId, (set = new Set()));
    set.add(listener);
    return () => {
        set!.delete(listener);
        if (!set!.size) listeners.delete(widgetId);
    };
}

const noop = () => () => {};
const none = () => undefined;

/** The widget's published values; `active` false subscribes to nothing. */
export function useWidgetValues(widgetId: string | undefined, active: boolean): WidgetValues | undefined {
    const id = active && widgetId ? widgetId : '';
    const sub = useCallback((l: () => void) => (id ? subscribe(id, l) : noop()), [id]);
    const get = useCallback(() => (id ? values.get(id) : none()), [id]);
    return useSyncExternalStore(sub, get);
}
