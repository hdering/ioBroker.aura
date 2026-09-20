// Left rail of the Layouts page: every layout with its sections, in the same
// row style as the Design page's scope tree — sections hang under their layout
// on thin tree lines, like the chain Layout → Bereich. Layouts can be reordered
// by their grip; sections are reordered in the layout detail (their list mirrors
// the frontend's section menu).

import { GripVertical, Layers, LayoutDashboard } from 'lucide-react';
import { Icon } from '@iconify/react';
import { useDashboardStore, type DashboardLayout, type Section } from '../../../../store/dashboardStore';
import { useT } from '../../../../i18n';
import { ScopeRow } from '../shared/ScopeRow';
import { useListDrag } from './pieces';

export function layoutIconNode(layout: DashboardLayout, size = 13) {
    return layout.icon ? <Icon icon={layout.icon} width={size} height={size} /> : <LayoutDashboard size={size} />;
}

export function sectionIconNode(section: Section, size = 12) {
    return section.icon ? <Icon icon={section.icon} width={size} height={size} /> : <Layers size={size} />;
}

export function layoutHash(layout: DashboardLayout, isFirst: boolean) {
    return isFirst ? '#/' : `#/view/${layout.slug}`;
}

interface LayoutTreeProps {
    layouts: DashboardLayout[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}

// Grip (16) + gap (2) + row padding (10) + half icon box (12): the sections'
// tree line starts under the layout icon's centre.
const SECTION_INDENT = { '--tree-indent': '40px' } as React.CSSProperties;

export function LayoutTree({ layouts, selectedId, onSelect }: LayoutTreeProps) {
    const t = useT();
    const reorderLayouts = useDashboardStore((s) => s.reorderLayouts);
    const drag = useListDrag(reorderLayouts);

    return (
        <aside
            data-testid="layout-tree"
            className="md:sticky md:top-0 self-start rounded-xl p-2 space-y-1"
            style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
            <p
                className="text-[10px] uppercase tracking-widest px-2 py-1.5 font-semibold"
                style={{ color: 'var(--text-secondary)' }}
            >
                {t('layouts.title')}
            </p>
            {layouts.map((l, idx) => {
                const isFirst = idx === 0;
                const sectionCount = l.sections.length;
                return (
                    <div
                        key={l.id}
                        className="space-y-1 rounded-lg"
                        data-testid={`tree-layout-${l.id}`}
                        style={drag.rowStyle(idx)}
                        {...drag.targetProps(idx)}
                    >
                        <div className="flex items-center gap-0.5">
                            <span
                                {...drag.handleProps(idx)}
                                title={t('layouts.dragToReorder')}
                                className="flex items-center justify-center shrink-0 w-4 cursor-grab active:cursor-grabbing hover:opacity-80"
                                style={{ color: 'var(--text-secondary)' }}
                            >
                                <GripVertical size={12} />
                            </span>
                            <ScopeRow
                                active={selectedId === l.id}
                                onClick={() => onSelect(l.id)}
                                label={l.name}
                                sub={layoutHash(l, isFirst)}
                                iconNode={layoutIconNode(l)}
                                buttonProps={{
                                    title:
                                        sectionCount === 1
                                            ? t('sections.countOne')
                                            : t('sections.count', { count: String(sectionCount) }),
                                }}
                            />
                        </div>
                        <div className="aura-tree-kids" style={SECTION_INDENT}>
                            {l.sections.map((sec) => (
                                <div key={sec.id} data-testid={`tree-section-${sec.id}`}>
                                    <ScopeRow
                                        active={selectedId === sec.id}
                                        onClick={() => onSelect(sec.id)}
                                        label={sec.name}
                                        iconNode={sectionIconNode(sec)}
                                        trailing={
                                            sec.tabs.length === 1
                                                ? t('layouts.tabsCountOne')
                                                : t('layouts.tabsCount', { count: String(sec.tabs.length) })
                                        }
                                        buttonProps={{
                                            title: t('design.tree.section', { layout: l.name }),
                                            ...(sec.hidden ? { style: { opacity: 0.55 } } : {}),
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </aside>
    );
}
