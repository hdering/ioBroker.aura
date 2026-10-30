import { useState, useMemo, useRef, useEffect, memo, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { shallow } from 'zustand/shallow';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import {
    Plus,
    Trash2,
    Edit3,
    Check,
    Smartphone,
    Columns2,
    Columns3,
    Columns4,
    GripVertical,
    Upload,
    Settings,
    X,
    Ruler,
    Lock,
    LockOpen,
    ChevronDown,
    ChevronRight,
    Download,
    Eye,
    EyeOff,
    ExternalLink,
    FolderInput,
    Copy,
    ShieldOff,
} from 'lucide-react';
import { ImportWidgetDialog } from '../../components/config/ImportWidgetDialog';
import { ManualWidgetDialog } from '../../components/config/ManualWidgetDialog';
import { getWidgetIcon } from '../../utils/widgetIconMap';
import { flowOrderField, sortForFlow, tabletBandActive, type FlowMode } from '../../utils/flowOrder';
import { FlowSettingsLink, TabletOrderPanel } from './editor/TabletOrderPanel';
import { IconPickerModal } from '../../components/config/IconPickerModal';
import { useDashboardStore, useActiveSection } from '../../store/dashboardStore';
import { BackgroundImageButton } from '../../components/config/BackgroundImageField';
import { BackgroundImageLayer, BG_IMAGE_HOST_STYLE } from '../../components/common/BackgroundImageLayer';
import { tabBgImage } from '../../utils/backgroundImage';
import { KEEP_PIN, LINK_PIN, pinSourceOptions, sectionPinKey } from '../../utils/pinLock';
import { useMcpReleaseStore } from '../../store/mcpReleaseStore';
import { vaultSetMcp, vaultRemove } from '../../utils/pinApi';
import { adminToken } from '../../store/authStore';
import { ConditionEditor } from '../../components/config/ConditionEditor';
import { BadgeAggregateFields, BadgeEditor } from '../../components/config/BadgeEditor';
import { usePortalTarget } from '../../contexts/PortalTargetContext';
import { Dashboard } from '../../components/layout/Dashboard';
import { LayoutDrawer } from '../../components/layout/LayoutDrawer';
import { FocusedWidgetContext } from '../../contexts/FocusedWidgetContext';
import { useConfigStore } from '../../store/configStore';
import { useCustomJs } from '../../hooks/useCustomJs';
import { useCustomCss } from '../../hooks/useCustomCss';
import { useEffectiveSettings } from '../../hooks/useEffectiveSettings';
import { useT } from '../../i18n';
import { useAdminPrefsStore } from '../../store/adminPrefsStore';
import { slugify } from '../../utils/slugify';
import { exportTab } from '../../utils/widgetExportImport';
import { ExportAnonymizeDialog } from '../../components/config/ExportAnonymizeDialog';
import { AuraIcon } from '../../components/common/AuraIcon';
import { ResizablePopover, usePanelWidth } from '../../components/common/ResizablePopover';

// TYPE_LABELS are now resolved via useT() inside components

/**
 * Arrange the active tab's widgets for one of the narrow-screen flows: the phone's
 * single column (`mobileOrder`) or the tablet's column flow (`tabletOrder`, #413).
 * Same panel, same sort rule as the Dashboard (utils/flowOrder) — the tablet list
 * therefore starts out in the mobile order until the user moves something.
 */
function OrderPanel({ layoutId, mode }: { layoutId: string; mode: FlowMode }) {
    const t = useT();
    const field = flowOrderField(mode);
    const { layouts, updateWidgetInTab } = useDashboardStore();
    const activeTabId = useDashboardStore((s) => {
        const l = s.layouts.find((x) => x.id === layoutId) ?? s.layouts[0];
        const sec = l?.sections.find((x) => x.id === l.activeSectionId) ?? l?.sections[0];
        return sec?.activeTabId ?? '';
    });
    const tab = (() => {
        const l = layouts.find((x) => x.id === layoutId);
        const sec = l?.sections.find((x) => x.id === l.activeSectionId) ?? l?.sections[0];
        return sec?.tabs.find((t) => t.id === activeTabId);
    })();

    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [overIdx, setOverIdx] = useState<number | null>(null);

    const sorted = useMemo(() => sortForFlow(tab?.widgets ?? [], mode), [tab?.widgets, mode]);

    const applyOrder = (reordered: typeof sorted) => {
        if (!tab) return;
        reordered.forEach((w, i) => {
            if (w[field] !== i) updateWidgetInTab(tab.id, w.id, { ...w, [field]: i });
        });
    };

    const handleDrop = (targetIdx: number) => {
        if (dragIdx === null || dragIdx === targetIdx) {
            setDragIdx(null);
            setOverIdx(null);
            return;
        }
        const reordered = [...sorted];
        const [moved] = reordered.splice(dragIdx, 1);
        reordered.splice(targetIdx, 0, moved);
        applyOrder(reordered);
        setDragIdx(null);
        setOverIdx(null);
    };

    const moveItem = (from: number, to: number) => {
        if (to < 0 || to >= sorted.length) return;
        const reordered = [...sorted];
        const [moved] = reordered.splice(from, 1);
        reordered.splice(to, 0, moved);
        applyOrder(reordered);
    };

    return (
        <div
            data-aura-order-list={mode}
            className="flex flex-col h-full overflow-hidden"
            style={{ borderLeft: '1px solid var(--app-border)', background: 'var(--app-surface)', width: 260 }}
        >
            <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--app-border)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t(mode === 'tablet' ? 'editor.tablet.title' : 'editor.mobile.title')}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {t(mode === 'tablet' ? 'editor.tablet.hint' : 'editor.mobile.hint')}
                </p>
                <FlowSettingsLink layoutId={layoutId} />
            </div>

            <div className="aura-scroll flex-1 overflow-y-auto p-3 space-y-1">
                {sorted.length === 0 ? (
                    <p className="text-xs text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                        {t('editor.tab.noWidgets')}
                    </p>
                ) : (
                    sorted.map((w, i) => {
                        const isDragging = dragIdx === i;
                        const isOver = overIdx === i;
                        return (
                            <div
                                key={w.id}
                                draggable
                                onDragStart={() => setDragIdx(i)}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setOverIdx(i);
                                }}
                                onDragLeave={() => setOverIdx(null)}
                                onDrop={() => handleDrop(i)}
                                onDragEnd={() => {
                                    setDragIdx(null);
                                    setOverIdx(null);
                                }}
                                className="flex items-center gap-2 px-2.5 py-2 rounded-lg select-none"
                                style={{
                                    background: isDragging
                                        ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                                        : isOver
                                          ? 'color-mix(in srgb, var(--accent) 6%, var(--app-bg))'
                                          : 'var(--app-bg)',
                                    border: `1px solid ${isOver ? 'var(--accent)' : 'var(--app-border)'}`,
                                    opacity: isDragging ? 0.5 : 1,
                                    cursor: 'grab',
                                }}
                            >
                                <GripVertical size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                                <span
                                    className="text-[11px] font-mono w-4 shrink-0 text-center"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {i + 1}
                                </span>
                                <span className="flex-1 text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                                    {w.title || t(`widget.${w.type}` as never) || w.type}
                                </span>
                                <div className="flex flex-col gap-0.5 shrink-0">
                                    <button
                                        onClick={() => moveItem(i, i - 1)}
                                        disabled={i === 0}
                                        className="w-5 h-3.5 flex items-center justify-center rounded text-[9px] hover:opacity-80 disabled:opacity-20"
                                        style={{
                                            background: 'var(--app-surface)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--app-border)',
                                        }}
                                    >
                                        ▲
                                    </button>
                                    <button
                                        onClick={() => moveItem(i, i + 1)}
                                        disabled={i === sorted.length - 1}
                                        className="w-5 h-3.5 flex items-center justify-center rounded text-[9px] hover:opacity-80 disabled:opacity-20"
                                        style={{
                                            background: 'var(--app-surface)',
                                            color: 'var(--text-secondary)',
                                            border: '1px solid var(--app-border)',
                                        }}
                                    >
                                        ▼
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

// ── SectionSwitcher ─────────────────────────────────────────────────────────────
// Switch between the sections ("Bereiche") of the active layout while editing, and
// add new ones inline. Full section management (rename, icon, delete, reorder) lives
// on the Layouts admin page.
const SectionSwitcher = memo(function SectionSwitcher() {
    const t = useT();
    // Portal into the admin container, not document.body: only there does the
    // popover inherit the admin theme's CSS variables. Rendered to the body it
    // picks up the frontend theme and shows up dark inside a light admin.
    const portalTarget = usePortalTarget();
    const sections = useStoreWithEqualityFn(
        useDashboardStore,
        (s) => {
            const l = s.layouts.find((x) => x.id === s.activeLayoutId) ?? s.layouts[0];
            return l.sections.map((sec) => ({ id: sec.id, name: sec.name }));
        },
        (a, b) => a.length === b.length && a.every((x, i) => x.id === b[i].id && x.name === b[i].name),
    );
    const activeSectionId = useDashboardStore((s) => {
        const l = s.layouts.find((x) => x.id === s.activeLayoutId) ?? s.layouts[0];
        return l.activeSectionId;
    });
    const layoutId = useDashboardStore((s) => (s.layouts.find((x) => x.id === s.activeLayoutId) ?? s.layouts[0]).id);
    const setActiveSection = useDashboardStore((s) => s.setActiveSection);
    const addSection = useDashboardStore((s) => s.addSection);
    const updateSection = useDashboardStore((s) => s.updateSection);
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [settingsSectionId, setSettingsSectionId] = useState<string | null>(null);
    const [badgesOpen, setBadgesOpen] = useState(false);
    const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
    const gearRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    // Marker clause rows need room — 340px squeezed the datapoint field to nothing (#850).
    const sectionPanel = usePanelWidth('admin-section', badgesOpen ? 600 : 340);
    const sectionPanelLeft = panelPos
        ? Math.max(8, Math.min(panelPos.left, window.innerWidth - sectionPanel.width - 12))
        : 0;

    // Full data for the section whose settings popover is open (badges/aggregate).
    const openSection = useDashboardStore((s) => {
        if (!settingsSectionId) return null;
        const l = s.layouts.find((x) => x.id === s.activeLayoutId) ?? s.layouts[0];
        return l.sections.find((sec) => sec.id === settingsSectionId) ?? null;
    });
    // Protected server-side — see tabPinStored below for why the stub marker counts.
    const sectionPinStored = openSection?.pin === KEEP_PIN || openSection?.pinProtected === true;
    const sectionHasPin = !!openSection?.pin || sectionPinStored;

    const create = () => {
        if (newName.trim()) addSection(newName.trim());
        setNewName('');
        setAdding(false);
    };

    const openSettings = (id: string) => {
        const btn = gearRefs.current.get(id);
        if (!btn) return;
        setBadgesOpen(false);
        const rect = btn.getBoundingClientRect();
        const panelW = 340;
        setPanelPos({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - panelW - 12)) });
        setSettingsSectionId((prev) => (prev === id ? null : id));
    };

    return (
        <div
            className="flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto"
            style={{ background: 'var(--app-bg)', borderBottom: '1px solid var(--app-border)' }}
        >
            <a
                href={`#/admin/layouts?ctx=${layoutId}`}
                title={t('sections.manage')}
                className="text-[10px] font-semibold shrink-0 mr-1 inline-flex items-center gap-0.5 hover:underline"
                style={{ color: 'var(--text-secondary)' }}
            >
                {t('sections.title')}:
                <ExternalLink size={9} />
            </a>
            {sections.map((sec) => {
                const isActive = sec.id === activeSectionId;
                return (
                    <div
                        key={sec.id}
                        className="shrink-0 flex items-center gap-0.5 rounded-full pl-2.5 pr-1 py-0.5 transition-colors"
                        style={{
                            background: isActive ? 'var(--accent)' : 'var(--app-surface)',
                            border: `1px solid ${isActive ? 'var(--accent)' : 'var(--app-border)'}`,
                        }}
                    >
                        <button
                            onClick={() => setActiveSection(sec.id)}
                            className="text-xs font-medium"
                            style={{ color: isActive ? '#fff' : 'var(--text-secondary)' }}
                        >
                            {sec.name}
                        </button>
                        <button
                            ref={(el) => {
                                if (el) gearRefs.current.set(sec.id, el);
                                else gearRefs.current.delete(sec.id);
                            }}
                            onClick={() => openSettings(sec.id)}
                            title={t('tabBar.badges')}
                            className="p-0.5 rounded-full hover:opacity-70 flex items-center shrink-0"
                            style={{
                                color: isActive
                                    ? '#fff'
                                    : settingsSectionId === sec.id
                                      ? 'var(--accent)'
                                      : 'var(--text-secondary)',
                            }}
                        >
                            <Settings size={11} />
                        </button>
                    </div>
                );
            })}
            {adding ? (
                <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') create();
                        if (e.key === 'Escape') {
                            setNewName('');
                            setAdding(false);
                        }
                    }}
                    onBlur={create}
                    placeholder={t('sections.placeholder')}
                    className="shrink-0 text-xs rounded-full px-2.5 py-1 focus:outline-none w-40"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--accent)',
                    }}
                />
            ) : (
                <button
                    onClick={() => setAdding(true)}
                    className="shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-full hover:opacity-80"
                    style={{
                        background: 'var(--app-surface)',
                        color: 'var(--text-secondary)',
                        border: '1px dashed var(--app-border)',
                    }}
                    title={t('sections.newSection')}
                >
                    <Plus size={12} /> {t('sections.newSection')}
                </button>
            )}

            {settingsSectionId &&
                openSection &&
                panelPos &&
                createPortal(
                    <>
                        <div className="fixed inset-0 z-[998]" onClick={() => setSettingsSectionId(null)} />
                        <ResizablePopover
                            className="p-3"
                            width={sectionPanel.width}
                            onResize={sectionPanel.setWidth}
                            onReset={sectionPanel.resetWidth}
                            pinnedRight={sectionPanelLeft < panelPos.left}
                            style={{
                                top: panelPos.top,
                                left: sectionPanelLeft,
                                maxHeight: `calc(100vh - ${panelPos.top + 12}px)`,
                                background: 'var(--app-surface)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            <p className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                {t('pin.field')}
                            </p>
                            <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder={
                                    openSection.pinFrom
                                        ? t('pin.linkedPlaceholder')
                                        : sectionPinStored
                                          ? t('pin.setPlaceholder')
                                          : t('pin.placeholder')
                                }
                                value={isPinSentinel(openSection.pin) ? '' : (openSection.pin ?? '')}
                                onChange={(e) =>
                                    updateSection(openSection.id, {
                                        pin: e.target.value || undefined,
                                        pinFrom: undefined,
                                    })
                                }
                                className="aura-pin-input w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--app-border)',
                                }}
                            />
                            <PinLinkSelect
                                selfKey={sectionPinKey(openSection.id)}
                                node={openSection}
                                onChange={(patch) => updateSection(openSection.id, patch)}
                            />
                            {sectionPinStored && !openSection.pinFrom && (
                                <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('pin.protectedHint')}
                                </p>
                            )}
                            {sectionHasPin ? (
                                <div className="flex items-center justify-between mt-2">
                                    <div>
                                        <p className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                                            {t('pin.keepUnlocked')}
                                        </p>
                                        <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                            {t('pin.keepUnlockedHint')}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() =>
                                            updateSection(openSection.id, {
                                                pinRelock: openSection.pinRelock === 'session' ? undefined : 'session',
                                            })
                                        }
                                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                        style={{
                                            background:
                                                openSection.pinRelock === 'session'
                                                    ? 'var(--accent)'
                                                    : 'var(--app-border)',
                                        }}
                                    >
                                        <span
                                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                            style={{ left: openSection.pinRelock === 'session' ? '18px' : '2px' }}
                                        />
                                    </button>
                                </div>
                            ) : (
                                <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('pin.hint')}
                                </p>
                            )}
                            {sectionHasPin && (
                                <PinSwitch
                                    className="aura-pin-showlock"
                                    label={t('pin.showLock')}
                                    hint={t('pin.showLockHint')}
                                    on={openSection.pinHideLock !== true}
                                    onToggle={() =>
                                        updateSection(openSection.id, {
                                            pinHideLock: openSection.pinHideLock ? undefined : true,
                                        })
                                    }
                                />
                            )}
                            {sectionHasPin && <McpReleaseToggle vaultKey={`section:${openSection.id}`} />}
                            {sectionHasPin && (
                                <PinRemoveButton
                                    vaultKey={`section:${openSection.id}`}
                                    stored={sectionPinStored}
                                    onRemove={() =>
                                        updateSection(openSection.id, {
                                            pin: undefined,
                                            pinRelock: undefined,
                                            pinHideLock: undefined,
                                            pinProtected: undefined,
                                            pinLength: undefined,
                                            pinFrom: undefined,
                                        })
                                    }
                                />
                            )}

                            <div className="mt-3">
                                <label className="text-[11px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('bgImage.label')}
                                </label>
                                <BackgroundImageButton
                                    value={openSection.backgroundImage}
                                    onChange={(v) => updateSection(openSection.id, { backgroundImage: v })}
                                    title={t('bgImage.sectionTitle')}
                                    inheritLabel={t('bgImage.inheritLayout')}
                                />
                            </div>

                            {/* ── Badges section (collapsed, like the tab panel) ──────────── */}
                            <div
                                className="rounded-lg px-2.5 py-2 mt-3"
                                style={{
                                    background: 'color-mix(in srgb, #6366f1 7%, var(--app-bg))',
                                    border: '1px solid color-mix(in srgb, #6366f1 26%, var(--app-border))',
                                }}
                            >
                                <button
                                    className="flex items-center gap-1.5 w-full text-left hover:opacity-80"
                                    onClick={() => setBadgesOpen((o) => !o)}
                                >
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                        {badgesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                    </span>
                                    <span
                                        className="text-[11px] font-medium"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        {t('tabBar.badges')}
                                        {(openSection.badges?.length ?? 0) > 0 && (
                                            <span
                                                className="ml-1.5 px-1 rounded-full text-[9px]"
                                                style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
                                            >
                                                {openSection.badges!.length}
                                            </span>
                                        )}
                                    </span>
                                </button>

                                {badgesOpen && (
                                    <div className="mt-2 space-y-2">
                                        <BadgeEditor
                                            badges={openSection.badges ?? []}
                                            onChange={(next) => updateSection(openSection.id, { badges: next })}
                                            style={{ width: '100%', padding: 0 }}
                                        />
                                        <BadgeAggregateFields
                                            value={openSection.badgeAggregate}
                                            onChange={(next) => updateSection(openSection.id, { badgeAggregate: next })}
                                            labelKey="badge.sectionAggregate"
                                            hintKey="badge.sectionAggregateHint"
                                        />
                                    </div>
                                )}
                            </div>
                        </ResizablePopover>
                    </>,
                    portalTarget,
                )}
        </div>
    );
});

// ── TabBar ─────────────────────────────────────────────────────────────────────
// Isolated component so AdminEditor does NOT re-render on tab switch.
// Key insight: patchLayout does { ...l, activeTabId: id } which preserves the
// l.tabs array reference — so the `tabs` selector returns the same reference and
// does not trigger a re-render. Only `activeTabId` changes on each switch.
const TabBar = memo(function TabBar() {
    const t = useT();
    const portalTarget = usePortalTarget();

    const tabs = useDashboardStore((s) => {
        const l = s.layouts.find((x) => x.id === s.activeLayoutId) ?? s.layouts[0];
        const sec = l.sections.find((x) => x.id === l.activeSectionId) ?? l.sections[0];
        return sec.tabs;
    });
    const activeTabId = useDashboardStore((s) => {
        const l = s.layouts.find((x) => x.id === s.activeLayoutId) ?? s.layouts[0];
        const sec = l.sections.find((x) => x.id === l.activeSectionId) ?? l.sections[0];
        return sec.activeTabId;
    });
    const { addTab, setActiveTab, renameTab, removeTab, setTabSlug, updateTab, reorderTabs, moveTabToSection } =
        useStoreWithEqualityFn(
            useDashboardStore,
            (s) => ({
                addTab: s.addTab,
                setActiveTab: s.setActiveTab,
                renameTab: s.renameTab,
                removeTab: s.removeTab,
                setTabSlug: s.setTabSlug,
                updateTab: s.updateTab,
                reorderTabs: s.reorderTabs,
                moveTabToSection: s.moveTabToSection,
            }),
            shallow,
        );

    // Current layout/section of the edited tabs — used to flag the tab's own section
    // in the move/copy target list and to build a fully-qualified label per section.
    const currentLayoutId = useDashboardStore(
        (s) => (s.layouts.find((x) => x.id === s.activeLayoutId) ?? s.layouts[0]).id,
    );
    const currentSectionId = useDashboardStore((s) => {
        const l = s.layouts.find((x) => x.id === s.activeLayoutId) ?? s.layouts[0];
        return (l.sections.find((x) => x.id === l.activeSectionId) ?? l.sections[0]).id;
    });
    const multiLayout = useDashboardStore((s) => s.layouts.length > 1);
    const sectionTargets = useStoreWithEqualityFn(
        useDashboardStore,
        (s) =>
            s.layouts.flatMap((l) =>
                l.sections.map((sec) => ({
                    layoutId: l.id,
                    layoutName: l.name,
                    sectionId: sec.id,
                    sectionName: sec.name,
                })),
            ),
        (a, b) =>
            a.length === b.length &&
            a.every(
                (x, i) =>
                    x.layoutId === b[i].layoutId &&
                    x.sectionId === b[i].sectionId &&
                    x.layoutName === b[i].layoutName &&
                    x.sectionName === b[i].sectionName,
            ),
    );

    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renamingValue, setRenamingValue] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [settingsTabId, setSettingsTabId] = useState<string | null>(null);
    const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const [conditionsOpen, setConditionsOpen] = useState(false);
    const [tabBadgesOpen, setTabBadgesOpen] = useState(false);
    const [iconPickerTabId, setIconPickerTabId] = useState<string | null>(null);
    const [showTabExport, setShowTabExport] = useState(false);
    // Encodes the chosen move/copy target as `${layoutId}::${sectionId}` ('' = none).
    const [moveTarget, setMoveTarget] = useState('');
    const settingsBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const [tabDragIdx, setTabDragIdx] = useState<number | null>(null);
    const [tabDragOverIdx, setTabDragOverIdx] = useState<number | null>(null);

    const commitRenameWithSlug = (tabId: string, newName: string) => {
        const tab = tabs.find((t) => t.id === tabId);
        if (tab) {
            const currentSlug = tab.slug ?? tab.id;
            if (currentSlug === slugify(tab.name)) {
                updateTab(tabId, { name: newName, slug: slugify(newName) });
            } else {
                renameTab(tabId, newName);
            }
        }
        setRenamingId(null);
    };

    const openTabSettings = (tabId: string) => {
        const btn = settingsBtnRefs.current.get(tabId);
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        const panelW = 256;
        const left = Math.min(rect.left, window.innerWidth - panelW - 12);
        setPanelPos({ top: rect.bottom + 6, left: Math.max(8, left) });
        setSettingsTabId((prev) => {
            if (prev !== tabId) {
                setConditionsOpen(false);
                setTabBadgesOpen(false);
                setMoveTarget('');
            }
            return prev === tabId ? null : tabId;
        });
    };

    const settingsTab = tabs.find((t) => t.id === settingsTabId);
    /** Vault key of the tab whose settings panel is open (see lib/security/dashboardVault). */
    const tabVaultKey = `tab:${currentSectionId}:${settingsTabId ?? ''}`;
    /**
     * Protected server-side. KEEP_PIN means the editor pulled this view's content
     * out of the vault; `pinProtected` is the redacted stub the adapter serves —
     * which is what the panel sees right after a save, before (or without) that
     * pull. Both count, so the PIN settings never vanish just because the vault
     * read is late or failed.
     */
    const tabPinStored = settingsTab?.pin === KEEP_PIN || settingsTab?.pinProtected === true;
    const tabHasPin = !!settingsTab?.pin || tabPinStored;

    const currentTargetKey = `${currentLayoutId}::${currentSectionId}`;
    const runTabMove = (mode: 'move' | 'copy') => {
        if (!settingsTabId || !moveTarget) return;
        if (mode === 'move' && moveTarget === currentTargetKey) return;
        const [layoutId, sectionId] = moveTarget.split('::');
        moveTabToSection(settingsTabId, currentLayoutId, currentSectionId, layoutId, sectionId, mode);
        setSettingsTabId(null);
    };
    // Group the flat target list by layout so the dropdown can use <optgroup>.
    const targetsByLayout = sectionTargets.reduce<
        { layoutId: string; layoutName: string; sections: { sectionId: string; sectionName: string }[] }[]
    >((acc, tgt) => {
        let grp = acc.find((g) => g.layoutId === tgt.layoutId);
        if (!grp) {
            grp = { layoutId: tgt.layoutId, layoutName: tgt.layoutName, sections: [] };
            acc.push(grp);
        }
        grp.sections.push({ sectionId: tgt.sectionId, sectionName: tgt.sectionName });
        return acc;
    }, []);

    // Re-clamp left against the panel's *current* width so expanding the conditions
    // (256 → 600px, or whatever the user dragged it to) on a far-right tab cannot push
    // the rules off the right edge.
    const tabPanel = usePanelWidth('admin-tab', conditionsOpen || tabBadgesOpen ? 600 : 256);
    const panelWidth = tabPanel.width;
    const panelLeft = Math.max(
        8,
        Math.min(
            panelPos.left,
            (typeof window !== 'undefined' ? window.innerWidth : panelPos.left + panelWidth) - panelWidth - 12,
        ),
    );

    return (
        <>
            <div
                className="flex items-center gap-2 px-6 py-2 shrink-0 flex-wrap"
                style={{ background: 'var(--app-bg)', borderBottom: '1px solid var(--app-border)' }}
            >
                {tabs.map((tab, idx) => {
                    const isActive = tab.id === activeTabId;
                    const isDragTarget = tabDragOverIdx === idx && tabDragIdx !== null && tabDragIdx !== idx;
                    return (
                        <div
                            key={tab.id}
                            className="flex items-center gap-1"
                            style={isDragTarget ? { boxShadow: '-2px 0 0 0 var(--accent)' } : undefined}
                            onDragOver={(e) => {
                                e.preventDefault();
                                setTabDragOverIdx(idx);
                            }}
                            onDragEnter={(e) => {
                                e.preventDefault();
                                setTabDragOverIdx(idx);
                            }}
                            onDragLeave={() => setTabDragOverIdx(null)}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (tabDragIdx !== null && tabDragIdx !== idx) reorderTabs(tabDragIdx, idx);
                                setTabDragIdx(null);
                                setTabDragOverIdx(null);
                            }}
                        >
                            {renamingId === tab.id ? (
                                <div className="flex items-center gap-1">
                                    <input
                                        autoFocus
                                        value={renamingValue}
                                        onChange={(e) => setRenamingValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') commitRenameWithSlug(tab.id, renamingValue);
                                            if (e.key === 'Escape') setRenamingId(null);
                                        }}
                                        className="text-xs rounded px-2 py-1 w-28 focus:outline-none"
                                        style={{
                                            background: 'var(--app-surface)',
                                            color: 'var(--text-primary)',
                                            border: '1px solid var(--accent)',
                                        }}
                                    />
                                    <button
                                        onClick={() => commitRenameWithSlug(tab.id, renamingValue)}
                                        className="p-1 rounded hover:opacity-70"
                                        style={{ color: 'var(--accent-green)' }}
                                    >
                                        <Check size={13} />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-0.5">
                                    <div
                                        className="aura-tab-manage-row flex items-center gap-1 rounded-lg px-2 py-1"
                                        style={{
                                            background: isActive ? 'var(--accent)22' : 'var(--app-surface)',
                                            border: `1px solid ${isActive ? 'var(--accent)' : 'var(--app-border)'}`,
                                            opacity: tabDragIdx === idx ? 0.4 : tab.disabled ? 0.45 : 1,
                                        }}
                                    >
                                        <span
                                            draggable
                                            onDragStart={(e) => {
                                                e.stopPropagation();
                                                setTabDragIdx(idx);
                                                e.dataTransfer.effectAllowed = 'move';
                                                e.dataTransfer.setData('text/plain', String(idx));
                                            }}
                                            onDragEnd={() => {
                                                setTabDragIdx(null);
                                                setTabDragOverIdx(null);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                cursor: 'grab',
                                                color: 'var(--text-secondary)',
                                                display: 'flex',
                                                alignItems: 'center',
                                            }}
                                        >
                                            <GripVertical size={11} />
                                        </span>
                                        {tab.icon &&
                                            (() => {
                                                const TabIcon = getWidgetIcon(tab.icon, null as never);
                                                return (
                                                    <TabIcon
                                                        size={11}
                                                        style={{
                                                            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                );
                                            })()}
                                        <button
                                            onClick={() => setActiveTab(tab.id)}
                                            className="text-xs font-medium"
                                            style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
                                        >
                                            {tab.name}
                                        </button>
                                        {tab.hidden && !tab.disabled && (
                                            <span
                                                title={t('editor.tabMgmt.hidden')}
                                                style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
                                            >
                                                <EyeOff
                                                    size={11}
                                                    style={{ color: 'var(--text-secondary)', opacity: 0.7 }}
                                                />
                                            </span>
                                        )}
                                        <button
                                            ref={(el) => {
                                                if (el) settingsBtnRefs.current.set(tab.id, el);
                                                else settingsBtnRefs.current.delete(tab.id);
                                            }}
                                            onClick={() => openTabSettings(tab.id)}
                                            className="p-0.5 rounded hover:opacity-70"
                                            style={{
                                                color:
                                                    settingsTabId === tab.id
                                                        ? 'var(--accent)'
                                                        : 'var(--text-secondary)',
                                            }}
                                        >
                                            <Settings size={11} />
                                        </button>
                                        <button
                                            onClick={() => {
                                                setRenamingId(tab.id);
                                                setRenamingValue(tab.name);
                                            }}
                                            className="p-0.5 rounded hover:opacity-70"
                                            style={{ color: 'var(--text-secondary)' }}
                                        >
                                            <Edit3 size={11} />
                                        </button>
                                        {tabs.length > 1 &&
                                            (confirmDeleteId === tab.id ? (
                                                <>
                                                    <button
                                                        onClick={() => setConfirmDeleteId(null)}
                                                        className="p-0.5 rounded hover:opacity-70"
                                                        style={{ color: 'var(--text-secondary)' }}
                                                    >
                                                        <X size={11} />
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            removeTab(tab.id);
                                                            setConfirmDeleteId(null);
                                                        }}
                                                        className="p-0.5 rounded hover:opacity-70"
                                                        style={{ color: 'var(--accent-red)' }}
                                                    >
                                                        <Check size={11} />
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    onClick={() => setConfirmDeleteId(tab.id)}
                                                    className="p-0.5 rounded hover:opacity-70"
                                                    style={{ color: 'var(--accent-red)' }}
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
                <button
                    onClick={() => addTab(`Tab ${tabs.length + 1}`)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs hover:opacity-80"
                    style={{
                        background: 'var(--app-surface)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    <Plus size={12} /> {t('tabBar.addTab')}
                </button>
            </div>

            {settingsTabId &&
                settingsTab &&
                createPortal(
                    <>
                        <div className="fixed inset-0 z-[998]" onClick={() => setSettingsTabId(null)} />
                        <ResizablePopover
                            className="p-3 space-y-3"
                            width={panelWidth}
                            onResize={tabPanel.setWidth}
                            onReset={tabPanel.resetWidth}
                            pinnedRight={panelLeft < panelPos.left}
                            style={{
                                top: panelPos.top,
                                left: panelLeft,
                                maxHeight: `calc(100vh - ${panelPos.top + 12}px)`,
                                background: 'var(--app-surface)',
                                border: '1px solid var(--app-border)',
                                color: 'var(--text-primary)',
                                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                            }}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                    {t('editor.tabMgmt.settings')}
                                </span>
                                <button
                                    onClick={() => setSettingsTabId(null)}
                                    className="w-5 h-5 flex items-center justify-center rounded hover:opacity-70"
                                >
                                    <X size={12} style={{ color: 'var(--text-secondary)' }} />
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-[11px] shrink-0 w-16" style={{ color: 'var(--text-secondary)' }}>
                                    {t('editor.tabMgmt.name')}
                                </label>
                                <input
                                    type="text"
                                    value={settingsTab.name}
                                    onChange={(e) => {
                                        const newName = e.target.value;
                                        const currentSlug = settingsTab.slug ?? settingsTab.id;
                                        if (currentSlug === slugify(settingsTab.name)) {
                                            updateTab(settingsTabId, { name: newName, slug: slugify(newName) });
                                        } else {
                                            updateTab(settingsTabId, { name: newName });
                                        }
                                    }}
                                    className="flex-1 min-w-0 text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-[11px] shrink-0 w-16" style={{ color: 'var(--text-secondary)' }}>
                                    {t('editor.tabMgmt.icon')}
                                </label>
                                <button
                                    onClick={() => setIconPickerTabId(settingsTabId)}
                                    className="flex-1 min-w-0 flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors hover:opacity-80"
                                    style={{
                                        background: 'var(--app-bg)',
                                        border: '1px solid var(--app-border)',
                                        color: 'var(--text-secondary)',
                                    }}
                                >
                                    {settingsTab.icon ? (
                                        <AuraIcon
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
                                        {settingsTab.icon ?? t('editor.tabMgmt.selectIcon')}
                                    </span>
                                </button>
                                {settingsTab.icon && (
                                    <button
                                        onClick={() => updateTab(settingsTabId, { icon: undefined })}
                                        title={t('editor.tabMgmt.remove')}
                                        className="shrink-0 p-1 rounded hover:opacity-70"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-[11px] shrink-0 w-16" style={{ color: 'var(--text-secondary)' }}>
                                    {t('editor.tabMgmt.slug')}
                                </label>
                                <div
                                    className="flex-1 min-w-0 flex items-center gap-1 rounded-lg px-2.5 py-2"
                                    style={{
                                        background: 'var(--app-bg)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    <span
                                        className="text-[11px] font-mono shrink-0"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        /tab/
                                    </span>
                                    <input
                                        type="text"
                                        value={settingsTab.slug ?? settingsTab.id}
                                        onChange={(e) => {
                                            const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
                                            if (val) setTabSlug(settingsTabId, val);
                                        }}
                                        className="flex-1 min-w-0 text-xs font-mono bg-transparent focus:outline-none"
                                        style={{
                                            color: 'var(--text-primary)',
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    {t('editor.tabMgmt.hideLabel')}
                                </label>
                                <button
                                    onClick={() => updateTab(settingsTabId, { hideLabel: !settingsTab.hideLabel })}
                                    className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                    style={{
                                        background: settingsTab.hideLabel ? 'var(--accent)' : 'var(--app-border)',
                                    }}
                                >
                                    <span
                                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                        style={{ left: settingsTab.hideLabel ? '18px' : '2px' }}
                                    />
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    {t('editor.tabMgmt.hidden')}
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
                            <div className="flex items-center justify-between">
                                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    {t('editor.tabMgmt.idleReturnExempt')}
                                </label>
                                <button
                                    onClick={() =>
                                        updateTab(settingsTabId, {
                                            idleReturnExempt: !settingsTab.idleReturnExempt,
                                        })
                                    }
                                    className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                    style={{
                                        background: settingsTab.idleReturnExempt
                                            ? 'var(--accent)'
                                            : 'var(--app-border)',
                                    }}
                                >
                                    <span
                                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                        style={{ left: settingsTab.idleReturnExempt ? '18px' : '2px' }}
                                    />
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                                    {t('editor.tabMgmt.disabled')}
                                </label>
                                <button
                                    onClick={() => {
                                        const nonDisabledCount = tabs.filter((t) => !t.disabled).length;
                                        if (!settingsTab.disabled && nonDisabledCount <= 1) return;
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
                            <div>
                                <label className="text-[11px] block mb-1" style={{ color: 'var(--text-secondary)' }}>
                                    {t('bgImage.label')}
                                </label>
                                <BackgroundImageButton
                                    value={settingsTab.backgroundImage}
                                    onChange={(v) => updateTab(settingsTabId, { backgroundImage: v })}
                                    title={t('bgImage.tabTitle')}
                                    inheritLabel={t('bgImage.inheritSection')}
                                />
                            </div>

                            {/* ── PIN gate ────────────────────────────────────────────────── */}
                            <div className="border-t pt-2" style={{ borderColor: 'var(--app-border)' }}>
                                <label className="text-[11px] block mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    {t('pin.field')}
                                </label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    placeholder={
                                        settingsTab.pinFrom
                                            ? t('pin.linkedPlaceholder')
                                            : tabPinStored
                                              ? t('pin.setPlaceholder')
                                              : t('pin.placeholder')
                                    }
                                    value={isPinSentinel(settingsTab.pin) ? '' : (settingsTab.pin ?? '')}
                                    onChange={(e) =>
                                        updateTab(settingsTabId, {
                                            pin: e.target.value || undefined,
                                            pinFrom: undefined,
                                        })
                                    }
                                    className="aura-pin-input w-full text-xs rounded-lg px-2.5 py-2 focus:outline-none"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                />
                                <PinLinkSelect
                                    selfKey={tabVaultKey}
                                    node={settingsTab}
                                    onChange={(patch) => updateTab(settingsTabId, patch)}
                                />
                                {tabPinStored && !settingsTab.pinFrom && (
                                    <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                                        {t('pin.protectedHint')}
                                    </p>
                                )}
                                {tabHasPin ? (
                                    <div className="flex items-center justify-between mt-2">
                                        <div>
                                            <p
                                                className="text-[11px] font-medium"
                                                style={{ color: 'var(--text-primary)' }}
                                            >
                                                {t('pin.keepUnlocked')}
                                            </p>
                                            <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                                                {t('pin.keepUnlockedHint')}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() =>
                                                updateTab(settingsTabId, {
                                                    pinRelock:
                                                        settingsTab.pinRelock === 'session' ? undefined : 'session',
                                                })
                                            }
                                            className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                                            style={{
                                                background:
                                                    settingsTab.pinRelock === 'session'
                                                        ? 'var(--accent)'
                                                        : 'var(--app-border)',
                                            }}
                                        >
                                            <span
                                                className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                                                style={{ left: settingsTab.pinRelock === 'session' ? '18px' : '2px' }}
                                            />
                                        </button>
                                    </div>
                                ) : (
                                    <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                                        {t('pin.hint')}
                                    </p>
                                )}
                                {tabHasPin && (
                                    <PinSwitch
                                        className="aura-pin-showlock"
                                        label={t('pin.showLock')}
                                        hint={t('pin.showLockHint')}
                                        on={settingsTab.pinHideLock !== true}
                                        onToggle={() =>
                                            updateTab(settingsTabId, {
                                                pinHideLock: settingsTab.pinHideLock ? undefined : true,
                                            })
                                        }
                                    />
                                )}
                                {tabHasPin && <McpReleaseToggle vaultKey={tabVaultKey} />}
                                {tabHasPin && (
                                    <PinRemoveButton
                                        vaultKey={tabVaultKey}
                                        stored={tabPinStored}
                                        onRemove={() =>
                                            updateTab(settingsTabId, {
                                                pin: undefined,
                                                pinRelock: undefined,
                                                pinHideLock: undefined,
                                                pinProtected: undefined,
                                                pinLength: undefined,
                                                pinFrom: undefined,
                                            })
                                        }
                                    />
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

                            {/* ── Move / copy tab to another section ──────────────────────── */}
                            <div className="border-t pt-2 space-y-1.5" style={{ borderColor: 'var(--app-border)' }}>
                                <div
                                    className="flex items-center gap-1.5 text-[11px] font-medium"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <FolderInput size={11} />
                                    {t('tabBar.moveTitle')}
                                </div>
                                <select
                                    value={moveTarget}
                                    onChange={(e) => setMoveTarget(e.target.value)}
                                    className="w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-primary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    <option value="">{t('tabBar.moveTargetPlaceholder')}</option>
                                    {targetsByLayout.map((grp) => {
                                        const opts = grp.sections.map((sec) => {
                                            const key = `${grp.layoutId}::${sec.sectionId}`;
                                            const label =
                                                key === currentTargetKey
                                                    ? `${sec.sectionName} (${t('tabBar.moveCurrentSuffix')})`
                                                    : sec.sectionName;
                                            return (
                                                <option key={key} value={key}>
                                                    {label}
                                                </option>
                                            );
                                        });
                                        return multiLayout ? (
                                            <optgroup key={grp.layoutId} label={grp.layoutName}>
                                                {opts}
                                            </optgroup>
                                        ) : (
                                            <Fragment key={grp.layoutId}>{opts}</Fragment>
                                        );
                                    })}
                                </select>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => runTabMove('move')}
                                        disabled={!moveTarget || moveTarget === currentTargetKey}
                                        className="flex items-center justify-center gap-1.5 flex-1 px-2.5 py-1.5 rounded-lg text-xs hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                                        style={{
                                            background: 'var(--app-bg)',
                                            border: '1px solid var(--app-border)',
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        <FolderInput size={11} />
                                        {t('tabBar.move')}
                                    </button>
                                    <button
                                        onClick={() => runTabMove('copy')}
                                        disabled={!moveTarget}
                                        className="flex items-center justify-center gap-1.5 flex-1 px-2.5 py-1.5 rounded-lg text-xs hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                                        style={{
                                            background: 'var(--app-bg)',
                                            border: '1px solid var(--app-border)',
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        <Copy size={11} />
                                        {t('tabBar.copy')}
                                    </button>
                                </div>
                            </div>

                            {/* ── Conditions section (highlighted, like widget Darstellung) ── */}
                            <div
                                className="rounded-lg px-2.5 py-2"
                                style={{
                                    background: 'color-mix(in srgb, var(--accent-yellow, #eab308) 7%, var(--app-bg))',
                                    border: '1px solid color-mix(in srgb, var(--accent-yellow, #eab308) 26%, var(--app-border))',
                                }}
                            >
                                <button
                                    className="flex items-center gap-1.5 w-full text-left hover:opacity-80"
                                    onClick={() => setConditionsOpen((o) => !o)}
                                >
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                        {conditionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                    </span>
                                    <span
                                        className="text-[11px] font-medium"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
                                        {t('editor.tabMgmt.conditions')}
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
                            <div
                                className="rounded-lg px-2.5 py-2"
                                style={{
                                    background: 'color-mix(in srgb, #6366f1 7%, var(--app-bg))',
                                    border: '1px solid color-mix(in srgb, #6366f1 26%, var(--app-border))',
                                }}
                            >
                                <button
                                    className="flex items-center gap-1.5 w-full text-left hover:opacity-80"
                                    onClick={() => setTabBadgesOpen((o) => !o)}
                                >
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                        {tabBadgesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                    </span>
                                    <span
                                        className="text-[11px] font-medium"
                                        style={{ color: 'var(--text-secondary)' }}
                                    >
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

                                {tabBadgesOpen && (
                                    <div className="mt-2 space-y-2">
                                        <BadgeEditor
                                            badges={settingsTab.badges ?? []}
                                            onChange={(next) => updateTab(settingsTabId, { badges: next })}
                                            style={{ width: '100%', padding: 0 }}
                                        />
                                        <BadgeAggregateFields
                                            value={settingsTab.badgeAggregate}
                                            onChange={(next) => updateTab(settingsTabId, { badgeAggregate: next })}
                                            labelKey="badge.tabAggregate"
                                            hintKey="badge.tabAggregateHint"
                                        />
                                    </div>
                                )}
                            </div>
                        </ResizablePopover>
                    </>,
                    portalTarget,
                )}
            {showTabExport && settingsTab && (
                <ExportAnonymizeDialog
                    onExport={(anon) => exportTab(settingsTab, anon)}
                    onClose={() => setShowTabExport(false)}
                />
            )}
            {iconPickerTabId && (
                <IconPickerModal
                    current={tabs.find((t) => t.id === iconPickerTabId)?.icon ?? ''}
                    onSelect={(name) => {
                        updateTab(iconPickerTabId, { icon: name || undefined });
                        setIconPickerTabId(null);
                    }}
                    onClose={() => setIconPickerTabId(null)}
                />
            )}
        </>
    );
});

/**
 * „PIN entfernen“ for one section/tab.
 *
 * The PIN field cannot do this itself: a view that is protected server-side shows
 * an EMPTY input (the editor never receives the code back), so there is nothing
 * to clear — which is why the old hint „Feld leeren entfernt den Schutz“ pointed
 * at a gesture nobody could make.
 *
 * `stored` = the vault holds this view. Then removing is the adapter's job, in one
 * step (POST /api/aura/vault/remove): it writes the content back into
 * config.dashboard and forgets the entry, and hands the payload back so the editor
 * lands on the same result without a save of its own — and without depending on
 * having pulled the protected content at all. A PIN that was only typed has no
 * vault entry, so there this is a plain local clear.
 */
function PinRemoveButton({ vaultKey, stored, onRemove }: { vaultKey: string; stored: boolean; onRemove: () => void }) {
    const t = useT();
    const forget = useMcpReleaseStore((s) => s.forget);
    const merge = useDashboardStore((s) => s.mergeProtectedContent);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    return (
        <>
            <button
                disabled={busy}
                onClick={() => {
                    if (!stored) {
                        forget(vaultKey);
                        onRemove();
                        return;
                    }
                    const token = adminToken();
                    if (!token) {
                        setFailed(true);
                        return;
                    }
                    setBusy(true);
                    setFailed(false);
                    void vaultRemove(token, vaultKey).then((res) => {
                        setBusy(false);
                        if (!res) {
                            // Nothing changed server-side — leave the view protected
                            // rather than opening it locally over a live vault entry.
                            setFailed(true);
                            return;
                        }
                        forget(vaultKey);
                        // The adapter already restored the content into the config;
                        // mirror it here (suppressed-dirty) so editor and state agree.
                        if (res.content) merge({ [vaultKey]: { scope: res.scope, content: res.content, open: true } });
                        else onRemove();
                    });
                }}
                className="aura-pin-remove flex items-center gap-1.5 w-full px-2.5 py-2 mt-2 rounded-lg text-xs hover:opacity-80 transition-opacity"
                style={{
                    background: 'var(--app-bg)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--accent-red)',
                    opacity: busy ? 0.6 : 1,
                }}
            >
                <ShieldOff size={11} />
                {t('pin.remove')}
            </button>
            {failed && (
                <p className="text-[9px] mt-1" style={{ color: 'var(--accent-red)' }}>
                    {t('pin.removeFailed')}
                </p>
            )}
        </>
    );
}

/** The PIN field shows nothing for a stored or linked PIN — the editor never knows the digits. */
function isPinSentinel(pin: string | undefined): boolean {
    return pin === KEEP_PIN || pin === LINK_PIN;
}

/**
 * „PIN übernehmen von“: let this view follow the PIN of another section/tab instead
 * of inventing a new one. The link is kept (`pinFrom`), and the adapter takes the
 * source's current PIN on every save — change it there and it changes here too.
 * Typing an own PIN, or picking „Eigene PIN“, ends the link; a stored view then
 * keeps the PIN it had last.
 */
function PinLinkSelect({
    selfKey,
    node,
    onChange,
}: {
    selfKey: string;
    node: { pin?: string; pinFrom?: string; pinProtected?: boolean };
    onChange: (patch: { pin?: string; pinFrom?: string }) => void;
}) {
    const t = useT();
    const layouts = useDashboardStore((s) => s.layouts);
    const options = useMemo(() => pinSourceOptions(layouts, selfKey), [layouts, selfKey]);
    const source = options.find((o) => o.key === node.pinFrom);
    if (!options.length && !node.pinFrom) return null;
    const stored = node.pin === KEEP_PIN || node.pinProtected === true;
    return (
        <>
            <label className="text-[11px] block mt-2 mb-1" style={{ color: 'var(--text-secondary)' }}>
                {t('pin.linkFrom')}
            </label>
            <select
                className="aura-pin-link w-full text-xs rounded-lg px-2 py-1.5 focus:outline-none"
                style={{
                    background: 'var(--app-bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--app-border)',
                }}
                value={source ? source.key : ''}
                onChange={(e) => {
                    const key = e.target.value;
                    if (key) onChange({ pinFrom: key, pin: stored ? KEEP_PIN : LINK_PIN });
                    else onChange({ pinFrom: undefined, pin: node.pin === LINK_PIN ? undefined : node.pin });
                }}
            >
                <option value="">{t('pin.linkNone')}</option>
                {options.map((o) => (
                    <option key={o.key} value={o.key}>
                        {o.label}
                    </option>
                ))}
            </select>
            {source && (
                <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {t('pin.linkedHint', { name: source.label })}
                </p>
            )}
            {node.pinFrom && !source && (
                <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {t('pin.linkLost')}
                </p>
            )}
        </>
    );
}

/**
 * One labelled switch inside a PIN panel. The PIN panels of a section and of a tab
 * show the same rows, so the markup lives once.
 */
function PinSwitch({
    label,
    hint,
    on,
    onToggle,
    className,
}: {
    label: string;
    hint: string;
    on: boolean;
    onToggle: () => void;
    className?: string;
}) {
    return (
        <div className={`flex items-center justify-between mt-2 ${className ?? ''}`}>
            <div>
                <p className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {label}
                </p>
                <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {hint}
                </p>
            </div>
            <button
                onClick={onToggle}
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{ background: on ? 'var(--accent)' : 'var(--app-border)' }}
            >
                <span
                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                    style={{ left: on ? '18px' : '2px' }}
                />
            </button>
        </div>
    );
}

/**
 * „Über MCP bearbeitbar“ for one protected view.
 *
 * The release the AI server needs to change PIN-protected content — and the reason
 * a PIN never has to be typed into a chat: the decision is made here, with the
 * admin session, and stored in the server-side vault (POST /api/aura/vault/mcp).
 * Shown for every view that carries a PIN — including one that was only just
 * typed. The vault gets its entry when the adapter redacts the saved config, so a
 * release flipped before that cannot be stored yet; it is parked in
 * `mcpReleaseStore.pending` and written by AdminLayout once the entry appears.
 * Hiding the switch until then is what made it look as if it only existed for
 * some views.
 */
function McpReleaseToggle({ vaultKey }: { vaultKey: string }) {
    const t = useT();
    const stored = useMcpReleaseStore((s) => s.flags[vaultKey] === true);
    const parked = useMcpReleaseStore((s) => s.pending[vaultKey]);
    const setFlag = useMcpReleaseStore((s) => s.set);
    const setPending = useMcpReleaseStore((s) => s.setPending);
    const clearPending = useMcpReleaseStore((s) => s.clearPending);
    const [failed, setFailed] = useState(false);
    const enabled = parked ?? stored;
    return (
        <div className="aura-pin-mcp mt-2">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                        {t('pin.mcpWrite')}
                    </p>
                    <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {t('pin.mcpWriteHint')}
                    </p>
                </div>
                <button
                    onClick={() => {
                        const token = adminToken();
                        if (!token) {
                            setFailed(true);
                            return;
                        }
                        const next = !enabled;
                        setFlag(vaultKey, next);
                        setFailed(false);
                        void vaultSetMcp(token, vaultKey, next).then((res) => {
                            if (res === 'ok') {
                                clearPending(vaultKey);
                                return;
                            }
                            // No vault entry yet (PIN typed, not saved): park the
                            // decision instead of calling it an error.
                            if (res === 'unknown') {
                                setPending(vaultKey, next);
                                return;
                            }
                            // Never leave the switch showing a release that the vault
                            // did not take — this one is a permission.
                            setFailed(true);
                            setFlag(vaultKey, enabled);
                        });
                    }}
                    className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                    style={{ background: enabled ? 'var(--accent)' : 'var(--app-border)' }}
                >
                    <span
                        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                        style={{ left: enabled ? '18px' : '2px' }}
                    />
                </button>
            </div>
            {parked !== undefined && !failed && (
                <p className="text-[9px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {t('pin.mcpWritePending')}
                </p>
            )}
            {failed && (
                <p className="text-[9px] mt-1" style={{ color: 'var(--accent-red)' }}>
                    {t('pin.mcpWriteFailed')}
                </p>
            )}
        </div>
    );
}

export function AdminEditor() {
    const t = useT();
    // Editor control lock (issue #655): widgets are inert while designing, so a
    // click meant for the layout can never switch a real device. Persisted per
    // browser, on by default, lifted from the toolbar when something has to be
    // tried out in place.
    const lockWidgets = useAdminPrefsStore((s) => s.lockWidgets);
    const setLockWidgets = useAdminPrefsStore((s) => s.setLockWidgets);

    // Narrow subscriptions — none of these change on tab switch, so AdminEditor
    // itself does NOT re-render when the user clicks a different tab.
    const activeLayoutId = useDashboardStore((s) => s.activeLayoutId);
    const layoutOptions = useStoreWithEqualityFn(
        useDashboardStore,
        (s) => s.layouts.map((l) => ({ id: l.id, name: l.name })),
        (a, b) => a.length === b.length && a.every((l, i) => l.id === b[i].id && l.name === b[i].name),
    );
    // tabs reference is stable on tab switch (patchLayout spreads { ...l, activeTabId }
    // which preserves the l.tabs array reference) — needed only for ImportWidgetDialog
    const tabs = useDashboardStore((s) => {
        const l = s.layouts.find((x) => x.id === s.activeLayoutId) ?? s.layouts[0];
        const sec = l.sections.find((x) => x.id === l.activeSectionId) ?? l.sections[0];
        return sec.tabs;
    });
    const importActiveTabId = useDashboardStore((s) => {
        const l = s.layouts.find((x) => x.id === s.activeLayoutId) ?? s.layouts[0];
        const sec = l.sections.find((x) => x.id === l.activeSectionId) ?? l.sections[0];
        return sec.activeTabId;
    });
    const activeSectionForEditor = useActiveSection();
    // The tab being edited shows its background image like the frontend (#442).
    const editorBgImage = useDashboardStore((s) => {
        const l = s.layouts.find((x) => x.id === s.activeLayoutId);
        const sec = l?.sections.find((x) => x.id === l.activeSectionId) ?? l?.sections[0];
        return tabBgImage(
            l,
            sec,
            sec?.tabs.find((x) => x.id === sec.activeTabId),
        );
    });
    // Stable action references — never cause re-renders
    const setActiveLayout = useDashboardStore((s) => s.setActiveLayout);
    const setActiveLayoutAndTab = useDashboardStore((s) => s.setActiveLayoutAndTab);
    const addWidget = useDashboardStore((s) => s.addWidget);
    const addTabFromImportOuter = useDashboardStore((s) => s.addTabFromImport);

    // Deep-link support: ?layout=<id>&tab=<id>&focus=<widgetId>
    // Used by the overview's broken-DP / orphan panels to jump straight to the
    // widget's tab and pulse-highlight the widget in the preview.
    const [searchParams] = useSearchParams();
    const [focusedWidgetId, setFocusedWidgetId] = useState<string | null>(null);
    useEffect(() => {
        const layoutParam = searchParams.get('layout');
        const tabParam = searchParams.get('tab');
        if (layoutParam && tabParam) {
            setActiveLayoutAndTab(layoutParam, tabParam);
        } else if (layoutParam) {
            setActiveLayout(layoutParam);
        }
        const focusParam = searchParams.get('focus');
        if (focusParam) {
            setFocusedWidgetId(focusParam);
            // Clear after the pulse animation has had time to play. WidgetFrame
            // applies the highlight class while this matches its config.id.
            const tid = setTimeout(() => setFocusedWidgetId(null), 3500);
            return () => clearTimeout(tid);
        }
    }, [searchParams, setActiveLayout, setActiveLayoutAndTab]);

    const { frontend, updateFrontend } = useConfigStore();
    const guidelinesEnabled = frontend.guidelinesEnabled ?? false;

    // Effective settings for the edited layout/section so the editor preview honors
    // per-layout overrides (e.g. a layout that enables the menu while global is off).
    const editorSettings = useEffectiveSettings(activeLayoutId, activeSectionForEditor?.id);

    // Mirror the frontend's mobile behavior: a docked sidebar menu collapses on narrow
    // viewports (App.tsx). Without this the editor keeps rendering the full-width menu
    // preview on a phone, eating most of the already-narrow editing area.
    const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 0));
    useEffect(() => {
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, []);
    const isMobileViewport = viewportWidth > 0 && viewportWidth < (editorSettings.mobileBreakpoint ?? 600);
    const isTabletViewport =
        !isMobileViewport &&
        tabletBandActive(viewportWidth, {
            mobileBreakpoint: editorSettings.mobileBreakpoint ?? 600,
            tabletBreakpoint: editorSettings.tabletBreakpoint ?? 0,
        });

    // Docked-sidebar layout menu: mirror the frontend so the editor preview reserves
    // the same horizontal space the menu occupies in the frontend. Without this the
    // preview would be full-width while the frontend dashboard is (device − menu),
    // so designs wouldn't match. Rendered as a non-interactive preview (see below).
    const drawerSidebarPreview =
        (editorSettings.layoutDrawerEnabled ?? false) &&
        (editorSettings.layoutDrawerPlacement ?? 'floating') === 'sidebar' &&
        // On a narrow editor window the frontend only keeps the docked sidebar when the
        // mobile placement explicitly says so — otherwise it becomes a hamburger there.
        (!isMobileViewport || (editorSettings.layoutDrawerMobilePlacement ?? 'auto') === 'sidebar') &&
        // Same for the tablet band (#413): the frontend keeps the sidebar there only on request.
        (!isTabletViewport || (editorSettings.layoutDrawerTabletPlacement ?? 'auto') === 'sidebar') &&
        activeSectionForEditor &&
        ((useDashboardStore
            .getState()
            .layouts.find((l) => l.id === activeLayoutId)
            ?.sections.filter((s) => !s.hidden).length ?? 0) > 1 ||
            (editorSettings.layoutDrawerShowSingle ?? false));
    const drawerWidth = editorSettings.layoutDrawerWidth ?? 240;

    // Horizontal section bar (top/bottom placement) is intentionally NOT previewed in the
    // editor — only the docked "sidebar" placement is mirrored (see drawerSidebarPreview),
    // because it reserves horizontal design space. Top/bottom bars are a frontend-only strip.

    // Run custom JS inside the editor preview when `customJSInEditor` is enabled.
    useCustomJs(activeLayoutId, activeSectionForEditor.id, true);
    // Apply custom CSS inside the editor preview when `customCSSInEditor` is enabled —
    // scoped to the [data-aura-css-scope] boxes, never the admin UI around them (#710).
    useCustomCss(activeLayoutId, activeSectionForEditor.id, true);
    const [showManual, setShowManual] = useState(false);
    const [showImport, setShowImport] = useState(false);
    // Which flow-order panel is open (phone or tablet) — at most one at a time.
    const [orderPanel, setOrderPanel] = useState<FlowMode | null>(null);
    // A phone with several columns (#413) is arranged in the column panel like the tablet.
    const mobileCols = Math.min(4, Math.max(1, Math.round(editorSettings.mobileCols ?? 1)));
    const toggleOrderPanel = (mode: FlowMode) => setOrderPanel((cur) => (cur === mode ? null : mode));

    // "Peek" mode: while Ctrl+Alt (Cmd+Option on Apple, #651) are held, hide all
    // edit-only chrome (via the `aura-peek` body class + CSS) so the editor shows
    // the clean frontend look.
    const [peek, setPeek] = useState(false);
    useEffect(() => {
        const sync = (e: KeyboardEvent) => {
            const on = (e.ctrlKey || e.metaKey) && e.altKey;
            setPeek(on);
            document.body.classList.toggle('aura-peek', on);
        };
        const clear = () => {
            setPeek(false);
            document.body.classList.remove('aura-peek');
        };
        window.addEventListener('keydown', sync);
        window.addEventListener('keyup', sync);
        window.addEventListener('blur', clear);
        return () => {
            window.removeEventListener('keydown', sync);
            window.removeEventListener('keyup', sync);
            window.removeEventListener('blur', clear);
            clear();
        };
    }, []);

    return (
        <div className="flex flex-col h-screen">
            {/* Toolbar */}
            <div
                className="flex items-center gap-3 px-6 py-3 shrink-0 flex-wrap"
                style={{ background: 'var(--app-surface)', borderBottom: '1px solid var(--app-border)' }}
            >
                <h2 className="font-semibold text-sm mr-2 shrink-0" style={{ color: 'var(--text-primary)' }}>
                    {t('admin.nav.editor')}
                </h2>
                <select
                    value={activeLayoutId}
                    onChange={(e) => setActiveLayout(e.target.value)}
                    className="text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    {layoutOptions.map((l) => (
                        <option key={l.id} value={l.id}>
                            {l.name}
                        </option>
                    ))}
                </select>
                <div
                    className="hidden md:flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg shrink-0 transition-colors"
                    style={{
                        background: peek ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--app-bg)',
                        color: peek ? 'var(--accent)' : 'var(--text-secondary)',
                        border: `1px solid ${peek ? 'var(--accent)' : 'var(--app-border)'}`,
                    }}
                    title={t('editor.peekHint')}
                >
                    <Eye size={13} />
                    <span>{t('editor.peekHint')}</span>
                </div>
                <div className="flex-1" />
                <button
                    onClick={() => setShowManual(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white hover:opacity-80"
                    style={{ background: 'var(--accent)' }}
                >
                    <Plus size={15} /> Neues Widget
                </button>
                <button
                    onClick={() => setShowImport(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-80"
                    style={{
                        background: 'var(--app-bg)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--app-border)',
                    }}
                >
                    <Upload size={15} /> {t('widgets.import')}
                </button>
                {(['mobile', 'tablet'] as const).map((mode) => {
                    const active = orderPanel === mode;
                    // A phone next to a tablet is two rounded rectangles of nearly the same
                    // shape — indistinguishable at 15 px. The tablet button shows the
                    // columns instead, as many as the tablet band is configured with.
                    const tabletCols = Math.min(4, Math.max(1, Math.round(editorSettings.tabletCols ?? 2)));
                    const TabletIcon = tabletCols >= 4 ? Columns4 : tabletCols === 3 ? Columns3 : Columns2;
                    return (
                        <button
                            key={mode}
                            data-aura-order-panel={mode}
                            onClick={() => toggleOrderPanel(mode)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-80"
                            style={{
                                background: active
                                    ? 'color-mix(in srgb, var(--accent) 13%, transparent)'
                                    : 'var(--app-bg)',
                                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                                border: `1px solid ${active ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}
                            title={t(mode === 'tablet' ? 'editor.tablet.title' : 'editor.mobile.title')}
                        >
                            {mode === 'tablet' ? <TabletIcon size={15} /> : <Smartphone size={15} />}
                        </button>
                    );
                })}
                <button
                    onClick={() => setLockWidgets(!lockWidgets)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-80"
                    style={{
                        background: lockWidgets ? 'var(--app-bg)' : 'rgba(239,68,68,0.12)',
                        color: lockWidgets ? 'var(--text-secondary)' : 'rgb(239,68,68)',
                        border: `1px solid ${lockWidgets ? 'var(--app-border)' : 'rgb(239,68,68)'}`,
                    }}
                    title={lockWidgets ? t('editor.lock.on') : t('editor.lock.off')}
                    aria-pressed={lockWidgets}
                    data-widget-lock={lockWidgets ? 'on' : 'off'}
                >
                    {lockWidgets ? <Lock size={15} /> : <LockOpen size={15} />}
                </button>
                <button
                    onClick={() => updateFrontend({ guidelinesEnabled: !guidelinesEnabled })}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium hover:opacity-80"
                    style={{
                        background: guidelinesEnabled ? 'rgba(239,68,68,0.12)' : 'var(--app-bg)',
                        color: guidelinesEnabled ? 'rgb(239,68,68)' : 'var(--text-secondary)',
                        border: `1px solid ${guidelinesEnabled ? 'rgb(239,68,68)' : 'var(--app-border)'}`,
                    }}
                    title="Hilfslinien ein-/ausblenden"
                >
                    <Ruler size={15} />
                </button>
            </div>

            {/* Section switcher — pick/add the "Bereich" being edited */}
            <SectionSwitcher />

            {/* Tab bar — isolated memoized component, does not cause AdminEditor to re-render on tab switch.
                Always rendered at the top in the editor: the footer ('bottom') position is a
                frontend-only concern, so the design surface keeps the tab strip on top. */}
            <TabBar />

            {/* Dashboard preview with edit mode */}
            <div className="flex-1 flex overflow-hidden" style={{ background: 'var(--app-bg)' }}>
                {drawerSidebarPreview && (
                    // Greyed, non-interactive preview of the docked sidebar so the design
                    // area matches the frontend. A hint overlay explains why it appears and
                    // links to the setting that controls it.
                    <div className="shrink-0 relative flex" style={{ width: drawerWidth }}>
                        <div
                            className="flex w-full"
                            data-aura-css-scope=""
                            style={{ pointerEvents: 'none', filter: 'grayscale(1)', opacity: 0.45 }}
                            aria-hidden
                        >
                            <LayoutDrawer
                                activeLayoutId={activeLayoutId}
                                activeSectionId={activeSectionForEditor?.id}
                                variant="sidebar"
                                width={drawerWidth}
                                showTitle={editorSettings.layoutDrawerShowTitle ?? true}
                                drawerTitle={editorSettings.layoutDrawerTitle ?? ''}
                                entryStyle={editorSettings.layoutDrawerEntryStyle ?? 'iconAndName'}
                                entryHeight={editorSettings.layoutDrawerEntryHeight ?? 48}
                                indicatorStyle={editorSettings.layoutDrawerIndicatorStyle ?? 'filled'}
                                fontSize={editorSettings.layoutDrawerFontSize ?? 14}
                                iconSize={editorSettings.layoutDrawerIconSize ?? 16}
                                items={editorSettings.layoutDrawerItems ?? []}
                            />
                        </div>
                        <div
                            className="absolute inset-x-2 bottom-2 rounded-lg p-2.5 space-y-1.5 shadow-lg"
                            style={{
                                background: 'var(--app-surface)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            <p className="text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                                {t('editor.dockedMenuPreview.hint')}
                            </p>
                            <a
                                href={`#/admin/design?ctx=${activeLayoutId}&tab=menu`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium hover:opacity-80"
                                style={{ color: 'var(--accent)' }}
                            >
                                {t('editor.dockedMenuPreview.link')}
                                <ExternalLink size={11} />
                            </a>
                        </div>
                    </div>
                )}
                {/* data-aura-scale + --font-scale: the preview renders the very widgets the
                    frontend renders, so it has to use the frontend's font scale for the
                    layout/section being edited. Without it the editor previewed every
                    dashboard at scale 1 and a title that fit here was cut off live (#668).
                    The frontend's own marker (data-aura-app) stays out on purpose — it
                    answers the portal-target queries, which must not land in this box.
                    data-aura-css-scope confines the custom CSS to the preview (#710). */}
                <div
                    className="flex-1 min-w-0 flex flex-col overflow-hidden relative"
                    data-aura-scale=""
                    data-aura-css-scope=""
                    style={
                        {
                            '--font-scale': String(editorSettings.fontScale ?? 1),
                            ...(editorBgImage ? BG_IMAGE_HOST_STYLE : {}),
                        } as React.CSSProperties
                    }
                >
                    {editorBgImage && <BackgroundImageLayer image={editorBgImage} />}
                    <FocusedWidgetContext.Provider value={focusedWidgetId}>
                        <Dashboard editMode={true} />
                    </FocusedWidgetContext.Provider>
                </div>
                {orderPanel === 'mobile' &&
                    (mobileCols > 1 ? (
                        <TabletOrderPanel layoutId={activeLayoutId} cols={mobileCols} mode="mobile" />
                    ) : (
                        <OrderPanel layoutId={activeLayoutId} mode="mobile" />
                    ))}
                {orderPanel === 'tablet' && (
                    <TabletOrderPanel
                        layoutId={activeLayoutId}
                        cols={Math.min(4, Math.max(1, Math.round(editorSettings.tabletCols ?? 2)))}
                    />
                )}
            </div>

            {showManual && <ManualWidgetDialog onAdd={addWidget} onClose={() => setShowManual(false)} />}
            {showImport && (
                <ImportWidgetDialog
                    tabs={tabs}
                    activeTabId={importActiveTabId}
                    onAdd={(widget, tabId) => {
                        const state = useDashboardStore.getState();
                        const activeLayout =
                            state.layouts.find((l) => l.id === state.activeLayoutId) ?? state.layouts[0];
                        const activeSec =
                            activeLayout?.sections.find((se) => se.id === activeLayout.activeSectionId) ??
                            activeLayout?.sections[0];
                        if (tabId && tabId !== activeSec?.activeTabId) state.setActiveTab(tabId);
                        addWidget(widget);
                    }}
                    onAddTab={addTabFromImportOuter}
                    onClose={() => setShowImport(false)}
                />
            )}
        </div>
    );
}
