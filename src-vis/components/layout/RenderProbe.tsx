import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dashboard } from './Dashboard';
import { subscribeStateDirect } from '../../hooks/useIoBroker';
import { useDashboardStore } from '../../store/dashboardStore';
import { NS } from '../../utils/namespace';
import { ProbeContext, ProbeFillContext } from '../../utils/probeContext';
import { DEFAULT_POPUP_PADDING, usePopupConfigStore } from '../../store/popupConfigStore';
import { useEffectiveSettings } from '../../hooks/useEffectiveSettings';
import { measureRenderedWidgets, reportSignature, sendRenderReport } from '../../utils/renderReport';
import { TabEmbedBody } from '../widgets/popup/TabEmbedBody';

/**
 * Renders a tab NOBODY has open, off-screen, so its heights can be measured.
 *
 * `aura_rendered` is the only tool that can say what a widget really measures —
 * and it was the only one that could not answer for a tab that had just been
 * built, which is exactly when the question matters. A hidden tab is
 * `display: none` and measures zero, so the MCP server's answer was "ask the
 * user to open it": a human step in the middle of a check the model was doing on
 * its own. Reported from a session that had to open the tab through the public
 * URL in a browser to get any measurement at all.
 *
 * This closes it: the adapter writes a tab id into `info.renderProbe`, every
 * live frontend sees it, ONE of them renders that tab into a container parked
 * off-screen at the real grid width, and the report goes back the usual way
 * (Dashboard's own render-report effect does the measuring — the probe only
 * mounts it, so measurement and reality cannot drift apart).
 *
 * Off-screen rather than `display: none` or `visibility: hidden`: the box has to
 * be laid out for its content to have a height at all. `left: -20000px` keeps it
 * out of sight while every widget inside is a normally laid-out element.
 *
 * What the probe deliberately does NOT render: a camera and an iframe (see
 * `useIsProbe`). Mounting a camera would start a stream and — with a wake-up
 * datapoint — put the camera to SLEEP again on unmount, i.e. a probe would write
 * to a device somebody else is watching. Both types fill whatever box they get,
 * so their height is the box and nothing is lost by leaving them out.
 *
 * A popup view is probed the same way (`popup: true` in the request, `tabId` is
 * then the view id): popups are only drawn while somebody has one open, so
 * without this `aura_rendered` had nothing to say about them at all. The view
 * body is rendered at its own designed width — the width the dialog takes when
 * nothing narrower forces it — and measured by `PopupProbeReport` below, since
 * there is no Dashboard inside to do it.
 */

/** How long a probe stays mounted: the report goes out 1.2 s after it settles. */
const PROBE_MS = 6000;

interface ProbeRequest {
    tabId: string;
    ts: number;
    /** Grid width the adapter asks for — the target device from the guidelines. */
    width?: number;
    /** Fill the runtime lists to their cap with long names (utils/probeContext.tsx). */
    fill?: boolean;
    /** `tabId` names a popup view, not a tab. */
    popup?: boolean;
    /** Main datapoint for the popup's `{{dp}}` placeholders (what the clicked widget would pass). */
    dp?: string;
}

function parseRequest(raw: unknown): ProbeRequest | null {
    if (typeof raw !== 'string' || raw.length < 3) return null;
    try {
        const parsed = JSON.parse(raw) as Partial<ProbeRequest>;
        if (!parsed || typeof parsed.tabId !== 'string' || !parsed.tabId) return null;
        const width = Number(parsed.width);
        return {
            tabId: parsed.tabId,
            ts: Number(parsed.ts) || 0,
            ...(width > 200 ? { width } : {}),
            ...(parsed.fill === true ? { fill: true } : {}),
            ...(parsed.popup === true ? { popup: true } : {}),
            ...(typeof parsed.dp === 'string' && parsed.dp ? { dp: parsed.dp } : {}),
        };
    } catch {
        return null;
    }
}

export function RenderProbe({
    /** The tab this browser is showing — it reports itself, so never probe it. */
    activeTabId,
    /** Width of the real grid, so the probe measures at the width people see. */
    width,
}: {
    activeTabId?: string;
    width?: number;
}) {
    const [request, setRequest] = useState<ProbeRequest | null>(null);
    const layouts = useDashboardStore((s) => s.layouts);
    // Requests already served, so a re-render (or a second client's report
    // landing) cannot start the same probe twice.
    const doneRef = useRef<string>('');

    useEffect(() => {
        return subscribeStateDirect(`${NS}.info.renderProbe`, (state) => {
            const req = parseRequest(state?.val);
            if (!req) return;
            const key = `${req.tabId}|${req.ts}`;
            if (doneRef.current === key) return;
            // Stale requests (an adapter restart replays the last value) are not
            // worth a render: the tool waits ten seconds, so anything older is
            // nobody's question any more.
            if (req.ts && Date.now() - req.ts > 60000) return;
            doneRef.current = key;
            setRequest(req);
        });
    }, []);

    // Where the requested tab lives. The store holds every layout, so a tab from
    // a completely different section can be probed too — which is the point: a
    // freshly created tab is usually not in the section anybody is looking at.
    const target = useMemo(() => {
        if (!request || request.popup) return null;
        for (const layout of layouts) {
            for (const section of layout.sections ?? []) {
                const tab = (section.tabs ?? []).find((t) => t.id === request.tabId);
                if (tab) return { layout, section, tab };
            }
        }
        return null;
    }, [request, layouts]);

    useEffect(() => {
        if (!request) return;
        const timer = window.setTimeout(() => setRequest(null), PROBE_MS);
        return () => window.clearTimeout(timer);
    }, [request]);

    if (request?.popup) {
        return <PopupProbe request={request} />;
    }

    // The tab somebody is looking at reports itself — except for a fill probe,
    // whose worst case the screen does not show. Dashboard tells the two copies of
    // the tab apart by the probe container.
    if (!request || !target || (request.tabId === activeTabId && !request.fill)) {
        return null;
    }

    return (
        <div
            aria-hidden
            data-aura-render-probe={target.tab.id}
            style={{
                position: 'fixed',
                left: -20000,
                top: 0,
                // The requested width wins: a tab built for a 1280 px tablet has to
                // be measured at 1280 px, not at the notebook that happens to answer.
                width: request.width ?? (width && width > 200 ? width : 1280),
                // Tall enough that nothing is squeezed: the grid grows downwards
                // and the widgets are measured individually, not as a stack.
                height: 4000,
                overflow: 'hidden',
                pointerEvents: 'none',
                contain: 'layout',
            }}
        >
            <ProbeContext.Provider value={true}>
                <ProbeFillContext.Provider value={!!request.fill}>
                    {/* Keyed by the request: a fill probe right after a plain one of the
                        same tab must mount fresh, or the widgets keep their current rows. */}
                    <Dashboard
                        key={`${request.tabId}|${request.ts}`}
                        readonly
                        editMode={false}
                        viewTabs={[target.tab]}
                        viewActiveTabId={target.tab.id}
                        layoutId={target.layout.id}
                        sectionId={target.section.id}
                    />
                </ProbeFillContext.Provider>
            </ProbeContext.Provider>
        </div>
    );
}

/** When a popup probe measures: after the lazy widget chunks, and again once data has landed. */
const POPUP_REPORT_AT_MS = [1500, 3500];

/**
 * One popup view, off-screen, measured and reported under its view id.
 *
 * The body is the real one (TabEmbedBody), so cell padding, auto-height cells and
 * conditions behave as in the dialog. The dialog's own chrome (title bar, scroll
 * lane) is not part of it — what is measured is the widgets.
 */
function PopupProbe({ request }: { request: ProbeRequest }) {
    const view = usePopupConfigStore((s) => s.views.find((v) => v.id === request.tabId));
    const globalPadding = usePopupConfigStore((s) => s.globalPopupPadding);
    const padding = view?.padding ?? globalPadding ?? DEFAULT_POPUP_PADDING;
    if (!view) return null;
    return (
        <div
            aria-hidden
            data-aura-render-probe={view.id}
            style={{
                position: 'fixed',
                left: -20000,
                top: 0,
                // The view's own designed width (TabEmbedBody sets it as min-width):
                // that is what the dialog sizes to when nothing narrower forces it.
                width: 'max-content',
                maxHeight: 4000,
                overflow: 'hidden',
                pointerEvents: 'none',
                contain: 'layout',
            }}
        >
            <ProbeContext.Provider value={true}>
                <ProbeFillContext.Provider value={!!request.fill}>
                    <PopupProbeReport request={request} name={view.name}>
                        <TabEmbedBody
                            key={`${request.tabId}|${request.ts}`}
                            viewId={view.id}
                            dpOverride={request.dp}
                            padding={padding}
                        />
                    </PopupProbeReport>
                </ProbeFillContext.Provider>
            </ProbeContext.Provider>
        </div>
    );
}

function PopupProbeReport({ request, name, children }: { request: ProbeRequest; name: string; children: ReactNode }) {
    const rootRef = useRef<HTMLDivElement>(null);
    const settings = useEffectiveSettings();
    const rowHeight = settings.gridRowHeight ?? 60;
    const gap = settings.gridGap ?? 10;
    const snapX = settings.gridSnapX ?? rowHeight;
    const fontScale = settings.fontScale ?? 1;
    const widgetPadding = settings.widgetPadding ?? 16;
    useEffect(() => {
        let last = '';
        const send = () => {
            const root = rootRef.current;
            if (!root) return;
            const widgets = measureRenderedWidgets(root, 'popup');
            if (!widgets.length) return;
            const report = {
                tabId: request.tabId,
                tab: `Popup „${name}“`,
                viewport: { w: window.innerWidth, h: window.innerHeight },
                gridWidth: Math.round(root.getBoundingClientRect().width),
                presentation: { fontScale, widgetPadding },
                grid: { rowHeight, gap, snapX },
                widgets,
                probe: true,
                popup: true,
                ...(request.fill ? { fill: true } : {}),
                hidden: [],
            };
            const signature = reportSignature(report);
            if (signature === last) return;
            last = signature;
            sendRenderReport(report);
        };
        const timers = POPUP_REPORT_AT_MS.map((ms) => window.setTimeout(send, ms));
        return () => timers.forEach((t) => window.clearTimeout(t));
    }, [request, name, rowHeight, gap, snapX, fontScale, widgetPadding]);
    return <div ref={rootRef}>{children}</div>;
}
