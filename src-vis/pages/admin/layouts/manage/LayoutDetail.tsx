// Right pane of the Layouts page when a layout is selected: head card with the
// layout's identity and counts, "Allgemein" / "Start & Menü" cards and the list
// of its sections (the frontend's section menu, in order).

import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Copy,
    Download,
    ExternalLink,
    Eye,
    EyeOff,
    FolderInput,
    GripVertical,
    Palette,
    PenSquare,
    Plus,
    Star,
    Trash2,
    Upload,
    ChevronRight,
} from 'lucide-react';
import { useDashboardStore, type DashboardLayout, type Section } from '../../../../store/dashboardStore';
import { IconPickerModal } from '../../../../components/config/IconPickerModal';
import { ExportAnonymizeDialog } from '../../../../components/config/ExportAnonymizeDialog';
import { exportLayout, exportSection, importSection } from '../../../../utils/widgetExportImport';
import { useT } from '../../../../i18n';
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
import { layoutHash, layoutIconNode, sectionIconNode } from './LayoutTree';

export function countTabs(layout: DashboardLayout) {
    return layout.sections.reduce((n, s) => n + s.tabs.length, 0);
}
export function countWidgets(sections: Section[]) {
    return sections.reduce((n, s) => n + s.tabs.reduce((m, tab) => m + tab.widgets.length, 0), 0);
}

interface LayoutDetailProps {
    layout: DashboardLayout;
    isFirst: boolean;
    isOnly: boolean;
    onSelect: (id: string) => void;
}

export function LayoutDetail({ layout, isFirst, isOnly, onSelect }: LayoutDetailProps) {
    const t = useT();
    const navigate = useNavigate();
    const renameLayout = useDashboardStore((s) => s.renameLayout);
    const setLayoutSlug = useDashboardStore((s) => s.setLayoutSlug);
    const setLayoutIcon = useDashboardStore((s) => s.setLayoutIcon);
    const duplicateLayout = useDashboardStore((s) => s.duplicateLayout);
    const removeLayout = useDashboardStore((s) => s.removeLayout);
    const setDefaultSection = useDashboardStore((s) => s.setDefaultSection);

    const [iconOpen, setIconOpen] = useState(false);
    const [showExport, setShowExport] = useState(false);
    const [showDup, setShowDup] = useState(false);
    const [dupName, setDupName] = useState(`${layout.name} (Kopie)`);

    const hash = layoutHash(layout, isFirst);
    const tabCount = countTabs(layout);
    const widgetCount = countWidgets(layout.sections);
    const defaultSectionId = layout.defaultSectionId ?? layout.sections[0]?.id;

    const runDuplicate = () => {
        const before = new Set(useDashboardStore.getState().layouts.map((l) => l.id));
        duplicateLayout(layout.id, dupName.trim() || `${layout.name} (Kopie)`);
        const created = useDashboardStore.getState().layouts.find((l) => !before.has(l.id));
        setShowDup(false);
        if (created) onSelect(created.id);
    };

    const menu: MenuItem[] = [
        {
            key: 'dup',
            label: t('common.duplicate'),
            icon: <Copy size={13} />,
            onClick: () => {
                setDupName(`${layout.name} (Kopie)`);
                setShowDup(true);
            },
        },
        { key: 'export', label: t('layouts.export'), icon: <Download size={13} />, onClick: () => setShowExport(true) },
        {
            key: 'delete',
            label: t('layouts.delete'),
            icon: <Trash2 size={13} />,
            danger: true,
            disabled: isOnly,
            disabledHint: t('layouts.deleteLastHint'),
            confirm: t('layouts.deleteConfirm'),
            onClick: () => removeLayout(layout.id),
        },
    ];

    return (
        <div className="space-y-4" data-testid="layout-detail">
            {/* Head */}
            <div
                className="rounded-xl px-5 py-4 flex items-center gap-4"
                style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            >
                <button
                    onClick={() => setIconOpen(true)}
                    title={t('layouts.changeIcon')}
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 hover:opacity-80"
                    style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }}
                >
                    {layoutIconNode(layout, 22)}
                </button>
                <div className="flex-1 min-w-0">
                    <h2
                        className="text-base font-bold flex items-center min-w-0"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        <InlineEdit
                            value={layout.name}
                            onCommit={(v) => renameLayout(layout.id, v)}
                            testId="layout-name"
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
                        {isFirst && (
                            <Chip tone="ok" title={t('layouts.default')}>
                                <Star size={11} /> {t('layouts.defaultLayout')}
                            </Chip>
                        )}
                        <Chip>
                            {layout.sections.length === 1
                                ? t('sections.countOne')
                                : t('sections.count', { count: String(layout.sections.length) })}
                        </Chip>
                        <Chip>
                            {tabCount === 1
                                ? t('layouts.tabsCountOne')
                                : t('layouts.tabsCount', { count: String(tabCount) })}
                        </Chip>
                        <Chip>
                            {widgetCount === 1
                                ? t('layouts.widgetsCountOne')
                                : t('layouts.widgetsCount', { count: String(widgetCount) })}
                        </Chip>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <a
                        href={hash}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-medium hover:opacity-80 px-3 py-2 rounded-xl text-sm"
                        style={{
                            background: 'var(--app-surface)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title={t('layouts.open')}
                    >
                        <ExternalLink size={14} /> {t('layouts.open')}
                    </a>
                    <Btn onClick={() => navigate(`/admin/design?ctx=${layout.id}`)} title={t('layouts.designSettings')}>
                        <Palette size={14} /> {t('admin.nav.design')}
                    </Btn>
                    <ActionMenu items={menu} title={t('layouts.moreActions')} testId="layout-menu" />
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
                    testId="layout-dup-name"
                />
            )}
            {showExport && (
                <ExportAnonymizeDialog
                    onExport={(anon) => exportLayout(layout, anon)}
                    onClose={() => setShowExport(false)}
                />
            )}
            {iconOpen && (
                <IconPickerModal
                    current={layout.icon ?? ''}
                    onSelect={(name) => {
                        setLayoutIcon(layout.id, name || undefined);
                        setIconOpen(false);
                    }}
                    onClose={() => setIconOpen(false)}
                />
            )}

            {/* Allgemein + Start & Menü */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title={t('layouts.card.general')}>
                    <Field label={t('layouts.field.name')}>
                        <FieldBox>
                            <InlineEdit
                                value={layout.name}
                                onCommit={(v) => renameLayout(layout.id, v)}
                                className="flex-1"
                                inputClassName="flex-1"
                            />
                        </FieldBox>
                    </Field>
                    <Field label={t('layouts.field.url')}>
                        <FieldBox>
                            {isFirst ? (
                                <>
                                    <span className="font-mono text-xs">#/</span>
                                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                                        {t('layouts.firstLayoutHint')}
                                    </span>
                                </>
                            ) : (
                                <InlineEdit
                                    value={layout.slug}
                                    onCommit={(v) => setLayoutSlug(layout.id, v)}
                                    transform={slugTransform}
                                    mono
                                    prefix="#/view/"
                                    className="flex-1"
                                    inputClassName="flex-1"
                                    testId="layout-slug"
                                />
                            )}
                        </FieldBox>
                    </Field>
                    <Field label={t('layouts.field.icon')}>
                        <FieldBox>
                            <span className="flex items-center gap-2 min-w-0">
                                <span style={{ color: 'var(--accent)' }}>{layoutIconNode(layout, 16)}</span>
                                <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                                    {layout.icon ?? t('layouts.iconNone')}
                                </span>
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0">
                                {layout.icon && (
                                    <Btn variant="ghost" small onClick={() => setLayoutIcon(layout.id, undefined)}>
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

                <Card title={t('layouts.card.start')}>
                    <SettingRow label={t('layouts.defaultSection')} hint={t('layouts.defaultSectionHint')}>
                        <select
                            value={defaultSectionId}
                            onChange={(e) => setDefaultSection(layout.id, e.target.value)}
                            data-testid="layout-default-section"
                            className="text-xs rounded-lg px-2 py-1.5 focus:outline-none max-w-[200px]"
                            style={{
                                background: 'var(--app-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--app-border)',
                            }}
                        >
                            {layout.sections.map((sec) => (
                                <option key={sec.id} value={sec.id}>
                                    {sec.name}
                                </option>
                            ))}
                        </select>
                    </SettingRow>
                    <SettingRow label={t('layouts.menuDesign')} hint={t('layouts.menuDesignHint')}>
                        <Btn small onClick={() => navigate(`/admin/design?ctx=${layout.id}&tab=menu`)}>
                            <Palette size={12} /> {t('admin.nav.design')}
                        </Btn>
                    </SettingRow>
                    <SettingRow label={t('layouts.tabbarDesign')} hint={t('layouts.tabbarDesignHint')}>
                        <Btn small onClick={() => navigate(`/admin/design?ctx=${layout.id}&tab=tabbar`)}>
                            <Palette size={12} /> {t('admin.nav.design')}
                        </Btn>
                    </SettingRow>
                    <SettingRow label={t('layouts.iconsDesign')} hint={t('layouts.iconsDesignHint')}>
                        <Btn small onClick={() => navigate(`/admin/design?ctx=${layout.id}&tab=icons`)}>
                            <Palette size={12} /> {t('admin.nav.design')}
                        </Btn>
                    </SettingRow>
                </Card>
            </div>

            <SectionList layout={layout} defaultSectionId={defaultSectionId} onSelect={onSelect} />
        </div>
    );
}

// ── Section list ──────────────────────────────────────────────────────────────

function SectionList({
    layout,
    defaultSectionId,
    onSelect,
}: {
    layout: DashboardLayout;
    defaultSectionId: string | undefined;
    onSelect: (id: string) => void;
}) {
    const t = useT();
    const setActiveLayout = useDashboardStore((s) => s.setActiveLayout);
    const addSection = useDashboardStore((s) => s.addSection);
    const addSectionFromImport = useDashboardStore((s) => s.addSectionFromImport);
    const reorderSections = useDashboardStore((s) => s.reorderSections);

    const [showNew, setShowNew] = useState(false);
    const [newName, setNewName] = useState('');
    const importRef = useRef<HTMLInputElement>(null);

    const drag = useListDrag((from, to) => {
        setActiveLayout(layout.id);
        reorderSections(from, to);
    });

    const createSection = () => {
        const name = newName.trim();
        if (!name) return;
        const before = new Set(layout.sections.map((s) => s.id));
        setActiveLayout(layout.id);
        addSection(name);
        setNewName('');
        setShowNew(false);
        const l = useDashboardStore.getState().layouts.find((x) => x.id === layout.id);
        const created = l?.sections.find((s) => !before.has(s.id));
        if (created) onSelect(created.id);
    };

    const handleImport = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const raw = JSON.parse(ev.target?.result as string);
                    const data = importSection(raw);
                    if (!data) {
                        alert(t('sections.importInvalidFile'));
                        return;
                    }
                    setActiveLayout(layout.id);
                    addSectionFromImport(data);
                } catch {
                    alert(t('sections.importInvalidFile'));
                }
                if (importRef.current) importRef.current.value = '';
            };
            reader.readAsText(file);
        },
        [addSectionFromImport, setActiveLayout, layout.id, t],
    );

    return (
        <Card
            title={t('sections.title')}
            padded={false}
            testId="section-list"
            footer={t('sections.reorderHint')}
            actions={
                <>
                    <Btn small onClick={() => importRef.current?.click()} title={t('sections.import')}>
                        <Upload size={13} /> {t('layouts.importShort')}
                        <input ref={importRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
                    </Btn>
                    <Btn variant="primary" small onClick={() => setShowNew((v) => !v)} data-testid="section-new">
                        <Plus size={13} /> {t('sections.newSection')}
                    </Btn>
                </>
            }
        >
            {showNew && (
                <div className="px-3 pt-3">
                    <InlinePrompt
                        value={newName}
                        onChange={setNewName}
                        onSubmit={createSection}
                        onCancel={() => {
                            setNewName('');
                            setShowNew(false);
                        }}
                        submitLabel={t('layouts.create')}
                        placeholder={t('sections.placeholder')}
                        testId="section-new-name"
                    />
                </div>
            )}
            <div>
                {layout.sections.map((sec, idx) => (
                    <SectionRow
                        key={sec.id}
                        layout={layout}
                        section={sec}
                        index={idx}
                        isDefault={sec.id === defaultSectionId}
                        isOnly={layout.sections.length === 1}
                        drag={drag}
                        onSelect={onSelect}
                    />
                ))}
            </div>
        </Card>
    );
}

function SectionRow({
    layout,
    section,
    index,
    isDefault,
    isOnly,
    drag,
    onSelect,
}: {
    layout: DashboardLayout;
    section: Section;
    index: number;
    isDefault: boolean;
    isOnly: boolean;
    drag: ReturnType<typeof useListDrag>;
    onSelect: (id: string) => void;
}) {
    const t = useT();
    const navigate = useNavigate();
    const layouts = useDashboardStore((s) => s.layouts);
    const setActiveLayout = useDashboardStore((s) => s.setActiveLayout);
    const setActiveLayoutAndSection = useDashboardStore((s) => s.setActiveLayoutAndSection);
    const setSectionHidden = useDashboardStore((s) => s.setSectionHidden);
    const setDefaultSection = useDashboardStore((s) => s.setDefaultSection);
    const duplicateSection = useDashboardStore((s) => s.duplicateSection);
    const removeSection = useDashboardStore((s) => s.removeSection);
    const moveSectionToLayout = useDashboardStore((s) => s.moveSectionToLayout);

    const [showDup, setShowDup] = useState(false);
    const [dupName, setDupName] = useState(`${section.name} (Kopie)`);
    const [showMove, setShowMove] = useState(false);
    const [moveTarget, setMoveTarget] = useState('');
    const [showExport, setShowExport] = useState(false);

    const otherLayouts = layouts.filter((l) => l.id !== layout.id);
    const widgetCount = section.tabs.reduce((n, tab) => n + tab.widgets.length, 0);
    const ensureActive = () => setActiveLayout(layout.id);

    const openInEditor = () => {
        setActiveLayoutAndSection(layout.id, section.id);
        navigate('/admin/editor');
    };

    const menu: MenuItem[] = [
        { key: 'editor', label: t('sections.openEditor'), icon: <PenSquare size={13} />, onClick: openInEditor },
        {
            key: 'design',
            label: t('layouts.designSettings'),
            icon: <Palette size={13} />,
            onClick: () => navigate(`/admin/design?ctx=${section.id}`),
        },
        {
            key: 'default',
            label: t('sections.makeDefaultLong'),
            icon: <Star size={13} />,
            disabled: isDefault,
            onClick: () => setDefaultSection(layout.id, section.id),
        },
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
            },
        },
    ];

    return (
        <div
            data-testid={`section-row-${section.id}`}
            className="border-t"
            style={{ borderColor: 'var(--app-border)', ...drag.rowStyle(index) }}
            {...drag.targetProps(index)}
        >
            <div className="flex items-center gap-3 px-4 py-2.5">
                <span
                    {...drag.handleProps(index)}
                    title={t('layouts.dragToReorder')}
                    className="flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing hover:opacity-80"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <GripVertical size={14} />
                </span>
                <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'var(--app-bg)', color: 'var(--text-secondary)' }}
                >
                    {sectionIconNode(section, 15)}
                </span>
                <button onClick={() => onSelect(section.id)} className="flex-1 min-w-0 text-left hover:opacity-80">
                    <span className="flex items-center gap-2 min-w-0">
                        <span
                            className="font-semibold text-sm truncate"
                            style={{ color: 'var(--text-primary)', opacity: section.hidden ? 0.6 : 1 }}
                        >
                            {section.name}
                        </span>
                        {isDefault && (
                            <Chip tone="accent" title={t('sections.setDefaultSection')}>
                                <Star size={10} /> {t('sections.isDefault')}
                            </Chip>
                        )}
                    </span>
                    <span className="block text-[10px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                        /s/{section.slug}
                    </span>
                </button>
                <span className="text-xs shrink-0 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {section.tabs.length === 1
                        ? t('layouts.tabsCountOne')
                        : t('layouts.tabsCount', { count: String(section.tabs.length) })}
                    {' · '}
                    {widgetCount === 1
                        ? t('layouts.widgetsCountOne')
                        : t('layouts.widgetsCount', { count: String(widgetCount) })}
                </span>
                <IconBtn
                    muted={!!section.hidden}
                    title={section.hidden ? t('sections.showInMenu') : t('sections.hideFromMenuHint')}
                    data-testid={`section-hidden-${section.id}`}
                    onClick={() => {
                        ensureActive();
                        setSectionHidden(section.id, !section.hidden);
                    }}
                >
                    {section.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </IconBtn>
                <Btn
                    variant="ghost"
                    small
                    onClick={() => onSelect(section.id)}
                    data-testid={`section-open-${section.id}`}
                >
                    {t('layouts.edit')} <ChevronRight size={12} />
                </Btn>
                <ActionMenu items={menu} title={t('layouts.moreActions')} testId={`section-menu-${section.id}`} />
            </div>

            {showDup && (
                <div className="px-4 pb-3">
                    <InlinePrompt
                        label={t('layouts.duplicateName')}
                        value={dupName}
                        onChange={setDupName}
                        onSubmit={() => {
                            ensureActive();
                            duplicateSection(section.id, dupName.trim() || `${section.name} (Kopie)`);
                            setShowDup(false);
                        }}
                        onCancel={() => setShowDup(false)}
                        submitLabel={t('layouts.duplicate')}
                    />
                </div>
            )}
            {showMove && (
                <div
                    className="mx-4 mb-3 rounded-xl px-3 py-2.5 flex flex-wrap items-center gap-2"
                    style={{ background: 'var(--app-bg)', border: '1px solid var(--app-border)' }}
                >
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {t('sections.moveTargetLabel')}
                    </span>
                    <select
                        value={moveTarget}
                        onChange={(e) => setMoveTarget(e.target.value)}
                        className="text-xs rounded-lg px-2 py-1.5 focus:outline-none flex-1 min-w-[160px]"
                        style={{
                            background: 'var(--app-surface)',
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
                        onClick={() => {
                            moveSectionToLayout(section.id, layout.id, moveTarget, 'move');
                            setShowMove(false);
                        }}
                    >
                        <FolderInput size={12} /> {t('sections.move')}
                    </Btn>
                    <Btn
                        small
                        disabled={!moveTarget}
                        onClick={() => {
                            moveSectionToLayout(section.id, layout.id, moveTarget, 'copy');
                            setShowMove(false);
                        }}
                    >
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
        </div>
    );
}
