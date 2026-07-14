import { useEffect, useRef } from 'react';
import { setStateDirect } from './useIoBroker';
import { NS } from '../utils/namespace';
import { isScreenshotMode } from '../store/persistManager';
import type { DashboardLayout, Section, Tab } from '../store/dashboardStore';

const LAYOUT_DP = `${NS}.info.activeLayout`;
const SECTION_DP = `${NS}.info.activeSection`;
const TAB_DP = `${NS}.info.activeTab`;

/** Human-readable label for a nav node (name → slug → id → ''). */
function label(node: { name?: string; slug?: string; id?: string } | undefined): string {
    if (!node) return '';
    return node.name || node.slug || node.id || '';
}

/**
 * Mirrors the frontend's currently displayed layout / section (Bereich) / tab
 * into the read-only ioBroker states info.activeLayout / .activeSection /
 * .activeTab. Writes only the DPs whose label actually changed, and only while
 * the socket is connected — so scripts and other adapters can react to what the
 * dashboard is showing.
 *
 * Per-instance, last-navigation-wins: with several devices open, the DP holds
 * whatever the most recent one navigated to. The screenshot harness is exempt
 * (it must never write to the proxied real instance).
 */
export function useActiveSelectionSync(
    connected: boolean,
    layout: DashboardLayout | undefined,
    section: Section | undefined,
    activeTab: Tab | undefined,
): void {
    // Last value written per DP — avoids redundant setState traffic on every
    // unrelated re-render. Reset when the socket drops so the current selection
    // is re-pushed on reconnect.
    const written = useRef<{ layout: string; section: string; tab: string }>({ layout: '', section: '', tab: '' });

    useEffect(() => {
        if (!connected) {
            written.current = { layout: '', section: '', tab: '' };
            return;
        }
        if (isScreenshotMode()) return;

        const next = { layout: label(layout), section: label(section), tab: label(activeTab) };
        if (next.layout !== written.current.layout) setStateDirect(LAYOUT_DP, next.layout, true);
        if (next.section !== written.current.section) setStateDirect(SECTION_DP, next.section, true);
        if (next.tab !== written.current.tab) setStateDirect(TAB_DP, next.tab, true);
        written.current = next;
    }, [connected, layout, section, activeTab]);
}
