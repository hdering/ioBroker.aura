// Right pane of the Layouts page when a section ("Bereich") is selected: head
// card with breadcrumb, "Allgemein" / "Sichtbarkeit" cards and the tab list —
// the frontend's tab bar, in order, with default tab and hidden state.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ChevronRight,
    Copy,
    Download,
    Eye,
    EyeOff,
    FolderInput,
    GripVertical,
    Palette,
    PenSquare,
    Plus,
    Search,
    Star,
    Trash2,
    Layers,
} from 'lucide-react';
import { Icon } from '@iconify/react';
import { useDashboardStore, type DashboardLayout, type Section, type Tab } from '../../../../store/dashboardStore';
import { IconPickerModal } from '../../../../components/config/IconPickerModal';
import { ExportAnonymizeDialog } from '../../../../components/config/ExportAnonymizeDialog';
import { exportSection } from '../../../../utils/widgetExportImport';
import { useT } from '../../../../i18n';
import { Toggle } from '../shared/SettingControls';
import {
    ActionMenu,
    Btn,
    Card,
    Chip,
    Field,
    FieldBox,
    IconBtn,
    InlineEdit,
    InlinePrompt,
    SettingRow,
    slugTransform,
    useListDrag,
    type MenuItem,
} from './pieces';
import { layoutHash, sectionIconNode } from './LayoutTree';
import { countWidgets } from './LayoutDetail';

interface SectionDetailProps {
    layout: DashboardLayout;
    section: Section;
    isFirstLayout: boolean;
    onSelect: (id: string) => void;
}

export function SectionDetail({ layout, section, isFirstLayout, onSelect }: SectionDetailProps) {
    const t = useT();
    const navigate = useNavigate();
    const layouts = useDashboardStore((s) => s.layouts);
    const setActiveLayout = useDashboardStore((s) => s.setActiveLayout);
    const setActiveLayoutAndSection = useDashboardStore((s) => s.setActiveLayoutAndSection);
    const renameSection = useDashboardStore((s) => s.renameSection);
    const setSectionSlug = useDashboardStore((s) => s.setSectionSlug);
    const setSectionIcon = useDashboardStore((s) => s.setSectionIcon);
    const setSectionHidden = useDashboardStore((s) => s.setSectionHidden);
    const setDefaultSection = useDashboardStore((s) => s.setDefaultSection);
    const duplicateSection = useDashboardStore((s) => s.duplicateSection);
    const removeSection = useDashboardStore((s) => s.removeSection);
    const moveSectionToLayout = useDashboardStore((s) => s.moveSectionToLayout);
    const updateSectionSettings = useDashboardStore((s) => s.updateSectionSettings);
    const clearSectionSettings = useDashboardStore((s) => s.clearSectionSettings);

    const [iconOpen, setIconOpen] = useState(false);
    const [showExport, setShowExport] = useState(false);
    const [showDup, setShowDup] = useState(false);
    const [dupName, setDupName] = useState(`${section.name} (Kopie)`);
    const [showMove, setShowMove] = useState(false);
    const [moveTarget, setMoveTarget] = useState('');

    const isOnly = layout.sections.length === 1;
    const isDefault = (layout.defaultSectionId ?? layout.sections[0]?.id) === section.id;
    const otherLayouts = layouts.filter((l) => l.id !== layout.id);
    const widgetCount = countWidgets([section]);
    const menuHiddenHere = section.settings?.layoutDrawerEnabled === false;
    const hash = isOnly ? layoutHash(layout, isFirstLayout) : `#/view/${layout.slug}/s/${section.slug}`;

    // Section mutations act on the active layout — make sure it is this one.
    const ensureActive = () => setActiveLayout(layout.id);

    const openInEditor = () => {
        setActiveLayoutAndSection(layout.id, section.id);
        navigate('/admin/editor');
    };

    const runDuplicate = () => {
        const before = new Set(layout.sections.map((s) => s.id));
        ensureActive();
        duplicateSection(section.id, dupName.trim() || `${section.name} (Kopie)`);
        setShowDup(false);
        const l = useDashboardStore.getState().layouts.find((x) => x.id === layout.id);
        const created = l?.sections.find((s) => !before.has(s.id));
        if (created) onSelect(created.id);
    };

    const runMove = (mode: 'move' | 'copy') => {
        if (!moveTarget) return;
        moveSectionToLayout(section.id, layout.id, moveTarget, mode);
        setShowMove(false);
        if (mode === 'move') onSelect(layout.id);
    };

    const menu: MenuItem[] = [
        {
            key: 'dup',
            label: t('common.duplicate'),
            icon: <Copy size={13} />,
            onClick: () => {
                setDupName(`${section.name} (Kopie)`);
                setShowDup(true);
            },
        },
        ...(otherLayouts.length > 0
            ? [
                  {
                      key: 'move',
                      label: t('sections.moveTitle'),
                      icon: <FolderInput size={13} />,
                      onClick: () => {
                          setMoveTarget('');
                          setShowMove(true);
                      },
                  } satisfies MenuItem,
              ]
            : []),
        {
            key: 'export',
            label: t('sections.export'),
            icon: <Download size={13} />,
            onClick: () => setShowExport(true),
        },
        {
            key: 'delete',
            label: t('sections.delete'),
            icon: <Trash2 size={13} />,
            danger: true,
            disabled: isOnly,
            disabledHint: t('sections.deleteLastHint'),
            confirm: t('sections.deleteConfirm'),
            onClick: () => {
                ensureActive();
                removeSection(section.id);
                onSelect(layout.id);
            },
        },
    ];

    return (
        <div className="space-y-4" data-testid="section-detail">
            {/* Head */}
            <div
                className="rounded-xl px-4 sm:px-5 py-4 flex flex-wrap items-center gap-4"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            >
                <button
                    onClick={() => setIconOpen(true)}
                    title={t('layouts.changeIcon')}
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 hover:opacity-80"
                    style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}
                >
                    {sectionIconNode(section, 22)}
                </button>
                <div className="flex-1 min-w-[160px]">
                    <h2
                        className="text-base font-bold flex items-center gap-1.5 min-w-0"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        <button
                            onClick={() => onSelect(layout.id)}
                            className="font-medium hover:underline truncate"
                            style={{ color: 'var(--text-secondary)' }}
                            data-testid="section-breadcrumb"
                        >
                            {layout.name}
                        </button>
                        <span style={{ color: 'var(--text-secondary)' }}>/</span>
                        <InlineEdit
                            value={section.name}
                            onCommit={(v) => {
                                ensureActive();
                                renameSection(section.id, v);
                            }}
                            testId="section-name"
                        />
                    </h2>
                    <a
                        href={hash}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-mono hover:underline"
                        style={{ color: 'var(--accent)' }}
                    >
                        {hash}
                    </a>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {isDefault && (
                            <Chip tone="ok" title={t('sections.setDefaultSection')}>
                                <Star size={11} /> {t('sections.defaultChip')}
                            </Chip>
                        )}
                        {section.hidden && (
                            <Chip title={t('sections.hideFromMenuHint')}>
                                <EyeOff size={11} /> {t('sections.hiddenChip')}
                            </Chip>
                        )}
                        <Chip>
                            {section.tabs.length === 1
                                ? t('layouts.tabsCountOne')
                                : t('layouts.tabsCount', { count: String(section.tabs.length) })}
                        </Chip>
                        <Chip>
                            {widgetCount === 1
                                ? t('layouts.widgetsCountOne')
                                : t('layouts.widgetsCount', { count: String(widgetCount) })}
                        </Chip>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Btn variant="primary" onClick={openInEditor} data-testid="section-open-editor">
                        <PenSquare size={14} /> {t('sections.openEditor')}
                    </Btn>
                    <Btn
                        onClick={() => navigate(`/admin/design?ctx=${section.id}`)}
                        title={t('layouts.designSettings')}
                    >
                        <Palette size={14} /> {t('admin.nav.design')}
                    </Btn>
                    <ActionMenu items={menu} title={t('layouts.moreActions')} testId="section-menu" />
                </div>
            </div>

            {showDup && (
                <InlinePrompt
                    label={t('layouts.duplicateName')}
                    value={dupName}
                    onChange={setDupName}
                    onSubmit={runDuplicate}
                    onCancel={() => setShowDup(false)}
                    submitLabel={t('layouts.duplicate')}
                />
            )}
            {showMove && (
                <div
                    className="rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2"
                    style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                >
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {t('sections.moveTargetLabel')}
                    </span>
                    <select
                        value={moveTarget}
                        onChange={(e) => setMoveTarget(e.target.value)}
                        className="text-xs rounded-lg px-2 py-1.5 focus:outline-none flex-1 min-w-[160px]"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                    >
                        <option value="">{t('sections.moveTargetPlaceholder')}</option>
                        {otherLayouts.map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.name}
                            </option>
                        ))}
                    </select>
                    <Btn
                        small
                        disabled={!moveTarget || isOnly}
                        title={isOnly ? t('sections.moveLastHint') : undefined}
                        onClick={() => runMove('move')}
                    >
                        <FolderInput size={12} /> {t('sections.move')}
                    </Btn>
                    <Btn small disabled={!moveTarget} onClick={() => runMove('copy')}>
                        <Copy size={12} /> {t('sections.copy')}
                    </Btn>
                    <Btn variant="ghost" small onClick={() => setShowMove(false)}>
                        {t('common.cancel')}
                    </Btn>
                </div>
            )}
            {showExport && (
                <ExportAnonymizeDialog
                    onExport={(anon) => exportSection(section, anon)}
                    onClose={() => setShowExport(false)}
                />
            )}
            {iconOpen && (
                <IconPickerModal
                    current={section.icon ?? ''}
                    onSelect={(name) => {
                        ensureActive();
                        setSectionIcon(section.id, name || undefined);
                        setIconOpen(false);
                    }}
                    onClose={() => setIconOpen(false)}
                />
            )}

            {/* Allgemein + Sichtbarkeit */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title={t('layouts.card.general')}>
                    <Field label={t('layouts.field.name')}>
                        <FieldBox>
                            <InlineEdit
                                value={section.name}
                                onCommit={(v) => {
                                    ensureActive();
                                    renameSection(section.id, v);
                                }}
                                className="flex-1"
                                inputClassName="flex-1"
                            />
                        </FieldBox>
                    </Field>
                    <Field label={t('sections.field.slug')}>
                        <FieldBox>
                            <InlineEdit
                                value={section.slug}
                                onCommit={(v) => {
                                    ensureActive();
                                    setSectionSlug(section.id, v);
                                }}
                                transform={slugTransform}
                                mono
                                prefix="/s/"
                                className="flex-1"
                                inputClassName="flex-1"
                                testId="section-slug"
                            />
                        </FieldBox>
                    </Field>
                    <Field label={t('layouts.field.icon')}>
                        <FieldBox>
                            <span className="flex items-center gap-2 min-w-0">
                                <span style={{ color: 'var(--accent)' }}>{sectionIconNode(section, 16)}</span>
                                <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                                    {section.icon ?? t('layouts.iconNone')}
                                </span>
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0">
                                {section.icon && (
                                    <Btn
                                        variant="ghost"
                                        small
                                        onClick={() => {
                                            ensureActive();
                                            setSectionIcon(section.id, undefined);
                                        }}
                                    >
                                        {t('layouts.iconRemove')}
                                    </Btn>
                                )}
                                <Btn small onClick={() => setIconOpen(true)}>
                                    {t('layouts.changeIcon')}
                                </Btn>
                            </span>
                        </FieldBox>
                    </Field>
                </Card>

                <Card title={t('sections.card.visibility')}>
                    <SettingRow label={t('sections.defaultSection')} hint={t('sections.setDefaultSection')}>
                        {isDefault ? (
                            <Chip tone="ok">
                                <Star size={11} /> {t('sections.isDefault')}
                            </Chip>
                        ) : (
                            <Btn
                                small
                                onClick={() => setDefaultSection(layout.id, section.id)}
                                data-testid="section-make-default"
                            >
                                <Star size={12} /> {t('sections.makeDefault')}
                            </Btn>
                        )}
                    </SettingRow>
                    <SettingRow label={t('sections.hideFromMenu')} hint={t('sections.hideFromMenuHint')}>
                        <Toggle
                            value={!!section.hidden}
                            onChange={(v) => {
                                ensureActive();
                                setSectionHidden(section.id, v);
                            }}
                        />
                    </SettingRow>
                    <SettingRow label={t('sections.hideMenuHere')} hint={t('sections.hideMenuHereHint')}>
                        <Toggle
                            value={menuHiddenHere}
                            onChange={(v) =>
                                v
                                    ? updateSectionSettings(layout.id, section.id, { layoutDrawerEnabled: false })
                                    : clearSectionSettings(layout.id, section.id, 'layoutDrawerEnabled')
                            }
                        />
                    </SettingRow>
                </Card>
            </div>

            <TabList layout={layout} section={section} />
        </div>
    );
}

// ── Tab list ──────────────────────────────────────────────────────────────────

function TabList({ layout, section }: { layout: DashboardLayout; section: Section }) {
    const t = useT();
    const navigate = useNavigate();
    const setActiveLayout = useDashboardStore((s) => s.setActiveLayout);
    const setActiveLayoutAndSection = useDashboardStore((s) => s.setActiveLayoutAndSection);
    const setActiveLayoutAndTab = useDashboardStore((s) => s.setActiveLayoutAndTab);
    const setDefaultTab = useDashboardStore((s) => s.setDefaultTab);
    const updateTab = useDashboardStore((s) => s.updateTab);
    const reorderTabs = useDashboardStore((s) => s.reorderTabs);
    const addTab = useDashboardStore((s) => s.addTab);

    const [query, setQuery] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [newName, setNewName] = useState('');

    // Tab mutations act on the active section of the active layout.
    const ensureActive = () => setActiveLayoutAndSection(layout.id, section.id);

    const drag = useListDrag((from, to) => {
        ensureActive();
        reorderTabs(from, to);
    });

    const q = query.trim().toLowerCase();
    const visible = useMemo(
        () =>
            section.tabs
                .map((tab, index) => ({ tab, index }))
                .filter(({ tab }) => !q || tab.name.toLowerCase().includes(q) || tab.slug.toLowerCase().includes(q)),
        [section.tabs, q],
    );
    const filtering = q.length > 0;
    const defaultTabId = section.defaultTabId ?? section.tabs[0]?.id;

    const createTab = () => {
        const name = newName.trim();
        if (!name) return;
        ensureActive();
        addTab(name);
        setNewName('');
        setShowNew(false);
    };

    const openTabInEditor = (tab: Tab) => {
        setActiveLayoutAndTab(layout.id, tab.id, section.id);
        navigate('/admin/editor');
    };

    return (
        <Card
            title={t('tabs.title')}
            padded={false}
            testId="tab-list"
            footer={filtering ? undefined : t('tabs.reorderHint')}
            actions={
                <>
                    <label
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs"
                        style={{
                            background: 'var(--app-bg)',
                            border: '1px solid var(--app-border)',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        <Search size={12} />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t('tabs.search')}
                            data-testid="tab-search"
                            className="bg-transparent focus:outline-none w-24 sm:w-36"
                            style={{ color: 'var(--text-primary)' }}
                        />
                    </label>
                    <Btn variant="primary" small onClick={() => setShowNew((v) => !v)} data-testid="tab-new">
                        <Plus size={13} /> {t('tabs.newTab')}
                    </Btn>
                </>
            }
        >
            {showNew && (
                <div className="px-3 pt-3">
                    <InlinePrompt
                        value={newName}
                        onChange={setNewName}
                        onSubmit={createTab}
                        onCancel={() => {
                            setNewName('');
                            setShowNew(false);
                        }}
                        submitLabel={t('layouts.create')}
                        placeholder={t('tabs.placeholder')}
                        testId="tab-new-name"
                    />
                </div>
            )}
            <div>
                {visible.map(({ tab, index }) => {
                    const isDefault = tab.id === defaultTabId;
                    return (
                        <div
                            key={tab.id}
                            data-testid={`tab-row-${tab.id}`}
                            className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 border-t"
                            style={{ borderColor: 'var(--app-border)', ...(filtering ? {} : drag.rowStyle(index)) }}
                            {...(filtering ? {} : drag.targetProps(index))}
                        >
                            <span
                                {...(filtering ? { draggable: false } : drag.handleProps(index))}
                                title={filtering ? undefined : t('layouts.dragToReorder')}
                                className={`flex items-center justify-center shrink-0 ${filtering ? 'opacity-30' : 'cursor-grab active:cursor-grabbing hover:opacity-80'}`}
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <GripVertical size={14} />
                            </span>
                            <span
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}
                            >
                                {tab.icon ? <Icon icon={tab.icon} width={15} height={15} /> : <Layers size={15} />}
                            </span>
                            <div className="flex-1 min-w-0">
                                <span className="flex items-center gap-2 min-w-0">
                                    <span
                                        className="font-semibold text-sm truncate"
                                        style={{
                                            color: 'var(--text-primary)',
                                            opacity: tab.hidden || tab.disabled ? 0.6 : 1,
                                        }}
                                    >
                                        {tab.name}
                                    </span>
                                    {tab.disabled && <Chip>{t('editor.tabMgmt.disabled')}</Chip>}
                                </span>
                                <span
                                    className="block text-[10px] font-mono truncate"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    /tab/{tab.slug}
                                </span>
                            </div>
                            <span
                                className="hidden sm:inline text-xs shrink-0 tabular-nums"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                {tab.widgets.length === 1
                                    ? t('layouts.widgetsCountOne')
                                    : t('layouts.widgetsCount', { count: String(tab.widgets.length) })}
                            </span>
                            <button
                                role="radio"
                                aria-checked={isDefault}
                                title={t('layouts.setDefaultTab')}
                                data-testid={`tab-default-${tab.id}`}
                                onClick={() => {
                                    if (isDefault) return;
                                    setActiveLayout(layout.id);
                                    setDefaultTab(section.id, tab.id);
                                }}
                                className="w-7 h-7 flex items-center justify-center shrink-0 hover:opacity-80"
                            >
                                <span
                                    className="w-4 h-4 rounded-full flex items-center justify-center"
                                    style={{ border: `2px solid ${isDefault ? 'var(--accent)' : 'var(--app-border)'}` }}
                                >
                                    {isDefault && (
                                        <span
                                            className="w-2 h-2 rounded-full"
                                            style={{ background: 'var(--accent)' }}
                                        />
                                    )}
                                </span>
                            </button>
                            <IconBtn
                                muted={!!tab.hidden}
                                title={tab.hidden ? t('tabs.showTitle') : t('tabs.hideTitle')}
                                data-testid={`tab-hidden-${tab.id}`}
                                onClick={() => {
                                    ensureActive();
                                    updateTab(tab.id, { hidden: !tab.hidden });
                                }}
                            >
                                {tab.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                            </IconBtn>
                            <Btn
                                variant="ghost"
                                small
                                onClick={() => openTabInEditor(tab)}
                                data-testid={`tab-editor-${tab.id}`}
                            >
                                <span className="hidden sm:inline">{t('tabs.openEditor')}</span>{' '}
                                <ChevronRight size={12} />
                            </Btn>
                        </div>
                    );
                })}
                {visible.length === 0 && (
                    <p
                        className="px-4 py-6 text-xs text-center border-t"
                        style={{ color: 'var(--text-secondary)', borderColor: 'var(--app-border)' }}
                    >
                        {t('tabs.noMatch')}
                    </p>
                )}
            </div>
        </Card>
    );
}
