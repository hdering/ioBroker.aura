import { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '@iconify/react';
import { LayoutDashboard, Search } from 'lucide-react';
import {
    useDashboardStore,
    useActiveLayout,
    useActiveSection,
    resolveView,
    type DashboardLayout,
    type Section,
    type Tab,
} from '../../store/dashboardStore';
import { useActiveLayoutId } from '../../contexts/ActiveLayoutContext';
import { useActiveSectionId } from '../../contexts/ActiveSectionContext';
import { useT } from '../../i18n';
import { NAV_ACTIVE, navIcon, navText } from '../../utils/navColors';
import type { WidgetProps } from '../../types';

type MenuMode = 'section' | 'tab' | 'overview';
type MenuVariant = 'hbar' | 'vlist' | 'grid' | 'pills';
type IndicatorStyle = 'text' | 'underline' | 'filled' | 'pills';
type MenuSource = 'layout' | 'all';
type GroupTitle = 'iconName' | 'name' | 'none';
type ChipSize = 'sm' | 'md' | 'lg';

interface MenuItem {
    key: string; // slug ?? id — stable identifier used for navigation, active-match and de-selection
    name: string;
    icon?: string;
    disabled?: boolean;
}

/** One section of the overview (#669): its tabs as chips under a group title. */
interface OverviewGroup {
    key: string;
    layoutId: string;
    layoutSlug: string;
    layoutName: string;
    multiSection: boolean; // the layout has more than one section → URL carries /s/<section>
    section: MenuItem;
    items: MenuItem[];
}

// Chip padding per size; the font follows the widget's own text scale.
const CHIP_SIZE: Record<ChipSize, { padding: string; cls: string }> = {
    sm: { padding: '2px 8px', cls: 'text-xs' },
    md: { padding: '4px 10px', cls: 'text-sm' },
    lg: { padding: '7px 14px', cls: 'text-base' },
};

// Mirrors TabBar.tabStyle (TabBar.tsx:143-182). Kept local so this widget stays
// purely additive — no export/refactor of the tab-bar internals required.
function menuItemStyle(isActive: boolean, style: IndicatorStyle): React.CSSProperties {
    const activeClr = NAV_ACTIVE;
    const inactiveClr = navText();

    if (style === 'pills') {
        return {
            background: isActive ? activeClr : 'transparent',
            color: isActive ? '#fff' : inactiveClr,
            borderRadius: '9999px',
        };
    }
    if (style === 'filled') {
        return {
            background: isActive ? `color-mix(in srgb, ${activeClr} 15%, transparent)` : 'transparent',
            color: isActive ? activeClr : inactiveClr,
            borderRadius: '8px',
        };
    }
    if (style === 'text') {
        return { color: isActive ? activeClr : inactiveClr };
    }
    // underline (default)
    return {
        borderBottom: `2px solid ${isActive ? activeClr : 'transparent'}`,
        color: isActive ? activeClr : inactiveClr,
    };
}

export function MenuWidget({ config, editMode }: WidgetProps) {
    const o = config.options ?? {};
    const menuMode = (o.menuMode as MenuMode) ?? 'section';
    const variant = (o.variant as MenuVariant) ?? 'hbar';
    const hiddenItems = (o.hiddenItems as string[] | undefined) ?? [];
    const indicatorStyle = (o.indicatorStyle as IndicatorStyle) ?? 'underline';
    const showIcons = o.showIcons !== false;
    const showLabels = o.showLabels !== false;
    const iconSize = (o.iconSize as number) || 18;
    const gap = (o.gap as number) ?? 6;
    const align = (o.align as 'start' | 'center' | 'end') ?? 'start';
    const gridCols = Math.max(1, (o.gridCols as number) || 3);
    // Overview mode (#669): every section of the layout with its tabs as chips.
    const menuSource = (o.menuSource as MenuSource) ?? 'layout';
    const showSearch = o.showSearch === true;
    const groupTitle = (o.groupTitle as GroupTitle) ?? 'iconName';
    const chipSize = (o.chipSize as ChipSize) ?? 'md';

    const t = useT();
    const [query, setQuery] = useState('');

    // ── Context: which view does this menu belong to? ─────────────────────────
    // The surrounding Dashboard publishes the layout and section it renders — the
    // frontend resolves those from the URL, the admin editor from what is being
    // edited — so this is right in both places and keeps working when the menu is
    // rendered somewhere that has no view params of its own: inside a Spiegel (which
    // renders its source with editMode=false) on an /admin route, the URL alone
    // resolved to the FIRST layout instead of the one on screen.
    // Fallbacks keep the old behaviour where no dashboard provides a context
    // (widget designer, preset preview): store for the editor, URL for the frontend.
    const ctxLayoutId = useActiveLayoutId();
    const ctxSectionId = useActiveSectionId();
    const editorLayout = useActiveLayout();
    const editorSection = useActiveSection();
    const allLayouts = useDashboardStore((s) => s.layouts);
    const { layoutSlug, sectionSlug, tabSlug } = useParams();
    const navigate = useNavigate();
    // A menu inside the admin area is a preview — navigating would leave the editor.
    const inAdmin = useLocation().pathname.startsWith('/admin');

    const frontView = resolveView(allLayouts, layoutSlug, sectionSlug);
    const ctxLayout = ctxLayoutId ? allLayouts.find((l) => l.id === ctxLayoutId) : undefined;
    const layout = ctxLayout ?? (editMode ? editorLayout : frontView?.layout);
    const section =
        layout?.sections.find((sec) => sec.id === ctxSectionId) ??
        (layout === editorLayout ? editorSection : undefined) ??
        (layout === frontView?.layout ? frontView?.section : undefined) ??
        layout?.sections[0];
    const inert = editMode || inAdmin;

    // ── Active entry ──────────────────────────────────────────────────────────
    const keyOf = (it: Section | Tab) => it.slug ?? it.id;
    const activeSectionKey = section ? keyOf(section) : '';
    // The tab on screen — in the editor the one being edited, in the frontend the
    // one the URL names (falling back to the section's default).
    const activeTabKey = (() => {
        const tabs = section?.tabs ?? [];
        let active: Tab | undefined;
        if (inert) {
            active = tabs.find((tb) => tb.id === section?.activeTabId);
        } else {
            active =
                (tabSlug ? tabs.find((tb) => (tb.slug ?? tb.id) === tabSlug) : undefined) ??
                tabs.find((tb) => tb.id === section?.defaultTabId) ??
                tabs.find((tb) => tb.id === section?.activeTabId) ??
                tabs[0];
        }
        return active ? keyOf(active) : '';
    })();
    const activeKey = menuMode === 'section' ? activeSectionKey : activeTabKey;

    // ── Items — respect the global `hidden` flag AND the per-widget de-selection ─
    const toItem = (it: Section | Tab): MenuItem => ({
        key: keyOf(it),
        name: it.name,
        icon: it.icon,
        disabled: (it as Tab).disabled,
    });
    const rawItems: (Section | Tab)[] = menuMode === 'tab' ? (section?.tabs ?? []) : (layout?.sections ?? []);
    const items: MenuItem[] = rawItems
        .filter((it) => !it.hidden)
        .map(toItem)
        .filter((it) => !hiddenItems.includes(it.key));

    // ── Overview groups (#669) ────────────────────────────────────────────────
    // One group per visible section; `hiddenItems` de-selects whole sections here.
    // The search matches the tab name or its section's name and drops empty groups,
    // so on a tablet the hits are the only thing left to tap.
    const needle = query.trim().toLowerCase();
    const sourceLayouts: DashboardLayout[] = menuSource === 'all' ? allLayouts : layout ? [layout] : [];
    const groups: OverviewGroup[] =
        menuMode === 'overview'
            ? sourceLayouts
                  .filter((l) => !l.hidden)
                  .flatMap((l) =>
                      l.sections
                          .filter((sec) => !sec.hidden && !hiddenItems.includes(keyOf(sec)))
                          .map((sec): OverviewGroup => {
                              const sectionHit = !needle || sec.name.toLowerCase().includes(needle);
                              return {
                                  key: `${l.id}/${sec.id}`,
                                  layoutId: l.id,
                                  layoutSlug: l.slug,
                                  layoutName: l.name,
                                  multiSection: l.sections.length > 1,
                                  section: toItem(sec),
                                  items: sec.tabs
                                      .filter((tb) => !tb.hidden)
                                      .map(toItem)
                                      .filter((it) => sectionHit || it.name.toLowerCase().includes(needle)),
                              };
                          })
                          .filter((g) => g.items.length > 0),
                  )
            : [];
    const showLayoutHeading = menuSource === 'all' && new Set(groups.map((g) => g.layoutId)).size > 1;

    const go = (item: MenuItem) => {
        if (inert || !layout || item.disabled) return; // editor preview is inert
        if (menuMode === 'section') {
            navigate(`/view/${layout.slug}/s/${item.key}`);
        } else {
            // Match App.tsx viewBase: the section segment is only present when the
            // layout has more than one section.
            const base =
                section && layout.sections.length > 1
                    ? `/view/${layout.slug}/s/${section.slug}`
                    : `/view/${layout.slug}`;
            navigate(`${base}/tab/${item.key}`);
        }
    };

    // Same URL rule as `go`, for the section the chip belongs to — which may be
    // another section or (menuSource "all") another layout than the one on screen.
    const goOverview = (group: OverviewGroup, item: MenuItem) => {
        if (inert || item.disabled) return;
        const base = group.multiSection
            ? `/view/${group.layoutSlug}/s/${group.section.key}`
            : `/view/${group.layoutSlug}`;
        navigate(`${base}/tab/${item.key}`);
    };

    const alignJustify = align === 'end' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';

    const containerStyle: React.CSSProperties =
        variant === 'grid'
            ? { display: 'grid', gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, gap: `${gap}px` }
            : variant === 'vlist'
              ? { display: 'flex', flexDirection: 'column', gap: `${gap}px`, alignItems: 'stretch' }
              : variant === 'pills'
                ? { display: 'flex', flexWrap: 'wrap', gap: `${gap}px`, justifyContent: alignJustify }
                : {
                      display: 'flex',
                      gap: `${gap}px`,
                      overflowX: 'auto',
                      scrollbarWidth: 'none',
                      justifyContent: alignJustify,
                  };

    // Pills variant forces the pill indicator; every other variant honours the choice.
    // The overview is a wrapping chip field, so it starts as pills too — until the
    // user picks an indicator explicitly.
    const effIndicator: IndicatorStyle =
        variant === 'pills' || (menuMode === 'overview' && o.indicatorStyle === undefined) ? 'pills' : indicatorStyle;

    const renderIcon = (item: MenuItem, isActive: boolean, fallback: boolean, size = iconSize) => {
        if (!showIcons) return null;
        // Sections fall back to a generic icon (like the section menu); tabs show
        // no icon when none is set (matching the tab bar).
        const glyph = item.icon ? (
            <Icon icon={item.icon} width={size} height={size} style={{ color: 'currentColor' }} />
        ) : fallback ? (
            <LayoutDashboard size={size} />
        ) : null;
        if (!glyph) return null;
        // The icon follows the entry's text colour unless the theme overrides it.
        return (
            <span
                data-aura-nav-icon="menu"
                className="shrink-0 inline-flex items-center"
                style={{ color: navIcon(isActive) }}
            >
                {glyph}
            </span>
        );
    };

    // ── Overview (#669) ───────────────────────────────────────────────────────
    if (menuMode === 'overview') {
        const chip = CHIP_SIZE[chipSize] ?? CHIP_SIZE.md;
        const titleIcon = Math.max(10, Math.round(iconSize * 0.75));
        let lastLayoutId = '';
        return (
            <div className="aura-widget-row relative w-full h-full flex flex-col" data-menu-overview="">
                {showSearch && (
                    <div
                        className="nodrag flex items-center gap-1.5 rounded-lg px-2 py-1 mb-2 shrink-0"
                        style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                    >
                        <Search size={12} style={{ color: 'var(--text-secondary)' }} />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t('menu.searchPlaceholder')}
                            data-menu-search=""
                            className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none"
                            style={{ color: 'var(--text-primary)' }}
                        />
                    </div>
                )}
                <div className="nodrag flex-1 min-h-0" style={{ overflowY: 'auto' }}>
                    {groups.length === 0 ? (
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {needle ? t('menu.noMatch') : t('menu.empty')}
                        </p>
                    ) : (
                        <div className="flex flex-col" style={{ gap: `${gap + 8}px` }}>
                            {groups.map((group) => {
                                const heading = showLayoutHeading && group.layoutId !== lastLayoutId;
                                lastLayoutId = group.layoutId;
                                return (
                                    <div key={group.key} data-menu-group={group.section.key}>
                                        {heading && (
                                            <p
                                                data-menu-layout={group.layoutSlug}
                                                className="text-xs font-semibold mb-1.5"
                                                style={{ color: 'var(--text-primary)' }}
                                            >
                                                {group.layoutName}
                                            </p>
                                        )}
                                        {groupTitle !== 'none' && (
                                            <div
                                                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                                                style={{ color: navText() }}
                                            >
                                                {groupTitle === 'iconName' &&
                                                    renderIcon(group.section, false, true, titleIcon)}
                                                <span className="truncate">{group.section.name}</span>
                                            </div>
                                        )}
                                        <div
                                            style={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                gap: `${gap}px`,
                                                justifyContent: alignJustify,
                                            }}
                                        >
                                            {group.items.map((item) => {
                                                const isActive =
                                                    group.layoutId === layout?.id &&
                                                    group.section.key === activeSectionKey &&
                                                    item.key === activeTabKey;
                                                return (
                                                    <button
                                                        key={item.key}
                                                        data-menu-item={item.key}
                                                        data-active={isActive ? '' : undefined}
                                                        onClick={() => goOverview(group, item)}
                                                        className={`flex items-center gap-1.5 ${chip.cls} whitespace-nowrap transition-opacity hover:opacity-80`}
                                                        style={{
                                                            padding: chip.padding,
                                                            ...menuItemStyle(isActive, effIndicator),
                                                            opacity: item.disabled ? 0.4 : undefined,
                                                            cursor: inert
                                                                ? 'default'
                                                                : item.disabled
                                                                  ? 'not-allowed'
                                                                  : 'pointer',
                                                        }}
                                                    >
                                                        {renderIcon(item, isActive, false)}
                                                        <span className="truncate">{item.name}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="aura-widget-row relative w-full h-full flex flex-col">
            <div
                className="nodrag flex-1 min-h-0"
                style={variant === 'vlist' ? { overflowY: 'auto' } : { display: 'flex', alignItems: 'center' }}
            >
                {items.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {t('menu.empty')}
                    </p>
                ) : (
                    <div style={{ ...containerStyle, width: '100%' }}>
                        {items.map((item) => {
                            const isActive = item.key === activeKey;
                            return (
                                <button
                                    key={item.key}
                                    onClick={() => go(item)}
                                    className="flex items-center gap-1.5 text-sm whitespace-nowrap transition-opacity hover:opacity-80"
                                    style={{
                                        padding: '4px 10px',
                                        justifyContent:
                                            variant === 'grid'
                                                ? 'center'
                                                : variant === 'vlist'
                                                  ? 'flex-start'
                                                  : undefined,
                                        ...menuItemStyle(isActive, effIndicator),
                                        opacity: item.disabled ? 0.4 : undefined,
                                        cursor: inert ? 'default' : item.disabled ? 'not-allowed' : 'pointer',
                                    }}
                                >
                                    {renderIcon(item, isActive, menuMode === 'section')}
                                    {showLabels && <span className="truncate">{item.name}</span>}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
