import { createContext, useContext, useMemo } from 'react';

/**
 * Ids of the tabs the widgets below are rendered in — the outer tab first, then
 * every tab a tab mirror nests inside it. A mirror that would show a tab already
 * on this chain (itself, or a tab that mirrors it back) would recurse forever, so
 * MirrorWidget refuses it.
 */
const TabChainContext = createContext<readonly string[]>([]);

export function useTabChain(): readonly string[] {
    return useContext(TabChainContext);
}

/** Appends `tabId` to the chain for everything below. */
export function TabChainProvider({ tabId, children }: { tabId: string; children: React.ReactNode }) {
    const parent = useContext(TabChainContext);
    const value = useMemo(() => [...parent, tabId], [parent, tabId]);
    return <TabChainContext.Provider value={value}>{children}</TabChainContext.Provider>;
}
