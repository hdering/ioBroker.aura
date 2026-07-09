import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Settings, X, GripVertical, ChevronDown, ChevronRight, Download, Upload } from 'lucide-react';
import { useDashboardStore, useActiveLayout, resolveTabBarSettings } from '../../store/dashboardStore';
import type { Tab, TabBarItem, TabBarSettings, DashboardLayout } from '../../store/dashboardStore';
import { exportTab, importTab } from '../../utils/widgetExportImport';
import { ExportAnonymizeDialog } from '../config/ExportAnonymizeDialog';
import { useConfigStore } from '../../store/configStore';
import { Icon } from '@iconify/react';
import { IconPickerModal } from '../config/IconPickerModal';
import { useT } from '../../i18n';
import { subscribeDpValue } from '../../hooks/useIoBroker';
import { applyCustomFormat, fmtTime, fmtDate } from '../../utils/clockUtils';
import { useTabConditionStyle } from '../../hooks/useTabConditionStyle';
import { useBadges, useTabBadgeAggregate } from '../../hooks/useBadges';
import { ConditionEditor } from '../config/ConditionEditor';
import { BadgeEditor } from '../config/BadgeEditor';
import { BadgeOverlay } from '../widgets/BadgeOverlay';
import type { BadgeCorner, BadgeSize } from '../../types';
import type { ResolvedBadge } from '../../hooks/useBadges';

interface TabBarProps {
    readonly?: boolean;
    viewTabs?: Tab[];
    viewActiveTabId?: string;
    onViewTabClick?: (tab: Tab) => void;
    layoutUrlBase?: string;
    layoutId?: string;
    /** Optional leading slot rendered before any left items / tabs (used for inline LayoutDrawer). */
    headerSlot?: React.ReactNode;
}

const iCls = 'w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none';
const iSty = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

const FONT_SIZE_MAP: Record<string, string> = {
    sm: '0.75rem',
    md: '0.875rem',
    lg: '1rem',
};

function resolveTabBarFontSize(fs: TabBarSettings['fontSize']): string {
    if (typeof fs === 'number') return `${fs}px`;
    return FONT_SIZE_MAP[fs ?? 'md'];
}

// ── Item renderers ─────────────────────────────────────────────────────────────

function TabBarClockItem({ item }: { item: TabBarItem }) {
    const t = useT();
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    if (item.clockCustomFormat) {
        return (
            <span className="text-sm font-medium tabular-nums shrink-0" style={{ color: 'var(--text-primary)' }}>
                {applyCustomFormat(now, item.clockCustomFormat, t)}
            </span>
        );
    }

    const timeStr = fmtTime(now, item.clockShowSeconds ?? false);
    const dateStr = fmtDate(now, item.clockDateLength ?? 'short', t);

    if (item.clockDisplay === 'datetime') {
        return (
            <div className="flex flex-col items-end leading-tight shrink-0">
                <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {timeStr}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {dateStr}
                </span>
            </div>
        );
    }

    const text = item.clockDisplay === 'date' ? dateStr : timeStr;
    return (
        <span className="text-sm font-medium tabular-nums shrink-0" style={{ color: 'var(--text-primary)' }}>
            {text}
        </span>
    );
}

function TabBarDatapointItem({ item }: { item: TabBarItem }) {
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
            <span
                className="text-sm font-medium shrink-0"
                style={{ color: 'var(--text-primary)' }}
                dangerouslySetInnerHTML={{ __html: item.datapointTemplate.replace(/\{dp\}/g, val) }}
            />
        );
    }

    return (
        <span className="text-sm font-medium tabular-nums shrink-0" style={{ color: 'var(--text-primary)' }}>
            {val}
        </span>
    );
}

function TabBarTextItem({ item }: { item: TabBarItem }) {
    return (
        <span className="text-sm font-medium shrink-0" style={{ color: 'var(--text-primary)' }}>
            {item.text ?? ''}
        </span>
    );
}

function renderTabBarItem(item: TabBarItem) {
    if (item.type === 'clock') return <TabBarClockItem key={item.id} item={item} />;
    if (item.type === 'datapoint') return <TabBarDatapointItem key={item.id} item={item} />;
    return <TabBarTextItem key={item.id} item={item} />;
}

// ── Computed tab styles based on indicatorStyle ────────────────────────────────
// Uses var(--tab-*) with fallbacks so condition CSS vars can override per-tab.

function tabStyle(isActive: boolean, settings: TabBarSettings | undefined): React.CSSProperties {
    const style = settings?.indicatorStyle ?? 'underline';
    const activeClr = settings?.activeColor ?? 'var(--nav-active, var(--accent))';
    const inactiveClr = settings?.inactiveColor ?? 'var(--text-secondary)';

    if (style === 'pills') {
        return {
            background: isActive ? `var(--tab-bg, ${activeClr})` : 'var(--tab-bg, transparent)',
            color: isActive ? 'var(--tab-text, #fff)' : `var(--tab-text, ${inactiveClr})`,
            borderRadius: '9999px',
            padding: '4px 12px',
            borderBottom: 'none',
        };
    }

    if (style === 'filled') {
        return {
            background: isActive
                ? `var(--tab-bg, color-mix(in srgb, ${activeClr} 15%, transparent))`
                : 'var(--tab-bg, transparent)',
            color: isActive ? `var(--tab-text, ${activeClr})` : `var(--tab-text, ${inactiveClr})`,
            borderRadius: '8px',
            borderBottom: 'none',
        };
    }

    // underline (default)
    return {
        borderBottomColor: isActive ? `var(--tab-accent, ${activeClr})` : 'transparent',
        color: isActive ? `var(--tab-accent, ${activeClr})` : `var(--tab-text, ${inactiveClr})`,
    };
}

// ── Tab condition wrapper — allows useTabConditionStyle per tab ────────────────

function TabConditionWrapper({
    tab,
    children,
}: {
    tab: Tab;
    children: (result: ReturnType<typeof useTabConditionStyle>) => React.ReactNode;
}) {
    const result = useTabConditionStyle(tab.conditions);
    return <>{children(result)}</>;
}

// ── Tab badges — own badges + optional aggregate count of child widgets ────────

function TabBadges({ tab }: { tab: Tab }) {
    const own = useBadges(tab.badges);
    const aggEnabled = tab.badgeAggregate?.enabled ?? false;
    const aggCount = useTabBadgeAggregate(aggEnabled ? tab.widgets : undefined);

    const badges: ResolvedBadge[] = [...own];
    if (aggEnabled && aggCount > 0) {
        badges.push({
            id: `__agg_${tab.id}`,
            style: 'count',
            corner: (tab.badgeAggregate?.corner as BadgeCorner) ?? 'top-right',
            color: tab.badgeAggregate?.color,
            size: (tab.badgeAggregate?.size as BadgeSize) ?? 'md',
            text: String(aggCount),
        });
    }
    return <BadgeOverlay badges={badges} />;
}

// ── Scrollable tab row + custom "more tabs" indicator ─────────────────────────
// Wraps a horizontally scrolling row. On mobile the native (flickering, low)
// scrollbar is hidden and replaced with a static thumb that tracks the scroll
// position and sits just under the tabs. See .aura-tab-scroll-* in index.css.

function TabScrollRow({
    isMobile,
    outerClassName = '',
    scrollClassName = '',
    children,
}: {
    isMobile: boolean;
    outerClassName?: string;
    scrollClassName?: string;
    children: React.ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [ind, setInd] = useState<{ show: boolean; left: number; width: number }>({
        show: false,
        left: 0,
        width: 0,
    });

    const recompute = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const { scrollWidth, clientWidth, scrollLeft } = el;
        const overflow = scrollWidth - clientWidth;
        if (overflow <= 2) {
            setInd((p) => (p.show ? { show: false, left: 0, width: 0 } : p));
            return;
        }
        const width = Math.max((clientWidth / scrollWidth) * 100, 15);
        const left = (scrollLeft / overflow) * (100 - width);
        setInd({ show: true, left, width });
    }, []);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        recompute();
        const ro = new ResizeObserver(recompute);
        ro.observe(el);
        const inner = el.firstElementChild;
        if (inner) ro.observe(inner);
        el.addEventListener('scroll', recompute, { passive: true });
        return () => {
            ro.disconnect();
            el.removeEventListener('scroll', recompute);
        };
    }, [recompute]);

    // Outer must be a flex container so the scroll row is stretched to the bar height
    // via align-items:stretch. The scroll row carries .aura-badge-room (padding 14 /
    // margin -14 so corner badges aren't clipped); when stretched, that yields a content
    // box equal to the bar height, so its inner `items-center` centers the tabs. A fixed
    // height (h-full) would shrink the content box by the 28px padding and break both the
    // centering and clip the vertical axis — do not add one.
    return (
        <div className={`relative flex ${outerClassName}`}>
            <div
                ref={ref}
                className={`aura-scroll aura-badge-room overflow-x-auto ${isMobile ? 'aura-tab-scroll--mobile' : ''} ${scrollClassName}`}
            >
                {children}
            </div>
            {isMobile && ind.show && (
                <div className="aura-tab-scroll-ind" style={{ left: `${ind.left}%`, width: `${ind.width}%` }} />
            )}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TabBar({
    readonly = false,
    viewTabs,
    viewActiveTabId,
    onViewTabClick,
    layoutUrlBase = '',
    layoutId,
    headerSlot,
}: TabBarProps) {
    const t = useT();
    const activeLayout = useActiveLayout();
    const specificLayout = useDashboardStore((s) =>
        layoutId ? (s.layouts.find((l) => l.id === layoutId) ?? null) : null,
    ) as DashboardLayout | null;
    const layout = specificLayout ?? activeLayout;
    const { setActiveTab, addTab, addTabFromImport, removeTab, renameTab, updateTab, reorderTabs, editMode } =
        useDashboardStore();

    const tabs = viewTabs ?? layout.tabs;
    const activeTabId = viewActiveTabId ?? layout.activeTabId;
    const globalTabBar = useConfigStore((s) => s.frontend.tabBar);
    const tbSettings = resolveTabBarSettings(globalTabBar, layout.settings?.tabBar);
    const items = tbSettings?.items ?? [];

    const leftItems = items.filter((i) => i.position === 'left');
    const centerItems = items.filter((i) => i.position === 'center');
    const rightItems = items.filter((i) => i.position === 'right');
    const hasExtras = centerItems.length > 0 || rightItems.length > 0;

    const mobileBreakpoint = useConfigStore((s) => s.frontend.mobileBreakpoint ?? 600);
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < mobileBreakpoint);
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < mobileBreakpoint);
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, [mobileBreakpoint]);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    const [settingsTabId, setSettingsTabId] = useState<string | null>(null);
    const [showTabExport, setShowTabExport] = useState(false);
    const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const [conditionsOpen, setConditionsOpen] = useState(false);
    const [badgesOpen, setBadgesOpen] = useState(false);
    const [iconPickerTabId, setIconPickerTabId] = useState<string | null>(null);
    const settingsBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

    const importTabRef = useRef<HTMLInputElement>(null);
    const handleImportTab = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const raw = JSON.parse(String(ev.target?.result ?? ''));
                    const tabData = importTab(raw);
                    if (!tabData) {
                        alert(t('tabBar.importInvalidFile'));
                        return;
                    }
                    addTabFromImport(tabData);
                } catch {
                    alert(t('tabBar.importInvalidFile'));
                }
                if (importTabRef.current) importTabRef.current.value = '';
            };
            reader.readAsText(file);
        },
        [addTabFromImport, t],
    );

    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingId]);

    useEffect(() => {
        if (!editMode) setSettingsTabId(null);
    }, [editMode]);

    useEffect(() => {
        setConditionsOpen(false);
    }, [settingsTabId]);

    const commitRename = () => {
        if (editingId && editingName.trim()) renameTab(editingId, editingName.trim());
        setEditingId(null);
    };

    const handleTabClick = (tabId: string) => {
        if (readonly) {
            const tab = tabs.find((t) => t.id === tabId);
            if (!tab) return;
            if (onViewTabClick) {
                onViewTabClick(tab);
            } else {
                navigate(`${layoutUrlBase}/tab/${tab.slug ?? tab.id}`);
            }
        } else {
            setActiveTab(tabId);
        }
    };

    const openSettings = (tabId: string) => {
        const btn = settingsBtnRefs.current.get(tabId);
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        setPanelPos({ top: rect.bottom + 6, left: rect.left });
        setSettingsTabId((prev) => (prev === tabId ? null : tabId));
    };

    if (tabs.length <= 1 && readonly && !headerSlot) return null;

    const settingsTab = tabs.find((t) => t.id === settingsTabId);

    // ── Container style ──────────────────────────────────────────────────────────
    const barHeight = tbSettings?.height;
    const barBg = tbSettings?.background ?? 'var(--nav-bg, var(--app-surface))';
    const tabIconSize = tbSettings?.iconSize ?? 14;
    const containerStyle: React.CSSProperties = {
        background: barBg,
        borderBottom: '1px solid var(--app-border)',
        fontSize: resolveTabBarFontSize(tbSettings?.fontSize),
        // Lift the bar into its own stacking context above the dashboard content.
        // Bottom-corner tab badges overflow downward past the bar (see .aura-badge-room);
        // without this, the following-sibling content — especially opaque iframe widgets —
        // paints over that overflow and hides the badge. The dashboard's grid wrapper is
        // itself z-index:10, so the bar must sit strictly above that (but below the
        // edit-mode guideline overlays at z-index 40+) to win the overlap.
        position: 'relative',
        zIndex: 20,
        ...(barHeight ? { minHeight: `${barHeight}px` } : {}),
    };

    // ── Tab rendering ────────────────────────────────────────────────────────────
    const renderTabs = () =>
        tabs.map((tab, idx) => (
            <TabConditionWrapper key={tab.id} tab={tab}>
                {({ cssVars, effect, hidden }) => {
                    // Frontend or readonly preview: hide disabled / hidden / condition-hidden tabs
                    // (hidden tabs stay reachable via their direct slug URL — they are only
                    //  removed from the tab bar, not from the layout)
                    if (readonly && (tab.disabled || tab.hidden || hidden)) return null;

                    const isActive = tab.id === activeTabId;
                    const ts = tabStyle(isActive, tbSettings);
                    const indicatorStyle = tbSettings?.indicatorStyle ?? 'underline';
                    const isDraggingThis = dragIdx === idx;
                    const isDragTarget = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx;

                    const baseOpacity = isDraggingThis ? 0.4 : tab.disabled ? 0.45 : 1;

                    return (
                        <div
                            className={`group relative flex items-center gap-1.5 px-3 cursor-pointer transition-colors whitespace-nowrap select-none ${indicatorStyle === 'underline' ? 'py-2.5 border-b-2' : 'py-1.5'}`}
                            style={{
                                ...(cssVars as React.CSSProperties),
                                ...ts,
                                opacity: baseOpacity,
                                ...(isDragTarget ? { boxShadow: '-2px 0 0 0 var(--accent)' } : {}),
                                animation:
                                    !editMode && effect === 'pulse'
                                        ? 'tabPulse 1.5s ease-in-out infinite'
                                        : !editMode && effect === 'blink'
                                          ? 'tabBlink 1s step-end infinite'
                                          : undefined,
                            }}
                            onDragOver={
                                editMode && !readonly
                                    ? (e) => {
                                          e.preventDefault();
                                          setDragOverIdx(idx);
                                      }
                                    : undefined
                            }
                            onDragEnter={
                                editMode && !readonly
                                    ? (e) => {
                                          e.preventDefault();
                                          setDragOverIdx(idx);
                                      }
                                    : undefined
                            }
                            onDragLeave={editMode && !readonly ? () => setDragOverIdx(null) : undefined}
                            onDrop={
                                editMode && !readonly
                                    ? (e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (dragIdx !== null && dragIdx !== idx) reorderTabs(dragIdx, idx);
                                          setDragIdx(null);
                                          setDragOverIdx(null);
                                      }
                                    : undefined
                            }
                            onClick={() => {
                                setConfirmDeleteId(null);
                                handleTabClick(tab.id);
                            }}
                        >
                            {editMode && !readonly && (
                                <span
                                    draggable
                                    onDragStart={(e) => {
                                        e.stopPropagation();
                                        setDragIdx(idx);
                                        e.dataTransfer.effectAllowed = 'move';
                                        e.dataTransfer.setData('text/plain', String(idx));
                                    }}
                                    onDragEnd={() => {
                                        setDragIdx(null);
                                        setDragOverIdx(null);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                        cursor: 'grab',
                                        color: 'var(--text-secondary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        flexShrink: 0,
                                    }}
                                >
                                    <GripVertical size={12} />
                                </span>
                            )}

                            {tab.icon && (
                                <span
                                    style={{
                                        width: tabIconSize,
                                        height: tabIconSize,
                                        flexShrink: 0,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                    }}
                                >
                                    <Icon
                                        icon={tab.icon}
                                        width={tabIconSize}
                                        height={tabIconSize}
                                        style={{ color: 'currentColor' }}
                                    />
                                </span>
                            )}

                            {!readonly && editingId === tab.id ? (
                                <input
                                    ref={inputRef}
                                    value={editingName}
                                    onChange={(e) => setEditingName(e.target.value)}
                                    onBlur={commitRename}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitRename();
                                        if (e.key === 'Escape') setEditingId(null);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-24 text-sm rounded px-1.5 py-0.5 focus:outline-none"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--accent)',
                                    }}
                                />
                            ) : (
                                (!readonly || !tab.hideLabel) && (
                                    <span
                                        onDoubleClick={(e) => {
                                            if (!readonly) {
                                                e.stopPropagation();
                                                setEditingId(tab.id);
                                                setEditingName(tab.name);
                                            }
                                        }}
                                    >
                                        {tab.name}
                                    </span>
                                )
                            )}

                            {!readonly && editMode && (
                                <button
                                    ref={(el) => {
                                        if (el) settingsBtnRefs.current.set(tab.id, el);
                                        else settingsBtnRefs.current.delete(tab.id);
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openSettings(tab.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded transition-all hover:opacity-80"
                                    style={{
                                        color: settingsTabId === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
                                    }}
                                >
                                    <Settings size={11} />
                                </button>
                            )}

                            {!readonly &&
                                editMode &&
                                tabs.length > 1 &&
                                (confirmDeleteId === tab.id ? (
                                    <>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setConfirmDeleteId(null);
                                            }}
                                            className="w-4 h-4 flex items-center justify-center rounded-full text-xs transition-all hover:opacity-80"
                                            style={{ background: 'var(--app-border)', color: 'var(--text-secondary)' }}
                                        >
                                            ✕
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeTab(tab.id);
                                                setConfirmDeleteId(null);
                                            }}
                                            className="w-4 h-4 flex items-center justify-center rounded-full text-xs transition-all hover:opacity-80"
                                            style={{ background: 'var(--accent-red)', color: '#fff' }}
                                        >
                                            ✓
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setConfirmDeleteId(tab.id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded-full text-xs transition-all hover:opacity-80"
                                        style={{ background: 'var(--accent-red)', color: '#fff' }}
                                    >
                                        ✕
                                    </button>
                                ))}

                            <TabBadges tab={tab} />
                        </div>
                    );
                }}
            </TabConditionWrapper>
        ));

    // ── Tab settings portal ──────────────────────────────────────────────────────
    const panelWidth = conditionsOpen || badgesOpen ? 500 : 256;
    // Clamp left so a far-right tab's panel (esp. the wide 500px conditions view)
    // stays inside the viewport instead of being cut off on the right edge.
    const panelLeft = Math.max(
        8,
        Math.min(
            panelPos.left,
            (typeof window !== 'undefined' ? window.innerWidth : panelPos.left + panelWidth) - panelWidth - 8,
        ),
    );
    const settingsPanel =
        settingsTabId && settingsTab
            ? createPortal(
                  <>
                      <div className="fixed inset-0 z-[998]" onClick={() => setSettingsTabId(null)} />
                      <div
                          className="fixed z-[999] rounded-xl shadow-2xl p-3 space-y-3 overflow-y-auto"
                          style={{
                              top: panelPos.top,
                              left: panelLeft,
                              width: panelWidth,
                              maxHeight: `calc(100vh - ${panelPos.top}px - 16px)`,
                              background: 'var(--app-surface)',
                              backdropFilter: 'blur(20px)',
                              WebkitBackdropFilter: 'blur(20px)',
                              border: '1px solid var(--app-border)',
                          }}
                      >
                          <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                  {t('tabBar.settings')}
                              </span>
                              <button
                                  onClick={() => setSettingsTabId(null)}
                                  className="w-5 h-5 flex items-center justify-center rounded hover:opacity-70"
                              >
                                  <X size={12} style={{ color: 'var(--text-secondary)' }} />
                              </button>
                          </div>

                          <div>
                              <label className="text-[11px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                                  {t('tabBar.name')}
                              </label>
                              <input
                                  type="text"
                                  value={settingsTab.name}
                                  onChange={(e) => updateTab(settingsTabId, { name: e.target.value })}
                                  className={iCls}
                                  style={iSty}
                              />
                          </div>

                          <div className="flex items-center justify-between">
                              <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                  {t('tabBar.hideLabel')}
                              </label>
                              <button
                                  onClick={() => updateTab(settingsTabId, { hideLabel: !settingsTab.hideLabel })}
                                  className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                  style={{ background: settingsTab.hideLabel ? 'var(--accent)' : 'var(--app-border)' }}
                              >
                                  <span
                                      className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                      style={{ left: settingsTab.hideLabel ? '18px' : '2px' }}
                                  />
                              </button>
                          </div>

                          <div className="flex items-center justify-between">
                              <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                  {t('tabBar.disabled')}
                              </label>
                              <button
                                  onClick={() => {
                                      const nonDisabledCount = tabs.filter((t) => !t.disabled).length;
                                      if (!settingsTab.disabled && nonDisabledCount <= 1) return; // last visible tab
                                      updateTab(settingsTabId, { disabled: !settingsTab.disabled });
                                  }}
                                  className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                  style={{ background: settingsTab.disabled ? 'var(--accent)' : 'var(--app-border)' }}
                              >
                                  <span
                                      className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                      style={{ left: settingsTab.disabled ? '18px' : '2px' }}
                                  />
                              </button>
                          </div>

                          <div className="flex items-center justify-between">
                              <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                  {t('tabBar.hidden')}
                              </label>
                              <button
                                  onClick={() => updateTab(settingsTabId, { hidden: !settingsTab.hidden })}
                                  className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                  style={{ background: settingsTab.hidden ? 'var(--accent)' : 'var(--app-border)' }}
                              >
                                  <span
                                      className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                      style={{ left: settingsTab.hidden ? '18px' : '2px' }}
                                  />
                              </button>
                          </div>

                          <div>
                              <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                      {t('tabBar.icon')}
                                  </label>
                                  {settingsTab.icon && (
                                      <button
                                          onClick={() => updateTab(settingsTabId, { icon: undefined })}
                                          className="text-[10px] hover:opacity-70"
                                          style={{ color: 'var(--text-secondary)' }}
                                      >
                                          {t('tabBar.remove')}
                                      </button>
                                  )}
                              </div>
                              <button
                                  onClick={() => setIconPickerTabId(settingsTabId)}
                                  className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs transition-colors hover:opacity-80"
                                  style={{
                                      background: 'var(--app-bg)',
                                      border: '1px solid var(--app-border)',
                                      color: 'var(--text-secondary)',
                                  }}
                              >
                                  {settingsTab.icon ? (
                                      <Icon
                                          icon={settingsTab.icon}
                                          width={14}
                                          height={14}
                                          style={{ color: 'var(--accent)', flexShrink: 0 }}
                                      />
                                  ) : (
                                      <span
                                          className="w-3.5 h-3.5 rounded-sm shrink-0"
                                          style={{ background: 'var(--app-border)' }}
                                      />
                                  )}
                                  <span
                                      className="truncate"
                                      style={{
                                          color: settingsTab.icon ? 'var(--text-primary)' : 'var(--text-secondary)',
                                      }}
                                  >
                                      {settingsTab.icon ?? t('tabBar.selectIcon')}
                                  </span>
                              </button>
                          </div>

                          {/* ── Conditions section ──────────────────────────────────────── */}
                          <div className="border-t pt-2" style={{ borderColor: 'var(--app-border)' }}>
                              <button
                                  className="flex items-center gap-1.5 w-full text-left hover:opacity-80"
                                  onClick={() => setConditionsOpen((o) => !o)}
                              >
                                  <span style={{ color: 'var(--text-secondary)' }}>
                                      {conditionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                  </span>
                                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                                      {t('tabBar.conditions')}
                                      {(settingsTab.conditions?.length ?? 0) > 0 && (
                                          <span
                                              className="ml-1.5 px-1 rounded-full text-[9px]"
                                              style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
                                          >
                                              {settingsTab.conditions!.length}
                                          </span>
                                      )}
                                  </span>
                              </button>

                              {conditionsOpen && (
                                  <div className="mt-2">
                                      <ConditionEditor
                                          conditions={settingsTab.conditions ?? []}
                                          onChange={(next) => updateTab(settingsTabId, { conditions: next })}
                                          context="tab"
                                          style={{ width: '100%', padding: 0 }}
                                      />
                                  </div>
                              )}
                          </div>

                          {/* ── Badges section ──────────────────────────────────────────── */}
                          <div className="border-t pt-2" style={{ borderColor: 'var(--app-border)' }}>
                              <button
                                  className="flex items-center gap-1.5 w-full text-left hover:opacity-80"
                                  onClick={() => setBadgesOpen((o) => !o)}
                              >
                                  <span style={{ color: 'var(--text-secondary)' }}>
                                      {badgesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                  </span>
                                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                                      {t('tabBar.badges')}
                                      {(settingsTab.badges?.length ?? 0) > 0 && (
                                          <span
                                              className="ml-1.5 px-1 rounded-full text-[9px]"
                                              style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
                                          >
                                              {settingsTab.badges!.length}
                                          </span>
                                      )}
                                  </span>
                              </button>

                              {badgesOpen && (
                                  <div className="mt-2 space-y-2">
                                      <BadgeEditor
                                          badges={settingsTab.badges ?? []}
                                          onChange={(next) => updateTab(settingsTabId, { badges: next })}
                                          style={{ width: '100%', padding: 0 }}
                                      />
                                      {/* Aggregate count of widgets with an active badge */}
                                      <div
                                          className="flex items-center justify-between pt-2 border-t"
                                          style={{ borderColor: 'var(--app-border)' }}
                                      >
                                          <div>
                                              <p
                                                  className="text-[11px] font-medium"
                                                  style={{ color: 'var(--text-primary)' }}
                                              >
                                                  {t('badge.tabAggregate')}
                                              </p>
                                              <p
                                                  className="text-[9px] mt-0.5"
                                                  style={{ color: 'var(--text-secondary)' }}
                                              >
                                                  {t('badge.tabAggregateHint')}
                                              </p>
                                          </div>
                                          <button
                                              onClick={() =>
                                                  updateTab(settingsTabId, {
                                                      badgeAggregate: {
                                                          ...settingsTab.badgeAggregate,
                                                          enabled: !(settingsTab.badgeAggregate?.enabled ?? false),
                                                      },
                                                  })
                                              }
                                              className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                              style={{
                                                  background: settingsTab.badgeAggregate?.enabled
                                                      ? 'var(--accent)'
                                                      : 'var(--app-border)',
                                              }}
                                          >
                                              <span
                                                  className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                                  style={{ left: settingsTab.badgeAggregate?.enabled ? '18px' : '2px' }}
                                              />
                                          </button>
                                      </div>
                                  </div>
                              )}
                          </div>

                          {/* ── Export tab ──────────────────────────────────────────────── */}
                          <div className="border-t pt-2" style={{ borderColor: 'var(--app-border)' }}>
                              <button
                                  onClick={() => setShowTabExport(true)}
                                  className="flex items-center gap-1.5 w-full px-2.5 py-2 rounded-lg text-xs hover:opacity-80 transition-opacity"
                                  style={{
                                      background: 'var(--app-bg)',
                                      border: '1px solid var(--app-border)',
                                      color: 'var(--text-secondary)',
                                  }}
                              >
                                  <Download size={11} />
                                  {t('tabBar.exportTab')}
                              </button>
                          </div>
                      </div>
                      {showTabExport && (
                          <ExportAnonymizeDialog
                              onExport={(anon) => exportTab(settingsTab, anon)}
                              onClose={() => setShowTabExport(false)}
                          />
                      )}
                  </>,
                  document.body,
              )
            : null;

    const iconPickerModal = iconPickerTabId ? (
        <IconPickerModal
            current={tabs.find((t) => t.id === iconPickerTabId)?.icon ?? ''}
            onSelect={(name) => {
                updateTab(iconPickerTabId, { icon: name || undefined });
                setIconPickerTabId(null);
            }}
            onClose={() => setIconPickerTabId(null)}
        />
    ) : null;

    // ── Render ───────────────────────────────────────────────────────────────────

    const tabsAlignment = isMobile ? 'left' : (tbSettings?.tabsAlignment ?? 'left');
    const needsGrid = hasExtras || tabsAlignment !== 'left';

    const addTabBtn = !readonly && editMode && (
        <>
            <button
                onClick={() => addTab(`Tab ${tabs.length + 1}`)}
                className="px-3 py-2.5 text-sm transition-colors whitespace-nowrap hover:opacity-80"
                style={{ color: 'var(--text-secondary)' }}
            >
                {t('tabBar.addTab')}
            </button>
            <label
                className="flex items-center justify-center w-7 h-7 rounded cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                style={{ color: 'var(--text-secondary)' }}
                title={t('tabBar.importTab')}
            >
                <Upload size={13} />
                <input ref={importTabRef} type="file" accept=".json" onChange={handleImportTab} className="hidden" />
            </label>
        </>
    );

    if (needsGrid) {
        return (
            <>
                <div
                    className="aura-tabs shrink-0"
                    style={{
                        ...containerStyle,
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
                        alignItems: 'stretch',
                    }}
                >
                    {/* Zone 1: left items + tabs when alignment=left */}
                    <TabScrollRow
                        isMobile={isMobile}
                        outerClassName="min-w-0"
                        scrollClassName="flex items-center w-full"
                    >
                        <div className="flex items-center gap-1 px-2">
                            {headerSlot}
                            {leftItems.map(renderTabBarItem)}
                            {tabsAlignment === 'left' && leftItems.length > 0 && (
                                <div
                                    className="w-px self-stretch mx-1 shrink-0"
                                    style={{ background: 'var(--app-border)' }}
                                />
                            )}
                            {tabsAlignment === 'left' && renderTabs()}
                            {tabsAlignment === 'left' && addTabBtn}
                        </div>
                    </TabScrollRow>

                    {/* Zone 2: center items + tabs when alignment=center */}
                    <TabScrollRow isMobile={isMobile} scrollClassName="flex items-center justify-center w-full">
                        <div className="flex items-center gap-1 px-2">
                            {tabsAlignment === 'center' && renderTabs()}
                            {tabsAlignment === 'center' && addTabBtn}
                            {tabsAlignment === 'center' && centerItems.length > 0 && (
                                <div
                                    className="w-px self-stretch mx-2 shrink-0"
                                    style={{ background: 'var(--app-border)' }}
                                />
                            )}
                            {centerItems.map(renderTabBarItem)}
                        </div>
                    </TabScrollRow>

                    {/* Zone 3: right items + tabs when alignment=right */}
                    <TabScrollRow
                        isMobile={isMobile}
                        outerClassName="min-w-0"
                        scrollClassName="flex items-center justify-end w-full"
                    >
                        <div className="flex items-center gap-1 px-2">
                            {tabsAlignment === 'right' && renderTabs()}
                            {tabsAlignment === 'right' && addTabBtn}
                            {tabsAlignment === 'right' && rightItems.length > 0 && (
                                <div
                                    className="w-px self-stretch mx-2 shrink-0"
                                    style={{ background: 'var(--app-border)' }}
                                />
                            )}
                            {rightItems.map(renderTabBarItem)}
                        </div>
                    </TabScrollRow>
                </div>
                {settingsPanel}
                {iconPickerModal}
            </>
        );
    }

    // Simple layout: alignment=left, no center/right items
    return (
        <>
            <div className="aura-tabs shrink-0 flex" style={containerStyle}>
                <TabScrollRow
                    isMobile={isMobile}
                    outerClassName="flex-1 min-w-0"
                    scrollClassName="flex items-center w-full"
                >
                    <div className="flex items-center gap-1 px-4">
                        {headerSlot}
                        {leftItems.map(renderTabBarItem)}
                        {leftItems.length > 0 && (
                            <div
                                className="w-px self-stretch mx-1 shrink-0"
                                style={{ background: 'var(--app-border)' }}
                            />
                        )}
                        {renderTabs()}
                        {addTabBtn}
                    </div>
                </TabScrollRow>
            </div>
            {settingsPanel}
            {iconPickerModal}
        </>
    );
}
