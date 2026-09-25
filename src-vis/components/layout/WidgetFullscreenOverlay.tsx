import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { WidgetConfig } from '../../types';
import { useDashboardStore } from '../../store/dashboardStore';
import { useGroupDefsStore } from '../../store/groupDefsStore';
import { useEffectiveSettings } from '../../hooks/useEffectiveSettings';
import { useActiveLayoutId } from '../../contexts/ActiveLayoutContext';
import type { WidgetFullscreenTarget } from '../../store/widgetFullscreenStore';
import { exitScreenFullscreen, screenIsFullscreen } from '../../utils/fullscreenButton';
import { WidgetFrame } from './WidgetFrame';
import { useT } from '../../i18n';

/** Gap between the overlay edge and the widget card. */
const OVERLAY_PAD = 12;

/**
 * Shows one widget across the whole viewport (issue #644).
 *
 * The body is a real `WidgetFrame`, not a rebuilt card: conditions, badges,
 * `styleOverride` and the click action then behave exactly as they do in the tile.
 * `fullscreen` suppresses the frame's own fullscreen button, so there is no way to
 * stack a second overlay on top of this one.
 */
export function WidgetFullscreenOverlay({ target, onClose }: { target: WidgetFullscreenTarget; onClose: () => void }) {
    const t = useT();
    const updateWidget = useDashboardStore((s) => s.updateWidget);
    const layoutId = useActiveLayoutId();
    const settings = useEffectiveSettings(layoutId);
    const cellSize = settings.gridRowHeight ?? 20;
    const gridGap = settings.gridGap ?? 10;

    // Live config, so an edit made while the overlay is open shows up here too.
    // Group children live in useGroupDefsStore instead of tabs[].widgets, so the
    // snapshot taken when the button was pressed is the fallback for those.
    const live = useDashboardStore((s) => {
        for (const layout of s.layouts) {
            for (const section of layout.sections) {
                for (const tab of section.tabs) {
                    const hit = (tab.widgets ?? []).find((w) => w.id === target.widgetId);
                    if (hit) return hit;
                }
            }
        }
        return undefined;
    });
    const groupDefs = useGroupDefsStore((s) => s.defs);
    const fromGroup = useMemo(() => {
        if (live) return undefined;
        for (const children of Object.values(groupDefs)) {
            const hit = children.find((w) => w.id === target.widgetId);
            if (hit) return hit;
        }
        return undefined;
    }, [live, groupDefs, target.widgetId]);

    const [box, setBox] = useState(() => ({
        w: typeof window !== 'undefined' ? window.innerWidth : 1280,
        h: typeof window !== 'undefined' ? window.innerHeight : 800,
    }));
    useEffect(() => {
        const onResize = () => setBox({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Browser fullscreen that the button requested (issue #711). The browser takes
    // Esc for itself there, so the keydown above never fires — follow its exit
    // instead. Only a transition out closes: a request that was refused never
    // enters, and must not shut the overlay it fell back to. Unmounting (the X,
    // a tab change) hands the screen back.
    // onClose arrives as a fresh arrow each render; keeping it out of the deps
    // stops the cleanup from dropping fullscreen on every re-render.
    const ownsScreen = target.ownsScreen === true;
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    useEffect(() => {
        if (!ownsScreen) return;
        let entered = screenIsFullscreen(document);
        const onChange = () => {
            const now = screenIsFullscreen(document);
            if (entered && !now) closeRef.current();
            entered = now;
        };
        document.addEventListener('fullscreenchange', onChange);
        document.addEventListener('webkitfullscreenchange', onChange);
        return () => {
            document.removeEventListener('fullscreenchange', onChange);
            document.removeEventListener('webkitfullscreenchange', onChange);
            exitScreenFullscreen(document);
        };
    }, [ownsScreen]);

    // The few types that lay themselves out from gridPos (group, panels, jsonTable,
    // mirror) would otherwise keep their small dashboard geometry inside a full
    // screen. Convert the overlay box back into grid units — the same pitch maths
    // WidgetEmbedBody uses in the other direction.
    const config: WidgetConfig = useMemo(() => {
        const base = live ?? fromGroup ?? target.snapshot;
        const pitch = cellSize + gridGap;
        const usableW = Math.max(1, box.w - 2 * OVERLAY_PAD);
        const usableH = Math.max(1, box.h - 2 * OVERLAY_PAD);
        return {
            ...base,
            gridPos: {
                x: 0,
                y: 0,
                w: Math.max(1, Math.round((usableW + gridGap) / pitch)),
                h: Math.max(1, Math.round((usableH + gridGap) / pitch)),
            },
        };
    }, [live, fromGroup, target.snapshot, box.w, box.h, cellSize, gridGap]);

    return (
        <div
            className="fixed inset-0 z-[900] flex flex-col aura-widget-fullscreen"
            style={{ background: 'var(--app-bg)', padding: OVERLAY_PAD }}
            data-widget-fullscreen={config.id}
        >
            <div className="flex-1 min-h-0">
                <WidgetFrame
                    config={config}
                    editMode={false}
                    fullscreen
                    onRemove={() => {}}
                    onConfigChange={(cfg) => updateWidget(cfg.id, cfg)}
                />
            </div>
            <button
                onClick={onClose}
                className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full"
                style={{
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff',
                    backdropFilter: 'blur(4px)',
                    zIndex: 1,
                }}
                title={t('wf.fullscreenClose')}
                aria-label={t('wf.fullscreenClose')}
                data-widget-fullscreen-close=""
            >
                <X size={18} />
            </button>
        </div>
    );
}
