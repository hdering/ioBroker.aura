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
 *  bar. Bottom-positioned bars sit below the grid and do not shift the top.
 *  Used only as a FALLBACK for the editor before the frontend has measured the
 *  real chrome (see below). The frontend itself always measures the DOM, so its
 *  guideline is exact for any styling. */
export function guidelinesTopInset(f: GuidelinesChromeFlags): number {
    let c = 0;
    if (f.showHeader) c += GUIDELINES_CHROME.header;
    if (f.tabBarVisible && !f.tabBarAtBottom) c += GUIDELINES_CHROME.tabBar;
    if (f.sectionBarTop) c += GUIDELINES_CHROME.sectionBar;
    return c;
}

// ── Shared measured inset ───────────────────────────────────────────────────
// The editor preview does not render the device chrome, so it cannot measure the
// real top inset. The frontend CAN (it renders the real header + bars), so it
// publishes its measured inset per layout/section to localStorage; the editor
// reads it back. Same origin (the admin editor and the frontend are the same
// SPA), so the value is shared across tabs. Falls back to the estimator above
// until the frontend of that layout has been opened at least once.
const INSET_LS_KEY = 'aura-guideline-inset';
type InsetMap = Record<string, number>;

function readInsetMap(): InsetMap {
    try {
        const raw = localStorage.getItem(INSET_LS_KEY);
        return raw ? (JSON.parse(raw) as InsetMap) : {};
    } catch {
        return {};
    }
}

export function insetKeyFor(layoutId: string | undefined, sectionId: string | undefined): string {
    return `${layoutId ?? ''}::${sectionId ?? ''}`;
}

/** Persist the frontend-measured top inset for a layout/section. */
export function storeMeasuredInset(key: string, inset: number): void {
    try {
        const map = readInsetMap();
        if (map[key] === inset) return;
        map[key] = inset;
        localStorage.setItem(INSET_LS_KEY, JSON.stringify(map));
    } catch {
        // localStorage unavailable (private mode etc.) — the editor just falls
        // back to the estimator; not worth surfacing.
    }
}

/** Read the last frontend-measured top inset for a layout/section, or null. */
export function readMeasuredInset(key: string): number | null {
    const v = readInsetMap()[key];
    return typeof v === 'number' ? v : null;
}
