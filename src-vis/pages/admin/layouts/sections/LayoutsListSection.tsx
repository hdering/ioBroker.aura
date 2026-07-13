import { useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Plus,
    Pencil,
    Copy,
    Trash2,
    Check,
    X,
    ExternalLink,
    LayoutDashboard,
    Layers,
    ChevronDown,
    ChevronRight,
    Star,
    GripVertical,
    Download,
    Upload,
    Palette,
} from 'lucide-react';
import { Icon } from '@iconify/react';
import { useDashboardStore, type DashboardLayout, type Section } from '../../../../store/dashboardStore';
import { IconPickerModal } from '../../../../components/config/IconPickerModal';
import { exportLayout, importLayout, exportSection, importSection } from '../../../../utils/widgetExportImport';
import { ExportAnonymizeDialog } from '../../../../components/config/ExportAnonymizeDialog';
import { useT } from '../../../../i18n';

const inputCls = 'text-sm rounded-xl px-3 py-2 focus:outline-none w-full';
const inputStyle = { background: 'var(--app-bg)', color: 'var(--text-primary)', border: '1px solid var(--app-border)' };

// ── Section row (a "Bereich" inside a layout) ───────────────────────────────────

interface SectionRowProps {
    layoutId: string;
    section: Section;
    isOnly: boolean;
    isLayoutDefault: boolean;
    index: number;
    dragIdx: number | null;
    dragOverIdx: number | null;
    onDragStart: (idx: number) => void;
    onDragOver: (idx: number) => void;
    onDragEnd: () => void;
    onDrop: (idx: number) => void;
}

function SectionRow({
    layoutId,
    section,
    isOnly,
    isLayoutDefault,
    index,
    dragIdx,
    dragOverIdx,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDrop,
}: SectionRowProps) {
    const t = useT();
    const {
        renameSection,
        setSectionSlug,
        setSectionIcon,
        setSectionHidden,
        duplicateSection,
        removeSection,
        setActiveLayout,
        setActiveSection,
        setDefaultTab,
        setDefaultSection,
        updateSectionSettings,
        clearSectionSettings,
    } = useDashboardStore();
    const navigate = useNavigate();

    const [editingName, setEditingName] = useState(false);
    const [nameVal, setNameVal] = useState(section.name);
    const [editingSlug, setEditingSlug] = useState(false);
    const [slugVal, setSlugVal] = useState(section.slug);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [dupName, setDupName] = useState(`${section.name} (Kopie)`);
    const [showDup, setShowDup] = useState(false);
    const [iconPickerOpen, setIconPickerOpen] = useState(false);
    const [showExport, setShowExport] = useState(false);

    const widgetCount = section.tabs.reduce((n, tab) => n + tab.widgets.length, 0);
    const menuHiddenHere = section.settings?.layoutDrawerEnabled === false;

    // All section mutations operate on the active layout — make sure it is this one.
    const ensureActive = () => setActiveLayout(layoutId);

    const commitName = () => {
        ensureActive();
        if (nameVal.trim()) renameSection(section.id, nameVal.trim());
        else setNameVal(section.name);
        setEditingName(false);
    };

    const commitSlug = () => {
        const s = slugVal
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-');
        ensureActive();
        if (s) setSectionSlug(section.id, s);
        else setSlugVal(section.slug);
        setEditingSlug(false);
    };

    const openInEditor = () => {
        setActiveLayout(layoutId);
        setActiveSection(section.id);
        navigate('/admin/editor');
    };

    const openDesign = () => navigate(`/admin/design?ctx=${section.id}`);

    const isDragging = dragIdx === index;
    const isDragTarget = dragOverIdx === index && dragIdx !== null && dragIdx !== index;

    return (
        <div
            className="rounded-xl overflow-hidden transition-opacity"
            style={{
                border: '1px solid var(--app-border)',
                opacity: isDragging ? 0.4 : 1,
                ...(isDragTarget ? { boxShadow: '0 -2px 0 0 var(--accent)' } : {}),
            }}
            onDragOver={(e) => {
                e.preventDefault();
                onDragOver(index);
            }}
            onDragEnter={(e) => {
                e.preventDefault();
                onDragOver(index);
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDrop(index);
            }}
        >
            <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'var(--app-surface)' }}>
                <span
                    draggable
                    onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        onDragStart(index);
                    }}
                    onDragEnd={onDragEnd}
                    title={t('layouts.dragToReorder')}
                    className="flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing hover:opacity-80"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <GripVertical size={14} />
                </span>
                <button
                    onClick={() => setIconPickerOpen(true)}
                    title={t('layouts.changeIcon')}
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hover:opacity-80 transition-opacity"
                    style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
                >
                    {section.icon ? <Icon icon={section.icon} width={16} height={16} /> : <LayoutDashboard size={16} />}
                </button>

                <div className="flex-1 min-w-0">
                    {editingName ? (
                        <div className="flex items-center gap-1.5">
                            <input
                                autoFocus
                                value={nameVal}
                                onChange={(e) => setNameVal(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitName();
                                    if (e.key === 'Escape') {
                                        setNameVal(section.name);
                                        setEditingName(false);
                                    }
                                }}
                                className="text-sm rounded-lg px-2 py-1 focus:outline-none"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--accent)',
                                }}
                            />
                            <button
                                onClick={commitName}
                                className="hover:opacity-70"
                                style={{ color: 'var(--accent-green)' }}
                            >
                                <Check size={14} />
                            </button>
                            <button
                                onClick={() => {
                                    setNameVal(section.name);
                                    setEditingName(false);
                                }}
                                className="hover:opacity-70"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                                {section.name}
                            </span>
                            <button
                                onClick={() => setEditingName(true)}
                                className="hover:opacity-70 shrink-0"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <Pencil size={12} />
                            </button>
                        </div>
                    )}

                    {editingSlug ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                                /s/
                            </span>
                            <input
                                autoFocus
                                value={slugVal}
                                onChange={(e) => setSlugVal(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitSlug();
                                    if (e.key === 'Escape') {
                                        setSlugVal(section.slug);
                                        setEditingSlug(false);
                                    }
                                }}
                                onBlur={commitSlug}
                                className="text-[10px] font-mono rounded px-1.5 py-0.5 focus:outline-none w-32"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--accent)',
                                }}
                            />
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                                /s/{section.slug}
                            </span>
                            <button
                                onClick={() => {
                                    setSlugVal(section.slug);
                                    setEditingSlug(true);
                                }}
                                className="hover:opacity-70 shrink-0"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <Pencil size={10} />
                            </button>
                        </div>
                    )}
                </div>

                <div className="text-right shrink-0">
                    <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {section.tabs.length} Tab{section.tabs.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                        {widgetCount} Widget{widgetCount !== 1 ? 's' : ''}
                    </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={openInEditor}
                        className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-medium hover:opacity-80"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                        <Pencil size={12} /> {t('layouts.edit')}
                    </button>
                    <button
                        onClick={openDesign}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title={t('layouts.designSettings')}
                    >
                        <Palette size={13} />
                    </button>
                    <button
                        onClick={() => {
                            ensureActive();
                            setShowDup(!showDup);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title={t('common.duplicate')}
                    >
                        <Copy size={13} />
                    </button>
                    <button
                        onClick={() => setShowExport(true)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title={t('sections.export')}
                    >
                        <Download size={13} />
                    </button>
                    {showExport && (
                        <ExportAnonymizeDialog
                            onExport={(anon) => exportSection(section, anon)}
                            onClose={() => setShowExport(false)}
                        />
                    )}
                    {!isOnly &&
                        (confirmDelete ? (
                            <>
                                <button
                                    onClick={() => {
                                        ensureActive();
                                        removeSection(section.id);
                                    }}
                                    className="px-2 h-7 text-xs text-white rounded-lg hover:opacity-80"
                                    style={{ background: 'var(--accent-red)' }}
                                >
                                    {t('common.delete')}
                                </button>
                                <button
                                    onClick={() => setConfirmDelete(false)}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    <X size={13} />
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--accent-red)',
                                    border: '1px solid var(--app-border)',
                                }}
                                title={t('sections.delete')}
                            >
                                <Trash2 size={13} />
                            </button>
                        ))}
                </div>
            </div>

            {showDup && (
                <div
                    className="flex items-center gap-2 px-4 py-2.5"
                    style={{ background: 'var(--app-bg)', borderTop: '1px solid var(--app-border)' }}
                >
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {t('layouts.duplicateName')}
                    </span>
                    <input
                        value={dupName}
                        onChange={(e) => setDupName(e.target.value)}
                        className={`${inputCls} flex-1`}
                        style={inputStyle}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                ensureActive();
                                duplicateSection(section.id, dupName);
                                setShowDup(false);
                            }
                        }}
                    />
                    <button
                        onClick={() => {
                            ensureActive();
                            duplicateSection(section.id, dupName);
                            setShowDup(false);
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-medium text-white hover:opacity-80 shrink-0"
                        style={{ background: 'var(--accent)' }}
                    >
                        {t('layouts.duplicate')}
                    </button>
                    <button
                        onClick={() => setShowDup(false)}
                        className="hover:opacity-70 shrink-0"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {iconPickerOpen && (
                <IconPickerModal
                    current={section.icon ?? ''}
                    onSelect={(name) => {
                        ensureActive();
                        setSectionIcon(section.id, name || undefined);
                        setIconPickerOpen(false);
                    }}
                    onClose={() => setIconPickerOpen(false)}
                />
            )}

            <div
                className="px-4 py-2 flex flex-wrap gap-1.5 items-center"
                style={{ borderTop: '1px solid var(--app-border)' }}
            >
                <span className="text-[10px] shrink-0 mr-1" style={{ color: 'var(--text-secondary)' }}>
                    {t('layouts.defaultTab')}:
                </span>
                {section.tabs.map((tab) => {
                    const isDefault = (section.defaultTabId ?? section.tabs[0]?.id) === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => {
                                ensureActive();
                                setDefaultTab(section.id, tab.id);
                            }}
                            title={t('layouts.setDefaultTab')}
                            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors"
                            style={{
                                background: isDefault ? 'var(--accent)22' : 'var(--app-surface)',
                                color: isDefault ? 'var(--accent)' : 'var(--text-secondary)',
                                border: `1px solid ${isDefault ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}
                        >
                            {isDefault && <Star size={9} fill="currentColor" />}
                            {tab.name}
                        </button>
                    );
                })}
            </div>

            <div
                className="px-4 py-2 flex flex-wrap gap-x-5 gap-y-2 items-center"
                style={{ borderTop: '1px solid var(--app-border)' }}
            >
                {!isOnly && (
                    <div className="flex items-center gap-2">
                        <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                            {t('sections.defaultSection')}
                        </span>
                        <button
                            onClick={() => {
                                ensureActive();
                                setDefaultSection(layoutId, section.id);
                            }}
                            title={t('sections.setDefaultSection')}
                            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors"
                            style={{
                                background: isLayoutDefault ? 'var(--accent)22' : 'var(--app-surface)',
                                color: isLayoutDefault ? 'var(--accent)' : 'var(--text-secondary)',
                                border: `1px solid ${isLayoutDefault ? 'var(--accent)' : 'var(--app-border)'}`,
                            }}
                        >
                            <Star size={9} fill={isLayoutDefault ? 'currentColor' : 'none'} />
                            {isLayoutDefault ? t('sections.isDefault') : t('sections.makeDefault')}
                        </button>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('sections.hideFromMenu')}
                    </span>
                    <button
                        onClick={() => {
                            ensureActive();
                            setSectionHidden(section.id, !section.hidden);
                        }}
                        title={t('sections.hideFromMenuHint')}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: section.hidden ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                            style={{ left: section.hidden ? '18px' : '2px' }}
                        />
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('sections.hideMenuHere')}
                    </span>
                    <button
                        onClick={() =>
                            menuHiddenHere
                                ? clearSectionSettings(layoutId, section.id, 'layoutDrawerEnabled')
                                : updateSectionSettings(layoutId, section.id, { layoutDrawerEnabled: false })
                        }
                        title={t('sections.hideMenuHereHint')}
                        className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                        style={{ background: menuHiddenHere ? 'var(--accent)' : 'var(--app-border)' }}
                    >
                        <span
                            className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                            style={{ left: menuHiddenHere ? '18px' : '2px' }}
                        />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Section manager (list of a layout's sections) ───────────────────────────────

function SectionManager({ layout }: { layout: DashboardLayout }) {
    const t = useT();
    const { setActiveLayout, addSection, reorderSections, addSectionFromImport } = useDashboardStore();
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
    const [showNew, setShowNew] = useState(false);
    const [newName, setNewName] = useState('');
    const importRef = useRef<HTMLInputElement>(null);

    const handleDrop = (toIdx: number) => {
        if (dragIdx !== null && dragIdx !== toIdx) {
            setActiveLayout(layout.id);
            reorderSections(dragIdx, toIdx);
        }
        setDragIdx(null);
        setDragOverIdx(null);
    };

    const createSection = () => {
        if (!newName.trim()) return;
        setActiveLayout(layout.id);
        addSection(newName.trim());
        setNewName('');
        setShowNew(false);
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
        <div className="px-4 py-3 space-y-2.5" style={{ background: 'var(--app-bg)' }}>
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {t('sections.title')}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => importRef.current?.click()}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:opacity-80"
                        style={{
                            background: 'var(--app-surface)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title={t('sections.import')}
                    >
                        <Upload size={13} /> {t('sections.import')}
                        <input ref={importRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
                    </button>
                    <button
                        onClick={() => setShowNew(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white hover:opacity-80"
                        style={{ background: 'var(--accent)' }}
                    >
                        <Plus size={13} /> {t('sections.newSection')}
                    </button>
                </div>
            </div>

            {showNew && (
                <div className="flex items-center gap-2">
                    <input
                        autoFocus
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') createSection();
                            if (e.key === 'Escape') {
                                setNewName('');
                                setShowNew(false);
                            }
                        }}
                        placeholder={t('sections.placeholder')}
                        className={`${inputCls} flex-1`}
                        style={inputStyle}
                    />
                    <button
                        onClick={createSection}
                        className="px-3 py-2 rounded-xl text-xs font-medium text-white hover:opacity-80 shrink-0"
                        style={{ background: 'var(--accent)' }}
                    >
                        {t('layouts.create')}
                    </button>
                    <button
                        onClick={() => {
                            setNewName('');
                            setShowNew(false);
                        }}
                        className="hover:opacity-70 shrink-0"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            <div className="space-y-2">
                {layout.sections.map((section, idx) => (
                    <SectionRow
                        key={section.id}
                        layoutId={layout.id}
                        section={section}
                        isOnly={layout.sections.length === 1}
                        isLayoutDefault={(layout.defaultSectionId ?? layout.sections[0]?.id) === section.id}
                        index={idx}
                        dragIdx={dragIdx}
                        dragOverIdx={dragOverIdx}
                        onDragStart={setDragIdx}
                        onDragOver={setDragOverIdx}
                        onDragEnd={() => {
                            setDragIdx(null);
                            setDragOverIdx(null);
                        }}
                        onDrop={handleDrop}
                    />
                ))}
            </div>
        </div>
    );
}

// ── Layout row (top-level container) ────────────────────────────────────────────

interface LayoutRowProps {
    layout: DashboardLayout;
    isOnly: boolean;
    isFirst: boolean;
    index: number;
    dragIdx: number | null;
    dragOverIdx: number | null;
    onDragStart: (idx: number) => void;
    onDragOver: (idx: number) => void;
    onDragEnd: () => void;
    onDrop: (idx: number) => void;
}

function LayoutRow({
    layout,
    isOnly,
    isFirst,
    index,
    dragIdx,
    dragOverIdx,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDrop,
}: LayoutRowProps) {
    const t = useT();
    const { renameLayout, setLayoutSlug, duplicateLayout, removeLayout } = useDashboardStore();
    const navigate = useNavigate();

    const [editingName, setEditingName] = useState(false);
    const [nameVal, setNameVal] = useState(layout.name);
    const [editingSlug, setEditingSlug] = useState(false);
    const [slugVal, setSlugVal] = useState(layout.slug);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [dupName, setDupName] = useState(`${layout.name} (Kopie)`);
    const [showDup, setShowDup] = useState(false);
    const [showExport, setShowExport] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const hash = isFirst ? '#/' : `#/view/${layout.slug}`;

    const commitName = () => {
        if (nameVal.trim()) renameLayout(layout.id, nameVal.trim());
        else setNameVal(layout.name);
        setEditingName(false);
    };
    const commitSlug = () => {
        const s = slugVal
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-');
        if (s) setLayoutSlug(layout.id, s);
        else setSlugVal(layout.slug);
        setEditingSlug(false);
    };

    const isDragging = dragIdx === index;
    const isDragTarget = dragOverIdx === index && dragIdx !== null && dragIdx !== index;

    return (
        <div
            className="rounded-xl overflow-hidden transition-opacity"
            style={{
                border: '1px solid var(--app-border)',
                opacity: isDragging ? 0.4 : 1,
                ...(isDragTarget ? { boxShadow: '0 -2px 0 0 var(--accent)' } : {}),
            }}
            onDragOver={(e) => {
                e.preventDefault();
                onDragOver(index);
            }}
            onDragEnter={(e) => {
                e.preventDefault();
                onDragOver(index);
            }}
            onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDrop(index);
            }}
        >
            <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'var(--app-surface)' }}>
                <span
                    draggable
                    onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        onDragStart(index);
                    }}
                    onDragEnd={onDragEnd}
                    title={t('layouts.dragToReorder')}
                    className="flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing hover:opacity-80"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <GripVertical size={14} />
                </span>
                <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
                >
                    <LayoutDashboard size={16} />
                </span>

                <div className="flex-1 min-w-0">
                    {editingName ? (
                        <div className="flex items-center gap-1.5">
                            <input
                                autoFocus
                                value={nameVal}
                                onChange={(e) => setNameVal(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitName();
                                    if (e.key === 'Escape') {
                                        setNameVal(layout.name);
                                        setEditingName(false);
                                    }
                                }}
                                className="text-sm rounded-lg px-2 py-1 focus:outline-none"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--accent)',
                                }}
                            />
                            <button
                                onClick={commitName}
                                className="hover:opacity-70"
                                style={{ color: 'var(--accent-green)' }}
                            >
                                <Check size={14} />
                            </button>
                            <button
                                onClick={() => {
                                    setNameVal(layout.name);
                                    setEditingName(false);
                                }}
                                className="hover:opacity-70"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                                {layout.name}
                            </span>
                            <button
                                onClick={() => setEditingName(true)}
                                className="hover:opacity-70 shrink-0"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <Pencil size={12} />
                            </button>
                        </div>
                    )}

                    {!isFirst && editingSlug ? (
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>
                                #/view/
                            </span>
                            <input
                                autoFocus
                                value={slugVal}
                                onChange={(e) => setSlugVal(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitSlug();
                                    if (e.key === 'Escape') {
                                        setSlugVal(layout.slug);
                                        setEditingSlug(false);
                                    }
                                }}
                                onBlur={commitSlug}
                                className="text-[10px] font-mono rounded px-1.5 py-0.5 focus:outline-none w-32"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--accent)',
                                }}
                            />
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <a
                                href={hash}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-mono hover:underline"
                                style={{ color: 'var(--accent)' }}
                            >
                                {hash}
                            </a>
                            {!isFirst && (
                                <button
                                    onClick={() => {
                                        setSlugVal(layout.slug);
                                        setEditingSlug(true);
                                    }}
                                    className="hover:opacity-70 shrink-0"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <Pencil size={10} />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="text-right shrink-0">
                    <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {layout.sections.length === 1
                            ? t('sections.countOne')
                            : t('sections.count', { count: String(layout.sections.length) })}
                    </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={() => setExpanded((v) => !v)}
                        className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-medium hover:opacity-80"
                        style={{
                            background: expanded ? 'var(--accent)' : 'var(--app-bg)',
                            color: expanded ? '#fff' : 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title={t('sections.manage')}
                    >
                        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <Layers size={12} /> {t('sections.manage')}
                    </button>
                    <button
                        onClick={() => navigate(`/admin/design?ctx=${layout.id}`)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title={t('layouts.designSettings')}
                    >
                        <Palette size={13} />
                    </button>
                    <a
                        href={hash}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title={t('layouts.open')}
                    >
                        <ExternalLink size={13} />
                    </a>
                    <button
                        onClick={() => setShowDup(!showDup)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title={t('common.duplicate')}
                    >
                        <Copy size={13} />
                    </button>
                    <button
                        onClick={() => setShowExport(true)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                        style={{
                            background: 'var(--app-bg)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title={t('layouts.export')}
                    >
                        <Download size={13} />
                    </button>
                    {showExport && (
                        <ExportAnonymizeDialog
                            onExport={(anon) => exportLayout(layout, anon)}
                            onClose={() => setShowExport(false)}
                        />
                    )}
                    {!isOnly &&
                        (confirmDelete ? (
                            <>
                                <button
                                    onClick={() => removeLayout(layout.id)}
                                    className="px-2 h-7 text-xs text-white rounded-lg hover:opacity-80"
                                    style={{ background: 'var(--accent-red)' }}
                                >
                                    {t('common.delete')}
                                </button>
                                <button
                                    onClick={() => setConfirmDelete(false)}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                                    style={{
                                        background: 'var(--app-bg)',
                                        color: 'var(--text-secondary)',
                                        border: '1px solid var(--app-border)',
                                    }}
                                >
                                    <X size={13} />
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg hover:opacity-80"
                                style={{
                                    background: 'var(--app-bg)',
                                    color: 'var(--accent-red)',
                                    border: '1px solid var(--app-border)',
                                }}
                                title={t('layouts.delete')}
                            >
                                <Trash2 size={13} />
                            </button>
                        ))}
                </div>
            </div>

            {showDup && (
                <div
                    className="flex items-center gap-2 px-4 py-2.5"
                    style={{ background: 'var(--app-bg)', borderTop: '1px solid var(--app-border)' }}
                >
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)' }}>
                        {t('layouts.duplicateName')}
                    </span>
                    <input
                        value={dupName}
                        onChange={(e) => setDupName(e.target.value)}
                        className={`${inputCls} flex-1`}
                        style={inputStyle}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                duplicateLayout(layout.id, dupName);
                                setShowDup(false);
                            }
                        }}
                    />
                    <button
                        onClick={() => {
                            duplicateLayout(layout.id, dupName);
                            setShowDup(false);
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-medium text-white hover:opacity-80 shrink-0"
                        style={{ background: 'var(--accent)' }}
                    >
                        {t('layouts.duplicate')}
                    </button>
                    <button
                        onClick={() => setShowDup(false)}
                        className="hover:opacity-70 shrink-0"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {expanded && (
                <div style={{ borderTop: '1px solid var(--app-border)' }}>
                    <SectionManager layout={layout} />
                </div>
            )}
        </div>
    );
}

interface LayoutsListSectionProps {
    onShowNew: () => void;
    showNew: boolean;
    newName: string;
    onNewNameChange: (v: string) => void;
    onCreate: () => void;
    onCancelNew: () => void;
}

export function LayoutsListSection({
    onShowNew,
    showNew,
    newName,
    onNewNameChange,
    onCreate,
    onCancelNew,
}: LayoutsListSectionProps) {
    const t = useT();
    const { layouts, reorderLayouts, addLayoutFromImport } = useDashboardStore();
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
    const importRef = useRef<HTMLInputElement>(null);

    const handleDrop = (toIdx: number) => {
        if (dragIdx !== null && dragIdx !== toIdx) reorderLayouts(dragIdx, toIdx);
        setDragIdx(null);
        setDragOverIdx(null);
    };

    const handleImport = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const raw = JSON.parse(ev.target?.result as string);
                    const layoutData = importLayout(raw);
                    if (!layoutData) {
                        alert(t('layouts.importInvalidFile'));
                        return;
                    }
                    addLayoutFromImport(layoutData);
                } catch {
                    alert(t('layouts.importInvalidFile'));
                }
                if (importRef.current) importRef.current.value = '';
            };
            reader.readAsText(file);
        },
        [addLayoutFromImport, t],
    );

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        {t('layouts.title')}
                    </h1>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {t('sections.subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => importRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium hover:opacity-80"
                        style={{
                            background: 'var(--app-surface)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--app-border)',
                        }}
                        title={t('layouts.import')}
                    >
                        <Upload size={14} /> {t('layouts.import')}
                        <input ref={importRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
                    </button>
                    <button
                        onClick={onShowNew}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white hover:opacity-80"
                        style={{ background: 'var(--accent)' }}
                    >
                        <Plus size={14} /> {t('layouts.newLayout')}
                    </button>
                </div>
            </div>

            <div
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
                style={{
                    background: 'var(--app-surface)',
                    border: '1px solid var(--app-border)',
                    color: 'var(--text-secondary)',
                }}
            >
                <Palette size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span>{t('layouts.designHint')}</span>
                <Link
                    to="/admin/design"
                    className="font-medium hover:underline shrink-0"
                    style={{ color: 'var(--accent)' }}
                >
                    {t('layouts.designHintLink')}
                </Link>
            </div>

            {showNew && (
                <div
                    className="rounded-xl p-4 flex items-center gap-3"
                    style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                >
                    <input
                        autoFocus
                        value={newName}
                        onChange={(e) => onNewNameChange(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') onCreate();
                            if (e.key === 'Escape') onCancelNew();
                        }}
                        placeholder={t('layouts.placeholder')}
                        className={`${inputCls} flex-1`}
                        style={inputStyle}
                    />
                    <button
                        onClick={onCreate}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-white hover:opacity-80 shrink-0"
                        style={{ background: 'var(--accent)' }}
                    >
                        {t('layouts.create')}
                    </button>
                    <button
                        onClick={onCancelNew}
                        className="hover:opacity-70 shrink-0"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            <div className="space-y-3">
                {layouts.map((layout, idx) => (
                    <LayoutRow
                        key={layout.id}
                        layout={layout}
                        isOnly={layouts.length === 1}
                        isFirst={layouts[0]?.id === layout.id}
                        index={idx}
                        dragIdx={dragIdx}
                        dragOverIdx={dragOverIdx}
                        onDragStart={setDragIdx}
                        onDragOver={setDragOverIdx}
                        onDragEnd={() => {
                            setDragIdx(null);
                            setDragOverIdx(null);
                        }}
                        onDrop={handleDrop}
                    />
                ))}
            </div>
        </div>
    );
}
