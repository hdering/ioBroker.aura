// ── Guideline chrome inset ─────────────────────────────────────────────────
// The horizontal guideline marks the target *device's* bottom screen edge. The
// grid content starts below the device chrome (header + a top-positioned tab bar
// / section bar), so in grid content coordinates the device bottom sits at
// `guidelinesHeight − topInset`, where topInset is the height of the chrome
// rendered ABOVE the grid.
//
// This value is computed from the effective settings (NOT measured from the DOM)
// so it is identical in the frontend and in the editor preview — the editor does
// not render the chrome, so a DOM measurement there would be wrong (issue #489).
//
// Heights are calibrated against the rendered frontend with default styling
// (measured: header 65, tab bar 44, section bar 48). The guideline is a layout
// planning aid; heavily customised chrome (large tab-bar font, underline
// indicator, multi-line header) can shift these by a few px.
export const GUIDELINES_CHROME = { header: 65, tabBar: 44, sectionBar: 48 } as const;

export interface GuidelinesChromeFlags {
    /** Frontend header shown (settings.showHeader). */
    showHeader: boolean;
    /** Tab bar rendered at all (more than one tab, or "show for single"). */
    tabBarVisible: boolean;
    /** Tab bar placed below the grid (footer) instead of above it. */
    tabBarAtBottom: boolean;
    /** Docked section bar rendered ABOVE the grid (placement 'top'). */
    sectionBarTop: boolean;
}

/** Height (px) of the chrome above the grid — header + top section bar + top tab
 *  bar. Bottom-positioned bars sit below the grid and do not shift the top. */
export function guidelinesTopInset(f: GuidelinesChromeFlags): number {
    let c = 0;
    if (f.showHeader) c += GUIDELINES_CHROME.header;
    if (f.tabBarVisible && !f.tabBarAtBottom) c += GUIDELINES_CHROME.tabBar;
    if (f.sectionBarTop) c += GUIDELINES_CHROME.sectionBar;
    return c;
}
