/**
 * What the widgets of the open tab ACTUALLY measure in the browser.
 *
 * The MCP server can read the configuration and it can compute a height from
 * measured per-type metrics — but it cannot look at the result. Reported from a
 * session that laid out 28 lists: every number that turned out right came from
 * reading the real DOM through the browser, not from the server. The static
 * metrics table also ages with every CSS commit, and nothing says so.
 *
 * This closes that gap the cheap way: the frontend already knows its own layout,
 * so once a tab has settled it sends the rendered height, the content height and
 * whether anything scrolls to the adapter (sendTo 'renderReport', the same route
 * the load-time metrics take). `aura_rendered` reads it back and compares it with
 * the estimate — so „braucht 52 px“ and „rendert 66 px und scrollt“ can finally
 * be told apart.
 *
 * Only the ACTIVE tab is reported: a hidden tab is `display: none` and measures
 * zero. That is a limit, not a defect — the answer names the tab and the age of
 * the measurement, and a tab nobody has opened simply has none.
 */
import { sendToDirect } from '../hooks/useIoBroker';
import { NS } from './namespace';
import { useConnectionStore } from '../store/connectionStore';

export interface RenderedWidget {
    id: string;
    type: string;
    /** gridPos.h as configured, so the server can compare rows with pixels. */
    rows: number;
    /** Rendered height of the grid item, in CSS pixels. 0 = the card draws nothing. */
    px: number;
    /** Height the content would need — px plus whatever is scrolled away. */
    contentPx: number;
    /** Something inside the card scrolls vertically. */
    scrolls: boolean;
    /**
     * The box grows with its content instead of being given a height by the grid.
     *
     * This decides whether `contentPx` is an answer or just the box: where the
     * card is content-sized (group, mediaplayer, the stacking weather layouts on
     * mobile) it IS what the content needs, and so it is where something scrolls.
     * On a fixed grid box with nothing scrolled away, `contentPx` equals the card
     * and says only "at most this much" — the browser cannot see how much of a
     * card with reserve is empty. Without this flag the server compared a card's
     * height against a minimum requirement and called every deliberate reserve a
     * deviation.
     */
    autoBox: boolean;
    /**
     * Text elements cut off sideways (ellipsis / overflow hidden). The vertical
     * check cannot see a title shortened to "Küche Lic…" — nothing scrolls there.
     */
    clipX?: number;
}

export interface RenderReport {
    tabId: string;
    tab: string;
    /**
     * Measured in an off-screen probe render (components/layout/RenderProbe.tsx)
     * rather than on a screen somebody was looking at. Same grid, same width, and
     * the camera/iframe widgets are left out — so the answer says so instead of
     * passing it off as a measurement from a visible tab.
     */
    probe?: boolean;
    viewport: { w: number; h: number };
    /** Width of the grid the widgets were laid out in (in a probe: the requested one). */
    gridWidth?: number;
    presentation: { fontScale: number; widgetPadding: number };
    grid: { rowHeight: number; gap: number; snapX: number };
    widgets: RenderedWidget[];
    /**
     * Widgets of this tab a condition took out of the layout ("reflow"): they are
     * mounted off-screen and are deliberately not part of the grid. Reported so
     * that a widget missing from the measurement gets a reason instead of no line
     * at all.
     */
    hidden: string[];
}

/** Screenshot harness runs offline and must not emit instance writes. */
function shotMode(): boolean {
    return typeof window !== 'undefined' && Boolean((window as unknown as { __auraShot?: unknown }).__auraShot);
}

/**
 * The scrolled-away height inside one card.
 *
 * Walks the card once and only resolves styles for elements that overflow at
 * all — `scrollHeight`/`clientHeight` are layout reads on an already-laid-out
 * tree, `getComputedStyle` is the expensive part and it runs on a handful of
 * nodes instead of all of them.
 */
function hiddenPxInside(card: HTMLElement): number {
    let hidden = 0;
    for (const el of Array.from(card.querySelectorAll<HTMLElement>('*'))) {
        const over = el.scrollHeight - el.clientHeight;
        if (over <= 1 || el.clientHeight <= 0) {
            continue;
        }
        const overflowY = getComputedStyle(el).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') {
            hidden = Math.max(hidden, over);
        }
    }
    return hidden;
}

/**
 * Text elements inside one card that are cut off sideways: wider content than
 * box, and a box that hides the rest (overflow hidden/clip, usually with an
 * ellipsis). Only leaf-ish elements with text count — a scroll strip of chips
 * that overflows on purpose is `overflow-x: auto` and stays out.
 */
function clippedTextInside(card: HTMLElement): number {
    let n = 0;
    for (const el of Array.from(card.querySelectorAll<HTMLElement>('*'))) {
        if (el.scrollWidth - el.clientWidth <= 1 || el.clientWidth <= 0) continue;
        if (!el.textContent?.trim() || el.children.length > 2) continue;
        const cs = getComputedStyle(el);
        if (cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis') n++;
    }
    return n;
}

/**
 * Measure every widget of one rendered tab.
 *
 * A card that measures 0 px is reported too, with px 0. It used to be dropped,
 * and a group whose children all hang on a disabled adapter then vanished from
 * the answer without a word — twelve widgets on the tab, eleven in the table.
 * "Draws nothing" is the more useful output than no row.
 *
 * @param root the element holding the tab's grid items
 * @returns one entry per widget in this tab's tree
 */
export function measureRenderedWidgets(root: ParentNode): RenderedWidget[] {
    const out: RenderedWidget[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-aura-widget]'))) {
        const id = el.dataset.auraWidget ?? '';
        if (!id) {
            continue;
        }
        const px = Math.round(el.getBoundingClientRect().height);
        const hidden = px > 0 ? hiddenPxInside(el) : 0;
        const clipX = px > 0 ? clippedTextInside(el) : 0;
        out.push({
            id,
            type: el.dataset.auraWidgetType ?? '',
            rows: Number(el.dataset.auraWidgetRows ?? '') || 0,
            px,
            contentPx: px + hidden,
            scrolls: hidden > 1,
            // Both branches of Dashboard give a fixed grid box its height inline
            // (react-grid-layout on desktop, the explicit style on mobile) and
            // leave it off for the content-sized ones. No inline height = the box
            // is whatever the content made it.
            autoBox: !el.style.height,
            ...(clipX ? { clipX } : {}),
        });
    }
    return out;
}

/** Same report twice in a row is not worth a socket message. */
export function reportSignature(report: RenderReport): string {
    return [
        report.tabId,
        report.viewport.w,
        report.viewport.h,
        report.hidden.join(','),
        report.gridWidth ?? 0,
        ...report.widgets.map((w) => `${w.id}:${w.px}:${w.contentPx}:${w.scrolls ? 1 : 0}:${w.clipX ?? 0}`),
    ].join('|');
}

/**
 * Fire-and-forget one report to the adapter.
 *
 * A tab that has not painted yet measures zero everywhere; since zero-height
 * cards are reported now, that would arrive as a table of nothing but "draws
 * nothing" and overwrite a good measurement. One card with a height is the proof
 * that the tab was on screen.
 */
export function sendRenderReport(report: RenderReport): void {
    if (shotMode() || !report.widgets.some((w) => w.px > 0)) {
        return;
    }
    const { clientId, clientName } = useConnectionStore.getState();
    void sendToDirect(NS, 'renderReport', { ...report, client: clientId, clientName, ts: Date.now() }, 10000);
}
