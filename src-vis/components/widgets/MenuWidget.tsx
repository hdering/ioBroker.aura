import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '@iconify/react';
import { LayoutDashboard } from 'lucide-react';
import {
    useDashboardStore,
    useActiveLayout,
    useActiveSection,
    resolveView,
    type Section,
    type Tab,
} from '../../store/dashboardStore';
import { useActiveLayoutId } from '../../contexts/ActiveLayoutContext';
import { useActiveSectionId } from '../../contexts/ActiveSectionContext';
import { useT } from '../../i18n';
import type { WidgetProps } from '../../types';

type MenuMode = 'section' | 'tab';
type MenuVariant = 'hbar' | 'vlist' | 'grid' | 'pills';
type IndicatorStyle = 'text' | 'underline' | 'filled' | 'pills';

interface MenuItem {
    key: string; // slug ?? id — stable identifier used for navigation, active-match and de-selection
    name: string;
    icon?: string;
    disabled?: boolean;
}

// Mirrors TabBar.tabStyle (TabBar.tsx:143-182). Kept local so this widget stays
// purely additive — no export/refactor of the tab-bar internals required.
function menuItemStyle(isActive: boolean, style: IndicatorStyle): React.CSSProperties {
    const activeClr = 'var(--nav-active, var(--accent))';
    const inactiveClr = 'var(--text-secondary)';

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

    const t = useT();

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
    let activeKey = '';
    if (menuMode === 'section') {
        activeKey = section ? keyOf(section) : '';
    } else {
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
        activeKey = active ? keyOf(active) : '';
    }

    // ── Items — respect the global `hidden` flag AND the per-widget de-selection ─
    const rawItems: (Section | Tab)[] = menuMode === 'section' ? (layout?.sections ?? []) : (section?.tabs ?? []);
    const items: MenuItem[] = rawItems
        .filter((it) => !it.hidden)
        .map((it) => ({
            key: keyOf(it),
            name: it.name,
            icon: it.icon,
            disabled: (it as Tab).disabled,
        }))
        .filter((it) => !hiddenItems.includes(it.key));

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
    const effIndicator: IndicatorStyle = variant === 'pills' ? 'pills' : indicatorStyle;

    const renderIcon = (item: MenuItem) => {
        if (!showIcons) return null;
        if (item.icon) {
            return <Icon icon={item.icon} width={iconSize} height={iconSize} style={{ color: 'currentColor' }} />;
        }
        // Sections fall back to a generic icon (like the section menu); tabs show
        // no icon when none is set (matching the tab bar).
        return menuMode === 'section' ? <LayoutDashboard size={iconSize} /> : null;
    };

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
                                    {renderIcon(item)}
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
