import { createContext, useContext } from 'react';

/**
 * Provides the active layout ID to all descendants so they can
 * resolve per-layout effective settings without prop drilling.
 * undefined = use global settings (no layout override).
 */
export const ActiveLayoutContext = createContext<string | undefined>(undefined);

export function useActiveLayoutId(): string | undefined {
  return useContext(ActiveLayoutContext);
}
