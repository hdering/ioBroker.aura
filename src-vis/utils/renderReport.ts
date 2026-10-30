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
    /**
     * Free room left in the card's scroll area, in px — negative where it is cut
     * off. Absent where the card has no scroll area. "Nothing cut off" is a yes/no
     * that hides whether one more entry would still fit.
     */
    reservePx?: number;
    /** Entries a fill probe put in (maxRows + 1, long names) — absent otherwise. */
    filled?: number;
    /**
     * How far visible content reaches past the card's INNER edge (height minus
     * padding), in px, top or bottom. Nothing scrolls there: a centred block that
     * is too tall spills into the padding on both sides and reads as "fits" to the
     * scroll check. Absent where everything sits inside.
     */
    edgePx?: number;
    /**
     * How far content is cut off: past the card's own edge, or hidden by an
     * `overflow: hidden` box inside it. Absent where nothing is cut.
     */
    cutPx?: number;
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
    /** The probe filled the runtime lists to their cap (aura_rendered fill=true). */
    fill?: boolean;
    /** `tabId` is a popup view, drawn off-screen at its own designed width. */
    popup?: boolean;
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
 * How much of a scroll container its content leaves free, in px (negative = cut off).
 *
 * Measured from the children's boxes, not from `scrollHeight`: that one is never
 * smaller than the box, so a container with room to spare reads exactly like a
 * full one.
 */
function reserveOf(el: HTMLElement): number {
    const top = el.getBoundingClientRect().top + el.clientTop - el.scrollTop;
    let bottom = top;
    for (const child of Array.from(el.children)) {
        const r = child.getBoundingClientRect();
        if (r.height > 0 || r.width > 0) bottom = Math.max(bottom, r.bottom);
    }
    const padBottom = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    return el.clientHeight - (bottom - top + padBottom);
}

/**
 * The scrolled-away height inside one card, and the room its scroll areas leave.
 *
 * No tolerance: a single pixel over already draws a scrollbar (reported from use
 * — 168 px of content in a 167 px area). It used to take two to count, and a
 * one-pixel overflow was answered with "nichts abgeschnitten".
 *
 * `reserve` is the smallest free room of any scroll area in the card — null where
 * the card has none (its content is not a list that could grow into it).
 */
function scrollInside(card: HTMLElement): { hidden: number; reserve: number | null } {
    let hidden = 0;
    let reserve: number | null = null;
    for (const el of Array.from(card.querySelectorAll<HTMLElement>('*'))) {
        if (el.clientHeight <= 0 || el.childElementCount === 0) {
            continue;
        }
        const overflowY = getComputedStyle(el).overflowY;
        if (overflowY !== 'auto' && overflowY !== 'scroll') {
            continue;
        }
        const over = el.scrollHeight - el.clientHeight;
        if (over > 0) {
            hidden = Math.max(hidden, over);
        }
        // A sideways strip (chips, tabs) gets `overflow-y: auto` by CSS promotion and
        // is exactly as tall as its content — its "0 px free" says nothing about the card.
        const overflowX = getComputedStyle(el).overflowX;
        if (over <= 0 && (overflowX === 'auto' || overflowX === 'scroll')) {
            continue;
        }
        const free = over > 0 ? -over : Math.round(reserveOf(el));
        reserve = reserve === null ? free : Math.min(reserve, free);
    }
    return { hidden, reserve };
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

/** Leaf content worth checking: text, a symbol, an image, a control. */
const CONTENT_TAGS = new Set(['svg', 'img', 'canvas', 'video', 'input', 'select', 'textarea', 'button']);

function hasOwnText(el: Element): boolean {
    for (const n of Array.from(el.childNodes)) {
        if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) return true;
    }
    return false;
}

/** The box of one content element, an inline text cut down to its line height. */
function contentBox(el: Element, cs: CSSStyleDeclaration): { top: number; bottom: number } | null {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    // An inline element measures its glyph area, which a tight line height
    // (leading-none) is smaller than — that is not content in the padding.
    const lh = parseFloat(cs.lineHeight);
    if (cs.display === 'inline' && Number.isFinite(lh) && lh < r.height) {
        const inset = (r.height - lh) / 2;
        return { top: r.top + inset, bottom: r.bottom - inset };
    }
    return { top: r.top, bottom: r.bottom };
}

/**
 * Content that reaches into the card's padding or is cut off, vertically.
 *
 * The scroll check only sees a scroll area that overflows. Reported from use: a
 * framed header at h=2 with a subtitle came back "nichts abgeschnitten" — its
 * block is centred in the card, too tall for it, and spills into the padding top
 * and bottom without scrolling anything; elsewhere content vanishes under an
 * `overflow: hidden` box. Compared here: the content's top and bottom with the
 * card's inner edge (border box minus border and padding), and with the box that
 * clips it.
 *
 * Left out on purpose: absolutely positioned layers (status badges in the
 * corner, edit overlays — they belong in the corner), the inside of scroll areas
 * (scrollInside counts those), boxes collapsed to nothing (a folded section),
 * and nested widgets (measured on their own). Tolerance 3 px (see `round`).
 */
function edgeInside(card: HTMLElement): { edge: number; cut: number } {
    const frame = card.classList.contains('aura-widget') ? card : card.querySelector<HTMLElement>('.aura-widget');
    if (!frame) return { edge: 0, cut: 0 };
    const fr = frame.getBoundingClientRect();
    const fcs = getComputedStyle(frame);
    const innerTop = fr.top + (parseFloat(fcs.borderTopWidth) || 0) + (parseFloat(fcs.paddingTop) || 0);
    const innerBottom = fr.bottom - (parseFloat(fcs.borderBottomWidth) || 0) - (parseFloat(fcs.paddingBottom) || 0);
    let edge = 0;
    let cut = 0;
    const walk = (el: Element, clipTop: number, clipBottom: number) => {
        for (const child of Array.from(el.children)) {
            if (child instanceof HTMLElement && child.dataset.auraWidget !== undefined) continue;
            const cs = getComputedStyle(child);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'absolute') continue;
            if (cs.position === 'fixed' || parseFloat(cs.opacity) === 0) continue;
            const tag = child.tagName.toLowerCase();
            const isContent = CONTENT_TAGS.has(tag) || hasOwnText(child);
            const scrolls = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
            if (isContent || scrolls) {
                const box = contentBox(child, cs);
                if (box) {
                    // What still shows of it, and how much a clipping box hides.
                    const hidden = Math.max(clipTop - box.top, box.bottom - clipBottom, 0);
                    const top = Math.max(box.top, clipTop);
                    const bottom = Math.min(box.bottom, clipBottom);
                    if (bottom > top) {
                        edge = Math.max(edge, innerTop - top, bottom - innerBottom);
                    }
                    cut = Math.max(cut, hidden);
                }
            }
            // A symbol, a control or a scroll area is one thing — nothing inside it
            // is checked separately (scrollInside answers for the scroll area).
            if (CONTENT_TAGS.has(tag) || scrolls) continue;
            let top = clipTop;
            let bottom = clipBottom;
            if (cs.overflowY === 'hidden' || cs.overflowY === 'clip') {
                const r = child.getBoundingClientRect();
                // Folded to nothing (an accordion, a collapsed row): hidden on purpose.
                if (r.height < 1) continue;
                top = Math.max(top, r.top);
                bottom = Math.min(bottom, r.bottom);
            }
            walk(child, top, bottom);
        }
    };
    // The card itself does not clip (overflow visible), so content past its own
    // edge spills onto the neighbours: counted as cut off from the card.
    walk(frame, fr.top, fr.bottom);
    // A text line box carries half its leading above and below the glyphs: a title
    // with leading-tight stands up to ~3 px past a box it visibly fits (the bare
    // header at h=1). Below that it is not a finding.
    const round = (v: number) => (v > 3 ? Math.round(v) : 0);
    return { edge: round(edge), cut: round(cut) };
}

/**
 * Measure every widget of one rendered tab.
 *
 * A card that measures 0 px is reported too, with px 0. It used to be dropped,
 * and a group whose children all hang on a disabled adapter then vanished from
 * the answer without a word — twelve widgets on the tab, eleven in the table.
 * "Draws nothing" is the more useful output than no row.
 *
 * A popup view has no WidgetFrame: its cells carry `data-aura-popup-widget`
 * instead (components/widgets/popup/TabEmbedBody.tsx), and say themselves whether
 * they grow with their content (`data-aura-auto-box`).
 *
 * @param root the element holding the tab's grid items
 * @param kind 'popup' to measure the cells of a popup view
 * @returns one entry per widget in this tab's tree
 */
export function measureRenderedWidgets(root: ParentNode, kind: 'tab' | 'popup' = 'tab'): RenderedWidget[] {
    const out: RenderedWidget[] = [];
    const selector = kind === 'popup' ? '[data-aura-popup-widget]' : '[data-aura-widget]';
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
        const id = (kind === 'popup' ? el.dataset.auraPopupWidget : el.dataset.auraWidget) ?? '';
        if (!id) {
            continue;
        }
        const px = Math.round(el.getBoundingClientRect().height);
        const { hidden, reserve } = px > 0 ? scrollInside(el) : { hidden: 0, reserve: null };
        const clipX = px > 0 ? clippedTextInside(el) : 0;
        const { edge, cut } = px > 0 ? edgeInside(el) : { edge: 0, cut: 0 };
        // A fill probe marks the widgets it actually filled (utils/probeContext.tsx).
        const filledEl = el.querySelector<HTMLElement>('[data-aura-probe-filled]');
        const filled = filledEl ? Number(filledEl.dataset.auraProbeFilled) || 0 : 0;
        out.push({
            id,
            type: el.dataset.auraWidgetType ?? '',
            rows: Number(el.dataset.auraWidgetRows ?? '') || 0,
            px,
            contentPx: px + hidden,
            scrolls: hidden > 0,
            ...(reserve !== null ? { reservePx: reserve } : {}),
            ...(filled ? { filled } : {}),
            // Both branches of Dashboard give a fixed grid box its height inline
            // (react-grid-layout on desktop, the explicit style on mobile) and
            // leave it off for the content-sized ones. No inline height = the box
            // is whatever the content made it.
            autoBox: el.dataset.auraAutoBox !== undefined ? el.dataset.auraAutoBox === '1' : !el.style.height,
            ...(clipX ? { clipX } : {}),
            ...(edge ? { edgePx: edge } : {}),
            ...(cut ? { cutPx: cut } : {}),
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
        report.fill ? 'fill' : '',
        ...report.widgets.map(
            (w) =>
                `${w.id}:${w.px}:${w.contentPx}:${w.scrolls ? 1 : 0}:${w.clipX ?? 0}:${w.reservePx ?? ''}:${w.edgePx ?? 0}:${w.cutPx ?? 0}`,
        ),
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
