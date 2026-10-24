import { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CopyPlus, Lock } from 'lucide-react';
import type { WidgetProps } from '../../types';
import { useDashboardStore, type DashboardLayout, type Section, type Tab } from '../../store/dashboardStore';
import { useEffectiveSettings } from '../../hooks/useEffectiveSettings';
import {
    RenderTransformContext,
    RuntimeScopeContext,
    SharedTemplateContext,
    runtimeId,
    useRuntimeScope,
} from '../../contexts/RenderTransformContext';
import { useTabChain } from '../../contexts/TabChainContext';
import { useViewVisible } from '../../contexts/ViewVisibleContext';
import { gridWidthPx } from '../../utils/gridColumns';
import { lazyWithReload } from '../../utils/lazyWithReload';
import { useT } from '../../i18n';

// Lazy: the dashboard imports WidgetFrame → widgetMap → this file.
const Dashboard = lazyWithReload(() => import('../layout/Dashboard').then((m) => ({ default: m.Dashboard })));

/** How deep tab mirrors may nest at all — a guard on top of the cycle check. */
const MAX_DEPTH = 3;
/** The dashboard scroller's p-2 inset, left + right / top + bottom (embedded mode). */
const SCROLLER_PAD = 16;

export type TabFit = 'width' | 'contain' | 'none';

export function tabFitOf(v: unknown): TabFit {
    return v === 'none' || v === 'contain' ? v : 'width';
}

export interface TabSource {
    layout: DashboardLayout;
    section: Section;
    tab: Tab;
}

/** Finds a tab with its section and layout anywhere in the dashboard. */
export function findTabSource(layouts: DashboardLayout[], tabId: string | undefined): TabSource | undefined {
    if (!tabId) return undefined;
    for (const layout of layouts)
        for (const section of layout.sections) {
            const tab = section.tabs.find((t) => t.id === tabId);
            if (tab) return { layout, section, tab };
        }
    return undefined;
}

/** A tab behind a PIN is never mirrored — the mirror would show it without the code. */
export function tabSourceLocked({ section, tab }: TabSource): boolean {
    return !!(tab.pin || tab.pinProtected || tab.pinFrom || section.pin || section.pinProtected || section.pinFrom);
}

function Notice({ icon, title, detail }: { icon: React.ReactNode; title: string; detail?: string }) {
    return (
        <div
            className="flex flex-col items-center justify-center gap-2 h-full w-full text-center p-3"
            style={{ color: 'var(--text-secondary)' }}
        >
            {icon}
            <span className="text-sm">{title}</span>
            {detail && <span className="text-xs opacity-60 font-mono break-all">{detail}</span>}
        </div>
    );
}

const warnIcon = <AlertTriangle size={22} style={{ color: 'var(--accent-red, #ef4444)' }} />;

/**
 * Tab mode of the "Spiegel" widget (`options.sourceKind: 'tab'`): renders a whole
 * tab live inside this widget's box. The tab is drawn by the regular Dashboard
 * (like RenderProbe does), embedded — so every widget, group and condition behaves
 * exactly as on the tab itself, and option writes land on the source widgets.
 *
 * `tabFit`:
 *  - 'width' (default): the tab is laid out at its design width (`tabWidth`, or the
 *    width its widgets occupy) and scaled to the box width; taller content scrolls.
 *  - 'contain': like 'width', but scaled further down until the whole tab fits
 *    the box height as well — nothing scrolls, the tab is centred horizontally.
 *  - 'none': the tab is laid out at the box size, unscaled — a narrow box gets the
 *    tab's phone layout.
 *
 * The copy runs in its own runtime scope (RuntimeScopeContext), so measured heights,
 * folded cards and condition reflows of the copy and the original stay apart.
 */
export function TabMirror({ config, editMode }: WidgetProps) {
    const layouts = useDashboardStore((s) => s.layouts);
    const targetTabId = config.options?.targetTabId as string | undefined;
    const source = useMemo(() => findTabSource(layouts, targetTabId), [layouts, targetTabId]);
    const chain = useTabChain();
    const visible = useViewVisible();
    const scope = runtimeId(config.id, useRuntimeScope());
    const settings = useEffectiveSettings(source?.layout.id, source?.section.id);

    const t = useT();
    const fit = tabFitOf(config.options?.tabFit);
    const tabWidthOpt = Math.max(0, Number(config.options?.tabWidth) || 0);
    const snapX = settings.gridSnapX ?? settings.gridRowHeight ?? 20;
    const gap = settings.gridGap ?? 10;
    const usedCols = useMemo(
        () => (source?.tab.widgets ?? []).reduce((m, w) => Math.max(m, w.gridPos.x + w.gridPos.w), 2),
        [source],
    );
    const designWidth = tabWidthOpt > 0 ? tabWidthOpt : gridWidthPx(usedCols, snapX, gap) + SCROLLER_PAD;

    // Box size — the scale follows the width, the scaled tab fills the height.
    const [box, setBox] = useState({ w: 0, h: 0 });
    const roRef = useRef<ResizeObserver | null>(null);
    const boxRef = useCallback((el: HTMLDivElement | null) => {
        roRef.current?.disconnect();
        roRef.current = null;
        if (!el) return;
        const measure = () => {
            const w = el.clientWidth;
            const h = el.clientHeight;
            // A hidden tab measures 0 — keep the last good size (see Dashboard #636).
            if (w > 0 && h > 0) setBox((p) => (p.w === w && p.h === h ? p : { w, h }));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        roRef.current = ro;
    }, []);

    // Unscaled height of the copied tab's content ('contain'). The tab element only
    // appears once the lazy dashboard has laid out, so watch the subtree for it.
    const [contentH, setContentH] = useState(0);
    const innerCleanup = useRef<(() => void) | null>(null);
    const innerRef = useCallback(
        (el: HTMLDivElement | null) => {
            innerCleanup.current?.();
            innerCleanup.current = null;
            if (!el || fit !== 'contain') return;
            let observed: Element | null = null;
            const ro = new ResizeObserver(() => {
                const h = observed instanceof HTMLElement ? observed.offsetHeight : 0;
                if (h > 0) setContentH((p) => (p === h ? p : h));
            });
            const attach = () => {
                const tabEl = el.querySelector('[data-aura-tab-id]');
                if (!tabEl || tabEl === observed) return;
                if (observed) ro.unobserve(observed);
                observed = tabEl;
                ro.observe(tabEl);
            };
            const mo = new MutationObserver(attach);
            mo.observe(el, { childList: true, subtree: true });
            attach();
            innerCleanup.current = () => {
                mo.disconnect();
                ro.disconnect();
            };
        },
        [fit],
    );

    if (!targetTabId) {
        return editMode ? (
            <Notice icon={<CopyPlus size={22} />} title={t('mirror.pickTab')} detail={t('mirror.pickTabHint')} />
        ) : (
            <div className="h-full w-full" />
        );
    }
    if (!source) return <Notice icon={warnIcon} title={t('mirror.tabGone')} detail={targetTabId} />;
    if (chain.includes(source.tab.id))
        return <Notice icon={warnIcon} title={t('mirror.tabCycle')} detail={source.tab.name} />;
    if (chain.length > MAX_DEPTH) return <Notice icon={warnIcon} title={t('mirror.tooDeep')} />;
    if (tabSourceLocked(source))
        return <Notice icon={<Lock size={22} />} title={t('mirror.tabPin')} detail={source.tab.name} />;

    const scaled = fit !== 'none';
    const widthScale = box.w > 0 ? box.w / designWidth : 1;
    // 'contain': the tab's own height (plus the scroller inset) must fit as well.
    // Until the copy has been measured once it runs on the width scale.
    const heightScale = contentH > 0 ? box.h / (contentH + SCROLLER_PAD) : widthScale;
    const scale = !scaled ? 1 : fit === 'contain' ? Math.min(widthScale, heightScale) : widthScale;
    const innerStyle: React.CSSProperties = scaled
        ? {
              position: 'absolute',
              // Height-bound: the narrower tab sits in the middle of the box.
              left: Math.max(0, (box.w - designWidth * scale) / 2),
              top: 0,
              width: designWidth,
              height: box.h / scale,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
          }
        : { position: 'absolute', inset: 0 };

    return (
        <div
            ref={boxRef}
            className="aura-tab-mirror relative h-full w-full overflow-hidden"
            data-aura-tab-mirror={source.tab.id}
        >
            {box.w > 0 && (
                <div
                    ref={innerRef}
                    className="flex flex-col"
                    // In the editor the mirror is moved and resized as one card — the copy
                    // would otherwise take the clicks (and switch real devices).
                    style={{ ...innerStyle, pointerEvents: editMode ? 'none' : undefined }}
                >
                    <RuntimeScopeContext.Provider value={scope}>
                        <RenderTransformContext.Provider value={null}>
                            <SharedTemplateContext.Provider value={null}>
                                <Suspense fallback={null}>
                                    <Dashboard
                                        readonly
                                        editMode={false}
                                        embedded
                                        forceGrid={scaled}
                                        // Rows stretched to the visible height would feed
                                        // back into the height the box is fitted to.
                                        noFillRows={fit === 'contain'}
                                        inactive={!visible}
                                        viewTabs={[source.tab]}
                                        viewActiveTabId={source.tab.id}
                                        layoutId={source.layout.id}
                                        sectionId={source.section.id}
                                    />
                                </Suspense>
                            </SharedTemplateContext.Provider>
                        </RenderTransformContext.Provider>
                    </RuntimeScopeContext.Provider>
                </div>
            )}
        </div>
    );
}
