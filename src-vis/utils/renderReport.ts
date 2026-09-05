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
    /** Rendered height of the grid item, in CSS pixels. */
    px: number;
    /** Height the content would need — px plus whatever is scrolled away. */
    contentPx: number;
    /** Something inside the card scrolls vertically. */
    scrolls: boolean;
}

export interface RenderReport {
    tabId: string;
    tab: string;
    viewport: { w: number; h: number };
    presentation: { fontScale: number; widgetPadding: number };
    grid: { rowHeight: number; gap: number; snapX: number };
    widgets: RenderedWidget[];
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
 * Measure every widget of one rendered tab.
 *
 * @param root the element holding the tab's grid items
 * @returns one entry per widget that is actually laid out (hidden tabs measure 0)
 */
export function measureRenderedWidgets(root: ParentNode): RenderedWidget[] {
    const out: RenderedWidget[] = [];
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-aura-widget]'))) {
        const id = el.dataset.auraWidget ?? '';
        const px = Math.round(el.getBoundingClientRect().height);
        if (!id || px <= 0) {
            continue;
        }
        const hidden = hiddenPxInside(el);
        out.push({
            id,
            type: el.dataset.auraWidgetType ?? '',
            rows: Number(el.dataset.auraWidgetRows ?? '') || 0,
            px,
            contentPx: px + hidden,
            scrolls: hidden > 1,
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
        ...report.widgets.map((w) => `${w.id}:${w.px}:${w.contentPx}:${w.scrolls ? 1 : 0}`),
    ].join('|');
}

/** Fire-and-forget one report to the adapter. */
export function sendRenderReport(report: RenderReport): void {
    if (shotMode() || !report.widgets.length) {
        return;
    }
    const { clientId, clientName } = useConnectionStore.getState();
    void sendToDirect(NS, 'renderReport', { ...report, client: clientId, clientName, ts: Date.now() }, 10000);
}
