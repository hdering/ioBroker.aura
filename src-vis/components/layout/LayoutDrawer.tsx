import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Menu, X, LayoutDashboard } from 'lucide-react';
import { Icon } from '@iconify/react';
import { useDashboardStore } from '../../store/dashboardStore';
import type { DashboardLayout } from '../../store/dashboardStore';
import { useT } from '../../i18n';

export type LayoutDrawerSize = 'sm' | 'md' | 'lg';

interface LayoutDrawerProps {
    /** Currently active layout id (from URL or default). */
    activeLayoutId?: string;
    /** When true the trigger renders as a fixed floating button (used when header is hidden). */
    floating?: boolean;
    /** Hamburger size — controls icon and button dimensions. */
    size?: LayoutDrawerSize;
    /** Auto-hide button: only visible when pointer/touch is near the top edge. */
    autoHide?: boolean;
    /** Inline mode: render only the menu icon (no layout name) — used inside the TabBar. */
    iconOnly?: boolean;
    /** Show the menu title/header row. */
    showTitle?: boolean;
    /** Custom drawer header title; empty/undefined falls back to the localized default. */
    drawerTitle?: string;
    /** How each entry in the drawer list is rendered. */
    entryStyle?: 'iconAndName' | 'iconOnly' | 'nameOnly';
    /** 'overlay' = hamburger trigger + slide-in drawer; 'sidebar' = permanently docked left menu. */
    variant?: 'overlay' | 'sidebar';
    /** Width in px of the docked sidebar (variant='sidebar'). */
    width?: number;
    /** Min height in px of each menu entry. */
    entryHeight?: number;
}

// Sizing scale for the trigger button. Icon + container scale together.
const SIZE_MAP: Record<
    LayoutDrawerSize,
    { icon: number; container: number; floatIcon: number; floatContainer: number }
> = {
    sm: { icon: 16, container: 28, floatIcon: 16, floatContainer: 36 },
    md: { icon: 20, container: 36, floatIcon: 18, floatContainer: 40 },
    lg: { icon: 26, container: 44, floatIcon: 24, floatContainer: 52 },
};

export function LayoutDrawer({
    activeLayoutId,
    floating = false,
    size = 'md',
    autoHide = false,
    iconOnly = false,
    showTitle = true,
    drawerTitle,
    entryStyle = 'iconAndName',
    variant = 'overlay',
    width = 240,
    entryHeight = 48,
}: LayoutDrawerProps) {
    const t = useT();
    const navigate = useNavigate();
    const layouts = useDashboardStore((s) => s.layouts);
    const [open, setOpen] = useState(false);
    // Only floating trigger participates in auto-hide; inline header trigger is always visible.
    const [proximityVisible, setProximityVisible] = useState(!autoHide || !floating);

    // Auto-hide: show button when pointer is near the top edge of the viewport.
    // Touch: tap anywhere in the top 80px region also reveals it (for ~3s).
    useEffect(() => {
        if (!autoHide || !floating) {
            setProximityVisible(true);
            return;
        }
        setProximityVisible(false);

        let hideTimer: ReturnType<typeof setTimeout> | undefined;
        const showTransient = (ms: number) => {
            setProximityVisible(true);
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => setProximityVisible(false), ms);
        };

        const onMouseMove = (e: MouseEvent) => {
            if (e.clientY < 80 && e.clientX < 220) setProximityVisible(true);
            else setProximityVisible(false);
        };
        const onTouchStart = (e: TouchEvent) => {
            const touch = e.touches[0];
            if (touch && touch.clientY < 80) showTransient(3000);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('touchstart', onTouchStart, { passive: true });
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('touchstart', onTouchStart);
            if (hideTimer) clearTimeout(hideTimer);
        };
    }, [autoHide, floating]);

    // Close drawer on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open]);

    // Portal target: prefer the frontend container so the drawer inherits per-layout
    // theme CSS vars (otherwise vars scoped to [data-aura-app="frontend"] don't apply).
    // Resolved once on mount — the frontend container is part of the App shell and
    // doesn't get re-mounted underneath the drawer.
    const portalTarget = useMemo<HTMLElement>(() => {
        return (document.querySelector('[data-aura-app="frontend"]') as HTMLElement | null) ?? document.body;
    }, []);

    const sz = SIZE_MAP[size];

    // Resolve active layout: prop > first layout (matches App.tsx default)
    const activeLayout = layouts.find((l) => l.id === activeLayoutId) ?? layouts[0];

    const goToLayout = (layout: DashboardLayout) => {
        setOpen(false);
        const isFirst = layouts[0]?.id === layout.id;
        if (isFirst) {
            navigate('/');
        } else {
            navigate(`/view/${layout.slug}`);
        }
    };

    // Shared layout list — reused by the overlay drawer and the docked sidebar.
    const list = (
        <div className="flex-1 overflow-y-auto py-2">
            {layouts.map((layout) => {
                const isActive = layout.id === activeLayout?.id;
                return (
                    <button
                        key={layout.id}
                        onClick={() => goToLayout(layout)}
                        title={entryStyle === 'iconOnly' ? layout.name : undefined}
                        className={`w-full flex items-center gap-3 px-4 py-1.5 transition-colors hover:opacity-90 text-left ${entryStyle === 'iconOnly' ? 'justify-center' : ''}`}
                        style={{
                            minHeight: entryHeight,
                            background: isActive ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                            color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                            borderLeft: `3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                        }}
                    >
                        {entryStyle !== 'nameOnly' && (
                            <span
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                style={{
                                    background: isActive ? 'var(--accent)22' : 'var(--app-bg)',
                                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                                }}
                            >
                                {layout.icon ? (
                                    <Icon icon={layout.icon} width={16} height={16} />
                                ) : (
                                    <LayoutDashboard size={15} />
                                )}
                            </span>
                        )}
                        {entryStyle !== 'iconOnly' && (
                            <span className="text-sm font-medium truncate">{layout.name}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );

    // Docked sidebar: always visible, no overlay/trigger, no portal.
    if (variant === 'sidebar') {
        return (
            <aside
                className="h-full flex flex-col shrink-0 overflow-hidden"
                style={{
                    width,
                    background: 'var(--app-surface)',
                    borderRight: '1px solid var(--app-border)',
                }}
            >
                {showTitle && entryStyle !== 'iconOnly' && (
                    <div
                        className="flex items-center px-4 py-3 shrink-0"
                        style={{ borderBottom: '1px solid var(--app-border)' }}
                    >
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            {drawerTitle?.trim() || t('layoutDrawer.title')}
                        </span>
                    </div>
                )}
                {list}
            </aside>
        );
    }

    const trigger = (
        <button
            onClick={() => setOpen(true)}
            className={
                floating
                    ? 'fixed top-3 left-3 z-40 flex items-center justify-center rounded-full shadow-lg transition-opacity duration-300'
                    : 'flex items-center gap-2 px-2 py-1 rounded-lg hover:opacity-80 transition-opacity'
            }
            style={
                floating
                    ? {
                          width: sz.floatContainer,
                          height: sz.floatContainer,
                          background: 'var(--app-surface)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--app-border)',
                          opacity: proximityVisible ? 1 : 0,
                          pointerEvents: proximityVisible ? 'auto' : 'none',
                      }
                    : { height: sz.container, color: 'var(--text-primary)' }
            }
            title={t('layoutDrawer.open')}
            aria-label={t('layoutDrawer.open')}
        >
            <Menu size={floating ? sz.floatIcon : sz.icon} />
            {!floating && !iconOnly && activeLayout && (
                <span className="text-sm font-medium truncate max-w-[160px]" style={{ color: 'var(--text-primary)' }}>
                    {activeLayout.name}
                </span>
            )}
        </button>
    );

    const drawer = open
        ? createPortal(
              <>
                  <div
                      className="fixed inset-0 z-[1000]"
                      style={{ background: 'rgba(0,0,0,0.45)' }}
                      onClick={() => setOpen(false)}
                  />
                  <aside
                      className="fixed top-0 left-0 z-[1001] h-full flex flex-col"
                      style={{
                          width: 'min(320px, 85vw)',
                          background: 'var(--app-surface)',
                          borderRight: '1px solid var(--app-border)',
                          boxShadow: '0 0 30px rgba(0,0,0,0.3)',
                          animation: 'auraDrawerIn 220ms ease-out',
                      }}
                  >
                      <div
                          className="flex items-center justify-between px-4 py-3 shrink-0"
                          style={{ borderBottom: '1px solid var(--app-border)' }}
                      >
                          {showTitle ? (
                              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                  {drawerTitle?.trim() || t('layoutDrawer.title')}
                              </span>
                          ) : (
                              <span />
                          )}
                          <button
                              onClick={() => setOpen(false)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                              style={{ color: 'var(--text-secondary)' }}
                              aria-label={t('common.close')}
                          >
                              <X size={15} />
                          </button>
                      </div>

                      {list}
                  </aside>
                  <style>{`@keyframes auraDrawerIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }`}</style>
              </>,
              portalTarget,
          )
        : null;

    return (
        <>
            {trigger}
            {drawer}
        </>
    );
}
