import { useEffect, useMemo, useState } from 'react';
import { resolveHtmlAssets } from '../../utils/assetUrl';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Menu, X, LayoutDashboard } from 'lucide-react';
import { Icon } from '@iconify/react';
import { useDashboardStore } from '../../store/dashboardStore';
import type { Section, LayoutMenuItem } from '../../store/dashboardStore';
import { useConfigStore } from '../../store/configStore';
import { ScrollRow } from './ScrollRow';
import { useT } from '../../i18n';
import { subscribeDpValue } from '../../hooks/useIoBroker';
import { applyCustomFormat, fmtTime, fmtDate } from '../../utils/clockUtils';
import { useBadges, useTabBadgeAggregate, type ResolvedBadge } from '../../hooks/useBadges';
import { Badge } from '../common/Badge';
import type { BadgeSize } from '../../types';

export type LayoutDrawerSize = 'sm' | 'md' | 'lg';

interface LayoutDrawerProps {
    /** Currently active layout id (from URL or default). */
    activeLayoutId?: string;
    /** Currently active section id — the menu lists the sections of the active layout. */
    activeSectionId?: string;
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
    entryStyle?: 'iconAndName' | 'iconOnly' | 'nameOnly' | 'bulletAndName';
    /** Selected-entry indicator style — mirrors the tab-bar indicator styles. */
    indicatorStyle?: 'text' | 'underline' | 'filled' | 'pills';
    /** Entry text font size in px. */
    fontSize?: number;
    /** Entry icon size in px. */
    iconSize?: number;
    /** 'overlay' = hamburger trigger + slide-in drawer; 'sidebar' = permanently docked left menu; 'bar' = permanently docked horizontal section bar. */
    variant?: 'overlay' | 'sidebar' | 'bar';
    /** For variant='bar': whether the bar sits above ('top') or below ('bottom') the dashboard — decides which edge carries the divider. */
    barPosition?: 'top' | 'bottom';
    /** For variant='bar': horizontal alignment of the section entries (mirrors the tab bar). */
    barAlignment?: 'left' | 'center' | 'right';
    /** For variant='bar': hide the custom scroll indicator on mobile. */
    hideMobileScrollbar?: boolean;
    /** Width in px of the docked sidebar (variant='sidebar'). */
    width?: number;
    /** Space in px between the layout list and the element directly above it (title / top items / top edge). */
    topOffset?: number;
    /** Space in px below the layout list (before the bottom items / bottom edge). */
    bottomOffset?: number;
    /** Extra space in px above the menu title row. */
    titleMarginTop?: number;
    /** Extra space in px below the menu title row. */
    titleMarginBottom?: number;
    /** Min height in px of each menu entry. */
    entryHeight?: number;
    /** Extra elements (clock/datapoint/text) rendered above/below the layout list. */
    items?: LayoutMenuItem[];
}

// Active-entry styling — mirrors TabBar's indicatorStyle. The vertical menu maps
// "underline" to a left accent bar (the natural equivalent for a stacked list).
function entryActiveStyle(
    isActive: boolean,
    style: NonNullable<LayoutDrawerProps['indicatorStyle']>,
): React.CSSProperties {
    if (!isActive) return { color: 'var(--text-primary)', borderLeft: '3px solid transparent' };
    switch (style) {
        case 'text':
            return { color: 'var(--accent)', borderLeft: '3px solid transparent' };
        case 'underline':
            return { color: 'var(--accent)', borderLeft: '3px solid var(--accent)' };
        case 'pills':
            return {
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: '0.5rem',
                borderLeft: '3px solid transparent',
            };
        case 'filled':
        default:
            // Subtle NEUTRAL elevated fill (not accent-tinted) with a rounded chip that
            // hugs the entry — the accent shows only in the bullet/icon. The overlay is
            // built from --text-primary so it adapts to light and dark themes.
            return {
                background: 'color-mix(in srgb, var(--text-primary) 7%, transparent)',
                color: 'var(--text-primary)',
                borderRadius: '0.75rem',
                borderLeft: '3px solid transparent',
            };
    }
}

// Horizontal-bar variant of entryActiveStyle — mirrors the TabBar. "underline"
// maps to a bottom accent bar (the natural equivalent for a horizontal row).
function barEntryActiveStyle(
    isActive: boolean,
    style: NonNullable<LayoutDrawerProps['indicatorStyle']>,
): React.CSSProperties {
    if (!isActive) return { color: 'var(--text-secondary)', borderBottom: '2px solid transparent' };
    switch (style) {
        case 'text':
            return { color: 'var(--accent)', borderBottom: '2px solid transparent' };
        case 'underline':
            return { color: 'var(--accent)', borderBottom: '2px solid var(--accent)' };
        case 'pills':
            return {
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: '9999px',
                borderBottom: '2px solid transparent',
            };
        case 'filled':
        default:
            return {
                background: 'color-mix(in srgb, var(--text-primary) 7%, transparent)',
                color: 'var(--text-primary)',
                borderRadius: '0.75rem',
                borderBottom: '2px solid transparent',
            };
    }
}

// ── Layout-menu extra items (clock / datapoint / text) ────────────────────────
// Same content shapes as the tab-bar items, but rendered block-style (stacked)
// above or below the layout list.

function LayoutMenuClock({
    item,
    t,
    compact = false,
}: {
    item: LayoutMenuItem;
    t: ReturnType<typeof useT>;
    compact?: boolean;
}) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    if (item.clockCustomFormat) {
        return (
            <div
                className={`${compact ? 'text-sm' : 'text-2xl'} font-bold tabular-nums`}
                style={{ color: 'var(--text-primary)' }}
            >
                {applyCustomFormat(now, item.clockCustomFormat, t)}
            </div>
        );
    }

    const timeStr = fmtTime(now, item.clockShowSeconds ?? false);
    const dateStr = fmtDate(now, item.clockDateLength ?? 'short', t);

    if (item.clockDisplay === 'datetime') {
        return (
            <div className={compact ? 'flex flex-col items-end leading-tight' : undefined}>
                <div
                    className={`${compact ? 'text-sm' : 'text-3xl'} font-bold tabular-nums leading-none`}
                    style={{ color: 'var(--text-primary)' }}
                >
                    {timeStr}
                </div>
                <div className={compact ? 'text-xs' : 'text-sm mt-1'} style={{ color: 'var(--text-secondary)' }}>
                    {dateStr}
                </div>
            </div>
        );
    }

    const text = item.clockDisplay === 'date' ? dateStr : timeStr;
    return (
        <div
            className={`${compact ? 'text-sm' : 'text-2xl'} font-bold tabular-nums`}
            style={{ color: 'var(--text-primary)' }}
        >
            {text}
        </div>
    );
}

function LayoutMenuDatapoint({ item }: { item: LayoutMenuItem }) {
    const [val, setVal] = useState<string>('…');
    useEffect(() => {
        if (!item.datapointId) return;
        const unsub = subscribeDpValue(item.datapointId, (value) => {
            setVal(value != null ? String(value) : '–');
        });
        return unsub;
    }, [item.datapointId]);

    if (item.datapointTemplate) {
        return (
            <div
                className="text-sm"
                style={{ color: 'var(--text-secondary)' }}
                dangerouslySetInnerHTML={{ __html: resolveHtmlAssets(item.datapointTemplate.replace(/\{dp\}/g, val)) }}
            />
        );
    }

    return (
        <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
            {val}
        </div>
    );
}

// Own badges + optional aggregate count (widgets with a visible badge across all
// of the section's tabs) shown inline at the trailing edge of a menu entry.
function SectionBadges({ section }: { section: Section }) {
    const own = useBadges(section.badges);
    const aggEnabled = section.badgeAggregate?.enabled ?? false;
    const allWidgets = useMemo(
        () => (aggEnabled ? section.tabs.flatMap((tab) => tab.widgets) : undefined),
        [aggEnabled, section.tabs],
    );
    const aggCount = useTabBadgeAggregate(allWidgets);

    const badges: ResolvedBadge[] = [...own];
    if (aggEnabled && aggCount > 0) {
        badges.push({
            id: `__agg_${section.id}`,
            style: 'count',
            corner: 'top-right',
            color: section.badgeAggregate?.color,
            size: (section.badgeAggregate?.size as BadgeSize) ?? 'md',
            text: String(aggCount),
        });
    }
    if (!badges.length) return null;
    return (
        <span className="ml-auto shrink-0 flex items-center gap-1">
            {badges.map((b) => (
                <Badge key={b.id} style={b.style} size={b.size} color={b.color} text={b.text} icon={b.icon} />
            ))}
        </span>
    );
}

function LayoutMenuItemView({
    item,
    t,
    compact = false,
}: {
    item: LayoutMenuItem;
    t: ReturnType<typeof useT>;
    compact?: boolean;
}) {
    if (item.type === 'clock') return <LayoutMenuClock item={item} t={t} compact={compact} />;
    if (item.type === 'datapoint') return <LayoutMenuDatapoint item={item} />;
    return (
        <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
            {item.text ?? ''}
        </div>
    );
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
    activeSectionId,
    floating = false,
    size = 'md',
    autoHide = false,
    iconOnly = false,
    showTitle = true,
    drawerTitle,
    entryStyle = 'iconAndName',
    indicatorStyle = 'filled',
    fontSize = 14,
    iconSize = 16,
    variant = 'overlay',
    barPosition = 'top',
    barAlignment = 'left',
    hideMobileScrollbar = false,
    width = 240,
    topOffset = 0,
    bottomOffset = 0,
    titleMarginTop = 0,
    titleMarginBottom = 0,
    entryHeight = 48,
    items = [],
}: LayoutDrawerProps) {
    const t = useT();
    const navigate = useNavigate();
    const layouts = useDashboardStore((s) => s.layouts);
    const [open, setOpen] = useState(false);
    // Only floating trigger participates in auto-hide; inline header trigger is always visible.
    const [proximityVisible, setProximityVisible] = useState(!autoHide || !floating);

    // Mobile detection for the horizontal-bar variant — mirrors the tab bar so the
    // section bar forces left alignment + custom scroll indicator on small screens.
    const mobileBreakpoint = useConfigStore((s) => s.frontend.mobileBreakpoint ?? 600);
    const [isBarMobile, setIsBarMobile] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < mobileBreakpoint : false,
    );
    useEffect(() => {
        const check = () => setIsBarMobile(window.innerWidth < mobileBreakpoint);
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, [mobileBreakpoint]);

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

    // Resolve active layout: prop > first layout (matches App.tsx default). The menu
    // lists the sections ("Bereiche") of this layout.
    const activeLayout = layouts.find((l) => l.id === activeLayoutId) ?? layouts[0];
    const sections = activeLayout?.sections ?? [];
    const activeSection = sections.find((sec) => sec.id === activeSectionId) ?? sections[0];

    const goToSection = (section: Section) => {
        setOpen(false);
        if (!activeLayout) return;
        // The menu only shows with >1 section, so always encode the section segment.
        navigate(`/view/${activeLayout.slug}/s/${section.slug}`);
    };

    const showIcon = entryStyle === 'iconAndName' || entryStyle === 'iconOnly';
    const showName = entryStyle !== 'iconOnly';
    const showBullet = entryStyle === 'bulletAndName';
    const iconBox = iconSize + 16;

    // Shared section list — reused by the overlay drawer and the docked sidebar.
    // Container gets a little horizontal padding so the selected chip reads as inset.
    const visibleSections = sections.filter((sec) => !sec.hidden);
    const list = (
        <div
            className="flex-1 overflow-y-auto py-2 px-2"
            style={{ marginTop: topOffset || undefined, marginBottom: bottomOffset || undefined }}
        >
            {visibleSections.map((section) => {
                const isActive = section.id === activeSection?.id;
                return (
                    <button
                        key={section.id}
                        onClick={() => goToSection(section)}
                        title={entryStyle === 'iconOnly' ? section.name : undefined}
                        className={`w-full flex items-center gap-3 px-3 py-1.5 transition-colors hover:opacity-90 text-left ${entryStyle === 'iconOnly' ? 'justify-center' : ''}`}
                        style={{
                            minHeight: entryHeight,
                            ...entryActiveStyle(isActive, indicatorStyle),
                        }}
                    >
                        {showBullet && (
                            <span
                                className="shrink-0 rounded-full"
                                style={{
                                    width: 7,
                                    height: 7,
                                    background: isActive
                                        ? indicatorStyle === 'pills'
                                            ? 'currentColor'
                                            : 'var(--accent)'
                                        : 'var(--text-secondary)',
                                }}
                            />
                        )}
                        {showIcon && (
                            <span
                                className="rounded-lg flex items-center justify-center shrink-0"
                                style={{
                                    width: iconBox,
                                    height: iconBox,
                                    background: isActive ? 'var(--accent)22' : 'var(--app-bg)',
                                    color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                                }}
                            >
                                {section.icon ? (
                                    <Icon icon={section.icon} width={iconSize} height={iconSize} />
                                ) : (
                                    <LayoutDashboard size={iconSize} />
                                )}
                            </span>
                        )}
                        {showName && (
                            <span
                                className={`truncate ${isActive ? 'font-semibold' : 'font-medium'}`}
                                style={{ fontSize }}
                            >
                                {section.name}
                            </span>
                        )}
                        <SectionBadges section={section} />
                    </button>
                );
            })}
        </div>
    );

    // Extra items rendered above (top) / below (bottom) the list. `list` is flex-1,
    // so the bottom group is naturally pushed to the bottom edge (footer).
    const renderItemGroup = (pos: 'top' | 'bottom') => {
        const groupItems = items.filter((i) => i.position === pos);
        if (groupItems.length === 0) return null;
        return (
            <div
                className={`px-4 py-3 space-y-2 shrink-0 ${pos === 'top' ? 'border-b' : 'border-t'}`}
                style={{ borderColor: 'var(--app-border)' }}
            >
                {groupItems.map((it) => (
                    <div
                        key={it.id}
                        style={{ marginTop: it.marginTop || undefined, marginBottom: it.marginBottom || undefined }}
                    >
                        <LayoutMenuItemView item={it} t={t} />
                    </div>
                ))}
            </div>
        );
    };

    // Docked horizontal bar: always visible section row above / below the dashboard,
    // mirroring the tab bar (scroll behaviour, alignment, hide-mobile-scrollbar). No
    // overlay/trigger, no portal. Extra items render inline at the leading (top-position)
    // / trailing (bottom-position) edge; sections sit in the aligned zone.
    if (variant === 'bar') {
        const leadItems = items.filter((i) => i.position === 'top');
        const trailItems = items.filter((i) => i.position === 'bottom');
        // Mobile forces left alignment so entries + extras never collide in a grid zone.
        const alignment = isBarMobile ? 'left' : barAlignment;
        const hasExtras = leadItems.length > 0 || trailItems.length > 0;
        const needsGrid = hasExtras || alignment !== 'left';

        const divider = <div className="w-px self-stretch mx-1 shrink-0" style={{ background: 'var(--app-border)' }} />;
        const renderBarItems = (group: LayoutMenuItem[]) =>
            group.map((it) => (
                <div key={it.id} className="shrink-0 flex items-center">
                    <LayoutMenuItemView item={it} t={t} compact />
                </div>
            ));
        const sectionButtons = visibleSections.map((section) => {
            const isActive = section.id === activeSection?.id;
            return (
                <button
                    key={section.id}
                    onClick={() => goToSection(section)}
                    title={entryStyle === 'iconOnly' ? section.name : undefined}
                    className={`relative flex items-center gap-2 whitespace-nowrap transition-colors hover:opacity-90 ${
                        entryStyle === 'iconOnly' ? 'justify-center px-2.5' : 'px-3'
                    } ${indicatorStyle === 'underline' ? 'py-2.5' : 'py-1.5'}`}
                    style={barEntryActiveStyle(isActive, indicatorStyle)}
                >
                    {showBullet && (
                        <span
                            className="shrink-0 rounded-full"
                            style={{
                                width: 7,
                                height: 7,
                                background: isActive
                                    ? indicatorStyle === 'pills'
                                        ? 'currentColor'
                                        : 'var(--accent)'
                                    : 'var(--text-secondary)',
                            }}
                        />
                    )}
                    {showIcon && (
                        <span className="shrink-0 inline-flex items-center justify-center">
                            {section.icon ? (
                                <Icon icon={section.icon} width={iconSize} height={iconSize} />
                            ) : (
                                <LayoutDashboard size={iconSize} />
                            )}
                        </span>
                    )}
                    {showName && (
                        <span className={`truncate ${isActive ? 'font-semibold' : 'font-medium'}`} style={{ fontSize }}>
                            {section.name}
                        </span>
                    )}
                    <SectionBadges section={section} />
                </button>
            );
        });

        const containerStyle: React.CSSProperties = {
            background: 'var(--nav-bg, var(--app-surface))',
            [barPosition === 'bottom' ? 'borderTop' : 'borderBottom']: '1px solid var(--app-border)',
            // Own stacking context above the dashboard grid (z-index:10) so section
            // badges overflowing the bar aren't hidden by opaque widgets below it.
            position: 'relative',
            zIndex: 20,
            minHeight: entryHeight,
        };
        const ariaLabel = drawerTitle?.trim() || t('layoutDrawer.title');

        if (needsGrid) {
            return (
                <nav
                    className="aura-section-bar shrink-0"
                    style={{
                        ...containerStyle,
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
                        alignItems: 'stretch',
                    }}
                    aria-label={ariaLabel}
                >
                    {/* Zone 1: leading items + sections when alignment=left */}
                    <ScrollRow
                        isMobile={isBarMobile}
                        hideIndicator={hideMobileScrollbar}
                        outerClassName="min-w-0"
                        scrollClassName="flex items-center w-full"
                    >
                        <div className="flex items-center gap-1 px-2">
                            {renderBarItems(leadItems)}
                            {alignment === 'left' && leadItems.length > 0 && divider}
                            {alignment === 'left' && sectionButtons}
                        </div>
                    </ScrollRow>

                    {/* Zone 2: sections when alignment=center */}
                    <ScrollRow
                        isMobile={isBarMobile}
                        hideIndicator={hideMobileScrollbar}
                        scrollClassName="flex items-center justify-center w-full"
                    >
                        <div className="flex items-center gap-1 px-2">{alignment === 'center' && sectionButtons}</div>
                    </ScrollRow>

                    {/* Zone 3: sections when alignment=right + trailing items */}
                    <ScrollRow
                        isMobile={isBarMobile}
                        hideIndicator={hideMobileScrollbar}
                        outerClassName="min-w-0"
                        scrollClassName="flex items-center justify-end w-full"
                    >
                        <div className="flex items-center gap-1 px-2">
                            {alignment === 'right' && sectionButtons}
                            {alignment === 'right' && trailItems.length > 0 && divider}
                            {renderBarItems(trailItems)}
                        </div>
                    </ScrollRow>
                </nav>
            );
        }

        // Simple layout: alignment=left, no extra items.
        return (
            <nav className="aura-section-bar shrink-0 flex" style={containerStyle} aria-label={ariaLabel}>
                <ScrollRow
                    isMobile={isBarMobile}
                    hideIndicator={hideMobileScrollbar}
                    outerClassName="flex-1 min-w-0"
                    scrollClassName="flex items-center w-full"
                >
                    <div className="flex items-center gap-1 px-2">{sectionButtons}</div>
                </ScrollRow>
            </nav>
        );
    }

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
                        style={{
                            borderBottom: '1px solid var(--app-border)',
                            marginTop: titleMarginTop || undefined,
                            marginBottom: titleMarginBottom || undefined,
                        }}
                    >
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            {drawerTitle?.trim() || t('layoutDrawer.title')}
                        </span>
                    </div>
                )}
                {renderItemGroup('top')}
                {list}
                {renderItemGroup('bottom')}
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
                          style={{
                              borderBottom: '1px solid var(--app-border)',
                              marginTop: titleMarginTop || undefined,
                              marginBottom: titleMarginBottom || undefined,
                          }}
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

                      {renderItemGroup('top')}
                      {list}
                      {renderItemGroup('bottom')}
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
