import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Upload } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboardStore';
import { importLayout } from '../../utils/widgetExportImport';
import { useT } from '../../i18n';

import { LayoutTree } from './layouts/manage/LayoutTree';
import { LayoutDetail } from './layouts/manage/LayoutDetail';
import { SectionDetail } from './layouts/manage/SectionDetail';
import { Btn, InlinePrompt } from './layouts/manage/pieces';

// ── AdminLayouts ──────────────────────────────────────────────────────────────
//
// Master-detail like the Design page: the left rail lists layouts and their
// sections, the right pane shows the selected one. Selection lives in the URL
// (`?ctx=<layoutId|sectionId>`); the editor's older `?expand=<layoutId>` deep
// link is accepted and rewritten.

export function AdminLayouts() {
    const t = useT();
    const layouts = useDashboardStore((s) => s.layouts);
    const addLayout = useDashboardStore((s) => s.addLayout);
    const addLayoutFromImport = useDashboardStore((s) => s.addLayoutFromImport);

    const [searchParams, setSearchParams] = useSearchParams();
    const [showNew, setShowNew] = useState(false);
    const [newName, setNewName] = useState('');
    const importRef = useRef<HTMLInputElement>(null);

    // ── Resolve the selection ─────────────────────────────────────────────────
    const ctxParam = searchParams.get('ctx') ?? searchParams.get('expand');
    const asLayout = ctxParam ? layouts.find((l) => l.id === ctxParam) : undefined;
    const asSection = !asLayout && ctxParam ? findSection(layouts, ctxParam) : undefined;
    const fallback = layouts[0];
    const selected = asLayout
        ? { kind: 'layout' as const, layout: asLayout }
        : asSection
          ? { kind: 'section' as const, layout: asSection.layout, section: asSection.section }
          : fallback
            ? { kind: 'layout' as const, layout: fallback }
            : null;
    const selectedId = selected ? (selected.kind === 'layout' ? selected.layout.id : selected.section.id) : null;

    const select = useCallback(
        (id: string) => {
            const next = new URLSearchParams(searchParams);
            next.set('ctx', id);
            next.delete('expand');
            setSearchParams(next, { replace: true });
        },
        [searchParams, setSearchParams],
    );

    // Remember what was last resolved, so a ctx that disappears (the selected
    // section was deleted or moved away) falls back to its parent layout instead
    // of the first one.
    const lastRef = useRef<{ id: string; layoutId: string } | null>(null);
    useEffect(() => {
        if (selected && (asLayout || asSection) && selectedId)
            lastRef.current = { id: selectedId, layoutId: selected.layout.id };
    }, [selected, asLayout, asSection, selectedId]);

    // Unknown / legacy ctx → normalise the URL to what is actually shown.
    useEffect(() => {
        const legacy = searchParams.has('expand');
        const stale = !!ctxParam && !asLayout && !asSection;
        if (!legacy && !stale) return;
        const last = lastRef.current;
        const parentAlive = stale && last?.id === ctxParam && layouts.some((l) => l.id === last.layoutId);
        const target = parentAlive ? last.layoutId : selectedId;
        if (target) select(target);
    }, [searchParams, ctxParam, asLayout, asSection, selectedId, select, layouts]);

    // ── Create / import ───────────────────────────────────────────────────────
    const createdSince = (before: Set<string>) => useDashboardStore.getState().layouts.find((l) => !before.has(l.id));

    const handleCreate = () => {
        const name = newName.trim() || t('layouts.newLayout');
        const before = new Set(layouts.map((l) => l.id));
        addLayout(name);
        setNewName('');
        setShowNew(false);
        const created = createdSince(before);
        if (created) select(created.id);
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
                    const before = new Set(useDashboardStore.getState().layouts.map((l) => l.id));
                    addLayoutFromImport(layoutData);
                    const created = createdSince(before);
                    if (created) select(created.id);
                } catch {
                    alert(t('layouts.importInvalidFile'));
                }
                if (importRef.current) importRef.current.value = '';
            };
            reader.readAsText(file);
        },
        [addLayoutFromImport, select, t],
    );

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                        {t('layouts.title')}
                    </h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                        {t('layouts.subtitle')}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Btn onClick={() => importRef.current?.click()} title={t('layouts.import')}>
                        <Upload size={14} /> {t('layouts.importShort')}
                        <input ref={importRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
                    </Btn>
                    <Btn variant="primary" onClick={() => setShowNew((v) => !v)} data-testid="layout-new">
                        <Plus size={14} /> {t('layouts.newLayout')}
                    </Btn>
                </div>
            </div>

            {showNew && (
                <InlinePrompt
                    value={newName}
                    onChange={setNewName}
                    onSubmit={handleCreate}
                    onCancel={() => {
                        setNewName('');
                        setShowNew(false);
                    }}
                    submitLabel={t('layouts.create')}
                    placeholder={t('layouts.placeholder')}
                    testId="layout-new-name"
                />
            )}

            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
                <LayoutTree layouts={layouts} selectedId={selectedId} onSelect={select} />
                <div className="min-w-0">
                    {selected?.kind === 'section' ? (
                        <SectionDetail
                            key={selected.section.id}
                            layout={selected.layout}
                            section={selected.section}
                            isFirstLayout={layouts[0]?.id === selected.layout.id}
                            onSelect={select}
                        />
                    ) : selected ? (
                        <LayoutDetail
                            key={selected.layout.id}
                            layout={selected.layout}
                            isFirst={layouts[0]?.id === selected.layout.id}
                            isOnly={layouts.length === 1}
                            onSelect={select}
                        />
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function findSection(layouts: ReturnType<typeof useDashboardStore.getState>['layouts'], id: string) {
    for (const layout of layouts) {
        const section = layout.sections.find((s) => s.id === id);
        if (section) return { layout, section };
    }
    return undefined;
}
