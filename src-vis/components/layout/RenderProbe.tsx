import { useEffect, useMemo, useRef, useState } from 'react';
import { Dashboard } from './Dashboard';
import { subscribeStateDirect } from '../../hooks/useIoBroker';
import { useDashboardStore } from '../../store/dashboardStore';
import { NS } from '../../utils/namespace';
import { ProbeContext, ProbeFillContext } from '../../utils/probeContext';

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
        if (!request) return null;
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
