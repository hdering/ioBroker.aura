import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Globe2, LayoutDashboard } from 'lucide-react';
import { Icon } from '@iconify/react';
import { useDashboardStore } from '../../store/dashboardStore';
import { useT } from '../../i18n';

import { LayoutsListSection } from './layouts/sections/LayoutsListSection';
import { SubTabsNav, type SubTab } from './layouts/sections/SubTabsNav';

import { ThemePresetSection } from './layouts/sections/ThemePresetSection';
import { ThemeVarsSection } from './layouts/sections/ThemeVarsSection';
import { TypographySpacingSection } from './layouts/sections/TypographySpacingSection';
import { GridSection } from './layouts/sections/GridSection';
import { WizardMaxDpsSection } from './layouts/sections/WizardMaxDpsSection';
import { GuidelinesSection } from './layouts/sections/GuidelinesSection';
import { TabBarSection } from './layouts/sections/TabBarSection';

// ── ActiveSection ─────────────────────────────────────────────────────────────

function ActiveSection({ subTab, contextId }: { subTab: SubTab; contextId: string | null }) {
    switch (subTab) {
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
            return (
                <div className="space-y-4">
                    <GridSection contextId={contextId} />
                    {contextId === null && <WizardMaxDpsSection />}
                </div>
            );
        case 'guidelines':
            return <GuidelinesSection contextId={contextId} />;
        case 'tabbar':
            return <TabBarSection contextId={contextId} />;
        default:
            return null;
    }
}

// ── ScopeRail ─────────────────────────────────────────────────────────────────

interface ScopeRowProps {
    active: boolean;
    onClick: () => void;
    label: string;
    sub?: string;
    iconNode: React.ReactNode;
}

function ScopeRow({ active, onClick, label, sub, iconNode }: ScopeRowProps) {
    return (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors hover:opacity-90"
            style={{
                background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
                color: active ? 'var(--accent)' : 'var(--text-primary)',
            }}
        >
            <span
                className="w-6 h-6 flex items-center justify-center shrink-0 rounded"
                style={{ background: active ? 'transparent' : 'var(--app-bg)' }}
            >
                {iconNode}
            </span>
            <span className="flex-1 min-w-0">
                <span className="block text-xs font-medium truncate">{label}</span>
                {sub && (
                    <span
                        className="block text-[10px] truncate"
                        style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)', opacity: 0.8 }}
                    >
                        {sub}
                    </span>
                )}
            </span>
        </button>
    );
}

// ── AdminLayouts ──────────────────────────────────────────────────────────────

export function AdminLayouts() {
    const t = useT();
    const { layouts, addLayout } = useDashboardStore();
    const [searchParams, setSearchParams] = useSearchParams();

    const [newName, setNewName] = useState('');
    const [showNew, setShowNew] = useState(false);

    // ── URL-driven state ──────────────────────────────────────────────────
    const ctxParam = searchParams.get('ctx');
    const tabParam = searchParams.get('tab') as SubTab | null;

    const rawContextId = ctxParam && ctxParam !== 'global' ? ctxParam : null;
    const contextId = rawContextId && layouts.some((l) => l.id === rawContextId) ? rawContextId : null;

    useEffect(() => {
        if (rawContextId && !layouts.some((l) => l.id === rawContextId)) {
            const next = new URLSearchParams(searchParams);
            next.set('ctx', 'global');
            if (next.get('tab') === 'tabbar') next.set('tab', 'theme');
            setSearchParams(next, { replace: true });
        }
    }, [layouts, rawContextId, searchParams, setSearchParams]);

    const subTab: SubTab = (() => {
        const valid: SubTab[] = ['theme', 'typo', 'grid', 'guidelines', 'tabbar'];
        if (!tabParam || !valid.includes(tabParam)) return 'theme';
        if (tabParam === 'tabbar' && contextId === null) return 'theme';
        return tabParam;
    })();

    const setContext = (id: string | null) => {
        const next = new URLSearchParams(searchParams);
        next.set('ctx', id ?? 'global');
        if (id === null && next.get('tab') === 'tabbar') next.set('tab', 'theme');
        setSearchParams(next, { replace: true });
    };

    const setSubTab = (tab: SubTab) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', tab);
        setSearchParams(next, { replace: true });
    };

    const handleCreate = () => {
        const name = newName.trim() || t('layouts.newLayout');
        addLayout(name);
        setNewName('');
        setShowNew(false);
    };

    return (
        <div className="p-6 space-y-4">
            <LayoutsListSection
                onShowNew={() => setShowNew(!showNew)}
                showNew={showNew}
                newName={newName}
                onNewNameChange={setNewName}
                onCreate={handleCreate}
                onCancelNew={() => setShowNew(false)}
            />

            <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
                {/* Left rail: scope picker */}
                <aside
                    className="md:sticky md:top-0 self-start rounded-xl p-2 space-y-1"
                    style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
                >
                    <p
                        className="text-[10px] uppercase tracking-widest px-2 py-1.5 font-semibold"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {t('layouts.scope.title')}
                    </p>
                    <ScopeRow
                        active={contextId === null}
                        onClick={() => setContext(null)}
                        label={t('layouts.scope.global')}
                        sub={t('layouts.scope.globalHint')}
                        iconNode={<Globe2 size={13} />}
                    />
                    <div className="h-px my-1.5" style={{ background: 'var(--app-border)' }} />
                    {layouts.map((l) => (
                        <ScopeRow
                            key={l.id}
                            active={contextId === l.id}
                            onClick={() => setContext(l.id)}
                            label={l.name}
                            iconNode={
                                l.icon ? <Icon icon={l.icon} width={13} height={13} /> : <LayoutDashboard size={13} />
                            }
                        />
                    ))}
                </aside>

                {/* Right pane: aspect tabs + content */}
                <div className="min-w-0 space-y-4">
                    <div
                        className="sticky top-0 z-20 -mt-2 py-2"
                        style={{
                            background: 'color-mix(in srgb, var(--app-bg) 92%, transparent)',
                            backdropFilter: 'blur(8px)',
                            borderBottom: '1px solid var(--app-border)',
                        }}
                    >
                        <SubTabsNav active={subTab} onChange={setSubTab} hideTabBar={contextId === null} />
                    </div>

                    <ActiveSection subTab={subTab} contextId={contextId} />
                </div>
            </div>
        </div>
    );
}
