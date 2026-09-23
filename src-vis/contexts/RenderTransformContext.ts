import { createContext, useContext } from 'react';
import type { WidgetConfig } from '../types';

/**
 * Display-only rewrite of a widget's config, applied by WidgetFrame to the copy the
 * body renders — never to the edit dialog, never to what gets written back. The
 * popup-view editor uses it to resolve `{{dp}}` & co. against a real datapoint, so a
 * chart shows that datapoint's history instead of a sample curve.
 */
export type RenderTransform = (config: WidgetConfig) => WidgetConfig;

export const RenderTransformContext = createContext<RenderTransform | null>(null);

export function useRenderTransform(): RenderTransform | null {
    return useContext(RenderTransformContext);
}
