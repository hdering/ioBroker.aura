import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Globe2, LayoutDashboard, Layers } from 'lucide-react';
import { Icon } from '@iconify/react';
import { useDashboardStore, type DashboardLayout, type Section } from '../../store/dashboardStore';
import { useT } from '../../i18n';

import { SubTabsNav, TAB_LABEL_KEY, type SubTab } from './layouts/sections/SubTabsNav';
import {
    ALL_TABS,
    bandOf,
    isTabLocked,
    ownCountsByTab,
    ownKeys,
    OVERRIDE_COLOR,
    type Band,
    type ScopeLevel,
} from './layouts/shared/scopeBands';
import { ScopeRow } from './layouts/shared/ScopeRow';
import { ScopeBar } from './layouts/shared/ScopeBar';
import { LockedTabNotice } from './layouts/shared/LockedTabNotice';
import { useStartBrightness } from './layouts/shared/BrightnessTabs';

import { ThemePresetSection } from './layouts/sections/ThemePresetSection';
import { ThemeVarsSection } from './layouts/sections/ThemeVarsSection';
import { BrowserThemeSyncSection } from './layouts/sections/BrowserThemeSyncSection';
import { MyThemesSection } from './layouts/sections/MyThemesSection';
import { BehaviorSection } from './layouts/sections/BehaviorSection';
import { TypographySpacingSection } from './layouts/sections/TypographySpacingSection';
import { GridSection } from './layouts/sections/GridSection';
import { WizardMaxDpsSection } from './layouts/sections/WizardMaxDpsSection';
import { GuidelinesSection } from './layouts/sections/GuidelinesSection';
import { TabBarSection } from './layouts/sections/TabBarSection';
import { HeaderSection } from './layouts/sections/HeaderSection';
import { LayoutMenuSection } from './layouts/sections/LayoutMenuSection';
import { NavigationSection } from './layouts/sections/NavigationSection';
import { IconsSection } from './layouts/sections/IconsSection';
import { ValueFormatSection } from './layouts/sections/ValueFormatSection';

// ── ActiveSection ─────────────────────────────────────────────────────────────
// One card (group) per tab. The global-only groups that used to hide inside
// other tabs (browser sync, my themes, wizard limit, optimistic updates) are
// tabs of their own now — the first band of the row.

function ActiveSection({ subTab, contextId }: { subTab: SubTab; contextId: string | null }) {
    switch (subTab) {
        case 'values':
            return <ValueFormatSection />;
        case 'sync':
            return <BrowserThemeSyncSection />;
        case 'mythemes':
            return <MyThemesSection />;
        case 'behavior':
            return (
                <div className="space-y-4">
                    <BehaviorSection />
                    <WizardMaxDpsSection />
                </div>
            );
        case 'header':
            return <HeaderSection contextId={contextId} />;
        case 'menu':
            return <LayoutMenuSection contextId={contextId} />;
        case 'icons':
            return <IconsSection contextId={contextId} />;
        case 'tabbar':
            return <TabBarSection contextId={contextId} />;
        case 'theme':
            return (
                <div className="space-y-6">
                    <ThemePresetSection contextId={contextId} />
                    <ThemeVarsSection contextId={contextId} />
                </div>
            );
        case 'typo':
            return <TypographySpacingSection contextId={contextId} />;
        case 'grid':
            return <GridSection contextId={contextId} />;
        case 'guidelines':
            return <GuidelinesSection contextId={contextId} />;
        case 'nav':
            return <NavigationSection contextId={contextId} />;
        default:
            return null;
    }
}

function layoutIcon(l: DashboardLayout) {
    return l.icon ? <Icon icon={l.icon} width={13} height={13} /> : <LayoutDashboard size={13} />;
}
function sectionIcon(s: Section) {
    return s.icon ? <Icon icon={s.icon} width={12} height={12} /> : <Layers size={12} />;
}

// ── AdminDesign ───────────────────────────────────────────────────────────────

export function AdminDesign() {
    const t = useT();
    // Open on the brightness that is on screen, not on the shared set (#640).
    useStartBrightness();
    const layouts = useDashboardStore((s) => s.layouts);
    const [searchParams, setSearchParams] = useSearchParams();

    // ── Resolve the `ctx` param to a scope (global / layout / section) ────────
    const ctxParam = searchParams.get('ctx');
    const tabParam = searchParams.get('tab') as SubTab | null;

    const rawContextId = ctxParam && ctxParam !== 'global' ? ctxParam : null;
    const layout = rawContextId
        ? layouts.find((l) => l.id === rawContextId || l.sections.some((sec) => sec.id === rawContextId))
        : undefined;
    const section =
        layout && layout.id !== rawContextId ? layout.sections.find((sec) => sec.id === rawContextId) : undefined;
    const scopeLevel: ScopeLevel = !rawContextId || !layout ? 'global' : section ? 'section' : 'layout';
    const contextId = scopeLevel === 'global' ? null : rawContextId;

    // Unknown ctx (deleted layout/section) → normalize URL back to global.
    useEffect(() => {
        if (rawContextId && scopeLevel === 'global') {
            const next = new URLSearchParams(searchParams);
            next.set('ctx', 'global');
            setSearchParams(next, { replace: true });
        }
    }, [rawContextId, scopeLevel, searchParams, setSearchParams]);

    // Every tab stays selectable at every scope; a tab whose chain ends above
    // the selected scope shows a notice instead of its card.
    const subTab: SubTab = tabParam && ALL_TABS.includes(tabParam) ? tabParam : 'theme';
    const locked = isTabLocked(subTab, scopeLevel);

    const scopeSettings =
        scopeLevel === 'layout' ? layout?.settings : scopeLevel === 'section' ? section?.settings : undefined;
    const ownCounts = ownCountsByTab(scopeSettings);
    const ownTotal = ownKeys(scopeSettings).length;

    const setContext = (id: string | null) => {
        const next = new URLSearchParams(searchParams);
        next.set('ctx', id ?? 'global');
        setSearchParams(next, { replace: true });
    };

    const setSubTab = (tab: SubTab) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', tab);
        setSearchParams(next, { replace: true });
    };

    // Where a locked band is edited — the only jump the right pane offers, and
    // it always leads up: to Global, or to the section's layout.
    const jumpTarget = (band: Band) => {
        if (band === 'global') return { label: t('layouts.scope.global'), onClick: () => setContext(null) };
        if (band === 'layout' && layout) return { label: layout.name, onClick: () => setContext(layout.id) };
        return null;
    };

    const treeTitle = (l: DashboardLayout, sec?: Section) => {
        const n = ownKeys(sec ? sec.settings : l.settings).length;
        const type = sec ? t('design.tree.section', { layout: l.name }) : t('design.tree.layout');
        if (!n) return type;
        return `${type} · ${n === 1 ? t('design.scope.ownOne') : `${n} ${t('design.scope.ownMany')}`}`;
    };

    return (
        <div className="p-6 space-y-4">
            <div>
                <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {t('design.title')}
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                    {t('design.subtitle')}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
                {/* Left rail: the chain as a tree — Global → Layout → Bereich */}
                <aside
                    className="md:sticky md:top-0 self-start rounded-xl p-2 space-y-1"
                    style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                    data-testid="design-scope-tree"
                >
                    <p
                        className="text-[10px] uppercase tracking-widest px-2 py-1.5 font-semibold"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {t('layouts.scope.title')}
                        <span className="block normal-case tracking-normal font-normal opacity-80">
                            {t('design.tree.chain')}
                        </span>
                    </p>
                    <ScopeRow
                        active={scopeLevel === 'global'}
                        onClick={() => setContext(null)}
                        label={t('layouts.scope.global')}
                        sub={t('layouts.scope.globalHint')}
                        iconNode={<Globe2 size={13} />}
                        buttonProps={
                            { 'data-testid': 'design-scope-global' } as React.ButtonHTMLAttributes<HTMLButtonElement>
                        }
                    />
                    <div className="aura-tree-kids">
                        {layouts.map((l) => (
                            <div key={l.id} className="aura-tree-node" data-testid={`design-scope-layout-${l.id}`}>
                                <ScopeRow
                                    active={scopeLevel === 'layout' && contextId === l.id}
                                    onClick={() => setContext(l.id)}
                                    label={l.name}
                                    iconNode={layoutIcon(l)}
                                    badge={ownKeys(l.settings).length}
                                    buttonProps={{ title: treeTitle(l) }}
                                />
                                <div className="aura-tree-kids">
                                    {l.sections.map((sec) => (
                                        <div key={sec.id} data-testid={`design-scope-section-${sec.id}`}>
                                            <ScopeRow
                                                active={scopeLevel === 'section' && contextId === sec.id}
                                                onClick={() => setContext(sec.id)}
                                                label={sec.name}
                                                iconNode={sectionIcon(sec)}
                                                badge={ownKeys(sec.settings).length}
                                                buttonProps={{ title: treeTitle(l, sec) }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <p
                        className="flex items-center gap-1.5 px-2 pt-2 text-[10px]"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        <span
                            className="text-[10px] leading-[14px] px-1.5 rounded-full font-semibold"
                            style={{ background: OVERRIDE_COLOR, color: '#fff' }}
                        >
                            n
                        </span>
                        {t('design.tree.ownLegend')}
                    </p>
                </aside>

                {/* Right pane: scope bar, the three band rows, the selected card */}
                <div className="min-w-0 space-y-3">
                    <ScopeBar
                        level={scopeLevel}
                        layoutName={layout?.name}
                        sectionName={section?.name}
                        iconNode={section ? sectionIcon(section) : layout ? layoutIcon(layout) : undefined}
                        ownCount={ownTotal}
                    />
                    <SubTabsNav
                        active={subTab}
                        onChange={setSubTab}
                        level={scopeLevel}
                        ownCounts={ownCounts}
                        jumpTarget={jumpTarget}
                    />
                    {locked && layout ? (
                        <LockedTabNotice
                            groupLabel={t(TAB_LABEL_KEY[subTab])}
                            band={bandOf(subTab)}
                            layoutName={layout.name}
                            sectionName={section?.name}
                            targetLabel={bandOf(subTab) === 'global' ? t('layouts.scope.global') : layout.name}
                            onJump={() => setContext(bandOf(subTab) === 'global' ? null : layout.id)}
                        />
                    ) : (
                        <ActiveSection subTab={subTab} contextId={contextId} />
                    )}
                </div>
            </div>
        </div>
    );
}
