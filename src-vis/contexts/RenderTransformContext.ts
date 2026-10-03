import { createContext, useContext } from 'react';
import type { WidgetConfig } from '../types';

/**
 * Display-only rewrite of a widget's config, applied by WidgetFrame to the copy the
 * body renders — never to the edit dialog, never to what gets written back. The
 * popup-view editor uses it to resolve `{{dp}}` & co. against a real datapoint, so a
 * chart shows that datapoint's history instead of a sample curve; a device card
 * (#743) resolves its children against the card's main datapoint the same way.
 */
export type RenderTransform = (config: WidgetConfig) => WidgetConfig;

export const RenderTransformContext = createContext<RenderTransform | null>(null);

export function useRenderTransform(): RenderTransform | null {
    return useContext(RenderTransformContext);
}

/**
 * Runtime scope of the widgets below (#743). Device cards share one set of child
 * widgets — same ids in every card — so every registry that is keyed by widget id
 * at runtime (condition verdicts, reflow-hidden set, content heights, reload
 * nonces, collapse state) has to tell the copies apart. Inside a scope those
 * registries use `runtimeId()`; everything persisted keeps the real id.
 */
export const RuntimeScopeContext = createContext<string | null>(null);

export function useRuntimeScope(): string | null {
    return useContext(RuntimeScopeContext);
}

/** The id a widget registers under at runtime: the real id outside any scope. */
export function runtimeId(id: string, scope: string | null | undefined): string {
    return scope ? `${scope}~${id}` : id;
}
